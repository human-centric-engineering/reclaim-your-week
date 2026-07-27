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
import { COACH_OPENING_TRIGGER } from '@/lib/app/programme/coach/opening';

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

/**
 * A streaming response, headers included.
 *
 * The headers are not decoration: the client tells a stream from a plain JSON answer by content type,
 * which is how an already-claimed opening moment reports back without pretending to be a turn.
 */
const sse = (text: string) => ({
  ok: true,
  status: 200,
  headers: new Headers({ 'content-type': 'text/event-stream' }),
  body: sseBody(text),
});

/** A non-streaming answer from the stream route — an opening whose moment was already claimed. */
const alreadyOpened = () => ({
  ok: true,
  status: 200,
  headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({ success: true, data: { opened: false } }),
  body: new ReadableStream({
    start(c) {
      c.close();
    },
  }),
});

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

  it('never shows the leader a trigger they did not write', async () => {
    // `streamChat` has no shape for an agent-first turn, so the trigger is persisted as a user row.
    // It is ours, and it must not come back as something the leader said.
    fetchMock.mockResolvedValueOnce(
      json({
        messages: [
          { role: 'user', content: COACH_OPENING_TRIGGER },
          { role: 'assistant', content: 'Here is the shape of your week.' },
        ],
      })
    );

    render(<CoachChat runId="run-1" conversationId="conv-1" />);

    expect(await screen.findByText('Here is the shape of your week.')).toBeInTheDocument();
    expect(screen.queryByText(COACH_OPENING_TRIGGER)).not.toBeInTheDocument();
  });

  it('sends a turn to the run’s own stream, and reports back when it ends', async () => {
    fetchMock.mockResolvedValue(sse('Tell me about your week.'));
    const onTurnComplete = vi.fn();

    render(<CoachChat runId="run-1" conversationId={null} onTurnComplete={onTurnComplete} />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Your message' }), 'hello');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(onTurnComplete).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/app/reclaim/runs/run-1/coach/stream',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ kind: 'leader', message: 'hello' }),
      })
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

describe('CoachChat — the coach opening a moment', () => {
  it('opens the moment itself, with no leader turn on screen', async () => {
    // The point of the whole mechanism: the leader arrives and the coach has already spoken. The
    // request carries the moment, never a message the leader would appear to have written.
    fetchMock.mockResolvedValue(sse('Here is what your week looks like.'));

    render(<CoachChat runId="run-1" conversationId={null} openMoment="phase-4-gap" />);

    expect(await screen.findByText('Here is what your week looks like.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/app/reclaim/runs/run-1/coach/stream',
      expect.objectContaining({
        body: JSON.stringify({ kind: 'opening', moment: 'phase-4-gap' }),
      })
    );
  });

  it('leaves the transcript untouched when the moment was already claimed', async () => {
    // The server answers in JSON rather than SSE. Nothing has gone wrong — this run has had the
    // beat — so the placeholder must go rather than sitting there as an empty coach turn.
    fetchMock
      .mockResolvedValueOnce(json({ messages: [{ role: 'assistant', content: 'Said already.' }] }))
      .mockResolvedValueOnce(alreadyOpened());

    render(<CoachChat runId="run-1" conversationId="conv-1" openMoment="phase-4-gap" />);

    expect(await screen.findByText('Said already.')).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    // Exactly the rehydrated turn, and no empty coach paragraph left behind by the placeholder.
    const section = screen.getByRole('region', { name: 'Conversation with the coach' });
    const paragraphs = [...section.querySelectorAll('p')];
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]).toHaveTextContent('Said already.');
  });

  it('does not open a moment before the transcript has loaded', async () => {
    // A run part-way through a phase already has turns. Firing the opener first would put the coach's
    // new beat above the conversation it is supposed to follow.
    let resolveTranscript: (v: unknown) => void = () => {};
    fetchMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveTranscript = resolve;
      })
    );

    render(<CoachChat runId="run-1" conversationId="conv-1" openMoment="phase-4-gap" />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/v1/app/reclaim/runs/run-1/coach/stream',
      expect.anything()
    );

    fetchMock.mockResolvedValue(sse('And now the gap.'));
    resolveTranscript(json({ messages: [{ role: 'user', content: 'Earlier turn' }] }));

    expect(await screen.findByText('And now the gap.')).toBeInTheDocument();
    expect(screen.getByText('Earlier turn')).toBeInTheDocument();
  });

  it('does nothing when there is no moment to open', async () => {
    fetchMock.mockResolvedValueOnce(json({ messages: [] }));

    render(<CoachChat runId="run-1" conversationId="conv-1" />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/chat/conversations/conv-1/messages');
  });
});
