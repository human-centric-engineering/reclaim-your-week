/**
 * The analyst's brief (F14 t-2). Pure.
 *
 * What matters here is not the arithmetic — `buildChartData` and `readCalendarReading` already own
 * that — but the **allowlist discipline** the file's own header describes: sensitive slugs never
 * enter the brief, malformed `reclaim_action_options` JSON is dropped rather than coerced, and
 * `usable` is the gate that stops an empty audit from spending money on a model call that would
 * invent gaps to fill the silence.
 *
 * The disjointness of `ANALYST_BRIEF_SLUGS` against every `sensitive` slot is asserted separately in
 * `tests/unit/invariants/analyst-reading.test.ts` — not repeated here.
 */

import { describe, it, expect } from 'vitest';
import { buildAnalystBrief, briefTokens, briefToPrompt } from '@/lib/app/programme/analyst/brief';
import type { Answers } from '@/lib/app/programme/chart/series';

const n = (v: number) => ({ value: String(v), valueJson: v });
const s = (v: string) => ({ value: v, valueJson: null });

describe('buildAnalystBrief — usable', () => {
  it('is unusable with no hours at all', () => {
    // `buildChartData` always returns one entry per canonical bucket (I7), zero-valued where
    // nothing was reported — so `usable` cannot be read off `areas.length`, only off there being an
    // actual ideal figure or a chosen action, which this asserts directly.
    const brief = buildAnalystBrief({});
    expect(brief.usable).toBe(false);
    expect(brief.areas.every((a) => a.now === 0)).toBe(true);
  });

  it('is usable once at least one area has an ideal figure', () => {
    const answers: Answers = {
      reclaim_current_hours__deep_work: n(10),
      reclaim_ideal_hours__deep_work: n(6),
    };
    expect(buildAnalystBrief(answers).usable).toBe(true);
  });

  it('is usable on a chosen action alone, with no ideal figures', () => {
    const answers: Answers = {
      reclaim_current_hours__deep_work: n(10),
      reclaim_action_chosen: s('Block Tuesday mornings'),
    };
    expect(buildAnalystBrief(answers).usable).toBe(true);
  });

  it('is unusable with hours reported but no ideal and no chosen action', () => {
    const answers: Answers = { reclaim_current_hours__deep_work: n(10) };
    expect(buildAnalystBrief(answers).usable).toBe(false);
  });
});

describe('buildAnalystBrief — areas', () => {
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
    const brief = buildAnalystBrief(answers);
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
    const brief = buildAnalystBrief(answers);
    expect(brief.areas.find((a) => a.token === 'deep_work')?.ideal).toBe(6);
  });
});

describe('buildAnalystBrief — reclaim_action_options', () => {
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
    const brief = buildAnalystBrief(answers);
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
    const brief = buildAnalystBrief(answers);
    expect(brief.optionsOffered).toEqual([{ title: 'Fine', impact: 'Also fine' }]);
  });

  it('reads as no options when the slot was never written', () => {
    expect(buildAnalystBrief({}).optionsOffered).toEqual([]);
  });

  it('reads as no options when valueJson is not an array', () => {
    const answers: Answers = { reclaim_action_options: { value: 'prose', valueJson: null } };
    expect(buildAnalystBrief(answers).optionsOffered).toEqual([]);
  });
});

describe('buildAnalystBrief — text and number readers', () => {
  it('reads a blank string as absent, not as an empty answer', () => {
    const answers: Answers = { reclaim_profile_role: s('   ') };
    expect(buildAnalystBrief(answers).role).toBeNull();
  });

  it('prefers valueJson for a number and falls back to parsing value', () => {
    const answers: Answers = {
      reclaim_setup_weekly_hours: { value: '50', valueJson: null },
    };
    expect(buildAnalystBrief(answers).weeklyHours).toBe(50);
  });

  it('reads a non-numeric value as null rather than NaN', () => {
    const answers: Answers = {
      reclaim_setup_weekly_hours: { value: 'about fifty', valueJson: null },
    };
    expect(buildAnalystBrief(answers).weeklyHours).toBeNull();
  });
});

describe('briefTokens', () => {
  it('names every canonical area token, which is what a gap may anchor to', () => {
    // One entry per bucket regardless of whether it was answered (I7 — `buildChartData`'s own
    // contract), so this asserts membership rather than an exhaustive set literal that would need
    // updating every time a bucket is added.
    const brief = buildAnalystBrief({ reclaim_current_hours__deep_work: n(10) });
    const tokens = briefTokens(brief);
    expect(tokens.has('deep_work')).toBe(true);
    expect(tokens.size).toBe(brief.areas.length);
  });
});

describe('briefToPrompt', () => {
  it('names every area with its token, so a gap can anchor to one', () => {
    const answers: Answers = {
      reclaim_current_hours__deep_work: n(12),
      reclaim_ideal_hours__deep_work: n(8),
    };
    const prompt = briefToPrompt(buildAnalystBrief(answers));

    expect(prompt).toContain('[token: deep_work]');
    expect(prompt).toContain('now 12h');
    expect(prompt).toContain('wanted 8h');
  });

  it('omits every field the leader never answered rather than printing a blank', () => {
    const prompt = briefToPrompt(buildAnalystBrief({}));

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
    const brief = buildAnalystBrief(answers);
    // Force a delta directly, since composite/current alone (with no significant-variance record)
    // resolves to null above — this asserts the *prompt's* formatting of whichever sign it is given.
    brief.areas[0].calendarDelta = -3;
    const prompt = briefToPrompt(brief);

    expect(prompt).toContain('3h less than they estimated');
  });

  it('closes with the anchoring instruction every time', () => {
    const prompt = briefToPrompt(buildAnalystBrief({}));
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
    const prompt = briefToPrompt(buildAnalystBrief(answers));

    expect(prompt).toContain('Role: Executive Director');
    expect(prompt).toContain('Organisation: Nonprofit');
    expect(prompt).toContain('Period audited: 2026 Q1');
    expect(prompt).toContain('Priorities this year: Grow the team');
    expect(prompt).toContain('When their energy is at its best: Early mornings');
    expect(prompt).toContain('Wanted total: 38h');
    expect(prompt).toContain('Where they said a protected block could sit: Tuesday and Thursday');
    expect(prompt).toContain('The three ways in they were offered:');
    expect(prompt).toContain('- Delegate the report: Frees a morning');
    expect(prompt).toContain('What they chose to start: Delegate the report');
    expect(prompt).toContain('When: This week');
    expect(prompt).toContain('How they will know it worked: The report still goes out on time');
  });
});
