/**
 * The referral unlock (F8 t-3) — Brief §8: "A user can earn a second audit by inviting someone else in.
 * The behaviour I most want, telling others, funds itself."
 *
 * **It fires on the referred leader's first COMPLETION, not their signup.** That is Rashmir's wording
 * and it is the right economics: a signup costs nothing to manufacture, and Brief §1 makes the success
 * measure "whether they tell others about it unprompted" — which only means anything if the person told
 * actually did the audit. So the unlock hangs off `completeRun`, not off account creation.
 *
 * Idempotent by construction (`planning-retro.md` §B): the referrer's grant is keyed
 * `referral_<inviteId>`, so a re-run of the completion path — a retry, a double-click, a second
 * completed audit — collides on the primary key instead of minting another audit.
 */

import { prisma } from '@/lib/db/client';
import { logger } from '@/lib/logging';
import { mintGrant } from '@/lib/app/programme/access/grants';

/**
 * How many referral invitations one leader may have outstanding at a time.
 *
 * Not a rate limit (the route has one of those): a ceiling on *pending* invitations, so an account
 * cannot quietly become a mailing list. Redeemed and revoked invitations do not count, so someone
 * whose invitations are actually being taken up can keep inviting.
 */
export const MAX_PENDING_REFERRALS = 5;

/** How many referral invitations this leader currently has outstanding. */
export async function countPendingReferrals(userId: string): Promise<number> {
  return prisma.reclaimInvite.count({
    where: { invitedByUserId: userId, redeemedAt: null, revokedAt: null },
  });
}

/**
 * Reward the person who referred this leader, if anyone did. Called once the referred leader completes
 * their first audit. Safe to call on every completion: the deterministic grant id makes the second call
 * a no-op, and a leader who arrived by any other route has no referral invite to find.
 */
export async function grantReferralUnlock(referredUserId: string): Promise<void> {
  const invite = await prisma.reclaimInvite.findFirst({
    where: {
      redeemedByUserId: referredUserId,
      tier: 'referral',
      invitedByUserId: { not: null },
    },
    orderBy: { redeemedAt: 'asc' },
  });
  if (invite === null || invite.invitedByUserId === null) return;

  const minted = await mintGrant({
    id: `referral_${invite.id}`,
    userId: invite.invitedByUserId,
    tier: 'referral',
    sourceInviteId: invite.id,
  });

  if (minted) {
    logger.info('Reclaim: referral unlock granted', {
      inviteId: invite.id,
      referrerUserId: invite.invitedByUserId,
    });
  }
}
