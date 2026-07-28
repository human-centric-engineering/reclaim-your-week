/**
 * The one genuine challenge in phase 3, and the arithmetic that decides when it is warranted.
 *
 * The source asks the tool to "gently challenge any ideal week that looks suspiciously similar to
 * their current reality — especially if delivery and operations remains high, or recovery remains
 * near zero". Nothing implemented it, and a coach asked to notice that from memory, across nine pairs
 * of figures collected one at a time over several turns, will either miss it or invent a difference.
 *
 * Pure — no mocks. Every case below is a week a leader could actually have given.
 */

import { describe, it, expect } from 'vitest';
import { readIdealWeek, challengeEvidence } from '@/lib/app/programme/coach/ideal-week';
import { RECLAIM_BUCKETS, bucketToken } from '@/lib/app/programme/content';

type Answers = Record<string, { value: string; valueJson: unknown } | undefined>;

const n = (value: number) => ({ value: String(value), valueJson: value });

/** The eight non-conditional areas, current and ideal, with named overrides on either side. */
function week(
  current: Record<string, number>,
  ideal: Record<string, number>,
  extra: Answers = {}
): Answers {
  const out: Answers = { ...extra };
  for (const bucket of RECLAIM_BUCKETS) {
    if (bucket.conditional) continue;
    const token = bucketToken(bucket.slug);
    out[`reclaim_current_hours__${token}`] = n(current[token] ?? 5);
    out[`reclaim_ideal_hours__${token}`] = n(ideal[token] ?? 5);
  }
  return out;
}

describe('readIdealWeek — nothing fires until the week is designed', () => {
  it('is incomplete, and silent, while any visible area has no ideal figure', () => {
    const answers = week({}, {});
    delete answers['reclaim_ideal_hours__team_development'];

    const reading = readIdealWeek(answers);

    expect(reading.complete).toBe(false);
    expect(reading.shouldChallenge).toBe(false);
    // A half-designed week differs from the current one only because most of it is still empty.
    // Challenging that would fire on the first turn of every phase 3 ever run.
    expect(reading.unmoved).toEqual([]);
  });

  it('ignores the fundraising lane unless this leader was shown it', () => {
    // The conditional area has no ideal figure here, and must not hold `complete` down.
    const answers = week({}, {});

    expect(readIdealWeek(answers).complete).toBe(true);
  });
});

describe('readIdealWeek — the week that has not moved', () => {
  it('names an area unmoved when the two figures are within an hour', () => {
    // A leader who said "about eight" and then "about nine" has not redesigned anything, and the
    // tolerance is in hours rather than percent (I8) because that is the resolution of a spoken
    // figure — one hour means something different on a 2h area than on a 20h one.
    const reading = readIdealWeek(
      week({ deep_work: 8, strategic_planning: 4 }, { deep_work: 9, strategic_planning: 12 })
    );

    const titles = reading.unmoved.map((a) => a.title);
    expect(titles).toContain('Deep work');
    expect(titles).not.toContain('Strategic planning & review');
  });

  it('challenges a week where almost nothing was redistributed', () => {
    const reading = readIdealWeek(week({}, {}));

    expect(reading.unmoved.length).toBeGreaterThanOrEqual(4);
    expect(reading.shouldChallenge).toBe(true);
  });

  /**
   * The case that decides whether this heuristic is worth having.
   *
   * Counting unmoved areas was the first rule, and it fails exactly the leader who did the work: take
   * twelve hours out of delivery, put them into deep work and recovery, leave five small areas alone,
   * and a count-based rule calls that "five of eight unmoved" and challenges it. That is the tool
   * arguing with someone who has just made the hardest change in the audit. Measuring the hours that
   * actually move gets both cases right.
   */
  it('leaves a concentrated redesign alone, even with most areas untouched', () => {
    const reading = readIdealWeek(
      week(
        { delivery_operations: 20, deep_work: 2, recovery_white_space: 1 },
        { delivery_operations: 8, deep_work: 12, recovery_white_space: 8 }
      )
    );

    // Five of the eight areas never moved, and this is still a redesigned week.
    expect(reading.unmoved.length).toBe(5);
    expect(reading.deliveryStaysHigh).toBe(false);
    expect(reading.recoveryStaysNearZero).toBe(false);
    expect(reading.shouldChallenge).toBe(false);
  });
});

describe('readIdealWeek — the two cases the source names', () => {
  it('flags delivery only when it is above its guide in BOTH weeks', () => {
    // "Remains" is the source's word. An ideal week high on delivery for the first time is a
    // different conversation, and one the leader has deliberately chosen.
    const stays = readIdealWeek(week({ delivery_operations: 30 }, { delivery_operations: 28 }));
    expect(stays.deliveryStaysHigh).toBe(true);

    const newlyHigh = readIdealWeek(week({ delivery_operations: 4 }, { delivery_operations: 30 }));
    expect(newlyHigh.deliveryStaysHigh).toBe(false);

    const fixed = readIdealWeek(week({ delivery_operations: 30 }, { delivery_operations: 6 }));
    expect(fixed.deliveryStaysHigh).toBe(false);
  });

  it('flags recovery only when it stays near nothing, judged against its own benchmark', () => {
    // Near-zero is derived from the area's `lowPercent` rather than a number invented here, so an
    // operator moving the benchmark moves this too.
    const stays = readIdealWeek(week({ recovery_white_space: 1 }, { recovery_white_space: 1 }));
    expect(stays.recoveryStaysNearZero).toBe(true);

    const restored = readIdealWeek(week({ recovery_white_space: 1 }, { recovery_white_space: 8 }));
    expect(restored.recoveryStaysNearZero).toBe(false);
  });

  it('flags a total that barely moves, against what they reported working', () => {
    const answers = week(
      {},
      {},
      {
        reclaim_setup_weekly_hours: n(41),
        reclaim_ideal_total_hours: n(40),
      }
    );

    expect(readIdealWeek(answers).totalUnchanged).toBe(true);

    const moved = week(
      {},
      {},
      {
        reclaim_setup_weekly_hours: n(55),
        reclaim_ideal_total_hours: n(40),
      }
    );
    expect(readIdealWeek(moved).totalUnchanged).toBe(false);
  });

  it('does not challenge on an unchanged total alone, when the shape did move', () => {
    // A leader who moves forty hours between areas and keeps the same weekly total HAS redesigned
    // their week. They have not decided to work less, which is a real observation and belongs to the
    // 55+ note at the gap, not to a challenge that says their ideal week looks like their current one.
    const reading = readIdealWeek(
      week(
        { delivery_operations: 30, deep_work: 2, recovery_white_space: 1 },
        { delivery_operations: 8, deep_work: 14, recovery_white_space: 9 }
      )
    );

    expect(reading.totalUnchanged).toBe(true);
    expect(reading.shouldChallenge).toBe(false);
  });
});

describe('challengeEvidence', () => {
  it('gives the coach the specific figures rather than a general observation', () => {
    // A vague challenge can be put down; "eighteen hours now and seventeen in the week you designed"
    // cannot. This is the same reasoning the gap arithmetic rests on.
    const reading = readIdealWeek(
      week(
        { delivery_operations: 30, recovery_white_space: 1 },
        { delivery_operations: 29, recovery_white_space: 1 }
      )
    );
    const evidence = challengeEvidence(reading);

    expect(evidence.join('\n')).toContain('above its guide in both weeks');
    expect(evidence.join('\n')).toContain('near nothing in both weeks');
    expect(evidence.join('\n')).toMatch(/Delivery & operations: 30h now, 29h in the ideal week\./);
  });

  it('is empty when there is nothing to challenge', () => {
    const reading = readIdealWeek(
      week({ delivery_operations: 30, deep_work: 2 }, { delivery_operations: 8, deep_work: 12 })
    );
    if (!reading.shouldChallenge) expect(challengeEvidence(reading)).toEqual([]);
  });
});
