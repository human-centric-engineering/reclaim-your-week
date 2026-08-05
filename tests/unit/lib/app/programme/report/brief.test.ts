/**
 * The report agent's brief. Pure.
 *
 * What matters here is not the arithmetic — `buildChartData` and `readCalendarReading` already own
 * that — but three things the file's own header describes: the brief is **derived from the slot
 * definitions** rather than hand-listed, so a question added to the audit reaches the report with no
 * edit; malformed `reclaim_action_options` JSON is dropped rather than coerced; and `usable` is the
 * gate that stops an empty audit from spending money on a model call that would invent a narrative
 * to fill the silence.
 *
 * What the brief may and may not read is asserted in `tests/unit/invariants/report-reading.test.ts`,
 * not repeated here.
 */

import { describe, it, expect } from 'vitest';
import { buildReportBrief, briefTokens, briefToPrompt } from '@/lib/app/programme/report/brief';
import type { Answers } from '@/lib/app/programme/chart/series';

const n = (v: number) => ({ value: String(v), valueJson: v });
const s = (v: string) => ({ value: v, valueJson: null });

describe('buildReportBrief — usable', () => {
  it('is unusable with no hours at all', () => {
    // `buildChartData` always returns one entry per canonical bucket (I7), zero-valued where
    // nothing was reported — so `usable` cannot be read off `areas.length`, only off there being an
    // actual ideal figure or a chosen action, which this asserts directly.
    const brief = buildReportBrief({});
    expect(brief.usable).toBe(false);
    expect(brief.areas.every((a) => a.now === 0)).toBe(true);
  });

  it('is usable once at least one area has an ideal figure', () => {
    const answers: Answers = {
      reclaim_current_hours__deep_work: n(10),
      reclaim_ideal_hours__deep_work: n(6),
    };
    expect(buildReportBrief(answers).usable).toBe(true);
  });

  it('is usable on a chosen action alone, with no ideal figures', () => {
    const answers: Answers = {
      reclaim_current_hours__deep_work: n(10),
      reclaim_action_chosen: s('Block Tuesday mornings'),
    };
    expect(buildReportBrief(answers).usable).toBe(true);
  });

  it('is unusable with hours reported but no ideal and no chosen action', () => {
    const answers: Answers = { reclaim_current_hours__deep_work: n(10) };
    expect(buildReportBrief(answers).usable).toBe(false);
  });
});

describe('buildReportBrief — areas', () => {
  it('carries the stored variance delta onto its matching area', () => {
    const answers: Answers = {
      reclaim_calendar_uploaded: { value: 'Yes', valueJson: true },
      reclaim_composite_hours__deep_work: n(14),
      reclaim_current_hours__deep_work: n(10),
      reclaim_composite_variance_note: {
        value: '',
        valueJson: [{ token: 'deep_work', estimate: 10, composite: 14, delta: 4 }],
      },
    };
    const brief = buildReportBrief(answers);
    const deepWork = brief.areas.find((a) => a.token === 'deep_work');
    expect(deepWork?.calendarDelta).toBe(4);
    // An area the variance list never mentions stays null — the lookup must not invent a figure.
    expect(brief.areas.find((a) => a.token === 'strategic_planning')?.calendarDelta).toBeNull();
  });

  it('reads the ideal figure per area from its own slug', () => {
    const answers: Answers = {
      reclaim_current_hours__deep_work: n(10),
      reclaim_ideal_hours__deep_work: n(6),
    };
    const brief = buildReportBrief(answers);
    expect(brief.areas.find((a) => a.token === 'deep_work')?.ideal).toBe(6);
  });
});

describe('buildReportBrief — reclaim_action_options', () => {
  it('parses a well-formed list of options', () => {
    const answers: Answers = {
      reclaim_action_options: {
        value: '',
        valueJson: [
          { title: 'Delegate the weekly report', impact: 'Frees a morning' },
          { title: 'Cancel the Friday sync', impact: 'Frees an hour' },
        ],
      },
    };
    const brief = buildReportBrief(answers);
    expect(brief.optionsOffered).toEqual([
      { title: 'Delegate the weekly report', impact: 'Frees a morning' },
      { title: 'Cancel the Friday sync', impact: 'Frees an hour' },
    ]);
  });

  it('drops a malformed entry rather than coercing it', () => {
    const answers: Answers = {
      reclaim_action_options: {
        value: '',
        valueJson: [
          { title: 'Fine', impact: 'Also fine' },
          { title: 'Missing impact' },
          'not even an object',
          null,
        ],
      },
    };
    const brief = buildReportBrief(answers);
    expect(brief.optionsOffered).toEqual([{ title: 'Fine', impact: 'Also fine' }]);
  });

  it('reads as no options when the slot was never written', () => {
    expect(buildReportBrief({}).optionsOffered).toEqual([]);
  });

  it('reads as no options when valueJson is not an array', () => {
    const answers: Answers = { reclaim_action_options: { value: 'prose', valueJson: null } };
    expect(buildReportBrief(answers).optionsOffered).toEqual([]);
  });
});

describe('buildReportBrief — text and number readers', () => {
  it('reads a blank string as absent, not as an empty answer', () => {
    const answers: Answers = { reclaim_profile_role: s('   ') };
    expect(buildReportBrief(answers).role).toBeNull();
  });

  it('prefers valueJson for a number and falls back to parsing value', () => {
    const answers: Answers = {
      reclaim_setup_weekly_hours: { value: '50', valueJson: null },
    };
    expect(buildReportBrief(answers).weeklyHours).toBe(50);
  });

  it('reads a non-numeric value as null rather than NaN', () => {
    const answers: Answers = {
      reclaim_setup_weekly_hours: { value: 'about fifty', valueJson: null },
    };
    expect(buildReportBrief(answers).weeklyHours).toBeNull();
  });
});

describe('briefTokens', () => {
  it('names every canonical area token, which is what a gap may anchor to', () => {
    // One entry per bucket regardless of whether it was answered (I7 — `buildChartData`'s own
    // contract), so this asserts membership rather than an exhaustive set literal that would need
    // updating every time a bucket is added.
    const brief = buildReportBrief({ reclaim_current_hours__deep_work: n(10) });
    const tokens = briefTokens(brief);
    expect(tokens.has('deep_work')).toBe(true);
    expect(tokens.size).toBe(brief.areas.length);
  });
});

/**
 * The derived block, and why it is worth a test of its own.
 *
 * Every figure here is reachable by subtracting one number in the brief from another, which is the
 * usual argument for *not* computing it. It is the argument backwards. A model asked which two areas
 * move most answers from the shape of its own paragraph rather than from the arithmetic, fluently and
 * wrongly, and the report is the one artifact in this product where a wrong figure is printed, kept
 * and quoted back months later.
 *
 * So these assert the two properties the prose depends on: the ordering is by size of movement and
 * not by the order the areas happen to be declared in, and every one of them says nothing at all when
 * the audit did not supply the halves it needs.
 */
describe('buildReportBrief — signals', () => {
  it('ranks the areas by how far they move, largest first, whatever order they were asked in', () => {
    const answers: Answers = {
      reclaim_current_hours__deep_work: n(4),
      reclaim_ideal_hours__deep_work: n(10),
      reclaim_current_hours__delivery_operations: n(22),
      reclaim_ideal_hours__delivery_operations: n(8),
      reclaim_current_hours__strategic_planning: n(6),
      reclaim_ideal_hours__strategic_planning: n(7),
    };
    const { movement } = buildReportBrief(answers).signals;

    // Delivery moves furthest and is declared *after* deep work, so an implementation that kept
    // declaration order would pass a weaker assertion than this one.
    expect(movement.map((m) => m.delta)).toEqual([-14, 6, 1]);
    expect(movement[0].title).toContain('Delivery');
  });

  it('leaves out an area that does not move, and one with nothing to move against', () => {
    const answers: Answers = {
      reclaim_current_hours__deep_work: n(8),
      reclaim_ideal_hours__deep_work: n(8),
      // Reported, never given an ideal: no movement is knowable, so none is claimed.
      reclaim_current_hours__delivery_operations: n(20),
    };
    expect(buildReportBrief(answers).signals.movement).toEqual([]);
  });

  it('reads the total the leader wants against the total they have, signed', () => {
    const answers: Answers = {
      reclaim_current_hours__deep_work: n(20),
      reclaim_current_hours__delivery_operations: n(30),
      reclaim_ideal_total_hours: n(42),
    };
    const { signals } = buildReportBrief(answers);
    expect(signals.totalHours).toBe(50);
    expect(signals.totalDelta).toBe(-8);
  });

  it('claims no total difference where the leader never designed a total', () => {
    const answers: Answers = { reclaim_current_hours__deep_work: n(20) };
    expect(buildReportBrief(answers).signals.totalDelta).toBeNull();
  });

  it('names an area at nothing, and puts recovery first as the Brief asks', () => {
    // A week with hours in it and recovery at zero. `nearZeroAreas` is shared with the coach, so
    // this asserts the report and the conversation cannot tell the leader different things.
    const answers: Answers = {
      reclaim_current_hours__deep_work: n(10),
      reclaim_current_hours__delivery_operations: n(30),
    };
    const { nearZero } = buildReportBrief(answers).signals;
    expect(nearZero[0]).toContain('Recovery');
  });

  it('reads each area against its own benchmark rather than leaving the model to divide', () => {
    // Fifty hours, thirty of them on delivery: sixty per cent against a ceiling of ten to fifteen.
    const answers: Answers = {
      reclaim_current_hours__deep_work: n(20),
      reclaim_current_hours__delivery_operations: n(30),
    };
    const { areas, signals } = buildReportBrief(answers);
    const delivery = areas.find((a) => a.token === 'delivery_operations');

    expect(delivery?.percent).toBe(60);
    expect(delivery?.benchmark).toBe('over');
    expect(signals.overBenchmark).toContain(delivery?.title);
  });
});

describe('briefToPrompt', () => {
  it('hands over the movement and the standing rather than the raw figures alone', () => {
    const answers: Answers = {
      reclaim_current_hours__deep_work: n(4),
      reclaim_ideal_hours__deep_work: n(10),
      reclaim_current_hours__delivery_operations: n(30),
      reclaim_ideal_hours__delivery_operations: n(10),
      reclaim_ideal_total_hours: n(30),
    };
    const prompt = briefToPrompt(buildReportBrief(answers));

    expect(prompt).toContain('per cent of the week');
    expect(prompt).toContain('above its benchmark');
    expect(prompt).toContain('Above their benchmark:');
    expect(prompt).toContain('What moves most between the week they have');
    // Signed differences are written as words, the same way the calendar delta is: a model handed
    // "-20" in a list will eventually print the minus sign into somebody's report.
    expect(prompt).toContain('20h less');
    expect(prompt).toContain('6h more');
    expect(prompt).toContain('hours smaller than the week they have');
  });

  it('prints no derived block at all for an audit with nothing to derive from', () => {
    const prompt = briefToPrompt(buildReportBrief({}));

    expect(prompt).not.toContain('What moves most');
    expect(prompt).not.toContain('Above their benchmark:');
    expect(prompt).not.toContain('smaller than the week they have');
  });

  it('names every area with its token, so a gap can anchor to one', () => {
    const answers: Answers = {
      reclaim_current_hours__deep_work: n(12),
      reclaim_ideal_hours__deep_work: n(8),
    };
    const prompt = briefToPrompt(buildReportBrief(answers));

    expect(prompt).toContain('[token: deep_work]');
    expect(prompt).toContain('now 12h');
    expect(prompt).toContain('wanted 8h');
  });

  it('omits every field the leader never answered rather than printing a blank', () => {
    const prompt = briefToPrompt(buildReportBrief({}));

    expect(prompt).not.toContain('Role:');
    expect(prompt).not.toContain('Organisation:');
    expect(prompt).not.toContain('Wanted total:');
  });

  it('names the calendar delta direction in words, not a bare signed number', () => {
    const answers: Answers = {
      reclaim_calendar_uploaded: { value: 'Yes', valueJson: true },
      reclaim_composite_hours__deep_work: n(14),
      reclaim_current_hours__deep_work: n(10),
    };
    const brief = buildReportBrief(answers);
    // Force a delta directly, since composite/current alone (with no significant-variance record)
    // resolves to null above — this asserts the *prompt's* formatting of whichever sign it is given.
    brief.areas[0].calendarDelta = -3;
    const prompt = briefToPrompt(brief);

    expect(prompt).toContain('3h less than they estimated');
  });

  it('closes with the anchoring instruction every time', () => {
    const prompt = briefToPrompt(buildReportBrief({}));
    expect(prompt).toContain('Anchor every gap to one of the tokens above.');
  });

  it('prints every optional line when the leader answered all of it', () => {
    const answers: Answers = {
      reclaim_profile_role: s('Executive Director'),
      reclaim_profile_org_type: s('Nonprofit'),
      reclaim_setup_audit_period: s('2026 Q1'),
      reclaim_setup_priorities: s('Grow the team'),
      reclaim_energy_peak_description: s('Early mornings, before the inbox opens'),
      reclaim_ideal_total_hours: n(38),
      reclaim_ideal_deep_block_when: s('Tuesday and Thursday mornings'),
      reclaim_action_options: {
        value: '',
        valueJson: [{ title: 'Delegate the report', impact: 'Frees a morning' }],
      },
      reclaim_action_chosen: s('Delegate the report'),
      reclaim_action_when: s('This week'),
      reclaim_action_how_known: s('The report still goes out on time'),
    };
    const prompt = briefToPrompt(buildReportBrief(answers));

    // The framing figures still have their own lines.
    expect(prompt).toContain('Role: Executive Director');
    expect(prompt).toContain('Organisation: Nonprofit');
    expect(prompt).toContain('Period audited: 2026 Q1');
    expect(prompt).toContain('Wanted total: 38h');
    expect(prompt).toContain('The three ways in they were offered:');
    expect(prompt).toContain('- Delegate the report: Frees a morning');

    // Everything the leader *said* now arrives in one block, as the question it answered and their
    // words. That is what lets the report be written as an arc rather than as a set of labelled
    // fields, and it is why these are no longer twelve bespoke lines in `briefToPrompt`.
    expect(prompt).toContain('What they said, in their own words');
    expect(prompt).toContain('"Grow the team"');
    expect(prompt).toContain('"Early mornings, before the inbox opens"');
    expect(prompt).toContain('"Tuesday and Thursday mornings"');
    expect(prompt).toContain('"Delegate the report"');
    expect(prompt).toContain('"This week"');
    expect(prompt).toContain('"The report still goes out on time"');
  });
});
