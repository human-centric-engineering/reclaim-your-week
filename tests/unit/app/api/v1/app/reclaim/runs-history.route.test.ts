/**
 * Unit tests: creating an audit run, and the two reads that make a finished one reachable again.
 *
 *   POST /api/v1/app/reclaim/runs        → start a new audit
 *   GET  /api/v1/app/reclaim/runs        → every audit this leader has run
 *   GET  /api/v1/app/reclaim/runs/:runId → one of them, whatever state it is in
 *
 * **What the GETs pin is the thing that was missing, not the plumbing.** `runs/current` filters on
 * `in_progress` by design, so for the whole of v1 an audit left the product the moment it finished:
 * the phases, the readings and the summary were all still owned by the leader and reachable by
 * nothing. The assertions below are therefore mostly about *which runs come back* and *whose they
 * are*, because those are the two ways this could be built and still be wrong.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { NotFoundError, ValidationError } from '@/lib/api/errors';

vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('@/app/api/v1/app/reclaim/runs/service', () => ({
  createRun: vi.fn(),
  listRuns: vi.fn(),
  loadRunState: vi.fn(),
}));

import { GET as LIST, POST as CREATE } from '@/app/api/v1/app/reclaim/runs/route';
import { GET as READ } from '@/app/api/v1/app/reclaim/runs/[runId]/route';
import { auth } from '@/lib/auth/config';
import { createRun, listRuns, loadRunState } from '@/app/api/v1/app/reclaim/runs/service';

const RUN_ID = 'clxrun00000000000000000a';

const req = (url = 'http://localhost/api/v1/app/reclaim/runs'): NextRequest =>
  ({ headers: new Headers(), url }) as unknown as NextRequest;

const postReq = (body: unknown): NextRequest =>
  ({
    json: async () => body,
    headers: new Headers(),
    url: 'http://localhost/api/v1/app/reclaim/runs',
  }) as unknown as NextRequest;

const ctx = (runId = RUN_ID) => ({ params: Promise.resolve({ runId }) });

const FINISHED = {
  id: RUN_ID,
  quarter: '2026 Q1',
  status: 'complete',
  startedAt: new Date('2026-01-04T09:00:00Z'),
  completedAt: new Date('2026-01-06T17:30:00Z'),
  hasConversation: true,
  progress: null,
};

const OPEN = {
  id: 'clxrun00000000000000000b',
  quarter: null,
  status: 'in_progress',
  startedAt: new Date('2026-07-02T08:00:00Z'),
  completedAt: null,
  hasConversation: false,
  progress: { phaseKey: 'phase-2-energy', phaseLabel: 'Energy', phaseIndex: 2 },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth.api.getSession).mockResolvedValue({
    user: { id: 'user-1' },
    session: { id: 's1' },
  } as never);
});

describe('GET reclaim runs', () => {
  it('returns finished audits, which is the whole reason it exists', async () => {
    vi.mocked(listRuns).mockResolvedValue([OPEN, FINISHED]);

    const res = await LIST(req());
    const body: unknown = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      data: { runs: [{ status: 'in_progress' }, { id: RUN_ID, status: 'complete' }] },
    });
  });

  it('scopes to the session user, so no id in the request can widen it', async () => {
    vi.mocked(listRuns).mockResolvedValue([]);

    await LIST(req('http://localhost/api/v1/app/reclaim/runs?userId=someone-else'));

    expect(listRuns).toHaveBeenCalledWith('user-1');
    expect(listRuns).toHaveBeenCalledTimes(1);
  });

  it('carries where an unfinished audit stopped, so the list can offer it back by name', async () => {
    vi.mocked(listRuns).mockResolvedValue([OPEN]);

    const res = await LIST(req());
    const body = (await res.json()) as { data: { runs: Array<{ progress: unknown }> } };

    expect(body.data.runs[0].progress).toMatchObject({ phaseIndex: 2, phaseLabel: 'Energy' });
  });

  it('is empty rather than an error for a leader who has never run one', async () => {
    vi.mocked(listRuns).mockResolvedValue([]);

    const res = await LIST(req());

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ data: { runs: [] } });
  });
});

describe('POST reclaim runs (create)', () => {
  const CREATED_RUN = {
    id: 'clxrun00000000000000000c',
    userId: 'user-1',
    status: 'in_progress',
    quarter: '2026 Q3',
    startedAt: new Date('2026-07-28T09:00:00Z'),
    completedAt: null,
    conversationId: null,
    coachOpenings: [] as string[],
    phaseMarks: {},
  };

  // `successResponse`'s signature is `(data, meta?, options?)`, so the status has to travel in the
  // *third* argument. Passing `{ status: 201 }` second lands it in `meta`, which returns a plain 200
  // and rides a stray `meta: { status: 201 }` along in the body — the shape this route shipped with
  // until the assertion below caught it. Both halves are asserted, because the status alone would
  // still pass if the object were duplicated into `meta` as well.
  it('returns 201 for a newly created run, with no meta riding along', async () => {
    vi.mocked(createRun).mockResolvedValue(CREATED_RUN as never);

    const res = await CREATE(postReq({ quarter: '2026 Q3' }));
    const body = (await res.json()) as { meta?: unknown };

    expect(res.status).toBe(201);
    expect(body.meta).toBeUndefined();
  });

  it('wraps a created run in the success envelope with its id and status', async () => {
    vi.mocked(createRun).mockResolvedValue(CREATED_RUN as never);

    const res = await CREATE(postReq({ quarter: '2026 Q3' }));
    const body = (await res.json()) as { success: true; data: { runId: string; status: string } };

    expect(body).toMatchObject({
      success: true,
      data: { runId: CREATED_RUN.id, status: CREATED_RUN.status },
    });
    expect(createRun).toHaveBeenCalledWith('user-1', '2026 Q3');
  });

  it('creates a run with no quarter, since the setup form (F6) sets it later', async () => {
    vi.mocked(createRun).mockResolvedValue({ ...CREATED_RUN, quarter: null } as never);

    await CREATE(postReq({}));

    expect(createRun).toHaveBeenCalledWith('user-1', undefined);
  });

  it('400s on a blank quarter rather than starting a run with an empty label', async () => {
    const res = await CREATE(postReq({ quarter: '' }));

    expect(res.status).toBe(400);
    expect(createRun).not.toHaveBeenCalled();
  });

  it('400s on a quarter longer than the form allows', async () => {
    const res = await CREATE(postReq({ quarter: 'Q'.repeat(41) }));

    expect(res.status).toBe(400);
    expect(createRun).not.toHaveBeenCalled();
  });

  it('surfaces the "audit already in progress" refusal the service raises, rather than a 500', async () => {
    vi.mocked(createRun).mockRejectedValue(
      new ValidationError('An audit is already in progress', {
        run: ['Complete or abandon the current audit before starting another.'],
      })
    );

    const res = await CREATE(postReq({ quarter: '2026 Q3' }));
    const body = (await res.json()) as { success: false; error: { code: string } };

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET one reclaim run', () => {
  const state = {
    run: {
      id: RUN_ID,
      quarter: '2026 Q1',
      status: 'complete',
      startedAt: new Date('2026-01-04T09:00:00Z'),
      completedAt: new Date('2026-01-06T17:30:00Z'),
      conversationId: 'conv-1',
      coachOpenings: ['phase-1-chart-reveal'],
      phaseMarks: { 'phase-1-current': 'm2' },
    },
    phases: [{ key: 'phase-0-setup', label: 'Setup', status: 'completed' as const }],
    currentPhaseKey: 'phase-6-summary',
  };

  it('reads a finished audit, which `runs/current` will never return', async () => {
    vi.mocked(loadRunState).mockResolvedValue(state);

    const res = await READ(req(), ctx());

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      data: { run: { id: RUN_ID, status: 'complete' }, currentPhaseKey: 'phase-6-summary' },
    });
    expect(loadRunState).toHaveBeenCalledWith('user-1', RUN_ID);
  });

  it('refuses a malformed id before it reaches the database', async () => {
    const res = await READ(req(), ctx('not-an-id'));

    expect(res.status).toBe(400);
    expect(loadRunState).not.toHaveBeenCalled();
  });

  it('is a 404 for a run belonging to someone else, because the id alone never authorises', async () => {
    vi.mocked(loadRunState).mockRejectedValue(new NotFoundError(`Audit run ${RUN_ID} not found`));

    const res = await READ(req(), ctx());

    expect(res.status).toBe(404);
  });
});
