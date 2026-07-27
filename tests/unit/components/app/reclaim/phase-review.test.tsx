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

const props = {
  runId: 'run-1',
  phaseKey: 'phase-1-current',
  phaseIndex: 1,
  phaseLabel: 'Current reality',
  conversationId: 'conv-1',
  phaseMarks: { 'phase-1-current': 'm2' },
  returnIndex: 2,
  returnLabel: 'Energy',
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

    expect(await screen.findByText('How many hours go on deep work?')).toBeInTheDocument();
    expect(screen.getByText('About five.')).toBeInTheDocument();
    expect(screen.getByText('Relationship building is the big one.')).toBeInTheDocument();
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
      screen.queryByRole('button', { name: /Continue to the next phase/ })
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
});
