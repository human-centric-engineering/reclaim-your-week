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

import React from 'react';
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
    openMoment,
    intro,
    beats,
    footer,
  }: {
    onTurnComplete?: () => void;
    openMoment?: string | null;
    intro?: React.ReactNode;
    beats?: { key: string; node: React.ReactNode }[];
    footer?: React.ReactNode;
  }) => (
    <div>
      {/* The moment the phase hands the chat, surfaced so the tests below can read which one it is.
          The real chat posts it; a stub cannot, and what matters here is the choice, not the post. */}
      <span data-testid="open-moment">{openMoment ?? 'none'}</span>
      {intro}
      {/* Keyed beats, as the real chat takes them: it anchors each one to the turn it appeared
          under, which a stub has no turns to do. Rendering the nodes in order is the part that
          matters here. */}
      {beats?.map((beat) => (
        <React.Fragment key={beat.key}>{beat.node}</React.Fragment>
      ))}
      <button type="button" onClick={() => onTurnComplete?.()}>
        finish a turn
      </button>
      {footer}
    </div>
  ),
}));

import { PhaseConversation } from '@/components/app/reclaim/coach/phase-conversation';

/** One reading, stated plainly. The shape the gate counts as settled. */
const stated = (value: string) => ({
  value,
  valueJson: null,
  sourceType: 'direct',
  confidence: 10,
});

/**
 * Every reading in a phase, so a test about a *gate* is not accidentally a test about coverage.
 *
 * The yes-or-no readings carry a real typed value rather than prose, because three of Phase 0's
 * readings only apply when their boolean came back true — a fixture that left them untyped would
 * quietly shrink the phase and move the threshold underneath the test.
 */
const BOOLEAN_SLOTS = new Set([
  'reclaim_setup_in_transition',
  'reclaim_setup_fundraising_relevant',
  'reclaim_profile_distributed_team',
  'reclaim_energy_protected',
]);

const allOf = (slugs: readonly string[]): Record<string, unknown> =>
  Object.fromEntries(
    slugs.map((slug) => [
      slug,
      BOOLEAN_SLOTS.has(slug)
        ? { ...stated('Yes'), valueJson: true }
        : stated('Something they said'),
    ])
  );

/** Phase 2 in full: two readings, asked as one question. */
const ENERGY = ['reclaim_energy_peak_description', 'reclaim_energy_protected'] as const;

/**
 * Phase 0 in full. Written out rather than derived from `phaseCaptureSlots`, so a slot added to the
 * phase fails this loudly instead of quietly changing what "covered" means underneath the gate.
 */
const SETUP = [
  'reclaim_profile_first_name',
  'reclaim_profile_role',
  'reclaim_profile_org_type',
  'reclaim_profile_direct_reports',
  'reclaim_profile_distributed_team',
  'reclaim_profile_distributed_impact',
  'reclaim_setup_in_transition',
  'reclaim_setup_transition_detail',
  'reclaim_setup_fundraising_relevant',
  'reclaim_setup_fundraising_support',
  'reclaim_setup_weekly_hours',
  'reclaim_setup_priorities',
  'reclaim_setup_keeping_me_up',
  'reclaim_setup_why_now',
  'reclaim_setup_audit_period',
] as const;

const captured = allOf(ENERGY);

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
    readAnswers.mockResolvedValue(allOf(SETUP));
    render(
      <PhaseConversation {...props} phaseKey="phase-0-setup" phaseIndex={0} phaseLabel="Setup" />
    );

    expect(
      await screen.findByRole('button', { name: /Continue to the next phase/ })
    ).toBeInTheDocument();
  });
});

/**
 * The move onward waits for the phase to have happened, not for the first thing said in it.
 *
 * This gate used to be `capturedCount > 0`, so Phase 0 offered its way out the moment a leader's
 * first name landed: a "continue" button beside a panel reading five of fifteen, with the coach still
 * on its third question. Anyone who took it lost the thirteen readings the rest of the audit is built
 * on, and nothing anywhere said so.
 */
describe('PhaseConversation — when the way onward is offered', () => {
  const setup = { ...props, phaseKey: 'phase-0-setup', phaseIndex: 0, phaseLabel: 'Setup' };

  it('offers no way onward from a phase that has barely started, and says how much is left', async () => {
    // Five of fifteen — the exact state that used to show a continue button.
    readAnswers.mockResolvedValue(allOf(SETUP.slice(0, 5)));
    render(<PhaseConversation {...setup} />);
    await waitFor(() => expect(readAnswers).toHaveBeenCalled());

    expect(
      screen.queryByRole('button', { name: /Continue to the next phase/ })
    ).not.toBeInTheDocument();
    expect(await screen.findByText(/are 10 things still to cover/i)).toBeInTheDocument();
  });

  it('counts the last one down in the singular, because "1 things" is the product not reading it', async () => {
    // Phase 2, where two readings are asked as one question, so one of them outstanding is a real
    // state. On a fifteen-reading phase it is not: the threshold leaves room for exactly one, so the
    // last one outstanding is already the phase being covered.
    readAnswers.mockResolvedValue(allOf(['reclaim_energy_peak_description']));
    render(<PhaseConversation {...props} />);

    expect(await screen.findByText(/is one thing still to cover/i)).toBeInTheDocument();
  });

  it('offers it with one still outstanding, so a leader is not held behind a single question', async () => {
    // The shortfall is deliberate: the coach cannot record a decline, so a phase that demanded every
    // reading would be held open forever by one a leader would rather not answer.
    readAnswers.mockResolvedValue(allOf(SETUP.slice(0, 14)));
    render(<PhaseConversation {...setup} />);

    expect(
      await screen.findByRole('button', { name: /Continue to the next phase/ })
    ).toBeInTheDocument();
  });

  it('does not wait for a reading that does not apply to this leader', async () => {
    // No fundraising in the role and no distributed team, so the two follow-ons are finished rather
    // than missing. Eleven of the twelve that apply is covered; eleven of fifteen would not be.
    readAnswers.mockResolvedValue({
      ...allOf(
        SETUP.filter(
          (s) =>
            s !== 'reclaim_setup_fundraising_support' &&
            s !== 'reclaim_profile_distributed_impact' &&
            s !== 'reclaim_setup_transition_detail' &&
            s !== 'reclaim_setup_audit_period'
        )
      ),
      reclaim_setup_fundraising_relevant: { ...stated('No'), valueJson: false },
      reclaim_profile_distributed_team: { ...stated('No'), valueJson: false },
      reclaim_setup_in_transition: { ...stated('No'), valueJson: false },
    });
    render(<PhaseConversation {...setup} />);

    expect(
      await screen.findByRole('button', { name: /Continue to the next phase/ })
    ).toBeInTheDocument();
  });

  it('says what is still open beside the button, rather than offering a bare way out', async () => {
    // The state the leader was left in: two readings outstanding, the coach saying "if there is
    // anything else you would like to add, feel free, otherwise you can move on", and no button
    // anywhere. Above the threshold the button is there, and the line beside it says what taking it
    // leaves behind, so moving on is a choice rather than an escape.
    readAnswers.mockResolvedValue(allOf(SETUP.slice(0, 14)));
    render(<PhaseConversation {...setup} />);

    expect(
      await screen.findByRole('button', { name: /Continue to the next phase/ })
    ).toBeInTheDocument();
    expect(await screen.findByText(/you may move on whenever you wish/i)).toBeInTheDocument();
    expect(
      await screen.findByText(/carry on here to clarify or add anything/i)
    ).toBeInTheDocument();
  });

  it('says nothing about what is left when nothing is', async () => {
    readAnswers.mockResolvedValue(allOf(SETUP));
    render(<PhaseConversation {...setup} />);

    await screen.findByRole('button', { name: /Continue to the next phase/ });
    expect(screen.queryByText(/you may move on whenever you wish/i)).not.toBeInTheDocument();
  });

  it('takes the threshold from the operator rather than from a number compiled in', async () => {
    // Eleven of fifteen is 73 per cent: covered at 70, not covered at the shipped 90. The same
    // fixture either way, so this can only be reading the config.
    readAnswers.mockResolvedValue(allOf(SETUP.slice(0, 11)));
    const { unmount } = render(<PhaseConversation {...setup} coveredPercent={70} />);

    expect(
      await screen.findByRole('button', { name: /Continue to the next phase/ })
    ).toBeInTheDocument();
    unmount();

    render(<PhaseConversation {...setup} />);
    await waitFor(() => expect(readAnswers).toHaveBeenCalledTimes(2));
    expect(
      screen.queryByRole('button', { name: /Continue to the next phase/ })
    ).not.toBeInTheDocument();
  });

  it('will not let a threshold out of range strand a leader or wave them through', async () => {
    // It arrives over HTTP. A nought would offer the way out of a phase nobody had started; anything
    // above one would hold every phase open for ever.
    readAnswers.mockResolvedValue(allOf(SETUP.slice(0, 5)));
    const { unmount } = render(<PhaseConversation {...setup} coveredPercent={0} />);
    await waitFor(() => expect(readAnswers).toHaveBeenCalled());

    expect(
      screen.queryByRole('button', { name: /Continue to the next phase/ })
    ).not.toBeInTheDocument();
    unmount();

    readAnswers.mockResolvedValue(allOf(SETUP));
    render(<PhaseConversation {...setup} coveredPercent={400} />);

    expect(
      await screen.findByRole('button', { name: /Continue to the next phase/ })
    ).toBeInTheDocument();
  });

  it('does not count the coach’s own guesses towards a phase being covered', async () => {
    // A phase whose coverage is made of low-confidence inferences is a phase where the coach filled
    // the audit in on the leader's behalf, which is the one thing the panel exists to prevent.
    readAnswers.mockResolvedValue({
      ...allOf(SETUP.slice(0, 8)),
      ...Object.fromEntries(
        SETUP.slice(8).map((slug) => [
          slug,
          {
            value: 'Read between the lines',
            valueJson: null,
            sourceType: 'inferred',
            confidence: 4,
          },
        ])
      ),
    });
    render(<PhaseConversation {...setup} />);
    await waitFor(() => expect(readAnswers).toHaveBeenCalled());

    expect(
      screen.queryByRole('button', { name: /Continue to the next phase/ })
    ).not.toBeInTheDocument();
  });
});

/**
 * The coach opens every phase, rather than the screen asking the leader to say hello into a silence.
 *
 * These pin the choice of moment, which is where the two kinds differ. An arrival fires because the
 * leader got here; the reveal fires because they pressed a button (I12). Phase 1 has both, and their
 * order is the thing worth holding: the arrival first, the reveal when it is asked for.
 */
describe('PhaseConversation — the coach opens the phase', () => {
  const moment = () => screen.getByTestId('open-moment').textContent;

  it('opens on arrival, without waiting to be spoken to', async () => {
    render(<PhaseConversation {...props} />);
    await waitFor(() => expect(readAnswers).toHaveBeenCalled());

    expect(moment()).toBe('phase-2-open');
  });

  it('opens the setup phase too, which is the leader’s first minute in the product', async () => {
    render(
      <PhaseConversation {...props} phaseKey="phase-0-setup" phaseIndex={0} phaseLabel="Setup" />
    );
    await waitFor(() => expect(readAnswers).toHaveBeenCalled());

    expect(moment()).toBe('phase-0-open');
  });

  it('does not open again once this run has had the arrival', async () => {
    // The ledger is what makes a reload cost nothing: the moment is claimed server-side, and the
    // client stops offering it as soon as the run says it has happened.
    render(<PhaseConversation {...props} coachOpenings={['phase-2-open']} />);
    await waitFor(() => expect(readAnswers).toHaveBeenCalled());

    expect(moment()).toBe('none');
  });

  it('gives phase 1 its arrival first, and the reveal only when the leader asks (I12)', async () => {
    readAnswers.mockResolvedValue(
      Object.fromEntries(
        [
          'deep_work',
          'learning_development',
          'strategic_planning',
          'team_development',
          'organisational_oversight',
          'relationship_building',
          'delivery_operations',
          'recovery_white_space',
        ].map((a) => [
          `reclaim_current_hours__${a}`,
          { value: '5', valueJson: 5, sourceType: 'direct', confidence: 10 },
        ])
      )
    );
    const { rerender } = render(
      <PhaseConversation
        {...props}
        phaseKey="phase-1-current"
        phaseIndex={1}
        phaseLabel="Current reality"
      />
    );

    // Ready to reveal, and still the arrival: pressing the button is what moves it on.
    expect(await screen.findByRole('button', { name: /Show me where the week is going/ }));
    expect(moment()).toBe('phase-1-open');

    // Once the arrival is behind them, the button hands the reveal over.
    rerender(
      <PhaseConversation
        {...props}
        phaseKey="phase-1-current"
        phaseIndex={1}
        phaseLabel="Current reality"
        coachOpenings={['phase-1-open']}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /Show me where the week is going/ }));

    expect(moment()).toBe('phase-1-chart-reveal');
  });
});

/**
 * Phase 1's beats, now that they live in the conversation rather than stacked underneath it.
 *
 * The order these appear in is the product: the calendar branch is offered on the data (every area
 * has a figure), the reveal waits for the leader to ask, and the chart appears only after they have.
 * I12 is the reason the last two are separate — a chart that draws itself as the figures arrive means
 * the leader met their week one bar at a time and there is no reveal left to have.
 */
describe('PhaseConversation — the beats of phase 1', () => {
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

  const everyArea = (): Record<string, unknown> =>
    Object.fromEntries(
      AREAS.map((a) => [
        `reclaim_current_hours__${a}`,
        { value: '5', valueJson: 5, sourceType: 'direct', confidence: 10 },
      ])
    );

  /**
   * The phase actually worked through, not only its eight figures.
   *
   * The beats below fire on the figures alone (the calendar branch and the reveal are gated on
   * `everyVisibleAreaHasHours`), but the move onward is gated on the phase having happened — and this
   * phase is nineteen readings, of which the figures are eight. A leader with eight numbers and no
   * account of what any of that time looks like has had half the conversation this phase exists for.
   */
  const wholePhase1 = (): Record<string, unknown> => ({
    ...everyArea(),
    ...Object.fromEntries(
      AREAS.map((a) => [`reclaim_current_detail__${a}`, stated('What that time looks like')])
    ),
    reclaim_current_deep_block_exists: { ...stated('Yes'), valueJson: true },
    reclaim_current_deep_block_when: stated('Tuesday mornings'),
  });

  const phase1 = {
    ...props,
    phaseKey: 'phase-1-current',
    phaseIndex: 1,
    phaseLabel: 'Current reality',
  };

  it('offers no calendar branch until every area has a figure', async () => {
    readAnswers.mockResolvedValue(captured);
    render(<PhaseConversation {...phase1} />);
    await waitFor(() => expect(readAnswers).toHaveBeenCalled());

    expect(screen.queryByRole('link', { name: /Look at my calendar/ })).not.toBeInTheDocument();
  });

  it('offers it once they do, pointing at the step that was unreachable for two features', async () => {
    readAnswers.mockResolvedValue(everyArea());
    render(<PhaseConversation {...phase1} />);

    const link = await screen.findByRole('link', { name: /Look at my calendar/ });
    expect(link).toHaveAttribute('href', '/programme/calendar');
  });

  it('withdraws the offer once a calendar has been reconciled', async () => {
    readAnswers.mockResolvedValue({
      ...everyArea(),
      reclaim_calendar_uploaded: {
        value: 'Yes',
        valueJson: true,
        sourceType: 'direct',
        confidence: 10,
      },
    });
    render(<PhaseConversation {...phase1} />);
    await waitFor(() => expect(readAnswers).toHaveBeenCalled());

    expect(screen.queryByRole('link', { name: /Look at my calendar/ })).not.toBeInTheDocument();
  });

  it('shows no chart until the leader asks for it (I12)', async () => {
    readAnswers.mockResolvedValue(everyArea());
    render(<PhaseConversation {...phase1} />);

    // Ready, so the invitation is there — and the picture is not.
    expect(
      await screen.findByRole('button', { name: /Show me where the week is going/ })
    ).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('will not move on from phase 1 until the picture has been looked at', async () => {
    readAnswers.mockResolvedValue({
      ...wholePhase1(),
      reclaim_reflection_p1: {
        value: 'Too much delivery',
        valueJson: null,
        sourceType: 'direct',
        confidence: 9,
      },
    });
    render(<PhaseConversation {...phase1} />);

    expect(await screen.findByText(/shape of your week before moving on/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Continue to the next phase/ })
    ).not.toBeInTheDocument();
  });

  it('draws the picture once they ask, and then offers the move', async () => {
    readAnswers.mockResolvedValue({
      ...wholePhase1(),
      reclaim_reflection_p1: {
        value: 'Too much delivery',
        valueJson: null,
        sourceType: 'direct',
        confidence: 9,
      },
    });
    render(<PhaseConversation {...phase1} />);

    await userEvent.click(
      await screen.findByRole('button', { name: /Show me where the week is going/ })
    );

    expect(
      await screen.findByRole('button', { name: /Continue to the next phase/ })
    ).toBeInTheDocument();
  });
});

/** The panel has no column of its own on a narrow screen, so it has to be reachable another way. */
describe('PhaseConversation — the captured panel on a narrow screen', () => {
  it('opens and closes the drawer, and says how much has been noted', async () => {
    render(<PhaseConversation {...props} />);

    const trigger = await screen.findByRole('button', { name: /of \d+ noted/ });
    await userEvent.click(trigger);

    // Two copies now — the always-there column and the drawer — which is the point: the drawer is the
    // same panel, not a summary of it.
    expect(screen.getAllByLabelText('What the coach has recorded').length).toBeGreaterThan(1);

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getAllByLabelText('What the coach has recorded')).toHaveLength(1);
  });

  it('closes on the backdrop too, which is where a thumb lands first', async () => {
    render(<PhaseConversation {...props} />);

    await userEvent.click(await screen.findByRole('button', { name: /of \d+ noted/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Close what the coach has noted' }));

    expect(screen.getAllByLabelText('What the coach has recorded')).toHaveLength(1);
  });

  it('offers the form path from inside the drawer, not only from the column', async () => {
    render(<PhaseConversation {...props} />);

    await userEvent.click(await screen.findByRole('button', { name: /of \d+ noted/ }));
    const switches = screen.getAllByRole('button', { name: /fill this in myself/ });
    await userEvent.click(switches[switches.length - 1]);

    expect(props.onSwitchToForm).toHaveBeenCalled();
  });
});
