/**
 * Unit tests: POST /api/v1/app/reclaim/runs/:runId/abandon — let an audit go (F16 t-1).
 *
 * Ownership is `abandonRun`'s own first act (`loadOwnedRun` inside it), so this file does not
 * re-prove that logic — `runs-service.test.ts` (if it exists) or an equivalent owns that — it just
 * confirms the route surfaces a thrown error as the right HTTP response.
 *
 * **Deliberately no request body.** The route's own docstring says why: asking a leaving leader for
 * a reason is a retention survey Brief §2 forbids. The dedicated regression test below asserts the
 * route never calls `request.json()` at all — a future change that started reading a body would be a
 * quiet reintroduction of exactly what this route was built to avoid.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { NotFoundError, ValidationError } from '@/lib/api/errors';

vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('@/app/api/v1/app/reclaim/runs/service', () => ({ abandonRun: vi.fn() }));

import { POST } from '@/app/api/v1/app/reclaim/runs/[runId]/abandon/route';
import { auth } from '@/lib/auth/config';
import { abandonRun } from '@/app/api/v1/app/reclaim/runs/service';

const USER_ID = 'user-1';
const RUN_ID = 'clxrun00000000000000000a';

const ctx = (runId = RUN_ID) => ({ params: Promise.resolve({ runId }) });

const ABANDONED_RUN = {
  id: RUN_ID,
  status: 'abandoned',
  abandonedAt: new Date('2026-07-30T00:00:00.000Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth.api.getSession).mockResolvedValue({
    user: { id: USER_ID },
    session: { id: 's1' },
  } as never);
  vi.mocked(abandonRun).mockResolvedValue(ABANDONED_RUN as never);
});

describe('POST reclaim run abandon — no body, by design', () => {
  it('never calls request.json() — the route takes no body at all', async () => {
    const jsonSpy = vi.fn();
    const req = { json: jsonSpy, headers: new Headers() } as unknown as NextRequest;

    await POST(req, ctx());

    expect(jsonSpy).not.toHaveBeenCalled();
  });

  it('lets an audit go even when the request object has no readable body', async () => {
    // A request whose .json() would throw if called — proves the route really never touches it.
    const req = {
      json: () => Promise.reject(new Error('should never be called')),
      headers: new Headers(),
    } as unknown as NextRequest;

    const res = await POST(req, ctx());

    expect(res.status).toBe(200);
  });
});

describe('POST reclaim run abandon — validation', () => {
  it('400s on a run id that is not a valid id, before the service is touched', async () => {
    const req = { json: vi.fn(), headers: new Headers() } as unknown as NextRequest;

    const res = await POST(req, ctx('not-an-id'));

    expect(res.status).toBe(400);
    expect(abandonRun).not.toHaveBeenCalled();
  });
});

describe('POST reclaim run abandon — ownership and state, surfaced from the service', () => {
  const req = { json: vi.fn(), headers: new Headers() } as unknown as NextRequest;

  it("is a 404 for a run that is not the caller's", async () => {
    vi.mocked(abandonRun).mockRejectedValue(new NotFoundError(`Audit run ${RUN_ID} not found`));

    const res = await POST(req, ctx());

    expect(res.status).toBe(404);
  });

  it('is a 400 when the service refuses to let go of a finished audit', async () => {
    vi.mocked(abandonRun).mockRejectedValue(
      new ValidationError('That audit is already finished', {
        run: ['A finished audit cannot be let go. It stays in your history.'],
      })
    );

    const res = await POST(req, ctx());

    expect(res.status).toBe(400);
  });
});

describe('POST reclaim run abandon — success', () => {
  it('calls the service with the caller and the run id from the path', async () => {
    const req = { json: vi.fn(), headers: new Headers() } as unknown as NextRequest;

    await POST(req, ctx());

    expect(abandonRun).toHaveBeenCalledWith(USER_ID, RUN_ID);
  });

  it('returns the updated run in the standard envelope', async () => {
    const req = { json: vi.fn(), headers: new Headers() } as unknown as NextRequest;

    const res = await POST(req, ctx());
    const body = (await res.json()) as {
      success: true;
      data: { id: string; status: string; abandonedAt: string };
    };

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: { id: RUN_ID, status: 'abandoned' },
    });
  });
});
