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
import { previewUserIdSet } from '@/lib/app/programme/preview/accounts';

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
  /**
   * Whether this leader also let the conversation be read, not only the result (F17).
   *
   * Carried on the row so the inbox can say which is which. Without it an operator would have to
   * open each one to find out, and the ones that refuse would read as broken rather than as a
   * choice somebody made.
   */
  transcriptConsent: boolean;
  /**
   * Whether this came from a test account (F19).
   *
   * **Badged, not hidden.** A fabricated share must not read as a leader waiting for a reply — but
   * removing it would mean an operator could not see the test accounts she made in order to remove
   * them, and a share that vanished from this list while sitting in the clients table would be its own
   * small mystery. So it stays, labelled, and the counting screens (`readAggregate`, `readMeasures`)
   * are where the exclusion lives instead.
   */
  isPreview: boolean;
}

/** Everything shared with the coach, newest first. Four batched queries; nothing per-row. */
export async function listSharedResults(): Promise<SharedResult[]> {
  const shares = await prisma.reclaimReportShare.findMany({ orderBy: { createdAt: 'desc' } });
  if (shares.length === 0) return [];

  const userIds = [...new Set(shares.map((s) => s.userId))];
  const runIds = [...new Set(shares.map((s) => s.auditRunId))];

  const [users, runs, feedback, previewIds] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true },
    }),
    prisma.reclaimAuditRun.findMany({
      where: { id: { in: runIds } },
      select: { id: true, quarter: true },
    }),
    prisma.reclaimFeedback.findMany({ where: { auditRunId: { in: runIds } } }),
    previewUserIdSet(),
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
        transcriptConsent: share.transcriptConsent,
        isPreview: previewIds.has(share.userId),
      } satisfies SharedResult,
    ];
  });
}
