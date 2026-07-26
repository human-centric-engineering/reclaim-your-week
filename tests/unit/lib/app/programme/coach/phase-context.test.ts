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

const { findFirst, readRunAnswers, readBucketLabels, loadPhaseProgress, readCoachContent } =
  vi.hoisted(() => ({
    findFirst: vi.fn(),
    readRunAnswers: vi.fn(),
    readBucketLabels: vi.fn(),
    loadPhaseProgress: vi.fn(),
    readCoachContent: vi.fn(),
  }));

vi.mock('@/lib/db/client', () => ({ prisma: { reclaimAuditRun: { findFirst } } }));
vi.mock('@/lib/app/programme/runs/answers', () => ({ readRunAnswers }));
vi.mock('@/lib/app/programme/buckets/labels', () => ({ readBucketLabels }));
vi.mock('@/lib/app/programme/runs/journey', () => ({ loadPhaseProgress }));
vi.mock('@/lib/app/programme/config', () => ({ readReclaimCoachContent: readCoachContent }));

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

  it('is empty in the summary phase, which captures nothing conversationally', async () => {
    loadPhaseProgress.mockResolvedValue({ phases: [], currentPhaseKey: 'phase-6-summary' });

    expect(await buildCoachPhaseContext('u1')).toBe('');
  });

  it('still builds when the leader has never relabelled anything', async () => {
    readBucketLabels.mockRejectedValue(new Error('label read failed'));

    expect(await buildCoachPhaseContext('u1')).toContain('phase 2 of 6');
  });
});
