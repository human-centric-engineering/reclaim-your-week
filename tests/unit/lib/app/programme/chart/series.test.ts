/**
 * Chart data derivation (F6 t-3). Pure. Load-bearing: the composite is plotted when a calendar was
 * uploaded and reconciled, the self-reported current otherwise (I-composite); benchmark status is
 * derived from the share; and buckets with no time surface as the priority-gap (§8). Hours are the
 * figure; percent is only a derived display (I8).
 */

import { describe, it, expect } from 'vitest';
import { buildChartData, type Answers } from '@/lib/app/programme/chart/series';

const n = (v: number) => ({ value: String(v), valueJson: v });
const yes = { value: 'Yes', valueJson: true };

describe('buildChartData — source selection (I-composite)', () => {
  it('plots the self-reported current when no calendar was uploaded', () => {
    const answers: Answers = { reclaim_current_hours__deep_work: n(10) };
    const data = buildChartData(answers);
    expect(data.source).toBe('current');
    expect(data.buckets.find((b) => b.token === 'deep_work')?.hours).toBe(10);
  });

  it('plots the composite when a calendar was uploaded and reconciled', () => {
    const answers: Answers = {
      reclaim_calendar_uploaded: yes,
      reclaim_composite_hours__deep_work: n(14),
      reclaim_current_hours__deep_work: n(10),
    };
    const data = buildChartData(answers);
    expect(data.source).toBe('composite');
    expect(data.buckets.find((b) => b.token === 'deep_work')?.hours).toBe(14);
  });

  it('falls back to current when uploaded but the composite was never written', () => {
    const answers: Answers = {
      reclaim_calendar_uploaded: yes,
      reclaim_current_hours__deep_work: n(9),
    };
    const data = buildChartData(answers);
    expect(data.source).toBe('current');
    expect(data.buckets.find((b) => b.token === 'deep_work')?.hours).toBe(9);
  });
});

describe('buildChartData — benchmarks + shares (I8)', () => {
  it('derives percent shares from hours and flags over/under the guide', () => {
    // learning-development guide is ≥5%; strategic-planning is 15–20%.
    const answers: Answers = {
      reclaim_current_hours__learning_development: n(1), // small share → under 5%
      reclaim_current_hours__strategic_planning: n(50), // large share → over 20%
    };
    const data = buildChartData(answers);
    const total = data.totalHours;
    expect(total).toBe(51);
    expect(data.buckets.find((b) => b.token === 'learning_development')?.status).toBe('under');
    expect(data.buckets.find((b) => b.token === 'strategic_planning')?.status).toBe('over');
  });
});

describe('buildChartData — fundraising visibility + priority-gap', () => {
  it('drops the fundraising bucket unless Phase 0 marked it relevant', () => {
    const without = buildChartData({ reclaim_current_hours__deep_work: n(5) });
    expect(without.buckets.some((b) => b.token === 'fundraising_capital')).toBe(false);

    const withIt = buildChartData({
      reclaim_setup_fundraising_relevant: yes,
      reclaim_current_hours__deep_work: n(5),
    });
    expect(withIt.buckets.some((b) => b.token === 'fundraising_capital')).toBe(true);
  });

  it('surfaces zero-time buckets as the priority-gap', () => {
    const data = buildChartData({ reclaim_current_hours__deep_work: n(40) });
    // Every non-fundraising bucket except deep-work has 0 hours → unallocated.
    expect(data.unallocated).toContain('Learning & development');
    expect(data.unallocated).not.toContain('Deep work');
  });
});

describe('buildChartData — value parsing + benchmark edges', () => {
  it('reads hours from the string value when valueJson is absent', () => {
    const data = buildChartData({
      reclaim_current_hours__deep_work: { value: '7', valueJson: null },
    });
    expect(data.buckets.find((b) => b.token === 'deep_work')?.hours).toBe(7);
  });

  it('reads the fundraising flag from the string "Yes" when valueJson is absent', () => {
    const data = buildChartData({
      reclaim_setup_fundraising_relevant: { value: 'Yes', valueJson: null },
      reclaim_current_hours__deep_work: n(5),
    });
    expect(data.buckets.some((b) => b.token === 'fundraising_capital')).toBe(true);
  });

  it('marks a bucket within its guide as "in", and an unbounded bucket as "none"', () => {
    // strategic-planning guide 15–20%: 3h of 20h total = 15% → in range.
    // deep-work has no percentage bounds → none.
    const data = buildChartData({
      reclaim_current_hours__strategic_planning: n(3),
      reclaim_current_hours__deep_work: n(17),
    });
    expect(data.buckets.find((b) => b.token === 'strategic_planning')?.status).toBe('in');
    expect(data.buckets.find((b) => b.token === 'deep_work')?.status).toBe('none');
  });

  it('gives every bucket a 0% share and no total when nothing was entered', () => {
    const data = buildChartData({});
    expect(data.totalHours).toBe(0);
    expect(data.buckets.every((b) => b.percent === 0 && b.hours === 0)).toBe(true);
  });
});

describe('buildChartData — labels (I7)', () => {
  it('applies a user display label but keeps the canonical token', () => {
    const data = buildChartData(
      { reclaim_current_hours__deep_work: n(5) },
      { deep_work: 'Focus time' }
    );
    const bucket = data.buckets.find((b) => b.token === 'deep_work');
    expect(bucket?.title).toBe('Focus time');
    expect(bucket?.slug).toBe('deep-work'); // canonical slug unchanged
  });
});
