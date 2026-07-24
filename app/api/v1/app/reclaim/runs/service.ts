/**
 * Run lifecycle service (F4 t-3). The Prisma + framework orchestration behind the reclaim run routes,
 * factored out of the route handlers so `smoke:reclaim-run` can drive the same code against real
 * Postgres. Lives under `app/` (Prisma allowed here; `lib/app/**` is storage-agnostic).
 *
 * The run id is the single spine: `app_reclaim_audit_run.id` = the journey `contextKey` = the slot
 * `provenance.runId`. It is server-owned — derived from the run the leaf created, never an LLM arg (I6).
 *
 * `applyJourneyTransition` is the framework's sole journey-state writer; there is no framework
 * journey-*creation* seam, so `createRun` writes the `UserJourney` row directly (daybreak-asks).
 */

import { prisma } from '@/lib/db/client';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { applyJourneyTransition } from '@/lib/framework/guidance/guidance';
import { MODULE_SURFACE_CONTEXT_TYPE } from '@/lib/framework/guidance/surface';
import { saveAnswer } from '@/lib/app/programme/slots/write';
import { RECLAIM_MAP_SLUG } from '@/lib/app/programme/map';
import { RECLAIM_MODULE_SLUG } from '@/lib/app/programme/module';
import { FIRST_PHASE_KEY, FINAL_PHASE_KEY, nextPhaseKey } from '@/lib/app/programme/runs/phases';

export const RUN_STATUS = {
  inProgress: 'in_progress',
  complete: 'complete',
  abandoned: 'abandoned',
} as const;

type ReclaimAuditRun = Awaited<ReturnType<typeof prisma.reclaimAuditRun.findFirstOrThrow>>;
type TransitionResult = Awaited<ReturnType<typeof applyJourneyTransition>>;

/** The journey natural key for a run: one journey per run, keyed on the run id as `contextKey`. */
function journeyKey(userId: string, runId: string) {
  return { userId, graphSlug: RECLAIM_MAP_SLUG, contextKey: runId };
}

/** A one-line reason a transition was refused, for a `ValidationError` detail. */
function rejectionMessage(result: TransitionResult): string {
  if (result === null) return 'The journey has not been started.';
  return result.ok ? 'ok' : result.rejection.message;
}

/** Load a run the caller owns, or 404. Ownership is by `userId` — the run id alone never authorises. */
export async function loadOwnedRun(runId: string, userId: string): Promise<ReclaimAuditRun> {
  const run = await prisma.reclaimAuditRun.findFirst({ where: { id: runId, userId } });
  if (run === null) throw new NotFoundError(`Audit run ${runId} not found`);
  return run;
}

/**
 * Create a run: refuse a second `in_progress` (the partial-unique index is the hard backstop; this is
 * the friendly error), create the `app_reclaim_audit_run` and its `UserJourney`, and enter the first
 * phase so "you are here" is right on resume.
 */
export async function createRun(userId: string, quarter?: string): Promise<ReclaimAuditRun> {
  // TODO(F6/F8): entitlement gate — check `app_reclaim_grant` here and refuse when exhausted/expired
  // (I14). Not enforced yet; F6 wires this route to the grant table.
  const existing = await prisma.reclaimAuditRun.findFirst({
    where: { userId, status: RUN_STATUS.inProgress },
  });
  if (existing !== null) {
    throw new ValidationError('An audit is already in progress', {
      run: ['Complete or abandon the current audit before starting another.'],
    });
  }

  const run = await prisma.reclaimAuditRun.create({
    data: { userId, status: RUN_STATUS.inProgress, quarter: quarter ?? null },
  });

  // No framework journey-creation seam — create the row directly (daybreak-asks). contextKey = run id.
  await prisma.userJourney.create({
    data: { userId, graphSlug: RECLAIM_MAP_SLUG, contextKey: run.id },
  });

  // Enter the first phase. A fresh run starts at Phase 0.
  await applyJourneyTransition({ userId }, journeyKey(userId, run.id), {
    nodeKey: FIRST_PHASE_KEY,
    kind: 'enter',
  });

  return run;
}

/**
 * Advance one phase: complete the leaving node, then enter the next. The **reflection gate (I9) is
 * enforced by the route before this is called**; here `applyJourneyTransition` validates the move
 * itself (a non-active node can't complete), so a client that lies about `leavingPhaseKey` is refused
 * by the engine, not trusted. Assumes ownership already verified by the route.
 */
export async function transitionRun(
  userId: string,
  runId: string,
  leavingPhaseKey: string
): Promise<{ enteredPhaseKey: string }> {
  const next = nextPhaseKey(leavingPhaseKey);
  if (next === null) {
    throw new ValidationError('There is no phase after this one', {
      phase: ['The final phase completes the run — use complete, not transition.'],
    });
  }

  const key = journeyKey(userId, runId);
  const completed = await applyJourneyTransition({ userId }, key, {
    nodeKey: leavingPhaseKey,
    kind: 'complete',
  });
  if (completed === null || !completed.ok) {
    throw new ValidationError('Could not complete the current phase', {
      phase: [rejectionMessage(completed)],
    });
  }

  const entered = await applyJourneyTransition({ userId }, key, { nodeKey: next, kind: 'enter' });
  if (entered === null || !entered.ok) {
    throw new ValidationError('Could not enter the next phase', {
      phase: [rejectionMessage(entered)],
    });
  }

  return { enteredPhaseKey: next };
}

/**
 * Complete the run (I15): mark the row complete and set `isActive:false` on the module surface
 * conversation, so a repeat audit opens a fresh transcript rather than resuming this one. Idempotent.
 * Marking the final node complete is best-effort — the run completes regardless of journey state.
 */
export async function completeRun(userId: string, runId: string): Promise<ReclaimAuditRun> {
  const run = await loadOwnedRun(runId, userId);
  if (run.status === RUN_STATUS.complete) return run;

  await applyJourneyTransition({ userId }, journeyKey(userId, runId), {
    nodeKey: FINAL_PHASE_KEY,
    kind: 'complete',
  }).catch(() => null);

  const updated = await prisma.reclaimAuditRun.update({
    where: { id: runId },
    data: { status: RUN_STATUS.complete, completedAt: new Date() },
  });

  // I15: close the surface conversation so audit 2 does not resume audit 1's transcript.
  await prisma.aiConversation.updateMany({
    where: {
      userId,
      contextType: MODULE_SURFACE_CONTEXT_TYPE,
      contextId: RECLAIM_MODULE_SLUG,
      isActive: true,
    },
    data: { isActive: false },
  });

  return updated;
}

/** One captured answer, saved through the single write path (I3), stamped with this run's id. */
export interface RunAnswerInput {
  slotSlug: string;
  value: string;
  nodeKey?: string;
  conversationId?: string;
}

export async function saveRunAnswer(
  userId: string,
  runId: string,
  input: RunAnswerInput
): ReturnType<typeof saveAnswer> {
  const run = await loadOwnedRun(runId, userId);
  if (run.status !== RUN_STATUS.inProgress) {
    throw new ValidationError('This audit is not in progress', {
      run: ['Answers can only be saved to an active run.'],
    });
  }
  return saveAnswer({
    userId,
    runId,
    slotSlug: input.slotSlug,
    value: input.value,
    nodeKey: input.nodeKey,
    conversationId: input.conversationId,
  });
}
