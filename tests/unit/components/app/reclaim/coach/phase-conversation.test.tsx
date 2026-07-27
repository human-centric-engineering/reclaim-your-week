/**
 * A phase done as a conversation.
 *
 * What these pin is the division of labour the invariants rest on, as it now stands: the coach
 * captures the phase's readings **and** the reflection that closes it, and the leader keeps the move
 * onward. So the continue button waits until this run holds a reflection (I9's UI half) rather than
 * waiting for a field to be typed into, advancing no longer writes the reflection on the way past —
 * it is already recorded, or the server refuses — and a phase with nothing captured yet offers no way
 * out. The form panels stay reachable, because the two paths write the same slots and a leader is
 * allowed to prefer fields.
 *
 * The reflection textarea that used to sit under the conversation is gone, and its absence is
 * asserted: it is the one place the form had crept back into the coaching surface.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { readAnswers, readLabels, saveAnswer, advancePhase } = vi.hoisted(() => ({
  readAnswers: vi.fn(),
  readLabels: vi.fn(),
  saveAnswer: vi.fn(),
  advancePhase: vi.fn(),
}));
vi.mock('@/components/app/reclaim/phase/actions', () => ({
  readAnswers,
  readLabels,
  saveAnswer,
  advancePhase,
}));
// The chat is a streaming surface of its own; here it stands in as a button that finishes a turn,
// plus the slots the phase hands it — the beats and the move onward now live inside the chat column,
// so a stub that dropped them would hide the controls under test.
vi.mock('@/components/app/reclaim/coach-chat', () => ({
  CoachChat: ({
    onTurnComplete,
    intro,
    beats,
    footer,
  }: {
    onTurnComplete?: () => void;
    intro?: React.ReactNode;
    beats?: React.ReactNode;
    footer?: React.ReactNode;
  }) => (
    <div>
      {intro}
      {beats}
      <button type="button" onClick={() => onTurnComplete?.()}>
        finish a turn
      </button>
      {footer}
    </div>
  ),
}));

import { PhaseConversation } from '@/components/app/reclaim/coach/phase-conversation';

const captured = {
  reclaim_energy_peak_description: {
    value: 'Early mornings',
    valueJson: null,
    sourceType: 'direct',
    confidence: 10,
  },
};

const reflected = {
  ...captured,
  reclaim_reflection_p2: {
    value: 'My best hours go to other people',
    valueJson: null,
    sourceType: 'user_confirmed',
    confidence: 9,
  },
};

const props = {
  runId: 'run-1',
  phaseKey: 'phase-2-energy',
  phaseIndex: 2,
  phaseLabel: 'Energy',
  conversationId: 'conv-1',
  coachOpenings: [],
  onAdvanced: vi.fn(),
  onSwitchToForm: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  readAnswers.mockResolvedValue(reflected);
  readLabels.mockResolvedValue({});
  saveAnswer.mockResolvedValue(undefined);
  advancePhase.mockResolvedValue({ ok: true });
});

describe('PhaseConversation', () => {
  it('offers no move onward until this run holds a reflection, and says what it is waiting for', async () => {
    readAnswers.mockResolvedValue(captured);
    render(<PhaseConversation {...props} />);
    await waitFor(() => expect(readAnswers).toHaveBeenCalled());

    expect(
      screen.queryByRole('button', { name: /Continue to the next phase/ })
    ).not.toBeInTheDocument();
    expect(await screen.findByText(/coach will ask what stands out/i)).toBeInTheDocument();
  });

  it('offers the move once the reflection is recorded, and advances without rewriting it', async () => {
    render(<PhaseConversation {...props} />);
    await waitFor(() => expect(readAnswers).toHaveBeenCalled());

    await userEvent.click(
      await screen.findByRole('button', { name: /Continue to the next phase/ })
    );

    await waitFor(() => expect(advancePhase).toHaveBeenCalledWith('run-1', 'phase-2-energy'));
    expect(saveAnswer).not.toHaveBeenCalled();
    expect(props.onAdvanced).toHaveBeenCalled();
  });

  it('no longer asks for the reflection as a field under the conversation', async () => {
    render(<PhaseConversation {...props} />);
    await waitFor(() => expect(readAnswers).toHaveBeenCalled());

    expect(screen.queryByRole('textbox', { name: /What stands out/ })).not.toBeInTheDocument();
  });

  it('offers no way past a phase where nothing has been captured yet', async () => {
    readAnswers.mockResolvedValue({});
    render(<PhaseConversation {...props} />);
    await waitFor(() => expect(readAnswers).toHaveBeenCalled());

    expect(
      screen.queryByRole('button', { name: /Continue to the next phase/ })
    ).not.toBeInTheDocument();
  });

  it("surfaces the server's refusal rather than moving on regardless (I9)", async () => {
    advancePhase.mockResolvedValue({ ok: false, reflectionRequired: true });
    render(<PhaseConversation {...props} />);
    await waitFor(() => expect(readAnswers).toHaveBeenCalled());

    await userEvent.click(
      await screen.findByRole('button', { name: /Continue to the next phase/ })
    );

    expect(await screen.findByText(/A reflection is needed before moving on/)).toBeInTheDocument();
    expect(props.onAdvanced).not.toHaveBeenCalled();
  });

  it('re-reads the run after a turn, because the coach records silently mid-turn', async () => {
    render(<PhaseConversation {...props} />);
    await waitFor(() => expect(readAnswers).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByRole('button', { name: 'finish a turn' }));

    await waitFor(() => expect(readAnswers).toHaveBeenCalledTimes(2));
  });

  it('lets a leader who would rather fill in fields say so', async () => {
    render(<PhaseConversation {...props} />);
    await waitFor(() => expect(readAnswers).toHaveBeenCalled());

    await userEvent.click(screen.getAllByRole('button', { name: /fill this in myself/ })[0]);

    expect(props.onSwitchToForm).toHaveBeenCalled();
  });

  it('needs no reflection in the setup phase, which has no pause to enforce', async () => {
    readAnswers.mockResolvedValue({
      reclaim_setup_weekly_hours: {
        value: '55',
        valueJson: 55,
        sourceType: 'direct',
        confidence: 10,
      },
    });
    render(
      <PhaseConversation {...props} phaseKey="phase-0-setup" phaseIndex={0} phaseLabel="Setup" />
    );

    expect(
      await screen.findByRole('button', { name: /Continue to the next phase/ })
    ).toBeInTheDocument();
  });
});
