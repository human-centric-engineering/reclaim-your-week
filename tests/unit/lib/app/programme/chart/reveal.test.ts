/**
 * The chart reveal condition (I12).
 *
 * Pure arithmetic over a run's answers, so these tests need no mocks and no database. What they are
 * really pinning is the distinction the surfaces got wrong for a whole version: **ready is not the
 * same as has-something-to-draw.** Both paths used to render the chart as soon as one figure existed,
 * which meant the leader assembled their week one bar at a time and there was no picture left to
 * reveal by the time the phase ended.
 */

import { describe, it, expect } from 'vitest';
import {
  chartRevealReady,
  chartRevealed,
  chartRevealState,
  CHART_REVEAL_MOMENT,
} from '@/lib/app/programme/chart/reveal';
import { RECLAIM_BUCKETS, bucketToken } from '@/lib/app/programme/content';
import type { Answers } from '@/lib/app/programme/chart/series';

const yes = { value: 'Yes', valueJson: true };
const hours = (n: number) => ({ value: String(n), valueJson: n });

/** Every visible bucket answered, with fundraising included or not. */
function fullWeek(fundraising: boolean): Answers {
  const answers: Answers = {};
  if (fundraising) answers['reclaim_setup_fundraising_relevant'] = yes;
  for (const bucket of RECLAIM_BUCKETS) {
    if (bucket.conditional && !fundraising) continue;
    answers[`reclaim_current_hours__${bucketToken(bucket.slug)}`] = hours(4);
  }
  return answers;
}

describe('chartRevealReady', () => {
  it('is false for an empty run', () => {
    expect(chartRevealReady({})).toBe(false);
  });

  it('is false while a single visible area is still missing its figure', () => {
    const answers = fullWeek(false);
    const first = RECLAIM_BUCKETS.find((b) => !b.conditional)!;
    delete answers[`reclaim_current_hours__${bucketToken(first.slug)}`];
    expect(chartRevealReady(answers)).toBe(false);
  });

  it('is false when only one area has been answered, which is the old trigger', () => {
    // The condition both surfaces used to draw on. Named explicitly so a future change that
    // reintroduces it fails here rather than quietly removing the reveal beat again.
    const first = RECLAIM_BUCKETS.find((b) => !b.conditional)!;
    expect(
      chartRevealReady({ [`reclaim_current_hours__${bucketToken(first.slug)}`]: hours(9) })
    ).toBe(false);
  });

  it('is true once every visible area has a figure', () => {
    expect(chartRevealReady(fullWeek(false))).toBe(true);
  });

  it('does not wait for an area the leader was never asked about', () => {
    // Fundraising is conditional. A leader who said it is not relevant never saw the field, so
    // requiring it would leave them with a button that never arrives.
    const answers = fullWeek(false);
    const conditional = RECLAIM_BUCKETS.find((b) => b.conditional)!;
    expect(answers[`reclaim_current_hours__${bucketToken(conditional.slug)}`]).toBeUndefined();
    expect(chartRevealReady(answers)).toBe(true);
  });

  it('does wait for the conditional area when the leader said it is relevant', () => {
    const answers = fullWeek(true);
    const conditional = RECLAIM_BUCKETS.find((b) => b.conditional)!;
    delete answers[`reclaim_current_hours__${bucketToken(conditional.slug)}`];
    expect(chartRevealReady(answers)).toBe(false);
  });

  it('waits for the composite where a calendar was uploaded (I-composite)', () => {
    // Between the upload and the reconciliation the only figures available are the raw calendar
    // totals, and the product explicitly does not stand behind those as a picture of a week.
    const answers: Answers = { ...fullWeek(false), reclaim_calendar_uploaded: yes };
    expect(chartRevealReady(answers)).toBe(false);

    for (const bucket of RECLAIM_BUCKETS) {
      if (bucket.conditional) continue;
      answers[`reclaim_composite_hours__${bucketToken(bucket.slug)}`] = hours(5);
    }
    expect(chartRevealReady(answers)).toBe(true);
  });
});

describe('chartRevealed', () => {
  it('reads the run ledger rather than the answers', () => {
    expect(chartRevealed([])).toBe(false);
    expect(chartRevealed(['phase-4-gap'])).toBe(false);
    expect(chartRevealed([CHART_REVEAL_MOMENT])).toBe(true);
  });
});

describe('chartRevealState', () => {
  it('walks not-ready to ready to revealed', () => {
    expect(chartRevealState({}, [])).toBe('not-ready');
    expect(chartRevealState(fullWeek(false), [])).toBe('ready');
    expect(chartRevealState(fullWeek(false), [CHART_REVEAL_MOMENT])).toBe('revealed');
  });

  it('stays revealed even if answers later stop qualifying', () => {
    // A leader who has seen their week has seen it. Editing a figure afterwards must not take the
    // chart away and re-close the transition gate behind them.
    expect(chartRevealState({}, [CHART_REVEAL_MOMENT])).toBe('revealed');
  });
});
