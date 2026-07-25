/**
 * The grant ledger (F8 t-2) — where an invite becomes an entitlement.
 *
 * **Redemption is lazy, and that is a decision, not a shortcut** (plan D2, sunrise#464). The account is
 * created by Sunrise's `/api/auth/accept-invite`, and better-auth's `databaseHooks` live in
 * `lib/auth/config.ts` — neither is ours to edit (I10), and Sunrise reserves no `lib/app/*` seam for the
 * auth lifecycle. So the invite is resolved at the **entitlement gate** instead: the first time a leader
 * tries to start an audit, which is the only door to the product (I14, reconciliation 1). When the
 * upstream seam lands, this moves to account creation and `assertEntitled` goes back to a pure check.
 *
 * **Every write here is idempotent by construction.** `planning-retro.md` §B names this feature: "any
 * 'read, decide, insert' on a table without the right unique index is a TOCTOU; the cheapest idempotent
 * fix is often a deterministic primary key". F6's free-grant bootstrap was that bug, found independently
 * by two reviewers. So a grant minted from an invite is keyed `invite_<inviteId>`, a referral unlock
 * `referral_<inviteId>`, and the open-signup grant `standard_<userId>` — a concurrent double-click
 * collides on the primary key instead of minting a second audit.
 */

import { prisma } from '@/lib/db/client';
import { logger } from '@/lib/logging';
import { AUDITS_GRANTED, type ReclaimTier } from '@/lib/app/programme/access/tiers';
import { findLiveInviteForEmail } from '@/lib/app/programme/access/invites';
import type { ReclaimAccessConfig } from '@/lib/app/programme/config';

/** A Prisma P2002 (unique-constraint) violation, duck-typed to avoid importing `@prisma/client` here. */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

export interface MintGrantInput {
  id: string;
  userId: string;
  tier: ReclaimTier;
  sourceInviteId?: string | null;
  /** Client tier only: the deadline to *start* by (Brief §8). The 12-month window opens on first use. */
  mustStartBy?: Date | null;
}

/**
 * Create a grant with a caller-chosen deterministic id. Returns `true` if this call created it, `false`
 * if it already existed — so a concurrent retry is a no-op rather than a second entitlement.
 */
export async function mintGrant(input: MintGrantInput): Promise<boolean> {
  try {
    await prisma.reclaimGrant.create({
      data: {
        id: input.id,
        userId: input.userId,
        tier: input.tier,
        auditsGranted: AUDITS_GRANTED[input.tier],
        auditsUsed: 0,
        mustStartBy: input.mustStartBy ?? null,
        sourceInviteId: input.sourceInviteId ?? null,
      },
    });
    logger.info('Reclaim: grant minted', { grantId: input.id, tier: input.tier });
    return true;
  } catch (error) {
    if (isUniqueViolation(error)) return false;
    throw error;
  }
}

/**
 * Resolve a live invite for this account into a grant, exactly once.
 *
 * Marks the invite redeemed with a **conditional update** (`redeemedAt: null` in the WHERE), so two
 * concurrent first-runs cannot both claim it — and mints the grant under a deterministic id keyed on the
 * invite, so even if both got past the mark, only one grant exists. Returns the tier granted, or null
 * when the account holds no live invite.
 */
export async function redeemInviteForUser(
  userId: string,
  email: string,
  config: ReclaimAccessConfig,
  now: Date = new Date()
): Promise<ReclaimTier | null> {
  const invite = await findLiveInviteForEmail(email);
  if (invite === null) return null;

  const claimed = await prisma.reclaimInvite.updateMany({
    where: { id: invite.id, redeemedAt: null, revokedAt: null },
    data: { redeemedAt: now, redeemedByUserId: userId },
  });
  // Someone else won the race (or it was revoked between read and write) — do not mint against it.
  if (claimed.count === 0) return null;

  const tier = (
    invite.tier === 'client' ? 'client' : invite.tier === 'referral' ? 'referral' : 'standard'
  ) satisfies ReclaimTier;

  await mintGrant({
    id: `invite_${invite.id}`,
    userId,
    tier,
    sourceInviteId: invite.id,
    // Brief §8: client access "must [be initiated] within a month of being given access". The deadline
    // runs from when the invite was issued, not from redemption — otherwise it could never be missed.
    mustStartBy:
      tier === 'client'
        ? new Date(invite.createdAt.getTime() + config.clientMustStartWithinDays * DAY_MS)
        : null,
  });

  logger.info('Reclaim: invite redeemed into a grant', { inviteId: invite.id, tier, userId });
  return tier;
}

/**
 * The open-signup door (F8 t-4, reconciliation 7). Off in v1: an account with no invite gets nothing.
 * Turning `openSignup` on in `Module.config` mints a standard-tier grant instead — the door opens with
 * a config change rather than a deploy, which is the whole point of building it now.
 */
export async function grantOpenSignupTier(userId: string): Promise<void> {
  await mintGrant({ id: `standard_${userId}`, userId, tier: 'standard' });
}
