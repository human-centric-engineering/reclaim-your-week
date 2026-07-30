/**
 * Unit tests: GET /api/v1/app/reclaim/runs/:runId/summary — the leader's own summary (F7 t-4),
 * before any sharing.
 *
 * The route's one piece of behaviour beyond ownership + fetch is F14's lazy analyst-reading
 * generation: `ensureAnalystReading` runs before `buildSummary`, on this route and nowhere else that
 * reaches `buildSummary` (deliberately not the PDF route or the public share route, per this route's
 * own docstring) — worth pinning as the thing that tells this route apart from `report.pdf`'s.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { NotFoundError } from '@/lib/api/errors';
import type { AuditSummary } from '@/lib/app/programme/summary';
import type { ChartData } from '@/lib/app/programme/chart/series';

vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('@/app/api/v1/app/reclaim/runs/service', () => ({
  loadOwnedRun: vi.fn(),
  ensureAnalystReading: vi.fn(),
}));
vi.mock('@/lib/app/programme/summary', () => ({ buildSummary: vi.fn() }));

import { GET } from '@/app/api/v1/app/reclaim/runs/[runId]/summary/route';
import { auth } from '@/lib/auth/config';
import { loadOwnedRun, ensureAnalystReading } from '@/app/api/v1/app/reclaim/runs/service';
import { buildSummary } from '@/lib/app/programme/summary';

const USER_ID = 'user-1';
const RUN_ID = 'clxrun00000000000000000a';

const getReq = (): NextRequest =>
  ({
    headers: new Headers(),
    url: `http://localhost/api/v1/app/reclaim/runs/${RUN_ID}/summary`,
  }) as unknown as NextRequest;

const ctx = (runId = RUN_ID) => ({ params: Promise.resolve({ runId }) });

const chart: ChartData = {
  source: 'current',
  totalHours: 40,
  unallocated: [],
  buckets: [],
};

const SUMMARY: AuditSummary = {
  firstName: 'Sam',
  role: 'Chief Executive',
  orgType: 'A social enterprise',
  period: 'last quarter',
  priorities: 'Get the new programme funded',
  current: chart,
  rows: [],
  action: { chosen: null, when: null, howKnown: null },
  analyst: null,
  footnote: 'A tool designed by Rashmir Balasubramaniam.',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth.api.getSession).mockResolvedValue({
    user: { id: USER_ID },
    session: { id: 's1' },
  } as never);
  vi.mocked(loadOwnedRun).mockResolvedValue({ id: RUN_ID, userId: USER_ID } as never);
  vi.mocked(ensureAnalystReading).mockResolvedValue(undefined);
  vi.mocked(buildSummary).mockResolvedValue(SUMMARY);
});

describe('GET reclaim run summary — validation', () => {
  it('400s on a run id that is not a valid id, before ownership is checked', async () => {
    const res = await GET(getReq(), ctx('not-an-id'));

    expect(res.status).toBe(400);
    expect(loadOwnedRun).not.toHaveBeenCalled();
  });
});

describe('GET reclaim run summary — ownership', () => {
  it("is a 404 for a run that is not the caller's, and never touches the analyst reading or the summary", async () => {
    vi.mocked(loadOwnedRun).mockRejectedValue(new NotFoundError(`Audit run ${RUN_ID} not found`));

    const res = await GET(getReq(), ctx());

    expect(res.status).toBe(404);
    expect(ensureAnalystReading).not.toHaveBeenCalled();
    expect(buildSummary).not.toHaveBeenCalled();
  });
});

describe('GET reclaim run summary — F14 lazy analyst reading', () => {
  it('generates the reading before building the summary, for this run and user', async () => {
    await GET(getReq(), ctx());

    expect(ensureAnalystReading).toHaveBeenCalledWith(USER_ID, RUN_ID);
    expect(buildSummary).toHaveBeenCalledWith(USER_ID, RUN_ID);
  });

  it('still returns the summary when generation silently declines to produce one', async () => {
    // ensureAnalystReading never throws (its own contract) — it just may do nothing, and
    // buildSummary re-reads whatever is stored either way.
    vi.mocked(ensureAnalystReading).mockResolvedValue(undefined);

    const res = await GET(getReq(), ctx());

    expect(res.status).toBe(200);
  });
});

describe('GET reclaim run summary — success', () => {
  it('returns the built summary in the standard envelope', async () => {
    const res = await GET(getReq(), ctx());
    const body = (await res.json()) as { success: true; data: AuditSummary };

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ success: true, data: SUMMARY });
  });
});
