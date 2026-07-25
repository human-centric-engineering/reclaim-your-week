/**
 * The anonymised aggregate (F10 t-3). Pure, so the privacy rules are asserted directly rather than
 * inferred from a query shape.
 *
 * Three of these are the promise made in the product's own copy, not stylistic preferences: a cohort
 * below the floor is **withheld entirely** rather than rounded, a single bucket can fall below the
 * floor even when the cohort does not, and grouping is by canonical slug so a leader's own relabelling
 * cannot split or reveal them (I7).
 */

import { describe, it, expect } from 'vitest';
import {
  computeAggregate,
  contributionFromHeads,
  type AggregateContribution,
} from '@/lib/app/programme/admin/aggregate';

function contribution(hours: Record<string, number>): AggregateContribution {
  return { hoursByBucket: hours, emptyBuckets: [] };
}

describe('computeAggregate — the cohort floor', () => {
  it('suppresses everything when the cohort is below the minimum', () => {
    const view = computeAggregate(
      [contribution({ 'deep-work': 6 }), contribution({ 'deep-work': 8 })],
      5
    );

    expect(view.suppressed).toBe(true);
    expect(view.cohort).toBe(2);
    // Not even per-bucket counts: those would leak the cohort's shape one column at a time.
    expect(view.buckets).toEqual([]);
    expect(view.mostOftenEmpty).toEqual([]);
  });

  it('suppresses a single bucket that falls below the floor even when the cohort does not', () => {
    // Five leaders clear the cohort floor; only two of them report fundraising time.
    const contributions = [
      contribution({ 'deep-work': 5, 'fundraising-capital': 3 }),
      contribution({ 'deep-work': 6, 'fundraising-capital': 4 }),
      contribution({ 'deep-work': 7 }),
      contribution({ 'deep-work': 8 }),
      contribution({ 'deep-work': 9 }),
    ];

    const view = computeAggregate(contributions, 5);
    expect(view.suppressed).toBe(false);

    const deepWork = view.buckets.find((b) => b.bucketSlug === 'deep-work');
    expect(deepWork?.suppressed).toBe(false);
    expect(deepWork?.leaders).toBe(5);
    expect(deepWork?.medianHours).toBe(7);

    const fundraising = view.buckets.find((b) => b.bucketSlug === 'fundraising-capital');
    expect(fundraising?.suppressed).toBe(true);
    expect(fundraising?.medianHours).toBeNull();
    // The **count goes too**, not just the figure. `leaders: 2` beside a withheld median announces
    // that exactly two leaders report fundraising time — the disclosure the suppression exists to
    // prevent, wearing a different hat. (Raised by `/security-review` on this branch.)
    expect(fundraising?.leaders).toBeNull();
  });

  it('reports the median, so one extreme week does not drag the cohort figure', () => {
    const view = computeAggregate(
      [
        contribution({ 'deep-work': 2 }),
        contribution({ 'deep-work': 3 }),
        contribution({ 'deep-work': 4 }),
        contribution({ 'deep-work': 5 }),
        contribution({ 'deep-work': 90 }),
      ],
      5
    );

    const deepWork = view.buckets.find((b) => b.bucketSlug === 'deep-work');
    expect(deepWork?.medianHours).toBe(4); // the mean would be 20.8
  });

  it('withholds an empty-bucket entry that fewer than the floor of leaders share', () => {
    const contributions = Array.from({ length: 5 }, (_, i) => ({
      hoursByBucket: { 'deep-work': 5 },
      emptyBuckets: i < 2 ? ['learning-development'] : [],
    }));

    const view = computeAggregate(contributions, 5);
    expect(view.mostOftenEmpty).toEqual([]);
  });
});

describe('contributionFromHeads', () => {
  const head = (slotSlug: string, valueJson: unknown) => ({
    slotSlug,
    value: String(valueJson),
    valueJson,
  });

  it('prefers the composite series over the self-reported estimate', () => {
    // I-composite: after a calendar upload the composite is what the leader was actually shown, so
    // an aggregate over the estimate would be a different claim from the one on their own chart.
    const c = contributionFromHeads([
      head('reclaim_current_hours__deep_work', 4),
      head('reclaim_composite_hours__deep_work', 9),
    ]);

    expect(c.hoursByBucket['deep-work']).toBe(9);
  });

  it('falls back to the self-reported hours when there is no composite', () => {
    const c = contributionFromHeads([head('reclaim_current_hours__deep_work', 4)]);
    expect(c.hoursByBucket['deep-work']).toBe(4);
  });

  it('records empty buckets only for a leader who reported time somewhere', () => {
    // An abandoned run would otherwise read as nine deliberate zeroes, and "everyone leaves learning
    // empty" would be an artefact of unfinished audits rather than a fact about anyone's week.
    const unfinished = contributionFromHeads([]);
    expect(unfinished.emptyBuckets).toEqual([]);

    const finished = contributionFromHeads([head('reclaim_current_hours__deep_work', 6)]);
    expect(finished.emptyBuckets.length).toBeGreaterThan(0);
    expect(finished.emptyBuckets).not.toContain('deep-work');
  });

  it('never reads a prose slot, whatever is handed to it', () => {
    const c = contributionFromHeads([
      { slotSlug: 'reclaim_setup_keeping_me_up', value: 'Losing my best person', valueJson: null },
      head('reclaim_current_hours__deep_work', 5),
    ]);

    expect(JSON.stringify(c)).not.toContain('Losing my best person');
    expect(Object.keys(c.hoursByBucket)).toEqual(['deep-work']);
  });
});
