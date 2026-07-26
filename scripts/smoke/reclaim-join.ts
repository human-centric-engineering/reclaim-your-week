/**
 * Smoke: group invite links against real Postgres (F11).
 *
 * **This exists because the unit tests cannot prove the thing that matters.** They mock Prisma, so
 * they assert the *shape* of the conditional UPDATE — that the seat check lives in the WHERE clause
 * — and nothing at all about whether the database actually serialises two claims arriving together.
 * The bug this guards against (two people scanning at the same instant, both taking the last seat)
 * only exists against a real engine, which is the same reason `smoke:reclaim-access` exists for the
 * grant TOCTOU that F6 shipped.
 *
 * What it asserts, in order:
 *   1. a link with N seats issues **exactly N** invitations under a burst of N+5 concurrent claims;
 *   2. the seat count and the invitation count agree afterwards (no phantom reservations);
 *   3. an existing account takes **no** seat;
 *   4. the same address claiming twice takes **one** seat;
 *   5. a withdrawn link refuses, while the invitations already claimed through it survive;
 *   6. an expired link refuses.
 *
 * Throwaway rows, cleaned up at the end. Real Postgres.
 *
 * Run:  npm run smoke:reclaim-join
 */

import { prisma } from '@/lib/db/client';
import { eraseUser } from '@/lib/privacy/erase-user';
import { claimInviteLink, mintInviteLink } from '@/lib/app/programme/access/invite-links';

const PREFIX = 'smoke-reclaim-join';
const SEATS = 5;
const EXTRA_CLAIMERS = 5;

function fail(message: string): never {
  throw new Error(message);
}

/** Claim and swallow the refusal — the burst is about the aggregate, not any one claimant. */
async function tryClaim(token: string, email: string): Promise<void> {
  await claimInviteLink({ token, name: 'Smoke', email, inviterName: 'Smoke' }).catch(
    () => undefined
  );
}

async function main(): Promise<void> {
  const admin = await prisma.user.create({
    data: {
      name: `${PREFIX} admin`,
      email: `${PREFIX}-admin-${process.pid}@example.com`,
      role: 'ADMIN',
    },
  });
  const linkIds: string[] = [];
  const emailPrefix = `${PREFIX}-${process.pid}`;

  try {
    // ── 1. The cap holds under a genuine concurrent burst ─────────────────
    const { link, token } = await mintInviteLink({
      label: `${PREFIX} burst`,
      maxClaims: SEATS,
      expiryDays: 7,
      createdByUserId: admin.id,
    });
    linkIds.push(link.id);

    // Every claimant is a distinct address, so nothing is deduplicated by the repeat-claim check —
    // the only thing that can hold the line here is the conditional UPDATE.
    await Promise.all(
      Array.from({ length: SEATS + EXTRA_CLAIMERS }, (_, i) =>
        tryClaim(token, `${emailPrefix}-burst-${i}@example.com`)
      )
    );

    const issued = await prisma.reclaimInvite.count({ where: { viaLinkId: link.id } });
    if (issued !== SEATS) {
      fail(
        `the seat cap leaked under concurrency: ${SEATS + EXTRA_CLAIMERS} simultaneous claims on a ` +
          `${SEATS}-seat link issued ${issued} invitations`
      );
    }

    // ── 2. Bookkeeping agrees with reality ────────────────────────────────
    const after = await prisma.reclaimInviteLink.findUniqueOrThrow({ where: { id: link.id } });
    if (after.claimCount !== issued) {
      fail(`claimCount (${after.claimCount}) disagrees with invitations issued (${issued})`);
    }
    console.log(
      `[1] ${SEATS + EXTRA_CLAIMERS} concurrent claims on a ${SEATS}-seat link issued exactly ${issued}`
    );

    // ── 3. An existing account takes no seat ──────────────────────────────
    const spare = await mintInviteLink({
      label: `${PREFIX} spare`,
      maxClaims: 3,
      expiryDays: 7,
      createdByUserId: admin.id,
    });
    linkIds.push(spare.link.id);

    const existing = await prisma.user.create({
      data: {
        name: `${PREFIX} existing`,
        email: `${emailPrefix}-existing@example.com`,
        role: 'USER',
      },
    });
    const existingResult = await claimInviteLink({
      token: spare.token,
      name: 'Existing',
      email: existing.email,
      inviterName: 'Smoke',
    });
    if (existingResult.outcome !== 'already_registered') {
      fail(`an existing account claimed a seat: outcome was ${existingResult.outcome}`);
    }
    let spareRow = await prisma.reclaimInviteLink.findUniqueOrThrow({
      where: { id: spare.link.id },
    });
    if (spareRow.claimCount !== 0) fail('an existing account consumed a seat it cannot use');
    console.log('[3] an account that already exists is refused and costs the room nothing');

    // ── 4. The same address twice takes one seat ──────────────────────────
    const repeat = `${emailPrefix}-repeat@example.com`;
    const first = await claimInviteLink({
      token: spare.token,
      name: 'Repeat',
      email: repeat,
      inviterName: 'Smoke',
    });
    const second = await claimInviteLink({
      token: spare.token,
      name: 'Repeat',
      // Different casing on purpose: the same person typing their address the way they feel like it.
      email: repeat.toUpperCase(),
      inviterName: 'Smoke',
    });
    if (first.outcome !== 'invited') fail(`the first claim did not succeed: ${first.outcome}`);
    if (second.outcome !== 'already_claimed') {
      fail(`a repeat claim was not recognised: ${second.outcome}`);
    }
    spareRow = await prisma.reclaimInviteLink.findUniqueOrThrow({ where: { id: spare.link.id } });
    if (spareRow.claimCount !== 1) {
      fail(`a repeat claim cost a second seat (claimCount is ${spareRow.claimCount})`);
    }
    console.log('[4] a repeat claim from the same address costs one seat, not two');

    // ── 5. Withdrawing refuses new claims, keeps the old ones ─────────────
    await prisma.reclaimInviteLink.update({
      where: { id: spare.link.id },
      data: { revokedAt: new Date() },
    });
    let revokedRefusal: string | null = null;
    await claimInviteLink({
      token: spare.token,
      name: 'Late',
      email: `${emailPrefix}-late@example.com`,
      inviterName: 'Smoke',
    }).catch((e: unknown) => {
      revokedRefusal = e instanceof Error && 'reason' in e ? String(e.reason) : 'unknown-error';
    });
    if (revokedRefusal !== 'revoked') {
      fail(`a withdrawn link did not refuse correctly (got ${String(revokedRefusal)})`);
    }
    const survivors = await prisma.reclaimInvite.count({ where: { viaLinkId: spare.link.id } });
    if (survivors !== 1) {
      fail(`withdrawing the link disturbed the invitations claimed through it (${survivors} left)`);
    }
    console.log(
      '[5] a withdrawn link refuses, and the invitation already claimed through it stands'
    );

    // ── 6. An expired link refuses ────────────────────────────────────────
    const stale = await mintInviteLink({
      label: `${PREFIX} stale`,
      maxClaims: 5,
      expiryDays: 1,
      createdByUserId: admin.id,
    });
    linkIds.push(stale.link.id);
    await prisma.reclaimInviteLink.update({
      where: { id: stale.link.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    let expiredRefusal: string | null = null;
    await claimInviteLink({
      token: stale.token,
      name: 'Late',
      email: `${emailPrefix}-stale@example.com`,
      inviterName: 'Smoke',
    }).catch((e: unknown) => {
      expiredRefusal = e instanceof Error && 'reason' in e ? String(e.reason) : 'unknown-error';
    });
    if (expiredRefusal !== 'expired') {
      fail(`an expired link did not refuse correctly (got ${String(expiredRefusal)})`);
    }
    console.log('[6] an expired link refuses');

    await eraseUser({
      userId: existing.id,
      userEmail: existing.email,
      actorUserId: existing.id,
      reason: 'self_service',
    }).catch(() => undefined);
  } finally {
    // Invites and links are both deliberately retained by erasure, so the smoke cleans up itself.
    await prisma.reclaimInvite.deleteMany({ where: { email: { startsWith: emailPrefix } } });
    await prisma.reclaimInviteLink.deleteMany({ where: { id: { in: linkIds } } });
    await eraseUser({
      userId: admin.id,
      userEmail: admin.email,
      actorUserId: admin.id,
      reason: 'self_service',
    }).catch(() => undefined);
    await prisma.$disconnect();
  }

  console.log(
    '\n✓ smoke:reclaim-join passed — seat cap under concurrency, both short-circuits, revoke, expiry'
  );
}

main().catch(async (err) => {
  console.error('\n✗ smoke:reclaim-join failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
