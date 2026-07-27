/**
 * A phase done as a conversation.
 *
 * What these pin is the division of labour the invariants rest on: the coach captures, and the leader
 * keeps the reflection and the move onward. So the continue button waits for a reflection the leader
 * has written (I9's UI half), the reflection is saved through the ordinary leader path rather than by
 * the coach, and a phase with nothing captured yet offers no way past it. The form panels stay
 * reachable, because the two paths write the same slots and a leader is allowed to prefer fields.
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
// The chat is a streaming surface of its own; here it stands in as a button that finishes a turn.
vi.mock('@/components/app/reclaim/coach-chat', () => ({
  CoachChat: ({ onTurnComplete }: { onTurnComplete?: () => void }) => (
    <button type="button" onClick={() => onTurnComplete?.()}>
      finish a turn
    </button>
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

const props = {
  runId: 'run-1',
  phaseKey: 'phase-2-energy',
  conversationId: 'conv-1',
  coachOpenings: [],
  onAdvanced: vi.fn(),
  onSwitchToForm: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  readAnswers.mockResolvedValue(captured);
  readLabels.mockResolvedValue({});
  saveAnswer.mockResolvedValue(undefined);
  advancePhase.mockResolvedValue({ ok: true });
});

describe('PhaseConversation', () => {
  it('will not move on until the leader has written their own reflection', async () => {
    render(<PhaseConversation {...props} />);
    await waitFor(() => expect(readAnswers).toHaveBeenCalled());

    const button = screen.getByRole('button', { name: /Continue to the next phase/ });
    expect(button).toBeDisabled();

    await userEvent.type(screen.getByRole('textbox', { name: /What stands out/ }), 'A lot');
    expect(button).toBeEnabled();
  });

  it('saves the reflection through the leader path, then asks the server to advance', async () => {
    render(<PhaseConversation {...props} />);
    await waitFor(() => expect(readAnswers).toHaveBeenCalled());

    await userEvent.type(screen.getByRole('textbox', { name: /What stands out/ }), 'A lot');
    await userEvent.click(screen.getByRole('button', { name: /Continue to the next phase/ }));

    await waitFor(() =>
      expect(saveAnswer).toHaveBeenCalledWith('run-1', {
        slotSlug: 'reclaim_reflection_p2',
        value: 'A lot',
      })
    );
    expect(advancePhase).toHaveBeenCalledWith('run-1', 'phase-2-energy');
    expect(props.onAdvanced).toHaveBeenCalled();
  });

  it('offers no way past a phase where nothing has been captured yet', async () => {
    readAnswers.mockResolvedValue({});
    render(<PhaseConversation {...props} />);
    await waitFor(() => expect(readAnswers).toHaveBeenCalled());

    await userEvent.type(screen.getByRole('textbox', { name: /What stands out/ }), 'A lot');

    expect(screen.getByRole('button', { name: /Continue to the next phase/ })).toBeDisabled();
  });

  it("surfaces the server's refusal rather than moving on regardless (I9)", async () => {
    advancePhase.mockResolvedValue({ ok: false, reflectionRequired: true });
    render(<PhaseConversation {...props} />);
    await waitFor(() => expect(readAnswers).toHaveBeenCalled());

    await userEvent.type(screen.getByRole('textbox', { name: /What stands out/ }), 'A lot');
    await userEvent.click(screen.getByRole('button', { name: /Continue to the next phase/ }));

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

    await userEvent.click(screen.getByRole('button', { name: /fill this in myself/ }));

    expect(props.onSwitchToForm).toHaveBeenCalled();
  });

  it('asks for no reflection in the setup phase, which has no pause to enforce', async () => {
    render(<PhaseConversation {...props} phaseKey="phase-0-setup" />);
    await waitFor(() => expect(readAnswers).toHaveBeenCalled());

    expect(screen.queryByRole('textbox', { name: /What stands out/ })).not.toBeInTheDocument();
  });
});
