/**
 * The panel beside the conversation.
 *
 * Its reason for existing is the inference. The coach records readings it took from what a leader
 * implied, and an inference nobody sees is a figure in the audit that the leader never said and cannot
 * correct. So the tests that matter are: an inferred or low-confidence reading is offered back, a
 * directly-stated one is not fussed over, confirming records a confirmation rather than a fresh
 * statement, and a correction carries the typed value a number slot needs (I6).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { saveAnswer } = vi.hoisted(() => ({ saveAnswer: vi.fn() }));
vi.mock('@/components/app/reclaim/phase/actions', () => ({ saveAnswer }));

import { CapturedPanel } from '@/components/app/reclaim/coach/captured-panel';
import type { RunAnswers } from '@/components/app/reclaim/phase/actions';

const HOURS = 'reclaim_current_hours__deep_work';

const answers = (overrides: RunAnswers = {}): RunAnswers => ({ ...overrides });

const onSaved = vi.fn();
const onDiscuss = vi.fn();

beforeEach(() => {
  saveAnswer.mockReset();
  saveAnswer.mockResolvedValue(undefined);
  onSaved.mockReset();
  onDiscuss.mockReset();
});

describe('CapturedPanel', () => {
  it('shows how much of the phase is captured, so a conversation is not open-ended', () => {
    render(
      <CapturedPanel
        runId="run-1"
        phaseKey="phase-2-energy"
        answers={answers({
          reclaim_energy_protected: {
            value: 'It gets eaten by meetings',
            valueJson: null,
            sourceType: 'direct',
            confidence: 10,
          },
        })}
        onSaved={onSaved}
      />
    );

    // Two, not three: the week grid was never built, so `reclaim_energy_peak_windows` is not a
    // reading this phase can capture and does not sit here waiting to be filled.
    expect(screen.getByText(/1 of 2 in this section/)).toBeInTheDocument();
  });

  it('leaves a reading the leader stated plainly alone', () => {
    render(
      <CapturedPanel
        runId="run-1"
        phaseKey="phase-1-current"
        answers={answers({
          [HOURS]: { value: '8', valueJson: 8, sourceType: 'direct', confidence: 10 },
        })}
        onSaved={onSaved}
      />
    );

    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.queryByText(/Have we got it right/)).not.toBeInTheDocument();
  });

  it('offers back a reading it inferred rather than was told', () => {
    render(
      <CapturedPanel
        runId="run-1"
        phaseKey="phase-1-current"
        answers={answers({
          [HOURS]: { value: '20', valueJson: 20, sourceType: 'inferred', confidence: 4 },
        })}
        onSaved={onSaved}
      />
    );

    expect(screen.getByText(/Have we got it right/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'That is right' })).toBeInTheDocument();
  });

  it('offers back a directly-heard reading the coach was unsure of', () => {
    render(
      <CapturedPanel
        runId="run-1"
        phaseKey="phase-1-current"
        answers={answers({
          [HOURS]: { value: '20', valueJson: 20, sourceType: 'direct', confidence: 5 },
        })}
        onSaved={onSaved}
      />
    );

    expect(screen.getByText(/Have we got it right/)).toBeInTheDocument();
  });

  /**
   * The word is the point of the whole panel.
   *
   * A leader looking at "20" has no way to tell whether they said it or the coach worked it out, and
   * those call for different things from them. Inferred means it was never told this and read it
   * between the lines — the case where a figure can end up in someone's audit that they never gave.
   * Unsure means it *was* told and did not trust its own hearing, which is a milder admission.
   */
  it('says a reading was inferred, rather than only asking whether it is right', () => {
    render(
      <CapturedPanel
        runId="run-1"
        phaseKey="phase-1-current"
        answers={answers({
          [HOURS]: { value: '20', valueJson: 20, sourceType: 'inferred', confidence: 4 },
        })}
        onSaved={onSaved}
      />
    );

    expect(screen.getByText('Inferred')).toBeInTheDocument();
    expect(screen.getByText(/Taken from what you said around it/)).toBeInTheDocument();
  });

  it('distinguishes a reading it was told but doubted from one it never heard at all', () => {
    render(
      <CapturedPanel
        runId="run-1"
        phaseKey="phase-1-current"
        answers={answers({
          [HOURS]: { value: '20', valueJson: 20, sourceType: 'direct', confidence: 5 },
        })}
        onSaved={onSaved}
      />
    );

    expect(screen.getByText('Unsure')).toBeInTheDocument();
    expect(screen.queryByText('Inferred')).not.toBeInTheDocument();
    expect(screen.getByText(/We heard this, but were not sure of it/)).toBeInTheDocument();
  });

  /**
   * A reading that was never for this leader, told apart from one nobody has reached.
   *
   * Both were a dimmed label over a dash, and both counted towards the total — so a leader who said
   * fundraising is not part of their role watched a count that could never reach its own denominator
   * sit beside blank rows, and read it, correctly by everything on their screen, as questions the
   * coach had skipped. The coach's own list and the move-onward button had always known better; this
   * is the surface the leader actually looks at agreeing with them.
   */
  it('says a reading was never for this leader, rather than leaving it looking unasked', () => {
    render(
      <CapturedPanel
        runId="run-1"
        phaseKey="phase-0-setup"
        answers={answers({
          reclaim_setup_fundraising_relevant: {
            value: 'No',
            valueJson: false,
            sourceType: 'direct',
            confidence: 10,
          },
        })}
        onSaved={onSaved}
      />
    );

    // "Development team, or you" is asked only of a leader who fundraises. They do not.
    expect(screen.getByText('Not needed, from what you have told us')).toBeInTheDocument();
  });

  it('counts only what this leader will actually be asked', () => {
    const { rerender } = render(
      <CapturedPanel
        runId="run-1"
        phaseKey="phase-0-setup"
        answers={answers({
          reclaim_setup_fundraising_relevant: {
            value: 'No',
            valueJson: false,
            sourceType: 'direct',
            confidence: 10,
          },
        })}
        onSaved={onSaved}
      />
    );

    const withoutFundraising = screen.getByText(/1 of \d+ in this section/).textContent ?? '';
    const settled = Number(/1 of (\d+)/.exec(withoutFundraising)?.[1]);

    // Answer it the other way and the reading comes back, so the total is a fact about this leader
    // rather than a constant: nothing is being hidden, it is being decided.
    rerender(
      <CapturedPanel
        runId="run-1"
        phaseKey="phase-0-setup"
        answers={answers({
          reclaim_setup_fundraising_relevant: {
            value: 'Yes',
            valueJson: true,
            sourceType: 'direct',
            confidence: 10,
          },
        })}
        onSaved={onSaved}
      />
    );

    expect(screen.getByText(new RegExp(`1 of ${settled + 1} in this section`))).toBeInTheDocument();
    expect(screen.queryByText('Not needed, from what you have told us')).not.toBeInTheDocument();
  });

  /**
   * The third move, and the only one that is not a write.
   *
   * Confirming and correcting both end the question. A leader who cannot tell whether the coach's
   * guess is right needs neither — they need to be asked about it properly, which is the one thing
   * this surface can do that the form it replaced could not.
   */
  it('hands a guessed reading back to the conversation rather than only offering a text box', async () => {
    render(
      <CapturedPanel
        runId="run-1"
        phaseKey="phase-1-current"
        answers={answers({
          [HOURS]: { value: '20', valueJson: 20, sourceType: 'inferred', confidence: 4 },
        })}
        onSaved={onSaved}
        onDiscuss={onDiscuss}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /Talk through .* with the coach/ }));

    expect(onDiscuss).toHaveBeenCalledWith(expect.objectContaining({ slug: HOURS }));
    // Handing it back is not a write: nothing has been settled yet, and recording a confirmation
    // here would settle it on the leader's behalf.
    expect(saveAnswer).not.toHaveBeenCalled();
  });

  it('offers nothing to talk through where there is no conversation to talk in', () => {
    render(
      <CapturedPanel
        runId="run-1"
        phaseKey="phase-1-current"
        answers={answers({
          [HOURS]: { value: '20', valueJson: 20, sourceType: 'inferred', confidence: 4 },
        })}
        onSaved={onSaved}
      />
    );

    expect(screen.queryByRole('button', { name: /Talk through/ })).not.toBeInTheDocument();
  });

  /**
   * A finished audit keeps the admission and loses the offer. Which readings were guessed is a fact
   * about what was recorded; the buttons are writes the server would refuse.
   */
  it('still says what was guessed on a finished audit, without offering to change it', () => {
    render(
      <CapturedPanel
        runId="run-1"
        phaseKey="phase-1-current"
        answers={answers({
          [HOURS]: { value: '20', valueJson: 20, sourceType: 'inferred', confidence: 4 },
        })}
        onSaved={onSaved}
        onDiscuss={onDiscuss}
        readOnly
      />
    );

    expect(screen.getByText('Inferred')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'That is right' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Talk through/ })).not.toBeInTheDocument();
  });

  it('records a confirmation as a confirmation, not as a fresh statement', async () => {
    render(
      <CapturedPanel
        runId="run-1"
        phaseKey="phase-1-current"
        answers={answers({
          [HOURS]: { value: '20', valueJson: 20, sourceType: 'inferred', confidence: 4 },
        })}
        onSaved={onSaved}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'That is right' }));

    await waitFor(() =>
      expect(saveAnswer).toHaveBeenCalledWith('run-1', {
        slotSlug: HOURS,
        value: '20',
        confirming: true,
      })
    );
    expect(onSaved).toHaveBeenCalled();
  });

  it("writes the leader's own figure, typed, when they correct one", async () => {
    render(
      <CapturedPanel
        runId="run-1"
        phaseKey="phase-1-current"
        answers={answers({
          [HOURS]: { value: '20', valueJson: 20, sourceType: 'inferred', confidence: 4 },
        })}
        onSaved={onSaved}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Not quite' }));
    const field = screen.getByLabelText('Your correction');
    await userEvent.clear(field);
    await userEvent.type(field, '12');
    await userEvent.click(screen.getByRole('button', { name: 'Save this instead' }));

    await waitFor(() =>
      // A number slot is refused without `valueJson` (I6), and 12 rather than '12' is the point.
      expect(saveAnswer).toHaveBeenCalledWith('run-1', {
        slotSlug: HOURS,
        value: '12',
        valueJson: 12,
      })
    );
  });

  it('says so when a save fails, rather than looking as though it worked', async () => {
    saveAnswer.mockRejectedValue(new Error('nope'));
    render(
      <CapturedPanel
        runId="run-1"
        phaseKey="phase-1-current"
        answers={answers({
          [HOURS]: { value: '20', valueJson: 20, sourceType: 'inferred', confidence: 4 },
        })}
        onSaved={onSaved}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'That is right' }));

    expect(await screen.findByText(/did not save/)).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('renders nothing at all in a phase with neither readings nor a reflection', () => {
    const { container } = render(
      <CapturedPanel runId="run-1" phaseKey="not-a-phase" answers={answers()} onSaved={onSaved} />
    );

    expect(container).toBeEmptyDOMElement();
  });

  /**
   * The reflection is shown, and that is the change (2026-07-27). It used to be absent by
   * construction, because the coach could not write one; now that it can, the leader seeing the
   * sentence is what keeps the authorship theirs.
   */
  it("shows the reflection this run holds, in the leader's own words", () => {
    render(
      <CapturedPanel
        runId="run-1"
        phaseKey="phase-1-current"
        answers={answers({
          reclaim_reflection_p1: {
            value: 'How little recovery there is',
            valueJson: null,
            sourceType: 'user_confirmed',
            confidence: 9,
          },
        })}
        onSaved={onSaved}
      />
    );

    expect(screen.getByText('In your words')).toBeInTheDocument();
    expect(screen.getByText('How little recovery there is')).toBeInTheDocument();
    // Never offered back as a reading to verify: they said it, and second-guessing their own sentence
    // is the form creeping back in.
    expect(screen.queryByRole('button', { name: 'That is right' })).not.toBeInTheDocument();
  });

  /**
   * One route asks the question, one route types it. A leader who would rather write their own
   * reflection takes "I would rather fill this in myself" and gets the phase panel's field; a second
   * textarea here would be the form creeping back in beside the conversation they chose instead.
   */
  it('offers no way to type a reflection, recorded or not', () => {
    const { rerender } = render(
      <CapturedPanel
        runId="run-1"
        phaseKey="phase-1-current"
        answers={answers({
          reclaim_reflection_p1: {
            value: 'How little recovery there is',
            valueJson: null,
            sourceType: 'user_confirmed',
            confidence: 9,
          },
        })}
        onSaved={onSaved}
      />
    );

    expect(screen.getByText('How little recovery there is')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Change this' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Your reflection' })).not.toBeInTheDocument();

    // And before the coach has asked: the panel says what is coming, and offers no box for it.
    rerender(
      <CapturedPanel
        runId="run-1"
        phaseKey="phase-1-current"
        answers={answers()}
        onSaved={onSaved}
      />
    );

    expect(screen.getByText(/The coach will ask before this section closes/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Write it myself' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Your reflection' })).not.toBeInTheDocument();
  });

  it('never lists a sharing choice, whatever the run holds (I6)', () => {
    render(
      <CapturedPanel
        runId="run-1"
        phaseKey="phase-1-current"
        answers={answers({
          reclaim_share_quotable: {
            value: 'Yes, happy to be quoted',
            valueJson: true,
            sourceType: 'direct',
            confidence: 10,
          },
        })}
        onSaved={onSaved}
      />
    );

    expect(screen.queryByText('Yes, happy to be quoted')).not.toBeInTheDocument();
  });
});
