/**
 * Trend lines across audits (F9 t-1). `buildTrends` is pure, so these state a leader's history
 * exactly and read the series back.
 *
 * Load-bearing: hours per audit aligned to the run spine including the gaps (a missing audit is
 * `null`, never 0 — a zero says "they did none of this", which is a different claim); the composite
 * preferred **per audit** rather than per leader; grouping by canonical slug so a rename is one
 * continuous line (I7); and no trend at all from a single audit.
 */

import { describe, it, expect } from 'vitest';
import { buildTrends, type TrendRow, type TrendRun } from '@/lib/app/programme/trends';

const run = (id: string, quarter: string): TrendRun => ({
  runId: id,
  quarter,
  completedAt: '2026-01-01T00:00:00.000Z',
});

const row = (runId: string, slotSlug: string, hours: number, version = 1): TrendRow => ({
  runId,
  slotSlug,
  value: String(hours),
  valueJson: hours,
  version,
});

describe('buildTrends', () => {
  it('lines each bucket up with the run spine, oldest first', () => {
    const runs = [run('r1', 'Q1'), run('r2', 'Q2')];
    const view = buildTrends(runs, [
      row('r1', 'reclaim_current_hours__deep_work', 10),
      row('r2', 'reclaim_current_hours__deep_work', 4),
    ]);

    expect(view.enoughData).toBe(true);
    const deep = view.buckets.find((b) => b.bucketSlug === 'deep-work');
    expect(deep?.hours).toEqual([10, 4]);
  });

  it('uses null for an audit that did not record a bucket, never zero', () => {
    const runs = [run('r1', 'Q1'), run('r2', 'Q2')];
    const view = buildTrends(runs, [
      row('r1', 'reclaim_current_hours__deep_work', 10),
      // r2 recorded something else entirely, so deep work is unknown for it — not zero.
      row('r2', 'reclaim_current_hours__team_development', 6),
    ]);

    const deep = view.buckets.find((b) => b.bucketSlug === 'deep-work');
    expect(deep?.hours).toEqual([10, null]);
  });

  it('drops a bucket no audit ever recorded, rather than drawing a flat line of nothing', () => {
    const view = buildTrends(
      [run('r1', 'Q1'), run('r2', 'Q2')],
      [
        row('r1', 'reclaim_current_hours__deep_work', 10),
        row('r2', 'reclaim_current_hours__deep_work', 8),
      ]
    );

    expect(view.buckets.map((b) => b.bucketSlug)).toEqual(['deep-work']);
  });

  it('prefers the composite per AUDIT, not per leader', () => {
    // I-composite: one audit reconciled a calendar and the next did not. Each should plot what its
    // own leader was shown at the time.
    const runs = [run('r1', 'Q1'), run('r2', 'Q2')];
    const view = buildTrends(runs, [
      row('r1', 'reclaim_current_hours__deep_work', 10),
      row('r1', 'reclaim_composite_hours__deep_work', 13),
      row('r2', 'reclaim_current_hours__deep_work', 4),
    ]);

    expect(view.buckets.find((b) => b.bucketSlug === 'deep-work')?.hours).toEqual([13, 4]);
  });

  it('takes the highest version within an audit — the leader’s correction', () => {
    const view = buildTrends(
      [run('r1', 'Q1'), run('r2', 'Q2')],
      [
        row('r1', 'reclaim_current_hours__deep_work', 10, 1),
        row('r1', 'reclaim_current_hours__deep_work', 12, 2),
        row('r2', 'reclaim_current_hours__deep_work', 4, 3),
      ]
    );

    expect(view.buckets.find((b) => b.bucketSlug === 'deep-work')?.hours).toEqual([12, 4]);
  });

  it('carries a relabel across the whole history as one series (I7)', () => {
    const view = buildTrends(
      [run('r1', 'Q1'), run('r2', 'Q2')],
      [
        row('r1', 'reclaim_current_hours__deep_work', 10),
        row('r2', 'reclaim_current_hours__deep_work', 8),
      ],
      { deep_work: 'Thinking time' }
    );

    const deep = view.buckets.find((b) => b.bucketSlug === 'deep-work');
    // One line, under the name they use now — the canonical slug underneath never moved.
    expect(deep?.title).toBe('Thinking time');
    expect(deep?.hours).toHaveLength(2);
  });

  it('reports not-enough-data for a single audit rather than a one-point trend', () => {
    const view = buildTrends(
      [run('r1', 'Q1')],
      [row('r1', 'reclaim_current_hours__deep_work', 10)]
    );

    expect(view.enoughData).toBe(false);
  });

  it('reports not-enough-data when two audits exist but neither recorded hours', () => {
    const view = buildTrends([run('r1', 'Q1'), run('r2', 'Q2')], []);
    expect(view.enoughData).toBe(false);
    expect(view.buckets).toEqual([]);
  });
});
