/**
 * Smoke: GDPR erasure reaches every `app_reclaim_*` cascade (F4 t-1).
 *
 * The mitigation for landing the whole leaf schema at once (scope decision A, `ryw-shell.md`): F4
 * gives behaviour to only `audit_run`/`consent`, so the other six tables' hand-written `ON DELETE`
 * policies would otherwise sit unexercised until F10 t-5. This proves all eight **as they land** —
 * seed one row per table under a throwaway user, `eraseUser`, and assert the CASCADE tables emptied
 * while the retained `consent`/`invite` rows survive with their user reference nulled.
 *
 * A leaf-owned smoke (not an edit to the core `scripts/smoke/erasure.ts`, and not `smoke:reclaim`
 * which drives the seeded service account and must never erase it). Real Postgres.
 *
 * Run:  npm run smoke:reclaim-erasure
 */

import { prisma } from '@/lib/db/client';
import { eraseUser } from '@/lib/privacy/erase-user';
import { saveAnswer } from '@/lib/app/programme/slots/write';

const PREFIX = 'smoke-reclaim-erasure';

function fail(message: string): never {
  throw new Error(message);
}

async function main(): Promise<void> {
  // Distinct-enough suffix without Date/Math.random (both fine here, but keep it simple).
  const subject = await prisma.user.create({
    data: {
      name: `${PREFIX} subject`,
      email: `${PREFIX}-${process.pid}@example.com`,
      role: 'USER',
    },
  });
  const uid = subject.id;
  console.log(`[1] throwaway subject ${uid}`);

  // ── 2. Seed one row per app_reclaim_* table under the subject ─────────
  const run = await prisma.reclaimAuditRun.create({ data: { userId: uid, status: 'complete' } });
  await prisma.reclaimGrant.create({ data: { userId: uid, tier: 'free' } });
  await prisma.reclaimBucketLabel.create({
    data: { userId: uid, bucketSlug: 'strategic', label: 'Strategy' },
  });
  await prisma.reclaimShare.create({
    data: { userId: uid, auditRunId: run.id, token: `${PREFIX}-share-${process.pid}` },
  });
  await prisma.reclaimReportShare.create({
    data: { userId: uid, auditRunId: run.id, transcriptConsent: true },
  });
  await prisma.reclaimFeedback.create({
    data: { userId: uid, text: 'Useful.', quoteConsent: true },
  });
  const consent = await prisma.reclaimConsent.create({
    data: { userId: uid, policyVersion: '2026-07-01', marketingOptIn: true },
  });
  // F8 t-1 added a SECOND user reference to this row (`invitedByUserId`, the referrer). Both must be
  // nulled on erasure, not just the one F4 knew about — an invite this user *sent* outlives them too.
  const invite = await prisma.reclaimInvite.create({
    data: {
      email: subject.email,
      token: `${PREFIX}-invite-${process.pid}`,
      redeemedByUserId: uid,
      invitedByUserId: uid,
    },
  });
  // F9 t-3: the nudge preference. CASCADE, unlike consent — a preference about being emailed
  // evidences nothing once the person is gone, and a retained row keyed by an unsubscribe token
  // could be matched back to them.
  await prisma.reclaimNudge.create({
    data: { userId: uid, token: `${PREFIX}-nudge-${process.pid}`, lastNudgedForRunId: run.id },
  });

  // F10 t-5: the audit ANSWERS. Everything above is bookkeeping about a leader; `framework_slot_value`
  // is what they actually said — every hour, every reflection, the prose about what keeps them up at
  // night. Its `ON DELETE CASCADE` is hand-written too (`framework-data-slots.prisma`), and until now
  // no smoke had ever proven it fires, so the largest store of personal data in the product was the
  // one store nothing checked. Written through `saveAnswer` on purpose (I3) — the smoke should
  // exercise the real write path, not insert rows the app would never have created that way.
  await saveAnswer({
    userId: uid,
    runId: run.id,
    slotSlug: 'reclaim_setup_keeping_me_up',
    value: 'Smoke subject: a sensitive answer that must not survive erasure.',
    sourceType: 'direct',
  });
  await saveAnswer({
    userId: uid,
    runId: run.id,
    slotSlug: 'reclaim_current_hours__deep_work',
    value: '6',
    valueJson: 6,
    sourceType: 'direct',
  });
  const slotsBefore = await prisma.slotValue.count({ where: { userId: uid } });
  if (slotsBefore === 0)
    fail('setup failed: no slot values were written, so erasure proves nothing');

  console.log(
    `[2] seeded one row in each of the nine app_reclaim_* tables + ${slotsBefore} slot values`
  );

  let receiptId: string | undefined;
  try {
    // ── 3. Erase ────────────────────────────────────────────────────────
    const result = await eraseUser({
      userId: uid,
      userEmail: subject.email,
      actorUserId: uid,
      reason: 'self_service',
    });
    receiptId = result.receiptId;

    // ── 4. CASCADE tables must be empty for this user ─────────────────────
    const cascadeCounts = {
      audit_run: await prisma.reclaimAuditRun.count({ where: { userId: uid } }),
      grant: await prisma.reclaimGrant.count({ where: { userId: uid } }),
      bucket_label: await prisma.reclaimBucketLabel.count({ where: { userId: uid } }),
      share: await prisma.reclaimShare.count({ where: { userId: uid } }),
      report_share: await prisma.reclaimReportShare.count({ where: { userId: uid } }),
      feedback: await prisma.reclaimFeedback.count({ where: { userId: uid } }),
      nudge: await prisma.reclaimNudge.count({ where: { userId: uid } }),
    };
    for (const [table, count] of Object.entries(cascadeCounts)) {
      if (count !== 0)
        fail(`CASCADE failed: ${count} app_reclaim_${table} row(s) survived erasure`);
    }
    console.log('[3] all seven CASCADE tables emptied');

    // ── 4b. The answers themselves (F10 t-5) ─────────────────────────────
    const slotsAfter = await prisma.slotValue.count({ where: { userId: uid } });
    if (slotsAfter !== 0) {
      fail(
        `CASCADE failed: ${slotsAfter} framework_slot_value row(s) survived erasure — the audit answers are still there`
      );
    }
    console.log(`[3b] all ${slotsBefore} slot values erased (framework_slot_value)`);

    // ── 5. Retained tables survive with a nulled user reference (SET NULL) ─
    const consentAfter = await prisma.reclaimConsent.findUnique({ where: { id: consent.id } });
    if (!consentAfter) fail('SET NULL failed: consent row was deleted, not retained');
    if (consentAfter.userId !== null)
      fail(`SET NULL failed: consent.userId is "${consentAfter.userId}", expected null`);

    const inviteAfter = await prisma.reclaimInvite.findUnique({ where: { id: invite.id } });
    if (!inviteAfter) fail('SET NULL failed: invite row was deleted, not retained');
    if (inviteAfter.redeemedByUserId !== null) {
      fail(
        `SET NULL failed: invite.redeemedByUserId is "${inviteAfter.redeemedByUserId}", expected null`
      );
    }
    if (inviteAfter.invitedByUserId !== null) {
      fail(
        `SET NULL failed: invite.invitedByUserId is "${inviteAfter.invitedByUserId}", expected null (F8 t-1)`
      );
    }
    console.log('[4] consent + invite retained, BOTH user references nulled');
  } finally {
    // ── 6. Clean up the retained rows + the receipt (scoped to this run) ──
    await prisma.reclaimConsent.deleteMany({ where: { id: consent.id } });
    await prisma.reclaimInvite.deleteMany({ where: { id: invite.id } });
    if (receiptId) {
      await prisma.dataErasureReceipt
        .deleteMany({ where: { id: receiptId } })
        .catch(() => undefined);
    }
    await prisma.$disconnect();
  }

  console.log(
    '\n✓ smoke:reclaim-erasure passed — every app_reclaim_* cascade AND the audit answers verified'
  );
}

main().catch(async (err) => {
  console.error('\n✗ smoke:reclaim-erasure failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
