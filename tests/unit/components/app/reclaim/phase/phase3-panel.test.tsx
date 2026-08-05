/**
 * Phase 3 — the ideal week. The panel was only exercised indirectly through mocks in
 * `programme-shell.test.tsx`, so its own logic never ran.
 *
 * The branch worth pinning is the fix on this file: the chart-reveal gate used to read
 * `parseHours(...) > 0`, which is the same defect Phase 1's chart-reveal had — a typed "0" is a real
 * answer (a leader who wants no time at all in an area), not a blank one, and `isHours` exists to
 * tell the two apart. `> 0` held the chart back from a leader who had genuinely finished the table.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { readAnswers, saveBatch, advancePhase } = vi.hoisted(() => ({
  readAnswers: vi.fn(),
  saveBatch: vi.fn(),
  advancePhase: vi.fn(),
}));
vi.mock('@/components/app/reclaim/phase/actions', () => ({
  readAnswers,
  saveBatch,
  advancePhase,
}));

import { Phase3Panel } from '@/components/app/reclaim/phase/phase3-panel';

/** The eight non-conditional areas, in the order `RECLAIM_BUCKETS` declares them. */
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

const CHART_LABEL =
  'Hours per week by area, the week you have now with your ideal week marked on each bar';

const weekAccountedFor = (hours = 5) =>
  Object.fromEntries(
    AREAS.map((area) => [
      `reclaim_current_hours__${area}`,
      { value: String(hours), valueJson: hours },
    ])
  );

async function renderPanel(base: Record<string, unknown> = weekAccountedFor()) {
  readAnswers.mockResolvedValue(base);
  const onAdvanced = vi.fn();
  render(<Phase3Panel runId="run-1" onAdvanced={onAdvanced} />);
  await screen.findByText('Your ideal week');
  return { onAdvanced };
}

/** The eight "Ideal" number inputs, in table-row order — the sustainable-total field is the first
 *  spinbutton on the page, so it is always skipped. */
function idealInputs(): HTMLInputElement[] {
  return screen.getAllByRole('spinbutton').slice(1) as HTMLInputElement[];
}

function fillAllIdeal(value: string) {
  for (const input of idealInputs()) {
    fireEvent.change(input, { target: { value } });
  }
}

const continueButton = () => screen.getByRole('button', { name: 'Continue to the next section' });
const reflectionBox = () => screen.getByLabelText(/what stands out/i, { selector: 'textarea' });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Phase3Panel — loading and failure', () => {
  it('shows a loading state before the run’s answers arrive', () => {
    readAnswers.mockReturnValue(new Promise<never>(() => {}));

    render(<Phase3Panel runId="run-1" onAdvanced={vi.fn()} />);

    expect(screen.getByText('Loading your week…')).toBeInTheDocument();
  });

  it('tells the leader to refresh when the answers fail to load', async () => {
    readAnswers.mockRejectedValue(new Error('network down'));

    render(<Phase3Panel runId="run-1" onAdvanced={vi.fn()} />);

    expect(
      await screen.findByText(
        'We could not load this section just now. Please refresh to try again.'
      )
    ).toBeInTheDocument();
  });
});

describe('Phase3Panel — the areas shown', () => {
  it('names every non-conditional area with its current hours', async () => {
    await renderPanel(weekAccountedFor(6));

    expect(screen.getByText('Deep work')).toBeInTheDocument();
    expect(screen.getByText('Delivery & operations')).toBeInTheDocument();
    expect(screen.queryByText('Fundraising & capital')).not.toBeInTheDocument();
    expect(screen.getAllByText('6h').length).toBe(AREAS.length);
  });

  it('reads the current figure from the prose value when valueJson was never typed', async () => {
    // `currentHours` prefers `valueJson`, but falls back to parsing the raw string — the shape an
    // answer can be in when it came from a source that never typed it as a number.
    await renderPanel({
      ...weekAccountedFor(),
      reclaim_current_hours__deep_work: { value: '7', valueJson: null },
    });

    expect(screen.getAllByText('7h')).toHaveLength(1);
  });

  it('brings fundraising in once Phase 0 said it is relevant', async () => {
    await renderPanel({
      ...weekAccountedFor(),
      reclaim_setup_fundraising_relevant: { value: 'Yes', valueJson: true },
    });

    expect(screen.getByText('Fundraising & capital')).toBeInTheDocument();
    expect(idealInputs()).toHaveLength(AREAS.length + 1);
  });
});

describe('Phase3Panel — the ideal-week chart gate (the isHours fix)', () => {
  it('reveals the chart once every area has a figure, including an explicit 0', async () => {
    // The regression this branch fixes: under the old `> 0` gate this would never have appeared,
    // because every typed value here is zero.
    await renderPanel(weekAccountedFor());

    fillAllIdeal('0');

    expect(await screen.findByRole('img', { name: CHART_LABEL })).toBeInTheDocument();
  });

  it('holds the chart back while any one area is still blank', async () => {
    await renderPanel(weekAccountedFor());

    const inputs = idealInputs();
    inputs.slice(0, -1).forEach((input) => fireEvent.change(input, { target: { value: '4' } }));
    // The last input is left untouched.

    await waitFor(() => expect(inputs[0]).toHaveValue(4));
    expect(screen.queryByRole('img', { name: CHART_LABEL })).not.toBeInTheDocument();
  });

  it('is not drawn at all before any figure is typed', async () => {
    await renderPanel(weekAccountedFor());

    expect(screen.queryByRole('img', { name: CHART_LABEL })).not.toBeInTheDocument();
  });
});

describe('Phase3Panel — the "suspiciously similar" challenge (§8)', () => {
  it('offers the pause when the typed ideal week barely moves from today', async () => {
    await renderPanel(weekAccountedFor(5));

    fillAllIdeal('5');

    expect(
      await screen.findByText(/Your ideal week looks close to the one you have now/)
    ).toBeInTheDocument();
  });

  it('says nothing when the ideal week is a real departure from today', async () => {
    await renderPanel(weekAccountedFor(5));

    fillAllIdeal('20');

    await waitFor(() => expect(idealInputs()[0]).toHaveValue(20));
    expect(
      screen.queryByText(/Your ideal week looks close to the one you have now/)
    ).not.toBeInTheDocument();
  });
});

describe('Phase3Panel — writing the phase down', () => {
  it('holds continue at the reflection, which is what the server checks (I9)', async () => {
    await renderPanel(weekAccountedFor());
    expect(continueButton()).toBeDisabled();

    await userEvent.type(reflectionBox(), 'A quieter week.');

    expect(continueButton()).toBeEnabled();
  });

  it('saves an explicit 0 as a real answer rather than leaving it out', async () => {
    saveBatch.mockResolvedValue(undefined);
    advancePhase.mockResolvedValue({ ok: true });
    const { onAdvanced } = await renderPanel(weekAccountedFor());

    fillAllIdeal('0');
    await userEvent.type(reflectionBox(), 'Aiming for a lot less.');
    await userEvent.click(continueButton());

    await waitFor(() => expect(onAdvanced).toHaveBeenCalled());
    const [runId, answers] = saveBatch.mock.calls[0] as [
      string,
      { slotSlug: string; value: string; valueJson?: unknown }[],
    ];
    expect(runId).toBe('run-1');
    const deepWork = answers.find((a) => a.slotSlug === 'reclaim_ideal_hours__deep_work');
    expect(deepWork).toMatchObject({ value: '0', valueJson: 0 });
    expect(advancePhase).toHaveBeenCalledWith('run-1', 'phase-3-ideal');
  });

  it('leaves an untouched area out of the batch rather than inventing a figure for it', async () => {
    saveBatch.mockResolvedValue(undefined);
    advancePhase.mockResolvedValue({ ok: true });
    await renderPanel(weekAccountedFor());

    fireEvent.change(idealInputs()[0], { target: { value: '4' } });
    await userEvent.type(reflectionBox(), 'Just this one area, for now.');
    await userEvent.click(continueButton());

    await waitFor(() => expect(saveBatch).toHaveBeenCalled());
    const [, answers] = saveBatch.mock.calls[0] as [string, { slotSlug: string }[]];
    const slugs = answers.map((a) => a.slotSlug);
    expect(slugs).toContain('reclaim_ideal_hours__deep_work');
    expect(slugs).not.toContain('reclaim_ideal_hours__learning_development');
  });

  it('includes the sustainable total only when it is a real positive figure', async () => {
    saveBatch.mockResolvedValue(undefined);
    advancePhase.mockResolvedValue({ ok: true });
    await renderPanel(weekAccountedFor());

    await userEvent.type(
      screen.getByLabelText(/sustainable weekly total/i, { selector: 'input' }),
      '38'
    );
    await userEvent.type(reflectionBox(), 'Aiming for 38.');
    await userEvent.click(continueButton());

    await waitFor(() => expect(saveBatch).toHaveBeenCalled());
    const [, answers] = saveBatch.mock.calls[0] as [
      string,
      { slotSlug: string; value: string; valueJson?: unknown }[],
    ];
    const total = answers.find((a) => a.slotSlug === 'reclaim_ideal_total_hours');
    expect(total).toMatchObject({ value: '38', valueJson: 38 });
  });

  it('leaves the total out when it is blank or zero', async () => {
    saveBatch.mockResolvedValue(undefined);
    advancePhase.mockResolvedValue({ ok: true });
    await renderPanel(weekAccountedFor());

    await userEvent.type(reflectionBox(), 'No total set.');
    await userEvent.click(continueButton());

    await waitFor(() => expect(saveBatch).toHaveBeenCalled());
    const [, answers] = saveBatch.mock.calls[0] as [string, { slotSlug: string }[]];
    expect(answers.map((a) => a.slotSlug)).not.toContain('reclaim_ideal_total_hours');
  });

  it('always includes the reflection, even the free-text deep-work and commitment fields when filled', async () => {
    saveBatch.mockResolvedValue(undefined);
    advancePhase.mockResolvedValue({ ok: true });
    await renderPanel(weekAccountedFor());

    await userEvent.type(
      screen.getByLabelText(/daily deep-work block sit/i),
      'First thing, before the inbox.'
    );
    await userEvent.type(
      screen.getByLabelText(/one protected commitment/i),
      'No meetings before ten.'
    );
    await userEvent.type(reflectionBox(), 'Written down at last.');
    await userEvent.click(continueButton());

    await waitFor(() => expect(saveBatch).toHaveBeenCalled());
    const [, answers] = saveBatch.mock.calls[0] as [string, { slotSlug: string; value: string }[]];
    const bySlug = Object.fromEntries(answers.map((a) => [a.slotSlug, a.value]));
    expect(bySlug['reclaim_ideal_deep_block_when']).toBe('First thing, before the inbox.');
    expect(bySlug['reclaim_ideal_protected_commitment']).toBe('No meetings before ten.');
    expect(bySlug['reclaim_reflection_p3']).toBe('Written down at last.');
  });

  it('surfaces the server’s refusal and leaves the leader able to try again', async () => {
    saveBatch.mockResolvedValue(undefined);
    advancePhase.mockResolvedValue({ ok: false, message: 'We could not move on just now.' });
    const { onAdvanced } = await renderPanel(weekAccountedFor());

    await userEvent.type(reflectionBox(), 'Some words.');
    await userEvent.click(continueButton());

    expect(await screen.findByText(/We could not move on just now\./)).toBeInTheDocument();
    expect(onAdvanced).not.toHaveBeenCalled();
    expect(continueButton()).toBeEnabled();
  });
});
