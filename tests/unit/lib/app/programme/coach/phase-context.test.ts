/**
 * What the coach is told about the phase it is in.
 *
 * The load-bearing assertion is the run-scoping one. The framework's own module context injects slot
 * *heads*, which on a second audit still hold the first audit's answers, so a coach reading only that
 * would open audit two believing it already knew the leader's week. This block is read run-scoped and
 * says outright that anything it lists as absent has not been said in this audit. If that sentence or
 * that scoping goes, a repeat audit quietly stops asking.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const {
  findFirst,
  readRunAnswers,
  readBucketLabels,
  loadPhaseProgress,
  readCoachContent,
  readSignposts,
  grantFindFirst,
  hasCompletedAudit,
} = vi.hoisted(() => ({
  findFirst: vi.fn(),
  readRunAnswers: vi.fn(),
  readBucketLabels: vi.fn(),
  loadPhaseProgress: vi.fn(),
  readCoachContent: vi.fn(),
  readSignposts: vi.fn(),
  grantFindFirst: vi.fn(),
  hasCompletedAudit: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  prisma: { reclaimAuditRun: { findFirst }, reclaimGrant: { findFirst: grantFindFirst } },
}));
vi.mock('@/lib/app/programme/compare', () => ({ hasCompletedAudit }));
vi.mock('@/lib/app/programme/runs/answers', () => ({ readRunAnswers }));
vi.mock('@/lib/app/programme/buckets/labels', () => ({ readBucketLabels }));
vi.mock('@/lib/app/programme/runs/journey', () => ({ loadPhaseProgress }));
vi.mock('@/lib/app/programme/config', () => ({
  readReclaimCoachContent: readCoachContent,
  readReclaimSignposts: readSignposts,
}));

/** Content as an operator's config would supply it — the two areas are enough to show the shape. */
const content = {
  governingFrame: 'THE FRAME',
  buckets: [
    {
      slug: 'deep-work',
      title: 'Deep work',
      description: 'DEEP WORK PROSE',
      colour: '#000',
      benchmark: { note: '15-20%', lower: 15, upper: 20 },
    },
    {
      slug: 'fundraising-capital',
      title: 'Fundraising & capital',
      description: 'FUNDRAISING PROSE',
      colour: '#111',
      benchmark: { note: 'season-dependent', lower: null, upper: null },
    },
  ],
  deepWorkNote: 'THE DEEP WORK NOTE',
  hourBands: [{ slug: 'high', lowerHours: 55, upperHours: null, label: 'A high total' }],
};

import { buildCoachPhaseContext } from '@/lib/app/programme/coach/phase-context';

const direct = (value: string) => ({
  value,
  valueJson: null,
  sourceType: 'direct',
  confidence: 10,
});

beforeEach(() => {
  vi.clearAllMocks();
  findFirst.mockResolvedValue({ id: 'run-1' });
  readRunAnswers.mockResolvedValue({});
  readBucketLabels.mockResolvedValue({});
  loadPhaseProgress.mockResolvedValue({ phases: [], currentPhaseKey: 'phase-2-energy' });
  // The signpost cards. Defaults to none, so the existing assertions keep testing the capture block
  // rather than the card echo; the tests that care about the card supply their own.
  readSignposts.mockResolvedValue([]);
  grantFindFirst.mockResolvedValue({ tier: 'standard' });
  hasCompletedAudit.mockResolvedValue(false);
  readCoachContent.mockResolvedValue(content);
});

describe("the content the phase needs — Rashmir's words, from the operator's config", () => {
  it('supplies the governing frame in every phase', async () => {
    // The system prompt has always claimed this is "supplied to you in context". Nothing supplied it:
    // the framework's module context carries name, description and slot values, never `Module.config`.
    expect(await buildCoachPhaseContext('u1')).toContain('THE FRAME');
  });

  it('supplies the areas and the deep-work note where areas are discussed', async () => {
    loadPhaseProgress.mockResolvedValue({ phases: [], currentPhaseKey: 'phase-1-current' });

    const block = await buildCoachPhaseContext('u1');

    expect(block).toContain('Deep work (15-20%): DEEP WORK PROSE');
    expect(block).toContain('THE DEEP WORK NOTE');
    // Confidential framework: the coach recognises with it, it does not read it out (guardrails §7).
    expect(block).toContain('never quote it at');
  });

  it('leaves the areas out of a phase that is not about them', async () => {
    // Phase 2 is energy. Sending nine area definitions there is tokens for nothing.
    expect(await buildCoachPhaseContext('u1')).not.toContain('DEEP WORK PROSE');
  });

  it('omits the fundraising area from the content unless it is relevant to this leader', async () => {
    loadPhaseProgress.mockResolvedValue({ phases: [], currentPhaseKey: 'phase-1-current' });

    expect(await buildCoachPhaseContext('u1')).not.toContain('FUNDRAISING PROSE');

    readRunAnswers.mockResolvedValue({
      reclaim_setup_fundraising_relevant: { ...direct('Yes'), valueJson: true },
    });
    expect(await buildCoachPhaseContext('u1')).toContain('FUNDRAISING PROSE');
  });

  it('offers the under-delegation invitation at the gap, as an invitation', async () => {
    loadPhaseProgress.mockResolvedValue({ phases: [], currentPhaseKey: 'phase-4-gap' });

    const block = await buildCoachPhaseContext('u1');

    expect(block).toContain('what it might mean to lead differently');
    expect(block).toContain('never a diagnosis');
    expect(block).toContain('55 to more hours: A high total');
  });
});

describe('buildCoachPhaseContext', () => {
  it('names the phase and lists what it captures', async () => {
    const block = await buildCoachPhaseContext('u1');

    expect(block).toContain('phase 2 of 6: Energy');
    expect(block).toContain('reclaim_energy_peak_description');
    expect(block).toContain('not yet captured in this audit');
    expect(readRunAnswers).toHaveBeenCalledWith('u1', 'run-1');
  });

  it('reports a captured reading with how it was come by, so the coach does not ask again', async () => {
    readRunAnswers.mockResolvedValue({
      reclaim_energy_peak_description: {
        value: 'Early mornings, before anyone else is on',
        valueJson: null,
        sourceType: 'inferred',
        confidence: 5,
      },
    });

    const block = await buildCoachPhaseContext('u1');

    expect(block).toContain(
      'reclaim_energy_peak_description: captured as "Early mornings, before anyone else is on" (inferred, confidence 5)'
    );
  });

  it('says that an absent reading is absent from THIS audit, whatever else is in context', async () => {
    const block = await buildCoachPhaseContext('u1');

    expect(block).toContain('not been said in this audit');
  });

  it('tells the coach the pacing rule rather than leaving it to the system prompt', async () => {
    const block = await buildCoachPhaseContext('u1');

    expect(block).toContain('one or two of these at a time');
    expect(block).toContain('never read the list out');
  });

  it("makes the reflection the phase's closing beat, on the two conditions that hold I9 up", async () => {
    const block = await buildCoachPhaseContext('u1');

    expect(block).toContain('reclaim_reflection_p2');
    expect(block).toContain('what stands out to you here?');
    // The two rules that replaced the blanket refusal: it is theirs to say, and it is theirs to leave.
    expect(block).toContain('Never infer it');
    expect(block).toContain('leave the move to the next phase to them');
  });

  it('stops asking for a reflection this run already holds', async () => {
    readRunAnswers.mockResolvedValue({
      reclaim_reflection_p2: {
        value: 'My best hours go to other people.',
        valueJson: null,
        sourceType: 'user_confirmed',
        confidence: 9,
      },
    });

    const block = await buildCoachPhaseContext('u1');

    expect(block).toContain('My best hours go to other people.');
    expect(block).toContain('Do not ask for it again');
  });

  it('says a setup phase has no reflection pause', async () => {
    loadPhaseProgress.mockResolvedValue({ phases: [], currentPhaseKey: 'phase-0-setup' });

    const block = await buildCoachPhaseContext('u1');

    expect(block).toContain('no reflection pause');
  });

  it('drops the fundraising area unless Phase 0 marked it relevant', async () => {
    loadPhaseProgress.mockResolvedValue({ phases: [], currentPhaseKey: 'phase-1-current' });

    const without = await buildCoachPhaseContext('u1');
    expect(without).not.toContain('fundraising_capital');

    readRunAnswers.mockResolvedValue({
      reclaim_setup_fundraising_relevant: { ...direct('Yes'), valueJson: true },
    });
    const withIt = await buildCoachPhaseContext('u1');
    expect(withIt).toContain('reclaim_current_hours__fundraising_capital');
  });

  it('is empty when there is no audit in progress', async () => {
    findFirst.mockResolvedValue(null);

    expect(await buildCoachPhaseContext('u1')).toBe('');
    expect(readRunAnswers).not.toHaveBeenCalled();
  });

  it('speaks in the summary phase even though it captures nothing there', async () => {
    // It used to return '' here, on the reading that a phase with no capture slots has nothing to
    // say. That was true while phase 6 was a document; it is not true of a close, which branches on
    // the leader's tier, on whether they have done this before, and on their own takeaway.
    loadPhaseProgress.mockResolvedValue({ phases: [], currentPhaseKey: 'phase-6-summary' });
    grantFindFirst.mockResolvedValue({ tier: 'standard' });

    const block = await buildCoachPhaseContext('u1');
    expect(block).toContain('phase 6 of 6');
    expect(block).toContain('This is the close');
  });

  it('still builds when the leader has never relabelled anything', async () => {
    readBucketLabels.mockRejectedValue(new Error('label read failed'));

    expect(await buildCoachPhaseContext('u1')).toContain('phase 2 of 6');
  });

  it('still builds when the signpost config cannot be read', async () => {
    // The cards are operator-editable config; a failed read must cost the coach a paragraph of
    // context, never a leader their turn.
    readSignposts.mockRejectedValue(new Error('config read failed'));

    expect(await buildCoachPhaseContext('u1')).toContain('phase 2 of 6');
  });
});

describe('buildCoachPhaseContext — the card the leader has already read', () => {
  it('quotes the phase opening back and forbids restating it', async () => {
    // Without this the coach opens by orienting the leader to a phase that has just oriented them,
    // because its own system instructions tell it to signpost every phase.
    readSignposts.mockResolvedValue([
      {
        phaseKey: 'phase-2-energy',
        involves: 'INVOLVES',
        duration: 'ten minutes',
        opening: ['THE CARD SAID THIS'],
      },
    ]);

    const block = await buildCoachPhaseContext('u1');

    expect(block).toContain('THE CARD SAID THIS');
    expect(block).toContain('Do not restate');
  });

  it('says nothing about a card when the phase has no opening beats', async () => {
    readSignposts.mockResolvedValue([
      { phaseKey: 'phase-2-energy', involves: 'INVOLVES', duration: 'ten', opening: [] },
    ]);

    expect(await buildCoachPhaseContext('u1')).not.toContain('Do not restate');
  });
});

describe('buildCoachPhaseContext — the gap, in the leader’s own figures', () => {
  beforeEach(() => {
    loadPhaseProgress.mockResolvedValue({ phases: [], currentPhaseKey: 'phase-4-gap' });
  });

  const hours = (n: number) => ({
    value: String(n),
    valueJson: n,
    sourceType: 'direct',
    confidence: 10,
  });

  it('gives the coach the arithmetic rather than asking it to remember', async () => {
    // I13's sibling. The source wants a gap named in actual numbers ("about 15% ... closer to 30%"),
    // and a coach asked to do that from memory invents a figure that sounds right.
    readRunAnswers.mockResolvedValue({
      reclaim_current_hours__deep_work: hours(4),
      reclaim_ideal_hours__deep_work: hours(10),
    });

    const block = await buildCoachPhaseContext('u1');

    expect(block).toContain('4h now, 10h wanted, 6h more');
    expect(block).toContain('Do not recalculate these');
  });

  it('names a reduction as less rather than as a negative number', async () => {
    readRunAnswers.mockResolvedValue({
      reclaim_current_hours__deep_work: hours(12),
      reclaim_ideal_hours__deep_work: hours(5),
    });

    expect(await buildCoachPhaseContext('u1')).toContain('12h now, 5h wanted, 7h less');
  });

  it('says so plainly when an area has no ideal yet', async () => {
    readRunAnswers.mockResolvedValue({ reclaim_current_hours__deep_work: hours(4) });

    expect(await buildCoachPhaseContext('u1')).toContain('no ideal given');
  });

  it('leaves out an area the leader was never asked about', async () => {
    // Fundraising is conditional, and this run did not mark it relevant, so it must not appear as a
    // gap of zero against an ideal nobody was offered.
    readRunAnswers.mockResolvedValue({ reclaim_current_hours__deep_work: hours(4) });

    expect(await buildCoachPhaseContext('u1')).not.toContain('Fundraising');
  });

  it('is absent in a phase that is not the gap', async () => {
    loadPhaseProgress.mockResolvedValue({ phases: [], currentPhaseKey: 'phase-2-energy' });
    readRunAnswers.mockResolvedValue({
      reclaim_current_hours__deep_work: hours(4),
      reclaim_ideal_hours__deep_work: hours(10),
    });

    expect(await buildCoachPhaseContext('u1')).not.toContain('Do not recalculate these');
  });
});

describe('buildCoachPhaseContext — the close', () => {
  beforeEach(() => {
    loadPhaseProgress.mockResolvedValue({ phases: [], currentPhaseKey: 'phase-6-summary' });
  });

  const takeaway = {
    value: 'That I have been hiding in delivery work.',
    valueJson: null,
    sourceType: 'direct',
    confidence: 10,
  };

  it('holds the summary back until the leader has said what they are taking away', async () => {
    readRunAnswers.mockResolvedValue({});

    const block = await buildCoachPhaseContext('u1');

    expect(block).toContain('the summary does not appear until they');
    expect(block).toContain('not produce a summary of the audit yourself');
  });

  it('answers their takeaway in their own words once they have written it', async () => {
    readRunAnswers.mockResolvedValue({ reclaim_reflection_p6: takeaway });

    const block = await buildCoachPhaseContext('u1');

    expect(block).toContain('hiding in delivery work');
    expect(block).toContain('Do not improve on it');
  });

  it('invites a client to share ahead of their next session rather than offering a consultation', async () => {
    readRunAnswers.mockResolvedValue({ reclaim_reflection_p6: takeaway });
    grantFindFirst.mockResolvedValue({ tier: 'client' });

    const block = await buildCoachPhaseContext('u1');

    expect(block).toContain('already working with Rashmir');
    expect(block).not.toContain('first completed audit');
  });

  it('leaves the door open once, on a first audit', async () => {
    readRunAnswers.mockResolvedValue({ reclaim_reflection_p6: takeaway });
    hasCompletedAudit.mockResolvedValue(false);

    expect(await buildCoachPhaseContext('u1')).toContain('first completed audit');
  });

  it('does not offer again to someone who has finished an audit before', async () => {
    // "The 30-minute consultation offer should only appear once — not on every audit." Derived from
    // the leader's completed runs rather than from a stored flag: the current run is still in
    // progress here, so it never counts itself, and there is no new state to keep true.
    readRunAnswers.mockResolvedValue({ reclaim_reflection_p6: takeaway });
    hasCompletedAudit.mockResolvedValue(true);

    const block = await buildCoachPhaseContext('u1');

    expect(block).toContain('Do not offer it again');
    expect(block).not.toContain('first completed audit');
  });

  it('records the takeaway and nothing else, because the rest of this phase is consent', async () => {
    readRunAnswers.mockResolvedValue({});

    const block = await buildCoachPhaseContext('u1');

    // The one write in the close, and it is still the leader's sentence: ask, offer back, record.
    expect(block).toContain('record_answers as reclaim_reflection_p6');
    expect(block).toContain('never inferred');
    // The two that stay theirs alone.
    expect(block).toContain('sharing choices are the leader');
    expect(block).toContain('summary is produced on screen');
  });

  it('does not record the takeaway twice when this run already holds it', async () => {
    readRunAnswers.mockResolvedValue({ reclaim_reflection_p6: takeaway });

    const block = await buildCoachPhaseContext('u1');

    expect(block).toContain('do not record it again');
  });
});

/**
 * Phase 1's two branches into other surfaces: the calendar, and the picture.
 *
 * Both are data-gated rather than gated on the model's sense of "have we finished", and both were
 * uncovered while the block was being changed for the conversational surface — which is how a beat
 * ends up offered halfway through the areas, or a chart described with figures that are not on the
 * leader's screen. What is asserted is the gate, not the prose.
 */
describe('buildCoachPhaseContext — the branches out of phase 1', () => {
  /** Every visible area with a figure, which is what opens both beats. */
  function everyAreaAnswered(): Record<
    string,
    { value: string; valueJson: unknown; sourceType: string; confidence: number }
  > {
    const areas = [
      'deep_work',
      'learning_development',
      'strategic_planning',
      'team_development',
      'organisational_oversight',
      'relationship_building',
      'delivery_operations',
      'recovery_white_space',
    ];
    const answers: Record<
      string,
      { value: string; valueJson: unknown; sourceType: string; confidence: number }
    > = {};
    for (const area of areas) {
      answers[`reclaim_current_hours__${area}`] = { ...direct('5'), valueJson: 5 };
    }
    return answers;
  }

  beforeEach(() => {
    loadPhaseProgress.mockResolvedValue({ phases: [], currentPhaseKey: 'phase-1-current' });
  });

  it('does not offer the calendar until every area has a figure', async () => {
    readRunAnswers.mockResolvedValue({
      reclaim_current_hours__deep_work: { ...direct('5'), valueJson: 5 },
    });

    expect(await buildCoachPhaseContext('u1')).not.toContain('calendar branch is offered');
  });

  it('offers the calendar once they do, with the two questions to ask first', async () => {
    readRunAnswers.mockResolvedValue(everyAreaAnswered());

    const block = await buildCoachPhaseContext('u1');

    expect(block).toContain('calendar branch is offered');
    expect(block).toContain('reclaim_calendar_completeness');
    expect(block).toContain('reclaim_calendar_period');
    // Never the better option: the audit is worth doing without it.
    expect(block).toContain('optional');
  });

  it('stops asking the two questions once they have been answered', async () => {
    readRunAnswers.mockResolvedValue({
      ...everyAreaAnswered(),
      reclaim_calendar_completeness: direct('It holds about half of it'),
    });

    expect(await buildCoachPhaseContext('u1')).toContain('rather than asking again');
  });

  it('reads a reconciled calendar as information, never as a correction', async () => {
    readRunAnswers.mockResolvedValue({
      ...everyAreaAnswered(),
      reclaim_calendar_uploaded: { ...direct('Yes'), valueJson: true },
      reclaim_calendar_completeness: direct('Most meetings, no thinking time'),
    });

    const block = await buildCoachPhaseContext('u1');

    expect(block).toContain('never evidence that they were wrong');
    expect(block).toContain('Most meetings, no thinking time');
    // The offer is withdrawn once a calendar has been reconciled.
    expect(block).not.toContain('calendar branch is offered');
  });

  it('hands the coach the figures on the leader’s screen, and tells it to stop after one question', async () => {
    readRunAnswers.mockResolvedValue(everyAreaAnswered());

    const block = await buildCoachPhaseContext('u1');

    expect(block).toContain('per cent of the week');
    expect(block).toContain('Total: 40 hours a week.');
    expect(block).toContain('what stands out to you here?');
    expect(block).toContain('Do not interpret');
  });
});

/**
 * The gap lines refuse to invent arithmetic.
 *
 * A leader can answer "about ten-ish" to an ideal-hours question through the conversation, and the
 * typed-value rule only bites on the slots that declare a type. What must never happen is the coach
 * being handed a computed delta derived from a number nobody gave.
 */
describe('buildCoachPhaseContext — the gap refuses to compute what it was not given', () => {
  beforeEach(() => {
    loadPhaseProgress.mockResolvedValue({ phases: [], currentPhaseKey: 'phase-4-gap' });
  });

  it('reports an unusable ideal as what the leader said, with no delta', async () => {
    readRunAnswers.mockResolvedValue({
      reclaim_current_hours__deep_work: { ...direct('4'), valueJson: 4 },
      reclaim_ideal_hours__deep_work: direct('as much as I can get'),
    });

    const block = await buildCoachPhaseContext('u1');

    expect(block).toContain('ideal recorded as "as much as I can get"');
    expect(block).not.toContain('wanted,');
  });

  it('says no change rather than zero hours more', async () => {
    readRunAnswers.mockResolvedValue({
      reclaim_current_hours__deep_work: { ...direct('6'), valueJson: 6 },
      reclaim_ideal_hours__deep_work: { ...direct('6'), valueJson: 6 },
    });

    expect(await buildCoachPhaseContext('u1')).toContain('6h wanted, no change');
  });
});
