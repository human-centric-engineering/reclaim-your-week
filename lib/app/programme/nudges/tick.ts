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
import { env } from '@/lib/env';
import { sendEmail } from '@/lib/email/send';
import QuarterlyNudgeEmail from '@/components/app/emails/quarterly-nudge';
import {
  decideNudges,
  NUDGE_AFTER_DAYS,
  type NudgeCandidate,
} from '@/lib/app/programme/nudges/select';

/** 244 bits of randomness, the same shape as the F7 share token. */
function mintToken(): string {
  return (globalThis.crypto.randomUUID() + globalThis.crypto.randomUUID()).replace(/-/g, '');
}

function appUrl(): string {
  return env.NEXT_PUBLIC_APP_URL ?? process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';
}

export interface NudgeTickResult {
  considered: number;
  sent: number;
  /** Why the rest were skipped, counted by reason — operator diagnostics, never leader-facing. */
  skipped: Record<string, number>;
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
 * Run the tick: decide, send, record.
 *
 * **The record is written before the send is awaited's outcome is known, and deliberately so.** If
 * the mail provider fails, the leader has still been marked as nudged for this audit — because the
 * failure mode to avoid is a retry loop that emails somebody four times, not a leader who misses one
 * gentle reminder. "At most one" is the promise; "at least one" is not.
 */
export async function runNudgeTick(now: Date = new Date()): Promise<NudgeTickResult> {
  const candidates = await gatherCandidates();
  const decisions = decideNudges(candidates, now, NUDGE_AFTER_DAYS);

  const skipped: Record<string, number> = {};
  let sent = 0;

  for (const decision of decisions) {
    if (!decision.send) {
      skipped[decision.reason] = (skipped[decision.reason] ?? 0) + 1;
      continue;
    }

    const { candidate } = decision;
    // Claim the send first. `upsert` on the unique `userId` mints the token on first contact and
    // stamps the audit this nudge is about, which is what makes a re-run a no-op.
    const nudge = await prisma.reclaimNudge.upsert({
      where: { userId: candidate.userId },
      create: {
        userId: candidate.userId,
        token: mintToken(),
        lastNudgedForRunId: candidate.lastCompletedRunId,
        lastNudgedAt: now,
      },
      update: { lastNudgedForRunId: candidate.lastCompletedRunId, lastNudgedAt: now },
      select: { token: true },
    });

    const base = appUrl();
    const result = await sendEmail({
      to: candidate.email,
      subject: 'Your last time audit was about three months ago',
      react: QuarterlyNudgeEmail({
        firstName: candidate.name?.split(' ')[0] ?? null,
        programmeUrl: `${base}/programme`,
        unsubscribeUrl: `${base}/nudges/off/${nudge.token}`,
      }),
    }).catch((error: unknown) => {
      logger.warn('Reclaim: nudge email failed', {
        userId: candidate.userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    });

    if (result?.success === true) sent += 1;
  }

  logger.info('Reclaim: nudge tick complete', {
    considered: candidates.length,
    sent,
    skipped,
  });
  return { considered: candidates.length, sent, skipped };
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
