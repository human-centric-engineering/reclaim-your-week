/**
 * Smoke: the access path end to end against real Postgres (F8 t-2/t-3).
 *
 * The unit tests mock Prisma, so they prove the *logic* and nothing about the objects this feature
 * actually leans on: the new unique indexes, the hand-written `ON DELETE SET NULL` on the referral FK,
 * and the deterministic primary keys that make every mint idempotent under a real constraint rather
 * than a mocked one. That is what this script is for.
 *
 * What it asserts, in order:
 *   1. an uninvited account is REFUSED (the door F6 left open is shut);
 *   2. an invite resolves into a tiered grant on first run, exactly once — including under a genuine
 *      concurrent double-start (`Promise.all`), which is where F6's TOCTOU actually bit;
 *   3. the client tier is bounded by its window, not its audit count;
 *   4. a referral unlock fires on the referred leader's FIRST COMPLETION, never on signup;
 *   5. erasure de-attributes the invite (`SET NULL`) and cascades the grant.
 *
 * Throwaway users, erased at the end. Real Postgres.
 *
 * Run:  npm run smoke:reclaim-access
 */

import { prisma } from '@/lib/db/client';
import { eraseUser } from '@/lib/privacy/erase-user';
import { assertEntitled, consumeAudit } from '@/lib/app/programme/runs/entitlement';
import { redeemInviteForUser } from '@/lib/app/programme/access/grants';
import { grantReferralUnlock } from '@/lib/app/programme/access/referrals';
import { hashInviteToken } from '@/lib/app/programme/access/invites';
import { recordConsent } from '@/lib/app/programme/access/consent';
import { readReclaimAccessConfig } from '@/lib/app/programme/config';

const PREFIX = 'smoke-reclaim-access';

function fail(message: string): never {
  throw new Error(message);
}

async function makeUser(label: string): Promise<{ id: string; email: string }> {
  const email = `${PREFIX}-${label}-${process.pid}@example.com`;
  const user = await prisma.user.create({
    data: { name: `${PREFIX} ${label}`, email, role: 'USER' },
  });
  return { id: user.id, email };
}

async function main(): Promise<void> {
  const config = await readReclaimAccessConfig();
  const invitee = await makeUser('invitee');
  const referrer = await makeUser('referrer');
  const referred = await makeUser('referred');
  const createdInviteIds: string[] = [];
  /** Users already erased by an assertion step, so teardown does not try again (and log a failure). */
  const erased = new Set<string>();

  try {
    // ── 0. Consent stands in front of entitlement (F8 t-4) ────────────────
    // Assert it first, then satisfy it, so the rest of the script is about access rather than terms.
    let blockedOnConsent = false;
    await assertEntitled(invitee.id).catch((e: unknown) => {
      blockedOnConsent = e instanceof Error && e.name === 'ConsentRequiredError';
    });
    if (!blockedOnConsent) fail('a run was allowed without a recorded consent (F8 t-4)');
    for (const user of [invitee, referrer, referred]) {
      await recordConsent(user.id, config.policyVersion, false);
    }
    console.log('[0] run refused without consent; consent recorded for the test subjects');

    // ── 1. An uninvited account is refused ────────────────────────────────
    let refused = false;
    await assertEntitled(invitee.id).catch(() => (refused = true));
    if (!refused) fail('an account with no invite was allowed to start an audit');
    console.log('[1] uninvited account refused at the gate (I14)');

    // ── 2. A client invite resolves once, even under a concurrent race ────
    // `createdAt` is backdated to just before the account: a genuine acceptance creates the account at
    // accept time, so the invite always predates the user. The guard added after `/security-review`
    // enforces that ordering (an account that predates the invite cannot be its recipient).
    const clientInvite = await prisma.reclaimInvite.create({
      data: {
        email: invitee.email,
        token: hashInviteToken(`${PREFIX}-client-${process.pid}`),
        tier: 'client',
        createdAt: new Date(Date.now() - 60_000),
      },
    });
    createdInviteIds.push(clientInvite.id);

    // Two concurrent first-runs — the shape that minted two free grants in F6.
    await Promise.all([
      assertEntitled(invitee.id).catch(() => undefined),
      assertEntitled(invitee.id).catch(() => undefined),
    ]);

    const grants = await prisma.reclaimGrant.findMany({ where: { userId: invitee.id } });
    if (grants.length !== 1)
      fail(`concurrent first-runs minted ${grants.length} grants, expected 1`);
    if (grants[0]?.tier !== 'client') fail(`grant tier is "${grants[0]?.tier}", expected client`);
    if (grants[0]?.id !== `invite_${clientInvite.id}`)
      fail('grant is not keyed on the invite, so the mint is not idempotent');
    if (grants[0]?.mustStartBy === null) fail('client grant has no start-by deadline (Brief §8)');

    const redeemed = await prisma.reclaimInvite.findUnique({ where: { id: clientInvite.id } });
    if (redeemed?.redeemedByUserId !== invitee.id)
      fail('invite was not marked redeemed by the user');
    console.log('[2] client invite → exactly one grant under a concurrent double-start');

    // A second resolution attempt finds no live invite and mints nothing further.
    if ((await redeemInviteForUser(invitee.id, invitee.email, config)) !== null)
      fail('a redeemed invite was resolved a second time');

    // ── 2b. An account that PREDATES an invite cannot claim it ────────────
    // The email-change hijack: `PATCH /users/me` lets any account take an unused address, so matching
    // an invite on email alone would hand a client tier to whoever asked first.
    const hijackInvite = await prisma.reclaimInvite.create({
      data: {
        email: referrer.email,
        token: hashInviteToken(`${PREFIX}-hijack-${process.pid}`),
        tier: 'client',
        createdAt: new Date(Date.now() + 60_000), // issued AFTER the account existed
      },
    });
    createdInviteIds.push(hijackInvite.id);
    if ((await redeemInviteForUser(referrer.id, referrer.email, config)) !== null)
      fail('an account that predates an invite was allowed to claim it');
    if ((await prisma.reclaimGrant.count({ where: { userId: referrer.id } })) !== 0)
      fail('the predating-account guard minted a grant anyway');
    await prisma.reclaimInvite.update({
      where: { id: hijackInvite.id },
      data: { revokedAt: new Date() },
    });
    console.log('[2b] an account older than the invite cannot claim it');

    // ── 3. Client tier is window-bounded, not count-bounded ───────────────
    await consumeAudit(invitee.id);
    const afterOne = await prisma.reclaimGrant.findFirstOrThrow({ where: { userId: invitee.id } });
    if (afterOne.windowStartsAt === null) fail('client window did not open on first use');
    await assertEntitled(invitee.id); // throws if the count were treated as the limit
    console.log('[3] client tier still live after a completed audit (window, not count)');

    // ── 4. The referral unlock fires on COMPLETION, not signup ────────────
    const referralInvite = await prisma.reclaimInvite.create({
      data: {
        email: referred.email,
        token: hashInviteToken(`${PREFIX}-referral-${process.pid}`),
        tier: 'referral',
        invitedByUserId: referrer.id,
        createdAt: new Date(Date.now() - 60_000),
      },
    });
    createdInviteIds.push(referralInvite.id);

    await assertEntitled(referred.id); // the referred leader signs up and starts — referrer gets nothing yet
    if ((await prisma.reclaimGrant.count({ where: { userId: referrer.id } })) !== 0)
      fail('the referrer was rewarded at signup rather than at completion (Brief §8)');

    await grantReferralUnlock(referred.id);
    const referrerGrants = await prisma.reclaimGrant.findMany({ where: { userId: referrer.id } });
    if (referrerGrants.length !== 1)
      fail(`referrer holds ${referrerGrants.length} grants, expected 1`);
    if (referrerGrants[0]?.id !== `referral_${referralInvite.id}`)
      fail('referral grant is not keyed on the invite');

    // Completing again must not mint a second unlock.
    await grantReferralUnlock(referred.id);
    if ((await prisma.reclaimGrant.count({ where: { userId: referrer.id } })) !== 1)
      fail('a second completion minted a second referral unlock');
    console.log('[4] referral unlock fired once, on first completion');

    // ── 5. Erasure: invite de-attributed (SET NULL), grant cascaded ───────
    await eraseUser({
      userId: referred.id,
      userEmail: referred.email,
      actorUserId: referred.id,
      reason: 'self_service',
    });
    erased.add(referred.id);
    const survivingInvite = await prisma.reclaimInvite.findUnique({
      where: { id: referralInvite.id },
    });
    if (survivingInvite === null) fail('erasing the invitee deleted the invite record');
    if (survivingInvite.redeemedByUserId !== null)
      fail('invite still references the erased user — SET NULL did not apply');
    if ((await prisma.reclaimGrant.count({ where: { userId: referred.id } })) !== 0)
      fail('the erased user’s grant survived — CASCADE did not apply');
    console.log('[5] erasure: invite retained + de-attributed, grant cascaded');
  } finally {
    for (const user of [invitee, referrer, referred].filter((u) => !erased.has(u.id))) {
      await eraseUser({
        userId: user.id,
        userEmail: user.email,
        actorUserId: user.id,
        reason: 'self_service',
      }).catch(() => undefined);
    }
    // The invite rows are deliberately retained by erasure, so the smoke cleans up after itself.
    await prisma.reclaimInvite.deleteMany({ where: { id: { in: createdInviteIds } } });
    await prisma.$disconnect();
  }

  console.log(
    '\n✓ smoke:reclaim-access passed — refusal, one-grant-per-invite, window, referral, erasure'
  );
}

main().catch(async (err) => {
  console.error('\n✗ smoke:reclaim-access failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
