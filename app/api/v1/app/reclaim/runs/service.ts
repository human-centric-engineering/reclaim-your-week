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
import { SLOT_SOURCE_TYPE, type SlotSourceType } from '@/lib/framework/data-slots/vocabulary';
import { assertEntitled, consumeAudit } from '@/lib/app/programme/runs/entitlement';
import { grantReferralUnlock } from '@/lib/app/programme/access/referrals';
import { emitReclaimAccessEvent } from '@/lib/app/programme/access/events';
import { RECLAIM_MAP_SLUG } from '@/lib/app/programme/map';
import { RECLAIM_MODULE_SLUG } from '@/lib/app/programme/module';
import { readPhaseMarks, type PhaseMarks } from '@/lib/app/programme/runs/phase-marks';
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
  /** The leader accepting a reading the coach offered back, rather than stating it themselves. */
  confirming?: boolean;
  conversationId?: string;
}

/**
 * The source type a leader-initiated save records.
 *
 * A form field the leader typed is `direct`. Confirming a reading the coach inferred is
 * `user_confirmed`, which keeps the audit honest about where a figure started: the leader has agreed
 * it, so it is theirs to stand on, but it is not a thing they volunteered. Every other source type
 * belongs to the coach and is set by the capture capability, never by a client.
 */
function leaderSourceType(input: RunAnswerInput): SlotSourceType {
  return input.confirming === true ? SLOT_SOURCE_TYPE.user_confirmed : SLOT_SOURCE_TYPE.direct;
}

/**
 * Record which conversation this run's coaching happened in (F10 t-1, plan D2 — rewritten for the
 * conversational surface).
 *
 * Cost is logged per conversation and never per run, so without this the admin surface can only guess
 * by timestamp overlap, which fails on exactly the run Brief §8 worries about (four hours in one
 * audit, or one left open for weeks).
 *
 * **This used to be the guess.** It looked up the leader's most-recently-updated active surface
 * conversation and assumed that was this run's. That held while the coach was rendered nowhere and a
 * leader had at most one transcript, and it was never true by construction: a conversation left open
 * from a previous audit, or opened from any other module surface entry, was equally eligible. Now the
 * conversation arrives from the one route that opens it — the coach stream, which knows the run in its
 * path — so the link is a fact rather than an inference, and a leader who never speaks to the coach
 * correctly ends with no conversation attributed instead of a stray one.
 *
 * Write-once and idempotent: the `conversationId: null` guard makes it a conditional write rather
 * than read-then-write, so a resumed run keeps its original attribution and two turns racing on the
 * first message cannot set different conversations. Best-effort — this is bookkeeping for a report,
 * and it must never be able to fail a leader's turn.
 */
export async function linkRunConversation(runId: string, conversationId: string): Promise<void> {
  try {
    await prisma.reclaimAuditRun.updateMany({
      where: { id: runId, conversationId: null },
      data: { conversationId },
    });
  } catch (error: unknown) {
    logger.warn('Reclaim: could not link run to its conversation', {
      runId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Record where a phase's part of the conversation begins, as it is entered.
 *
 * The mark is the id of the **last message that already exists** at this moment, so the phase being
 * entered owns everything after it. See `runs/phase-marks.ts` for the arithmetic both surfaces read
 * it with.
 *
 * Three properties, each of them load-bearing:
 *
 *  - **Written on entry only.** A leader re-reading phase 1 from phase 4 must not be able to move
 *    phase 2's boundary, so nothing but a transition writes here.
 *  - **Never overwritten.** The merge preserves an existing mark for the same phase. Transitions only
 *    go forward, so this should not arise; if it ever does, the first boundary is the true one and a
 *    second write would silently re-cut a phase the leader has already read.
 *  - **Best-effort.** A leader who has just finished a phase must not be held at it because a
 *    bookkeeping write failed. The cost of a missing mark is that the phase reads from further back
 *    than it should, which is exactly the behaviour this replaced.
 */
export async function recordPhaseMark(
  userId: string,
  runId: string,
  phaseKey: string
): Promise<void> {
  try {
    const run = await prisma.reclaimAuditRun.findFirst({
      where: { id: runId, userId },
      select: { conversationId: true, phaseMarks: true },
    });
    // No conversation yet means the leader has taken the forms this far and there is nothing to
    // divide. Leaving the mark absent is correct: whatever they say next opens the phase.
    if (run?.conversationId === null || run?.conversationId === undefined) return;

    const marks = readPhaseMarks(run.phaseMarks);
    if (marks[phaseKey] !== undefined) return;

    const last = await prisma.aiMessage.findFirst({
      where: { conversationId: run.conversationId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (last === null) return;

    await prisma.reclaimAuditRun.update({
      where: { id: runId },
      data: { phaseMarks: { ...marks, [phaseKey]: last.id } },
    });
  } catch (error: unknown) {
    logger.warn('Reclaim: could not record the phase mark', {
      runId,
      phaseKey,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * What a coach turn needs about the run it is happening in (the conversational stage-1 read).
 *
 * The run is verified as the caller's and in progress here, so the route never has to, and the phase
 * comes from the journey rather than from the client: both halves of the dispatch scope the capture
 * capability trusts (I6) are therefore server-derived. A run that is not in progress refuses the turn
 * rather than opening a transcript nothing may be recorded into.
 */
export interface CoachTurnTarget {
  /** The run's own conversation, or `undefined` to open a fresh one and link it. */
  conversationId: string | undefined;
  /** The phase the leader is on — the `nodeKey` half of the scope. */
  phaseKey: string;
}

export async function loadCoachTurnTarget(userId: string, runId: string): Promise<CoachTurnTarget> {
  const run = await loadOwnedRun(runId, userId);
  if (run.status !== RUN_STATUS.inProgress) {
    throw new ValidationError('This audit is not in progress', {
      run: ['The coach can only talk through an active audit.'],
    });
  }
  const { currentPhaseKey } = await loadPhaseProgress(userId, runId);
  return { conversationId: run.conversationId ?? undefined, phaseKey: currentPhaseKey };
}

/**
 * Claim a coach-opening moment for this run, once and only once.
 *
 * Returns `true` when this caller won the claim and should generate the turn, `false` when the moment
 * was already fired and nothing should happen.
 *
 * **One conditional statement, not read-then-write.** `hasNot` + `push` in a single `updateMany` is
 * what makes two browser tabs, React's development double-effect, and a reload part-way through a
 * stream all collapse to a single turn. A read followed by a write would leave a window between them
 * wide enough for exactly the double-open this is here to prevent.
 *
 * **The claim happens before the turn is generated, deliberately.** The trade is visible and worth
 * stating so nobody quietly reverses it: if generation then fails, the moment stays marked and the
 * leader gets no opener, and they have to speak first — which is what they had to do before any of
 * this existed, so the failure is inert. Claiming afterwards instead would mean every refresh
 * part-way through a slow turn bought a second full generation against the leader's own budget. A
 * rare silent no-op beats a common expensive duplicate.
 *
 * `userId` is in the `where` clause rather than checked beforehand: ownership and the claim are then
 * the same statement, and no caller can forget the check.
 */
export async function claimCoachOpening(
  userId: string,
  runId: string,
  moment: string
): Promise<boolean> {
  const claimed = await prisma.reclaimAuditRun.updateMany({
    where: {
      id: runId,
      userId,
      status: RUN_STATUS.inProgress,
      // Prisma's scalar-list filters have no `hasNot`, so the absence is expressed as a negated
      // `has`. Still one statement, which is the property that matters here.
      NOT: { coachOpenings: { has: moment } },
    },
    data: { coachOpenings: { push: moment } },
  });
  return claimed.count > 0;
}

/** Which coach-opening moments a run has fired. Used by the transition gate (I12) and the surface. */
export async function readCoachOpenings(userId: string, runId: string): Promise<string[]> {
  const run = await prisma.reclaimAuditRun.findFirst({
    where: { id: runId, userId },
    select: { coachOpenings: true },
  });
  return run?.coachOpenings ?? [];
}

/** Assert the run is the caller's and still in progress (answers can only be saved to an active run). */
async function assertActiveOwnedRun(userId: string, runId: string): Promise<void> {
  const run = await loadOwnedRun(runId, userId);
  if (run.status !== RUN_STATUS.inProgress) {
    throw new ValidationError('This audit is not in progress', {
      run: ['Answers can only be saved to an active run.'],
    });
  }
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
    sourceType: leaderSourceType(input),
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
      sourceType: leaderSourceType(input),
      conversationId: input.conversationId,
    });
  }
}

/** The progress shell's data (F4 t-4): the active run (if any) and each phase's status, so the client
 *  renders where the leader is and resumes there. All seven phases always appear (Phase 0 included).
 *
 *  `conversationId` is what makes a reload keep the conversation: the coach surface reads the run's
 *  transcript back from it, and a `null` simply means this leader has not spoken to the coach yet. */
export interface CurrentRunState {
  run: {
    id: string;
    quarter: string | null;
    conversationId: string | null;
    /**
     * Which coach-opening moments this run has fired. The surface fires a moment only when it is due
     * *and* absent from here, so a reload does not replay a beat the leader has already had. The
     * conditional claim in the route is the backstop for the race this list cannot see.
     */
    coachOpenings: string[];
    /**
     * Where each phase's part of the conversation begins. The surface draws a phase from its own
     * mark rather than from the top of a transcript that spans the whole audit.
     */
    phaseMarks: PhaseMarks;
  } | null;
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
  return {
    run: {
      id: run.id,
      quarter: run.quarter,
      conversationId: run.conversationId,
      coachOpenings: run.coachOpenings,
      phaseMarks: readPhaseMarks(run.phaseMarks),
    },
    ...progress,
  };
}
