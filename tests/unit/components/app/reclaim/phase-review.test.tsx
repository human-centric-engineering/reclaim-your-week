/**
 * A finished phase, opened again from the spine.
 *
 * The first cut of this screen showed the captured readings — "deep work, hours a week: 5" — which is
 * the audit's *record* of the phase, not the phase. What a leader comes back to Current reality for
 * is the conversation they had and the picture of their week it produced. These pin that, and pin the
 * two things this screen must never do: move the run, or reopen the coach on a phase the server is no
 * longer scoped to.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';

const { readAnswers, readLabels, saveAnswer } = vi.hoisted(() => ({
  readAnswers: vi.fn(),
  readLabels: vi.fn(),
  saveAnswer: vi.fn(),
}));
vi.mock('@/components/app/reclaim/phase/actions', () => ({ readAnswers, readLabels, saveAnswer }));

const { loadTranscript } = vi.hoisted(() => ({ loadTranscript: vi.fn() }));
vi.mock('@/components/app/reclaim/coach/transcript', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/app/reclaim/coach/transcript')>()),
  loadTranscript,
}));

import { PhaseReview } from '@/components/app/reclaim/phase-review';

const AREAS = [
  'deep_work',
  'learning_development',
  'strategic_planning',
  'team_development',
  'organisational_oversight',
  'relationship_building',
  'delivery_operations',
  'recovery_white_space',
];

/** Every visible area with a figure — what makes the week whole enough to have been drawn (I12). */
function everyAreaAnswered() {
  return Object.fromEntries(
    AREAS.map((a) => [
      `reclaim_current_hours__${a}`,
      { value: '5', valueJson: 5, sourceType: 'direct', confidence: 10 },
    ])
  );
}

/** A run's whole conversation: phase 0, then phase 1 after the mark `m2`. */
const conversation = [
  { id: 'm1', role: 'coach' as const, text: 'What is your role?', synthetic: false },
  { id: 'm2', role: 'leader' as const, text: 'I run a small charity.', synthetic: false },
  { id: 'm3', role: 'coach' as const, text: 'How many hours go on deep work?', synthetic: false },
  { id: 'm4', role: 'leader' as const, text: 'About five.', synthetic: false },
  { id: 'm5', role: 'leader' as const, text: '(stage direction)', synthetic: true },
  {
    id: 'm6',
    role: 'coach' as const,
    text: 'Relationship building is the big one.',
    synthetic: false,
  },
];

/**
 * The paragraph reading exactly `text`, matched through the emphasis inside it.
 *
 * A coach question now has the area it is about drawn in bold (`coach/transcript.tsx`), so the
 * paragraph's *direct* text nodes — which is what `getByText` compares by default — are the sentence
 * with the area name cut out of the middle. Matching on `textContent` asserts the same thing the
 * plain string used to, and asserts it about the whole sentence rather than a fragment of it.
 */
const paragraphReading = (text: string) =>
  screen.findByText((_content, el) => el?.tagName === 'P' && el.textContent === text);

/** Renders with a ready `userEvent` instance, for the tests below that click through the drawer. */
function renderWithUser(ui: ReactElement) {
  return { user: userEvent.setup(), ...render(ui) };
}

const props = {
  runId: 'run-1',
  phaseKey: 'phase-1-current',
  phaseIndex: 1,
  phaseLabel: 'Current reality',
  conversationId: 'conv-1',
  phaseMarks: { 'phase-1-current': 'm2' },
  // The whole destination phrase, not an index and a label: a finished audit read from the history
  // returns to its summary rather than to a phase, and only one of those can be built from a number.
  returnLabel: 'phase 2, Energy',
  onReturn: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  readAnswers.mockResolvedValue(everyAreaAnswered());
  readLabels.mockResolvedValue({});
  loadTranscript.mockResolvedValue(conversation);
});

describe('PhaseReview', () => {
  it('shows the conversation that happened in this phase, and not the phases around it', async () => {
    render(<PhaseReview {...props} />);

    expect(await paragraphReading('How many hours go on deep work?')).toBeInTheDocument();
    expect(screen.getByText('About five.')).toBeInTheDocument();
    expect(await paragraphReading('Relationship building is the big one.')).toBeInTheDocument();
    // Phase 0's exchange belongs to phase 0.
    expect(screen.queryByText('What is your role?')).not.toBeInTheDocument();
    expect(screen.queryByText('I run a small charity.')).not.toBeInTheDocument();
  });

  it('draws the picture of the week the phase produced', async () => {
    render(<PhaseReview {...props} />);

    // The chart renders from the leader's own figures — the total is the assertion that it is real
    // rather than a placeholder.
    expect(await screen.findByText(/40/)).toBeInTheDocument();
  });

  it('never shows the leader the trigger we sent in their place', async () => {
    render(<PhaseReview {...props} />);

    await screen.findByText('About five.');
    expect(screen.queryByText('(stage direction)')).not.toBeInTheDocument();
  });

  /**
   * The two hazards this screen was built around. The transition route does not check that the phase
   * being left is the one the run is on, so a "continue" here could walk the audit backwards; and the
   * coach's phase comes from the server, so a composer here would talk under the wrong scope.
   */
  it('offers no way to move the audit, and no way to talk to the coach', async () => {
    render(<PhaseReview {...props} />);
    await screen.findByText('About five.');

    expect(
      screen.queryByRole('button', { name: /Continue to the next section/ })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Your message' })).not.toBeInTheDocument();
  });

  it('says so plainly when a phase was filled in rather than talked through', async () => {
    loadTranscript.mockResolvedValue([]);
    render(<PhaseReview {...props} />);

    expect(await screen.findByText(/no conversation recorded for this part/i)).toBeInTheDocument();
  });

  it('still reads when the leader has never spoken to the coach at all', async () => {
    render(<PhaseReview {...props} conversationId={null} />);

    await waitFor(() => expect(readAnswers).toHaveBeenCalled());
    expect(loadTranscript).not.toHaveBeenCalled();
    expect(await screen.findByText(/no conversation recorded for this part/i)).toBeInTheDocument();
  });

  /**
   * The panel was stacked under the transcript first, which put nineteen rows of figures between the
   * leader and the foot of a conversation they had come back to read — and moved the same panel to a
   * different place depending on which phase was open. It belongs in the column the live phase puts
   * it in.
   */
  it('keeps what the coach noted in its own column, not under the conversation', async () => {
    const { container } = render(<PhaseReview {...props} />);
    await screen.findByText('About five.');

    const panel = screen.getByRole('complementary', { name: 'What the coach has recorded' });
    expect(panel).toBeInTheDocument();
    // Inside the right-hand column, not in the scrolling transcript beside it.
    expect(panel.closest('aside.w-80')).not.toBeNull();
    expect(container.querySelector('aside.w-80')?.contains(panel)).toBe(true);
  });

  it('leads with the way back, because that is what the screen is certain to be wanted for', async () => {
    render(<PhaseReview {...props} />);

    const back = await screen.findAllByRole('button', { name: /Back to phase 2, Energy/ });
    expect(back.length).toBeGreaterThan(0);
  });

  it('names the destination it was given, so a finished audit can return to its summary', async () => {
    render(<PhaseReview {...props} returnLabel="the summary" />);

    const back = await screen.findAllByRole('button', { name: /Back to the summary/ });
    expect(back.length).toBeGreaterThan(0);
  });

  /**
   * Read-only is the mode a finished audit is read in. The server already refuses the write
   * (`assertActiveOwnedRun`), so what this pins is that the screen stops *offering* it: a correction
   * button that can only fail is worse than no button, and it would tell a leader their finished
   * figures are still in play.
   */
  describe('a finished audit, read back', () => {
    /** One reading the coach inferred, which is what earns the confirm and correct offer. */
    function anInferredReading() {
      return {
        ...everyAreaAnswered(),
        reclaim_current_hours__deep_work: {
          value: '5',
          valueJson: 5,
          sourceType: 'inferred',
          confidence: 3,
        },
      };
    }

    it('offers no correction, because the server would refuse the write', async () => {
      readAnswers.mockResolvedValue(anInferredReading());
      render(<PhaseReview {...props} readOnly />);

      await screen.findByText('About five.');
      expect(screen.queryByRole('button', { name: /that is right/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /Not quite/ })).toBeNull();
    });

    it('still offers the correction while the audit is live', async () => {
      readAnswers.mockResolvedValue(anInferredReading());
      render(<PhaseReview {...props} />);

      await waitFor(() =>
        expect(screen.getAllByRole('button', { name: /that is right/i }).length).toBeGreaterThan(0)
      );
    });

    it('says the audit is finished rather than that the phase is behind them', async () => {
      render(<PhaseReview {...props} readOnly />);

      // Specific enough to tell this line from the captured panel's own finished-audit note, which
      // opens with the same words.
      expect(await screen.findByText(/nothing here changes it/)).toBeInTheDocument();
      expect(screen.queryByText(/nothing here moves your audit/)).toBeNull();
    });

    /**
     * `readOnly` reaches `CapturedPanel`, which is where the correction buttons actually live and
     * where the server-refusal risk actually sits — the assertions above already cover that they
     * never render. This confirms the prop is threaded through rather than merely accepted and
     * dropped, by checking the line the panel itself only shows in the finished-audit case.
     */
    it('tells CapturedPanel the audit is finished, not just the transcript banner', async () => {
      render(<PhaseReview {...props} readOnly />);

      await screen.findByText('About five.');
      expect(
        await screen.findByText(/This audit is finished, so these are as you left them/)
      ).toBeInTheDocument();
    });
  });

  /**
   * The panel has no column of its own below `xl`, so it is one tap away instead (the "What the
   * coach noted" link). Below pins that it actually opens, and that either of its two ways to close
   * it — the backdrop and the "Close" link — actually close it, rather than the drawer being stuck
   * open or the buttons being decorative.
   */
  describe('the panel drawer below `xl`', () => {
    it('opens a second copy of what the coach noted when tapped', async () => {
      const { user } = renderWithUser(<PhaseReview {...props} />);
      await screen.findByText('About five.');

      // Closed: only the always-present sidebar copy exists.
      expect(
        screen.getAllByRole('complementary', { name: 'What the coach has recorded' })
      ).toHaveLength(1);

      await user.click(screen.getByRole('button', { name: 'What the coach noted' }));

      expect(
        screen.getAllByRole('complementary', { name: 'What the coach has recorded' })
      ).toHaveLength(2);
    });

    it('closes again from the backdrop, back down to the one sidebar copy', async () => {
      const { user } = renderWithUser(<PhaseReview {...props} />);
      await screen.findByText('About five.');
      await user.click(screen.getByRole('button', { name: 'What the coach noted' }));
      expect(
        screen.getAllByRole('complementary', { name: 'What the coach has recorded' })
      ).toHaveLength(2);

      await user.click(screen.getByRole('button', { name: 'Close what the coach has noted' }));

      expect(
        screen.getAllByRole('complementary', { name: 'What the coach has recorded' })
      ).toHaveLength(1);
    });

    it('closes again from the drawer’s own "Close" link', async () => {
      const { user } = renderWithUser(<PhaseReview {...props} />);
      await screen.findByText('About five.');
      await user.click(screen.getByRole('button', { name: 'What the coach noted' }));

      // Two "Close…" affordances exist once open (backdrop + link); the link is named exactly "Close".
      await user.click(screen.getByRole('button', { name: 'Close' }));

      expect(
        screen.getAllByRole('complementary', { name: 'What the coach has recorded' })
      ).toHaveLength(1);
    });
  });

  it('re-reads the run after a correction is saved, so the figure it shows is the one just confirmed', async () => {
    readAnswers.mockResolvedValueOnce({
      ...everyAreaAnswered(),
      reclaim_current_hours__deep_work: {
        value: '5',
        valueJson: 5,
        sourceType: 'inferred',
        confidence: 3,
      },
    });
    readAnswers.mockResolvedValue(everyAreaAnswered());
    saveAnswer.mockResolvedValue(undefined);

    const { user } = renderWithUser(<PhaseReview {...props} />);

    const confirm = await screen.findByRole('button', { name: /that is right/i });
    await user.click(confirm);

    // The save landed, and the panel re-read the run rather than only trusting local state.
    await waitFor(() => expect(saveAnswer).toHaveBeenCalled()); // test-review:accept no_arg_called — callback-fired guard;
    await waitFor(() => expect(readAnswers).toHaveBeenCalledTimes(2));
  });

  it('still shows the transcript and picture when the answers for this phase fail to load', async () => {
    readAnswers.mockRejectedValue(new Error('network down'));

    render(<PhaseReview {...props} />);

    // The conversation does not depend on the answers call, so it still reads.
    expect(await screen.findByText('About five.')).toBeInTheDocument();
    // No figures came back, so there is nothing to check and no crash from the rejection.
    expect(screen.queryByRole('button', { name: /that is right/i })).toBeNull();
  });
});
