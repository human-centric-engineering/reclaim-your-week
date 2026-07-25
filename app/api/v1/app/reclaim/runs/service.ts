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
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { MODULE_SURFACE_CONTEXT_TYPE } from '@/lib/framework/guidance/surface';
import { getJourney, getNodeStates } from '@/lib/framework/facilitation/journey/queries';
import { saveAnswer } from '@/lib/app/programme/slots/write';
import { RECLAIM_MAP_SLUG, RECLAIM_PHASES } from '@/lib/app/programme/map';
import { RECLAIM_MODULE_SLUG } from '@/lib/app/programme/module';
import {
  enterFirstPhase,
  advancePhase,
  completeFinalPhase,
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

  await completeFinalPhase(userId, runId);

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
    conversationId: input.conversationId,
  });
}

export type PhaseStatus = 'completed' | 'active' | 'upcoming';
export interface PhaseView {
  key: string;
  label: string;
  status: PhaseStatus;
}

/** The progress shell's data (F4 t-4): the active run (if any) and each phase's status, so the client
 *  renders where the leader is and resumes there. All seven phases always appear (Phase 0 included). */
export interface CurrentRunState {
  run: { id: string; quarter: string | null } | null;
  phases: PhaseView[];
  /** The phase the leader is on now — the active node, else the first not-yet-complete, else the last. */
  currentPhaseKey: string;
}

export async function loadCurrentRunState(userId: string): Promise<CurrentRunState> {
  const run = await prisma.reclaimAuditRun.findFirst({
    where: { userId, status: RUN_STATUS.inProgress },
    orderBy: { startedAt: 'desc' },
  });
  if (run === null) {
    return {
      run: null,
      phases: RECLAIM_PHASES.map((p) => ({ key: p.key, label: p.label, status: 'upcoming' })),
      currentPhaseKey: FIRST_PHASE_KEY,
    };
  }

  const viewer = { userId };
  const journey = await getJourney(viewer, {
    userId,
    graphSlug: RECLAIM_MAP_SLUG,
    contextKey: run.id,
  });
  const states = journey
    ? await getNodeStates(viewer, { journeyId: journey.id, subject: userId })
    : [];
  const statusByKey = new Map(states.map((s) => [s.nodeKey, s.status]));

  const phases: PhaseView[] = RECLAIM_PHASES.map((p) => {
    const s = statusByKey.get(p.key);
    const status: PhaseStatus =
      s === 'completed' ? 'completed' : s === 'active' ? 'active' : 'upcoming';
    return { key: p.key, label: p.label, status };
  });
  const currentPhaseKey =
    phases.find((p) => p.status === 'active')?.key ??
    phases.find((p) => p.status !== 'completed')?.key ??
    FINAL_PHASE_KEY;

  return { run: { id: run.id, quarter: run.quarter }, phases, currentPhaseKey };
}
