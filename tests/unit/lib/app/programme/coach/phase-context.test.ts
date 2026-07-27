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
    findFirst.mockResolvedValue({ id: 'run-1', coachOpenings: ['phase-1-chart-reveal'] });

    const block = await buildCoachPhaseContext('u1');

    expect(block).toContain('per cent of the week');
    expect(block).toContain('Total: 40 hours a week.');
    expect(block).toContain('what stands out to you here?');
    expect(block).toContain('Do not interpret');
  });

  /**
   * The reveal is the leader's to ask for (I12, I16), so the figures are in context before they press
   * the button — the coach must not spend them early. Asserting the refusal rather than the prose:
   * what matters is that nothing tells it to describe the picture or ask the question yet.
   */
  it('holds the question back while the leader has not asked to see the picture', async () => {
    readRunAnswers.mockResolvedValue(everyAreaAnswered());

    const block = await buildCoachPhaseContext('u1');

    expect(block).toContain('the button is theirs to press');
    expect(block).toContain('do not ask what stands out until they have');
    expect(block).not.toContain('Do not interpret');
  });

  /**
   * The defect this pair pins. The reflection used to be gated on "once the readings above are
   * captured", and phase 1's capture list holds a slot (`reclaim_current_deep_block_blocker`) that
   * only exists for a leader with *no* protected block — so for everyone else the list never
   * completed, the coach kept gathering, and the question the panel promises was never asked.
   */
  it('makes the reflection due the moment the picture has been seen, however much of the list is unfilled', async () => {
    readRunAnswers.mockResolvedValue(everyAreaAnswered());
    findFirst.mockResolvedValue({ id: 'run-1', coachOpenings: ['phase-1-chart-reveal'] });

    const block = await buildCoachPhaseContext('u1');

    expect(block).toContain('They have now seen the picture, so that moment is here');
    expect(block).toContain('Readings still missing are not a reason to hold it back');
    expect(block).not.toContain('Once the readings above are captured');
  });

  /**
   * Two failures pull against each other here and the wording has to hold both off. Gating the
   * reflection on a complete list deadlocks the phase (`reclaim_current_deep_block_blocker` never
   * arrives for a leader who has a block). Telling the coach the list does not matter licensed it to
   * skip two thirds of the phase. So: not a gate, and not permission to leave it unasked.
   */
  it('never gates a reflection on readings this leader will never have, without licensing a skip', async () => {
    readRunAnswers.mockResolvedValue(everyAreaAnswered());

    const block = await buildCoachPhaseContext('u1');

    expect(block).not.toContain('Once the readings above are captured');
    expect(block).toContain('Completing the list is not the condition for closing');
    expect(block).toContain('only ever apply to some leaders');
    // The other half, and the one that was missing.
    expect(block).toContain('a reading nobody asked about is not a reading that does not apply');
    expect(block).toContain('has not happened yet');
  });

  /**
   * The second beat of the reveal. The pause comes first (the source is explicit that the leader's own
   * noticing precedes any interpretation), and only once it is recorded does the coach give its
   * reading, offer to correct the figures, and say the phase can be left. Before that, none of it
   * appears — which is what keeps the two beats from collapsing into one turn.
   */
  /**
   * The accuracy check sits at the picture, not after it. Every bar was drawn from an estimate given
   * in conversation, so the one moment a leader can tell whether the numbers are right is the moment
   * they are drawn to scale — and everything downstream (the gap arithmetic, the ideal week, the
   * trends across audits) is built on them being right.
   */
  it('checks the figures are accurate at the picture, before asking what stands out', async () => {
    readRunAnswers.mockResolvedValue(everyAreaAnswered());
    findFirst.mockResolvedValue({ id: 'run-1', coachOpenings: ['phase-1-chart-reveal'] });

    const block = await buildCoachPhaseContext('u1');

    // The summary it is checking against.
    expect(block).toContain('Total: 40 hours a week.');
    // The check itself, and the slot family a correction is written back to.
    expect(block).toContain('does anything need changing');
    expect(block).toContain('reclaim_current_hours__');
    expect(block).toContain('supersedes the');
    // The pause still follows it, and the judgement still does not.
    expect(block).toContain('what stands out to you here?');
    expect(block).toContain('Their own noticing');
    expect(block).not.toContain('Judge the pattern, never the person');
    expect(block).not.toContain('they can move on to the next phase');
  });

  it('gives the reading and the way onward once the reflection is recorded', async () => {
    readRunAnswers.mockResolvedValue({
      ...everyAreaAnswered(),
      reclaim_reflection_p1: direct('I had no idea relationship building was eating the week.'),
    });
    findFirst.mockResolvedValue({ id: 'run-1', coachOpenings: ['phase-1-chart-reveal'] });

    const block = await buildCoachPhaseContext('u1');

    // The judgement, against the figures and the bands it was actually given.
    expect(block).toContain('Total: 40 hours a week.');
    expect(block).toContain('total-hours bands');
    expect(block).toContain('which areas sit away from the guide');
    expect(block).toContain('Judge the pattern, never the person');
    // A figure can still be corrected after the pause.
    expect(block).toContain('record it as above');
    // The way out of the phase.
    expect(block).toContain('they can move on to the next phase');
  });

  it('gives phase 1 the bands it needs to say anything about a weekly total', async () => {
    readRunAnswers.mockResolvedValue(everyAreaAnswered());

    expect(await buildCoachPhaseContext('u1')).toContain('total-hours bands');
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

/**
 * The two questions each area is owed.
 *
 * The source is exact: "explore each bucket in turn, one at a time, conversationally. For each bucket
 * ask: roughly how many hours per week …? What does that time actually look like in practice?"
 * (`sources/Time_Audit_Tool_Prompt_Text.md:119-122`). Handed to the coach as one flat list of
 * nineteen slugs, the second question never got asked: it took the eight figures, which are concrete
 * and typed and easy to close, and left all eight "in practice" readings empty. A leader reached the
 * end of Current reality with a chart and no account of what any of that time actually was.
 *
 * These pin the pairing, and the difference between a reading that does not apply and one nobody
 * asked — which is the distinction the earlier "an unfilled list is not a gate" guidance flattened.
 */
describe('buildCoachPhaseContext — the texture of an area, not only its hours', () => {
  beforeEach(() => {
    loadPhaseProgress.mockResolvedValue({ phases: [], currentPhaseKey: 'phase-1-current' });
  });

  it('asks the hours and what the time looks like in the same breath', async () => {
    readRunAnswers.mockResolvedValue({});

    const block = await buildCoachPhaseContext('u1');

    expect(block).toContain('ask two things in the');
    expect(block).toContain('what that time actually looks like in');
    expect(block).toContain('reclaim_current_detail__');
    // The failure mode, named so it cannot be rediscovered.
    expect(block).toContain('Do not move through all the areas for figures');
  });

  it('does not treat the detail as a follow-up that can wait', async () => {
    readRunAnswers.mockResolvedValue({});

    expect(await buildCoachPhaseContext('u1')).toContain('not a follow-up for later');
  });

  it('separates a reading that does not apply from one that was never asked', async () => {
    readRunAnswers.mockResolvedValue({});

    const block = await buildCoachPhaseContext('u1');

    expect(block).toContain('not apply to this leader');
    expect(block).toContain('a question you have not asked');
    // The guidance that let two thirds of the list be skipped must not survive verbatim.
    expect(block).not.toContain('an unfilled list is not a reason to hold this back');
  });

  it('offers what was never asked before the phase is called done', async () => {
    readRunAnswers.mockResolvedValue({});

    const block = await buildCoachPhaseContext('u1');

    expect(block).toContain('Before you say this phase is done');
    // One offer, not a grind: the leader keeps the right to decline.
    expect(block).toContain('take a no');
  });

  /**
   * After the reflection the coach gives its reading and points at the way onward. That beat used to
   * wave the unfilled readings through ("not worth holding them here for"), which is where the eight
   * missing ones were finally lost. It now names the specific gap: an area with a figure and nothing
   * else has not been explored.
   */
  it('comes back for an area that has a figure and nothing else, before pointing at the way onward', async () => {
    readRunAnswers.mockResolvedValue({
      ...(() => {
        const answers: Record<string, unknown> = {};
        for (const area of [
          'deep_work',
          'learning_development',
          'strategic_planning',
          'team_development',
          'organisational_oversight',
          'relationship_building',
          'delivery_operations',
          'recovery_white_space',
        ]) {
          answers[`reclaim_current_hours__${area}`] = { ...direct('5'), valueJson: 5 };
        }
        return answers;
      })(),
      reclaim_reflection_p1: direct('Relationship building is eating the week.'),
    });
    findFirst.mockResolvedValue({ id: 'run-1', coachOpenings: ['phase-1-chart-reveal'] });

    const block = await buildCoachPhaseContext('u1');

    expect(block).toContain('look at what this phase never asked');
    expect(block).toContain('an area has a figure and nothing else');
    expect(block).toContain('they can move on to the next phase');
    expect(block).not.toContain('is not worth holding them here');
  });
});
