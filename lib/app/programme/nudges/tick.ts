/**
 * The nudge tick and the opt-out (F9 t-3).
 *
 * The thin shell around `select.ts`: gather candidates, let the pure rules decide, send to the ones
 * that are due, record what was sent. Everything interesting about *who* gets a nudge lives next
 * door, where it can be stated exactly in a test.
 *
 * ## Why this is a leaf route rather than a scheduled job
 *
 * Sunrise's scheduler (`lib/orchestration/scheduling/scheduler.ts`) processes **workflow** schedules
 * only — it walks `AiWorkflowSchedule` rows and starts executions. There is no registration for "run
 * this leaf function on a cron", and modelling "email the leaders whose last audit finished about
 * ninety days ago" as a workflow would be a heavy indirection around three queries. So the leaf
 * exposes a tick route driven by the same external cron the platform already documents for its own
 * (`POST /api/v1/admin/orchestration/schedules/tick` says "designed to be called every ~60 seconds by
 * an external cron job"). Filed as sunrise#469.
 */

import { prisma } from '@/lib/db/client';
import { logger } from '@/lib/logging';
import { sendEmail } from '@/lib/email/send';
// One definition of the app's own origin, shared with F15's completion email. See `urls.ts`.
import { appUrl } from '@/lib/app/programme/urls';
import QuarterlyNudgeEmail from '@/components/app/emails/quarterly-nudge';
import { decideNudges, type NudgeCandidate } from '@/lib/app/programme/nudges/select';
import { readReclaimNudgeConfig } from '@/lib/app/programme/config';
import { isUniqueViolation } from '@/lib/app/programme/access/grants';

/** 244 bits of randomness, the same shape as the F7 share token. */
function mintToken(): string {
  return (globalThis.crypto.randomUUID() + globalThis.crypto.randomUUID()).replace(/-/g, '');
}

export interface NudgeTickResult {
  considered: number;
  sent: number;
  /** Leaders whose claim could not be written. Surfaced so a silent partial run is visible. */
  failed: number;
  /** Why the rest were skipped, counted by reason — operator diagnostics, never leader-facing. */
  skipped: Record<string, number>;
}

/**
 * Claim the right to nudge this leader about this audit, returning their unsubscribe token — or
 * `null` when somebody else already claimed it.
 *
 * `updateMany` guarded on `lastNudgedForRunId: { not: runId }` is the atomic part: two concurrent
 * ticks race on the same row and exactly one gets `count === 1`. The `create` path handles a leader
 * who has never been nudged, and a unique-violation there means a concurrent tick created it first,
 * which is also "somebody else claimed it".
 */
async function claimNudge(userId: string, runId: string, now: Date): Promise<string | null> {
  const existing = await prisma.reclaimNudge.findUnique({
    where: { userId },
    select: { token: true },
  });

  if (existing === null) {
    try {
      const created = await prisma.reclaimNudge.create({
        data: { userId, token: mintToken(), lastNudgedForRunId: runId, lastNudgedAt: now },
        select: { token: true },
      });
      return created.token;
    } catch (error: unknown) {
      // Only a unique violation means "a concurrent tick created it first" — the winner is sending
      // and we are not. Anything else is a real failure and must surface: swallowing every error
      // here would turn a database outage into a silent no-op that reports a clean run.
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  }

  const claimed = await prisma.reclaimNudge.updateMany({
    where: { userId, lastNudgedForRunId: { not: runId } },
    data: { lastNudgedForRunId: runId, lastNudgedAt: now },
  });
  return claimed.count === 1 ? existing.token : null;
}

/**
 * Everyone with a completed audit, plus the state the rules need. Four batched queries; the cohort is
 * the leaders who have finished at least one audit, which is small by construction at v1.
 */
async function gatherCandidates(): Promise<NudgeCandidate[]> {
  const completed = await prisma.reclaimAuditRun.findMany({
    where: { status: 'complete' },
    orderBy: { completedAt: 'desc' },
    select: { id: true, userId: true, completedAt: true, startedAt: true },
  });
  if (completed.length === 0) return [];

  // Most recent completed audit per leader — the list is already newest-first, so the first wins.
  const lastCompleted = new Map<string, { runId: string; at: Date }>();
  for (const run of completed) {
    if (!lastCompleted.has(run.userId)) {
      lastCompleted.set(run.userId, { runId: run.id, at: run.completedAt ?? run.startedAt });
    }
  }

  const userIds = [...lastCompleted.keys()];
  const [users, inProgress, nudges] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true, name: true },
    }),
    prisma.reclaimAuditRun.findMany({
      where: { userId: { in: userIds }, status: 'in_progress' },
      select: { userId: true },
      distinct: ['userId'],
    }),
    prisma.reclaimNudge.findMany({ where: { userId: { in: userIds } } }),
  ]);

  const busy = new Set(inProgress.map((r) => r.userId));
  const nudgeByUser = new Map(nudges.map((n) => [n.userId, n]));

  return users.flatMap((user) => {
    const last = lastCompleted.get(user.id);
    if (last === undefined) return [];
    const nudge = nudgeByUser.get(user.id);
    return [
      {
        userId: user.id,
        email: user.email,
        name: user.name,
        lastCompletedRunId: last.runId,
        lastCompletedAt: last.at,
        hasRunInProgress: busy.has(user.id),
        optedOut: nudge?.optedOutAt != null,
        lastNudgedForRunId: nudge?.lastNudgedForRunId ?? null,
      } satisfies NudgeCandidate,
    ];
  });
}

/**
 * Run the tick: claim, send, count.
 *
 * **The claim is a conditional write, not a read-then-write.** `decideNudges` reads state and decides
 * in memory, which is fine for the cheap exclusions — but "at most one per audit cycle" cannot rest on
 * that alone: two overlapping cron ticks would both read the old `lastNudgedForRunId`, both decide to
 * send, and both write. So the actual claim is an `updateMany` guarded on the row NOT already naming
 * this audit, and the send happens only when it reports `count === 1`. Exactly the shape
 * `linkRunConversation` uses in the run service, for exactly the same reason.
 *
 * **The claim is written before the send is attempted**, deliberately: if the mail provider fails, the
 * leader stays marked as nudged for this audit. The failure to avoid is a retry loop that emails
 * somebody four times, not a leader who misses one gentle reminder. "At most one" is the promise;
 * "at least one" is not.
 *
 * **Each candidate is isolated.** A database blip on one leader must not abandon the rest of the
 * cohort mid-loop and take the summary log with it, which is a bad way to find out about it — an
 * operator running a cron gets a 500 and no diagnostics.
 */
export async function runNudgeTick(now: Date = new Date()): Promise<NudgeTickResult> {
  const [candidates, config] = await Promise.all([gatherCandidates(), readReclaimNudgeConfig()]);
  const decisions = decideNudges(candidates, now, config.nudgeAfterDays, config.nudgeUntilDays);

  const skipped: Record<string, number> = {};
  let sent = 0;
  let failed = 0;

  for (const decision of decisions) {
    if (!decision.send) {
      skipped[decision.reason] = (skipped[decision.reason] ?? 0) + 1;
      continue;
    }

    const { candidate } = decision;
    try {
      const token = await claimNudge(candidate.userId, candidate.lastCompletedRunId, now);
      if (token === null) {
        // Another tick got there first. Not an error — it is the guarantee working.
        skipped['already_nudged_for_this_audit'] =
          (skipped['already_nudged_for_this_audit'] ?? 0) + 1;
        continue;
      }

      const base = appUrl();
      const result = await sendEmail({
        to: candidate.email,
        subject: 'Your last time audit was about three months ago',
        react: QuarterlyNudgeEmail({
          firstName: candidate.name?.split(' ')[0] ?? null,
          programmeUrl: `${base}/programme`,
          unsubscribeUrl: `${base}/nudges/off/${token}`,
        }),
      }).catch((error: unknown) => {
        logger.warn('Reclaim: nudge email failed', {
          userId: candidate.userId,
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      });

      if (result?.success === true) sent += 1;
    } catch (error: unknown) {
      // One leader's failure is one leader's failure. Carry on with the cohort and let the summary
      // below still reach the operator.
      failed += 1;
      logger.warn('Reclaim: could not claim a nudge', {
        userId: candidate.userId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  logger.info('Reclaim: nudge tick complete', {
    considered: candidates.length,
    sent,
    failed,
    skipped,
  });
  return { considered: candidates.length, sent, failed, skipped };
}

/**
 * Turn nudges off from an emailed link. Idempotent — a leader who clicks twice, or whose mail client
 * pre-fetches the link, gets the same answer and never an error.
 *
 * Returns false only for a token nobody holds.
 */
export async function optOutByToken(token: string): Promise<boolean> {
  const updated = await prisma.reclaimNudge.updateMany({
    where: { token, optedOutAt: null },
    data: { optedOutAt: new Date() },
  });
  if (updated.count > 0) return true;

  // Already opted out is a success, not a failure — the leader's intent is satisfied either way.
  const existing = await prisma.reclaimNudge.findUnique({ where: { token }, select: { id: true } });
  return existing !== null;
}
