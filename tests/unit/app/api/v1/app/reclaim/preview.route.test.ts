/**
 * The preview-account routes (F19). Admin only. Fabrication, erasure and Prisma are mocked.
 *
 * These pin the things the routes decide rather than delegate:
 *   - the **default email** is a plus-subaddress of the acting admin, so real product mail lands in
 *     her own inbox and nothing bounces against the sending domain in production;
 *   - the generated **password never reaches a log**, only the response body;
 *   - `DELETE` refuses anything outside the registry, which is what keeps a leaf route with a leaf
 *     rate limit from being a general-purpose "erase any user" endpoint;
 *   - a refused fast-forward comes back with **the engine's own sentence**, because "that account
 *     could not be advanced" would hide the one thing worth knowing.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const { logInfo, logWarn } = vi.hoisted(() => ({ logInfo: vi.fn(), logWarn: vi.fn() }));

vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('@/lib/api/context', () => ({
  getRouteLogger: vi.fn(async () => ({ info: logInfo, warn: logWarn, error: vi.fn() })),
}));
vi.mock('@/lib/db/client', () => ({
  prisma: { user: { findUnique: vi.fn() } },
}));
vi.mock('@/lib/app/programme/admin/preview-list', () => ({ listPreviewAccounts: vi.fn() }));
vi.mock('@/lib/app/programme/preview/accounts', () => ({
  isPreviewAccount: vi.fn(),
  registerPreviewAccount: vi.fn(),
}));
vi.mock('@/lib/privacy/erase-user', () => ({ eraseUser: vi.fn() }));
vi.mock('@/app/api/v1/app/reclaim/admin/preview/_lib/fabricate', () => ({
  provisionPreviewAccount: vi.fn(),
  fastForwardPreviewAccount: vi.fn(),
}));

import { GET, POST } from '@/app/api/v1/app/reclaim/admin/preview/route';
import { POST as ADOPT } from '@/app/api/v1/app/reclaim/admin/preview/adopt/route';
import { DELETE } from '@/app/api/v1/app/reclaim/admin/preview/[userId]/route';
import { POST as FAST_FORWARD } from '@/app/api/v1/app/reclaim/admin/preview/[userId]/fast-forward/route';
import { auth } from '@/lib/auth/config';
import { prisma } from '@/lib/db/client';
import { listPreviewAccounts } from '@/lib/app/programme/admin/preview-list';
import { isPreviewAccount, registerPreviewAccount } from '@/lib/app/programme/preview/accounts';
import { eraseUser } from '@/lib/privacy/erase-user';
import {
  provisionPreviewAccount,
  fastForwardPreviewAccount,
} from '@/app/api/v1/app/reclaim/admin/preview/_lib/fabricate';

const ADMIN_ID = 'admin-1';
const ADMIN_EMAIL = 'ada@example.org';
const PREVIEW_ID = 'preview-1';
const PASSWORD = 'Rwqwertyuiop7!';

const req = (body?: unknown): NextRequest =>
  ({
    json: async () => body,
    headers: new Headers(),
    url: 'http://localhost/api/v1/app/reclaim/admin/preview',
  }) as unknown as NextRequest;

const ctx = (userId = PREVIEW_ID) => ({ params: Promise.resolve({ userId }) });

const asUser = (over: Record<string, unknown> = {}) =>
  vi.mocked(auth.api.getSession).mockResolvedValue({
    user: { id: ADMIN_ID, role: 'ADMIN', email: ADMIN_EMAIL, name: 'Ada' },
    session: { id: 's1' },
    ...over,
  } as never);

beforeEach(() => {
  vi.clearAllMocks();
  asUser();
  vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
  vi.mocked(listPreviewAccounts).mockResolvedValue([]);
  vi.mocked(isPreviewAccount).mockResolvedValue(true);
  vi.mocked(provisionPreviewAccount).mockResolvedValue({
    userId: PREVIEW_ID,
    email: 'ada+rywpreview-abc123@example.org',
    password: PASSWORD,
  });
  vi.mocked(fastForwardPreviewAccount).mockResolvedValue({
    runId: 'run-1',
    reachedPhaseKey: 'phase-4-gap',
    atSummary: false,
  });
  vi.mocked(eraseUser).mockResolvedValue({ receiptId: 'r1', erasedAt: new Date() });
});

describe('GET preview', () => {
  it('returns the enriched list from listPreviewAccounts, unwrapped', async () => {
    const row = {
      userId: PREVIEW_ID,
      name: 'Test Leader',
      email: 'test@example.org',
      label: 'walkthrough',
      createdAt: '2026-07-30T00:00:00.000Z',
      createdByName: 'Ada',
      state: 'complete' as const,
      latestRunId: 'run-1',
    };
    vi.mocked(listPreviewAccounts).mockResolvedValue([row]);

    const res = await GET(req());
    const body = (await res.json()) as { data: { accounts: unknown[] } };

    expect(res.status).toBe(200);
    expect(body.data.accounts).toEqual([row]);
  });
});

describe('POST preview — the default email', () => {
  it('uses a plus-subaddress of the acting admin when none is given', async () => {
    // The point of the default: everything the product sends a leader arrives in the operator's own
    // inbox, and nothing bounces against the sending domain in production.
    await POST(req({ label: 'walkthrough', state: 'fresh' }));

    const email = vi.mocked(provisionPreviewAccount).mock.calls[0]?.[0].email ?? '';
    expect(email).toMatch(/^ada\+rywpreview-[a-z0-9]+@example\.org$/);
  });

  it('gives every account a different address', async () => {
    await POST(req({ label: 'one', state: 'fresh' }));
    await POST(req({ label: 'two', state: 'fresh' }));

    const [first, second] = vi.mocked(provisionPreviewAccount).mock.calls.map((c) => c[0].email);
    expect(first).not.toBe(second);
  });

  it('uses an address the operator typed instead', async () => {
    await POST(req({ label: 'walkthrough', email: 'Someone@Example.COM', state: 'fresh' }));

    expect(vi.mocked(provisionPreviewAccount).mock.calls[0]?.[0].email).toBe('someone@example.com');
  });

  it('409s when an account already exists, before provisioning anything', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'u1' } as never);

    const res = await POST(req({ label: 'walkthrough', email: 'taken@example.org' }));

    expect(res.status).toBe(409);
    expect(provisionPreviewAccount).not.toHaveBeenCalled();
  });
});

describe('POST preview — the password', () => {
  it('returns it in the body', async () => {
    const res = await POST(req({ label: 'walkthrough', state: 'fresh' }));
    const body = (await res.json()) as { data: { password: string } };

    expect(res.status).toBe(201);
    expect(body.data.password).toBe(PASSWORD);
  });

  it('never writes it to a log', async () => {
    // A generated credential in a log line outlives the one render it was meant for, and logs travel
    // further than a response body ever does.
    await POST(req({ label: 'walkthrough', state: 'fresh' }));

    const logged = JSON.stringify([...logInfo.mock.calls, ...logWarn.mock.calls]);
    expect(logged).not.toContain(PASSWORD);
    expect(logged).toContain(ADMIN_ID);
  });
});

describe('POST preview — the state', () => {
  it('does not fabricate an audit for a fresh account', async () => {
    // "Ready to begin" has to actually begin at the consent gate, which is the screen every leader
    // meets and the one a fabricated audit would skip past.
    await POST(req({ label: 'walkthrough', state: 'fresh' }));

    expect(fastForwardPreviewAccount).not.toHaveBeenCalled();
  });

  it.each(['mid-audit', 'summary'] as const)('fast-forwards to %s', async (state) => {
    await POST(req({ label: 'walkthrough', state }));

    expect(fastForwardPreviewAccount).toHaveBeenCalledWith(PREVIEW_ID, state);
  });

  it('defaults to fresh when no state is given', async () => {
    await POST(req({ label: 'walkthrough' }));

    expect(fastForwardPreviewAccount).not.toHaveBeenCalled();
  });
});

describe('adopt', () => {
  it('registers an existing account', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'u9', role: 'USER' } as never);

    const res = await ADOPT(req({ email: 'you+t1@example.org', label: 'front door walk' }));

    expect(res.status).toBe(200);
    expect(registerPreviewAccount).toHaveBeenCalledWith({
      userId: 'u9',
      label: 'front door walk',
      createdByUserId: ADMIN_ID,
    });
  });

  it('404s for an address with no account', async () => {
    const res = await ADOPT(req({ email: 'nobody@example.org', label: 'x' }));

    expect(res.status).toBe(404);
    expect(registerPreviewAccount).not.toHaveBeenCalled();
  });

  it('refuses an admin account', async () => {
    // Easy mistake to make — her own address is the obvious thing to type — and hard to notice
    // afterwards, because the account would silently drop out of every figure while still being a
    // real login.
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'u9', role: 'ADMIN' } as never);

    const res = await ADOPT(req({ email: ADMIN_EMAIL, label: 'oops' }));

    expect(res.status).toBe(400);
    expect(registerPreviewAccount).not.toHaveBeenCalled();
  });
});

describe('DELETE preview', () => {
  it('erases through eraseUser, never a row delete', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      email: 'test@example.org',
      role: 'USER',
    } as never);

    const res = await DELETE(req(), ctx());

    expect(res.status).toBe(200);
    expect(eraseUser).toHaveBeenCalledWith({
      userId: PREVIEW_ID,
      userEmail: 'test@example.org',
      actorUserId: ADMIN_ID,
      reason: 'admin_action',
    });
  });

  it('404s for an account outside the registry, before reading the user', async () => {
    // This is the check that stops a leaf route with a leaf rate limit becoming a general-purpose
    // "erase any user" endpoint.
    vi.mocked(isPreviewAccount).mockResolvedValue(false);

    const res = await DELETE(req(), ctx('a-real-leader'));

    expect(res.status).toBe(404);
    expect(eraseUser).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('refuses self-erasure', async () => {
    const res = await DELETE(req(), ctx(ADMIN_ID));

    expect(res.status).toBe(400);
    expect(eraseUser).not.toHaveBeenCalled();
  });

  it('refuses an admin account even if one is somehow in the registry', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      email: 'other-admin@example.org',
      role: 'ADMIN',
    } as never);

    const res = await DELETE(req(), ctx());

    expect(res.status).toBe(400);
    expect(eraseUser).not.toHaveBeenCalled();
  });

  it('says what survives, because it looks like a bug otherwise', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      email: 'test@example.org',
      role: 'USER',
    } as never);

    const res = await DELETE(req(), ctx());
    const body = (await res.json()) as { data: { message: string } };

    // A redeemed invitation with a dash where a name was is correct and reads as broken.
    expect(body.data.message).toMatch(/invitation/i);
  });
});

describe('fast-forward', () => {
  it('passes the target through and returns the server’s sentence', async () => {
    const res = await FAST_FORWARD(req({ to: 'mid-audit', toPhase: 'phase-2-energy' }), ctx());
    const body = (await res.json()) as { data: { message: string } };

    expect(res.status).toBe(200);
    expect(fastForwardPreviewAccount).toHaveBeenCalledWith(PREVIEW_ID, 'mid-audit', {
      toPhase: 'phase-2-energy',
    });
    expect(body.data.message).toContain('phase-4-gap');
  });

  it('400s on a phase the audit does not have', async () => {
    const res = await FAST_FORWARD(req({ to: 'mid-audit', toPhase: 'phase-9-invented' }), ctx());

    expect(res.status).toBe(400);
    expect(fastForwardPreviewAccount).not.toHaveBeenCalled();
  });

  it('passes a quarter through when the operator gives one', async () => {
    await FAST_FORWARD(req({ to: 'mid-audit', quarter: '2026 Q4' }), ctx());

    expect(fastForwardPreviewAccount).toHaveBeenCalledWith(PREVIEW_ID, 'mid-audit', {
      quarter: '2026 Q4',
    });
  });

  it('says the run is waiting at the summary, and that finishing is the operator’s', async () => {
    // The message is the only thing that tells an operator where signing in will land them, and the
    // one it replaced said "completed audit" for a state that opened on the invitation to begin.
    vi.mocked(fastForwardPreviewAccount).mockResolvedValue({
      runId: 'run-1',
      reachedPhaseKey: 'phase-6-summary',
      atSummary: true,
    });

    const res = await FAST_FORWARD(req({ to: 'summary' }), ctx());
    const body = (await res.json()) as { data: { message: string } };

    expect(body.data.message).toMatch(/summary/i);
    expect(body.data.message).toMatch(/finishing it is yours/i);
  });

  it('surfaces the engine’s own refusal rather than a generic failure', async () => {
    // The one thing this endpoint is uniquely good at telling an operator: the product refused a step
    // it used to allow. Flattening that into "could not be advanced" throws the finding away.
    vi.mocked(fastForwardPreviewAccount).mockRejectedValue(
      new Error('preview: the engine refused to leave phase-1-current (reflection required)')
    );

    const res = await FAST_FORWARD(req({ to: 'summary' }), ctx());
    const body = (await res.json()) as { error: { message: string } };

    expect(res.status).toBe(400);
    expect(body.error.message).toContain('refused to leave phase-1-current');
  });

  it('falls back to a generic message when the rejection is not an Error', async () => {
    // A thrown string or object has no `.message` — the fallback is what keeps the response envelope
    // from crashing on `undefined` rather than returning something a human can read.
    vi.mocked(fastForwardPreviewAccount).mockRejectedValue('not an Error instance');

    const res = await FAST_FORWARD(req({ to: 'summary' }), ctx());
    const body = (await res.json()) as { error: { message: string } };

    expect(res.status).toBe(400);
    expect(body.error.message).toBe('That account could not be advanced.');
  });
});

describe('every preview route is admin-only', () => {
  const asPlainUser = () =>
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: { id: 'u2', role: 'USER', email: 'u2@example.org' },
      session: { id: 's2' },
    } as never);

  it.each([
    ['GET', () => GET(req())],
    ['POST', () => POST(req({ label: 'x' }))],
    ['adopt', () => ADOPT(req({ email: 'a@b.co', label: 'x' }))],
    ['fast-forward', () => FAST_FORWARD(req({ to: 'summary' }), ctx())],
    ['DELETE', () => DELETE(req(), ctx())],
  ])('%s refuses a non-admin', async (_name, call) => {
    asPlainUser();

    expect((await call()).status).toBe(403);
  });
});
