/**
 * The canned analyst reading for fabricated audits (F19). Pure — no mocks.
 *
 * The assertion that matters is the last group: the output survives `parseAnalystReading` with the
 * token set a real run would supply, and is **refused** when a token is missing. That second half is
 * what proves the derivation is doing real work rather than decorating a hard-coded list — a fixture
 * naming areas the run does not have would lose the whole analyst section to a silent refusal, showing
 * two empty panels and a warning in a log nobody is reading.
 */

import { describe, it, expect } from 'vitest';
import { previewAnalystReading } from '@/lib/app/programme/preview/fixtures';
import { parseAnalystReading } from '@/lib/app/programme/analyst/reading';
import { RECLAIM_BANNED_LEXICON } from '@/lib/app/programme/agent';
import { ANALYST_IMPERATIVE_OPENERS } from '@/lib/app/programme/analyst/agent';

const HOURS = {
  deep_work: { current: 4, ideal: 12 },
  delivery_operations: { current: 22, ideal: 10 },
  team_development: { current: 6, ideal: 7 },
  recovery_white_space: { current: 2, ideal: 4 },
};

const tokensOf = (hours: Record<string, unknown>) => new Set(Object.keys(hours));

describe('previewAnalystReading — which areas it names', () => {
  it('names the two largest gaps, not an arbitrary two', () => {
    // Same job the real analyst is given. A fabricated summary that picked the wrong areas would be a
    // worse artefact than one that picked the right ones — the point of the screen is judging whether
    // it reads coherently against the chart beside it.
    const reading = previewAnalystReading(HOURS);

    expect(reading?.gaps.map((g) => g.token)).toEqual(['delivery_operations', 'deep_work']);
  });

  it('describes an underspend and an overspend differently', () => {
    const reading = previewAnalystReading(HOURS);
    const byToken = new Map(reading?.gaps.map((g) => [g.token, g.observation]));

    expect(byToken.get('deep_work')).toContain('against the twelve you wanted');
    expect(byToken.get('delivery_operations')).toContain('holds twenty two hours');
  });

  it('is deterministic when two gaps are the same size', () => {
    // A fabricator that produced a different reading each run makes one screenshot impossible to
    // compare against the last one.
    const tied = {
      alpha_area: { current: 2, ideal: 6 },
      beta_area: { current: 8, ideal: 4 },
      gamma_area: { current: 5, ideal: 5 },
    };

    const first = previewAnalystReading(tied);
    const second = previewAnalystReading(tied);

    expect(first).toEqual(second);
    expect(first?.gaps.map((g) => g.token)).toEqual(['alpha_area', 'beta_area']);
  });

  it('returns null rather than padding when there is too little to say', () => {
    // Better an honest "not generated" state than two invented areas.
    expect(previewAnalystReading({ deep_work: { current: 4, ideal: 8 } })).toBeNull();
    expect(previewAnalystReading({})).toBeNull();
  });
});

describe('previewAnalystReading — the prose rules', () => {
  const reading = previewAnalystReading(HOURS);
  const strings = [
    ...(reading?.gaps.map((g) => g.observation) ?? []),
    ...(reading?.pathway.flatMap((s) => [s.step, s.difference]) ?? []),
  ];

  it('writes some prose to check', () => {
    expect(strings.length).toBeGreaterThan(0);
  });

  it.each(strings)('%s carries no em dash', (text) => {
    expect(text).not.toContain('—');
  });

  it.each(strings)('%s uses none of the banned terms', (text) => {
    const lower = text.toLowerCase();
    expect(RECLAIM_BANNED_LEXICON.filter((t) => lower.includes(t.toLowerCase()))).toEqual([]);
  });

  it('never opens a step with an instruction', () => {
    // "Two protected mornings a week" is a step. "Protect two mornings" is the tool deciding for a
    // leader, which is the register I1 exists to keep out of the product.
    for (const step of reading?.pathway ?? []) {
      const lower = step.step.toLowerCase();
      expect(ANALYST_IMPERATIVE_OPENERS.filter((o) => lower.startsWith(o))).toEqual([]);
    }
  });
});

describe('previewAnalystReading — it survives the real parser', () => {
  it('parses cleanly against the tokens the run actually has', () => {
    // The whole reason this is derived. `parseAnalystReading` is whole-or-nothing: one bad field and
    // the entire reading is refused, leaving the summary with no analyst section at all.
    const parsed = parseAnalystReading(previewAnalystReading(HOURS), tokensOf(HOURS));

    expect(parsed).not.toBeNull();
    expect(parsed?.gaps).toHaveLength(2);
    expect(parsed?.pathway.map((s) => s.horizon)).toEqual(['now', 'next', 'later']);
  });

  it('is refused when the run does not have the areas it names', () => {
    // Proves the derivation is load-bearing: a hard-coded token list would fail exactly this way, and
    // would do it silently in production the day somebody changed the fabricator's hour map.
    const reading = previewAnalystReading(HOURS);

    expect(parseAnalystReading(reading, new Set(['something_else']))).toBeNull();
  });

  it('parses for any pair of areas a fabricator might write', () => {
    // The fabricator fills every non-conditional bucket, but a future one might fill fewer. Any two
    // must still produce a reading the parser accepts.
    const pairs: Record<string, { current: number; ideal: number }>[] = [
      {
        strategic_planning: { current: 1, ideal: 9 },
        learning_development: { current: 0, ideal: 3 },
      },
      {
        organisational_oversight: { current: 14, ideal: 6 },
        relationship_building: { current: 3, ideal: 8 },
      },
    ];

    for (const hours of pairs) {
      expect(parseAnalystReading(previewAnalystReading(hours), tokensOf(hours))).not.toBeNull();
    }
  });
});

describe('previewAnalystReading — hours read as prose, not as data', () => {
  it('never mixes words and digits in one sentence', () => {
    // The seam this closes: "holds 22 hours, where ten was the intention" is two registers in one
    // line. Any hours a week can hold have a word form.
    const reading = previewAnalystReading({
      big_area: { current: 55, ideal: 21 },
      other_area: { current: 40, ideal: 3 },
    });

    for (const gap of reading?.gaps ?? []) expect(gap.observation).not.toMatch(/\d/);
  });

  it('stays within the observation cap at the wordiest end', () => {
    // Word forms are longer than digits, and `parseAnalystReading` refuses an observation over 220
    // characters outright. The longest plausible area name with the longest hour words is the worst
    // case, and it has to fit.
    const reading = previewAnalystReading({
      organisational_oversight: { current: 77, ideal: 38 },
      relationship_building: { current: 66, ideal: 27 },
    });

    for (const gap of reading?.gaps ?? []) expect(gap.observation.length).toBeLessThanOrEqual(220);
  });
});
