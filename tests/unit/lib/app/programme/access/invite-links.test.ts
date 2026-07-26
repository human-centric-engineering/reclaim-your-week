/**
 * Group invite links (F11). Prisma, the invite service and the config read are mocked — no DB.
 *
 * The behaviours here are the ones that cost something real when they break, in the order they hurt:
 *
 *   - the seat cap is taken by a **conditional UPDATE**, never a read-then-write, so two people
 *     scanning at the same moment cannot both take the last seat (the concurrency this asserts about
 *     the *query* is proved against real Postgres in `scripts/smoke/reclaim-join.ts` — a mocked
 *     Prisma cannot race);
 *   - the two short-circuits (existing account, repeat claim) run **before** a seat is taken, so
 *     neither costs the room capacity it cannot use;
 *   - a failed issue **hands the seat back**;
 *   - the mint ceiling **refuses** rather than clamping;
 *   - revoking a link does not touch the invitations already claimed through it.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const {
  linkFindUnique,
  linkFindMany,
  linkCreate,
  linkUpdate,
  linkUpdateMany,
  inviteFindFirst,
  inviteUpdate,
  userFindUnique,
  issueInviteMock,
  readJoinConfig,
} = vi.hoisted(() => ({
  linkFindUnique: vi.fn(),
  linkFindMany: vi.fn(),
  linkCreate: vi.fn(),
  linkUpdate: vi.fn(),
  linkUpdateMany: vi.fn(),
  inviteFindFirst: vi.fn(),
  inviteUpdate: vi.fn(),
  userFindUnique: vi.fn(),
  issueInviteMock: vi.fn(),
  readJoinConfig: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  prisma: {
    reclaimInviteLink: {
      findUnique: linkFindUnique,
      findMany: linkFindMany,
      create: linkCreate,
      update: linkUpdate,
      updateMany: linkUpdateMany,
      // The field reference the conditional UPDATE compares against. Prisma exposes these as opaque
      // marker objects; the test only needs identity, which is what the assertion below checks.
      fields: { maxClaims: { __field: 'maxClaims' } },
    },
    reclaimInvite: { findFirst: inviteFindFirst, update: inviteUpdate },
    user: { findUnique: userFindUnique },
  },
}));
vi.mock('@/lib/app/programme/access/invites', () => ({ issueInvite: issueInviteMock }));
vi.mock('@/lib/app/programme/config', () => ({ readReclaimJoinConfig: readJoinConfig }));

import {
  mintInviteLink,
  revokeInviteLink,
  claimInviteLink,
  listInviteLinks,
  linkStatus,
  resolveInviteLink,
  InviteLinkInvalid,
  JOIN_TOKEN_PATTERN,
} from '@/lib/app/programme/access/invite-links';

const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const PAST = new Date(Date.now() - 60 * 1000);

const link = (over: Record<string, unknown> = {}) => ({
  id: 'link1',
  token: 'abcdefghijklmnopqrstuv',
  label: 'Leadership offsite',
  tier: 'standard',
  maxClaims: 10,
  claimCount: 0,
  expiresAt: FUTURE,
  revokedAt: null,
  createdByUserId: 'admin1',
  createdAt: new Date('2026-07-01T00:00:00Z'),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  readJoinConfig.mockResolvedValue({
    joinLinkDefaultMaxClaims: 10,
    joinLinkDefaultDays: 7,
    joinLinkMaxClaims: 50,
  });
  linkFindUnique.mockResolvedValue(link());
  linkCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve(link(data))
  );
  linkUpdateMany.mockResolvedValue({ count: 1 });
  inviteFindFirst.mockResolvedValue(null);
  userFindUnique.mockResolvedValue(null);
  issueInviteMock.mockResolvedValue({
    invite: { id: 'inv1' },
    emailStatus: 'sent',
    expiresAt: FUTURE,
  });
});

describe('mintInviteLink', () => {
  it('refuses a cap above the configured ceiling rather than clamping to it', async () => {
    await expect(
      mintInviteLink({ label: 'Offsite', maxClaims: 51, expiryDays: 7, createdByUserId: 'admin1' })
    ).rejects.toBeInstanceOf(InviteLinkInvalid);

    // The refusal is the point: a silently reduced cap is a room where the rest cannot get in.
    expect(linkCreate).not.toHaveBeenCalled();
  });

  it('accepts a cap exactly at the ceiling', async () => {
    await mintInviteLink({
      label: 'Offsite',
      maxClaims: 50,
      expiryDays: 7,
      createdByUserId: 'admin1',
    });

    expect(linkCreate).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['zero seats', { maxClaims: 0, expiryDays: 7 }],
    ['a fractional seat count', { maxClaims: 2.5, expiryDays: 7 }],
    ['zero days', { maxClaims: 10, expiryDays: 0 }],
    ['more than ninety days', { maxClaims: 10, expiryDays: 91 }],
  ])('refuses %s', async (_label, bounds) => {
    await expect(
      mintInviteLink({ label: 'Offsite', ...bounds, createdByUserId: 'admin1' })
    ).rejects.toBeInstanceOf(InviteLinkInvalid);
  });

  it('refuses a blank label, so a link is always recognisable later', async () => {
    await expect(
      mintInviteLink({ label: '   ', maxClaims: 10, expiryDays: 7, createdByUserId: 'admin1' })
    ).rejects.toBeInstanceOf(InviteLinkInvalid);
  });

  it('mints a standard-tier link with a token matching the public route’s pattern', async () => {
    const { token } = await mintInviteLink({
      label: '  Offsite  ',
      maxClaims: 10,
      expiryDays: 7,
      createdByUserId: 'admin1',
    });

    const data = linkCreate.mock.calls[0]?.[0].data as Record<string, unknown>;
    expect(data.tier).toBe('standard');
    expect(data.label).toBe('Offsite');
    expect(data.createdByUserId).toBe('admin1');
    // The route rejects anything not matching this before it queries; a mint that produced a token
    // the route refuses would be a link that never works.
    expect(JOIN_TOKEN_PATTERN.test(token)).toBe(true);
    expect(data.token).toBe(token);
  });

  it('mints a distinct token each time', async () => {
    const a = await mintInviteLink({
      label: 'A',
      maxClaims: 1,
      expiryDays: 1,
      createdByUserId: 'admin1',
    });
    const b = await mintInviteLink({
      label: 'B',
      maxClaims: 1,
      expiryDays: 1,
      createdByUserId: 'admin1',
    });

    expect(a.token).not.toBe(b.token);
  });
});

describe('linkStatus', () => {
  const now = new Date();

  it('reads revoked ahead of every other state, because that one was chosen deliberately', () => {
    // Full AND expired AND revoked: she withdrew it, and that is what the table should say.
    expect(
      linkStatus(link({ revokedAt: now, claimCount: 10, maxClaims: 10, expiresAt: PAST }), now)
    ).toBe('revoked');
  });

  it('reads full before expired', () => {
    expect(linkStatus(link({ claimCount: 10, maxClaims: 10, expiresAt: PAST }), now)).toBe('full');
  });

  it.each([
    ['live', link()],
    ['full', link({ claimCount: 10, maxClaims: 10 })],
    ['expired', link({ expiresAt: PAST })],
    ['revoked', link({ revokedAt: now })],
  ])('reads %s', (expected, row) => {
    expect(linkStatus(row, now)).toBe(expected);
  });
});

describe('resolveInviteLink', () => {
  it.each([
    ['unknown', null],
    ['revoked', link({ revokedAt: new Date() })],
    ['expired', link({ expiresAt: PAST })],
    ['full', link({ claimCount: 10, maxClaims: 10 })],
  ])('refuses with reason %s', async (reason, row) => {
    linkFindUnique.mockResolvedValue(row);

    await expect(resolveInviteLink('abcdefghijklmnopqrstuv')).rejects.toMatchObject({ reason });
  });
});

describe('claimInviteLink — the two short-circuits', () => {
  const claim = {
    token: 'abcdefghijklmnopqrstuv',
    name: 'Priya',
    email: 'Priya@Example.org',
    inviterName: 'Rashmir',
  };

  it('takes no seat when an account already exists for that address', async () => {
    userFindUnique.mockResolvedValue({ id: 'user1' });

    const result = await claimInviteLink(claim);

    expect(result.outcome).toBe('already_registered');
    // The whole point: someone who cannot use a seat must not spend one. A room of thirty where ten
    // already have accounts would otherwise lose a third of its capacity to people it cannot help.
    expect(linkUpdateMany).not.toHaveBeenCalled();
    expect(issueInviteMock).not.toHaveBeenCalled();
  });

  it('takes no second seat when the same address claims the same link twice', async () => {
    inviteFindFirst.mockResolvedValue({ id: 'inv1' });

    const result = await claimInviteLink(claim);

    expect(result.outcome).toBe('already_claimed');
    expect(linkUpdateMany).not.toHaveBeenCalled();
    expect(issueInviteMock).not.toHaveBeenCalled();
  });

  it('looks for the repeat claim case-insensitively and scoped to this link', async () => {
    await claimInviteLink(claim);

    const where = inviteFindFirst.mock.calls[0]?.[0].where as Record<string, unknown>;
    // Case-insensitive because people type their address differently than they did last time, and
    // scoped to the link because claiming a DIFFERENT link with the same address is legitimate.
    expect(where.email).toEqual({ equals: 'priya@example.org', mode: 'insensitive' });
    expect(where.viaLinkId).toBe('link1');
    expect(where.revokedAt).toBeNull();
  });

  it('lowercases the address before checking whether an account exists', async () => {
    await claimInviteLink(claim);

    expect(userFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'priya@example.org' } })
    );
  });
});

describe('claimInviteLink — taking a seat', () => {
  const claim = {
    token: 'abcdefghijklmnopqrstuv',
    name: 'Priya',
    email: 'priya@example.org',
    inviterName: 'Rashmir',
  };

  it('takes the seat with a conditional UPDATE carrying every bound in its WHERE', async () => {
    await claimInviteLink(claim);

    const args = linkUpdateMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };

    // This assertion IS the concurrency guarantee at the unit level. If the seat check ever moves
    // out of the WHERE clause and into JavaScript, two simultaneous claims can both pass it.
    expect(args.where.id).toBe('link1');
    expect(args.where.claimCount).toEqual({ lt: { __field: 'maxClaims' } });
    expect(args.where.revokedAt).toBeNull();
    expect(args.where.expiresAt).toMatchObject({ gt: expect.any(Date) });
    expect(args.data).toEqual({ claimCount: { increment: 1 } });
  });

  it('refuses as full when the conditional UPDATE matches nothing', async () => {
    // Someone else took the last seat between the resolve and the update.
    linkUpdateMany.mockResolvedValue({ count: 0 });

    await expect(claimInviteLink(claim)).rejects.toMatchObject({ reason: 'full' });
    expect(issueInviteMock).not.toHaveBeenCalled();
  });

  it('issues a standard-tier invite and records which link it came through', async () => {
    const result = await claimInviteLink(claim);

    expect(result.outcome).toBe('invited');
    expect(issueInviteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'priya@example.org',
        tier: 'standard',
        inviteeName: 'Priya',
        inviterName: 'Rashmir',
      })
    );
    expect(inviteUpdate).toHaveBeenCalledWith({
      where: { id: 'inv1' },
      data: { viaLinkId: 'link1' },
    });
  });

  it('still counts as claimed when the invitation email fails to send', async () => {
    // `issueInvite` treats the row as the entitlement and the email as its delivery, so a failed
    // send must not hand the seat back — the person IS invited and can be re-sent.
    issueInviteMock.mockResolvedValue({
      invite: { id: 'inv1' },
      emailStatus: 'failed',
      expiresAt: FUTURE,
    });

    const result = await claimInviteLink(claim);

    expect(result.outcome).toBe('invited');
    expect(linkUpdate).not.toHaveBeenCalled();
  });

  it('hands the seat back when issuing throws', async () => {
    issueInviteMock.mockRejectedValue(new Error('token store down'));

    await expect(claimInviteLink(claim)).rejects.toThrow('token store down');

    expect(linkUpdate).toHaveBeenCalledWith({
      where: { id: 'link1' },
      data: { claimCount: { decrement: 1 } },
    });
  });

  it('does not replace the caller’s error with a bookkeeping one if the release also fails', async () => {
    issueInviteMock.mockRejectedValue(new Error('token store down'));
    linkUpdate.mockRejectedValue(new Error('database gone'));

    // The real cause has to survive: a stranded seat costs one invitation, a swallowed error costs
    // the ability to diagnose anything.
    await expect(claimInviteLink(claim)).rejects.toThrow('token store down');
  });

  it('refuses before doing anything when the link itself will not serve', async () => {
    linkFindUnique.mockResolvedValue(link({ revokedAt: new Date() }));

    await expect(claimInviteLink(claim)).rejects.toMatchObject({ reason: 'revoked' });
    expect(userFindUnique).not.toHaveBeenCalled();
    expect(linkUpdateMany).not.toHaveBeenCalled();
  });
});

describe('revokeInviteLink', () => {
  it('marks the row revoked and leaves the invitations claimed through it alone', async () => {
    linkUpdate.mockResolvedValue(link({ revokedAt: new Date(), claimCount: 4 }));

    const revoked = await revokeInviteLink('link1');

    expect(revoked?.revokedAt).not.toBeNull();
    expect(linkUpdate).toHaveBeenCalledWith({
      where: { id: 'link1' },
      data: { revokedAt: expect.any(Date) },
    });
    // Nothing reaches the invite table. Those people accepted in good faith, and closing the door
    // behind them is not the same as taking back what they were given.
    expect(inviteUpdate).not.toHaveBeenCalled();
  });

  it('returns null for a link that is already withdrawn, so a double-click is not a second write', async () => {
    linkFindUnique.mockResolvedValue(link({ revokedAt: new Date() }));

    expect(await revokeInviteLink('link1')).toBeNull();
    expect(linkUpdate).not.toHaveBeenCalled();
  });

  it('returns null for a link that does not exist', async () => {
    linkFindUnique.mockResolvedValue(null);

    expect(await revokeInviteLink('nope')).toBeNull();
    expect(linkUpdate).not.toHaveBeenCalled();
  });
});

describe('listInviteLinks', () => {
  it('returns one row per link, newest first, with its status resolved', async () => {
    linkFindMany.mockResolvedValue([
      link({ id: 'a', claimCount: 10, maxClaims: 10 }),
      link({ id: 'b' }),
    ]);

    const rows = await listInviteLinks();

    expect(linkFindMany).toHaveBeenCalledWith({ orderBy: { createdAt: 'desc' } });
    expect(rows.map((r) => [r.id, r.status])).toEqual([
      ['a', 'full'],
      ['b', 'live'],
    ]);
    // The token travels to the admin client on purpose: the URL and the QR are built from it.
    expect(rows[0]?.token).toBe('abcdefghijklmnopqrstuv');
  });
});
