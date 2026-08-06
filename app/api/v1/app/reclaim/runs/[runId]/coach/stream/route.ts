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
 * **The claim happens before generation, and the turn gives it back if it says nothing.** Claiming
 * first is what stops a reload part-way through a slow turn buying a second generation, and that
 * ordering must not move. What it used to also mean — a moment marked but never generated leaves the
 * leader to speak first, "as they always could" — stopped being true when every phase started opening
 * with the coach: a cut stream left the phase behind a card and an empty transcript for good. So
 * `holdingOpening` releases a claim no words came out of, and a claim that outlived its turn under an
 * older build is repaired below by reading the transcript rather than the ledger. Full reasoning on
 * `claimCoachOpening`, `releaseCoachOpening` and `coachOpeningWentUnspoken`.
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
import { streamChat, invalidateContext } from '@/lib/orchestration/chat';
import { getRequestId, getVisitorId } from '@/lib/logging/context';
import {
  resolveModuleSurface,
  MODULE_SURFACE_CONTEXT_TYPE,
} from '@/lib/framework/guidance/surface';
import { RECLAIM_MODULE_SLUG } from '@/lib/app/programme/identity';
import { buildCoachScope } from '@/lib/app/programme/coach/scope';
import { runCaptureSweep } from '@/lib/app/programme/coach/capture-sweep';
import { sweepActionOptions } from '@/lib/app/programme/coach/action-options';
import { pendingChoiceOffer } from '@/lib/app/programme/coach/phase-context';
import { ReclaimOfferChoicesCapability } from '@/lib/app/programme/coach/capabilities/offer-choices';
import { RECLAIM_OFFER_CHOICES_SLUG } from '@/lib/app/programme/agent';
import {
  COACH_OPENING_MOMENTS,
  COACH_RESUME_TRIGGER,
  openingBelongsToPhase,
  openingTriggerFor,
} from '@/lib/app/programme/coach/opening';
import {
  loadCoachTurnTarget,
  linkRunConversation,
  claimCoachOpening,
  releaseCoachOpening,
  coachOpeningWentUnspoken,
} from '@/app/api/v1/app/reclaim/runs/service';
import type { ChatEvent } from '@/types/orchestration';

/**
 * A turn is the leader speaking, the coach opening a moment, or a lost reply asked for again.
 *
 * **The client sends the moment; it never sends the phase.** The phase comes from the journey below,
 * and a moment that does not belong to it is refused. That keeps both halves of the dispatch scope
 * server-derived, which is the whole reason the coach may write audit answers at all (I6).
 *
 * **`resume` carries nothing at all**, and that is the point: it asks for the turn the leader was
 * owed, not for a message they might send. The trigger is chosen here (`COACH_RESUME_TRIGGER`), the
 * conversation it resumes is the run's own, and the last thing in that conversation is whatever the
 * leader actually said. Nothing the client sends can influence any of it.
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
    z.object({
      kind: z.literal('resume'),
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
 * Watch an opening for words, and give the moment back if none arrive.
 *
 * **The failure this exists for, observed on a real run.** The coach was told to open phase 4, the
 * trigger row was written, and the stream was cut before the first token — a tab closed, a reload, a
 * provider that never answered. The moment was already claimed, so the phase sat behind a signpost
 * card and an empty transcript, and every load afterwards was told the beat had happened. A leader
 * who came to be guided was left to open the conversation themselves, which is the exact thing every
 * phase arriving with the coach speaking was built to stop.
 *
 * `finally` rather than a check after the loop, because the common cut is the consumer disconnecting:
 * `sseResponse` breaks out of its `for await`, which returns this generator and runs the cleanup. So
 * the release happens on an abort, on a thrown error, and on a turn that ended with nothing said.
 *
 * A turn that spoke keeps its claim, whatever happens afterwards — a beat that was had must never be
 * replayed on the next load.
 */
async function* holdingOpening(
  events: AsyncIterable<ChatEvent>,
  release: () => Promise<void>
): AsyncIterable<ChatEvent> {
  let spoke = false;
  try {
    for await (const event of events) {
      if (event.type === 'content' && event.delta.trim().length > 0) spoke = true;
      yield event;
    }
  } finally {
    if (!spoke) await release();
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

/**
 * Make sure the turn ends with the answers on screen, whether or not the coach remembered to say so.
 *
 * **The failure this exists for, observed on a live audit.** The coach called `offer_choices` on the
 * first turn, then asked the same question three more times with no tool call at all, each time
 * telling the leader "you can choose from the options on your screen" while they looked at an empty
 * text box. Having called it once, the model believes the answers are still up. No amount of prose
 * fixes that, for the same reason `runCaptureSweep` exists: a side effect asked of a model is a hit
 * rate, and this product does not build on hit rates.
 *
 * So the offer stops depending on the call. Which reading the turn's question is about was decided
 * server-side before the turn ran (`nextQuestionFor`), and `pendingChoiceOffer` reads that decision
 * back. The coach's own call still wins where it happens, because the model knows when it has
 * followed the leader somewhere else and this does not; `seen` is what makes it a fallback rather
 * than a duplicate.
 *
 * **The frame is genuine, not a forgery.** The payload comes from running the real capability, in the
 * real dispatch scope, so what reaches the client is the same result the model's own call would have
 * produced and every guard it applies has been applied. What differs is only who decided to ask.
 *
 * It rides in just before `done`, which is where the client is ready for it: the coach's words have
 * already streamed, and the composer only draws an offer once the turn has stopped speaking. Its
 * failures are its own, exactly as the sweep's are. A turn is the leader's conversation; an offer is
 * a convenience over a composer that already works.
 */
/**
 * Whether this result is an offer the leader will actually see.
 *
 * A refusal is not. The capability refuses four ways (`unknown_slot`, `no_phase_scope`,
 * `wrong_phase`, `no_choices`) and the client drops every one of them to `null`
 * (`components/app/reclaim/coach/choices.ts`), so a turn whose only call was refused draws no
 * answers. Standing the fallback down on that call would leave the leader the empty box this whole
 * mechanism exists to remove — and worse than before it existed, because the coach is now told not
 * to list the options in its prose either. So the two readings are made to agree: only an offer that
 * reached the screen counts as one already made.
 */
const isDrawnOffer = (capabilitySlug: string, result: unknown): boolean =>
  capabilitySlug === RECLAIM_OFFER_CHOICES_SLUG &&
  typeof result === 'object' &&
  result !== null &&
  (result as { success?: unknown }).success === true;

async function* offeringChoices(
  events: AsyncIterable<ChatEvent>,
  offer: () => Promise<ChatEvent | null>
): AsyncIterable<ChatEvent> {
  let seen = false;
  for await (const event of events) {
    if (
      (event.type === 'capability_result' && isDrawnOffer(event.capabilitySlug, event.result)) ||
      (event.type === 'capability_results' &&
        event.results.some((r) => isDrawnOffer(r.capabilitySlug, r.result)))
    ) {
      seen = true;
    }
    if (event.type === 'done' && !seen) {
      seen = true;
      const fallback = await offer();
      if (fallback !== null) yield fallback;
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

  // A resume is a request for a turn that was already owed, so there has to be a conversation for it
  // to have been owed *in*. A run with none has never had a turn at all, and the honest answer is the
  // opening the client should be asking for instead.
  if (body.kind === 'resume' && target.conversationId === undefined) {
    return errorResponse('There is nothing here to pick up yet.', {
      code: 'NOTHING_TO_RESUME',
      status: 409,
    });
  }

  // An opening turn is the coach speaking first, so two things are checked here that a leader turn
  // does not need: that the moment belongs to the phase the leader is actually on (the client sends
  // the moment, the server owns the phase), and that this run has not already had it.
  let message =
    body.kind === 'leader'
      ? body.message
      : body.kind === 'resume'
        ? COACH_RESUME_TRIGGER
        : openingTriggerFor(body.moment);
  if (body.kind === 'opening') {
    if (!openingBelongsToPhase(body.moment, target.phaseKey)) {
      return errorResponse('That moment does not belong to this phase.', {
        code: 'OPENING_WRONG_PHASE',
        status: 422,
        details: { moment: body.moment, phaseKey: target.phaseKey },
      });
    }
    // Claimed before generating. See `claimCoachOpening` for why that ordering is deliberate and
    // must not be moved to after the stream: a moment generated twice costs a leader a duplicate
    // beat and a duplicate bill. What the claim no longer buys is silence — see
    // `releaseCoachOpening` below, and the repair here for the claims that outlived their turn.
    if (!(await claimCoachOpening(session.user.id, runId, body.moment))) {
      // "Already fired" is a statement about the ledger, and the ledger can be wrong: a turn that was
      // cut off before its first token leaves the moment claimed and the phase silent for ever. The
      // transcript is the honest record, so it is asked before the leader is left with nothing.
      const unspoken =
        target.conversationId !== undefined &&
        (await coachOpeningWentUnspoken(target.conversationId));
      if (!unspoken) {
        log.info('Reclaim coach opening already fired', { runId, moment: body.moment });
        return successResponse({ opened: false });
      }
      log.info('Reclaim coach opening claimed but never spoken; opening it again', {
        runId,
        moment: body.moment,
      });
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

  // The run's conversation, for the sweep. Known already on a resumed turn; on the first turn of a
  // run it arrives on the `start` frame, so it is captured there and read when the sweep fires.
  let conversationId = target.conversationId;

  /**
   * The deterministic half of capture (`coach/capture-sweep.ts`).
   *
   * Every turn but an opening: an opening is the coach speaking into a silence the leader has not
   * filled, so there is nothing in it to record and a sweep would only re-read the turn before.
   *
   * **A resume is swept, and has to be.** The leader's words are in the conversation and the turn
   * that should have read them died before its `done` frame, so nothing has ever swept them. Skipping
   * it here would mean a leader whose turn was interrupted quietly gets the one exchange in their
   * audit that only the model's own recording covered.
   *
   * A resume is in fact swept **twice** — once below, before the turn is generated, and once here on
   * the way past `done`. The first pass is what stops the coach asking again for what it was already
   * told; this one is the backstop for a first pass that could not run, which on a resume is a real
   * possibility, because a resume follows a provider that has just refused. The second pass is not a
   * duplicate write: a reading already held is refused as `already_held`, and a superseding value
   * identical to the stored one is refused as a rewrite (`capture-sweep.ts`).
   */
  /**
   * The one thing an opening turn leaves behind that is worth recording.
   *
   * `sweep` skips openings because an opening is the coach speaking into a silence the leader has
   * not filled, so there is nothing of *theirs* in it. The phase-5 opening is the exception: its
   * whole job is to put three named ways in front of the leader, and the briefing asks the coach to
   * record them as a structured value in the same breath. Observed live, it did neither — it went
   * straight to the chosen action, and the audit lost the menu the summary is meant to show.
   *
   * So this reads the opening the coach has just spoken and writes down the options it actually
   * offered. It never invents one, and a turn that offered fewer than three writes nothing, which is
   * the honest record of an opening that did not do its job. See `coach/action-options.ts`.
   *
   * Its failures are its own, like every other pass here: a leader's turn is their conversation.
   */
  const optionsSweep = async (): Promise<void> => {
    const result = await sweepActionOptions({
      userId: session.user.id,
      runId,
      phaseKey: target.phaseKey,
      ...(conversationId !== undefined ? { conversationId } : {}),
    });
    if (result.recorded) {
      log.info('Reclaim action options recorded from the coach opening', { runId });
      // The briefing is cached for sixty seconds per `(type, id, userId)` and this wrote through a
      // path that dropped nothing, exactly as the capture sweep does. Without this the coach's next
      // turn would still read the options as outstanding.
      invalidateContext(MODULE_SURFACE_CONTEXT_TYPE, RECLAIM_MODULE_SLUG, {
        userId: session.user.id,
      });
    } else if (result.skipped !== 'wrong_phase' && result.skipped !== 'already_held') {
      log.info('Reclaim action options not recorded', {
        runId,
        skipped: result.skipped,
        ...(result.offered !== undefined ? { offered: result.offered } : {}),
      });
    }
  };

  const sweep = async (): Promise<void> => {
    if (body.kind === 'opening') return optionsSweep();
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
    // The coach's briefing is built by a context contributor and cached for sixty seconds per
    // `(type, id, userId)`. The model's own `record_answers` calls drop that entry as they land
    // (`streaming-handler.ts`), so the list it reads is honest about what it recorded itself — but
    // this sweep runs *after* the turn, writes through the same gate, and dropped nothing. A leader
    // replying inside the minute therefore met a coach still holding the pre-sweep list: readings the
    // sweep had just captured came back as "not yet captured in this audit", and the reading it was
    // told to end the turn on could be one already filled. Asking again for what they have just said
    // is the exact failure the run-scoped list exists to prevent.
    if (result.recorded.length > 0) {
      invalidateContext(MODULE_SURFACE_CONTEXT_TYPE, RECLAIM_MODULE_SLUG, {
        userId: session.user.id,
      });
    }
  };

  /**
   * A resume sweeps **before** it generates, as well as after.
   *
   * **The failure this exists for, observed on a live audit.** The leader was asked how many hours of
   * deep work they wanted, answered "10", and the provider threw 429 before the coach said a word.
   * The client picked the turn back up, and the coach asked the same question again, word for word.
   *
   * Every part of that was the machinery working as written. The lost turn never reached its `done`
   * frame, so `sweepingCapture` never fired and nothing recorded the "10". The resume then built the
   * coach's briefing from a run that still held the reading as unasked, so `nextQuestionFor` named it
   * as the question to end on — correctly, on the evidence it had. The one guard that would have
   * caught it, the fallback in `nextQuestionLines`, is worded for a leader turn: it asks whether the
   * named reading is what they answered *in the message you are replying to*, and on a resume the
   * message being replied to is a stage direction. So the pointer was spent, nothing said so, and the
   * leader was asked for a figure that was already in the transcript above.
   *
   * Sweeping here is the half of the fix that does not depend on a model reading anything correctly.
   * The reason the route gives for not sweeping a failed turn — no settled transcript — is about the
   * coach's half of the exchange, and it is the coach's half that is missing. The leader's message is
   * as settled as any other. Recording it now, and dropping the cached briefing with it, means the
   * resume is generated against a run that knows what it has been told, and the question it ends on is
   * the next one rather than the last one.
   *
   * It runs before `streamChat` rather than beside it because the briefing is built as the turn opens,
   * and a sweep racing that build is a sweep that does not exist.
   *
   * **It is allowed to fail, and often will.** A resume follows a provider that has just refused, and
   * this is another call to the same provider. `runCaptureSweep` returns rather than throws and this
   * does not take its word for it: a capture pass is bookkeeping, a turn is the leader's conversation.
   * The sweep after the turn stays exactly where it was, as the backstop for the pass that could not
   * run here, and the widened prose in `nextQuestionLines` covers the turn in between.
   */
  if (body.kind === 'resume') {
    await sweep().catch((error: unknown) => {
      log.warn('Reclaim pre-resume capture sweep threw; picking the turn up regardless', {
        runId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

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

  /**
   * The answers for this turn's question, when the coach did not put them up itself.
   *
   * Runs the real capability rather than assembling a result by hand, so the client cannot tell a
   * fallback offer from one the model asked for, and neither can any guard: the scope it is given is
   * the same server-built scope every dispatch on this turn received. Returns `null` for a question
   * that has no set, which is most of them.
   */
  const offerChoices = async (): Promise<ChatEvent | null> => {
    try {
      const pending = await pendingChoiceOffer({
        userId: session.user.id,
        runId,
        phaseKey: target.phaseKey,
      });
      if (pending === null) return null;
      const result = await new ReclaimOfferChoicesCapability().execute(
        { slotSlug: pending.slotSlug },
        {
          userId: session.user.id,
          // The same agent the turn ran as, and the same server-built scope every dispatch on it
          // received. Nothing here is a stand-in: this is the context the model's own call would
          // have executed in.
          agentId: surface.agentId,
          scope: buildCoachScope({ runId, phaseKey: target.phaseKey }),
          ...(conversationId !== undefined ? { conversationId } : {}),
        }
      );
      if (!result.success) return null;
      return { type: 'capability_result', capabilitySlug: RECLAIM_OFFER_CHOICES_SLUG, result };
    } catch (error: unknown) {
      // Bookkeeping must never cost a leader their turn. A turn with no offer is exactly the turn
      // they would have had before any of this existed: a question and a box to answer it in.
      log.warn('Reclaim choice offer failed; finishing the turn regardless', {
        runId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  };

  const linked = linkingConversation(events, runId, target.conversationId !== undefined);
  const observed = (async function* () {
    for await (const event of linked) {
      if (event.type === 'start') conversationId = event.conversationId;
      yield event;
    }
  })();

  // Innermost of the three wrappers, so it sees every token the model produced and its cleanup runs
  // whenever the source stops — whichever of the layers above it was the one that let go.
  const held =
    body.kind === 'opening'
      ? holdingOpening(observed, async () => {
          log.info('Reclaim coach opening produced nothing; giving the moment back', {
            runId,
            moment: body.moment,
          });
          await releaseCoachOpening(session.user.id, runId, body.moment);
        })
      : observed;

  return sseResponse(offeringChoices(sweepingCapture(held, sweep, runId, log), offerChoices), {
    signal: request.signal,
  });
});
