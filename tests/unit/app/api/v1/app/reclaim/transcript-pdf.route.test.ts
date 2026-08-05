/**
 * Unit tests: GET /api/v1/app/reclaim/runs/:runId/transcript.pdf — the leader's own conversation
 * as a downloadable PDF, styled to match the report.
 *
 * The route is thin by design: ownership + existence in one read (`readOwnTranscript`, which
 * returns `null` for a run that either does not exist or is not the caller's), render it, wrap the
 * bytes in an attachment response. `render-transcript-pdf.test.tsx` already proves a real render
 * produces a genuine PDF from a given transcript, so this file mocks the render helper and the
 * transcript reader and checks the route's own wiring — validation, the 404 branch, and the response
 * headers it builds by hand (there is no `pdf-response.ts` equivalent here; the route constructs the
 * `Response` itself).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import type { OwnTranscript } from '@/lib/app/programme/runs/transcript';

vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('@/lib/app/programme/runs/transcript', () => ({
  readOwnTranscript: vi.fn(),
  transcriptFilename: vi.fn(),
}));
vi.mock('@/app/api/v1/app/reclaim/runs/[runId]/_lib/render-transcript-pdf', () => ({
  renderTranscriptPdf: vi.fn(),
}));

import { GET } from '@/app/api/v1/app/reclaim/runs/[runId]/transcript.pdf/route';
import { auth } from '@/lib/auth/config';
import { readOwnTranscript, transcriptFilename } from '@/lib/app/programme/runs/transcript';
import { renderTranscriptPdf } from '@/app/api/v1/app/reclaim/runs/[runId]/_lib/render-transcript-pdf';

const USER_ID = 'user-1';
const RUN_ID = 'clxrun00000000000000000a';
const FILENAME = 'time-audit-conversation-sam-2026-07-29.pdf';

const getReq = (): NextRequest =>
  ({
    headers: new Headers(),
    url: `http://localhost/api/v1/app/reclaim/runs/${RUN_ID}/transcript.pdf`,
  }) as unknown as NextRequest;

const ctx = (runId = RUN_ID) => ({ params: Promise.resolve({ runId }) });

const TRANSCRIPT: OwnTranscript = {
  runId: RUN_ID,
  firstName: 'Sam',
  startedAt: new Date('2026-07-29T10:00:00.000Z'),
  turns: [
    { id: 't1', role: 'coach', text: 'What would you change about this week?', at: new Date() },
    {
      id: 't2',
      role: 'leader',
      text: 'I would give the mornings back to the bid.',
      at: new Date(),
    },
  ],
};

const PDF_BUFFER = Buffer.from('%PDF-fake-transcript');

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth.api.getSession).mockResolvedValue({
    user: { id: USER_ID },
    session: { id: 's1' },
  } as never);
  vi.mocked(readOwnTranscript).mockResolvedValue(TRANSCRIPT);
  vi.mocked(transcriptFilename).mockReturnValue(FILENAME);
  vi.mocked(renderTranscriptPdf).mockResolvedValue(PDF_BUFFER);
});

describe('GET reclaim run transcript.pdf — validation', () => {
  it('400s on a run id that is not a valid id, before the transcript is read', async () => {
    const res = await GET(getReq(), ctx('not-an-id'));

    expect(res.status).toBe(400);
    expect(readOwnTranscript).not.toHaveBeenCalled();
  });
});

describe('GET reclaim run transcript.pdf — ownership and existence', () => {
  it("is a 404 for a run that is not the caller's or has no conversation, and never renders it", async () => {
    vi.mocked(readOwnTranscript).mockResolvedValue(null);

    const res = await GET(getReq(), ctx());
    const body = (await res.json()) as { success: boolean; error: { code?: string } };

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(renderTranscriptPdf).not.toHaveBeenCalled();
  });
});

describe('GET reclaim run transcript.pdf — success', () => {
  it('reads the owned transcript and renders it to a PDF', async () => {
    await GET(getReq(), ctx());

    expect(readOwnTranscript).toHaveBeenCalledWith(USER_ID, RUN_ID);
    expect(renderTranscriptPdf).toHaveBeenCalledWith(TRANSCRIPT);
  });

  it('returns the rendered bytes as an attachment with the right headers', async () => {
    const res = await GET(getReq(), ctx());

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('Content-Disposition')).toBe(`attachment; filename="${FILENAME}"`);

    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.equals(PDF_BUFFER)).toBe(true);
  });

  it('names the file from the transcript and the pdf extension, not a hardcoded one', async () => {
    await GET(getReq(), ctx());

    expect(transcriptFilename).toHaveBeenCalledWith(TRANSCRIPT, 'pdf');
  });
});
