/**
 * One leader's complete record, as data (F10 t-5) — the operator half of a subject-access request.
 *
 * Sunrise ships **no data-subject export at all** (checked: the only exports under `app/api/v1` are
 * orchestration admin backups), so this is genuinely leaf work rather than a wrapper over a platform
 * capability. Filed as a fork-perspective note in `daybreak-asks.md`: any fork holding personal data
 * hits the same wall, and the answer belongs upstream eventually.
 *
 * **Completeness is the whole point.** An export that quietly omits a table is worse than no export,
 * because it looks like an answer. So this reads every place a leader's data lives — the eight
 * `app_reclaim_*` tables plus `framework_slot_value`, which is where the audit answers actually are —
 * and `EXPORTED_SOURCES` names them so a future table added without a matching export line is a
 * visible omission rather than an invisible one.
 *
 * It includes the `sensitive` prose. That is correct for a subject-access request — it is the data
 * subject's own words and they are entitled to all of it — and it is why the route is admin-guarded
 * and logged by subject.
 */

import { prisma } from '@/lib/db/client';
import { getSlotHeads } from '@/lib/framework/data-slots/values';

/**
 * Every store this export covers. Kept as a list rather than a comment so the test can assert it
 * matches the tables the schema actually defines — the check that turns "we think it is complete"
 * into "adding a table breaks the build".
 */
export const EXPORTED_SOURCES = [
  'app_reclaim_audit_run',
  'app_reclaim_grant',
  'app_reclaim_invite',
  'app_reclaim_consent',
  'app_reclaim_bucket_label',
  'app_reclaim_share',
  'app_reclaim_report_share',
  'app_reclaim_feedback',
  'app_reclaim_nudge',
  'app_reclaim_invite_link',
  'framework_slot_value',
] as const;

export interface ClientExport {
  exportedAt: string;
  sources: readonly string[];
  account: { id: string; name: string | null; email: string; createdAt: string };
  runs: unknown[];
  grants: unknown[];
  invites: { redeemed: unknown[]; sent: unknown[] };
  consents: unknown[];
  bucketLabels: unknown[];
  shares: unknown[];
  coachShares: unknown[];
  feedback: unknown[];
  /** Their reminder preference — opt-out state and when they were last nudged (F9 t-3). */
  nudge: unknown;
  /**
   * Group invite links this subject minted (F11). Empty for a leader — only an admin creates these —
   * but an admin is a data subject too, and "which doors did I open" is a fact about them.
   */
  inviteLinks: unknown[];
  /** Every current slot value — the audit answers, including the sensitive prose. */
  answers: Array<{
    slotSlug: string;
    value: string | null;
    valueJson: unknown;
    capturedAt: string;
  }>;
}

/** Build the export, or `null` when no such account exists. */
export async function buildClientExport(userId: string): Promise<ClientExport | null> {
  const account = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, createdAt: true },
  });
  if (account === null) return null;

  const [
    runs,
    grants,
    redeemed,
    sent,
    consents,
    bucketLabels,
    shares,
    coachShares,
    feedback,
    nudge,
    inviteLinks,
    heads,
  ] = await Promise.all([
    // Every field of the run **except `conversationId`** (F17).
    //
    // This used to be a bare `findMany` with no `select`, which handed over the id of the leader's
    // conversation — and core ships `/admin/orchestration/conversations/[id]`, which renders any
    // conversation to an ADMIN. So the transcript was reachable to anyone who read an export, while
    // the product offered no way for a leader to say whether it should be. This app is no longer
    // the thing that supplies the key; where a leader has consented, `admin/transcript.ts` is the
    // way in, and where they have not there is none.
    //
    // Listed explicitly rather than by omission, so a column added later is absent from the export
    // until somebody decides it belongs there. That is the right default for a file that leaves the
    // system: `export.test.ts` asserts the source list matches the schema, and this is the one place
    // a field can be withheld on purpose.
    prisma.reclaimAuditRun.findMany({
      where: { userId },
      orderBy: { startedAt: 'asc' },
      select: {
        id: true,
        status: true,
        quarter: true,
        coachOpenings: true,
        phaseMarks: true,
        analystReading: true,
        startedAt: true,
        completedAt: true,
        abandonedAt: true,
        updatedAt: true,
      },
    }),
    prisma.reclaimGrant.findMany({ where: { userId } }),
    prisma.reclaimInvite.findMany({ where: { redeemedByUserId: userId } }),
    prisma.reclaimInvite.findMany({ where: { invitedByUserId: userId } }),
    prisma.reclaimConsent.findMany({ where: { userId } }),
    prisma.reclaimBucketLabel.findMany({ where: { userId } }),
    prisma.reclaimShare.findMany({ where: { userId } }),
    prisma.reclaimReportShare.findMany({ where: { userId } }),
    prisma.reclaimFeedback.findMany({ where: { userId } }),
    // Redact the unsubscribe token. The export is admin-guarded and the token's only capability
    // (stop that person's reminders) is strictly less than what an admin already has — but an export
    // is a file that leaves the system, and a live capability token has no business travelling in
    // one. The leader's actual preference is what the subject-access request is for.
    prisma.reclaimNudge.findUnique({
      where: { userId },
      select: { optedOutAt: true, lastNudgedAt: true, lastNudgedForRunId: true, createdAt: true },
    }),
    // Links this subject minted. `token` is deliberately NOT selected, for the reason the nudge
    // token is redacted just above, and more sharply: a link token is a live capability that issues
    // invitations, and an export is a file that leaves the system. The label, the bounds and the
    // usage are the facts about the subject; the credential is not.
    prisma.reclaimInviteLink.findMany({
      where: { createdByUserId: userId },
      select: {
        id: true,
        label: true,
        tier: true,
        maxClaims: true,
        claimCount: true,
        expiresAt: true,
        revokedAt: true,
        createdAt: true,
      },
    }),
    // Heads, not history: the subject's data as it stands. Superseded versions are an artefact of
    // how the store works rather than something the leader ever said twice on purpose.
    getSlotHeads(userId),
  ]);

  return {
    // Stamped by the caller's clock, which is honest for an export: it is a snapshot, and when it was
    // taken is part of what it means.
    exportedAt: new Date().toISOString(),
    sources: EXPORTED_SOURCES,
    account: { ...account, createdAt: account.createdAt.toISOString() },
    runs,
    grants,
    invites: { redeemed, sent },
    consents,
    bucketLabels,
    shares,
    coachShares,
    feedback,
    nudge,
    inviteLinks,
    answers: heads.map((h) => ({
      slotSlug: h.slotSlug,
      value: h.value,
      valueJson: h.valueJson,
      capturedAt: h.capturedAt.toISOString(),
    })),
  };
}
