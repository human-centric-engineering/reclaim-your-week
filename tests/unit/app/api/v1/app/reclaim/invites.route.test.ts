/**
 * Unit tests: POST /api/v1/app/reclaim/invites — issuing a tiered invitation. Admin only.
 *
 * The behaviour under test is narrow and specific: this route hands the caller the `/accept-invite`
 * **link**, and it is the only route that does. That is what makes an invitation deliverable when its
 * email is not — a failed send, or an install with no mail provider, where the row is a perfectly good
 * invitation nobody can reach.
 *
 * Two things therefore have to be true, and neither is visible by reading the happy path:
 *   - the link reaches the response body, including when the email did **not** go out;
 *   - the link and its token reach **no log line**. A log is the one place a single-use credential
 *     outlives the request that needed it, and logs travel further than a response body ever does.
 *
 * The sibling `refer` route, callable by any participant, deliberately returns no link — a token for
 * creating an account at a given address must not go to whoever typed the address. That rule lives
 * with the client schemas (`adminIssueResultSchema`) and in `actions.test.ts`.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const { logInfo, logWarn } = vi.hoisted(() => ({ logInfo: vi.fn(), logWarn: vi.fn() }));

vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('@/lib/app/programme/access/invites', () => ({
  issueInvite: vi.fn(),
  listInvites: vi.fn(),
}));
vi.mock('@/lib/db/client', () => ({ prisma: { user: { findUnique: vi.fn() } } }));
vi.mock('@/lib/api/context', () => ({
  getRouteLogger: vi.fn(async () => ({ info: logInfo, warn: logWarn, error: vi.fn() })),
}));
vi.mock('@/lib/security/rate-limit', () => ({
  inviteLimiter: { check: vi.fn() },
  createRateLimitResponse: vi.fn(() =>
    Response.json(
      { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests' } },
      { status: 429 }
    )
  ),
}));

import { POST } from '@/app/api/v1/app/reclaim/invites/route';
import { auth } from '@/lib/auth/config';
import { issueInvite } from '@/lib/app/programme/access/invites';
import { prisma } from '@/lib/db/client';
import { inviteLimiter } from '@/lib/security/rate-limit';

const ADMIN_ID = 'admin-1';
const TOKEN = 'f'.repeat(64);
const LINK = `https://ryw.test/accept-invite?token=${TOKEN}&email=priya%40example.org`;

const req = (body: unknown, search = ''): NextRequest =>
  ({
    json: async () => body,
    headers: new Headers(),
    url: `http://localhost/api/v1/app/reclaim/invites${search}`,
  }) as unknown as NextRequest;

const VALID = { name: 'Priya', email: 'priya@example.org', tier: 'standard' };

const result = (over: Record<string, unknown> = {}) => ({
  invite: {
    id: 'inv1',
    email: 'priya@example.org',
    tier: 'standard',
    createdAt: new Date('2026-07-30T00:00:00Z'),
  },
  emailStatus: 'sent',
  expiresAt: new Date('2026-08-06T00:00:00Z'),
  invitationUrl: LINK,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth.api.getSession).mockResolvedValue({
    user: { id: ADMIN_ID, role: 'ADMIN', name: 'Rashmir' },
    session: { id: 's1' },
  } as never);
  vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
  vi.mocked(inviteLimiter.check).mockReturnValue({
    success: true,
    limit: 5,
    remaining: 4,
    reset: Date.now() + 60_000,
  });
  vi.mocked(issueInvite).mockResolvedValue(result() as never);
});

describe('POST reclaim invites — the invitation link', () => {
  it('returns the link in the response body', async () => {
    const res = await POST(req(VALID));
    const body = (await res.json()) as { data: { invitationUrl: string | null } };

    expect(res.status).toBe(201);
    expect(body.data.invitationUrl).toBe(LINK);
  });

  it('returns the link even when the email did not go out', async () => {
    // This is the case the whole feature exists for: the row is the entitlement and the email is only
    // its delivery, so a failed send leaves a usable invitation. Withholding the link here would
    // leave the operator looking at a row she can see and cannot act on.
    vi.mocked(issueInvite).mockResolvedValue(result({ emailStatus: 'failed' }) as never);

    const res = await POST(req(VALID));
    const body = (await res.json()) as {
      data: { invitationUrl: string | null; message: string };
    };

    expect(body.data.invitationUrl).toBe(LINK);
    expect(body.data.message).toMatch(/could not be sent/i);
  });

  it('passes a null link through when an invitation already stood', async () => {
    // Nothing was minted and only a hash is stored, so no link exists to return.
    vi.mocked(issueInvite).mockResolvedValue(
      result({ emailStatus: 'pending', invitationUrl: null }) as never
    );

    const res = await POST(req(VALID));
    const body = (await res.json()) as { data: { invitationUrl: string | null } };

    expect(res.status).toBe(200);
    expect(body.data.invitationUrl).toBeNull();
  });

  it('writes neither the link nor the token to any log line', async () => {
    await POST(req(VALID));

    const logged = JSON.stringify([...logInfo.mock.calls, ...logWarn.mock.calls]);
    expect(logged).not.toContain(TOKEN);
    expect(logged).not.toContain('/accept-invite');
    // Not a vacuous assertion: the line is written, and carries the things a log is for.
    expect(logged).toContain('inv1');
    expect(logged).toContain(ADMIN_ID);
  });
});

describe('POST reclaim invites — refusals still hold', () => {
  it('409s when an account already exists, before any token is minted', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'u1' } as never);

    const res = await POST(req(VALID));

    expect(res.status).toBe(409);
    expect(issueInvite).not.toHaveBeenCalled();
  });

  it('refuses a non-admin', async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: { id: 'u2', role: 'USER' },
      session: { id: 's2' },
    } as never);

    const res = await POST(req(VALID));

    expect(res.status).toBe(403);
    expect(issueInvite).not.toHaveBeenCalled();
  });

  it('short-circuits on the per-flow rate limit before issuing', async () => {
    vi.mocked(inviteLimiter.check).mockReturnValue({
      success: false,
      limit: 5,
      remaining: 0,
      reset: Date.now() + 60_000,
    });

    const res = await POST(req(VALID));

    expect(res.status).toBe(429);
    expect(issueInvite).not.toHaveBeenCalled();
  });

  it('asks for a re-send only when the query says so', async () => {
    await POST(req(VALID, '?resend=true'));
    expect(vi.mocked(issueInvite).mock.calls[0]?.[0]).toMatchObject({ resend: true });

    vi.mocked(issueInvite).mockClear();
    await POST(req(VALID));
    expect(vi.mocked(issueInvite).mock.calls[0]?.[0]).toMatchObject({ resend: false });
  });
});
