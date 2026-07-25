/**
 * The grant ledger (F8 t-2). Prisma and the invite lookup are mocked.
 *
 * **The point of this file is idempotence.** `planning-retro.md` §B named F8's grant/referral writes as
 * the place to expect the TOCTOU shape that bit F6: read → decide → insert, with no unique key, lets two
 * concurrent requests each mint an entitlement. Every mint here is keyed deterministically, and the
 * invite is claimed with a conditional update — both are asserted below, including the racing case.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { grantCreate, inviteUpdateMany, findLiveInvite } = vi.hoisted(() => ({
  grantCreate: vi.fn(),
  inviteUpdateMany: vi.fn(),
  findLiveInvite: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  prisma: {
    reclaimGrant: { create: grantCreate },
    reclaimInvite: { updateMany: inviteUpdateMany },
  },
}));
vi.mock('@/lib/app/programme/access/invites', () => ({ findLiveInviteForEmail: findLiveInvite }));

import {
  mintGrant,
  redeemInviteForUser,
  grantOpenSignupTier,
  isUniqueViolation,
} from '@/lib/app/programme/access/grants';

const CONFIG = {
  clientWindowMonths: 12,
  clientMustStartWithinDays: 30,
  openSignup: false,
  policyVersion: 'draft-1',
};

const invite = (over: Record<string, unknown> = {}) => ({
  id: 'inv1',
  email: 'leader@example.org',
  tier: 'standard',
  invitedByUserId: null,
  redeemedAt: null,
  revokedAt: null,
  createdAt: new Date('2026-07-01T00:00:00Z'),
  ...over,
});

/** What Prisma throws on a primary-key collision. */
const uniqueViolation = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });

beforeEach(() => {
  vi.clearAllMocks();
  grantCreate.mockResolvedValue({ id: 'g1' });
  inviteUpdateMany.mockResolvedValue({ count: 1 });
  findLiveInvite.mockResolvedValue(null);
});

describe('mintGrant', () => {
  it('creates under the caller’s deterministic id', async () => {
    expect(await mintGrant({ id: 'invite_inv1', userId: 'u1', tier: 'standard' })).toBe(true);

    const args = grantCreate.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(args.data.id).toBe('invite_inv1');
    expect(args.data.auditsGranted).toBe(1);
  });

  it('swallows a PK collision — the concurrent second call mints nothing', async () => {
    grantCreate.mockRejectedValue(uniqueViolation);

    expect(await mintGrant({ id: 'invite_inv1', userId: 'u1', tier: 'standard' })).toBe(false);
  });

  it('re-throws anything that is not a unique violation', async () => {
    grantCreate.mockRejectedValue(new Error('connection lost'));

    await expect(mintGrant({ id: 'x', userId: 'u1', tier: 'free' })).rejects.toThrow(
      'connection lost'
    );
  });

  it('gives the client tier a count that does not bind, since its window is the limit', async () => {
    await mintGrant({ id: 'invite_inv1', userId: 'u1', tier: 'client' });

    const args = grantCreate.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(args.data.auditsGranted).toBeGreaterThan(1);
  });
});

describe('redeemInviteForUser', () => {
  it('returns null when the account holds no live invite', async () => {
    expect(await redeemInviteForUser('u1', 'leader@example.org', CONFIG)).toBeNull();
    expect(grantCreate).not.toHaveBeenCalled();
  });

  it('claims the invite CONDITIONALLY, so a racing second call cannot claim it too', async () => {
    findLiveInvite.mockResolvedValue(invite());

    await redeemInviteForUser('u1', 'leader@example.org', CONFIG);

    const args = inviteUpdateMany.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(args.where).toMatchObject({ id: 'inv1', redeemedAt: null, revokedAt: null });
  });

  it('mints nothing when the conditional claim loses the race', async () => {
    findLiveInvite.mockResolvedValue(invite());
    inviteUpdateMany.mockResolvedValue({ count: 0 });

    expect(await redeemInviteForUser('u1', 'leader@example.org', CONFIG)).toBeNull();
    expect(grantCreate).not.toHaveBeenCalled();
  });

  it('keys the grant on the invite, so two winners would still yield one grant', async () => {
    findLiveInvite.mockResolvedValue(invite());

    await redeemInviteForUser('u1', 'leader@example.org', CONFIG);

    const args = grantCreate.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(args.data.id).toBe('invite_inv1');
    expect(args.data.sourceInviteId).toBe('inv1');
  });

  it('sets the client start-by deadline from the INVITE date, not from redemption', async () => {
    findLiveInvite.mockResolvedValue(invite({ tier: 'client' }));

    const tier = await redeemInviteForUser(
      'u1',
      'leader@example.org',
      CONFIG,
      new Date('2026-07-20T00:00:00Z')
    );

    expect(tier).toBe('client');
    const args = grantCreate.mock.calls[0]?.[0] as { data: { mustStartBy: Date } };
    // 2026-07-01 + 30 days. Measured from issue, otherwise the deadline could never be missed.
    expect(args.data.mustStartBy.toISOString()).toBe('2026-07-31T00:00:00.000Z');
  });

  it('gives a non-client tier no window at all', async () => {
    findLiveInvite.mockResolvedValue(invite({ tier: 'referral' }));

    expect(await redeemInviteForUser('u1', 'leader@example.org', CONFIG)).toBe('referral');
    const args = grantCreate.mock.calls[0]?.[0] as { data: { mustStartBy: Date | null } };
    expect(args.data.mustStartBy).toBeNull();
  });

  it('treats an unrecognised tier as standard rather than trusting the column', async () => {
    findLiveInvite.mockResolvedValue(invite({ tier: 'platinum' }));

    expect(await redeemInviteForUser('u1', 'leader@example.org', CONFIG)).toBe('standard');
  });
});

describe('grantOpenSignupTier', () => {
  it('is keyed per user, so repeated open-signup runs cannot stack grants', async () => {
    await grantOpenSignupTier('u1');

    const args = grantCreate.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(args.data.id).toBe('standard_u1');
    expect(args.data.tier).toBe('standard');
  });
});

describe('isUniqueViolation', () => {
  it('recognises P2002 and nothing else', () => {
    expect(isUniqueViolation(uniqueViolation)).toBe(true);
    expect(isUniqueViolation(new Error('nope'))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});
