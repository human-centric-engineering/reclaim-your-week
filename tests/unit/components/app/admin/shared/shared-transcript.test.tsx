/**
 * A shared conversation, read-only (F17 t-2). `fetch` is stubbed; no network.
 *
 * Load-bearing: **every refusal reads identically**, whichever of "no consent", "no conversation" or
 * "wrong leader" caused it — telling them apart on screen would report a leader's choice to somebody
 * they did not report it to. That is asserted three separate ways below (a 404, a 200 with no body
 * shaped like a transcript, and a network failure) precisely because it would be easy to accidentally
 * make one of those three read differently from the others.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SharedTranscriptView } from '@/components/app/admin/shared/shared-transcript';

const fetchMock = vi.fn();
const REFUSAL_TEXT = /That conversation is not available/;

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const TRANSCRIPT = {
  runId: 'run-1',
  quarter: '2026 Q1',
  sharedAt: '2026-07-01T00:00:00.000Z',
  turns: [
    {
      id: 't1',
      role: 'leader' as const,
      text: 'I think I am overcommitted.',
      at: '2026-06-01T00:00:00.000Z',
    },
    {
      id: 't2',
      role: 'coach' as const,
      text: 'Say more about that.',
      at: '2026-06-01T00:01:00.000Z',
    },
  ],
};

describe('SharedTranscriptView', () => {
  it('reads a consented transcript and requests the exact route', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: TRANSCRIPT }),
    });

    render(<SharedTranscriptView userId="u1" runId="run-1" />);

    expect(await screen.findByText(/2026 Q1, in their own words/)).toBeInTheDocument();
    expect(screen.getByText('I think I am overcommitted.')).toBeInTheDocument();
    expect(screen.getByText('Say more about that.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/app/reclaim/admin/shared/u1/run-1/transcript');
  });

  it('URL-encodes both ids in the request', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: TRANSCRIPT }),
    });

    render(<SharedTranscriptView userId="u/1" runId="run/2" />);

    await screen.findByText(/in their own words/);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/app/reclaim/admin/shared/u%2F1/run%2F2/transcript'
    );
  });

  it('labels each turn as the leader or the coach, not by the model role', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: TRANSCRIPT }),
    });

    render(<SharedTranscriptView userId="u1" runId="run-1" />);

    await screen.findByText('I think I am overcommitted.');
    expect(screen.getByText('Them')).toBeInTheDocument();
    expect(screen.getByText('The coach')).toBeInTheDocument();
  });

  it('reads the same refusal for a 404 (no share, or someone else’s run) as for consent withheld', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: () =>
        Promise.resolve({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } }),
    });

    render(<SharedTranscriptView userId="u1" runId="run-1" />);

    expect(await screen.findByText(REFUSAL_TEXT)).toBeInTheDocument();
  });

  it('reads the same refusal when the body is a 200 with no transcript shape (belt-and-braces on the schema)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: null }),
    });

    render(<SharedTranscriptView userId="u1" runId="run-1" />);

    expect(await screen.findByText(REFUSAL_TEXT)).toBeInTheDocument();
  });

  it('reads the same refusal when the network call itself fails', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    render(<SharedTranscriptView userId="u1" runId="run-1" />);

    expect(await screen.findByText(REFUSAL_TEXT)).toBeInTheDocument();
  });

  it('says a conversation with no turns has nothing in it yet, rather than looking broken', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: { ...TRANSCRIPT, turns: [] } }),
    });

    render(<SharedTranscriptView userId="u1" runId="run-1" />);

    expect(await screen.findByText(/nothing in this conversation yet/)).toBeInTheDocument();
  });
});
