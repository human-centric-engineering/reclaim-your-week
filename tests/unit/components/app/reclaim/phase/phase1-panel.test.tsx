/**
 * The Phase 1 form — where a leader writes down the week they actually have.
 *
 * The panel was mocked out of every test that renders its parent, so nothing exercised it at runtime.
 * That is the wrong place to have no coverage: this is the screen that writes the figures every later
 * phase is computed from, and three of its rules are invisible when they break.
 *
 * **The chart is a reveal, not a running total (I12).** It used to redraw as the leader typed, so they
 * met their own week one bar at a time and there was no picture left to show them. Now it waits until
 * every area they were asked about has a figure, and then they choose when to look.
 *
 * **The calendar branch is offered once.** A leader who declined it in the conversation has answered
 * the question, and this form is rebuilt from the run's answers every time it is opened — so a
 * paragraph making the case again is the app asking something the leader already closed. The step
 * stays open, because they may change their mind; it is the pitch that goes, not the door.
 *
 * **The deep-work follow-up asks one question, not both.** Which one depends on the answer above it,
 * and a leader who has no protected block being asked where it sits is the form not listening.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { readAnswers, readLabels, saveBatch, advancePhase, saveLabel, claimOpening } = vi.hoisted(
  () => ({
    readAnswers: vi.fn(),
    readLabels: vi.fn(),
    saveBatch: vi.fn(),
    advancePhase: vi.fn(),
    saveLabel: vi.fn(),
    claimOpening: vi.fn(),
  })
);
vi.mock('@/components/app/reclaim/phase/actions', () => ({
  readAnswers,
  readLabels,
  saveBatch,
  advancePhase,
  saveLabel,
  claimOpening,
}));

import { Phase1Panel } from '@/components/app/reclaim/phase/phase1-panel';

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

const PITCH =
  'If you would like, you can reality-check this against your actual calendar. It is optional, your calendar file is never stored, and the audit works just as well without it.';
const DOOR_ONLY = 'The calendar step is still here whenever you would like it.';

/**
 * A run whose visible areas all carry a figure — the state that opens the calendar door at all
 * (`everyVisibleAreaHasHours`). Fundraising is left out, so it stays the conditional area Phase 0 did
 * not make relevant and the eight non-conditional areas are the whole of "visible".
 */
const weekAccountedFor = (extra: Record<string, { value: string; valueJson?: unknown }> = {}) => ({
  ...Object.fromEntries(
    AREAS.map((area) => [`reclaim_current_hours__${area}`, { value: '5', valueJson: 5 }])
  ),
  ...extra,
});

/**
 * Render, wait for the run to load, and walk past the overview onto the cards.
 *
 * The panel opens on the nine areas and the calendar door lives below the cards, so a test that only
 * rendered would assert the absence of a paragraph that is one click away — passing for the wrong
 * reason on every branch, including the ones that are meant to show it.
 */
async function renderCards(coachOpenings: string[] = []) {
  const user = userEvent.setup();
  const onAdvanced = vi.fn();
  render(<Phase1Panel runId="run-1" coachOpenings={coachOpenings} onAdvanced={onAdvanced} />);
  await waitFor(() => expect(readAnswers).toHaveBeenCalled());
  await user.click(await screen.findByRole('button', { name: 'Go through them' }));
  // Proof we are past the overview, so the absence assertions below are about the door and not the stage.
  await screen.findByRole('button', { name: 'Continue to the next section' });
  return { user, onAdvanced };
}

const continueButton = () => screen.getByRole('button', { name: 'Continue to the next section' });

/**
 * The two fields every card repeats, addressed by the id the panel gives them.
 *
 * "Hours per week" is asked once per area and the reflection's prompt is echoed inside its own help
 * popover, so a plain label lookup is ambiguous in both cases — and ambiguity here would be resolved
 * silently by whichever element came first, which is not a thing a test should leave to layout.
 */
const hoursFor = (token: string) =>
  screen.getByLabelText('Hours per week', { selector: `input#hours-${token}` });
const reflectionBox = () => screen.getByLabelText(/what stands out/i, { selector: 'textarea' });

beforeEach(() => {
  vi.clearAllMocks();
  readLabels.mockResolvedValue({});
});

describe('Phase1Panel — the calendar door', () => {
  it('makes the case for the calendar to a leader who has not answered it', async () => {
    readAnswers.mockResolvedValue(weekAccountedFor());

    await renderCards();

    expect(await screen.findByText(PITCH)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Look at my calendar' })).toHaveAttribute(
      'href',
      '/programme/calendar'
    );
  });

  it('offers the door without the pitch once the leader has declined it', async () => {
    // The whole point: the conversation asked, the leader said no, and the form does not ask again.
    readAnswers.mockResolvedValue(
      weekAccountedFor({ reclaim_calendar_declined: { value: 'Yes', valueJson: true } })
    );

    await renderCards();

    expect(await screen.findByText(DOOR_ONLY)).toBeInTheDocument();
    expect(screen.queryByText(PITCH)).not.toBeInTheDocument();
    // The step stays open — a leader may change their mind, and this panel is where the door lives.
    expect(screen.getByRole('link', { name: 'Look at my calendar' })).toHaveAttribute(
      'href',
      '/programme/calendar'
    );
  });

  it('still makes the case when the decline is recorded as a no', async () => {
    // `truthy` reads the typed form first, so a stored `false` is a leader who was asked and did not
    // decline — the offer is still owed to them.
    readAnswers.mockResolvedValue(
      weekAccountedFor({ reclaim_calendar_declined: { value: 'No', valueJson: false } })
    );

    await renderCards();

    expect(await screen.findByText(PITCH)).toBeInTheDocument();
    expect(screen.queryByText(DOOR_ONLY)).not.toBeInTheDocument();
  });

  it('shows neither once a calendar has been uploaded', async () => {
    // The branch is behind them either way; a door back to it would offer work already done.
    readAnswers.mockResolvedValue(
      weekAccountedFor({
        reclaim_calendar_uploaded: { value: 'Yes', valueJson: true },
        reclaim_calendar_declined: { value: 'Yes', valueJson: true },
      })
    );

    await renderCards();

    expect(screen.queryByText(PITCH)).not.toBeInTheDocument();
    expect(screen.queryByText(DOOR_ONLY)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Look at my calendar' })).not.toBeInTheDocument();
  });

  it('offers nothing while an area is still blank', async () => {
    // The reality-check is against a week that has been described. Offered halfway through, it invites
    // a leader to reconcile a picture they have not finished drawing.
    const partial = weekAccountedFor();
    delete partial['reclaim_current_hours__delivery_operations'];
    readAnswers.mockResolvedValue(partial);

    await renderCards();

    expect(screen.queryByText(PITCH)).not.toBeInTheDocument();
    expect(screen.queryByText(DOOR_ONLY)).not.toBeInTheDocument();
  });
});

describe('Phase1Panel — the overview a leader arrives on', () => {
  it('names every area before asking for a single figure', async () => {
    // The whole picture first, then the areas one at a time. A leader who meets the cards cold is
    // being asked to divide up a week they have not been shown the shape of.
    readAnswers.mockResolvedValue({});
    readLabels.mockResolvedValue({});

    render(<Phase1Panel runId="run-1" coachOpenings={[]} onAdvanced={vi.fn()} />);

    expect(await screen.findByText('Where your time goes now')).toBeInTheDocument();
    expect(screen.getByText('Deep work')).toBeInTheDocument();
    expect(screen.queryByLabelText('Hours per week')).not.toBeInTheDocument();
  });

  it('leaves fundraising out until Phase 0 says it is relevant', async () => {
    // The conditional area. Shown to a leader who does not fundraise, it is a question about work they
    // do not do, sitting in the middle of a form about the work they do.
    readAnswers.mockResolvedValue({});

    render(<Phase1Panel runId="run-1" coachOpenings={[]} onAdvanced={vi.fn()} />);

    await screen.findByText('Where your time goes now');
    expect(screen.queryByText(/fundraising/i)).not.toBeInTheDocument();
  });

  it('brings it in once they have said it is', async () => {
    readAnswers.mockResolvedValue({
      reclaim_setup_fundraising_relevant: { value: 'Yes', valueJson: true },
    });

    render(<Phase1Panel runId="run-1" coachOpenings={[]} onAdvanced={vi.fn()} />);

    expect(await screen.findByText(/fundraising/i)).toBeInTheDocument();
  });

  it('shows a leader the name they gave an area, not ours (I7)', async () => {
    // The canonical slug never changes; the label is theirs. A relabelled area reverting to our title
    // on the next load is the audit correcting a leader about their own work.
    readAnswers.mockResolvedValue({});
    readLabels.mockResolvedValue({ deep_work: 'Thinking time' });

    render(<Phase1Panel runId="run-1" coachOpenings={[]} onAdvanced={vi.fn()} />);

    expect(await screen.findByText('Thinking time')).toBeInTheDocument();
    expect(screen.queryByText('Deep work')).not.toBeInTheDocument();
  });
});

describe('Phase1Panel — renaming an area (I7)', () => {
  it('saves the leader’s name against the canonical slug, and shows it straight away', async () => {
    // The slug is what every figure in the audit is keyed by and it never changes; the label is the
    // leader's own word for the area. Saving the *label* as the key would orphan their hours the
    // moment they renamed anything.
    readAnswers.mockResolvedValue({});
    saveLabel.mockResolvedValue(undefined);

    const { user } = await renderCards();
    await user.click(screen.getAllByRole('button', { name: 'Rename' })[0]);
    await user.type(screen.getByPlaceholderText('Deep work'), 'Thinking time');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(saveLabel).toHaveBeenCalledWith('deep-work', 'Thinking time');
    // Optimistic: the heading changes without waiting for the round trip, so a leader who renames an
    // area does not watch their own word arrive a beat late.
    expect(await screen.findByRole('heading', { name: 'Thinking time' })).toBeInTheDocument();
  });

  it('trims what they typed, so a stray space is not saved as their label', async () => {
    readAnswers.mockResolvedValue({});
    saveLabel.mockResolvedValue(undefined);

    const { user } = await renderCards();
    await user.click(screen.getAllByRole('button', { name: 'Rename' })[0]);
    await user.type(screen.getByPlaceholderText('Deep work'), '  Thinking time  ');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(saveLabel).toHaveBeenCalledWith('deep-work', 'Thinking time');
  });
});

describe('Phase1Panel — the deep-work follow-up', () => {
  it('asks where the block sits only once the leader says there is one', async () => {
    readAnswers.mockResolvedValue({});

    const { user } = await renderCards();
    expect(screen.queryByLabelText(/Where does that block sit/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Yes' }));

    expect(screen.getByLabelText(/Where does that block sit/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/What gets in the way/)).not.toBeInTheDocument();
  });

  it('asks what gets in the way when they say there is not', async () => {
    // The two are mutually exclusive on purpose: asked both, a leader answers a question about a block
    // they have just said they do not have.
    readAnswers.mockResolvedValue({});

    const { user } = await renderCards();
    await user.click(screen.getByRole('button', { name: 'No' }));

    expect(screen.getByLabelText(/What gets in the way/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Where does that block sit/)).not.toBeInTheDocument();
  });
});

describe('Phase1Panel — the chart is a reveal, not a running total (I12)', () => {
  it('draws nothing while an area is still blank', async () => {
    const partial = weekAccountedFor();
    delete partial['reclaim_current_hours__recovery_white_space'];
    readAnswers.mockResolvedValue(partial);

    await renderCards();

    expect(
      screen.queryByRole('button', { name: 'Show me where the week is going' })
    ).not.toBeInTheDocument();
  });

  it('offers the look once every area has a figure, and holds continue until they take it', async () => {
    // The gate is the point: the server refuses the transition too (`422 CHART_REVEAL_REQUIRED`), and
    // a button that looked available and then failed would teach a leader the form is unreliable.
    readAnswers.mockResolvedValue(weekAccountedFor());

    await renderCards();

    expect(
      await screen.findByRole('button', { name: 'Show me where the week is going' })
    ).toBeInTheDocument();
    expect(continueButton()).toBeDisabled();
  });

  it('records the moment when they look, so a reload does not ask twice', async () => {
    readAnswers.mockResolvedValue(weekAccountedFor());

    const { user } = await renderCards();
    await user.click(
      await screen.findByRole('button', { name: 'Show me where the week is going' })
    );

    expect(claimOpening).toHaveBeenCalledWith('run-1', 'phase-1-chart-reveal');
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Show me where the week is going' })
      ).not.toBeInTheDocument()
    );
  });

  it('does not re-offer a reveal this run has already had', async () => {
    // The ledger arrives from the run, so a leader coming back to phase 1 meets their week drawn
    // rather than an invitation to look at it for the first time.
    readAnswers.mockResolvedValue(weekAccountedFor());

    await renderCards(['phase-1-chart-reveal']);

    expect(
      screen.queryByRole('button', { name: 'Show me where the week is going' })
    ).not.toBeInTheDocument();
  });
});

describe('Phase1Panel — writing the phase down', () => {
  /** Every area answered and the week already revealed: the state the continue button unlocks from. */
  const readyToContinue = async () => {
    readAnswers.mockResolvedValue(weekAccountedFor());
    const handles = await renderCards(['phase-1-chart-reveal']);
    return handles;
  };

  it('holds the leader at the reflection, which is what the server checks (I9)', async () => {
    const { user } = await readyToContinue();
    expect(continueButton()).toBeDisabled();

    await user.type(reflectionBox(), 'Twenty two hours on delivery.');

    expect(continueButton()).toBeEnabled();
  });

  it('saves the figures, the follow-up and the reflection in one batch, then advances', async () => {
    saveBatch.mockResolvedValue(undefined);
    advancePhase.mockResolvedValue({ ok: true });

    const { user, onAdvanced } = await readyToContinue();
    await user.type(hoursFor('deep_work'), '4');
    await user.click(screen.getByRole('button', { name: 'No' }));
    await user.type(screen.getByLabelText(/What gets in the way/), 'The inbox is loud by nine.');
    await user.type(reflectionBox(), 'Delivery has eaten the week.');
    await user.click(continueButton());

    await waitFor(() => expect(onAdvanced).toHaveBeenCalled());
    const [runId, answers] = saveBatch.mock.calls[0] as [string, { slotSlug: string }[]];
    const slugs = answers.map((a) => a.slotSlug);
    expect(runId).toBe('run-1');
    expect(slugs).toContain('reclaim_current_hours__deep_work');
    expect(slugs).toContain('reclaim_current_deep_block_exists');
    expect(slugs).toContain('reclaim_current_deep_block_blocker');
    expect(slugs).toContain('reclaim_reflection_p1');
    // The question the leader was never asked, because they said there is no block.
    expect(slugs).not.toContain('reclaim_current_deep_block_when');
    expect(advancePhase).toHaveBeenCalledWith('run-1', 'phase-1-current');
  });

  it('tells the leader what the server refused, in the server’s own terms', async () => {
    // A transition can be refused for a reason the form thought it had satisfied. Saying "something
    // went wrong" would leave them clicking the same button; naming the gate lets them clear it.
    saveBatch.mockResolvedValue(undefined);
    advancePhase.mockResolvedValue({ ok: false, chartRevealRequired: true });

    const { user, onAdvanced } = await readyToContinue();
    await user.type(reflectionBox(), 'Delivery has eaten the week.');
    await user.click(continueButton());

    expect(
      await screen.findByText(/Have a look at the shape of your week before moving on/)
    ).toBeInTheDocument();
    expect(onAdvanced).not.toHaveBeenCalled();
    // Not left spinning: the button comes back, because the leader has something they can do.
    expect(continueButton()).toBeEnabled();
  });

  it('keeps their words on screen when the save itself fails', async () => {
    // The one thing this screen must never do is lose a leader's typing to a network error.
    saveBatch.mockRejectedValue(new Error('The audit could not be saved.'));

    const { user, onAdvanced } = await readyToContinue();
    await user.type(reflectionBox(), 'Delivery has eaten the week.');
    await user.click(continueButton());

    expect(await screen.findByText(/The audit could not be saved./)).toBeInTheDocument();
    expect(reflectionBox()).toHaveValue('Delivery has eaten the week.');
    expect(onAdvanced).not.toHaveBeenCalled();
  });
});
