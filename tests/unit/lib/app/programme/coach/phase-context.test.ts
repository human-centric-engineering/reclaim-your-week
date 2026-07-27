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

  it("names the reflection as the leader's to record, for a phase that gates on one (I9)", async () => {
    const block = await buildCoachPhaseContext('u1');

    expect(block).toContain('reclaim_reflection_p2');
    expect(block).toContain('only they can save it');
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

  it('never asks the coach to record anything in this phase', async () => {
    readRunAnswers.mockResolvedValue({ reclaim_reflection_p6: takeaway });

    const block = await buildCoachPhaseContext('u1');

    expect(block).toContain('Nothing here is captured by you');
    expect(block).not.toContain('record_answers');
  });
});
