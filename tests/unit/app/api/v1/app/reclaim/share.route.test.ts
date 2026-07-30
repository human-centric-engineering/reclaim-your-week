/**
 * Unit tests: POST /api/v1/app/reclaim/runs/:runId/share — the Phase 6 share (F7 t-4).
 *
 * Two things happen on a share: the optional `reclaim_share_*` capture is saved (only the fields the
 * leader actually gave), and `createShare` mints whatever the leader opted into. `shareTranscript`
 * (F17) is threaded straight to `createShare` and never turned into a saved slot of its own — that
 * distinction is worth its own test, since it is easy to mistake for one more `flag()` call.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { NotFoundError } from '@/lib/api/errors';

vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('@/app/api/v1/app/reclaim/runs/service', () => ({
  loadOwnedRun: vi.fn(),
  saveRunAnswers: vi.fn(),
}));
vi.mock('@/lib/app/programme/share', () => ({ createShare: vi.fn() }));

import { POST } from '@/app/api/v1/app/reclaim/runs/[runId]/share/route';
import { auth } from '@/lib/auth/config';
import { loadOwnedRun, saveRunAnswers } from '@/app/api/v1/app/reclaim/runs/service';
import { createShare } from '@/lib/app/programme/share';

const USER_ID = 'user-1';
const RUN_ID = 'clxrun00000000000000000a';

const req = (body: unknown): NextRequest =>
  ({
    json: async () => body,
    headers: new Headers(),
    url: `http://localhost/api/v1/app/reclaim/runs/${RUN_ID}/share`,
  }) as unknown as NextRequest;

const ctx = (runId = RUN_ID) => ({ params: Promise.resolve({ runId }) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth.api.getSession).mockResolvedValue({
    user: { id: USER_ID },
    session: { id: 's1' },
  } as never);
  vi.mocked(loadOwnedRun).mockResolvedValue({ id: RUN_ID, userId: USER_ID } as never);
  vi.mocked(saveRunAnswers).mockResolvedValue(undefined);
  vi.mocked(createShare).mockResolvedValue({ token: null });
});

describe('POST reclaim run share — validation', () => {
  it('400s on a run id that is not a valid id, before ownership is checked', async () => {
    const res = await POST(req({ publicLink: true }), ctx('not-an-id'));

    expect(res.status).toBe(400);
    expect(loadOwnedRun).not.toHaveBeenCalled();
  });

  it('400s on a takeaway over the prose limit', async () => {
    const res = await POST(req({ takeaway: 'x'.repeat(2001) }), ctx());

    expect(res.status).toBe(400);
    expect(createShare).not.toHaveBeenCalled();
  });

  it('400s when a boolean field is sent as a string', async () => {
    const res = await POST(req({ publicLink: 'yes' }), ctx());

    expect(res.status).toBe(400);
    expect(createShare).not.toHaveBeenCalled();
  });
});

describe('POST reclaim run share — ownership', () => {
  it("is a 404 for a run that is not the caller's, before anything is saved", async () => {
    vi.mocked(loadOwnedRun).mockRejectedValue(new NotFoundError(`Audit run ${RUN_ID} not found`));

    const res = await POST(req({ publicLink: true }), ctx());

    expect(res.status).toBe(404);
    expect(saveRunAnswers).not.toHaveBeenCalled();
    expect(createShare).not.toHaveBeenCalled();
  });
});

describe('POST reclaim run share — the optional capture', () => {
  it('saves nothing when the body carries no capture fields at all', async () => {
    await POST(req({ publicLink: true }), ctx());

    expect(saveRunAnswers).not.toHaveBeenCalled();
  });

  it('saves only the fields the leader actually gave, as the right slots', async () => {
    await POST(
      req({
        withCoach: true,
        ageBand: '35-44',
        takeaway: 'I noticed how much delivery takes.',
        quotable: true,
      }),
      ctx()
    );

    expect(saveRunAnswers).toHaveBeenCalledWith(USER_ID, RUN_ID, [
      { slotSlug: 'reclaim_share_with_coach', value: 'Yes', valueJson: true },
      { slotSlug: 'reclaim_share_age_band', value: '35-44' },
      { slotSlug: 'reclaim_share_takeaway', value: 'I noticed how much delivery takes.' },
      { slotSlug: 'reclaim_share_quotable', value: 'Yes', valueJson: true },
    ]);
  });

  it('records a false withCoach as its own slot rather than omitting it', async () => {
    await POST(req({ withCoach: false }), ctx());

    expect(saveRunAnswers).toHaveBeenCalledWith(USER_ID, RUN_ID, [
      { slotSlug: 'reclaim_share_with_coach', value: 'No', valueJson: false },
    ]);
  });

  it('does not save blank or whitespace-only prose', async () => {
    await POST(req({ ageBand: '   ' }), ctx());

    expect(saveRunAnswers).not.toHaveBeenCalled();
  });
});

describe('POST reclaim run share — shareTranscript is threaded to createShare, not saved as a slot', () => {
  it('passes shareTranscript straight through to createShare', async () => {
    await POST(req({ withCoach: true, shareTranscript: true }), ctx());

    expect(createShare).toHaveBeenCalledWith(USER_ID, RUN_ID, {
      publicLink: undefined,
      withCoach: true,
      shareTranscript: true,
      takeaway: undefined,
      quotable: undefined,
    });
  });

  it('never turns shareTranscript into a saved run answer', async () => {
    await POST(req({ withCoach: true, shareTranscript: true }), ctx());

    const savedSlugs = vi.mocked(saveRunAnswers).mock.calls[0]?.[2]?.map((s) => s.slotSlug) ?? [];
    expect(savedSlugs).not.toContain('reclaim_share_transcript');
    expect(savedSlugs).toEqual(['reclaim_share_with_coach']);
  });
});

describe('POST reclaim run share — success', () => {
  it('returns whatever createShare produced in the standard envelope', async () => {
    vi.mocked(createShare).mockResolvedValue({ token: 'abc123' });

    const res = await POST(req({ publicLink: true }), ctx());
    const body = (await res.json()) as { success: true; data: { token: string | null } };

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ success: true, data: { token: 'abc123' } });
  });
});
