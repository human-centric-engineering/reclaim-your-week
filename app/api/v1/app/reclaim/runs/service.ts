/**
 * Run lifecycle service (F4 t-3). The Prisma + HTTP-glue side of the run routes, factored out so
 * `smoke:reclaim-run` can drive the same code against real Postgres. Lives under `app/` (Prisma
 * allowed here). The framework-journey side — `applyJourneyTransition`, keyed on node keys — lives in
 * `lib/app/programme/runs/journey.ts`, which keeps framework vocabulary out of this core-scanned
 * surface (`framework:boundary`); this file only does Prisma and delegates.
 *
 * The run id is the single spine: `app_reclaim_audit_run.id` = the journey `contextKey` = the slot
 * `provenance.runId`. It is server-owned, derived from the run the leaf created, never an LLM arg (I6).
 */

import { prisma } from '@/lib/db/client';
import { logger } from '@/lib/logging';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { MODULE_SURFACE_CONTEXT_TYPE } from '@/lib/framework/guidance/surface';
import { saveAnswer } from '@/lib/app/programme/slots/write';
import { assertEntitled, consumeAudit } from '@/lib/app/programme/runs/entitlement';
import { grantReferralUnlock } from '@/lib/app/programme/access/referrals';
import { emitReclaimAccessEvent } from '@/lib/app/programme/access/events';
import { RECLAIM_MAP_SLUG } from '@/lib/app/programme/map';
import { RECLAIM_MODULE_SLUG } from '@/lib/app/programme/module';
import {
  enterFirstPhase,
  advancePhase,
  completeFinalPhase,
  emptyPhaseProgress,
  loadPhaseProgress,
  type PhaseView,
} from '@/lib/app/programme/runs/journey';

export const RUN_STATUS = {
  inProgress: 'in_progress',
  complete: 'complete',
  abandoned: 'abandoned',
} as const;

type ReclaimAuditRun = Awaited<ReturnType<typeof prisma.reclaimAuditRun.findFirstOrThrow>>;

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
  // Entitlement gate (I14, F6 t-1, closed by F8 t-2): resolve a live invite into a tiered grant, or
  // refuse. The unconditional free-tier bootstrap this once carried is gone — its removal is what
  // made "invite-only" true.
  await assertEntitled(userId);

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

  await enterFirstPhase(userId, run.id);
  return run;
}

/**
 * Advance one phase. The reflection gate (I9) is enforced by the route before this is called; the
 * move itself is validated by the engine (`advancePhase`). Assumes ownership already verified.
 */
export async function transitionRun(
  userId: string,
  runId: string,
  leavingPhaseKey: string
): Promise<{ enteredPhaseKey: string }> {
  return advancePhase(userId, runId, leavingPhaseKey);
}

/**
 * Complete the run (I15): mark the row complete and set `isActive:false` on the module surface
 * conversation, so a repeat audit opens a fresh transcript rather than resuming this one. Idempotent.
 */
export async function completeRun(userId: string, runId: string): Promise<ReclaimAuditRun> {
  const run = await loadOwnedRun(runId, userId);
  if (run.status === RUN_STATUS.complete) return run;

  // Last chance to attribute the cost: below, I15 closes the conversation, and once it is inactive
  // "the run's conversation" is no longer identifiable. A leader who never saved an answer through a
  // form (all chat, no cards) gets their link here or not at all.
  if (run.conversationId === null) await linkRunConversation(runId, userId);

  await completeFinalPhase(userId, runId);

  const updated = await prisma.reclaimAuditRun.update({
    where: { id: runId },
    data: { status: RUN_STATUS.complete, completedAt: new Date() },
  });

  // Free tier = one *complete* audit (I14): consume the entitlement now, not at creation.
  await consumeAudit(userId);

  // F8 t-3: if this leader arrived on someone's referral, that person's second audit unlocks now —
  // on the referred leader's first *completion*, never on their signup (Brief §8). Idempotent, so
  // repeat completions do not stack unlocks. Best-effort: a bookkeeping failure must not fail a run
  // the leader has just finished.
  await grantReferralUnlock(userId).catch((error: unknown) => {
    logger.warn('Reclaim: referral unlock failed after completion', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  });

  // F8 t-4: the follow-up-sequence seam (Brief §2). No ESP in v1 — one call site for when there is one.
  emitReclaimAccessEvent('reclaim.audit_completed', { userId, runId });

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

type SlotValueJson = Parameters<typeof saveAnswer>[0]['valueJson'];

/** One captured answer, saved through the single write path (I3), stamped with this run's id. */
export interface RunAnswerInput {
  slotSlug: string;
  value: string;
  /** Typed form for `number`/`boolean`/`json` slots (Phase 0/1 forms). Omitted ⇒ prose only. */
  valueJson?: unknown;
  conversationId?: string;
}

/**
 * Record which module-surface conversation this run's coaching happened in (F10 t-1, plan D2).
 *
 * Cost is logged per conversation and never per run, so without this the admin surface can only guess
 * by timestamp overlap — which fails on exactly the run Brief §8 worries about (four hours in one
 * audit, or one left open for weeks). The surface keeps a single conversation live per
 * `(user, agent, module)` until completion closes it (I15), so "the active one" is unambiguous while
 * a run is in progress.
 *
 * Write-once and idempotent: only ever fills a `null`, so a resumed run keeps its original
 * attribution. Best-effort — this is bookkeeping for a report, and it must never be able to fail a
 * leader's answer.
 */
async function linkRunConversation(runId: string, userId: string): Promise<void> {
  try {
    const conversation = await prisma.aiConversation.findFirst({
      where: {
        userId,
        contextType: MODULE_SURFACE_CONTEXT_TYPE,
        contextId: RECLAIM_MODULE_SLUG,
        isActive: true,
      },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });
    if (conversation === null) return;

    // `updateMany` with the null guard makes this a conditional write rather than a read-then-write:
    // two concurrent answer saves cannot race to set different conversations.
    await prisma.reclaimAuditRun.updateMany({
      where: { id: runId, conversationId: null },
      data: { conversationId: conversation.id },
    });
  } catch (error: unknown) {
    logger.warn('Reclaim: could not link run to its conversation', {
      runId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Assert the run is the caller's and still in progress (answers can only be saved to an active run). */
async function assertActiveOwnedRun(userId: string, runId: string): Promise<void> {
  const run = await loadOwnedRun(runId, userId);
  if (run.status !== RUN_STATUS.inProgress) {
    throw new ValidationError('This audit is not in progress', {
      run: ['Answers can only be saved to an active run.'],
    });
  }
  // The first answer after the leader has spoken to the coach is where the conversation becomes
  // observable. Cheap: the lookup only runs while the link is still missing.
  if (run.conversationId === null) await linkRunConversation(runId, userId);
}

export async function saveRunAnswer(
  userId: string,
  runId: string,
  input: RunAnswerInput
): ReturnType<typeof saveAnswer> {
  await assertActiveOwnedRun(userId, runId);
  return saveAnswer({
    userId,
    runId,
    slotSlug: input.slotSlug,
    value: input.value,
    valueJson: input.valueJson as SlotValueJson,
    sourceType: 'direct',
    conversationId: input.conversationId,
  });
}

/**
 * Save several answers for one run — the Phase 0 setup form and the Phase 1 cards each write many
 * slots at once. Ownership + active-run are checked once; every write still routes through
 * `saveAnswer` (I3). Sequential (insert-only slot versions; order is stable and volumes are small).
 */
export async function saveRunAnswers(
  userId: string,
  runId: string,
  answers: RunAnswerInput[]
): Promise<void> {
  await assertActiveOwnedRun(userId, runId);
  for (const input of answers) {
    await saveAnswer({
      userId,
      runId,
      slotSlug: input.slotSlug,
      value: input.value,
      valueJson: input.valueJson as SlotValueJson,
      sourceType: 'direct',
      conversationId: input.conversationId,
    });
  }
}

/** The progress shell's data (F4 t-4): the active run (if any) and each phase's status, so the client
 *  renders where the leader is and resumes there. All seven phases always appear (Phase 0 included). */
export interface CurrentRunState {
  run: { id: string; quarter: string | null } | null;
  phases: PhaseView[];
  currentPhaseKey: string;
}

export async function loadCurrentRunState(userId: string): Promise<CurrentRunState> {
  const run = await prisma.reclaimAuditRun.findFirst({
    where: { userId, status: RUN_STATUS.inProgress },
    orderBy: { startedAt: 'desc' },
  });
  if (run === null) return { run: null, ...emptyPhaseProgress() };

  const progress = await loadPhaseProgress(userId, run.id);
  return { run: { id: run.id, quarter: run.quarter }, ...progress };
}
