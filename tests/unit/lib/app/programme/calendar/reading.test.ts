/**
 * Unit: the calendar read back as perception versus reality (F13 t-1).
 *
 * Pure over slot answers — no Prisma, no mocks. The cases that matter are the ones where a naive
 * implementation produces a figure that is wrong rather than missing, because this reading goes
 * straight into a coaching prompt and a wrong number here is the tool telling a leader their week is
 * something it is not.
 */

import { describe, expect, it } from 'vitest';

import {
  calendarReadingLines,
  readCalendarReading,
  type CalendarReading,
} from '@/lib/app/programme/calendar/reading';
import { VARIANCE_MIN_HOURS } from '@/lib/app/programme/calendar/composite';
import type { Answers } from '@/lib/app/programme/chart/series';

/** A slot answer in the shape `readRunAnswers` produces. */
const answer = (value: string | number, json?: unknown): Answers[string] => ({
  value: String(value),
  valueJson: json === undefined ? value : json,
});

/** Hours for one area across all three columns, plus its variance entry when it diverged. */
function build(
  over: {
    uploaded?: boolean;
    current?: Record<string, number>;
    composite?: Record<string, number>;
    variance?: Array<{ token: string; estimate: number; composite: number; delta: number }>;
    extra?: Answers;
  } = {}
): Answers {
  const answers: Answers = {
    reclaim_calendar_uploaded: answer(
      over.uploaded === false ? 'false' : 'true',
      over.uploaded !== false
    ),
  };
  for (const [token, hours] of Object.entries(over.current ?? {})) {
    answers[`reclaim_current_hours__${token}`] = answer(hours);
  }
  for (const [token, hours] of Object.entries(over.composite ?? {})) {
    answers[`reclaim_composite_hours__${token}`] = answer(hours);
  }
  if (over.variance !== undefined) {
    answers['reclaim_composite_variance_note'] = {
      value: `${over.variance.length} bucket(s) diverged from the estimate`,
      valueJson: over.variance,
    };
  }
  return { ...answers, ...over.extra };
}

/** Every area named in any of the three categories. */
const named = (reading: CalendarReading): string[] =>
  [...reading.higher, ...reading.lower, ...reading.confirmed].map((e) => e.token);

describe('readCalendarReading', () => {
  it('returns nothing at all for a run that never took the branch', () => {
    const reading = readCalendarReading(build({ uploaded: false, current: { deep_work: 5 } }));
    expect(reading).toMatchObject({ uploaded: false, hasReading: false });
    expect(named(reading)).toEqual([]);
    // And the lines are empty rather than a header with nothing under it, so the caller can spread
    // them unconditionally.
    expect(calendarReadingLines(reading)).toEqual([]);
  });

  it('splits the stored variance into higher and lower by direction', () => {
    const reading = readCalendarReading(
      build({
        current: { deep_work: 4, delivery_operations: 20 },
        composite: { deep_work: 10, delivery_operations: 12 },
        variance: [
          { token: 'deep_work', estimate: 4, composite: 10, delta: 6 },
          { token: 'delivery_operations', estimate: 20, composite: 12, delta: -8 },
        ],
      })
    );
    expect(reading.higher.map((e) => e.token)).toEqual(['deep_work']);
    expect(reading.lower.map((e) => e.token)).toEqual(['delivery_operations']);
    expect(reading.confirmed).toEqual([]);
  });

  it('orders each category by the size of the movement', () => {
    const reading = readCalendarReading(
      build({
        current: {
          deep_work: 4,
          strategic_planning: 4,
          delivery_operations: 20,
          team_development: 9,
        },
        composite: {
          deep_work: 8,
          strategic_planning: 14,
          delivery_operations: 12,
          team_development: 1,
        },
        variance: [
          { token: 'deep_work', estimate: 4, composite: 8, delta: 4 },
          { token: 'strategic_planning', estimate: 4, composite: 14, delta: 10 },
          { token: 'delivery_operations', estimate: 20, composite: 12, delta: -8 },
          { token: 'team_development', estimate: 9, composite: 1, delta: -8.5 },
        ],
      })
    );
    // Largest first in both directions, so a coach told to name one or two names the ones that moved.
    expect(reading.higher.map((e) => e.token)).toEqual(['strategic_planning', 'deep_work']);
    expect(reading.lower.map((e) => e.token)).toEqual(['team_development', 'delivery_operations']);
  });

  it('recomputes "confirmed" as the complement, since it was never stored', () => {
    // persistComposite records only significant divergences, so an area that matched is absent from
    // the variance list entirely. It must not therefore be absent from the reading.
    const reading = readCalendarReading(
      build({
        current: { deep_work: 4, recovery_white_space: 3 },
        composite: { deep_work: 10, recovery_white_space: 3.5 },
        variance: [{ token: 'deep_work', estimate: 4, composite: 10, delta: 6 }],
      })
    );
    expect(reading.confirmed.map((e) => e.token)).toEqual(['recovery_white_space']);
    expect(reading.confirmed[0]).toMatchObject({ estimate: 3, composite: 3.5, delta: 0.5 });
  });

  it('shares one definition of "significant" with composite.ts', () => {
    // A delta at the threshold is a divergence, so it is NOT confirmed — even though this run's
    // stored variance list is empty. Two files each holding their own threshold would land an area
    // in both categories or neither; the predicate is imported for exactly this case.
    const reading = readCalendarReading(
      build({
        current: { deep_work: 20 },
        composite: { deep_work: 20 + VARIANCE_MIN_HOURS },
        variance: [],
      })
    );
    expect(reading.confirmed).toEqual([]);
    expect(named(reading)).toEqual([]);
  });

  it('applies the hours test alone when the estimate is zero', () => {
    // A ratio against zero is meaningless. composite.ts guards with `estimate > 0` and this must
    // agree, or an area at 0h → 1h reads as an infinite divergence.
    const reading = readCalendarReading(
      build({
        current: { recovery_white_space: 0 },
        composite: { recovery_white_space: 1 },
        variance: [],
      })
    );
    expect(reading.confirmed.map((e) => e.token)).toEqual(['recovery_white_space']);
  });

  it('places an area with only one of the two figures in no category', () => {
    // A gap is not a match. An area the leader never estimated has nothing to be confirmed against.
    const reading = readCalendarReading(
      build({ composite: { deep_work: 10 }, current: { strategic_planning: 5 }, variance: [] })
    );
    expect(named(reading)).toEqual([]);
    expect(reading.hasReading).toBe(false);
  });

  it('omits a conditional area the leader was never asked about', () => {
    // persistComposite writes all nine composite slots including a real 0, so without the guard a
    // leader with no fundraising in their role is told their fundraising time is confirmed at zero.
    const answers = build({
      current: { fundraising_capital: 0 },
      composite: { fundraising_capital: 0 },
      variance: [],
    });
    expect(named(readCalendarReading(answers))).toEqual([]);

    const relevant = {
      ...answers,
      reclaim_setup_fundraising_relevant: answer('Yes', true),
    };
    expect(named(readCalendarReading(relevant))).toEqual(['fundraising_capital']);
  });

  it('uses the leader’s own label for an area they renamed', () => {
    // Keyed by TOKEN (`deep_work`), not by the canonical slug (`deep-work`) — `readBucketLabels`'s
    // own docstring says so, and this test previously used the slug form, which happened to match a
    // bug in the lookup (`bucketLabels[bucket.slug]` instead of `bucketLabels[token]`) rather than
    // catching it: every label was silently ignored in production while this test stayed green.
    const reading = readCalendarReading(
      build({
        current: { deep_work: 4 },
        composite: { deep_work: 10 },
        variance: [{ token: 'deep_work', estimate: 4, composite: 10, delta: 6 }],
      }),
      { deep_work: 'Heads-down time' }
    );
    expect(reading.higher[0].title).toBe('Heads-down time');
  });

  it('falls back to the shipped title for a label keyed by the canonical slug rather than the token', () => {
    // The exact shape of the regression above: a caller that mistakenly built its label map with
    // hyphenated slugs must not silently "half work" by matching nothing and falling through.
    const reading = readCalendarReading(
      build({
        current: { deep_work: 4 },
        composite: { deep_work: 10 },
        variance: [{ token: 'deep_work', estimate: 4, composite: 10, delta: 6 }],
      }),
      { 'deep-work': 'Heads-down time' }
    );
    expect(reading.higher[0].title).not.toBe('Heads-down time');
  });

  it('drops a malformed variance entry rather than guessing at it', () => {
    // This is JSON out of the database. A half-parsed entry would put an invented figure in a prompt.
    const answers = build({ current: { deep_work: 4 }, composite: { deep_work: 10 } });
    answers['reclaim_composite_variance_note'] = {
      value: 'nonsense',
      valueJson: [{ token: 'deep_work' }, null, 'not an object'],
    };
    const reading = readCalendarReading(answers);
    expect(reading.higher).toEqual([]);
    // It falls through to the confirmed test, which correctly finds a 6h divergence and excludes it.
    expect(reading.confirmed).toEqual([]);
  });

  it('carries the rhythm metrics and the leader’s own off-calendar answers', () => {
    const reading = readCalendarReading(
      build({
        current: { deep_work: 4 },
        composite: { deep_work: 4 },
        variance: [],
        extra: {
          reclaim_calendar_total_hours: answer(31.2),
          reclaim_calendar_events_per_day: answer(5.3),
          reclaim_calendar_back_to_back: answer(12),
          reclaim_calendar_longest_block: answer(240),
          reclaim_calendar_completeness: answer('Most of it, but not the evenings'),
          reclaim_calendar_reactive_time: answer('It gets eaten'),
        },
      })
    );
    expect(reading.calendarHours).toBe(31.2);
    expect(reading.shape).toEqual({ eventsPerDay: 5.3, backToBack: 12, longestBlockMinutes: 240 });
    expect(reading.completeness).toBe('Most of it, but not the evenings');
    expect(reading.offCalendar.reactiveTime).toBe('It gets eaten');
    expect(reading.offCalendar.offCalWork).toBeNull();
  });
});

describe('calendarReadingLines', () => {
  const reading = (): CalendarReading =>
    readCalendarReading(
      build({
        current: { deep_work: 4, delivery_operations: 20 },
        composite: { deep_work: 10, delivery_operations: 12 },
        variance: [
          { token: 'deep_work', estimate: 4, composite: 10, delta: 6 },
          { token: 'delivery_operations', estimate: 20, composite: 12, delta: -8 },
        ],
        extra: { reclaim_calendar_completeness: answer('Nearly all of it') },
      })
    );

  it('states the I17 framing before any figure', () => {
    const lines = calendarReadingLines(reading());
    const text = lines.join('\n');
    const framing = lines.findIndex((l) => l.includes('never evidence that they were wrong'));
    const firstFigure = lines.findIndex((l) => l.startsWith('- '));
    expect(framing).toBeGreaterThanOrEqual(0);
    // The framing must not arrive after the numbers it is supposed to frame.
    expect(framing).toBeLessThan(firstFigure);
    expect(text).toContain('information about what a calendar');
  });

  it('gives the real figures in both directions, and quotes the completeness answer', () => {
    const text = calendarReadingLines(reading()).join('\n');
    expect(text).toContain('Higher than they thought:');
    expect(text).toContain(
      'they estimated 4h, the reconciled figure is 10h (6h more than they thought)'
    );
    expect(text).toContain('Lower than they thought:');
    expect(text).toContain('8h less than they thought');
    expect(text).toContain('"Nearly all of it"');
  });

  it('ends by handing the noticing back, not by interpreting (I12)', () => {
    const lines = calendarReadingLines(reading());
    expect(lines[lines.length - 1]).toContain('Their noticing comes first');
  });

  it('omits a category that has no entries rather than printing an empty heading', () => {
    const text = calendarReadingLines(reading()).join('\n');
    expect(text).not.toContain('Close to what they thought:');
  });
});
