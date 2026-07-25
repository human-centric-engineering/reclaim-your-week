/**
 * The shared-results inbox (F10 t-3) — results a leader chose to send to Rashmir.
 *
 * `ReclaimReportShare` is written only when a leader ticks "share this with Rashmir" at the Phase 6
 * close (F7 t-4). Sharing is invited, never required, and this list is therefore a list of people who
 * opted in — which is why it can show a name at all, unlike the aggregate next to it.
 *
 * The summary artifact itself is **not** rebuilt here. F7's `buildSummary` is shareable-safe by
 * construction (it reads only §10 fields and never the sensitive-prose slugs, asserted in
 * `summary.test.ts`), so the detail view calls that. A second summary shape assembled for the admin
 * side would be a second place for a sensitive slug to leak into, and it would drift.
 */

import { prisma } from '@/lib/db/client';

export interface SharedResult {
  userId: string;
  name: string | null;
  email: string;
  auditRunId: string;
  sharedAt: string;
  quarter: string | null;
  /**
   * The one-line feedback, when they left it. `quoteConsent` is its **own** fact, separate from
   * having shared (Brief §3) — sharing a result with your coach is not permission to quote you.
   */
  feedback: { text: string; quoteConsent: boolean } | null;
}

/** Everything shared with the coach, newest first. Four batched queries; nothing per-row. */
export async function listSharedResults(): Promise<SharedResult[]> {
  const shares = await prisma.reclaimReportShare.findMany({ orderBy: { createdAt: 'desc' } });
  if (shares.length === 0) return [];

  const userIds = [...new Set(shares.map((s) => s.userId))];
  const runIds = [...new Set(shares.map((s) => s.auditRunId))];

  const [users, runs, feedback] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true },
    }),
    prisma.reclaimAuditRun.findMany({
      where: { id: { in: runIds } },
      select: { id: true, quarter: true },
    }),
    prisma.reclaimFeedback.findMany({ where: { auditRunId: { in: runIds } } }),
  ]);

  const userById = new Map(users.map((u) => [u.id, u]));
  const quarterByRun = new Map(runs.map((r) => [r.id, r.quarter]));
  const feedbackByRun = new Map(
    feedback.filter((f) => f.auditRunId !== null).map((f) => [f.auditRunId, f])
  );

  return shares.flatMap((share) => {
    const user = userById.get(share.userId);
    // A share whose user is gone is a share by nobody: erasure cascades this row away, so this is
    // defensive rather than expected — but rendering "unknown leader shared a result" would be worse
    // than rendering nothing.
    if (user === undefined) return [];

    const fb = feedbackByRun.get(share.auditRunId);
    return [
      {
        userId: share.userId,
        name: user.name,
        email: user.email,
        auditRunId: share.auditRunId,
        sharedAt: share.createdAt.toISOString(),
        quarter: quarterByRun.get(share.auditRunId) ?? null,
        feedback: fb === undefined ? null : { text: fb.text, quoteConsent: fb.quoteConsent },
      } satisfies SharedResult,
    ];
  });
}
