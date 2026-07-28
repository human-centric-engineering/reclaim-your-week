/**
 * The coach conversation for one audit run — streaming (SSE).
 *
 * POST /api/v1/app/reclaim/runs/:runId/coach/stream
 *   body: { kind: 'leader', message }  — the leader speaking
 *   body: { kind: 'opening', moment }  — the coach speaking first (SSE, or `{ opened: false }` JSON)
 *
 * **Why the leaf owns a chat route at all.** The framework's module-surface route
 * (`/api/v1/framework/modules/:slug/chat/stream`) issues a scope of `{ moduleSlug }`, which is
 * everything the *framework* knows and one key short of what the audit needs. The capture capability
 * refuses to write without a run id in scope, and deliberately so: taking the run from the
 * server-issued scope instead of from a model argument is the whole reason the coach may write audit
 * answers at all (I6). The run id is a leaf concept the framework has no vocabulary for, so the route
 * that supplies it belongs here.
 *
 * **Nothing the model can influence reaches the scope.** The run arrives in the path and is verified
 * as the caller's, and the phase is read from the journey, not sent by the client. `buildCoachScope`
 * then makes the map, and the chat handler threads it verbatim into every dispatch without it ever
 * entering the model's context.
 *
 * **The run owns its conversation.** `loadCoachTurnTarget` resumes `ReclaimAuditRun.conversationId`,
 * and a run with none yet gets the id of the conversation this turn opens written back on the `start`
 * frame. That replaces the timestamp guess `linkRunConversation` used to make (see the note there):
 * this run's transcript is the one this run's turns happened in, whatever else the leader has open.
 *
 * **The coach opens.** Every phase arrives as `kind: 'opening'` with a moment name: the coach says
 * why this part is worth the leader's time and asks the first question, rather than the screen
 * inviting them to say hello into a silence. Some of those moments are also beats that need figures
 * in front of the leader before anyone speaks, because a scripted signpost card cannot name a gap it
 * has not seen. Either way the phase the moment belongs to is checked against the journey, the
 * moment is claimed once per run, and the trigger sent in the leader's place is chosen by the moment
 * (`openingTriggerFor`). The card (`runs/signposts.ts`) still orients them first, and costs nothing.
 *
 * **The claim happens before generation and that ordering is deliberate.** A moment marked but never
 * generated costs the leader nothing — they speak first, as they always could. A moment generated
 * twice costs them a repeated beat and a duplicate bill. So this trades a rare silent no-op for
 * avoiding a common expensive duplicate, and the write must not be moved after the stream. Full
 * reasoning on `claimCoachOpening`.
 *
 * Auth, the two rate-limit checks, and the agent resolution mirror the framework route, so the same
 * agent enforces one cap regardless of which surface a turn arrives through.
 */

import { z } from 'zod';
import { withAuth } from '@/lib/auth/guards';
import { sseResponse } from '@/lib/api/sse';
import { successResponse, errorResponse } from '@/lib/api/responses';
import { validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { cuidSchema } from '@/lib/validations/common';
import {
  consumerChatLimiter,
  agentChatLimiter,
  createRateLimitResponse,
} from '@/lib/security/rate-limit';
import { streamChat } from '@/lib/orchestration/chat';
import { getRequestId, getVisitorId } from '@/lib/logging/context';
import {
  resolveModuleSurface,
  MODULE_SURFACE_CONTEXT_TYPE,
} from '@/lib/framework/guidance/surface';
import { RECLAIM_MODULE_SLUG } from '@/lib/app/programme/identity';
import { buildCoachScope } from '@/lib/app/programme/coach/scope';
import { runCaptureSweep } from '@/lib/app/programme/coach/capture-sweep';
import {
  COACH_OPENING_MOMENTS,
  openingBelongsToPhase,
  openingTriggerFor,
} from '@/lib/app/programme/coach/opening';
import {
  loadCoachTurnTarget,
  linkRunConversation,
  claimCoachOpening,
} from '@/app/api/v1/app/reclaim/runs/service';
import type { ChatEvent } from '@/types/orchestration';

/**
 * A turn is either the leader speaking or the coach opening a moment.
 *
 * **The client sends the moment; it never sends the phase.** The phase comes from the journey below,
 * and a moment that does not belong to it is refused. That keeps both halves of the dispatch scope
 * server-derived, which is the whole reason the coach may write audit answers at all (I6).
 *
 * A body with no `kind` is read as a leader turn, so a browser still running the previous build keeps
 * working across a deploy: nobody should lose a sentence they were part-way through because the
 * request shape grew a discriminator. It has to be done here rather than with `.default()` on the
 * literal — a discriminated union picks its branch by reading the key, so an absent one matches no
 * branch at all and fails as `invalid_union` however the branch is defaulted.
 */
const coachTurnSchema = z.preprocess(
  (value) =>
    typeof value === 'object' && value !== null && !('kind' in value)
      ? { ...value, kind: 'leader' }
      : value,
  z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('leader'),
      message: z.string().min(1).max(4000),
    }),
    z.object({
      kind: z.literal('opening'),
      moment: z.enum(COACH_OPENING_MOMENTS),
    }),
  ])
);

/**
 * Forward the stream, and on the way past the opening frame make sure the run knows which
 * conversation it is being coached in.
 *
 * The link is awaited *before* the frame is forwarded, so the run's transcript can never be readable
 * by the client before the run points at it — the reload path (`GET /runs/current` →
 * `conversationId`) would otherwise have a window where it returns `null` for a conversation that
 * already has messages in it. `linkRunConversation` swallows its own failures, so a bookkeeping
 * problem cannot interrupt a leader mid-sentence.
 */
async function* linkingConversation(
  events: AsyncIterable<ChatEvent>,
  runId: string,
  alreadyLinked: boolean
): AsyncIterable<ChatEvent> {
  let linked = alreadyLinked;
  for await (const event of events) {
    if (!linked && event.type === 'start') {
      await linkRunConversation(runId, event.conversationId);
      linked = true;
    }
    yield event;
  }
}

/**
 * Sweep the exchange for readings the coach did not record, then let the turn finish.
 *
 * **Why it sits here, between the last token and the `done` frame.** The client refreshes the
 * captured panel on `done` (`CoachChat`'s `onTurnComplete`), so a sweep that ran after it would leave
 * the leader looking at a panel that is one turn behind everything they have said. Running it before
 * costs them nothing they can see: the coach's reply has already streamed and is on screen, so the
 * wait is spent under a message they are still reading rather than under a blank one.
 *
 * **Why after the coach rather than beside it.** The sweep asks what is still outstanding, and the
 * honest answer to that only exists once the coach's own `record_answers` calls have landed. Run in
 * parallel, the two writers would both fill the same slots from the same sentence and the run would
 * carry a duplicate version of everything the coach got right. Sequenced, the conversational writer
 * goes first and this one covers what it missed, which is exactly the division of labour the sweep
 * was built for.
 *
 * Its failures are its own. `runCaptureSweep` never throws, and a sweep that could not run is logged
 * and forgotten: capture then falls back to what the coach recorded, which is where this started.
 */
async function* sweepingCapture(
  events: AsyncIterable<ChatEvent>,
  sweep: () => Promise<void>,
  runId: string,
  log: Awaited<ReturnType<typeof getRouteLogger>>
): AsyncIterable<ChatEvent> {
  let swept = false;
  for await (const event of events) {
    // `done` is the terminal frame of a completed turn. An `error` frame is not swept: a turn that
    // failed part-way has no settled transcript to read, and re-reading a half-written exchange is
    // how a sweep would record something the leader never finished saying.
    if (event.type === 'done' && !swept) {
      swept = true;
      // `runCaptureSweep` is documented never to throw, and this does not take its word for it. A
      // capture pass is bookkeeping; a turn is the leader's conversation. The day the contract stops
      // holding, the cost should be an unswept turn and not a broken one.
      await sweep().catch((error: unknown) => {
        log.warn('Reclaim capture sweep threw; finishing the turn regardless', {
          runId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
    yield event;
  }
}

export const POST = withAuth<{ runId: string }>(async (request, session, { params }) => {
  const userLimit = consumerChatLimiter.check(session.user.id);
  if (!userLimit.success) return createRateLimitResponse(userLimit);

  const log = await getRouteLogger(request);
  const parsedRunId = cuidSchema.safeParse((await params).runId);
  if (!parsedRunId.success) {
    throw new ValidationError('Invalid run id', { runId: ['Must be a valid id'] });
  }
  const runId = parsedRunId.data;
  const body = await validateRequestBody(request, coachTurnSchema);

  // Ownership, in-progress, and the phase — all before a single token is generated.
  const target = await loadCoachTurnTarget(session.user.id, runId);

  // An opening turn is the coach speaking first, so two things are checked here that a leader turn
  // does not need: that the moment belongs to the phase the leader is actually on (the client sends
  // the moment, the server owns the phase), and that this run has not already had it.
  let message = body.kind === 'leader' ? body.message : openingTriggerFor(body.moment);
  if (body.kind === 'opening') {
    if (!openingBelongsToPhase(body.moment, target.phaseKey)) {
      return errorResponse('That moment does not belong to this phase.', {
        code: 'OPENING_WRONG_PHASE',
        status: 422,
        details: { moment: body.moment, phaseKey: target.phaseKey },
      });
    }
    // Claimed before generating. See `claimCoachOpening` for why that ordering is deliberate and
    // must not be moved to after the stream: a moment marked but ungenerated costs a leader nothing,
    // and a moment generated twice costs them a duplicate beat and a duplicate bill.
    if (!(await claimCoachOpening(session.user.id, runId, body.moment))) {
      log.info('Reclaim coach opening already fired', { runId, moment: body.moment });
      return successResponse({ opened: false });
    }
    message = openingTriggerFor(body.moment);
  }

  // The agent identity and its visibility ACL come from the module binding, so the coach is the same
  // coach here as on the framework surface. Its `conversationId` (the most-recent-active guess) is
  // deliberately ignored: the run's own conversation is the only one this route will resume.
  const surface = await resolveModuleSurface(session.user.id, RECLAIM_MODULE_SLUG);
  if (surface === null) {
    throw new NotFoundError('The coach is not available just now');
  }

  const agentLimit = agentChatLimiter.check(
    `${surface.agentId}:${session.user.id}`,
    surface.rateLimitRpm ?? undefined
  );
  if (!agentLimit.success) return createRateLimitResponse(agentLimit);

  log.info('Reclaim coach turn started', {
    runId,
    phaseKey: target.phaseKey,
    kind: body.kind,
    agentSlug: surface.agentSlug,
    resumed: target.conversationId !== undefined,
    userId: session.user.id,
  });

  const events = streamChat({
    message,
    agentSlug: surface.agentSlug,
    userId: session.user.id,
    conversationId: target.conversationId,
    contextType: MODULE_SURFACE_CONTEXT_TYPE,
    contextId: RECLAIM_MODULE_SLUG,
    scope: buildCoachScope({ runId, phaseKey: target.phaseKey }),
    requestId: await getRequestId(),
    visitorId: await getVisitorId(),
    signal: request.signal,
  });

  // The run's conversation, for the sweep. Known already on a resumed turn; on the first turn of a
  // run it arrives on the `start` frame, so it is captured there and read when the sweep fires.
  let conversationId = target.conversationId;

  /**
   * The deterministic half of capture (`coach/capture-sweep.ts`).
   *
   * Only on a leader turn: an opening is the coach speaking into a silence the leader has not filled,
   * so there is nothing in it to record and a sweep would only re-read the turn before.
   */
  const sweep = async (): Promise<void> => {
    if (body.kind !== 'leader') return;
    const result = await runCaptureSweep({
      userId: session.user.id,
      runId,
      phaseKey: target.phaseKey,
      ...(conversationId !== undefined ? { conversationId } : {}),
    });
    if (result.recorded.length > 0 || result.refused.length > 0) {
      // Slugs and counts, never values — the app log is not covered by erasure.
      log.info('Reclaim capture sweep', {
        runId,
        phaseKey: target.phaseKey,
        recorded: result.recorded,
        refused: result.refused,
      });
    }
  };

  const linked = linkingConversation(events, runId, target.conversationId !== undefined);
  const observed = (async function* () {
    for await (const event of linked) {
      if (event.type === 'start') conversationId = event.conversationId;
      yield event;
    }
  })();

  return sseResponse(sweepingCapture(observed, sweep, runId, log), { signal: request.signal });
});
