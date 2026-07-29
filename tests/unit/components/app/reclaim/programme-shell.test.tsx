/**
 * The frame that holds a run.
 *
 * It had no test at all through eleven features, which is how it came to be a document that grew
 * downwards: nothing described the shape it was supposed to have, so nothing noticed when the shape
 * stopped working. What is pinned here is the shape, not the styling — one bounded region that
 * scrolls, the phases beside it, and the same frame around both surfaces so switching between them
 * does not change the page.
 *
 * The gates in front of a run matter as much as the run: a leader with no session, no consent, or a
 * failed read must land somewhere with a way forward rather than an empty screen.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useEffect } from 'react';
import { render, screen, waitFor } from '@testing-library/react';

/*
 * The bar's two corner controls stand in as nothing here. Both reach for a provider this suite has no
 * reason to mount (`useTheme`, `useAnalytics`), and neither is what any assertion below is about; each
 * has its own suite. Stubbing them keeps this file about the surface it names.
 */
vi.mock('@/components/app/reclaim/theme-switch', () => ({ ThemeSwitch: () => null }));
vi.mock('@/components/app/reclaim/account-menu', () => ({ AccountMenu: () => null }));
import userEvent from '@testing-library/user-event';

/**
 * How many times the conversation has been mounted.
 *
 * The transcript is component state, so a remount is a lost conversation. Counting mounts is the only
 * way to see the difference the quiet reload makes: the loading frame flashes and resolves inside a
 * single act(), so asserting on the "Gathering your audit…" text passes whether or not the fix is
 * there — which it did, on the first version of this test.
 */
const mounts = vi.hoisted(() => ({ conversation: 0 }));

// The phase surfaces are exercised by their own suites; here they stand in as markers, so this test
// is about the frame rather than about what the frame contains.
vi.mock('@/components/app/reclaim/coach/phase-conversation', () => ({
  PhaseConversation: ({
    onSwitchToForm,
    onAdvanced,
  }: {
    onSwitchToForm: () => void;
    onAdvanced: () => void;
  }) => {
    useEffect(() => {
      mounts.conversation += 1;
    }, []);
    return (
      <div data-testid="conversation">
        <button type="button" onClick={onSwitchToForm}>
          I would rather fill this in myself
        </button>
        <button type="button" onClick={onAdvanced}>
          advance
        </button>
      </div>
    );
  },
}));
vi.mock('@/components/app/reclaim/phase/phase2-panel', () => ({
  Phase2Panel: ({ onAdvanced }: { onAdvanced: () => void }) => (
    <div data-testid="form-panel">
      <button type="button" onClick={onAdvanced}>
        advance from the form
      </button>
    </div>
  ),
}));
vi.mock('@/components/app/reclaim/phase/setup-panel', () => ({
  SetupPanel: () => <div data-testid="setup-panel" />,
}));
vi.mock('@/components/app/reclaim/phase/phase6-panel', () => ({
  Phase6Panel: () => <div data-testid="summary-panel" />,
}));
vi.mock('@/components/app/reclaim/phase/phase1-panel', () => ({
  Phase1Panel: () => <div data-testid="panel-phase-1-current" />,
}));
vi.mock('@/components/app/reclaim/phase/phase3-panel', () => ({
  Phase3Panel: () => <div data-testid="panel-phase-3-ideal" />,
}));
vi.mock('@/components/app/reclaim/phase/phase4-panel', () => ({
  Phase4Panel: () => <div data-testid="panel-phase-4-gap" />,
}));
vi.mock('@/components/app/reclaim/phase/phase5-panel', () => ({
  Phase5Panel: () => <div data-testid="panel-phase-5-action" />,
}));
vi.mock('@/components/app/reclaim/repeat/trend-lines', () => ({ TrendLines: () => null }));
vi.mock('@/components/app/reclaim/begin-audit', () => ({
  BeginAudit: ({ onStarted }: { onStarted: () => void }) => (
    <div data-testid="begin-audit">
      <button type="button" onClick={onStarted}>
        Begin
      </button>
    </div>
  ),
}));
vi.mock('@/components/app/reclaim/consent-gate', () => ({
  ConsentGate: ({ onAccepted }: { onAccepted: () => void }) => (
    <div data-testid="consent-gate">
      <button type="button" onClick={onAccepted}>
        I accept the terms
      </button>
    </div>
  ),
}));

import { ProgrammeShell } from '@/components/app/reclaim/programme-shell';

const PHASES = [
  { key: 'phase-0-setup', label: 'Setup', status: 'completed' as const },
  { key: 'phase-1-current', label: 'Current reality', status: 'completed' as const },
  { key: 'phase-2-energy', label: 'Energy', status: 'active' as const },
  { key: 'phase-3-ideal', label: 'Ideal week', status: 'upcoming' as const },
  { key: 'phase-4-gap', label: 'Gap analysis', status: 'upcoming' as const },
  { key: 'phase-5-action', label: 'Action plan', status: 'upcoming' as const },
  { key: 'phase-6-summary', label: 'Summary', status: 'upcoming' as const },
];

const runState = (over: Record<string, unknown> = {}) => ({
  run: { id: 'run-1', quarter: '2026 Q3', conversationId: 'conv-1', coachOpenings: [] },
  phases: PHASES,
  currentPhaseKey: 'phase-2-energy',
  ...over,
});

const fetchMock = vi.fn();

/** Answer the shell's two reads: the run, then the operator's config. */
function respond(state: unknown, { configOk = true } = {}) {
  fetchMock.mockImplementation((url: string) => {
    if (url.includes('/runs/current')) {
      return Promise.resolve({ ok: true, json: async () => ({ success: true, data: state }) });
    }
    if (!configOk) return Promise.reject(new Error('config unavailable'));
    return Promise.resolve({
      ok: true,
      json: async () => ({ success: true, data: { strategyMirror: false, phaseSignposts: [] } }),
    });
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  window.localStorage.clear();
  mounts.conversation = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ProgrammeShell — before there is a run', () => {
  it('says it is gathering the audit rather than showing an empty frame', () => {
    respond(runState());
    render(<ProgrammeShell />);

    expect(screen.getByText(/Gathering your audit/)).toBeInTheDocument();
  });

  it('offers a way to try again when the run cannot be read', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) });
    render(<ProgrammeShell />);

    expect(await screen.findByText(/could not load your audit/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    // Retried rather than left stranded.
    expect(
      fetchMock.mock.calls.filter(([u]) => String(u).includes('/runs/current')).length
    ).toBeGreaterThan(1);
  });

  it('stands the consent gate in front of the invitation to begin', async () => {
    respond(runState({ run: null }));
    render(<ProgrammeShell />);

    expect(await screen.findByTestId('consent-gate')).toBeInTheDocument();
    expect(screen.queryByTestId('begin-audit')).not.toBeInTheDocument();
  });

  it('hands straight through to the invitation once the terms are accepted', async () => {
    respond(runState({ run: null }));
    render(<ProgrammeShell />);

    await userEvent.click(await screen.findByRole('button', { name: 'I accept the terms' }));

    expect(await screen.findByTestId('begin-audit')).toBeInTheDocument();
    expect(screen.queryByTestId('consent-gate')).not.toBeInTheDocument();
  });

  it('re-reads the run once one has been started, rather than staying on the invitation', async () => {
    respond(runState({ run: null }));
    render(<ProgrammeShell />);

    await userEvent.click(await screen.findByRole('button', { name: 'I accept the terms' }));
    respond(runState());
    await userEvent.click(screen.getByRole('button', { name: 'Begin' }));

    expect(await screen.findByTestId('conversation')).toBeInTheDocument();
  });

  /**
   * This used to look for "Leave the audit", the single link the bar carried. The link is gone and
   * what it was protecting is not: a leader stopped at the consent gate must still have the bar, and
   * with it the trail back to the audit and the menu that holds their account. The corner controls
   * are stubbed at the top of this file, so what is asserted here is the frame reaching the gates.
   */
  it('keeps the bar on screen even at the gates', async () => {
    respond(runState({ run: null }));
    render(<ProgrammeShell />);

    expect(await screen.findByRole('link', { name: 'Reclaim your week' })).toHaveAttribute(
      'href',
      '/programme'
    );
  });
});

describe('ProgrammeShell — the frame around a run', () => {
  it('names where the leader is, and shows the phases beside the phase', async () => {
    respond(runState());
    render(<ProgrammeShell />);

    expect(await screen.findByText('Section 2 · Energy')).toBeInTheDocument();
    // Both rails render (the column and the narrow-screen strip); CSS decides which is visible.
    expect(
      screen.getAllByRole('navigation', { name: 'Your progress through the audit' }).length
    ).toBeGreaterThan(0);
  });

  it('opens a phase as a conversation, which is what the tool is', async () => {
    respond(runState());
    render(<ProgrammeShell />);

    expect(await screen.findByTestId('conversation')).toBeInTheDocument();
    expect(screen.queryByTestId('form-panel')).not.toBeInTheDocument();
  });

  it('switches to the form and remembers the choice, per leader', async () => {
    respond(runState());
    const { unmount } = render(<ProgrammeShell />);

    await userEvent.click(await screen.findByRole('button', { name: /fill this in myself/ }));
    expect(await screen.findByTestId('form-panel')).toBeInTheDocument();
    // The form path keeps the door back open.
    expect(screen.getByRole('button', { name: /talk this through/ })).toBeInTheDocument();

    unmount();
    render(<ProgrammeShell />);
    // Remembered in localStorage, so the choice does not have to be made again at every phase.
    expect(await screen.findByTestId('form-panel')).toBeInTheDocument();

    // And the door back is a door, not a label.
    await userEvent.click(screen.getByRole('button', { name: /talk this through/ }));
    expect(await screen.findByTestId('conversation')).toBeInTheDocument();
  });

  it('keeps the conversation mounted while it re-reads, or the transcript goes with it', async () => {
    // The refresh fires after *every* coach turn, not only when the phase moves. A loud reload swaps
    // the whole shell for "Gathering your audit…", which unmounts the chat — and the transcript is
    // component state, so a leader watched the answer they were reading vanish mid-sentence and come
    // back a moment later. The quiet path is the fix, and this is what stops it going inert again.
    respond(runState());
    render(<ProgrammeShell />);
    await screen.findByTestId('conversation');
    expect(mounts.conversation).toBe(1);

    await userEvent.click(screen.getByRole('button', { name: 'advance' }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([u]) => String(u).includes('/runs/current')).length
      ).toBeGreaterThan(1)
    );

    // Still the same mount: the data was swapped underneath the conversation, not around it.
    expect(mounts.conversation).toBe(1);
  });

  it('remounts the conversation when the phase moves, or the new phase opens on the old one’s turns', async () => {
    // The other half of the same decision, and the one that was missing. A run holds ONE conversation
    // across all seven phases, and `CoachChat` cuts this phase's part out of it once, on hydration,
    // then keeps the result in state. So the quiet reload that is exactly right mid-phase is exactly
    // wrong across a phase boundary: same element, same position, React reconciles, the hydration
    // guard short-circuits, and phase 3 renders its signpost on top of every phase-2 turn — the
    // defect `phaseMarks` exists to fix, surviving the fix. `key={currentPhase.key}` is what makes
    // the remount real, and counting mounts is the only way to see it.
    let state: unknown = runState();
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/runs/current')) {
        return Promise.resolve({ ok: true, json: async () => ({ success: true, data: state }) });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ success: true, data: { strategyMirror: false, phaseSignposts: [] } }),
      });
    });

    render(<ProgrammeShell />);
    await screen.findByTestId('conversation');
    expect(mounts.conversation).toBe(1);

    // The transition landed, so the next read comes back on the following phase.
    state = runState({
      currentPhaseKey: 'phase-3-ideal',
      phases: PHASES.map((phase) =>
        phase.key === 'phase-2-energy'
          ? { ...phase, status: 'completed' as const }
          : phase.key === 'phase-3-ideal'
            ? { ...phase, status: 'active' as const }
            : phase
      ),
    });
    await userEvent.click(screen.getByRole('button', { name: 'advance' }));

    await waitFor(() => expect(mounts.conversation).toBe(2));
  });

  it('re-reads the run when a phase advances, on either surface', async () => {
    respond(runState());
    render(<ProgrammeShell />);

    await userEvent.click(await screen.findByRole('button', { name: 'advance' }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([u]) => String(u).includes('/runs/current')).length
      ).toBeGreaterThan(1)
    );

    await userEvent.click(screen.getByRole('button', { name: /fill this in myself/ }));
    const before = fetchMock.mock.calls.filter(([u]) => String(u).includes('/runs/current')).length;
    await userEvent.click(await screen.findByRole('button', { name: 'advance from the form' }));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(([u]) => String(u).includes('/runs/current')).length
      ).toBeGreaterThan(before)
    );
  });

  it('renders the phase even when the operator config cannot be read', async () => {
    // The signpost falls back to the shipped defaults: a leader should never meet a phase with no
    // orientation because a config read did not come back.
    respond(runState(), { configOk: false });
    render(<ProgrammeShell />);

    expect(await screen.findByTestId('conversation')).toBeInTheDocument();
  });

  it('resumes at the phase the run is actually on, not at the start', async () => {
    respond(runState({ currentPhaseKey: 'phase-4-gap' }));
    render(<ProgrammeShell />);

    expect(await screen.findByText('Section 4 · Gap analysis')).toBeInTheDocument();
  });

  it('opens the setup phase as a conversation too, once the leader prefers fields', async () => {
    respond(runState({ currentPhaseKey: 'phase-0-setup' }));
    window.localStorage.setItem('reclaim.phase-mode.v1', JSON.stringify('form'));
    render(<ProgrammeShell />);

    expect(await screen.findByTestId('setup-panel')).toBeInTheDocument();
  });

  it('keeps the summary phase a panel, because consent is not something a coach may record', async () => {
    // Phase 6 has no conversational form even when the leader's remembered choice is conversation.
    respond(runState({ currentPhaseKey: 'phase-6-summary' }));
    render(<ProgrammeShell />);

    expect(await screen.findByTestId('summary-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('conversation')).not.toBeInTheDocument();
    // And no offer to talk it through, since there is nothing to talk through here.
    expect(screen.queryByRole('button', { name: /talk this through/ })).not.toBeInTheDocument();
  });

  it.each(['phase-1-current', 'phase-3-ideal', 'phase-4-gap', 'phase-5-action'])(
    'routes %s to its own form panel, so no phase falls through to the fallback',
    async (phaseKey) => {
      respond(runState({ currentPhaseKey: phaseKey }));
      window.localStorage.setItem('reclaim.phase-mode.v1', JSON.stringify('form'));
      render(<ProgrammeShell />);

      expect(await screen.findByTestId(`panel-${phaseKey}`)).toBeInTheDocument();
      expect(screen.queryByText(/not available just now/i)).not.toBeInTheDocument();
    }
  );

  it('says the map has moved rather than opening a conversation with no phase behind it', async () => {
    // An unknown phase key means the journey map changed under a live run. A chat window would be a
    // worse answer than a sentence.
    respond(
      runState({
        currentPhaseKey: 'phase-9-unknown',
        phases: [
          ...PHASES,
          { key: 'phase-9-unknown', label: 'Unknown', status: 'active' as const },
        ],
      })
    );
    window.localStorage.setItem('reclaim.phase-mode.v1', JSON.stringify('form'));
    render(<ProgrammeShell />);

    expect(await screen.findByText(/not available just now/i)).toBeInTheDocument();
    expect(screen.queryByTestId('conversation')).not.toBeInTheDocument();
  });
});
