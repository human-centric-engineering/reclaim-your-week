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
  // The shipped defaults, so every test below reads the behaviour a leader actually meets. The
  // non-default modes are exercised in their own describe rather than by moving this fixture.
  presentation: { lean: 'paraphrase' as const, overrides: {} },
  questioning: { pairing: 'paired' as const, opportunistic: true },
  strategyMirror: false,
};

import {
  buildCoachPhaseContext,
  pendingChoiceOffer,
} from '@/lib/app/programme/coach/phase-context';

const direct = (value: string) => ({
  value,
  valueJson: null,
  sourceType: 'direct',
  confidence: 10,
});

/**
 * Every visible area given an hours figure, with the named ones overridden.
 *
 * The chart beats gate on `chartRevealReady`, which needs a figure for every area, so a test about
 * one near-zero area still has to supply the other seven. Defaulting to 8 keeps those seven
 * comfortably inside their benchmarks, so only the overrides say anything.
 */
const areaHours = (overrides: Record<string, number> = {}) =>
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
    ].map((area) => {
      const value = overrides[area] ?? 8;
      return [
        `reclaim_current_hours__${area}`,
        { value: String(value), valueJson: value, sourceType: 'direct', confidence: 10 },
      ];
    })
  );

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

  /**
   * The three phases that had no method at all.
   *
   * `contentForPhase` branched on phase 1 and phase 4; `momentForPhase` branched on the same two. So
   * for energy, the ideal week and the action plan the entire behavioural instruction was the
   * worklist rule beneath the capture list — "ask about one or two of these at a time". A model given
   * a list of slugs and one rule about traversing it traverses the list, which is exactly what a
   * leader described as the questions getting boring.
   *
   * Phase 5 was the sharpest case: it is a `COACH_OPENING_PHASES` moment the client fires on arrival,
   * sending "open it the way your context describes" to a context that described nothing.
   */
  describe('the phases that had no method', () => {
    it('gives phase 2 its two questions and the opportunity it exists to name', async () => {
      loadPhaseProgress.mockResolvedValue({ phases: [], currentPhaseKey: 'phase-2-energy' });

      const block = await buildCoachPhaseContext('u1');

      // The signpost card already introduced the science, and cardLinesFor forbids restating a card.
      expect(block).toContain('do not explain it again');
      expect(block).toContain('reclaim_energy_peak_description');
      expect(block).toContain('reclaim_energy_protected');
      // The whole reason the phase exists, and the part that was missing.
      expect(block).toContain('one of the most');
      expect(block).toContain('significant opportunities available to them');
      expect(block).toContain('do not leave them to notice it themselves');
      // The distributed-team beat, and the slug that carries it across audits.
      expect(block).toContain('reclaim_profile_distributed_impact');
    });

    it('never wires the retired coaching signal into phase 2', async () => {
      // Decided at content-source.md: the sentence is written to the facilitator, so a leader reading
      // it reads a leaked prompt. Guarded in the source text by product-voice.test.ts; guarded here
      // in the assembled output, which is the thing that actually reaches anyone.
      loadPhaseProgress.mockResolvedValue({ phases: [], currentPhaseKey: 'phase-2-energy' });

      expect(await buildCoachPhaseContext('u1')).not.toContain('can go much further here');
    });

    it('gives phase 3 the framing and the four questions, ending on the one that gets skipped', async () => {
      loadPhaseProgress.mockResolvedValue({ phases: [], currentPhaseKey: 'phase-3-ideal' });

      const block = await buildCoachPhaseContext('u1');

      expect(block).toContain('a realistic target, not a fantasy');
      expect(block).toContain('reclaim_ideal_total_hours');
      expect(block).toContain('reclaim_ideal_hours__<area>');
      expect(block).toContain('reclaim_ideal_deep_block_when');
      expect(block).toContain('reclaim_ideal_protected_commitment');
      // A redesigned week is a wish; one commitment is something they can start on Monday.
      expect(block).toContain('the one that matters most and the one most easily skipped');
    });

    it('gives phase 5 three options, the specificity test, and the wanted-not-dutiful question', async () => {
      loadPhaseProgress.mockResolvedValue({ phases: [], currentPhaseKey: 'phase-5-action' });

      const block = await buildCoachPhaseContext('u1');

      expect(block).toContain('three options');
      expect(block).toContain('reclaim_action_options');
      // The calibration, verbatim. "Be specific" is advice every model agrees with and none act on.
      expect(block).toContain('non-negotiable deep work block, starting this week');
      // The three-part commitment, stated by the leader rather than summarised for them.
      expect(block).toContain('reclaim_action_chosen');
      expect(block).toContain('reclaim_action_stopping');
      // The second genuine challenge in the whole audit, which reached the model nowhere before.
      expect(block).toContain('or something you think you should?');
      expect(block).toContain('reclaim_action_wanted_not_dutiful');
      expect(block).toContain('better found now than');
      // And the close, from two constants that were authored and guarded and used by no prompt.
      expect(block).toContain('compound into transformation');
      expect(block).toContain('more true to what you are here to do');
    });

    it("builds phase 5's options from this leader's own figures, not from advice", async () => {
      loadPhaseProgress.mockResolvedValue({ phases: [], currentPhaseKey: 'phase-5-action' });
      readRunAnswers.mockResolvedValue({
        reclaim_current_hours__deep_work: {
          value: '4',
          valueJson: 4,
          sourceType: 'direct',
          confidence: 10,
        },
        reclaim_ideal_hours__deep_work: {
          value: '10',
          valueJson: 10,
          sourceType: 'direct',
          confidence: 10,
        },
        reclaim_energy_peak_description: direct('First thing, before the house wakes up.'),
        reclaim_ideal_protected_commitment: direct('One morning a week with nothing in it.'),
      });

      const block = await buildCoachPhaseContext('u1');

      // The same gap arithmetic phase 4 uses, because the options answer the same gap.
      expect(block).toContain('4h now, 10h wanted, 6h more');
      expect(block).toContain('"First thing, before the house wakes up."');
      // They have already said what would make the biggest difference.
      expect(block).toContain('"One morning a week with nothing in it."');
      expect(block).toContain('do not go looking for something cleverer');
    });

    it('says nothing about figures in phase 5 when the run holds none yet', async () => {
      loadPhaseProgress.mockResolvedValue({ phases: [], currentPhaseKey: 'phase-5-action' });
      readRunAnswers.mockResolvedValue({});

      const block = await buildCoachPhaseContext('u1');

      // The method still lands; only the data beat is absent, rather than an empty heading.
      expect(block).toContain('three options');
      expect(block).not.toContain('What the options have to be built from');
    });
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

    expect(block).toContain('section 2 of 6: Energy');
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
    // The two rules that replaced the blanket refusal: it is theirs to say, and it is theirs to
    // leave. The second is now stated as a prohibition rather than as a hand-off, because "leave the
    // move to them" was read as "tell them they may move", and the coach cannot see whether the
    // screen is offering it.
    expect(block).toContain('Never infer it');
    expect(block).toContain('do not invite them to move on');
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
    expect(block).toContain('section 6 of 6');
    expect(block).toContain('This is the close');
  });

  it('still builds when the leader has never relabelled anything', async () => {
    readBucketLabels.mockRejectedValue(new Error('label read failed'));

    expect(await buildCoachPhaseContext('u1')).toContain('section 2 of 6');
  });

  it('still builds when the signpost config cannot be read', async () => {
    // The cards are operator-editable config; a failed read must cost the coach a paragraph of
    // context, never a leader their turn.
    readSignposts.mockRejectedValue(new Error('config read failed'));

    expect(await buildCoachPhaseContext('u1')).toContain('section 2 of 6');
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

/**
 * The coach opens the phase, and closes every turn on something to answer.
 *
 * Both halves of the same complaint: a phase that introduced itself and then waited, and turns that
 * ended on an observation and left the leader working out what was wanted. The trigger carries the
 * "now" (`coach/opening.ts`); this block carries what an opening is *for*, which the trigger has no
 * room to say and the cache would not let it vary anyway.
 */
describe('buildCoachPhaseContext — who speaks first, and how a turn ends', () => {
  it('tells the coach the phase begins with it, and what the opening turn owes the leader', async () => {
    const block = await buildCoachPhaseContext('u1');

    expect(block).toContain('This phase begins with you, not with the leader');
    expect(block).toContain('why it is worth their time');
    expect(block).toContain('Then ask your first question');
    expect(block).toContain('waiting to be greeted');
  });

  it('asks for a question at the end of every turn, not only the first', async () => {
    // "Something to answer or to do" was wide enough to be satisfied by "if there is anything else
    // you would like to add, feel free", which is the turn that left a leader with two readings
    // outstanding and nothing to answer. It is a question now, and a named one.
    const block = await buildCoachPhaseContext('u1');

    expect(block).toContain('End every turn with a question');
    expect(block).toContain('about a named reading from the list');
    expect(block).toContain('Never end on an');
  });

  it('refuses the open invitation and the announcement that a phase is done', async () => {
    const block = await buildCoachPhaseContext('u1');

    expect(block).toContain('anything else they');
    expect(block).toContain('ask for it by name');
    expect(block).toContain('do not tell them the phase is finished');
    expect(block).toContain('their screen offers it at the moment it becomes true');
  });

  it('says that a sentence about recording is not a recording', async () => {
    // Observed on a live audit: the coach replied "I'll record that you're the Head of Engineering,
    // overseeing 25 people across 5 teams" and made no call at all, so the panel beside the leader
    // stayed at nought of fifteen while the transcript said the opposite. The system prompt told it
    // to record silently; nothing told it that narrating is not recording.
    const block = await buildCoachPhaseContext('u1');

    expect(block).toContain('Recording is a tool call and it is never a sentence');
    expect(block).toContain('make the call instead');
  });

  it('tells the summary phase to open itself, and to open it by asking', async () => {
    // **This asserted the opposite until F16 t-3**, on the reasoning that phase 6's takeaway is asked
    // on the screen because a reflection is the leader's to write (I6). P19 reversed that refusal on
    // 2026-07-27 and three artefacts kept citing it: `opening.ts`'s comment, the arrivals test, and
    // this. The last textarea in a tool rebuilt as a conversation survived in the gap between them.
    //
    // The instruction to ask was already there and had no moment to fire it, which is the shape of
    // nearly everything the execution-path audit found.
    loadPhaseProgress.mockResolvedValue({ phases: [], currentPhaseKey: 'phase-6-summary' });

    const block = await buildCoachPhaseContext('u1');
    expect(block).toContain('This phase begins with you');
    // And what it opens with: the question, once, recorded in their words and never inferred.
    expect(block).toContain('They have not yet said what they are taking away');
    expect(block).toContain('reclaim_reflection_p6');
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
    // And the way out of the phase is not the coach's to announce. It used to end this beat by
    // telling the leader they could move on whenever they were ready, on a turn where the screen may
    // still have been showing what was left to cover.
    expect(block).toContain('Do not tell them they can move on');
    expect(block).not.toContain('The button');
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

  /**
   * The capture list stopped being a flat checklist of slugs.
   *
   * Two changes, and they answer the same complaint. Readings that are one question are grouped as
   * one question, because asked separately the figure arrives and the texture quietly never does.
   * And the list stops presenting itself as a running order, because a coach that finishes its
   * current area no matter what the leader has just opened up is a form with a nicer voice.
   */
  describe('the list as a checklist of what is outstanding, not a script', () => {
    it('groups an area with its texture reading as a single question, in order', async () => {
      readRunAnswers.mockResolvedValue({});

      const block = await buildCoachPhaseContext('u1');

      expect(block).toContain('- Ask these as one question, in this order:');
      expect(block).toContain(
        '  - reclaim_current_hours__deep_work: not yet captured in this audit. Deep work, hours a week (needs a figure)'
      );
      expect(block).toContain('  - reclaim_current_detail__deep_work: not yet captured');
      // And the follower is not also listed again at its own place in the list.
      expect(block).not.toContain('\n- reclaim_current_detail__deep_work:');
    });

    it('tells the coach to ask a grouped pair in one breath, and why', async () => {
      readRunAnswers.mockResolvedValue({});

      const block = await buildCoachPhaseContext('u1');

      expect(block).toContain('ask them as one question, in one breath');
      expect(block).toContain('figure closes cleanly and a description always feels like it can');
    });

    it('lists the readings singly when the operator has turned pairing off', async () => {
      readRunAnswers.mockResolvedValue({});
      readCoachContent.mockResolvedValue({
        ...content,
        questioning: { pairing: 'one-at-a-time', opportunistic: true },
      });

      const block = await buildCoachPhaseContext('u1');

      expect(block).not.toContain('Ask these as one question');
      expect(block).toContain('- reclaim_current_hours__deep_work: not yet captured');
      expect(block).toContain('- reclaim_current_detail__deep_work: not yet captured');
    });

    it('says the order is not a running order, and to follow the leader off it', async () => {
      readRunAnswers.mockResolvedValue({});

      const block = await buildCoachPhaseContext('u1');

      expect(block).toContain('The order here is not a running order');
      expect(block).toContain('go there while it is live and ask it then');
      // The reason it is safe to leave the order: the list itself is what stops the coach losing
      // its place, which is why this instruction lives beside the list and not in the persona.
      expect(block).toContain('cannot lose your place');
    });

    it('keeps a fixed order when the operator has turned opportunism off', async () => {
      readRunAnswers.mockResolvedValue({});
      readCoachContent.mockResolvedValue({
        ...content,
        questioning: { pairing: 'paired', opportunistic: false },
      });

      expect(await buildCoachPhaseContext('u1')).not.toContain('not a running order');
    });

    it('marks a reading that does not apply as complete, rather than leaving it outstanding', async () => {
      // A leader who HAS a protected block is never asked what gets in its way. That slug used to sit
      // on the list as "not yet captured" forever, which is what made the list unfinishable.
      readRunAnswers.mockResolvedValue({
        reclaim_current_deep_block_exists: {
          value: 'Yes',
          valueJson: true,
          sourceType: 'direct',
          confidence: 10,
        },
      });

      const block = await buildCoachPhaseContext('u1');

      expect(block).toContain(
        '- reclaim_current_deep_block_blocker: does not apply to this leader, so it is complete as it stands. Do not ask it.'
      );
      // Its sibling, which applies to exactly the other leader, is still outstanding and still paired.
      expect(block).toContain('  - reclaim_current_deep_block_when: not yet captured');
    });

    it('leaves a conditional reading outstanding while its condition is unanswered', async () => {
      readRunAnswers.mockResolvedValue({});

      const block = await buildCoachPhaseContext('u1');

      // Not "does not apply": nobody has asked whether they have a block, so nothing is known yet.
      expect(block).toContain('- reclaim_current_deep_block_blocker: not yet captured');
      expect(block).not.toContain('reclaim_current_deep_block_blocker: does not apply');
    });
  });

  /**
   * Three fixes that share one root: prior answers were reaching the coach, but not always *this*
   * run's, and not always in a form it could act on.
   */
  describe('what this audit already holds, and what it is missing', () => {
    it('carries the earlier phases forward, from this run rather than from undated heads', async () => {
      loadPhaseProgress.mockResolvedValue({ phases: [], currentPhaseKey: 'phase-3-ideal' });
      readRunAnswers.mockResolvedValue({
        reclaim_setup_weekly_hours: {
          value: '58',
          valueJson: 58,
          sourceType: 'direct',
          confidence: 10,
        },
        reclaim_energy_peak_description: direct('Early, before the inbox opens.'),
      });

      const block = await buildCoachPhaseContext('u1');

      expect(block).toContain('What this audit has already established');
      expect(block).toContain('- Your weekly hours: 58');
      expect(block).toContain('- When you are at your best: Early, before the inbox opens.');
      // The whole point: the framework's module context injects cross-run heads, so the coach has to
      // be told which of the two it is reading.
      expect(block).toContain('none of it from any earlier one');
    });

    it('says nothing about earlier phases on the first phase, or when they captured nothing', async () => {
      loadPhaseProgress.mockResolvedValue({ phases: [], currentPhaseKey: 'phase-3-ideal' });
      readRunAnswers.mockResolvedValue({});

      expect(await buildCoachPhaseContext('u1')).not.toContain(
        'What this audit has already established'
      );
    });

    it('names an area that is near zero, not only one that is exactly zero', async () => {
      // The Brief says "if a category is NEAR zero". `ChartData.unallocated` is `hours === 0`, so an
      // hour of recovery in a full week was invisible to the beat written for exactly that leader.
      loadPhaseProgress.mockResolvedValue({ phases: [], currentPhaseKey: 'phase-1-current' });
      findFirst.mockResolvedValue({ id: 'run-1', coachOpenings: ['phase-1-chart-reveal'] });
      readRunAnswers.mockResolvedValue({
        ...areaHours({ deep_work: 1, recovery_white_space: 1 }),
        // Deep work is the one area the content gives no percentage range to ("measured by presence
        // of protected blocks"), so the percentage rule can never reach it. The signal the content
        // itself nominates is this one.
        reclaim_current_deep_block_exists: {
          value: 'No',
          valueJson: false,
          sourceType: 'direct',
          confidence: 10,
        },
      });

      const block = await buildCoachPhaseContext('u1');

      expect(block).toContain('At or near nothing this period');
      // The Brief singles these two out, and names recovery first.
      expect(block).toMatch(/At or near nothing this period: Recovery & white space, Deep work/);
      // Named as something the week took, never as a discipline problem (I17).
      expect(block).toContain('not somewhere they chose');
    });

    it('leaves deep work out of the absence list when the leader does have a protected block', async () => {
      // The other half of the deep-work rule. Its hours can be low without its absence being the
      // thing to wonder about, because the content measures it by protected blocks and not by share
      // of the week — so a leader with a block and few hours is not the leader this beat is for.
      loadPhaseProgress.mockResolvedValue({ phases: [], currentPhaseKey: 'phase-1-current' });
      findFirst.mockResolvedValue({ id: 'run-1', coachOpenings: ['phase-1-chart-reveal'] });
      readRunAnswers.mockResolvedValue({
        ...areaHours({ deep_work: 1, recovery_white_space: 1 }),
        reclaim_current_deep_block_exists: {
          value: 'Yes',
          valueJson: true,
          sourceType: 'direct',
          confidence: 10,
        },
      });

      const block = await buildCoachPhaseContext('u1');

      expect(block).toMatch(/At or near nothing this period: Recovery & white space\./);
    });

    it('quotes the gap refer-back from this run, rather than deferring to context', async () => {
      loadPhaseProgress.mockResolvedValue({ phases: [], currentPhaseKey: 'phase-4-gap' });
      readRunAnswers.mockResolvedValue({
        reclaim_current_hours__deep_work: {
          value: '4',
          valueJson: 4,
          sourceType: 'direct',
          confidence: 10,
        },
        reclaim_ideal_hours__deep_work: {
          value: '10',
          valueJson: 10,
          sourceType: 'direct',
          confidence: 10,
        },
        reclaim_setup_keeping_me_up: direct('That none of it holds without me.'),
      });

      const block = await buildCoachPhaseContext('u1');

      expect(block).toContain('from this audit and not an earlier one');
      expect(block).toContain('"That none of it holds without me."');
      // The instruction that used to point at the framework's cross-run heads is gone.
      expect(block).not.toContain('are elsewhere in your context');
    });

    it('puts their priorities next to the areas with no time, and leaves the join to the coach', async () => {
      loadPhaseProgress.mockResolvedValue({ phases: [], currentPhaseKey: 'phase-4-gap' });
      readRunAnswers.mockResolvedValue({
        ...areaHours({ deep_work: 4, recovery_white_space: 0 }),
        reclaim_ideal_hours__deep_work: {
          value: '10',
          valueJson: 10,
          sourceType: 'direct',
          confidence: 10,
        },
        reclaim_setup_priorities: direct('Grow the fellowship, and hand over delivery.'),
      });

      const block = await buildCoachPhaseContext('u1');

      expect(block).toContain('"Grow the fellowship, and hand over delivery."');
      expect(block).toContain('reclaim_gap_unfunded_priorities');
      expect(block).toContain('name it as theirs');
      // No attempt to compute the join: free-text priorities have no bucket mapping.
      expect(block).toContain('Say which of their own priorities');
    });
  });

  /**
   * The phase-3 challenge. Specified in the source, slotted, and until now wired to nothing.
   */
  describe('the ideal week that has not moved', () => {
    /** Both weeks, with the named areas overridden on each side. */
    const bothWeeks = (current: Record<string, number>, ideal: Record<string, number>) => {
      const out: Record<string, unknown> = {};
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
        const now = current[area] ?? 5;
        const want = ideal[area] ?? 5;
        out[`reclaim_current_hours__${area}`] = {
          value: String(now),
          valueJson: now,
          sourceType: 'direct',
          confidence: 10,
        };
        out[`reclaim_ideal_hours__${area}`] = {
          value: String(want),
          valueJson: want,
          sourceType: 'direct',
          confidence: 10,
        };
      }
      return out;
    };

    it('puts the two weeks side by side once the ideal week is complete', async () => {
      loadPhaseProgress.mockResolvedValue({ phases: [], currentPhaseKey: 'phase-3-ideal' });
      readRunAnswers.mockResolvedValue(bothWeeks({ deep_work: 4 }, { deep_work: 12 }));

      const block = await buildCoachPhaseContext('u1');

      expect(block).toContain('The week they have just designed, next to the one they described');
      expect(block).toContain('4h now, 12h wanted, 8h more');
    });

    it('challenges a week that came back looking like the current one, with the figures', async () => {
      loadPhaseProgress.mockResolvedValue({ phases: [], currentPhaseKey: 'phase-3-ideal' });
      readRunAnswers.mockResolvedValue(
        bothWeeks(
          { delivery_operations: 30, recovery_white_space: 1 },
          { delivery_operations: 29, recovery_white_space: 1 }
        )
      );

      const block = await buildCoachPhaseContext('u1');

      // The source's own sentence, verbatim from the constant.
      expect(block).toContain('suspiciously similar to their current reality');
      // And the specific evidence, because a vague challenge can be put down and a numbered one cannot.
      expect(block).toContain('above its guide in both weeks');
      expect(block).toContain('near nothing in both weeks');
      // Curiosity, not verdict (I16/I17).
      expect(block).toContain('what would have to be true');
      expect(block).toContain('that is a');
      expect(block).toContain('real answer');
    });

    it('says nothing while the ideal week is still half built', async () => {
      loadPhaseProgress.mockResolvedValue({ phases: [], currentPhaseKey: 'phase-3-ideal' });
      const answers = bothWeeks({}, {});
      delete answers['reclaim_ideal_hours__team_development'];
      readRunAnswers.mockResolvedValue(answers);

      const block = await buildCoachPhaseContext('u1');

      // Would otherwise fire on the first turn of every phase 3, because an unbuilt week is all zeroes.
      expect(block).not.toContain('The week they have just designed');
      expect(block).not.toContain('suspiciously similar');
      // The method is still there; only the data beat is absent.
      expect(block).toContain('a realistic target, not a fantasy');
    });

    it('does not challenge a week that genuinely changed', async () => {
      loadPhaseProgress.mockResolvedValue({ phases: [], currentPhaseKey: 'phase-3-ideal' });
      readRunAnswers.mockResolvedValue(
        bothWeeks(
          { delivery_operations: 30, deep_work: 2, recovery_white_space: 1 },
          { delivery_operations: 8, deep_work: 14, recovery_white_space: 9 }
        )
      );

      const block = await buildCoachPhaseContext('u1');

      expect(block).toContain('The week they have just designed');
      expect(block).not.toContain('suspiciously similar');
    });

    it('stops challenging once the phase reflection is recorded', async () => {
      // The challenge belongs before the pause, not after it. Re-offering it once the leader has said
      // what they notice is arguing with them.
      loadPhaseProgress.mockResolvedValue({ phases: [], currentPhaseKey: 'phase-3-ideal' });
      readRunAnswers.mockResolvedValue({
        ...bothWeeks({ delivery_operations: 30 }, { delivery_operations: 29 }),
        reclaim_reflection_p3: direct('It looks like I did not really let myself imagine it.'),
      });

      const block = await buildCoachPhaseContext('u1');

      expect(block).not.toContain('suspiciously similar');
      // The comparison itself stays: it is information, not a challenge.
      expect(block).toContain('The week they have just designed');
    });
  });

  /**
   * The gap phase's three beats that were specified, slotted, and wired to nothing.
   */
  describe('the one challenge, the mirror, and the hours question', () => {
    const gapAnswers = (extra: Record<string, unknown> = {}) => ({
      reclaim_current_hours__deep_work: {
        value: '4',
        valueJson: 4,
        sourceType: 'direct',
        confidence: 10,
      },
      reclaim_ideal_hours__deep_work: {
        value: '10',
        valueJson: 10,
        sourceType: 'direct',
        confidence: 10,
      },
      ...extra,
    });

    it('offers the permission challenge, and makes it wait for an answer', async () => {
      loadPhaseProgress.mockResolvedValue({ phases: [], currentPhaseKey: 'phase-4-gap' });
      readRunAnswers.mockResolvedValue(gapAnswers());

      const block = await buildCoachPhaseContext('u1');

      // The Brief's sentence, verbatim, scarcity included — the "once per audit" is the mechanism.
      expect(block).toContain('May I offer a challenge?');
      expect(block).toContain('Once per audit, no more');
      // Asking and answering yourself is not permission.
      expect(block).toContain('stop and wait for their');
      expect(block).toContain('Asking and answering yourself is not permission');
      // A decline is an answer, and is still recorded as offered.
      expect(block).toContain('A decline is recorded as offered');
      expect(block).toContain('reclaim_gap_challenge_offered');
    });

    it('does not offer a second challenge once one has been spent', async () => {
      loadPhaseProgress.mockResolvedValue({ phases: [], currentPhaseKey: 'phase-4-gap' });
      readRunAnswers.mockResolvedValue(
        gapAnswers({
          reclaim_gap_challenge_offered: {
            value: 'Yes',
            valueJson: true,
            sourceType: 'direct',
            confidence: 10,
          },
          reclaim_gap_challenge_response: direct('That landed. I have been avoiding it.'),
        })
      );

      const block = await buildCoachPhaseContext('u1');

      expect(block).toContain('has already been offered, so do not offer another');
      expect(block).toContain('"That landed. I have been avoiding it."');
      expect(block).not.toContain('May I offer a challenge?');
    });

    it('suppresses the conversational challenge for a leader who met it on the form', async () => {
      // The guard lives in the slot rather than in either surface's bookkeeping, which is the whole
      // reason it is a slot: `phase4-panel.tsx` writes it on save, so one challenge per audit holds
      // across both paths. A run-ledger moment could not have done this.
      loadPhaseProgress.mockResolvedValue({ phases: [], currentPhaseKey: 'phase-4-gap' });
      readRunAnswers.mockResolvedValue(
        gapAnswers({
          reclaim_gap_challenge_offered: {
            value: 'Yes',
            valueJson: true,
            sourceType: 'direct',
            confidence: 10,
          },
        })
      );

      expect(await buildCoachPhaseContext('u1')).not.toContain('May I offer a challenge?');
    });

    it('warns the coach off repeating the challenge phase 3 already made', async () => {
      loadPhaseProgress.mockResolvedValue({ phases: [], currentPhaseKey: 'phase-4-gap' });
      readRunAnswers.mockResolvedValue({
        // An ideal week identical to the current one, complete across every visible area, plus a
        // phase-3 reflection — so that challenge is known to have fired.
        ...Object.fromEntries(
          [
            'deep_work',
            'learning_development',
            'strategic_planning',
            'team_development',
            'organisational_oversight',
            'relationship_building',
            'delivery_operations',
            'recovery_white_space',
          ].flatMap((area) => [
            [
              `reclaim_current_hours__${area}`,
              { value: '6', valueJson: 6, sourceType: 'direct', confidence: 10 },
            ],
            [
              `reclaim_ideal_hours__${area}`,
              { value: '6', valueJson: 6, sourceType: 'direct', confidence: 10 },
            ],
          ])
        ),
        reclaim_reflection_p3: direct('Not much moved, did it.'),
      });

      const block = await buildCoachPhaseContext('u1');

      expect(block).toContain('Do not make the same observation twice');
    });

    it('names the hours themselves when the total is in the unsustainable band', async () => {
      loadPhaseProgress.mockResolvedValue({ phases: [], currentPhaseKey: 'phase-4-gap' });
      readRunAnswers.mockResolvedValue(
        gapAnswers({
          reclaim_setup_weekly_hours: {
            value: '60',
            valueJson: 60,
            sourceType: 'direct',
            confidence: 10,
          },
        })
      );

      const block = await buildCoachPhaseContext('u1');

      // Derived from `hourBands`, which is already operator-editable, rather than a hardcoded 55.
      expect(block).toContain('the most strategic thing a leader can do is stop');
    });

    it('leaves the hours question alone below the band', async () => {
      loadPhaseProgress.mockResolvedValue({ phases: [], currentPhaseKey: 'phase-4-gap' });
      readRunAnswers.mockResolvedValue(
        gapAnswers({
          reclaim_setup_weekly_hours: {
            value: '42',
            valueJson: 42,
            sourceType: 'direct',
            confidence: 10,
          },
        })
      );

      expect(await buildCoachPhaseContext('u1')).not.toContain(
        'the most strategic thing a leader can do is stop'
      );
    });

    it('offers the strategy mirror only when the operator has it on', async () => {
      loadPhaseProgress.mockResolvedValue({ phases: [], currentPhaseKey: 'phase-4-gap' });
      readRunAnswers.mockResolvedValue(gapAnswers());

      // Off by config: the source hedges its placement as Rashmir's call, so the seam is hers.
      expect(await buildCoachPhaseContext('u1')).not.toContain('If a stranger read your calendar');

      readCoachContent.mockResolvedValue({ ...content, strategyMirror: true });
      const block = await buildCoachPhaseContext('u1');

      expect(block).toContain('If a stranger read your calendar');
      expect(block).toContain('reclaim_gap_strategy_mirror');
      // An offer, so it keeps the offer tier's rule.
      expect(block).toContain('do not return to it');
    });
  });

  /**
   * The last thing the list could not say: which captured readings are actually finished.
   *
   * Everything the audit knows came back as `captured as "…"`, so a four-line account and the word
   * "meetings" looked identical, and `confidence 4, inferred` was rendered and then acted on by
   * nothing. Landing last is deliberate: once phases 2, 3 and 5 have a method, "short" reads as *go
   * deeper here*; before that it read as *fill this in better*, which is optimising the checklist
   * rather than replacing it.
   */
  describe('readings that are captured and still owed a turn', () => {
    it('marks a texture reading that came back as a note', async () => {
      loadPhaseProgress.mockResolvedValue({ phases: [], currentPhaseKey: 'phase-1-current' });
      readRunAnswers.mockResolvedValue({
        reclaim_current_detail__deep_work: direct('Meetings mostly.'),
      });

      const block = await buildCoachPhaseContext('u1');

      expect(block).toContain(
        'captured as "Meetings mostly." (direct, confidence 10), and short. Deep work, in practice'
      );
      expect(block).toContain('A short answer is not a bad answer');
      expect(block).toContain('go back once to one or two of the short ones');
    });

    it('marks an inference the leader has not seen, and says what to do with it', async () => {
      loadPhaseProgress.mockResolvedValue({ phases: [], currentPhaseKey: 'phase-2-energy' });
      readRunAnswers.mockResolvedValue({
        reclaim_energy_protected: {
          value: 'Their peak hours go on standups.',
          valueJson: null,
          sourceType: 'inferred',
          confidence: 5,
        },
      });

      const block = await buildCoachPhaseContext('u1');

      expect(block).toContain('(inferred, confidence 5), not yet confirmed.');
      // The honesty obligation: the audit currently claims something nobody said.
      expect(block).toContain('the audit currently claims something they have not said');
      expect(block).toContain('offer the unconfirmed ones back');
    });

    it('caps the short flags, so a phase never becomes an interview', async () => {
      // This cap is what actually holds the restraint rule up. A coach shown eleven short readings
      // and told to go back for them is conducting an interview, whatever the wording says.
      loadPhaseProgress.mockResolvedValue({ phases: [], currentPhaseKey: 'phase-1-current' });
      readRunAnswers.mockResolvedValue(
        Object.fromEntries(
          [
            'deep_work',
            'learning_development',
            'strategic_planning',
            'team_development',
            'organisational_oversight',
            'relationship_building',
          ].map((area) => [`reclaim_current_detail__${area}`, direct('Meetings.')])
        )
      );

      const block = await buildCoachPhaseContext('u1');

      expect(block.match(/, and short\./g) ?? []).toHaveLength(3);
    });

    it('says nothing about short or unconfirmed readings when there are none', async () => {
      // A paragraph about what to do with short readings, printed for a phase that has none, is an
      // invitation to go looking for one.
      loadPhaseProgress.mockResolvedValue({ phases: [], currentPhaseKey: 'phase-1-current' });
      readRunAnswers.mockResolvedValue({
        reclaim_current_detail__deep_work: direct(
          'Board papers, mostly, and it always slides to the evening because the day fills up.'
        ),
      });

      const block = await buildCoachPhaseContext('u1');

      expect(block).not.toContain('A short answer is not a bad answer');
      expect(block).not.toContain(', and short.');
    });

    it('never flags a typed reading, or one a short answer completes', async () => {
      loadPhaseProgress.mockResolvedValue({ phases: [], currentPhaseKey: 'phase-0-setup' });
      readRunAnswers.mockResolvedValue({
        reclaim_setup_weekly_hours: {
          value: '58',
          valueJson: 58,
          sourceType: 'direct',
          confidence: 10,
        },
        reclaim_profile_first_name: direct('Rashmir'),
      });

      const block = await buildCoachPhaseContext('u1');

      expect(block).toContain('captured as "58" (direct, confidence 10). Your weekly hours');
      expect(block).toContain('captured as "Rashmir" (direct, confidence 10). Your first name');
    });
  });

  it('separates a reading that does not apply from one that was never asked', async () => {
    readRunAnswers.mockResolvedValue({});

    const block = await buildCoachPhaseContext('u1');

    expect(block).toContain('not apply to this leader');
    expect(block).toContain('a question you have not asked');
    // The guidance that let two thirds of the list be skipped must not survive verbatim.
    expect(block).not.toContain('an unfilled list is not a reason to hold this back');
  });

  it('turns what was never asked into the next question rather than a closing summary', async () => {
    readRunAnswers.mockResolvedValue({});

    const block = await buildCoachPhaseContext('u1');

    expect(block).toContain('there is always a next question, and it comes from this list');
    expect(block).toContain('Your job is the next question');
  });

  /**
   * The restraint rule and the capture rule are two different rules about two different beats, and
   * the product had been applying the first to the second. `Time_Audit_Tool_Prompt_Text.md:35` opens
   * by naming its own scope ("at key moments, particularly after presenting the Phase 1 visual and
   * after the gap analysis, ask the client what they are noticing") before it says not to probe
   * repeatedly, so it governs the reflection pause. `:119-122` governs capture and gives no opt-out.
   *
   * These four assertions are the guard on that distinction, because it is the one a future edit is
   * most likely to flatten back into a single rule — in either direction.
   */
  it('presses on the phase readings while still taking a no on anything merely offered', async () => {
    // Every area answered, so the calendar branch renders and both tiers are in one block — which is
    // the state that matters: the two rules have to read as different rules side by side.
    readRunAnswers.mockResolvedValue(
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
        ].map((area) => [
          `reclaim_current_hours__${area}`,
          { value: '5', valueJson: 5, sourceType: 'direct', confidence: 10 },
        ])
      )
    );

    const block = await buildCoachPhaseContext('u1');

    // An offer stays an offer, and gains an explicit "do not circle back".
    expect(block).toContain('take no for an answer without persuading');
    expect(block).toContain('do not return to it');
    // A central reading gets one genuine second pass.
    expect(block).toContain('ask again in different words');
    // Bounded, in the same paragraph rather than left to the system prompt: I18's rule that a leader
    // sitting with something is not someone to press, and a hard cap of one.
    expect(block).toContain('still sitting with');
    expect(block).toContain('Once each');
    // And the older, flatter instruction must not come back alongside it.
    expect(block).not.toContain('One offer, in their own language, take a no');
  });

  /**
   * After the reflection the coach gives its reading and then goes back for what the phase never
   * asked. That beat used to wave the unfilled readings through ("not worth holding them here for"),
   * which is where the eight missing ones were finally lost, and it then pointed at the button. It
   * now names the specific gap (an area with a figure and nothing else has not been explored) and
   * leaves the way onward to the screen that can actually see whether it is there.
   */
  it('comes back for an area that has a figure and nothing else, and leaves the way onward alone', async () => {
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
    expect(block).toContain('Do not tell them they can move on');
    expect(block).not.toContain('is not worth holding them here');
  });
});

/**
 * The named next question.
 *
 * Every assertion here exists because the prose alone did not hold. The block already said, in three
 * separate places, that every turn ends with a question drawn from the capture list; the coach was
 * observed at phase 0 with three readings outstanding ending on "if there is anything else you would
 * like to add or clarify, feel free to do so" anyway, twice in one conversation. So the choice is made
 * in code and the slug is handed over. What these tests guard is that the choice is *made* and that it
 * is the right reading: a selection that silently returns nothing puts the coach back where it was,
 * and it would still pass every assertion about the prose above.
 */
describe('the question the turn ends with, chosen rather than described', () => {
  beforeEach(() => {
    loadPhaseProgress.mockResolvedValue({ phases: [], currentPhaseKey: 'phase-0-setup' });
  });

  it('names the first outstanding reading by slug, so there is nothing to work out', async () => {
    readRunAnswers.mockResolvedValue({ reclaim_profile_first_name: direct('John') });

    const block = await buildCoachPhaseContext('u1');

    expect(block).toContain(
      'Your role (reclaim_profile_role), which nobody has asked in this audit yet'
    );
    expect(block).toContain('no turn can end without one');
  });

  it('names the pair as one question where the outstanding reading is an anchor', async () => {
    // Everything before the transition question answered, so the anchor of a phase-0 pair is next.
    readRunAnswers.mockResolvedValue({
      reclaim_profile_first_name: direct('John'),
      reclaim_profile_role: direct('Head of Engineering'),
      reclaim_profile_org_type: direct('SaaS'),
      reclaim_profile_direct_reports: { ...direct('25'), valueJson: 25 },
      reclaim_profile_distributed_team: { ...direct('Yes'), valueJson: true },
      reclaim_profile_distributed_impact: direct(
        'I waste time travelling between the two offices.'
      ),
    });

    const block = await buildCoachPhaseContext('u1');

    expect(block).toContain('In a period of change (reclaim_setup_in_transition)');
    expect(block).toContain(
      'together with What the change is (reclaim_setup_transition_detail), in that order'
    );
  });

  /**
   * The exact state in the screenshot that prompted this: the leader had said change is a constant,
   * so `reclaim_setup_transition_detail` applies and is outstanding, and the coach wound down instead
   * of asking it. A follower whose anchor is already captured is not skipped by the selection.
   */
  it('reaches a follower whose anchor is already captured', async () => {
    readRunAnswers.mockResolvedValue({
      reclaim_profile_first_name: direct('John'),
      reclaim_profile_role: direct('Head of Engineering'),
      reclaim_profile_org_type: direct('SaaS'),
      reclaim_profile_direct_reports: { ...direct('25'), valueJson: 25 },
      reclaim_profile_distributed_team: { ...direct('Yes'), valueJson: true },
      reclaim_profile_distributed_impact: direct(
        'I waste time travelling between the two offices.'
      ),
      reclaim_setup_in_transition: { ...direct('Change is a constant'), valueJson: true },
    });

    const block = await buildCoachPhaseContext('u1');

    expect(block).toContain('What the change is (reclaim_setup_transition_detail)');
  });

  it('never names a reading that does not apply to this leader', async () => {
    // Fundraising is not part of the role, so its follow-on is settled rather than outstanding.
    readRunAnswers.mockResolvedValue({
      reclaim_profile_first_name: direct('John'),
      reclaim_profile_role: direct('Head of Engineering'),
      reclaim_profile_org_type: direct('SaaS'),
      reclaim_profile_direct_reports: { ...direct('25'), valueJson: 25 },
      reclaim_profile_distributed_team: { ...direct('No'), valueJson: false },
      reclaim_setup_in_transition: { ...direct('No'), valueJson: false },
      reclaim_setup_fundraising_relevant: { ...direct('No'), valueJson: false },
    });

    const block = await buildCoachPhaseContext('u1');

    expect(block).not.toContain(
      'Development team, or you (reclaim_setup_fundraising_support), which nobody has asked'
    );
    // The two conditional followers are settled, so the next unasked reading is the weekly hours.
    expect(block).toContain('Your weekly hours (reclaim_setup_weekly_hours)');
  });

  /**
   * With nothing outstanding the coach used to have nothing to ask, which is precisely the turn that
   * produced the open invitation. An inference the leader has never seen outranks a short answer:
   * an unconfirmed reading means the audit currently claims something they did not say.
   */
  it('falls back to an unconfirmed inference, and prefers it to a short answer', async () => {
    readRunAnswers.mockResolvedValue({
      reclaim_profile_first_name: direct('John'),
      reclaim_profile_role: direct('Head of Engineering'),
      reclaim_profile_org_type: direct('SaaS'),
      reclaim_profile_direct_reports: { ...direct('25'), valueJson: 25 },
      reclaim_profile_distributed_team: { ...direct('No'), valueJson: false },
      reclaim_setup_in_transition: { ...direct('No'), valueJson: false },
      reclaim_setup_fundraising_relevant: { ...direct('No'), valueJson: false },
      reclaim_setup_weekly_hours: { ...direct('80'), valueJson: 80 },
      // Short, and earlier in the list than the inference below.
      reclaim_setup_priorities: direct('Growth.'),
      reclaim_setup_keeping_me_up: {
        value: 'The board.',
        valueJson: null,
        sourceType: 'inferred',
        confidence: 4,
      },
      reclaim_setup_why_now: direct('Because the year has got away from me entirely.'),
      reclaim_setup_audit_period: direct('Last month'),
    });

    const block = await buildCoachPhaseContext('u1');

    expect(block).toContain(
      'What is keeping you up (reclaim_setup_keeping_me_up), which this audit currently holds as "The board." and which they have never confirmed'
    );
    expect(block).toContain('Offer your reading of it back in your own words');
  });

  it('goes back for a short reading when nothing is outstanding or unconfirmed', async () => {
    readRunAnswers.mockResolvedValue({
      reclaim_profile_first_name: direct('John'),
      reclaim_profile_role: direct('Head of Engineering'),
      reclaim_profile_org_type: direct('SaaS'),
      reclaim_profile_direct_reports: { ...direct('25'), valueJson: 25 },
      reclaim_profile_distributed_team: { ...direct('No'), valueJson: false },
      reclaim_setup_in_transition: { ...direct('No'), valueJson: false },
      reclaim_setup_fundraising_relevant: { ...direct('No'), valueJson: false },
      reclaim_setup_weekly_hours: { ...direct('80'), valueJson: 80 },
      reclaim_setup_priorities: direct('Growth.'),
      reclaim_setup_keeping_me_up: direct('The board keeps asking for things nobody has time for.'),
      reclaim_setup_why_now: direct('Because the year has got away from me entirely.'),
      reclaim_setup_audit_period: direct('Last month'),
    });

    const block = await buildCoachPhaseContext('u1');

    expect(block).toContain(
      'Your priorities this year (reclaim_setup_priorities), which this audit currently holds as "Growth."'
    );
    expect(block).toContain('ask for the rest of it');
  });

  it('says so plainly when there is genuinely nothing left, and still offers no way onward', async () => {
    readRunAnswers.mockResolvedValue({
      reclaim_profile_first_name: direct('John'),
      reclaim_profile_role: direct('Head of Engineering'),
      reclaim_profile_org_type: direct('SaaS'),
      reclaim_profile_direct_reports: { ...direct('25'), valueJson: 25 },
      reclaim_profile_distributed_team: { ...direct('No'), valueJson: false },
      reclaim_setup_in_transition: { ...direct('No'), valueJson: false },
      reclaim_setup_fundraising_relevant: { ...direct('No'), valueJson: false },
      reclaim_setup_weekly_hours: { ...direct('80'), valueJson: 80 },
      reclaim_setup_priorities: direct(
        'Growing the fellowship programme and closing the Series B.'
      ),
      reclaim_setup_keeping_me_up: direct('The board keeps asking for things nobody has time for.'),
      reclaim_setup_why_now: direct('Because the year has got away from me entirely.'),
      reclaim_setup_audit_period: direct('Last month'),
    });

    const block = await buildCoachPhaseContext('u1');

    expect(block).toContain('no reading left to go back for');
    expect(block).toContain('do not tell them the phase is finished');
    expect(block).not.toContain('which nobody has asked in this audit yet');
  });

  /**
   * Position is the whole point. The block runs to a couple of hundred lines and a model weights its
   * end most heavily, so a directive that drifts into the middle is the directive that was already
   * being ignored. It goes after the recording rule, which is the order a turn actually happens in.
   */
  it('puts the named question last, after the rule about recording what they just said', async () => {
    readRunAnswers.mockResolvedValue({});

    const block = await buildCoachPhaseContext('u1');

    expect(block.indexOf('One last thing, before you write anything at all')).toBeGreaterThan(-1);
    expect(block.indexOf('no turn can end without one')).toBeGreaterThan(
      block.indexOf('One last thing, before you write anything at all')
    );
    // Nothing after the directive, and the directive now ends on its fallback — the reading to ask
    // instead when the named one turns out to be what the leader has just answered.
    expect(block.indexOf('let the turn end on this instead')).toBeGreaterThan(
      block.indexOf('no turn can end without one')
    );
    expect(
      block
        .trimEnd()
        .endsWith(
          'them: shown and read out is the same question twice. They can still type something else.'
        )
    ).toBe(true);
  });
});

/**
 * The reading to fall to, and why the directive cannot be a single pointer.
 *
 * This whole block is built from the run as it stood *before* the leader's message was read — the
 * capture sweep runs after the turn, and `record_answers` fires during it. So the reading the coach is
 * told to end on is, more often than any other single case, the one the leader has just answered: it
 * is the question the coach asked last turn, and they answered it.
 *
 * Observed at phase 0 with everything else captured: named the period being audited, the leader said
 * "last month", and the coach recorded it and then said "we have a clear view of your current context
 * and priorities. When you're ready, you can move on to the next phase" — an announcement that the
 * phase is finished and an offer of a way onward it cannot see, both forbidden in the prose above, and
 * both said anyway, because a rule about what not to do is no use to a model with nothing left to do
 * instead. Three thin readings were sitting on its own list at the time.
 */
describe('buildCoachPhaseContext — the reading to fall to when the named one has just been answered', () => {
  beforeEach(() => {
    loadPhaseProgress.mockResolvedValue({ phases: [], currentPhaseKey: 'phase-0-setup' });
  });

  it('names a second reading, and says the one condition that makes it the live one', async () => {
    readRunAnswers.mockResolvedValue({});

    const block = await buildCoachPhaseContext('u1');

    // The first, by declaration order, is the leader's own name.
    expect(block).toContain(
      'Your first name (reclaim_profile_first_name), which nobody has asked in this audit yet.'
    );
    // The second is the next one nobody has asked, and it arrives with the condition attached.
    expect(block).toContain('what they have just answered in the message you are replying to');
    expect(block).toContain('Your role (reclaim_profile_role), which nobody has asked');
    // And the fallback carries its own instructions, including the answers on screen.
    expect(block).toContain('call offer_choices for reclaim_profile_role');
  });

  it('falls to a thin reading when everything that applies has been asked', async () => {
    // The shape of the live failure: the period is the last unasked reading, and the three readings
    // behind it are notes rather than accounts. On the turn the leader answers the period, the
    // fallback is what stops the coach announcing the phase is over.
    readRunAnswers.mockResolvedValue({
      reclaim_profile_first_name: direct('John'),
      reclaim_profile_role: direct('Head of Engineering'),
      reclaim_profile_org_type: direct('SaaS'),
      reclaim_profile_direct_reports: { ...direct('25'), valueJson: 25 },
      reclaim_profile_distributed_team: { ...direct('Yes'), valueJson: true },
      reclaim_profile_distributed_impact: direct('I waste a lot of time travelling to Manchester.'),
      reclaim_setup_in_transition: { ...direct('No'), valueJson: false },
      reclaim_setup_fundraising_relevant: { ...direct('No'), valueJson: false },
      reclaim_setup_weekly_hours: { ...direct('80'), valueJson: 80 },
      reclaim_setup_priorities: direct('Break even'),
      reclaim_setup_keeping_me_up: direct('I sleep well'),
      reclaim_setup_why_now: direct("I'm testing it"),
    });

    const block = await buildCoachPhaseContext('u1');

    expect(block).toContain(
      'The period being audited (reclaim_setup_audit_period), which nobody has asked in this audit yet.'
    );
    expect(block).toContain('let the turn end on this instead');
    expect(block).toContain(
      'Your priorities this year (reclaim_setup_priorities), which this audit currently holds as "Break even".'
    );
    expect(block).toContain('ask for the rest of it');
  });

  it('never falls to a reading already riding along inside the question above it', async () => {
    // `reclaim_setup_transition_detail` is asked inside its anchor's question, not after it. Offering
    // it as the thing to ask *instead* would name, as the fallback, a reading already in the fallback.
    readRunAnswers.mockResolvedValue({
      reclaim_profile_first_name: direct('John'),
      reclaim_profile_role: direct('Head of Engineering'),
      reclaim_profile_org_type: direct('SaaS'),
      reclaim_profile_direct_reports: { ...direct('25'), valueJson: 25 },
      reclaim_profile_distributed_team: { ...direct('No'), valueJson: false },
    });

    const block = await buildCoachPhaseContext('u1');

    expect(block).toContain(
      'In a period of change (reclaim_setup_in_transition), which nobody has asked in this audit yet.'
    );
    expect(block).toContain(
      'together with What the change is (reclaim_setup_transition_detail), in that order.'
    );
    expect(block).not.toContain(
      'What the change is (reclaim_setup_transition_detail), which nobody has asked in this audit yet.'
    );
  });
});

/**
 * Which questions close on a fixed set of answers.
 *
 * The link that makes the whole offer work. The context builder already decides, deterministically,
 * which reading the turn must end on (`nextQuestionFor`); this is where it also says whether that
 * reading has answers to draw. Without it the coach would have to work out for itself which of the
 * readings on the list are the closed ones, which is exactly the sort of judgement it makes in the
 * middle of composing a warm reply and sometimes does not make at all.
 *
 * The set itself is deliberately absent from the context, and the last test holds that. The options
 * are the product's and reach the leader through the tool; a second copy in the model's context is
 * the copy that eventually gets paraphrased into the reply, which is the one thing the instruction
 * spends its words forbidding.
 */
describe('buildCoachPhaseContext — the questions that have answers to pick from', () => {
  beforeEach(() => {
    loadPhaseProgress.mockResolvedValue({ phases: [], currentPhaseKey: 'phase-0-setup' });
  });

  it('names the tool against the reading the turn was already told to end on', async () => {
    // Everything before the period captured, so the deterministic next question is the one from the
    // brief: which quarter or timeframe are we auditing.
    readRunAnswers.mockResolvedValue({
      reclaim_profile_first_name: direct('Sam'),
      reclaim_profile_role: direct('CEO'),
      reclaim_profile_org_type: direct('Nonprofit'),
      reclaim_profile_direct_reports: {
        value: '5',
        valueJson: 5,
        sourceType: 'direct',
        confidence: 10,
      },
      reclaim_profile_distributed_team: {
        value: 'No',
        valueJson: false,
        sourceType: 'direct',
        confidence: 10,
      },
      reclaim_setup_in_transition: {
        value: 'No',
        valueJson: false,
        sourceType: 'direct',
        confidence: 10,
      },
      reclaim_setup_fundraising_relevant: {
        value: 'No',
        valueJson: false,
        sourceType: 'direct',
        confidence: 10,
      },
      reclaim_setup_weekly_hours: {
        value: '55',
        valueJson: 55,
        sourceType: 'direct',
        confidence: 10,
      },
      reclaim_setup_priorities: direct('Funding, the new programme, and hiring a deputy'),
      reclaim_setup_keeping_me_up: direct('Whether we can pay everyone past March'),
      reclaim_setup_why_now: direct('Because I have not had a clear week since January'),
    });

    const block = await buildCoachPhaseContext('u1');

    expect(block).toContain('call offer_choices for reclaim_setup_audit_period');
    // The other half of the instruction, and the one a model is most likely to drop: a question whose
    // options are shown on screen and also read out is the same question asked twice.
    expect(block).toContain('do not list them');
  });

  it('marks the closed readings on the list, and leaves the open ones alone', async () => {
    const block = await buildCoachPhaseContext('u1');

    // A yes-or-no, and the period. Both are answered by picking, and the note reads as its own
    // sentence rather than running on from the label the line ends with.
    expect(block).toContain(
      'reclaim_setup_in_transition: not yet captured in this audit. In a period of change (needs a yes or a no). This one has a fixed set of answers, so offer them.'
    );
    expect(block).toContain(
      'reclaim_setup_audit_period: not yet captured in this audit. The period being audited. This one has a fixed set of answers, so offer them.'
    );
    // Somebody's own account of what is keeping them up. Four buttons under that would be the tool
    // answering on their behalf.
    expect(block).toContain('reclaim_setup_keeping_me_up: not yet captured in this audit.');
    expect(block).not.toMatch(/reclaim_setup_keeping_me_up.*This one has a fixed set of answers/);
  });

  it('never puts the answers themselves in the model’s context', async () => {
    // The options belong to the product and reach the leader through the tool. A copy here is the
    // copy that gets paraphrased into the reply, and a coach that reads out "last week, last month,
    // last quarter or last year" has asked the question twice over.
    const block = await buildCoachPhaseContext('u1');

    expect(block).not.toContain('last quarter');
    expect(block).not.toContain('Established business');
  });
});

/**
 * The offer, worked out without asking the model anything.
 *
 * The coach can say which reading its question is about by calling `offer_choices`, and observed on a
 * live audit it did so once and then asked the identical question three more times with no call at
 * all, narrating "you can choose from the options on your screen" at a leader looking at a text box.
 * Prose does not fix that. What does is that the decision was never the model's in the first place:
 * `nextQuestionFor` picked the reading before the turn ran, and this reads the same choice back so
 * the route can put the answers up regardless.
 *
 * The point of these tests is that it is **the same decision**, not a second one that happens to
 * agree today. So they pin it against the question the context tells the coach to ask.
 */
describe('pendingChoiceOffer — the answers the turn closes on', () => {
  beforeEach(() => {
    loadPhaseProgress.mockResolvedValue({ phases: [], currentPhaseKey: 'phase-0-setup' });
  });

  it('returns the answers for the reading the context named as this turn’s question', async () => {
    // Everything before the period captured, so both the context and this agree the question is the
    // one from the brief: which quarter or timeframe are we auditing.
    readRunAnswers.mockResolvedValue({
      reclaim_profile_first_name: direct('Sam'),
      reclaim_profile_role: direct('CEO'),
      reclaim_profile_org_type: direct('Nonprofit'),
      reclaim_profile_direct_reports: {
        value: '5',
        valueJson: 5,
        sourceType: 'direct',
        confidence: 10,
      },
      reclaim_profile_distributed_team: {
        value: 'No',
        valueJson: false,
        sourceType: 'direct',
        confidence: 10,
      },
      reclaim_setup_in_transition: {
        value: 'No',
        valueJson: false,
        sourceType: 'direct',
        confidence: 10,
      },
      reclaim_setup_fundraising_relevant: {
        value: 'No',
        valueJson: false,
        sourceType: 'direct',
        confidence: 10,
      },
      reclaim_setup_weekly_hours: {
        value: '55',
        valueJson: 55,
        sourceType: 'direct',
        confidence: 10,
      },
      reclaim_setup_priorities: direct('Funding, the new programme, and hiring a deputy'),
      reclaim_setup_keeping_me_up: direct('Whether we can pay everyone past March'),
      reclaim_setup_why_now: direct('Because I have not had a clear week since January'),
    });

    const offer = await pendingChoiceOffer({
      userId: 'u1',
      runId: 'run-1',
      phaseKey: 'phase-0-setup',
    });

    expect(offer).toEqual({
      slotSlug: 'reclaim_setup_audit_period',
      label: 'The period being audited',
      options: ['last week', 'last month', 'last quarter', 'last year'],
    });
    // The same reading the coach was told to end on. If these two ever disagree, the leader gets
    // answers belonging to a question nobody asked.
    const block = await buildCoachPhaseContext('u1');
    expect(block).toContain('call offer_choices for reclaim_setup_audit_period');
  });

  it('offers nothing when the turn’s question is answered in the leader’s own words', async () => {
    // Nothing captured yet, so the first outstanding reading is their first name: a text box.
    const offer = await pendingChoiceOffer({
      userId: 'u1',
      runId: 'run-1',
      phaseKey: 'phase-0-setup',
    });

    expect(offer).toBeNull();
  });

  it('goes back to a reading the coach guessed, because that is where the question goes next', async () => {
    // The live case. Every applicable reading captured, but the period was inferred rather than
    // heard, so the deterministic next question is to offer it back for the leader to put right,
    // and that question closes on the same four answers as the first asking did.
    readRunAnswers.mockResolvedValue({
      reclaim_profile_first_name: direct('Sam'),
      reclaim_profile_role: direct('CEO'),
      reclaim_profile_org_type: direct('Nonprofit'),
      reclaim_profile_direct_reports: {
        value: '5',
        valueJson: 5,
        sourceType: 'direct',
        confidence: 10,
      },
      reclaim_profile_distributed_team: {
        value: 'No',
        valueJson: false,
        sourceType: 'direct',
        confidence: 10,
      },
      reclaim_setup_in_transition: {
        value: 'No',
        valueJson: false,
        sourceType: 'direct',
        confidence: 10,
      },
      reclaim_setup_fundraising_relevant: {
        value: 'No',
        valueJson: false,
        sourceType: 'direct',
        confidence: 10,
      },
      reclaim_setup_weekly_hours: {
        value: '55',
        valueJson: 55,
        sourceType: 'direct',
        confidence: 10,
      },
      reclaim_setup_priorities: direct('Funding, the new programme, and hiring a deputy'),
      reclaim_setup_keeping_me_up: direct('Whether we can pay everyone past March'),
      reclaim_setup_why_now: direct('Because I have not had a clear week since January'),
      reclaim_setup_audit_period: {
        value: 'last quarter',
        valueJson: null,
        sourceType: 'inferred',
        confidence: 5,
      },
    });

    const offer = await pendingChoiceOffer({
      userId: 'u1',
      runId: 'run-1',
      phaseKey: 'phase-0-setup',
    });

    expect(offer?.slotSlug).toBe('reclaim_setup_audit_period');
    expect(offer?.options).toContain('last quarter');
  });

  it('offers nothing for a section that captures nothing conversationally', async () => {
    const offer = await pendingChoiceOffer({
      userId: 'u1',
      runId: 'run-1',
      phaseKey: 'phase-6-summary',
    });

    expect(offer).toBeNull();
  });
});
