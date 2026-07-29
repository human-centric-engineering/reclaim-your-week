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

/**
 * A stream that opens and then fails (F16 t-2).
 *
 * The `start` frame is the client's signal that the server has persisted the leader's message —
 * `streamChat` writes the user row before it calls the model — so a failure after it is a different
 * situation from one before it, and the two must not be recovered the same way.
 */
function sseFailsAfterStart(): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          `event: start\ndata: ${JSON.stringify({ type: 'start', conversationId: 'conv-9' })}\n\n`
        )
      );
      controller.enqueue(
        encoder.encode(
          // `code` is required by the shared client union; a frame without it is dropped silently.
          `event: error\ndata: ${JSON.stringify({ type: 'error', code: 'MODEL_ERROR', message: 'The model stopped.' })}\n\n`
        )
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

  it('draws a coach turn as the paragraphs it was written in', async () => {
    // The coach is asked to separate its beats with a blank line: what it heard, then what it is
    // asking next. Rendered as one block, the question was buried mid-paragraph and the break showed
    // as a stray empty line, which is the opposite of the pause it was written for.
    fetchMock.mockResolvedValueOnce(
      json({
        messages: [
          {
            role: 'assistant',
            content:
              'Got it, you spend about 5 hours a week on deep work.\n\nNext, how many hours a week go on reading, courses, or time with a mentor?',
          },
        ],
      })
    );

    render(<CoachChat runId="run-1" conversationId="conv-1" />);

    const reflection = await screen.findByText(
      'Got it, you spend about 5 hours a week on deep work.'
    );
    const question = screen.getByText(
      'Next, how many hours a week go on reading, courses, or time with a mentor?'
    );
    expect(reflection.tagName).toBe('P');
    expect(question.tagName).toBe('P');
    expect(reflection).not.toBe(question);
  });

  it('never asks the leader to open the conversation itself', () => {
    // This used to read "when you are ready, say hello and we will begin", which asked someone who
    // came to be guided to do the guiding. Every phase opens with a coach turn now, so the empty
    // state is the gap before that turn arrives rather than an invitation to fill it.
    render(<CoachChat runId="run-1" conversationId={null} />);

    expect(screen.queryByText(/say hello/i)).not.toBeInTheDocument();
    expect(screen.getByText(/coach is opening this part/i)).toBeInTheDocument();
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

/**
 * What a leader sees while a turn is running.
 *
 * The stream has always carried `status` frames and this client always dropped them, so the whole of
 * a turn that called a tool looked like nothing happening: an empty paragraph with a blinking bar in
 * it. They are shown now — and translated first, because the raw frame names an internal tool slug.
 */
describe('CoachChat — while the coach is working', () => {
  /** A stream that emits its frames and then waits, so the in-flight state can be observed. */
  function pendingSse(frames: unknown[]) {
    return {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/event-stream' }),
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          for (const frame of frames) {
            controller.enqueue(
              encoder.encode(
                `event: ${(frame as { type: string }).type}\ndata: ${JSON.stringify(frame)}\n\n`
              )
            );
          }
          // Deliberately left open: the turn is still running.
        },
      }),
    };
  }

  it('says it is thinking before the first word arrives', async () => {
    fetchMock.mockResolvedValue(pendingSse([{ type: 'status', message: 'Thinking...' }]));

    render(<CoachChat runId="run-1" conversationId={null} />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Your message' }), 'hello');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByRole('status', { name: 'Thinking…' })).toBeInTheDocument();
  });

  it('says it is making a note, and never shows the tool slug behind it', async () => {
    fetchMock.mockResolvedValue(
      pendingSse([{ type: 'status', message: 'Executing reclaim_audit__record_answers' }])
    );

    render(<CoachChat runId="run-1" conversationId={null} />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Your message' }), 'about six hours');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByRole('status', { name: 'Making a note…' })).toBeInTheDocument();
    expect(screen.queryByText(/record_answers/)).not.toBeInTheDocument();
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

/**
 * The frames that are not plain content, and the states around them.
 *
 * Each of these is a turn that ends somewhere other than "the coach answered", and each has a way of
 * failing quietly: a retried answer concatenated onto the abandoned one, a budget abort that leaves an
 * empty paragraph, a status line that keeps shouting over the words it was covering for.
 */
describe('CoachChat — turns that end in something other than an answer', () => {
  /** A stream of arbitrary frames, closed after the last one. */
  function streamOf(frames: string[]) {
    return {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/event-stream' }),
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          for (const frame of frames) controller.enqueue(encoder.encode(frame));
          controller.close();
        },
      }),
    };
  }

  const frame = (o: Record<string, unknown>) =>
    `event: ${String(o.type)}\ndata: ${JSON.stringify(o)}\n\n`;

  async function sendHello() {
    await userEvent.type(screen.getByRole('textbox', { name: 'Your message' }), 'hello');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
  }

  it('discards the abandoned partial when a fallback provider restarts', async () => {
    fetchMock.mockResolvedValue(
      streamOf([
        frame({ type: 'content', delta: 'Half an answ' }),
        frame({ type: 'content_reset', reason: 'provider_fallback' }),
        frame({ type: 'content', delta: 'A whole answer.' }),
        frame({ type: 'done' }),
      ])
    );

    render(<CoachChat runId="run-1" conversationId={null} />);
    await sendHello();

    expect(await screen.findByText('A whole answer.')).toBeInTheDocument();
    expect(screen.queryByText(/Half an answ/)).not.toBeInTheDocument();
  });

  it('surfaces a per-turn budget abort, which can be the only frame that arrives', async () => {
    // No trailing `done` or `error`: dropping this frame leaves the coach turn silently empty.
    fetchMock.mockResolvedValue(
      streamOf([
        `event: budget_exceeded_per_turn\ndata: ${JSON.stringify({
          type: 'budget_exceeded_per_turn',
          message: 'This turn cost more than its limit.',
        })}\n\n`,
      ])
    );

    render(<CoachChat runId="run-1" conversationId={null} />);
    await sendHello();

    expect(await screen.findByRole('status')).toHaveTextContent(
      /This turn cost more than its limit/
    );
  });

  it("passes the server's own error message through rather than a generic one", async () => {
    fetchMock.mockResolvedValue(
      streamOf([
        frame({ type: 'error', code: 'provider_down', message: 'The coach is unavailable.' }),
      ])
    );

    render(<CoachChat runId="run-1" conversationId={null} />);
    await sendHello();

    expect(await screen.findByRole('status')).toHaveTextContent(/The coach is unavailable/);
  });

  it('moves the status under the words once there are words to read', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/event-stream' }),
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(frame({ type: 'status', message: 'Thinking...' })));
          controller.enqueue(
            encoder.encode(frame({ type: 'content', delta: 'Where does your week go?' }))
          );
          // Left open: still streaming, so the status is still live.
        },
      }),
    });

    render(<CoachChat runId="run-1" conversationId={null} />);
    await sendHello();

    // The words are the headline; the status is a note beneath them, not the dots that replaced them.
    expect(await screen.findByText('Where does your week go?')).toBeInTheDocument();
    const statuses = screen.getAllByRole('status');
    expect(statuses.some((el) => el.textContent === 'Thinking…')).toBe(true);
  });
});

describe('CoachChat — the frame it is given', () => {
  it('shows the phase’s own invitation instead of the generic one when given it', () => {
    render(<CoachChat runId="run-1" conversationId={null} opener="Tell me about your energy." />);

    expect(screen.getByText('Tell me about your energy.')).toBeInTheDocument();
    expect(screen.queryByText(/coach is opening this part/i)).not.toBeInTheDocument();
  });

  it('renders the phase’s intro, beats and footer around the transcript', () => {
    render(
      <CoachChat
        runId="run-1"
        conversationId={null}
        intro={<p>the signpost</p>}
        beats={[{ key: 'chart', node: <p>the chart</p> }]}
        footer={<button type="button">Continue to the next section</button>}
      />
    );

    expect(screen.getByText('the signpost')).toBeInTheDocument();
    expect(screen.getByText('the chart')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Continue to the next section' })
    ).toBeInTheDocument();
  });

  it('keys the beats it is handed, rather than warning about the caller that built them', async () => {
    // Beats are drawn as arrays (a group under each turn, plus the leading and trailing groups), so
    // an unkeyed node made React blame the parent component that created it. `CoachBeat.key` exists
    // for the anchoring, and it is the right identity here too.
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockResolvedValueOnce(
      json({ messages: [{ role: 'assistant', content: 'That is every area accounted for.' }] })
    );

    render(
      <CoachChat
        runId="run-1"
        conversationId="conv-1"
        beats={[
          { key: 'chart-invite', node: <p>show me the week</p> },
          { key: 'chart', node: <p>the picture of your week</p> },
        ]}
      />
    );
    await screen.findByText('That is every area accounted for.');

    expect(errors.mock.calls.map((args) => String(args[0])).join('\n')).not.toMatch(/unique "key"/);
    errors.mockRestore();
  });

  /**
   * The bug this pins. A beat used to be one node rendered after the last turn, so it stayed welded
   * to the foot of the transcript: every question the coach asked afterwards was drawn *above* the
   * chart, and the leader read their newest question, then the picture, then the composer. Phase 1
   * asks eleven more things after the reveal, so this was the ordinary case.
   *
   * The order of the DOM is the assertion, because the order is the whole defect.
   */
  it('leaves a beat where it appeared, so the conversation carries on below it', async () => {
    fetchMock.mockResolvedValueOnce(
      json({ messages: [{ role: 'assistant', content: 'That is every area accounted for.' }] })
    );

    const { rerender } = render(
      <CoachChat
        runId="run-1"
        conversationId="conv-1"
        beats={[{ key: 'chart', node: <p>the picture of your week</p> }]}
      />
    );
    await screen.findByText('That is every area accounted for.');

    // The next turn arrives. The beat must not float down with it.
    fetchMock.mockResolvedValueOnce(sse('And where does that block sit?'));
    rerender(
      <CoachChat
        runId="run-1"
        conversationId="conv-1"
        beats={[{ key: 'chart', node: <p>the picture of your week</p> }]}
      />
    );
    await userEvent.type(screen.getByLabelText('Your message'), 'no{Enter}');
    await screen.findByText('And where does that block sit?');

    const order = [...document.querySelectorAll('p')].map((el) => el.textContent);
    expect(order.indexOf('the picture of your week')).toBeGreaterThan(
      order.indexOf('That is every area accounted for.')
    );
    expect(order.indexOf('the picture of your week')).toBeLessThan(
      order.indexOf('And where does that block sit?')
    );
  });

  it('takes an explicit height for a caller that is inside a scrolling column', () => {
    // Phase 6's warm close. Without this the transcript grows and the composer walks down the page,
    // which is the whole bug the frame was built to end.
    render(<CoachChat runId="run-1" conversationId={null} className="h-[26rem]" />);

    const section = screen.getByRole('region', { name: 'Conversation with the coach' });
    expect(section.className).toContain('h-[26rem]');
    expect(section.className).not.toContain('flex-1');
  });
});

/**
 * A run holds **one** conversation across all seven phases (I15), so the transcript rehydrates whole
 * and every phase used to open on the entire audit so far — a leader on phase 2 met the phase 2
 * signpost sitting on top of the whole of phase 0 and 1.
 *
 * `phaseMarks` is what cuts it, and the cut has to fall the right way twice: what belongs to this
 * phase is drawn, and what came before is **kept** rather than dropped. It is the leader's own
 * conversation, and a phase that hid it for good would be a worse answer than the endless scroll.
 */
describe('CoachChat — this phase’s part of one long conversation', () => {
  /** A transcript with ids, as the messages endpoint returns it. */
  const priorTranscript = () =>
    json({
      messages: [
        { id: 'm1', role: 'user', content: 'I am John and I run delivery.' },
        { id: 'm2', role: 'assistant', content: 'Good to meet you.' },
        { id: 'm3', role: 'user', content: 'Roughly twenty hours in meetings.' },
        { id: 'm4', role: 'assistant', content: 'That is half the week.' },
      ],
    });

  it('draws only the turns after this phase’s mark', async () => {
    fetchMock.mockResolvedValueOnce(priorTranscript());

    render(
      <CoachChat
        runId="run-1"
        conversationId="conv-1"
        phaseKey="phase-2-energy"
        phaseMarks={{ 'phase-2-energy': 'm2' }}
      />
    );

    // The mark is the last message that already existed when the phase was entered, so the phase's
    // own turns are everything after it.
    expect(await screen.findByText('Roughly twenty hours in meetings.')).toBeInTheDocument();
    expect(screen.getByText('That is half the week.')).toBeInTheDocument();
    expect(screen.queryByText('I am John and I run delivery.')).not.toBeInTheDocument();
  });

  it('keeps what came before one press away rather than throwing it out', async () => {
    fetchMock.mockResolvedValueOnce(priorTranscript());

    render(
      <CoachChat
        runId="run-1"
        conversationId="conv-1"
        phaseKey="phase-2-energy"
        phaseMarks={{ 'phase-2-energy': 'm2' }}
      />
    );

    const open = await screen.findByRole('button', { name: /read what came earlier/i });
    await userEvent.click(open);

    expect(screen.getByText('I am John and I run delivery.')).toBeInTheDocument();
    expect(screen.getByText('Good to meet you.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /hide what came before/i }));

    expect(screen.queryByText('I am John and I run delivery.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /read what came earlier/i })).toBeInTheDocument();
  });

  it('offers nothing to expand on the first phase, which has nothing behind it', async () => {
    fetchMock.mockResolvedValueOnce(priorTranscript());

    render(
      <CoachChat runId="run-1" conversationId="conv-1" phaseKey="phase-0-setup" phaseMarks={{}} />
    );

    expect(await screen.findByText('I am John and I run delivery.')).toBeInTheDocument();
    // Phase 0 has no mark of its own — nothing was entered to reach it — so it opens at the start of
    // the conversation and the disclosure would be a control that reveals an empty box.
    expect(
      screen.queryByRole('button', { name: /read what came earlier/i })
    ).not.toBeInTheDocument();
  });

  it('draws the whole conversation when the caller has no marks to cut with', async () => {
    fetchMock.mockResolvedValueOnce(priorTranscript());

    // The review surfaces and the form path both mount this without a phase. Losing the cut must
    // mean showing everything, never showing nothing.
    render(<CoachChat runId="run-1" conversationId="conv-1" />);

    expect(await screen.findByText('I am John and I run delivery.')).toBeInTheDocument();
    expect(screen.getByText('That is half the week.')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /read what came earlier/i })
    ).not.toBeInTheDocument();
  });

  it('shows the phase as empty rather than showing it somebody else’s turns', async () => {
    fetchMock.mockResolvedValueOnce(priorTranscript());

    render(
      <CoachChat
        runId="run-1"
        conversationId="conv-1"
        phaseKey="phase-3-ideal"
        phaseMarks={{ 'phase-3-ideal': 'm4' }}
      />
    );

    // A phase entered but not yet spoken in. All four turns belong behind it, and none of them may
    // be drawn as though the leader had said them in this phase.
    const open = await screen.findByRole('button', { name: /read what came earlier/i });
    expect(screen.queryByText('That is half the week.')).not.toBeInTheDocument();

    await userEvent.click(open);
    expect(screen.getByText('That is half the week.')).toBeInTheDocument();
  });
});

/**
 * The composer, for a question whose answers are a fixed set.
 *
 * Most of this audit is answered in the leader's own words. Some of it is not, and until now the
 * conversation asked those the same way: "which quarter or timeframe should we consider" above an
 * empty box, with the four answers visible only on the form path. The coach names the reading by
 * calling `offer_choices`, the result reaches the client on the `capability_result` frame the
 * platform already yields, and the box gives way to the answers.
 *
 * Three properties are load-bearing and each has a test below:
 *
 *  - **The answers appear only once the question has.** A tool result precedes the reply it informs,
 *    so drawing on receipt would put four buttons under a question still being written.
 *  - **Tapping one sends a turn**, identical on the wire to the same words typed, so capture and the
 *    transcript stay honest about where a reading came from.
 *  - **It never closes the question.** The way back to typing is always there, and the offer is gone
 *    by the next turn whatever the leader did with it.
 */

/** An SSE body carrying an offer, then the coach's question, then done — the real frame order. */
function sseWithOffer(text: string, result: unknown): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          `event: capability_result\ndata: ${JSON.stringify({
            type: 'capability_result',
            capabilitySlug: 'reclaim_audit__offer_choices',
            result,
          })}\n\n`
        )
      );
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

const offered = (result: unknown, text = 'Which period should we look at?') => ({
  ok: true,
  status: 200,
  headers: new Headers({ 'content-type': 'text/event-stream' }),
  body: sseWithOffer(text, result),
});

const PERIOD_OFFER = {
  success: true,
  data: {
    slotSlug: 'reclaim_setup_audit_period',
    label: 'The period being audited',
    options: ['last week', 'last month', 'last quarter', 'last year'],
  },
};

/** Send one turn from the text box, so the offer on the reply has somewhere to land. */
async function speak(message = 'hello') {
  await userEvent.type(screen.getByRole('textbox', { name: 'Your message' }), message);
  await userEvent.click(screen.getByRole('button', { name: 'Send' }));
}

describe('CoachChat — a question with a fixed set of answers', () => {
  it('puts the answers where the text box was, once the question has arrived', async () => {
    fetchMock.mockResolvedValue(offered(PERIOD_OFFER));

    render(<CoachChat runId="run-1" conversationId={null} />);
    await speak();

    expect(await screen.findByRole('button', { name: 'last quarter' })).toBeInTheDocument();
    // The box is gone rather than sitting underneath: a row of answers with a text field still below
    // it asks the leader to work out which of the two the tool wants.
    expect(screen.queryByRole('textbox', { name: 'Your message' })).not.toBeInTheDocument();
    // The reading is named for anyone not reading the screen, in the words the panel uses.
    expect(screen.getByRole('group', { name: /the period being audited/i })).toBeInTheDocument();
  });

  it('sends a tapped answer as an ordinary leader turn', async () => {
    fetchMock.mockResolvedValue(offered(PERIOD_OFFER));

    render(<CoachChat runId="run-1" conversationId={null} />);
    await speak();
    await userEvent.click(await screen.findByRole('button', { name: 'last quarter' }));

    // Byte-identical to the same words typed. That is what keeps capture and the transcript honest:
    // nothing is written to a slot because a button was drawn, the coach records what was said.
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/app/reclaim/runs/run-1/coach/stream',
        expect.objectContaining({
          body: JSON.stringify({ kind: 'leader', message: 'last quarter' }),
        })
      )
    );
    expect(await screen.findByText('last quarter')).toBeInTheDocument();
  });

  it('always leaves a way to say something else', async () => {
    // A set is what the audit expects, not what the leader is allowed. Somebody auditing the last
    // six weeks says so, and the answer they type is the answer.
    fetchMock.mockResolvedValue(offered(PERIOD_OFFER));

    render(<CoachChat runId="run-1" conversationId={null} />);
    await speak();
    await userEvent.click(await screen.findByRole('button', { name: /say it in your own words/i }));

    expect(screen.getByRole('textbox', { name: 'Your message' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'last quarter' })).not.toBeInTheDocument();
  });

  it('lets the leader go back to the answers after opening the text box', async () => {
    // Taking the way out used to discard the offer, which made it a door that opened once. Somebody
    // who opens the box to reconsider and then decides the offered answer was right after all should
    // not have to ask the coach to offer them again.
    fetchMock.mockResolvedValue(offered(PERIOD_OFFER));

    render(<CoachChat runId="run-1" conversationId={null} />);
    await speak();
    await userEvent.click(await screen.findByRole('button', { name: /say it in your own words/i }));
    await userEvent.click(screen.getByRole('button', { name: /choose from the answers instead/i }));

    expect(screen.getByRole('button', { name: 'last quarter' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Your message' })).not.toBeInTheDocument();
  });

  it('offers no way back on a turn that never had answers', async () => {
    // The mirror of the rule above: the way back exists only while an offer is standing, so an
    // ordinary open question is not given a control pointing at answers that do not exist.
    fetchMock.mockResolvedValue(sse('What does that time actually look like?'));

    render(<CoachChat runId="run-1" conversationId={null} />);
    await speak();

    expect(await screen.findByText('What does that time actually look like?')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /choose from the answers instead/i })
    ).not.toBeInTheDocument();
  });

  it('tells the leader what to do with the answers, in the words the app labels sections with', async () => {
    fetchMock.mockResolvedValue(offered(PERIOD_OFFER));

    render(<CoachChat runId="run-1" conversationId={null} />);
    await speak();

    // The advisory. Without it the four pills were a row of unexplained buttons sitting in the gap
    // under the continue button, reading as chrome rather than as the answer to the question above.
    expect(await screen.findByText('Choose one')).toBeInTheDocument();
  });

  it('does not carry an offer into the next turn', async () => {
    // Cleared at the top of every turn rather than when one is answered, so whatever the leader does
    // next, the only thing that can put answers back is the coach calling for them again.
    fetchMock.mockResolvedValueOnce(offered(PERIOD_OFFER));
    render(<CoachChat runId="run-1" conversationId={null} />);
    await speak();
    expect(await screen.findByRole('button', { name: 'last quarter' })).toBeInTheDocument();

    fetchMock.mockResolvedValue(sse('And what does that time look like?'));
    await userEvent.click(screen.getByRole('button', { name: 'last quarter' }));

    expect(await screen.findByText('And what does that time look like?')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'last quarter' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Your message' })).toBeInTheDocument();
  });

  it('leaves the text box alone for a refusal, or for a frame it cannot read', async () => {
    // The capability refuses when the reading has no answer set or belongs to another section. Both
    // mean there is nothing to draw, and the correct failure is the composer the leader always had.
    fetchMock.mockResolvedValue(
      offered({ success: false, error: { code: 'no_choices', message: 'Ask it openly.' } })
    );

    render(<CoachChat runId="run-1" conversationId={null} />);
    await speak();

    expect(await screen.findByText('Which period should we look at?')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Your message' })).toBeInTheDocument();
  });

  it('ignores an offer whose answers it cannot trust', async () => {
    // The frame is external data by the time it is read, whoever we believe sent it. Two buttons
    // reading the same word is a choice with a wrong answer in it, and the leader cannot tell which
    // one the audit will hear.
    fetchMock.mockResolvedValue(
      offered({
        success: true,
        data: {
          slotSlug: 'reclaim_setup_audit_period',
          label: 'The period being audited',
          options: ['last quarter', 'last quarter'],
        },
      })
    );

    render(<CoachChat runId="run-1" conversationId={null} />);
    await speak();

    expect(await screen.findByText('Which period should we look at?')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Your message' })).toBeInTheDocument();
  });
});

/**
 * A failed turn used to cost the leader their sentence (F16 t-2).
 *
 * `send()` cleared the composer before opening the stream, so a turn that failed left "You can try
 * again" beside an empty box and a message the leader would have to retype from memory. The fix is
 * not simply "put it back": whether that is safe depends on whether the server already holds it,
 * and re-sending a persisted message would put it in the conversation twice.
 *
 * Both directions are tested, because getting one right and the other wrong is worse than neither:
 * losing a sentence is annoying, and silently duplicating one in somebody's own record of their
 * working life is a defect they would have to spot themselves.
 */
describe('CoachChat — a turn that failed', () => {
  it('gives the words back when the server never received them', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, body: null });

    render(<CoachChat runId="run-1" conversationId={null} />);
    const box = screen.getByRole('textbox', { name: 'Your message' });
    await userEvent.type(box, 'I keep getting pulled into delivery');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByRole('status')).toHaveTextContent(/could not be reached/);
    // Back in the composer, exactly as written, so "try again" is one press rather than retyping.
    await waitFor(() => expect(box).toHaveValue('I keep getting pulled into delivery'));
    expect(screen.getByRole('status')).toHaveTextContent(/back in the box below/);
  });

  it('does not leave the optimistic line behind when it restores the draft', async () => {
    // The line was drawn assuming the turn would work. Leaving it beside a refilled composer would
    // show the leader their sentence twice and make sending it look like a duplicate.
    fetchMock.mockResolvedValue({ ok: false, status: 500, body: null });

    render(<CoachChat runId="run-1" conversationId={null} />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Your message' }), 'a thing I said');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    await screen.findByRole('status');
    // The transcript is back to empty, which is the state it was in before the turn that failed.
    // Asserted this way rather than by querying for the sentence: the composer now holds it, on
    // purpose, and it sits inside the same labelled region as the transcript.
    expect(screen.getByText(/there are no wrong answers here/)).toBeInTheDocument();
  });

  it('keeps the words sent when the server already has them, rather than inviting a duplicate', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/event-stream' }),
      body: sseFailsAfterStart(),
    });

    render(<CoachChat runId="run-1" conversationId={null} />);
    const box = screen.getByRole('textbox', { name: 'Your message' });
    await userEvent.type(box, 'something already recorded');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByRole('status')).toHaveTextContent(/The model stopped/);
    // The composer stays empty: their words are in the conversation, and putting them back would
    // invite the leader to say the same thing twice.
    expect(box).toHaveValue('');
    expect(screen.getByRole('status')).toHaveTextContent(/no need to write it again/);
    // And the line stays in the transcript, because the server really does hold it.
    expect(screen.getByText('something already recorded')).toBeInTheDocument();
  });

  it('never overwrites something the leader has started typing since', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, body: null });

    render(<CoachChat runId="run-1" conversationId={null} />);
    const box = screen.getByRole('textbox', { name: 'Your message' });
    await userEvent.type(box, 'first thought');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByRole('status');

    // A leader who began a new sentence while the turn was failing keeps it: restoring over the top
    // would take away words they can see in favour of words they cannot.
    await userEvent.clear(box);
    await userEvent.type(box, 'second thought');
    expect(box).toHaveValue('second thought');
  });
});
