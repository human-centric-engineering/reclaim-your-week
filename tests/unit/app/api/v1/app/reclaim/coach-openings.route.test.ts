/**
 * Unit tests: POST /api/v1/app/reclaim/runs/:runId/coach/openings — record a moment without a turn.
 *
 * This route exists for the form path, which has no conversation to speak into but still has to
 * record that the leader has seen their week, because the transition gate reads it.
 *
 * **The phase check is the reason this file exists.** The first cut of the route had none, on the
 * reasoning that nothing is generated so nothing needs guarding. `/security-review` pointed out what
 * that actually buys: a leader can claim `phase-1-chart-reveal` while still on phase 0 and then leave
 * phase 1 without the picture ever being shown, which leaves I12's gate held by the client. It costs
 * nobody but them, so it is a correctness bug rather than a vulnerability — and it is exactly the
 * shape of thing I9 and I12 were written to rule out.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { NotFoundError, ValidationError } from '@/lib/api/errors';

vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('@/app/api/v1/app/reclaim/runs/service', () => ({
  claimCoachOpening: vi.fn(),
  loadCoachTurnTarget: vi.fn(),
}));

import { POST } from '@/app/api/v1/app/reclaim/runs/[runId]/coach/openings/route';
import { auth } from '@/lib/auth/config';
import { claimCoachOpening, loadCoachTurnTarget } from '@/app/api/v1/app/reclaim/runs/service';

const RUN_ID = 'clxrun00000000000000000a';

const req = (body: unknown): NextRequest =>
  ({
    json: async () => body,
    headers: new Headers(),
    url: `http://localhost/api/v1/app/reclaim/runs/${RUN_ID}/coach/openings`,
  }) as unknown as NextRequest;

const ctx = (runId = RUN_ID) => ({ params: Promise.resolve({ runId }) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth.api.getSession).mockResolvedValue({
    user: { id: 'user-1' },
    session: { id: 's1' },
  } as never);
  vi.mocked(loadCoachTurnTarget).mockResolvedValue({
    conversationId: 'conv-1',
    phaseKey: 'phase-1-current',
  });
  vi.mocked(claimCoachOpening).mockResolvedValue(true);
});

describe('POST reclaim coach openings', () => {
  it('records the moment when it belongs to the phase the leader is on', async () => {
    const res = await POST(req({ moment: 'phase-1-chart-reveal' }), ctx());

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ data: { opened: true } });
    expect(claimCoachOpening).toHaveBeenCalledWith('user-1', RUN_ID, 'phase-1-chart-reveal');
  });

  it('refuses a moment that belongs to a phase the leader has not reached', async () => {
    // The gate bypass this route used to allow: mark the reveal from phase 0, then walk past the
    // chart in phase 1 without ever seeing it.
    vi.mocked(loadCoachTurnTarget).mockResolvedValue({
      conversationId: null as unknown as undefined,
      phaseKey: 'phase-0-setup',
    });

    const res = await POST(req({ moment: 'phase-1-chart-reveal' }), ctx());

    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: { code: 'OPENING_WRONG_PHASE' } });
    expect(claimCoachOpening).not.toHaveBeenCalled();
  });

  it('reports an already-claimed moment without pretending it just happened', async () => {
    vi.mocked(claimCoachOpening).mockResolvedValue(false);

    const res = await POST(req({ moment: 'phase-1-chart-reveal' }), ctx());

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ data: { opened: false } });
  });

  it("refuses a run that is not the caller's, before anything is written", async () => {
    vi.mocked(loadCoachTurnTarget).mockRejectedValue(new NotFoundError('Audit run not found'));

    const res = await POST(req({ moment: 'phase-1-chart-reveal' }), ctx());

    expect(res.status).toBe(404);
    expect(claimCoachOpening).not.toHaveBeenCalled();
  });

  it('refuses a run that is not in progress', async () => {
    vi.mocked(loadCoachTurnTarget).mockRejectedValue(
      new ValidationError('This audit is not in progress', { run: ['x'] })
    );

    const res = await POST(req({ moment: 'phase-1-chart-reveal' }), ctx());

    expect(res.status).toBe(400);
    expect(claimCoachOpening).not.toHaveBeenCalled();
  });

  it('400s on a moment that is not one of ours', async () => {
    const res = await POST(req({ moment: 'phase-9-invented' }), ctx());

    expect(res.status).toBe(400);
    expect(claimCoachOpening).not.toHaveBeenCalled();
  });

  it('400s on a run id that is not an id at all', async () => {
    const res = await POST(req({ moment: 'phase-1-chart-reveal' }), ctx('../../etc/passwd'));

    expect(res.status).toBe(400);
    expect(loadCoachTurnTarget).not.toHaveBeenCalled();
  });
});
