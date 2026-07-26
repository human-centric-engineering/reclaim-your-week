/**
 * Tiered invites (F8 t-1). Prisma, Sunrise's token store, and email are mocked — no DB, no network.
 *
 * Load-bearing behaviours, in the order they can hurt:
 *   - the **plaintext token is never persisted** in the leaf row (only its SHA-256);
 *   - a re-issue **rotates in place** rather than creating a second live invite, so a referral's
 *     `invitedByUserId` (the only link back to the referrer, F8 t-3) survives;
 *   - a pending invite is not silently duplicated;
 *   - revoking kills Sunrise's token too, so the accept-invite link dies with the row;
 *   - the admin list resolves names in one query (no per-row fetches).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHash } from 'crypto';

const {
  inviteFindFirst,
  inviteFindUnique,
  inviteFindMany,
  inviteCreate,
  inviteUpdate,
  userFindMany,
  generateToken,
  updateToken,
  getValid,
  deleteToken,
  sendEmailMock,
  resolveTemplate,
} = vi.hoisted(() => ({
  inviteFindFirst: vi.fn(),
  inviteFindUnique: vi.fn(),
  inviteFindMany: vi.fn(),
  inviteCreate: vi.fn(),
  inviteUpdate: vi.fn(),
  userFindMany: vi.fn(),
  generateToken: vi.fn(),
  updateToken: vi.fn(),
  getValid: vi.fn(),
  deleteToken: vi.fn(),
  sendEmailMock: vi.fn(),
  resolveTemplate: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  prisma: {
    reclaimInvite: {
      findFirst: inviteFindFirst,
      findUnique: inviteFindUnique,
      findMany: inviteFindMany,
      create: inviteCreate,
      update: inviteUpdate,
    },
    user: { findMany: userFindMany },
  },
}));
vi.mock('@/lib/utils/invitation-token', () => ({
  generateInvitationToken: generateToken,
  updateInvitationToken: updateToken,
  getValidInvitation: getValid,
  deleteInvitationToken: deleteToken,
}));
vi.mock('@/lib/email/send', () => ({ sendEmail: sendEmailMock }));
vi.mock('@/lib/email/registry', () => ({ resolveEmailTemplate: resolveTemplate }));

import {
  issueInvite,
  revokeInvite,
  listInvites,
  findLiveInviteForEmail,
  hashInviteToken,
  inviteIsLive,
} from '@/lib/app/programme/access/invites';

const PLAINTEXT = 'a'.repeat(64);

const invite = (over: Record<string, unknown> = {}) => ({
  id: 'inv1',
  email: 'leader@example.org',
  token: hashInviteToken(PLAINTEXT),
  tier: 'standard',
  invitedByUserId: null,
  redeemedByUserId: null,
  redeemedAt: null,
  revokedAt: null,
  emailStatus: 'sent',
  // F11: null here is the ordinary case — an invite Rashmir typed rather than one claimed from a
  // group link. `invite-links.test.ts` covers the populated side.
  viaLinkId: null,
  createdAt: new Date('2026-07-01T00:00:00Z'),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  generateToken.mockResolvedValue(PLAINTEXT);
  updateToken.mockResolvedValue(PLAINTEXT);
  getValid.mockResolvedValue(null);
  deleteToken.mockResolvedValue(undefined);
  inviteFindFirst.mockResolvedValue(null);
  inviteCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve(invite(data))
  );
  inviteUpdate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve(invite(data))
  );
  sendEmailMock.mockResolvedValue({ success: true, status: 'sent', id: 'e1' });
  resolveTemplate.mockReturnValue(null);
});

describe('hashInviteToken', () => {
  it('is the same SHA-256 hex digest Sunrise stores, so the two records pair up', () => {
    expect(hashInviteToken(PLAINTEXT)).toBe(createHash('sha256').update(PLAINTEXT).digest('hex'));
    expect(hashInviteToken(PLAINTEXT)).toHaveLength(64);
  });
});

describe('issueInvite', () => {
  it('persists the token HASH and never the plaintext', async () => {
    await issueInvite({
      email: 'Leader@Example.org',
      tier: 'client',
      inviteeName: 'Priya',
      inviterName: 'Rashmir',
    });

    const created = inviteCreate.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(created.data.token).toBe(hashInviteToken(PLAINTEXT));
    expect(JSON.stringify(created.data)).not.toContain(PLAINTEXT);
    expect(created.data.tier).toBe('client');
    // Email is normalised, so a hand-typed invitation still matches the account better-auth creates.
    expect(created.data.email).toBe('leader@example.org');
  });

  it('sends the invitation email with the accept-invite link carrying the PLAINTEXT token', async () => {
    await issueInvite({
      email: 'leader@example.org',
      tier: 'standard',
      inviteeName: 'Priya',
      inviterName: 'Rashmir',
    });

    const props = resolveTemplate.mock.calls[0]?.[1] as { invitationUrl: string };
    expect(props.invitationUrl).toContain(`token=${PLAINTEXT}`);
    expect(props.invitationUrl).toContain('/accept-invite');
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it('does not duplicate a pending invitation when resend is not requested', async () => {
    getValid.mockResolvedValue({ expiresAt: new Date('2026-07-08T00:00:00Z') });
    inviteFindFirst.mockResolvedValue(invite());

    const result = await issueInvite({
      email: 'leader@example.org',
      tier: 'standard',
      inviteeName: 'Priya',
      inviterName: 'Rashmir',
    });

    expect(result.emailStatus).toBe('pending');
    expect(inviteCreate).not.toHaveBeenCalled();
    expect(generateToken).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('rotates the token on the standing row on resend, preserving referral attribution', async () => {
    getValid.mockResolvedValue({ expiresAt: new Date('2026-07-08T00:00:00Z') });
    inviteFindFirst.mockResolvedValue(invite({ tier: 'referral', invitedByUserId: 'referrer1' }));

    await issueInvite({
      email: 'leader@example.org',
      tier: 'referral',
      inviteeName: 'Priya',
      inviterName: 'Rashmir',
      resend: true,
    });

    expect(inviteCreate).not.toHaveBeenCalled();
    const updated = inviteUpdate.mock.calls[0]?.[0] as {
      where: { id: string };
      data: Record<string, unknown>;
    };
    expect(updated.where.id).toBe('inv1');
    // The update must not touch invitedByUserId — losing it strands the referrer's unlock (t-3).
    expect(updated.data).not.toHaveProperty('invitedByUserId');
    expect(updateToken).toHaveBeenCalledTimes(1);
  });

  it('still returns the invite when the email fails — the row is the entitlement', async () => {
    sendEmailMock.mockResolvedValue({ success: false, status: 'failed', error: 'smtp down' });

    const result = await issueInvite({
      email: 'leader@example.org',
      tier: 'standard',
      inviteeName: 'Priya',
      inviterName: 'Rashmir',
    });

    expect(result.emailStatus).toBe('failed');
    expect(result.invite.tier).toBe('standard');
  });

  it.each(['sent', 'failed', 'disabled'] as const)(
    'records an email outcome of %s on the row',
    async (status) => {
      sendEmailMock.mockResolvedValue({ success: status === 'sent', status });

      await issueInvite({
        email: 'leader@example.org',
        tier: 'standard',
        inviteeName: 'Priya',
        inviterName: 'Rashmir',
      });

      // Without this write the failure exists only in a log, and the admin screen shows a row
      // indistinguishable from one that arrived — someone perfectly invited who never heard.
      expect(inviteUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: { emailStatus: status } })
      );
    }
  );
});

describe('findLiveInviteForEmail', () => {
  it('asks only for unredeemed, unrevoked invites, earliest first, case-insensitively', async () => {
    await findLiveInviteForEmail('Leader@Example.org');

    const args = inviteFindFirst.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
      orderBy: Record<string, string>;
    };
    expect(args.where.redeemedAt).toBeNull();
    expect(args.where.revokedAt).toBeNull();
    expect(args.where.email).toEqual({ equals: 'Leader@Example.org', mode: 'insensitive' });
    expect(args.orderBy).toEqual({ createdAt: 'asc' });
  });
});

describe('inviteIsLive', () => {
  it('is false once redeemed or revoked', () => {
    expect(inviteIsLive(invite())).toBe(true);
    expect(inviteIsLive(invite({ redeemedAt: new Date() }))).toBe(false);
    expect(inviteIsLive(invite({ revokedAt: new Date() }))).toBe(false);
  });
});

describe('revokeInvite', () => {
  it('marks the row revoked and deletes Sunrise’s token so the link dies with it', async () => {
    inviteFindUnique.mockResolvedValue(invite());
    inviteUpdate.mockResolvedValue(invite({ revokedAt: new Date('2026-07-05T00:00:00Z') }));

    const revoked = await revokeInvite('inv1');

    expect(deleteToken).toHaveBeenCalledWith('leader@example.org');
    expect(revoked?.revokedAt).not.toBeNull();
  });

  it('refuses to revoke a redeemed invite — that entitlement already exists', async () => {
    inviteFindUnique.mockResolvedValue(invite({ redeemedAt: new Date(), redeemedByUserId: 'u1' }));

    expect(await revokeInvite('inv1')).toBeNull();
    expect(deleteToken).not.toHaveBeenCalled();
    expect(inviteUpdate).not.toHaveBeenCalled();
  });
});

describe('listInvites', () => {
  it('resolves both user names in ONE query, not one per row', async () => {
    inviteFindMany.mockResolvedValue([
      invite({ id: 'a', invitedByUserId: 'u1', redeemedByUserId: 'u2', redeemedAt: new Date() }),
      invite({ id: 'b', invitedByUserId: 'u1' }),
      invite({ id: 'c', revokedAt: new Date() }),
    ]);
    userFindMany.mockResolvedValue([
      { id: 'u1', name: 'Priya' },
      { id: 'u2', name: 'Sam' },
    ]);

    const rows = await listInvites();

    expect(userFindMany).toHaveBeenCalledTimes(1);
    const asked = userFindMany.mock.calls[0]?.[0] as { where: { id: { in: string[] } } };
    expect(asked.where.id.in.sort()).toEqual(['u1', 'u2']);
    expect(rows.map((r) => r.status)).toEqual(['redeemed', 'pending', 'revoked']);
    expect(rows[0]?.invitedByName).toBe('Priya');
    expect(rows[0]?.redeemedByName).toBe('Sam');
  });

  it('skips the user query entirely when no invite references a user', async () => {
    inviteFindMany.mockResolvedValue([invite()]);

    const rows = await listInvites();

    expect(userFindMany).not.toHaveBeenCalled();
    expect(rows[0]?.invitedByName).toBeNull();
  });
});
