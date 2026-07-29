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
        footer={<button type="button">Continue to the next phase</button>}
      />
    );

    expect(screen.getByText('the signpost')).toBeInTheDocument();
    expect(screen.getByText('the chart')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue to the next phase' })).toBeInTheDocument();
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
