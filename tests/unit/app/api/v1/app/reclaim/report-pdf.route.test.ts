/**
 * Unit tests: GET /api/v1/app/reclaim/runs/:runId/report.pdf — the audit summary as a downloadable
 * PDF (F15 t-2).
 *
 * The route is thin by design: ownership (`loadOwnedRun`), build the summary, render it, wrap it in
 * the attachment response. `render-summary-pdf.test.tsx` already proves a real render produces a
 * genuine PDF and that `summaryPdfResponse` sets the right headers, so this file mocks both and
 * checks the route's own wiring — that it never generates the analyst reading (deliberate, per the
 * route's docstring) and that ownership failures surface as the right HTTP status.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { NotFoundError } from '@/lib/api/errors';
import type { AuditSummary } from '@/lib/app/programme/summary';
import type { ChartData } from '@/lib/app/programme/chart/series';

vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('@/app/api/v1/app/reclaim/runs/service', () => ({ loadOwnedRun: vi.fn() }));
vi.mock('@/lib/app/programme/summary', () => ({ buildSummary: vi.fn() }));
vi.mock('@/app/api/v1/app/reclaim/runs/[runId]/_lib/render-summary-pdf', () => ({
  renderSummaryPdf: vi.fn(),
}));
vi.mock('@/app/api/v1/app/reclaim/runs/[runId]/_lib/pdf-response', () => ({
  summaryPdfResponse: vi.fn(),
}));

import { GET } from '@/app/api/v1/app/reclaim/runs/[runId]/report.pdf/route';
import { auth } from '@/lib/auth/config';
import { loadOwnedRun } from '@/app/api/v1/app/reclaim/runs/service';
import { buildSummary } from '@/lib/app/programme/summary';
import { renderSummaryPdf } from '@/app/api/v1/app/reclaim/runs/[runId]/_lib/render-summary-pdf';
import { summaryPdfResponse } from '@/app/api/v1/app/reclaim/runs/[runId]/_lib/pdf-response';

const USER_ID = 'user-1';
const RUN_ID = 'clxrun00000000000000000a';

const getReq = (): NextRequest =>
  ({
    headers: new Headers(),
    url: `http://localhost/api/v1/app/reclaim/runs/${RUN_ID}/report.pdf`,
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
  auditedOn: '2026-07-29T10:00:00.000Z',
  contactEmail: 'rashmir@rashmir.net',
  role: 'Chief Executive',
  orgType: 'A social enterprise',
  period: 'last quarter',
  priorities: 'Get the new programme funded',
  current: chart,
  rows: [],
  action: { chosen: null, when: null, howKnown: null },
  report: null,
  footnote: 'A tool designed by Rashmir Balasubramaniam.',
};

const PDF_BUFFER = Buffer.from('%PDF-fake');
const PDF_RESPONSE = new Response(PDF_BUFFER, {
  status: 200,
  headers: { 'Content-Type': 'application/pdf' },
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth.api.getSession).mockResolvedValue({
    user: { id: USER_ID },
    session: { id: 's1' },
  } as never);
  vi.mocked(loadOwnedRun).mockResolvedValue({ id: RUN_ID, userId: USER_ID } as never);
  vi.mocked(buildSummary).mockResolvedValue(SUMMARY);
  vi.mocked(renderSummaryPdf).mockResolvedValue(PDF_BUFFER);
  vi.mocked(summaryPdfResponse).mockReturnValue(PDF_RESPONSE);
});

describe('GET reclaim run report.pdf — validation', () => {
  it('400s on a run id that is not a valid id, before ownership is checked', async () => {
    const res = await GET(getReq(), ctx('not-an-id'));

    expect(res.status).toBe(400);
    expect(loadOwnedRun).not.toHaveBeenCalled();
  });
});

describe('GET reclaim run report.pdf — ownership', () => {
  it("is a 404 for a run that is not the caller's, and never builds a summary for it", async () => {
    vi.mocked(loadOwnedRun).mockRejectedValue(new NotFoundError(`Audit run ${RUN_ID} not found`));

    const res = await GET(getReq(), ctx());

    expect(res.status).toBe(404);
    expect(buildSummary).not.toHaveBeenCalled();
    expect(renderSummaryPdf).not.toHaveBeenCalled();
  });
});

describe('GET reclaim run report.pdf — never generates the analyst reading', () => {
  it('renders only what buildSummary already returns, whether or not it holds a reading', async () => {
    await GET(getReq(), ctx());

    // The route imports no analyst/reading-generation function at all — proven at the module level —
    // and this pins the behavioural half: it never asks buildSummary for anything but the stored
    // state, unlike the summary route, which calls ensureAnalystReading first.
    expect(buildSummary).toHaveBeenCalledWith(USER_ID, RUN_ID);
    expect(buildSummary).toHaveBeenCalledTimes(1);
  });
});

describe('GET reclaim run report.pdf — success', () => {
  it('builds the summary for the owned run and renders it to a PDF', async () => {
    await GET(getReq(), ctx());

    expect(loadOwnedRun).toHaveBeenCalledWith(RUN_ID, USER_ID);
    expect(renderSummaryPdf).toHaveBeenCalledWith(SUMMARY);
    expect(summaryPdfResponse).toHaveBeenCalledWith(PDF_BUFFER, SUMMARY);
  });

  it('returns the attachment response the pdf-response helper produced', async () => {
    const res = await GET(getReq(), ctx());

    expect(res).toBe(PDF_RESPONSE);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
  });
});
