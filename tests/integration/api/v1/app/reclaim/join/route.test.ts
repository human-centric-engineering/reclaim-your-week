/**
 * Integration test: POST /api/v1/app/reclaim/join/:token (F11).
 *
 * **This file exists because the unit tests could not have caught what shipped here.** They cover the
 * domain module, which was correct; the two defects were both in the route's wiring, and both only
 * appear when a real request goes through it:
 *
 *  1. **The honeypot was unreachable and returned a 500.** The schema carried `.max(0)` on `website`
 *     (copied from Sunrise's contact schema), so a filled honeypot failed validation before the
 *     handler's check ran — and with no error boundary on a public route, that threw a 500 instead
 *     of the indistinguishable-from-success 200 the trick depends on.
 *  2. **Every validation failure was a 500.** A mistyped email address, on the first screen a leader
 *     ever sees, returned a server error rather than a 400.
 *
 * So what is pinned below is the route's *edges*, not its happy path: the shapes a real visitor and a
 * real bot produce.
 *
 * @see app/api/v1/app/reclaim/join/[token]/route.ts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const { claimMock, linkFindUnique, userFindUnique } = vi.hoisted(() => ({
  claimMock: vi.fn(),
  linkFindUnique: vi.fn(),
  userFindUnique: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  prisma: {
    reclaimInviteLink: { findUnique: linkFindUnique },
    user: { findUnique: userFindUnique },
  },
}));

// The domain module is exercised directly in its own suite; here it is a boundary.
vi.mock('@/lib/app/programme/access/invite-links', async () => {
  const actual = await vi.importActual<typeof import('@/lib/app/programme/access/invite-links')>(
    '@/lib/app/programme/access/invite-links'
  );
  return { ...actual, claimInviteLink: claimMock };
});

import { POST } from '@/app/api/v1/app/reclaim/join/[token]/route';
import { InviteLinkRefused } from '@/lib/app/programme/access/invite-links';

const TOKEN = 'abcdefghijklmnopqrstuv';

function request(body: unknown): NextRequest {
  return new Request(`http://localhost/api/v1/app/reclaim/join/${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as NextRequest;
}

function call(body: unknown, token = TOKEN) {
  return POST(request(body), { params: Promise.resolve({ token }) });
}

async function json(res: Response) {
  return (await res.json()) as {
    success: boolean;
    data?: { outcome?: string; message?: string };
    error?: { message?: string; code?: string };
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  linkFindUnique.mockResolvedValue({ createdByUserId: 'admin1' });
  userFindUnique.mockResolvedValue({ name: 'Rashmir' });
  claimMock.mockResolvedValue({ outcome: 'invited' });
});

describe('POST /api/v1/app/reclaim/join/:token', () => {
  it('issues an invitation and points the person at their inbox', async () => {
    const res = await call({ name: 'Priya', email: 'priya@example.org' });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.data?.outcome).toBe('invited');
    expect(body.data?.message).toMatch(/check your email/i);
    expect(claimMock).toHaveBeenCalledWith(
      expect.objectContaining({ token: TOKEN, name: 'Priya', email: 'priya@example.org' })
    );
  });

  it('attributes the invitation to whoever minted the link', async () => {
    await call({ name: 'Priya', email: 'priya@example.org' });

    expect(claimMock).toHaveBeenCalledWith(expect.objectContaining({ inviterName: 'Rashmir' }));
  });

  it('falls back to the product name when the minting admin has been erased', async () => {
    linkFindUnique.mockResolvedValue({ createdByUserId: null });

    await call({ name: 'Priya', email: 'priya@example.org' });

    expect(claimMock).toHaveBeenCalledWith(
      expect.objectContaining({ inviterName: 'Reclaim Your Week' })
    );
  });

  describe('the honeypot', () => {
    it('answers a filled honeypot exactly as it answers a success', async () => {
      const real = await json(await call({ name: 'Priya', email: 'priya@example.org' }));
      const bot = await call({ name: 'Bot', email: 'bot@example.org', website: 'http://spam' });

      expect(bot.status).toBe(200);
      // Byte-identical to a genuine success. A 400 naming the field would tell whoever wrote the bot
      // precisely which input to leave alone next time.
      expect(await json(bot)).toEqual(real);
    });

    it('does no work at all for a filled honeypot', async () => {
      await call({ name: 'Bot', email: 'bot@example.org', website: 'http://spam' });

      // No claim means no seat taken and no invitation sent, which is the point of catching it here
      // rather than letting it through and relying on the seat cap.
      expect(claimMock).not.toHaveBeenCalled();
    });

    it('treats an empty honeypot as a real person', async () => {
      await call({ name: 'Priya', email: 'priya@example.org', website: '' });

      expect(claimMock).toHaveBeenCalled();
    });
  });

  describe('bad input is a 400, never a 500', () => {
    it.each([
      ['a mistyped email', { name: 'Priya', email: 'not-an-email' }],
      ['a missing name', { email: 'priya@example.org' }],
      ['a missing email', { name: 'Priya' }],
      ['a blank name', { name: '   ', email: 'priya@example.org' }],
    ])('rejects %s with a 400', async (_label, body) => {
      const res = await call(body);

      // This route is public and has no guard wrapper to fall back on. Before the error boundary was
      // added, every one of these was a 500 on the first screen a leader ever sees.
      expect(res.status).toBe(400);
      expect((await json(res)).error?.code).toBe('VALIDATION_ERROR');
      expect(claimMock).not.toHaveBeenCalled();
    });
  });

  describe('refusals', () => {
    it('404s a token that is not even the right shape, without querying', async () => {
      const res = await call({ name: 'Priya', email: 'priya@example.org' }, 'nope');

      expect(res.status).toBe(404);
      expect(linkFindUnique).not.toHaveBeenCalled();
      expect(claimMock).not.toHaveBeenCalled();
    });

    it('404s an unknown link', async () => {
      claimMock.mockRejectedValue(new InviteLinkRefused('unknown'));

      const res = await call({ name: 'Priya', email: 'priya@example.org' });

      expect(res.status).toBe(404);
      expect((await json(res)).error?.message).toMatch(/not one we recognise/i);
    });

    it.each([
      ['revoked', /has been closed/i],
      ['expired', /has expired/i],
      ['full', /reached the number of people/i],
    ] as const)('409s a %s link with its own sentence', async (reason, matcher) => {
      claimMock.mockRejectedValue(new InviteLinkRefused(reason));

      const res = await call({ name: 'Priya', email: 'priya@example.org' });

      // 409 rather than 404: the link exists and the person is holding the right address. Each
      // sentence tells someone in a room something different about what to do next (I17).
      expect(res.status).toBe(409);
      expect((await json(res)).error?.message).toMatch(matcher);
    });

    it('tells an existing account to sign in rather than claiming anything', async () => {
      claimMock.mockResolvedValue({ outcome: 'already_registered' });

      const res = await call({ name: 'Priya', email: 'priya@example.org' });

      expect(res.status).toBe(200);
      expect((await json(res)).data?.message).toMatch(/already have an account/i);
    });

    it('reads a repeat claim as the same reassurance as the first one', async () => {
      claimMock.mockResolvedValue({ outcome: 'already_claimed' });

      const res = await call({ name: 'Priya', email: 'priya@example.org' });

      expect(res.status).toBe(200);
      expect((await json(res)).data?.message).toMatch(/check your email/i);
    });
  });
});
