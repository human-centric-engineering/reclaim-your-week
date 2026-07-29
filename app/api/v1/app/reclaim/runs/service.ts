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
import { FIRST_PHASE_KEY } from '@/lib/app/programme/runs/phases';
import {
  enterFirstPhase,
  advancePhase,
  completeFinalPhase,
  emptyPhaseProgress,
  loadPhaseProgress,
  type PhaseView,
} from '@/lib/app/programme/runs/journey';
import { Prisma } from '@prisma/client';
import { readRunAnswers } from '@/lib/app/programme/runs/answers';
import { readBucketLabels } from '@/lib/app/programme/buckets/labels';
import { buildAnalystBrief } from '@/lib/app/programme/analyst/brief';
import { runAnalyst } from '@/lib/app/programme/analyst/reading';
import { auditSummaryUrl } from '@/lib/app/programme/urls';
import { sendEmail } from '@/lib/email/send';
import AuditCompleteEmail from '@/components/app/emails/audit-complete';

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

  // F14: §10's last two sections. Best-effort, and wrapped exactly as the referral unlock above is —
  // a leader who has just pressed "finish my audit" must not be held at a spinner because a model
  // timed out, and must never see a failure for a section that did not exist a week ago.
  await ensureAnalystReading(userId, runId);

  // F15: the one message a finished audit sends. **After the analyst, deliberately** — the email
  // links to the summary, and sending first would point a leader at a page missing the two sections
  // that had just been generated. That is the one ordering they would actually notice.
  await sendCompletionEmail(userId, runId);

  return updated;
}

/**
 * Tell the leader their audit is finished and where it lives (F15 t-3).
 *
 * Sent directly rather than through the email registry, because `EmailPropsMap` is a closed
 * interface of four auth kinds and a leaf cannot add one (sunrise#468). `quarterly-nudge` set the
 * precedent; when that ask lands, both move to `lib/app/emails.ts` together.
 *
 * **Never throws, and never blocks.** A leader has just pressed "finish my audit". A provider outage
 * must not turn that into an error on a screen that has already done everything it needed to do.
 * `sendEmail` already swallows provider failures into a result object; this catches everything
 * around it as well, including a missing name lookup.
 */
async function sendCompletionEmail(userId: string, runId: string): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    });
    if (user === null) return;

    // The audit's own first name where it captured one, falling back to the account name. The audit
    // asks for a first name; an account holds whatever was typed at signup, which is often a full
    // one, so the greeting takes the first word rather than "Hello Sam Patel,".
    const answers = await readRunAnswers(userId, runId);
    const fromAudit = answers['reclaim_profile_first_name']?.value?.trim();
    const firstName =
      fromAudit !== undefined && fromAudit.length > 0
        ? fromAudit.split(/\s+/)[0]
        : (user.name?.trim().split(/\s+/)[0] ?? null);

    const result = await sendEmail({
      to: user.email,
      subject: 'Your time audit is finished',
      react: AuditCompleteEmail({
        firstName: firstName === undefined || firstName === '' ? null : firstName,
        summaryUrl: auditSummaryUrl(runId),
      }),
    });

    // Logged either way: an unsent completion email is invisible otherwise, and "did the leader ever
    // hear from us" is a question an operator will eventually ask. Status only, never content.
    logger.info('Reclaim completion email', { runId, status: result.status });
  } catch (error: unknown) {
    logger.warn(
      'Reclaim: the completion email could not be sent; the audit is finished regardless',
      {
        runId,
        error: error instanceof Error ? error.message : String(error),
      }
    );
  }
}

/**
 * Generate the analyst's reading for a run, once.
 *
 * Called from `completeRun`, and again lazily from the summary read — which is what covers the two
 * cases completion alone cannot: audits finished before F14 shipped, and generations that failed.
 *
 * **Write-once via a conditional `updateMany`**, the same pattern `linkRunConversation` uses. Two
 * tabs opening a finished summary at the same moment would otherwise both generate, and the second
 * would overwrite the first with a different reading of the same audit — the leader's artifact
 * changing under them between one refresh and the next.
 *
 * Never throws. Both call sites are places a leader is finishing or reading their own audit.
 */
export async function ensureAnalystReading(userId: string, runId: string): Promise<void> {
  try {
    const run = await prisma.reclaimAuditRun.findFirst({
      where: { id: runId, userId },
      select: { analystReading: true },
    });
    // `null` means never generated. A stored reading is never regenerated, even if today's guards
    // would refuse it: `buildSummary` re-parses on the way out, so a stale one is dropped at read
    // time rather than silently replaced by a second model call the leader did not ask for.
    if (run === null || run.analystReading !== null) return;

    const [answers, bucketLabels] = await Promise.all([
      readRunAnswers(userId, runId),
      readBucketLabels(userId),
    ]);
    const reading = await runAnalyst(buildAnalystBrief(answers, bucketLabels));
    if (reading === null) return;

    await prisma.reclaimAuditRun.updateMany({
      where: { id: runId, userId, analystReading: { equals: Prisma.DbNull } },
      data: { analystReading: reading as unknown as Prisma.InputJsonValue },
    });
  } catch (error: unknown) {
    logger.warn(
      'Reclaim: the analyst reading could not be generated; the summary stands without it',
      {
        runId,
        error: error instanceof Error ? error.message : String(error),
      }
    );
  }
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
    await claimPhaseMark(userId, runId, phaseKey);
  } catch (error: unknown) {
    logger.warn('Reclaim: could not record the phase mark', {
      runId,
      phaseKey,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Recover a mark that was never written, from the moment the phase was entered.
 *
 * **Why a read path writes.** `recordPhaseMark` is best-effort and a mark is written once and never
 * revised, so the two are a bad pair on their own: a single failed bookkeeping write — or a run that
 * was already in flight when phase marks shipped — leaves that leader drawing the whole audit under
 * every later phase, permanently and silently. That is a leader on phase 2 reading the end of phase 1
 * and being told to move on from a phase they have already left.
 *
 * The journey knows when the phase was entered, and the boundary is defined by that moment, so the
 * mark can be derived rather than remembered. Called from `loadCurrentRunState` only when the current
 * phase has no mark, which means it runs at most once per phase per run and never at all for a run
 * whose transitions recorded normally.
 *
 * `enteredAt` is what makes this safe to run late: the boundary is where the conversation *was* when
 * the phase opened, not where it is now, so a leader who has since spoken in this phase still gets the
 * cut in the right place.
 */
export async function backfillPhaseMark(
  userId: string,
  runId: string,
  phaseKey: string,
  enteredAt: Date
): Promise<string | null> {
  try {
    return await claimPhaseMark(userId, runId, phaseKey, enteredAt);
  } catch (error: unknown) {
    logger.warn('Reclaim: could not backfill the phase mark', {
      runId,
      phaseKey,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Write a phase's mark if it has none, and answer with the id it now carries.
 *
 * `before` bounds the search to messages that already existed at a moment — absent for a mark written
 * as the phase is entered (the moment is now), present for one recovered afterwards.
 *
 * Never overwrites: an existing mark is returned as it stands. Callers wrap this, because neither of
 * them may fail on it.
 */
async function claimPhaseMark(
  userId: string,
  runId: string,
  phaseKey: string,
  before?: Date
): Promise<string | null> {
  const run = await prisma.reclaimAuditRun.findFirst({
    where: { id: runId, userId },
    select: { conversationId: true, phaseMarks: true },
  });
  // No conversation yet means the leader has taken the forms this far and there is nothing to
  // divide. Leaving the mark absent is correct: whatever they say next opens the phase.
  if (run?.conversationId === null || run?.conversationId === undefined) return null;

  const marks = readPhaseMarks(run.phaseMarks);
  const existing = marks[phaseKey];
  if (existing !== undefined) return existing;

  // The mark has to be an id the *surface* can find, not merely the newest row in the table.
  // `loadTranscript` keeps only `user`/`assistant` rows with non-empty text, so a `tool` row or the
  // empty assistant row a silent `record_answers` turn leaves behind would be marked here and then
  // never appear in the list the client searches. `sliceByWindow` reads that miss as an erased
  // message and falls back to the open end — so the phase would draw the whole audit, permanently,
  // because a mark is written once and never revised. Matching the reader's predicate is what makes
  // "an id survives whatever the client decided to render" (the schema's claim) actually true.
  // The `where` does the work — it excludes every `tool` row and every empty assistant row, which
  // is all the tail a long capability round-trip can leave. The small `take` and the trim below
  // cover the one case SQL's `not: ''` misses, a row that is whitespace and nothing else; five rows
  // of headroom is generous for something that should not occur at all.
  const recent = await prisma.aiMessage.findMany({
    where: {
      conversationId: run.conversationId,
      role: { in: ['user', 'assistant'] },
      content: { not: '' },
      ...(before === undefined ? {} : { createdAt: { lt: before } }),
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, content: true },
    take: 5,
  });
  const last = recent.find((message) => message.content.trim().length > 0);
  // Nothing the leader would see yet, so there is no boundary to draw and no mark to write. The
  // phase opens at the start of the transcript, which is where it should open when nothing precedes
  // it.
  if (last === undefined) return null;

  await prisma.reclaimAuditRun.update({
    where: { id: runId },
    data: { phaseMarks: { ...marks, [phaseKey]: last.id } },
  });
  return last.id;
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
  if (run === null) {
    const { phases, currentPhaseKey } = emptyPhaseProgress();
    return { run: null, phases, currentPhaseKey };
  }

  // Destructured away rather than spread: the entry time is here to recover a mark, and nothing on
  // the wire has any use for it.
  const { currentPhaseEnteredAt, ...progress } = await loadPhaseProgress(userId, run.id);
  const phaseMarks = readPhaseMarks(run.phaseMarks);

  // A phase with no mark draws the whole audit under itself, which is the fallback working as
  // designed for a run that has never had a conversation and a silent disaster for one that has. So
  // where the mark is missing and the moment it should have been written is known, derive it now.
  // The first phase is skipped because it is the one phase that correctly has no mark: nothing was
  // entered to reach it, and its part of the conversation starts at the top.
  if (
    run.conversationId !== null &&
    currentPhaseEnteredAt !== null &&
    progress.currentPhaseKey !== FIRST_PHASE_KEY &&
    phaseMarks[progress.currentPhaseKey] === undefined
  ) {
    const recovered = await backfillPhaseMark(
      userId,
      run.id,
      progress.currentPhaseKey,
      currentPhaseEnteredAt
    );
    // Applied to this response rather than left for the next read: the leader is looking at the
    // phase now, and a fix that lands one refresh later is a fix they still had to see the bug for.
    if (recovered !== null) phaseMarks[progress.currentPhaseKey] = recovered;
  }

  return {
    run: {
      id: run.id,
      quarter: run.quarter,
      conversationId: run.conversationId,
      coachOpenings: run.coachOpenings,
      phaseMarks,
    },
    ...progress,
  };
}

/**
 * One audit in the leader's own history.
 *
 * Dates rather than a rendered string: how a date reads is the surface's business, and the two
 * surfaces that show one (the list, the review header) already disagree about how much of it to show.
 */
export interface RunListItem {
  id: string;
  quarter: string | null;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  /** Whether there is a transcript to read back, or only the answers a form recorded. */
  hasConversation: boolean;
  /**
   * Where an unfinished audit has got to. `null` for a finished one, which has no "here" left.
   */
  progress: { phaseKey: string; phaseLabel: string; phaseIndex: number } | null;
}

/**
 * Every audit this leader has run, newest first.
 *
 * **Only the unfinished one costs a journey read**, which is why the loop below is not the N+1 it
 * looks like: `createRun` refuses a second `in_progress` run and a partial-unique index backs that
 * up, so at most one iteration ever takes the branch. A finished audit's phases are all complete by
 * definition, and saying so would tell the list nothing it does not already know from `completedAt`.
 */
export async function listRuns(userId: string): Promise<RunListItem[]> {
  const runs = await prisma.reclaimAuditRun.findMany({
    where: { userId },
    orderBy: { startedAt: 'desc' },
  });

  return Promise.all(
    runs.map(async (run): Promise<RunListItem> => {
      let progress: RunListItem['progress'] = null;
      if (run.status === RUN_STATUS.inProgress) {
        const { phases, currentPhaseKey } = await loadPhaseProgress(userId, run.id);
        const index = phases.findIndex((p) => p.key === currentPhaseKey);
        if (index > -1) {
          progress = {
            phaseKey: currentPhaseKey,
            phaseLabel: phases[index].label,
            phaseIndex: index,
          };
        }
      }
      return {
        id: run.id,
        quarter: run.quarter,
        status: run.status,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        hasConversation: run.conversationId !== null,
        progress,
      };
    })
  );
}

/**
 * One audit, whatever state it is in — the single enriched read the review surface loads on mount.
 *
 * Deliberately **not** `loadCurrentRunState` with an id: that read exists to answer "where is this
 * leader now", so it filters on `in_progress` and returns `null` for everything that is finished,
 * which is exactly the audit somebody coming back wants to see. This one is keyed on the run and
 * carries `status` plus both dates, so the surface can tell a finished audit from an open one and
 * refuse to pretend the finished one is still live.
 *
 * Ownership is `loadOwnedRun`, so a run id belonging to somebody else is a 404 and not a read.
 */
export interface RunState {
  run: {
    id: string;
    quarter: string | null;
    status: string;
    startedAt: Date;
    completedAt: Date | null;
    conversationId: string | null;
    coachOpenings: string[];
    phaseMarks: PhaseMarks;
  };
  phases: PhaseView[];
  currentPhaseKey: string;
}

export async function loadRunState(userId: string, runId: string): Promise<RunState> {
  const run = await loadOwnedRun(runId, userId);
  // Same reason as `loadCurrentRunState`: the entry time is not part of this response. No backfill
  // here — this read serves a finished audit being read back, where a missing mark widens a phase's
  // window rather than emptying it, and where nothing is being written to any more.
  const { currentPhaseEnteredAt: _enteredAt, ...progress } = await loadPhaseProgress(
    userId,
    run.id
  );
  return {
    run: {
      id: run.id,
      quarter: run.quarter,
      status: run.status,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      conversationId: run.conversationId,
      coachOpenings: run.coachOpenings,
      phaseMarks: readPhaseMarks(run.phaseMarks),
    },
    ...progress,
  };
}
