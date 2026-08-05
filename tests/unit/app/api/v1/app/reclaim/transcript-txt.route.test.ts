/**
 * Unit tests: GET /api/v1/app/reclaim/runs/:runId/transcript.txt — the leader's own conversation
 * as a plain text file, the format that "will still open in thirty years".
 *
 * Same shape as the PDF sibling: `readOwnTranscript` is both the ownership check and the existence
 * check (`null` covers both a run that is not theirs and one with no conversation), and the route's
 * own job is validation, the 404 branch, and the response headers. `transcriptToText` is pure
 * formatting and is mocked here so this file stays about the route's wiring rather than re-testing
 * the formatter; it has no dedicated render-level test file because there is nothing to render —
 * unlike the PDF sibling, string formatting has no renderer that can silently throw on a style it
 * does not understand, so pure-function coverage from this route test is sufficient and mirrors
 * the project's "mock at the pure-function boundary" pattern used for `render-summary-pdf`.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import type { OwnTranscript } from '@/lib/app/programme/runs/transcript';

vi.mock('@/lib/auth/config', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('@/lib/app/programme/runs/transcript', () => ({
  readOwnTranscript: vi.fn(),
  transcriptFilename: vi.fn(),
  transcriptToText: vi.fn(),
}));

import { GET } from '@/app/api/v1/app/reclaim/runs/[runId]/transcript.txt/route';
import { auth } from '@/lib/auth/config';
import {
  readOwnTranscript,
  transcriptFilename,
  transcriptToText,
} from '@/lib/app/programme/runs/transcript';

const USER_ID = 'user-1';
const RUN_ID = 'clxrun00000000000000000a';
const FILENAME = 'time-audit-conversation-sam-2026-07-29.txt';
const TEXT_BODY = 'Reclaim Your Week\n\nCoach:\nWhat would you change?\n\nYou:\nThe mornings.\n';

const getReq = (): NextRequest =>
  ({
    headers: new Headers(),
    url: `http://localhost/api/v1/app/reclaim/runs/${RUN_ID}/transcript.txt`,
  }) as unknown as NextRequest;

const ctx = (runId = RUN_ID) => ({ params: Promise.resolve({ runId }) });

const TRANSCRIPT: OwnTranscript = {
  runId: RUN_ID,
  firstName: 'Sam',
  startedAt: new Date('2026-07-29T10:00:00.000Z'),
  turns: [
    { id: 't1', role: 'coach', text: 'What would you change?', at: new Date() },
    { id: 't2', role: 'leader', text: 'The mornings.', at: new Date() },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth.api.getSession).mockResolvedValue({
    user: { id: USER_ID },
    session: { id: 's1' },
  } as never);
  vi.mocked(readOwnTranscript).mockResolvedValue(TRANSCRIPT);
  vi.mocked(transcriptFilename).mockReturnValue(FILENAME);
  vi.mocked(transcriptToText).mockReturnValue(TEXT_BODY);
});

describe('GET reclaim run transcript.txt — validation', () => {
  it('400s on a run id that is not a valid id, before the transcript is read', async () => {
    const res = await GET(getReq(), ctx('not-an-id'));

    expect(res.status).toBe(400);
    expect(readOwnTranscript).not.toHaveBeenCalled();
  });
});

describe('GET reclaim run transcript.txt — ownership and existence', () => {
  it("is a 404 for a run that is not the caller's or has no conversation, and never formats it", async () => {
    vi.mocked(readOwnTranscript).mockResolvedValue(null);

    const res = await GET(getReq(), ctx());
    const body = (await res.json()) as { success: boolean; error: { code?: string } };

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(transcriptToText).not.toHaveBeenCalled();
  });
});

describe('GET reclaim run transcript.txt — success', () => {
  it('reads the owned transcript and formats it as text', async () => {
    await GET(getReq(), ctx());

    expect(readOwnTranscript).toHaveBeenCalledWith(USER_ID, RUN_ID);
    expect(transcriptToText).toHaveBeenCalledWith(TRANSCRIPT);
  });

  it('returns the formatted text as an attachment with the right headers', async () => {
    const res = await GET(getReq(), ctx());

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('Content-Disposition')).toBe(`attachment; filename="${FILENAME}"`);
    expect(await res.text()).toBe(TEXT_BODY);
  });

  it('names the file from the transcript and the txt extension, not a hardcoded one', async () => {
    await GET(getReq(), ctx());

    expect(transcriptFilename).toHaveBeenCalledWith(TRANSCRIPT, 'txt');
  });
});
