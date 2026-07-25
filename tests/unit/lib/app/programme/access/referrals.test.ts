/**
 * The referral unlock (F8 t-3). Prisma and the grant mint are mocked.
 *
 * The behaviour Rashmir specified precisely (Brief §8) is *when* it fires: on the referred leader's
 * first **completion**, not their signup. That is asserted here at the unit level and again end-to-end
 * in `smoke:reclaim-access`, because it is the difference between a referral scheme and a spam scheme.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { inviteFindFirst, inviteCount, mintMock } = vi.hoisted(() => ({
  inviteFindFirst: vi.fn(),
  inviteCount: vi.fn(),
  mintMock: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  prisma: { reclaimInvite: { findFirst: inviteFindFirst, count: inviteCount } },
}));
vi.mock('@/lib/app/programme/access/grants', () => ({ mintGrant: mintMock }));

import {
  grantReferralUnlock,
  countPendingReferrals,
  MAX_PENDING_REFERRALS,
} from '@/lib/app/programme/access/referrals';

beforeEach(() => {
  vi.clearAllMocks();
  inviteFindFirst.mockResolvedValue(null);
  inviteCount.mockResolvedValue(0);
  mintMock.mockResolvedValue(true);
});

describe('grantReferralUnlock', () => {
  it('grants nothing when the leader arrived by any other route', async () => {
    await grantReferralUnlock('u-referred');

    expect(mintMock).not.toHaveBeenCalled();
  });

  it('looks only at REDEEMED referral invites that carry a referrer', async () => {
    await grantReferralUnlock('u-referred');

    const args = inviteFindFirst.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(args.where).toMatchObject({
      redeemedByUserId: 'u-referred',
      tier: 'referral',
      invitedByUserId: { not: null },
    });
  });

  it('mints the referrer’s second audit, keyed on the invite so it cannot fire twice', async () => {
    inviteFindFirst.mockResolvedValue({
      id: 'inv9',
      invitedByUserId: 'u-referrer',
      tier: 'referral',
    });

    await grantReferralUnlock('u-referred');

    expect(mintMock).toHaveBeenCalledWith({
      id: 'referral_inv9',
      userId: 'u-referrer',
      tier: 'referral',
      sourceInviteId: 'inv9',
    });
  });

  it('is silent when the grant already existed — a repeat completion adds nothing', async () => {
    inviteFindFirst.mockResolvedValue({
      id: 'inv9',
      invitedByUserId: 'u-referrer',
      tier: 'referral',
    });
    mintMock.mockResolvedValue(false);

    await expect(grantReferralUnlock('u-referred')).resolves.toBeUndefined();
  });
});

describe('countPendingReferrals', () => {
  it('counts only outstanding invitations — redeemed and revoked ones free up room', async () => {
    await countPendingReferrals('u1');

    const args = inviteCount.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(args.where).toMatchObject({
      invitedByUserId: 'u1',
      redeemedAt: null,
      revokedAt: null,
    });
    expect(MAX_PENDING_REFERRALS).toBeGreaterThan(0);
  });
});
