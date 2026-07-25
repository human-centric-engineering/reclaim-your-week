/**
 * The grant ledger (F8 t-2). Prisma and the invite lookup are mocked.
 *
 * **The point of this file is idempotence.** `planning-retro.md` §B named F8's grant/referral writes as
 * the place to expect the TOCTOU shape that bit F6: read → decide → insert, with no unique key, lets two
 * concurrent requests each mint an entitlement. Every mint here is keyed deterministically, and the
 * invite is claimed with a conditional update — both are asserted below, including the racing case.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { grantCreate, inviteUpdateMany, findLiveInvite, userFindUnique, getValidInvitationMock } =
  vi.hoisted(() => ({
    grantCreate: vi.fn(),
    inviteUpdateMany: vi.fn(),
    findLiveInvite: vi.fn(),
    userFindUnique: vi.fn(),
    getValidInvitationMock: vi.fn(),
  }));

vi.mock('@/lib/db/client', () => ({
  prisma: {
    reclaimGrant: { create: grantCreate },
    reclaimInvite: { updateMany: inviteUpdateMany },
    user: { findUnique: userFindUnique },
  },
}));
vi.mock('@/lib/app/programme/access/invites', () => ({ findLiveInviteForEmail: findLiveInvite }));
vi.mock('@/lib/utils/invitation-token', () => ({ getValidInvitation: getValidInvitationMock }));

import {
  mintGrant,
  redeemInviteForUser,
  grantOpenSignupTier,
  grantAnotherAudit,
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
  // Default = the legitimate shape: the invitation was accepted (its token is gone) and the account
  // was created at accept time, i.e. after the invite was issued.
  getValidInvitationMock.mockResolvedValue(null);
  userFindUnique.mockResolvedValue({ createdAt: new Date('2026-07-02T00:00:00Z') });
});

describe('redeemInviteForUser — the account must actually be the invitation’s recipient', () => {
  // `user.email` is NOT proof of that: core's `PATCH /users/me` lets any authenticated user set their
  // address to any unused one without re-verification. Matching on email alone would let a standard
  // -tier account claim a client-tier invitation addressed to someone else, and deny the real
  // recipient theirs. Both guards below exist for that attack; neither is sufficient alone.

  it('refuses while the invitation is still OUTSTANDING (its token was never consumed)', async () => {
    findLiveInvite.mockResolvedValue(invite({ tier: 'client' }));
    getValidInvitationMock.mockResolvedValue({ expiresAt: new Date('2026-07-08T00:00:00Z') });

    expect(await redeemInviteForUser('u-attacker', 'ceo@bigco.com', CONFIG)).toBeNull();
    expect(inviteUpdateMany).not.toHaveBeenCalled();
    expect(grantCreate).not.toHaveBeenCalled();
  });

  it('refuses when the account PREDATES the invitation', async () => {
    findLiveInvite.mockResolvedValue(invite({ tier: 'client' }));
    userFindUnique.mockResolvedValue({ createdAt: new Date('2026-06-01T00:00:00Z') });

    expect(await redeemInviteForUser('u-attacker', 'ceo@bigco.com', CONFIG)).toBeNull();
    expect(grantCreate).not.toHaveBeenCalled();
  });

  it('allows the genuine shape: token consumed by acceptance, account created at accept time', async () => {
    findLiveInvite.mockResolvedValue(invite({ tier: 'client' }));

    expect(await redeemInviteForUser('u-ceo', 'ceo@bigco.com', CONFIG)).toBe('client');
    expect(grantCreate).toHaveBeenCalled();
  });

  it('refuses when the user record has gone missing rather than defaulting to allow', async () => {
    findLiveInvite.mockResolvedValue(invite());
    userFindUnique.mockResolvedValue(null);

    expect(await redeemInviteForUser('u-ghost', 'leader@example.org', CONFIG)).toBeNull();
  });
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

describe('grantAnotherAudit (admin re-grant)', () => {
  // The invite flow cannot reach an existing account — core's accept-invite refuses a registered
  // address, and redemption refuses an account older than its invite. This is the only route back for
  // an exhausted leader, and the refusal copy promises it.
  it('is idempotent within a day, so a double-click grants once', async () => {
    await grantAnotherAudit('u1', 'standard', '2026-07-25', CONFIG);

    const args = grantCreate.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(args.data.id).toBe('regrant_u1_2026-07-25');
  });

  it('reports that nothing was minted when the day’s grant already exists', async () => {
    grantCreate.mockRejectedValue(uniqueViolation);

    expect(await grantAnotherAudit('u1', 'standard', '2026-07-25', CONFIG)).toBe(false);
  });

  it('still allows a genuine re-grant on another day', async () => {
    await grantAnotherAudit('u1', 'standard', '2026-07-25', CONFIG);
    await grantAnotherAudit('u1', 'standard', '2026-08-19', CONFIG);

    const ids = grantCreate.mock.calls.map((c) => (c[0] as { data: { id: string } }).data.id);
    expect(new Set(ids).size).toBe(2);
  });

  it('gives a client re-grant its start-by deadline, and other tiers none', async () => {
    await grantAnotherAudit('u1', 'client', '2026-07-25', CONFIG);
    expect(
      (grantCreate.mock.calls[0]?.[0] as { data: { mustStartBy: Date | null } }).data.mustStartBy
    ).toBeInstanceOf(Date);

    grantCreate.mockClear();
    await grantAnotherAudit('u1', 'standard', '2026-07-25', CONFIG);
    expect(
      (grantCreate.mock.calls[0]?.[0] as { data: { mustStartBy: Date | null } }).data.mustStartBy
    ).toBeNull();
  });
});
