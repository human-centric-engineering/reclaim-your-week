/**
 * Trend lines across audits (F9 t-1). `buildTrends` is pure, so these state a leader's history
 * exactly and read the series back.
 *
 * Load-bearing: hours per audit aligned to the run spine including the gaps (a missing audit is
 * `null`, never 0 — a zero says "they did none of this", which is a different claim); the composite
 * preferred **per audit** rather than per leader; grouping by canonical slug so a rename is one
 * continuous line (I7); and no trend at all from a single audit.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  runFindMany: vi.fn(),
  slotFindMany: vi.fn(),
  readBucketLabels: vi.fn(),
}));
vi.mock('@/lib/db/client', () => ({
  prisma: {
    reclaimAuditRun: { findMany: mocks.runFindMany },
    slotValue: { findMany: mocks.slotFindMany },
  },
}));
vi.mock('@/lib/app/programme/buckets/labels', () => ({
  readBucketLabels: mocks.readBucketLabels,
}));

import { buildTrends, readTrends, type TrendRow, type TrendRun } from '@/lib/app/programme/trends';

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

  it('reports not-enough-data when no bucket has two points to draw a line between', () => {
    // A leader who completed a second audit without filling in any hours would otherwise get nine
    // bucket names, nine dashes and no lines, under a heading promising a history.
    const view = buildTrends(
      [run('r1', 'Q1'), run('r2', 'Q2')],
      [row('r1', 'reclaim_current_hours__deep_work', 10)]
    );

    expect(view.buckets).toHaveLength(1);
    expect(view.enoughData).toBe(false);
  });

  it('does not plot the conditional bucket for a leader who was never asked about it', () => {
    // `persistComposite` writes all nine composite slots including a literal 0 for the absent ones,
    // so without the relevance flag this drew a flat zero line for an area the audit deliberately
    // never showed them.
    const view = buildTrends(
      [run('r1', 'Q1'), run('r2', 'Q2')],
      [
        row('r1', 'reclaim_current_hours__deep_work', 10),
        row('r2', 'reclaim_current_hours__deep_work', 8),
        {
          runId: 'r1',
          slotSlug: 'reclaim_setup_fundraising_relevant',
          value: 'No',
          valueJson: false,
          version: 1,
        },
        {
          runId: 'r2',
          slotSlug: 'reclaim_setup_fundraising_relevant',
          value: 'No',
          valueJson: false,
          version: 2,
        },
        row('r1', 'reclaim_composite_hours__fundraising_capital', 0),
        row('r2', 'reclaim_composite_hours__fundraising_capital', 0),
      ]
    );

    expect(view.buckets.map((b) => b.bucketSlug)).toEqual(['deep-work']);
  });

  it('does plot it for a leader it IS relevant to', () => {
    const view = buildTrends(
      [run('r1', 'Q1'), run('r2', 'Q2')],
      [
        {
          runId: 'r1',
          slotSlug: 'reclaim_setup_fundraising_relevant',
          value: 'Yes',
          valueJson: true,
          version: 1,
        },
        {
          runId: 'r2',
          slotSlug: 'reclaim_setup_fundraising_relevant',
          value: 'Yes',
          valueJson: true,
          version: 2,
        },
        row('r1', 'reclaim_current_hours__fundraising_capital', 6),
        row('r2', 'reclaim_current_hours__fundraising_capital', 3),
      ]
    );

    expect(view.buckets.map((b) => b.bucketSlug)).toEqual(['fundraising-capital']);
    expect(view.buckets[0]?.hours).toEqual([6, 3]);
  });
});

describe('readTrends', () => {
  const slot = (runId: string, slotSlug: string, hours: number, version = 1) => ({
    slotSlug,
    value: String(hours),
    valueJson: hours,
    version,
    provenance: { runId },
  });

  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.readBucketLabels.mockResolvedValue({});
  });

  it('reads completed audits oldest first and plots them', async () => {
    mocks.runFindMany.mockResolvedValue([
      {
        id: 'r1',
        quarter: 'Q1',
        completedAt: new Date('2026-04-01'),
        startedAt: new Date('2026-03-01'),
      },
      {
        id: 'r2',
        quarter: 'Q2',
        completedAt: new Date('2026-07-01'),
        startedAt: new Date('2026-06-01'),
      },
    ]);
    mocks.slotFindMany.mockResolvedValue([
      slot('r1', 'reclaim_current_hours__deep_work', 10),
      slot('r2', 'reclaim_current_hours__deep_work', 4, 2),
    ]);

    const view = await readTrends('u1');

    expect(view.runs.map((r) => r.quarter)).toEqual(['Q1', 'Q2']);
    expect(view.buckets.find((b) => b.bucketSlug === 'deep-work')?.hours).toEqual([10, 4]);
  });

  it('reads EVERY version, not just heads — the superseded rows are the trend', async () => {
    mocks.runFindMany.mockResolvedValue([
      { id: 'r1', quarter: 'Q1', completedAt: new Date(), startedAt: new Date() },
      { id: 'r2', quarter: 'Q2', completedAt: new Date(), startedAt: new Date() },
    ]);
    mocks.slotFindMany.mockResolvedValue([]);

    await readTrends('u1');

    // The same lesson `readRunAnswers` carries: a `supersededAt: null` filter here would leave every
    // audit but the last one invisible, which is to say there would be no trend.
    const where = mocks.slotFindMany.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(where.where).not.toHaveProperty('supersededAt');
    expect(where.where.userId).toBe('u1');
  });

  it('ignores values belonging to no run, and to a run still in progress', async () => {
    mocks.runFindMany.mockResolvedValue([
      { id: 'r1', quarter: 'Q1', completedAt: new Date(), startedAt: new Date() },
      { id: 'r2', quarter: 'Q2', completedAt: new Date(), startedAt: new Date() },
    ]);
    mocks.slotFindMany.mockResolvedValue([
      slot('r1', 'reclaim_current_hours__deep_work', 10),
      slot('r2', 'reclaim_current_hours__deep_work', 8),
      // A coach `fill_slot` write carries no runId at all (daybreak#167).
      {
        slotSlug: 'reclaim_current_hours__deep_work',
        value: '99',
        valueJson: 99,
        version: 9,
        provenance: { conversationId: 'c1' },
      },
      // An audit still in progress is not on the timeline.
      slot('run-in-flight', 'reclaim_current_hours__deep_work', 1, 10),
    ]);

    const deep = (await readTrends('u1')).buckets.find((b) => b.bucketSlug === 'deep-work');
    expect(deep?.hours).toEqual([10, 8]);
  });

  it('returns nothing to plot for a leader with no completed audit', async () => {
    mocks.runFindMany.mockResolvedValue([]);

    const view = await readTrends('u1');
    expect(view).toEqual({ runs: [], buckets: [], enoughData: false });
    // And does not go looking for slot values it has no runs to attribute.
    expect(mocks.slotFindMany).not.toHaveBeenCalled();
  });

  it('falls back to startedAt for a run with no completedAt', async () => {
    mocks.runFindMany.mockResolvedValue([
      { id: 'r1', quarter: null, completedAt: null, startedAt: new Date('2026-03-01') },
    ]);
    mocks.slotFindMany.mockResolvedValue([]);

    expect((await readTrends('u1')).runs[0]?.completedAt).toBe('2026-03-01T00:00:00.000Z');
  });
});
