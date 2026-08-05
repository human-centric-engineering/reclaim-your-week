/**
 * Section 6 — one question, then the report, and nothing of the conversation left on screen.
 *
 * Three things are pinned here, and each of them was a defect a leader met:
 *
 * **The cut.** A run holds one conversation across all seven phases (I15), and `phaseMarks` is what
 * cuts it so a phase draws its own turns. Every phase went through `PhaseConversation` and got that
 * cut; phase 6 did not — it is a panel with its own conversation, and the marks were never threaded
 * to it. So the last question of the audit arrived underneath the entire forty minutes that led to it.
 *
 * **The gate.** The report used to appear only once the coach had written the takeaway to a slot.
 * That write fails in ways the leader has nothing to do with, and when it did they were asked the
 * last question again, and again, with their finished audit behind it. The gate is their *answer*.
 *
 * **The end.** Once the report is on screen there is no composer, no chat and no invitation to say
 * anything else. The report is the end of the audit and the screen has to look like it.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Phase6Panel } from '@/components/app/reclaim/phase/phase6-panel';

// The report and the controls beside it each have their own suite. Here they stand in as markers, so
// every assertion below is about which of the two states the panel is in.
vi.mock('@/components/app/reclaim/summary/summary-view', () => ({
  SummaryView: () => <div data-testid="summary-view" />,
}));
vi.mock('@/components/app/reclaim/report/report-actions', () => ({
  ReportActions: () => <div data-testid="report-actions" />,
}));
vi.mock('@/components/app/reclaim/referral-invite', () => ({ ReferralInvite: () => null }));

const json = (data: unknown) => ({
  ok: true,
  status: 200,
  headers: new Headers({ 'content-type': 'application/json' }),
  json: async () => ({ success: true, data }),
});

/**
 * A `/coach/stream` response that opens and immediately closes with no frames.
 *
 * `CoachChat` commits whatever text arrived and calls `onTurnComplete` in its `finally` block once
 * the reader reports `done` — that happens whether or not anything was actually said, so an empty
 * stream is enough to settle a turn and is far simpler than assembling real SSE frames.
 */
function emptyStreamResponse(): Response {
  const stream = new ReadableStream({
    start(controller) {
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

/** Enough of a summary to satisfy the schema; none of it is asserted on. */
const SUMMARY = {
  firstName: 'John',
  auditedOn: '2026-07-29T10:00:00.000Z',
  contactEmail: 'rashmir@rashmir.net',
  role: null,
  orgType: null,
  period: null,
  priorities: null,
  current: { source: 'current', buckets: [], totalHours: 0, unallocated: [] },
  rows: [],
  action: { chosen: null, when: null, howKnown: null },
  report: null,
  footnote: 'Your own words, gathered.',
};

/**
 * The run's whole conversation, as the messages endpoint returns it.
 *
 * `m1`–`m4` are the audit that led here; `m5` onward is section 6. The mark is the last message that
 * already existed when the phase was entered, so the boundary falls after `m4`.
 */
const TRANSCRIPT = {
  messages: [
    { id: 'm1', role: 'user', content: 'Roughly twenty hours in meetings.' },
    { id: 'm2', role: 'assistant', content: 'That is half the week.' },
    { id: 'm3', role: 'user', content: 'I will protect Tuesday mornings.' },
    { id: 'm4', role: 'assistant', content: 'Whenever you are ready, we can move on.' },
    { id: 'm5', role: 'assistant', content: 'What are you taking away from this audit?' },
  ],
};

/**
 * The same conversation, with the leader having answered.
 *
 * The takeaway is deliberately *not* recorded in the answers for most tests that use this, which is
 * the point: a leader who has answered has finished with the question, whether or not
 * `record_answers` fired behind it.
 */
const ANSWERED_TRANSCRIPT = {
  messages: [
    ...TRANSCRIPT.messages,
    { id: 'm6', role: 'user', content: 'That I have been paying for my own availability.' },
    { id: 'm7', role: 'assistant', content: 'That is a clear thing to have seen.' },
  ],
};

const PHASE_MARKS = { 'phase-6-summary': 'm4' };

/** The opening already claimed, so the conversation fires no turn this suite has to stream. */
const OPENINGS = ['phase-6-open'];

const fetchMock = vi.fn();

/** The run's answers, and the transcript behind them — the two reads the gate turns on. */
function serve(takeaway?: string, transcript: { messages: unknown[] } = TRANSCRIPT) {
  fetchMock.mockImplementation((input: string | URL) => {
    const url = typeof input === 'string' ? input : input.href;
    if (url.includes('/summary')) return Promise.resolve(json(SUMMARY));
    if (url.includes('/answers')) {
      return Promise.resolve(
        json({
          answers:
            takeaway === undefined
              ? {}
              : {
                  reclaim_reflection_p6: {
                    value: takeaway,
                    valueJson: null,
                    sourceType: 'direct',
                    confidence: 1,
                  },
                },
        })
      );
    }
    if (url.includes('/messages')) return Promise.resolve(json(transcript));
    if (url.includes('/coach/stream')) return Promise.resolve(emptyStreamResponse());
    if (url.includes('/complete')) return Promise.resolve(json({}));
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
}

function panel() {
  return (
    <Phase6Panel
      runId="run-1"
      conversationId="conv-1"
      coachOpenings={OPENINGS}
      phaseMarks={PHASE_MARKS}
      onAdvanced={() => {}}
    />
  );
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe('Phase6Panel — the last question, not the whole audit', () => {
  it('draws only this phase’s turns while it asks for the takeaway', async () => {
    serve();
    render(panel());

    expect(
      await screen.findByText('What are you taking away from this audit?')
    ).toBeInTheDocument();
    // The defect: forty minutes of the audit replayed above the question it is asking.
    expect(screen.queryByText('Roughly twenty hours in meetings.')).not.toBeInTheDocument();
    expect(screen.queryByText('Whenever you are ready, we can move on.')).not.toBeInTheDocument();
  });

  it('keeps what came before one press away rather than throwing it out', async () => {
    serve();
    render(panel());

    await userEvent.click(await screen.findByRole('button', { name: /read what came earlier/i }));

    // It is the leader's own conversation, and hiding it for good would be a worse answer than the
    // scroll it replaced.
    expect(screen.getByText('Roughly twenty hours in meetings.')).toBeInTheDocument();
    expect(screen.getByText('Whenever you are ready, we can move on.')).toBeInTheDocument();
  });

  it('holds the report back until they have answered', async () => {
    serve(undefined, TRANSCRIPT);
    render(panel());

    expect(
      await screen.findByText('What are you taking away from this audit?')
    ).toBeInTheDocument();
    expect(screen.queryByTestId('summary-view')).not.toBeInTheDocument();
  });
});

describe('Phase6Panel — the report is released by the answer, not by the recording', () => {
  it('produces the report once the leader has answered, recorded or not', async () => {
    serve(undefined, ANSWERED_TRANSCRIPT);
    render(panel());

    expect(await screen.findByTestId('summary-view')).toBeInTheDocument();
    expect(screen.getByTestId('report-actions')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /finish my audit/i })).toBeInTheDocument();
  });

  it('takes the conversation off the screen entirely', async () => {
    serve(undefined, ANSWERED_TRANSCRIPT);
    render(panel());
    await screen.findByTestId('summary-view');

    // Not hidden and not scrolled past. A screen that has just handed somebody the document forty
    // minutes of work produced must not still be asking what else they would like to say.
    expect(screen.queryByPlaceholderText(/write to the coach/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^send$/i })).not.toBeInTheDocument();
    expect(screen.queryByText('That is a clear thing to have seen.')).not.toBeInTheDocument();
  });
});

describe('Phase6Panel — sharing is with one person, and it says so', () => {
  it('offers sharing with Rashmir and states what she will be able to do', async () => {
    serve(undefined, ANSWERED_TRANSCRIPT);
    render(panel());
    await screen.findByTestId('summary-view');

    expect(screen.getByLabelText(/share my report with rashmir/i)).toBeInTheDocument();
    // Consent with the consequence left off is a form, not an invitation (Brief §3).
    expect(screen.getByText(/read this report and talk it through with you/i)).toBeInTheDocument();
  });

  it('offers no public link, and says there is none', async () => {
    serve(undefined, ANSWERED_TRANSCRIPT);
    render(panel());
    await screen.findByTestId('summary-view');

    // The link was unrevokable and served the most personal document this product makes with no
    // session at all. It is gone from the screen because it is gone from the server.
    expect(screen.queryByLabelText(/create a link/i)).not.toBeInTheDocument();
    expect(screen.getByText(/no public link to it anywhere/i)).toBeInTheDocument();
  });

  it('does not ask to quote a sentence it never captured', async () => {
    serve(undefined, ANSWERED_TRANSCRIPT);
    render(panel());
    await screen.findByTestId('summary-view');

    // The consent and the sentence it is about travel together: an empty box under "what you said
    // you were taking away", with a tickbox beneath it, asks permission to quote nothing.
    expect(screen.queryByText(/what you said you were taking away/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/quoted anonymously/i)).not.toBeInTheDocument();
  });

  it('offers the quote consent when the coach did record it', async () => {
    serve('That I have been paying for my own availability.', ANSWERED_TRANSCRIPT);
    render(panel());
    await screen.findByTestId('summary-view');

    const box = screen.getByText(/what you said you were taking away/i).parentElement;
    expect(box).toHaveTextContent('That I have been paying for my own availability.');
    expect(screen.getByLabelText(/may be quoted anonymously/i)).toBeInTheDocument();
  });
});

describe('Phase6Panel — finishing explains itself', () => {
  it('says what finishing does before it is pressed', async () => {
    serve(undefined, ANSWERED_TRANSCRIPT);
    render(panel());
    await screen.findByTestId('summary-view');

    // The one control on the page that changes anything permanently, and the one a leader could not
    // tell apart from the three above it.
    expect(screen.getByText(/closes the conversation with the coach/i)).toBeInTheDocument();
    expect(screen.getByText(/report is not going anywhere/i)).toBeInTheDocument();
  });

  it('replaces the whole screen with the closing affirmation once finishing completes', async () => {
    serve(undefined, ANSWERED_TRANSCRIPT);
    render(panel());
    await screen.findByTestId('summary-view');

    await userEvent.click(screen.getByRole('button', { name: /finish my audit/i }));

    // The report, the sharing panel and the finish control are all gone — this is the one other
    // screen the panel can be in, not a state layered on top of the report.
    expect(await screen.findByText(/no pressure\. the work is yours\./i)).toBeInTheDocument();
    expect(screen.queryByTestId('summary-view')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /finish my audit/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back to your audit/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /rashmir@rashmir\.net/i })).toHaveAttribute(
      'href',
      'mailto:rashmir@rashmir.net'
    );
  });
});

describe('Phase6Panel — the three reads it gates on can each fail on their own', () => {
  it('shows a fallback message when the summary itself cannot be loaded', async () => {
    fetchMock.mockImplementation((input: string | URL) => {
      const url = typeof input === 'string' ? input : input.href;
      if (url.includes('/summary')) return Promise.reject(new Error('network down'));
      if (url.includes('/answers')) return Promise.resolve(json({ answers: {} }));
      if (url.includes('/messages')) return Promise.resolve(json(TRANSCRIPT));
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });
    render(panel());

    expect(await screen.findByText('We could not load your report just now.')).toBeInTheDocument();
    // Neither the question nor the report — the summary is the one read that fails hard rather than
    // degrading, because there is nothing honest to show in its place.
    expect(screen.queryByText('What are you taking away from this audit?')).not.toBeInTheDocument();
  });

  it('treats a takeaway read failure as no takeaway, rather than leaving the gate stuck', async () => {
    fetchMock.mockImplementation((input: string | URL) => {
      const url = typeof input === 'string' ? input : input.href;
      if (url.includes('/summary')) return Promise.resolve(json(SUMMARY));
      if (url.includes('/answers')) return Promise.reject(new Error('answers unreachable'));
      if (url.includes('/messages')) return Promise.resolve(json(TRANSCRIPT));
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });
    render(panel());

    // A failed read of the takeaway must not hang the "Gathering your report…" gate forever — it
    // resolves to "no takeaway yet" and the leader still meets the last question.
    expect(
      await screen.findByText('What are you taking away from this audit?')
    ).toBeInTheDocument();
    expect(screen.queryByText('Gathering your report…', { exact: false })).not.toBeInTheDocument();
  });
});

describe('Phase6Panel — a run with no conversation yet cannot have been answered', () => {
  it('asks the question rather than assuming an answer when conversationId is null', async () => {
    serve();
    render(
      <Phase6Panel
        runId="run-1"
        conversationId={null}
        coachOpenings={OPENINGS}
        phaseMarks={PHASE_MARKS}
        onAdvanced={() => {}}
      />
    );

    // No transcript to read means "not answered", the safe way round — the coach stays there to ask
    // rather than a leader being shown a report for an answer that was never actually given.
    expect(await screen.findByPlaceholderText(/write to the coach/i)).toBeInTheDocument();
    expect(screen.queryByTestId('summary-view')).not.toBeInTheDocument();
  });
});

describe('Phase6Panel — the opening claims itself when the run has not recorded it yet', () => {
  it('passes an opening moment when phase-6-open is not already claimed, and moves the leader on once that turn settles', async () => {
    serve(undefined, TRANSCRIPT);
    const onAdvanced = vi.fn();
    render(
      <Phase6Panel
        runId="run-1"
        conversationId="conv-1"
        // Deliberately NOT including 'phase-6-open' — the run has not recorded this beat yet, so the
        // panel must hand CoachChat a moment to open rather than `null`.
        coachOpenings={[]}
        phaseMarks={PHASE_MARKS}
        onAdvanced={onAdvanced}
      />
    );

    // CoachChat fires that opening turn on its own once hydrated; when it settles, onTurnComplete
    // re-reads the takeaway and the answered state and tells the parent to move on.
    await waitFor(() => expect(onAdvanced).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/coach/stream'),
      expect.objectContaining({ method: 'POST' })
    );
  });
});
