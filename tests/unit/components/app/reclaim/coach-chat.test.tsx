/**
 * The coach conversation, as a client.
 *
 * Two properties are new here and both are load-bearing now that the conversation *is* the audit
 * rather than a shell beside it:
 *
 *  - **It talks to the run's own stream.** That route is the one that puts the run in the dispatch
 *    scope the capture capability needs (I6); the framework's module surface route does not, so a turn
 *    sent there would record nothing.
 *  - **It rehydrates.** A leader who reloads mid-phase must not meet a coach with no memory of the
 *    last twenty minutes. Tool-only assistant turns (a silent capture) carry no text and must not
 *    appear as empty paragraphs.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CoachChat } from '@/components/app/reclaim/coach-chat';

const encoder = new TextEncoder();

/** An SSE body carrying one content frame and a done frame, as the bridge would send them. */
function sseBody(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          `event: content\ndata: ${JSON.stringify({ type: 'content', delta: text })}\n\n`
        )
      );
      controller.enqueue(
        encoder.encode(`event: done\ndata: ${JSON.stringify({ type: 'done' })}\n\n`)
      );
      controller.close();
    },
  });
}

const json = (data: unknown) => ({ ok: true, json: async () => ({ success: true, data }) });

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CoachChat', () => {
  it('reads the run’s transcript back, skipping the silent capture turns', async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        messages: [
          { role: 'user', content: 'Twenty hours in meetings' },
          { role: 'assistant', content: '' }, // a turn that only called a capability
          { role: 'tool', content: 'record_answers ok' },
          { role: 'assistant', content: 'That is a lot of the week.' },
        ],
      })
    );

    render(<CoachChat runId="run-1" conversationId="conv-1" />);

    expect(await screen.findByText('Twenty hours in meetings')).toBeInTheDocument();
    expect(screen.getByText('That is a lot of the week.')).toBeInTheDocument();
    expect(screen.queryByText('record_answers ok')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/chat/conversations/conv-1/messages');
  });

  it('invites the leader to begin when there is no transcript yet', () => {
    render(<CoachChat runId="run-1" conversationId={null} />);

    expect(screen.getByText(/say hello and we will begin/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends a turn to the run’s own stream, and reports back when it ends', async () => {
    fetchMock.mockResolvedValue({ ok: true, body: sseBody('Tell me about your week.') });
    const onTurnComplete = vi.fn();

    render(<CoachChat runId="run-1" conversationId={null} onTurnComplete={onTurnComplete} />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Your message' }), 'hello');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(onTurnComplete).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/app/reclaim/runs/run-1/coach/stream',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ message: 'hello' }) })
    );
    expect(await screen.findByText('Tell me about your week.')).toBeInTheDocument();
  });

  it('says when a turn could not be delivered, and still reports back', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, body: null });
    const onTurnComplete = vi.fn();

    render(<CoachChat runId="run-1" conversationId={null} onTurnComplete={onTurnComplete} />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Your message' }), 'hello');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByRole('status')).toHaveTextContent(/could not be reached/);
    // A failed turn can still have captured something before it failed, so the panel is refreshed.
    expect(onTurnComplete).toHaveBeenCalled();
  });

  it('carries on when the transcript cannot be read, rather than locking the leader out', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404 });

    render(<CoachChat runId="run-1" conversationId="conv-1" />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.getByRole('textbox', { name: 'Your message' })).toBeEnabled();
  });
});
