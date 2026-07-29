/**
 * Unit tests: POST /api/v1/app/reclaim/runs/:runId/transition
 *
 * This route is the one place I9 (the reflection) and I12 (the chart reveal) are actually held —
 * `tests/unit/invariants/chart-beat.test.ts` only greps the source text for the right identifiers, so
 * none of the branches below are exercised anywhere else. These tests run the handler and assert the
 * real response envelope, status code, and which collaborators were (or were not) called.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { NotFoundError } from '@/lib/api/errors';
import { CHART_REVEAL_PHASE, CHART_REVEAL_MOMENT } from '@/lib/app/programme/chart/reveal';

vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('@/app/api/v1/app/reclaim/runs/service', () => ({
  loadOwnedRun: vi.fn(),
  transitionRun: vi.fn(),
  readCoachOpenings: vi.fn(),
  recordPhaseMark: vi.fn(),
}));
vi.mock('@/lib/app/programme/runs/reflection', () => ({
  missingReflectionSlug: vi.fn(),
}));

import { POST } from '@/app/api/v1/app/reclaim/runs/[runId]/transition/route';
import { auth } from '@/lib/auth/config';
import {
  loadOwnedRun,
  transitionRun,
  readCoachOpenings,
  recordPhaseMark,
} from '@/app/api/v1/app/reclaim/runs/service';
import { missingReflectionSlug } from '@/lib/app/programme/runs/reflection';

const RUN_ID = 'clxrun00000000000000000a';
const USER_ID = 'user-1';

const req = (body: unknown): NextRequest =>
  ({
    json: async () => body,
    headers: new Headers(),
    url: `http://localhost/api/v1/app/reclaim/runs/${RUN_ID}/transition`,
  }) as unknown as NextRequest;

const ctx = (runId = RUN_ID) => ({ params: Promise.resolve({ runId }) });

const OWNED_RUN = { id: RUN_ID, userId: USER_ID, status: 'in_progress' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth.api.getSession).mockResolvedValue({
    user: { id: USER_ID },
    session: { id: 's1' },
  } as never);
  vi.mocked(loadOwnedRun).mockResolvedValue(OWNED_RUN as never);
  vi.mocked(missingReflectionSlug).mockResolvedValue(null);
  vi.mocked(readCoachOpenings).mockResolvedValue([]);
  vi.mocked(transitionRun).mockResolvedValue({ enteredPhaseKey: 'phase-3-ideal' });
  vi.mocked(recordPhaseMark).mockResolvedValue(undefined);
});

describe('POST reclaim run transition — validation', () => {
  it('400s on a run id that is not a valid id, before the database is touched', async () => {
    const res = await POST(req({ fromPhase: 'phase-2-energy' }), ctx('not-an-id'));

    expect(res.status).toBe(400);
    expect(loadOwnedRun).not.toHaveBeenCalled();
  });

  it('400s on a fromPhase that is not one of the seven known phase keys', async () => {
    const res = await POST(req({ fromPhase: 'phase-9-invented' }), ctx());

    expect(res.status).toBe(400);
    expect(loadOwnedRun).not.toHaveBeenCalled();
  });
});

describe('POST reclaim run transition — ownership', () => {
  it("is a 404 for a run that is not the caller's, before any gate is checked", async () => {
    vi.mocked(loadOwnedRun).mockRejectedValue(new NotFoundError(`Audit run ${RUN_ID} not found`));

    const res = await POST(req({ fromPhase: 'phase-2-energy' }), ctx());

    expect(res.status).toBe(404);
    expect(missingReflectionSlug).not.toHaveBeenCalled();
    expect(transitionRun).not.toHaveBeenCalled();
  });
});

describe('POST reclaim run transition — I9 the reflection gate', () => {
  it('blocks the move with 422 REFLECTION_REQUIRED when the leaving phase has no reflection yet', async () => {
    vi.mocked(missingReflectionSlug).mockResolvedValue('reclaim_reflection_p2');

    const res = await POST(req({ fromPhase: 'phase-2-energy' }), ctx());
    const body = (await res.json()) as {
      error: { code: string; details: { slot: string; fromPhase: string } };
    };

    expect(res.status).toBe(422);
    expect(body.error.code).toBe('REFLECTION_REQUIRED');
    expect(body.error.details).toEqual({
      slot: 'reclaim_reflection_p2',
      fromPhase: 'phase-2-energy',
    });
    expect(missingReflectionSlug).toHaveBeenCalledWith(USER_ID, RUN_ID, 'phase-2-energy');
    expect(transitionRun).not.toHaveBeenCalled();
    expect(recordPhaseMark).not.toHaveBeenCalled();
  });

  it('does not check the chart reveal at all once the reflection gate has already refused', async () => {
    vi.mocked(missingReflectionSlug).mockResolvedValue('reclaim_reflection_p1');

    await POST(req({ fromPhase: CHART_REVEAL_PHASE }), ctx());

    expect(readCoachOpenings).not.toHaveBeenCalled();
  });
});

describe('POST reclaim run transition — I12 the chart reveal gate', () => {
  it('blocks leaving phase 1 with 422 CHART_REVEAL_REQUIRED when the picture has not been shown', async () => {
    vi.mocked(readCoachOpenings).mockResolvedValue([]);

    const res = await POST(req({ fromPhase: CHART_REVEAL_PHASE }), ctx());
    const body = (await res.json()) as { error: { code: string; details: { fromPhase: string } } };

    expect(res.status).toBe(422);
    expect(body.error.code).toBe('CHART_REVEAL_REQUIRED');
    expect(body.error.details).toEqual({ fromPhase: CHART_REVEAL_PHASE });
    expect(readCoachOpenings).toHaveBeenCalledWith(USER_ID, RUN_ID);
    expect(transitionRun).not.toHaveBeenCalled();
  });

  it('lets the move through once the reveal moment has been recorded on the run', async () => {
    vi.mocked(readCoachOpenings).mockResolvedValue([CHART_REVEAL_MOMENT]);
    vi.mocked(transitionRun).mockResolvedValue({ enteredPhaseKey: 'phase-2-energy' });

    const res = await POST(req({ fromPhase: CHART_REVEAL_PHASE }), ctx());

    expect(res.status).toBe(200);
    expect(transitionRun).toHaveBeenCalledWith(USER_ID, RUN_ID, CHART_REVEAL_PHASE);
  });

  it('is never consulted for a phase other than the one it gates', async () => {
    const res = await POST(req({ fromPhase: 'phase-2-energy' }), ctx());

    expect(res.status).toBe(200);
    expect(readCoachOpenings).not.toHaveBeenCalled();
  });
});

describe('POST reclaim run transition — success', () => {
  it('returns the entered phase in the standard envelope', async () => {
    vi.mocked(transitionRun).mockResolvedValue({ enteredPhaseKey: 'phase-4-gap' });

    const res = await POST(req({ fromPhase: 'phase-3-ideal' }), ctx());
    const body = (await res.json()) as { success: true; data: { enteredPhase: string } };

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ success: true, data: { enteredPhase: 'phase-4-gap' } });
  });

  it('records where the entered phase begins in the conversation', async () => {
    vi.mocked(transitionRun).mockResolvedValue({ enteredPhaseKey: 'phase-4-gap' });

    await POST(req({ fromPhase: 'phase-3-ideal' }), ctx());

    expect(recordPhaseMark).toHaveBeenCalledWith(USER_ID, RUN_ID, 'phase-4-gap');
  });

  // The mark is bookkeeping and the route says so: "Best-effort inside". The guarantee lives in
  // `recordPhaseMark`, which wraps its whole body in a try/catch and logs rather than throws, so the
  // route awaits it bare on purpose. What is worth pinning here is that the transition's own answer
  // does not wait on the mark being useful — a phase entered before the conversation exists records
  // no mark at all, and the leader still moves.
  it('completes the transition even when no mark is recorded', async () => {
    vi.mocked(transitionRun).mockResolvedValue({ enteredPhaseKey: 'phase-4-gap' });
    vi.mocked(recordPhaseMark).mockResolvedValue(undefined);

    const res = await POST(req({ fromPhase: 'phase-3-ideal' }), ctx());

    expect(res.status).toBe(200);
    expect((await res.json()) as unknown).toMatchObject({
      data: { enteredPhase: 'phase-4-gap' },
    });
  });
});
