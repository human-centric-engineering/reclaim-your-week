/**
 * The composite picture (F5 t-3, I-composite). `computeComposite` is pure and tested directly;
 * `persistComposite` is tested with the slot read/write mocked. The load-bearing property: the
 * composite is calendar **plus** off-calendar work — never raw calendar totals — and the variance note
 * records where the estimate diverged.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { getHeadsMock, saveAnswerMock } = vi.hoisted(() => ({
  getHeadsMock: vi.fn(),
  saveAnswerMock: vi.fn(),
}));
vi.mock('@/lib/framework/data-slots', () => ({ getSlotHeads: getHeadsMock }));
vi.mock('@/lib/app/programme/slots/write', () => ({ saveAnswer: saveAnswerMock }));

import { computeComposite, persistComposite } from '@/lib/app/programme/calendar/composite';

const head = (slotSlug: string, value: string) => ({ slotSlug, value });

beforeEach(() => {
  getHeadsMock.mockReset().mockResolvedValue([]);
  saveAnswerMock.mockReset().mockResolvedValue(undefined);
});

describe('computeComposite', () => {
  it('adds off-calendar hours to the calendar figure per bucket', () => {
    const { compositeHours } = computeComposite(
      { deep_work: 10, delivery_operations: 20 },
      { deep_work: 5 }
    );
    expect(compositeHours.deep_work).toBe(15); // 10 calendar + 5 off-calendar
    expect(compositeHours.delivery_operations).toBe(20);
  });

  it('omits buckets that reconcile to zero', () => {
    const { compositeHours } = computeComposite({}, {}, { deep_work: 0 });
    expect(compositeHours.deep_work).toBeUndefined();
  });

  it('flags a bucket whose estimate diverges from the composite by ≥ 3 hours', () => {
    const { variance } = computeComposite(
      { delivery_operations: 30 },
      {},
      { delivery_operations: 15 }
    );
    expect(variance).toHaveLength(1);
    expect(variance[0]).toMatchObject({
      token: 'delivery_operations',
      estimate: 15,
      composite: 30,
      delta: 15,
    });
  });

  it('does not flag a small divergence below both thresholds', () => {
    const { variance } = computeComposite({ deep_work: 11 }, {}, { deep_work: 10 });
    expect(variance).toEqual([]); // delta 1h, ratio 10% — under both
  });

  it('flags a proportionally large divergence even under 3 hours', () => {
    const { variance } = computeComposite(
      { learning_development: 0 },
      {},
      { learning_development: 2 }
    );
    // delta −2h is < 3h absolute but 100% of the estimate → significant.
    expect(variance).toHaveLength(1);
    expect(variance[0].delta).toBe(-2);
  });
});

describe('persistComposite', () => {
  it('reconciles calendar + off-cal from slots and writes composite hours + variance note', async () => {
    getHeadsMock.mockImplementation((_userId: string, opts: { slotSlugs: string[] }) => {
      const has = (s: string) => opts.slotSlugs.includes(s);
      const rows = [];
      if (has('reclaim_calendar_hours__deep_work'))
        rows.push(head('reclaim_calendar_hours__deep_work', '10'));
      if (has('reclaim_current_hours__deep_work'))
        rows.push(head('reclaim_current_hours__deep_work', '20'));
      return Promise.resolve(rows);
    });

    const result = await persistComposite('u1', 'run-1', { deep_work: 3 });

    expect(result.compositeHours.deep_work).toBe(13); // 10 calendar + 3 off-cal
    // estimate 20 vs composite 13 → delta −7, significant.
    expect(result.variance).toHaveLength(1);

    const writes = new Map(saveAnswerMock.mock.calls.map(([a]) => [a.slotSlug, a]));
    expect(writes.get('reclaim_composite_hours__deep_work')?.valueJson).toBe(13);
    expect(writes.get('reclaim_composite_variance_note')?.valueJson).toEqual(result.variance);
    expect(saveAnswerMock.mock.calls.every(([a]) => a.userId === 'u1' && a.runId === 'run-1')).toBe(
      true
    );
  });
});
