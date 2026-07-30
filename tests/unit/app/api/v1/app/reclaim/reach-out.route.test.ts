/**
 * Unit tests: GET/POST /api/v1/app/reclaim/admin/clients/:userId/reach-out — writing to a leader
 * who stopped (F18 t-2). Admin only.
 *
 * GET returns the opening draft plus what was already sent; POST sends whatever the operator typed
 * (never a template keyed off the draft) and records it whichever way the send goes.
 *
 * Three things worth a dedicated test beyond the happy path: the subject's `\r`/`\n` refusal (a
 * mail-header-injection guard — the route's own docstring calls this out), the per-flow
 * `inviteLimiter` sub-cap short-circuiting before `sendReachOut` is ever called, and 404 for a
 * subject with no programme footprint at all (`listClients` finds nobody).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('@/lib/app/programme/admin/clients', () => ({ listClients: vi.fn() }));
vi.mock('@/lib/app/programme/admin/reach-out', () => ({
  buildReachOutDraft: vi.fn(),
  listReachOuts: vi.fn(),
  sendReachOut: vi.fn(),
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

import { GET, POST } from '@/app/api/v1/app/reclaim/admin/clients/[userId]/reach-out/route';
import { auth } from '@/lib/auth/config';
import { listClients } from '@/lib/app/programme/admin/clients';
import {
  buildReachOutDraft,
  listReachOuts,
  sendReachOut,
} from '@/lib/app/programme/admin/reach-out';
import { inviteLimiter } from '@/lib/security/rate-limit';

const ADMIN_ID = 'admin-1';
const USER_ID = 'clxuser0000000000000000a';

const req = (body?: unknown): NextRequest =>
  ({
    json: async () => body,
    headers: new Headers(),
    url: `http://localhost/api/v1/app/reclaim/admin/clients/${USER_ID}/reach-out`,
  }) as unknown as NextRequest;

const getReq = (): NextRequest =>
  ({
    headers: new Headers(),
    url: `http://localhost/api/v1/app/reclaim/admin/clients/${USER_ID}/reach-out`,
  }) as unknown as NextRequest;

const ctx = (userId = USER_ID) => ({ params: Promise.resolve({ userId }) });

const CLIENT_ROW = {
  userId: USER_ID,
  name: 'Sam Client',
  currentPhaseLabel: 'Energy',
  qualification: { reclaim_profile_first_name: 'Sam' },
};

const DRAFT = {
  subject: 'Your time audit is still open',
  body: 'Hello Sam,\n\nYou started a time audit...',
  auditRunId: 'run-1',
  phaseLabel: 'Energy',
  alreadyWrittenForThisRun: false,
  optedOutOfNudges: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth.api.getSession).mockResolvedValue({
    user: { id: ADMIN_ID, role: 'ADMIN' },
    session: { id: 's1' },
  } as never);
  vi.mocked(listClients).mockResolvedValue({
    clients: [CLIENT_ROW],
    abandonedAfterDays: 21,
  } as never);
  vi.mocked(buildReachOutDraft).mockResolvedValue(DRAFT);
  vi.mocked(listReachOuts).mockResolvedValue([] as never);
  vi.mocked(inviteLimiter.check).mockReturnValue({
    success: true,
    limit: 5,
    remaining: 4,
    reset: Date.now() + 60_000,
  });
  vi.mocked(sendReachOut).mockResolvedValue({
    delivered: true,
    record: {
      id: 'reach-out-1',
      auditRunId: 'run-1',
      subject: 'Hi',
      body: 'Body',
      status: 'sent',
      sentAt: new Date().toISOString(),
      sentByName: 'Rashmir',
    },
  });
});

describe('GET reclaim admin reach-out — validation', () => {
  it('400s on a user id that is not a valid id, before any client is read', async () => {
    const res = await GET(getReq(), ctx('not-an-id'));

    expect(res.status).toBe(400);
    expect(listClients).not.toHaveBeenCalled();
  });
});

describe('GET reclaim admin reach-out — no programme footprint', () => {
  it('404s when the subject has no programme record at all', async () => {
    vi.mocked(listClients).mockResolvedValue({ clients: [], abandonedAfterDays: 21 });

    const res = await GET(getReq(), ctx());

    expect(res.status).toBe(404);
    expect(buildReachOutDraft).not.toHaveBeenCalled();
  });
});

describe('GET reclaim admin reach-out — success', () => {
  it('builds the draft from the qualification-derived first name and the phase label, and returns both facts', async () => {
    const res = await GET(getReq(), ctx());
    const body = (await res.json()) as { success: true; data: { draft: unknown; sent: unknown[] } };

    expect(res.status).toBe(200);
    expect(buildReachOutDraft).toHaveBeenCalledWith(ADMIN_ID, USER_ID, {
      firstName: 'Sam',
      phaseLabel: 'Energy',
    });
    expect(body).toMatchObject({ success: true, data: { draft: DRAFT, sent: [] } });
  });

  it('reads the client narrowed to this one subject, not the whole cohort', async () => {
    await GET(getReq(), ctx());

    expect(listClients).toHaveBeenCalledWith(ADMIN_ID, [USER_ID]);
  });

  it('falls back to the account name when no qualification first-name slot is present', async () => {
    vi.mocked(listClients).mockResolvedValue({
      clients: [{ ...CLIENT_ROW, qualification: {}, name: 'Ada Lovelace' }],
      abandonedAfterDays: 21,
    } as never);

    await GET(getReq(), ctx());

    expect(buildReachOutDraft).toHaveBeenCalledWith(ADMIN_ID, USER_ID, {
      firstName: 'Ada',
      phaseLabel: 'Energy',
    });
  });
});

describe('POST reclaim admin reach-out — rate limiting', () => {
  it('short-circuits with 429 before the schema or the service is touched when the invite cap is exceeded', async () => {
    vi.mocked(inviteLimiter.check).mockReturnValue({
      success: false,
      limit: 5,
      remaining: 0,
      reset: Date.now() + 60_000,
    });

    const res = await POST(req({ subject: 'Hi', body: 'Body text' }), ctx());

    expect(res.status).toBe(429);
    expect(sendReachOut).not.toHaveBeenCalled();
  });
});

describe('POST reclaim admin reach-out — validation', () => {
  it('400s on a user id that is not a valid id, before the rate limiter or the service run', async () => {
    const res = await POST(req({ subject: 'Hi', body: 'Body text' }), ctx('not-an-id'));

    expect(res.status).toBe(400);
    expect(inviteLimiter.check).not.toHaveBeenCalled();
    expect(sendReachOut).not.toHaveBeenCalled();
  });

  it('refuses a subject containing a line break, and never reaches the service', async () => {
    const res = await POST(req({ subject: 'Hi\nBcc: evil@example.com', body: 'Body text' }), ctx());
    const body = (await res.json()) as {
      error: { details: { errors: Array<{ message: string }> } };
    };

    expect(res.status).toBe(400);
    expect(
      body.error.details.errors.some((e) => e.message === 'A subject cannot contain a line break')
    ).toBe(true);
    expect(sendReachOut).not.toHaveBeenCalled();
  });

  it('refuses a subject containing a carriage return the same way', async () => {
    const res = await POST(
      req({ subject: 'Hi\r\nBcc: evil@example.com', body: 'Body text' }),
      ctx()
    );

    expect(res.status).toBe(400);
    expect(sendReachOut).not.toHaveBeenCalled();
  });

  it('400s on an empty body', async () => {
    const res = await POST(req({ subject: 'Hi', body: '' }), ctx());

    expect(res.status).toBe(400);
    expect(sendReachOut).not.toHaveBeenCalled();
  });

  it('400s on a subject over 200 characters', async () => {
    const res = await POST(req({ subject: 'x'.repeat(201), body: 'Body text' }), ctx());

    expect(res.status).toBe(400);
    expect(sendReachOut).not.toHaveBeenCalled();
  });
});

describe('POST reclaim admin reach-out — success', () => {
  it('sends whatever the operator typed, not the draft, and echoes the chosen audit run', async () => {
    const res = await POST(
      req({ subject: 'Custom subject', body: 'Custom body', auditRunId: 'run-9' }),
      ctx()
    );
    const body = (await res.json()) as { success: true; data: { delivered: boolean } };

    expect(res.status).toBe(200);
    expect(sendReachOut).toHaveBeenCalledWith({
      adminUserId: ADMIN_ID,
      userId: USER_ID,
      subject: 'Custom subject',
      body: 'Custom body',
      auditRunId: 'run-9',
    });
    expect(body).toMatchObject({ success: true, data: { delivered: true } });
  });

  it('defaults a missing auditRunId to null rather than undefined', async () => {
    await POST(req({ subject: 'Hi', body: 'Body text' }), ctx());

    expect(sendReachOut).toHaveBeenCalledWith(expect.objectContaining({ auditRunId: null }));
  });

  it('404s when the leader has no account left to write to', async () => {
    vi.mocked(sendReachOut).mockResolvedValue(null);

    const res = await POST(req({ subject: 'Hi', body: 'Body text' }), ctx());

    expect(res.status).toBe(404);
  });
});
