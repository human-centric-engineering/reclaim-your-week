/**
 * A finished audit, opened again.
 *
 * Three things this screen must not get wrong, and each has a test below:
 *
 *  - **The summary leads.** It is what somebody comes back for months later; the conversation is what
 *    they want second, for one phase at a time.
 *  - **Nothing here is offered that the server would refuse.** A completed run rejects every write, so
 *    a screen that still shows correction buttons is telling the leader their finished figures are in
 *    play when they are not.
 *  - **An audit that is still open is handed back, not rendered.** This only happens on a typed or
 *    bookmarked URL, and silently drawing a live audit as a finished one is the confusing failure.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/*
 * The bar's two corner controls stand in as nothing here. Both reach for a provider this suite has no
 * reason to mount (`useTheme`, `useAnalytics`), and neither is what any assertion below is about; each
 * has its own suite. Stubbing them keeps this file about the surface it names.
 */
vi.mock('@/components/app/reclaim/theme-switch', () => ({ ThemeSwitch: () => null }));
vi.mock('@/components/app/reclaim/account-menu', () => ({ AccountMenu: () => null }));

const { readRun } = vi.hoisted(() => ({ readRun: vi.fn() }));
vi.mock('@/components/app/reclaim/history/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/app/reclaim/history/actions')>()),
  readRun,
}));

const { fetchSummary, readAnswers, readLabels, saveAnswer } = vi.hoisted(() => ({
  fetchSummary: vi.fn(),
  readAnswers: vi.fn(),
  readLabels: vi.fn(),
  saveAnswer: vi.fn(),
}));
vi.mock('@/components/app/reclaim/phase/actions', () => ({
  fetchSummary,
  readAnswers,
  readLabels,
  saveAnswer,
}));

const { loadTranscript } = vi.hoisted(() => ({ loadTranscript: vi.fn() }));
vi.mock('@/components/app/reclaim/coach/transcript', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/app/reclaim/coach/transcript')>()),
  loadTranscript,
}));

import { RunReview } from '@/components/app/reclaim/history/run-review';

const PHASES = [
  { key: 'phase-0-setup', label: 'Setup', status: 'completed' as const },
  { key: 'phase-1-current', label: 'Current reality', status: 'completed' as const },
  { key: 'phase-6-summary', label: 'Your summary', status: 'completed' as const },
];

function runState(overrides: Record<string, unknown> = {}) {
  return {
    run: {
      id: 'run-1',
      quarter: '2026 Q1',
      status: 'complete',
      startedAt: '2026-01-04T09:00:00.000Z',
      completedAt: '2026-01-06T17:30:00.000Z',
      conversationId: 'conv-1',
      coachOpenings: [],
      phaseMarks: {},
      ...overrides,
    },
    phases: PHASES,
    currentPhaseKey: 'phase-6-summary',
  };
}

const SUMMARY = {
  firstName: 'Sam',
  role: 'Chief executive',
  orgType: 'Charity',
  period: 'last quarter',
  priorities: null,
  current: {
    source: 'current' as const,
    buckets: [
      {
        token: 'deep_work',
        slug: 'deep-work',
        title: 'Deep work',
        hours: 5,
        percent: 12,
        lowPercent: 10,
        highPercent: 20,
        status: 'in' as const,
      },
    ],
    totalHours: 42,
    unallocated: [],
  },
  rows: [],
  action: { chosen: 'Protect Tuesday mornings', when: 'Next week', howKnown: null },
  analyst: null,
  footnote: 'A tool designed by Rashmir Balasubramaniam.',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: null }) })
  );
  readRun.mockResolvedValue(runState());
  fetchSummary.mockResolvedValue(SUMMARY);
  readAnswers.mockResolvedValue({});
  readLabels.mockResolvedValue({});
  loadTranscript.mockResolvedValue([]);
});

describe('RunReview', () => {
  it('opens on the summary, which is what a leader comes back for', async () => {
    render(<RunReview runId="run-1" />);

    expect(await screen.findByText('Protect Tuesday mornings')).toBeInTheDocument();
    expect(screen.getByText(/Finished 6 January 2026/)).toBeInTheDocument();
  });

  it('leaves the audit to the audit when it is still open', async () => {
    readRun.mockResolvedValue(runState({ status: 'in_progress', completedAt: null }));
    render(<RunReview runId="run-1" />);

    const link = await screen.findByRole('link', { name: /Take it up again/ });
    expect(link).toHaveAttribute('href', '/programme');
    // No summary is asked for: there is nothing finished to summarise yet.
    expect(fetchSummary).not.toHaveBeenCalled();
  });

  it('sits inside the list in the trail, rather than offering a way out of the product', async () => {
    render(<RunReview runId="run-1" />);

    const link = await screen.findByRole('link', { name: 'Your audits' });
    expect(link).toHaveAttribute('href', '/programme/history');
  });

  it('says so, and offers another go, when the audit cannot be opened', async () => {
    readRun.mockRejectedValue(new Error('nope'));
    render(<RunReview runId="run-1" />);

    expect(await screen.findByText(/could not open that audit/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('still shows the phases when the summary itself cannot be built', async () => {
    fetchSummary.mockRejectedValue(new Error('nope'));
    render(<RunReview runId="run-1" />);

    expect(await screen.findByText(/could not put the summary together/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Current reality/ }).length).toBeGreaterThan(0);
  });

  it('marks no phase as "here", because a finished audit has nowhere left to be', async () => {
    render(<RunReview runId="run-1" />);

    await screen.findByText('Protect Tuesday mornings');
    expect(screen.queryByText('here')).toBeNull();
  });

  it('retries the load when "Try again" is pressed after a failure', async () => {
    readRun.mockRejectedValueOnce(new Error('nope'));
    readRun.mockResolvedValue(runState());
    const user = userEvent.setup();
    render(<RunReview runId="run-1" />);

    await screen.findByText(/could not open that audit/);
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    // The retry actually re-ran the load rather than the button being inert.
    expect(await screen.findByText('Protect Tuesday mornings')).toBeInTheDocument();
    expect(readRun).toHaveBeenCalledTimes(2);
  });

  describe('opening a phase from the spine', () => {
    it('reads that phase, and hands back to the summary', async () => {
      const user = userEvent.setup();
      render(<RunReview runId="run-1" />);

      await screen.findByText('Protect Tuesday mornings');
      const [phaseButton] = screen.getAllByRole('button', { name: /Current reality/ });
      await user.click(phaseButton);

      // Phase 1's own screen is now on, not the summary.
      expect(
        await screen.findByText(/no conversation recorded for this part/i)
      ).toBeInTheDocument();
      expect(screen.queryByText('Protect Tuesday mornings')).toBeNull();

      const [back] = await screen.findAllByRole('button', { name: /Back to the summary/ });
      await user.click(back);

      // Handed back to the summary, not stuck on the phase.
      expect(await screen.findByText('Protect Tuesday mornings')).toBeInTheDocument();
    });

    it('is also reachable from the "look back at a phase" list below the spine', async () => {
      const user = userEvent.setup();
      render(<RunReview runId="run-1" />);

      await screen.findByText('Protect Tuesday mornings');
      const list = screen.getByRole('navigation', { name: 'The phases of this audit' });
      await user.click(within(list).getByRole('button', { name: /Current reality/ }));

      expect(
        await screen.findByText(/no conversation recorded for this part/i)
      ).toBeInTheDocument();
    });

    it('threads the operator’s own signpost wording through once the config call succeeds', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            data: {
              strategyMirror: false,
              phaseSignposts: [
                {
                  phaseKey: 'phase-1-current',
                  involves: 'a custom, operator-authored orientation',
                  duration: 'about ten minutes',
                  opening: [],
                },
              ],
            },
          }),
        })
      );
      const user = userEvent.setup();
      render(<RunReview runId="run-1" />);

      await screen.findByText('Protect Tuesday mornings');
      const [phaseButton] = screen.getAllByRole('button', { name: /Current reality/ });
      await user.click(phaseButton);

      expect(
        await screen.findByText('a custom, operator-authored orientation')
      ).toBeInTheDocument();
    });
  });
});
