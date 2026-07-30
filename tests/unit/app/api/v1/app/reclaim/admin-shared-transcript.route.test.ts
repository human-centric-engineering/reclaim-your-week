/**
 * Unit tests: GET /api/v1/app/reclaim/admin/shared/:userId/:runId/transcript — one leader's
 * conversation, where they consented to it being read (F17 t-2). Admin only.
 *
 * **The gate is `readSharedTranscript`, not this route.** The lib function returns `null` for every
 * refusal — no share, results shared without transcript consent, somebody else's run, a run that
 * never opened one — and the route answers the same 404 for all of them. This file confirms the
 * route calls the right lib function with the right ids and surfaces its answer; it does not
 * re-prove D4's cross-user guard mechanism (that is `tests/unit/invariants/admin-support.test.ts`'s
 * job) or which refusal produced the `null` (that is `transcript.test.ts`'s job, if it exists).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('@/lib/app/programme/admin/transcript', () => ({ readSharedTranscript: vi.fn() }));

import { GET } from '@/app/api/v1/app/reclaim/admin/shared/[userId]/[runId]/transcript/route';
import { auth } from '@/lib/auth/config';
import { readSharedTranscript } from '@/lib/app/programme/admin/transcript';

const ADMIN_ID = 'admin-1';
const USER_ID = 'clxuser0000000000000000a';
const RUN_ID = 'clxrun00000000000000000a';

const getReq = (): NextRequest =>
  ({
    headers: new Headers(),
    url: `http://localhost/api/v1/app/reclaim/admin/shared/${USER_ID}/${RUN_ID}/transcript`,
  }) as unknown as NextRequest;

const ctx = (userId = USER_ID, runId = RUN_ID) => ({ params: Promise.resolve({ userId, runId }) });

const TRANSCRIPT = {
  runId: RUN_ID,
  quarter: 'Q3 2026',
  sharedAt: '2026-07-01T00:00:00.000Z',
  turns: [
    {
      id: 't1',
      role: 'leader' as const,
      text: 'I keep saying yes to everything.',
      at: '2026-06-01T00:00:00.000Z',
    },
    {
      id: 't2',
      role: 'coach' as const,
      text: 'What would saying no once look like?',
      at: '2026-06-01T00:01:00.000Z',
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth.api.getSession).mockResolvedValue({
    user: { id: ADMIN_ID, role: 'ADMIN' },
    session: { id: 's1' },
  } as never);
  vi.mocked(readSharedTranscript).mockResolvedValue(TRANSCRIPT);
});

describe('GET reclaim admin shared transcript — validation', () => {
  it('400s on a user id that is not a valid id, before the transcript is read', async () => {
    const res = await GET(getReq(), ctx('not-an-id', RUN_ID));

    expect(res.status).toBe(400);
    expect(readSharedTranscript).not.toHaveBeenCalled();
  });

  it('400s on a run id that is not a valid id', async () => {
    const res = await GET(getReq(), ctx(USER_ID, 'not-an-id'));

    expect(res.status).toBe(400);
    expect(readSharedTranscript).not.toHaveBeenCalled();
  });
});

describe('GET reclaim admin shared transcript — no consent, or nothing there', () => {
  it('404s alike for every refusal the lib function folds into null', async () => {
    vi.mocked(readSharedTranscript).mockResolvedValue(null);

    const res = await GET(getReq(), ctx());
    const body = (await res.json()) as { success: false; error: { code: string } };

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
  });
});

describe('GET reclaim admin shared transcript — success', () => {
  it('reads the transcript for the exact admin, subject and run in the path', async () => {
    await GET(getReq(), ctx());

    expect(readSharedTranscript).toHaveBeenCalledWith(ADMIN_ID, USER_ID, RUN_ID);
  });

  it('returns the transcript in the standard envelope', async () => {
    const res = await GET(getReq(), ctx());
    const body = (await res.json()) as { success: true; data: typeof TRANSCRIPT };

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ success: true, data: TRANSCRIPT });
  });
});
