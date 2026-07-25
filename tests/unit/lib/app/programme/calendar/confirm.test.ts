/**
 * Calendar review confirmation (F5 t-3). `persistComposite`, the slot read, and the write are mocked.
 * Asserts: corrections overwrite the per-bucket hours + total, invalid tokens are dropped (I7),
 * qualitative answers are written only when non-empty, and the composite is computed from the cleaned
 * off-calendar attribution.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { saveAnswerMock, persistCompositeMock } = vi.hoisted(() => ({
  saveAnswerMock: vi.fn(),
  persistCompositeMock: vi.fn(),
}));
vi.mock('@/lib/app/programme/slots/write', () => ({ saveAnswer: saveAnswerMock }));
vi.mock('@/lib/app/programme/calendar/composite', () => ({
  persistComposite: persistCompositeMock,
}));

import { confirmCalendarReview } from '@/lib/app/programme/calendar/confirm';

beforeEach(() => {
  saveAnswerMock.mockReset().mockResolvedValue(undefined);
  persistCompositeMock.mockReset().mockResolvedValue({ compositeHours: {}, variance: [] });
});

const writes = () => new Map(saveAnswerMock.mock.calls.map(([a]) => [a.slotSlug, a]));

describe('confirmCalendarReview', () => {
  it('overwrites per-bucket calendar hours and the total from the corrections', async () => {
    await confirmCalendarReview('u1', 'run-1', {
      corrections: { deep_work: 12, delivery_operations: 8 },
    });
    const w = writes();
    expect(w.get('reclaim_calendar_hours__deep_work')?.valueJson).toBe(12);
    expect(w.get('reclaim_calendar_hours__delivery_operations')?.valueJson).toBe(8);
    expect(w.get('reclaim_calendar_total_hours')?.valueJson).toBe(20);
  });

  it('drops non-canonical/negative corrections (I7) and zeroes untouched buckets', async () => {
    await confirmCalendarReview('u1', 'run-1', {
      corrections: { deep_work: 5, not_a_bucket: 99, delivery_operations: -3 },
    });
    const w = writes();
    // The one valid correction is written; a rejected bucket (negative) is written as 0, not stale;
    // a non-bucket key never becomes a slot.
    expect(w.get('reclaim_calendar_hours__deep_work')?.valueJson).toBe(5);
    expect(w.get('reclaim_calendar_hours__delivery_operations')?.valueJson).toBe(0);
    expect(w.has('reclaim_calendar_hours__not_a_bucket')).toBe(false);
    // Total reflects only the valid correction.
    expect(w.get('reclaim_calendar_total_hours')?.valueJson).toBe(5);
  });

  it('writes all nine bucket slots so a cleared bucket cannot keep a stale value', async () => {
    await confirmCalendarReview('u1', 'run-1', { corrections: { deep_work: 5 } });
    const hourWrites = saveAnswerMock.mock.calls
      .map(([a]) => a.slotSlug)
      .filter((s: string) => s.startsWith('reclaim_calendar_hours__'));
    expect(hourWrites).toHaveLength(9);
  });

  it('writes each qualitative answer only when non-empty', async () => {
    await confirmCalendarReview('u1', 'run-1', {
      completeness: 'Mostly complete.',
      offCalWork: '  ',
      messagingLoad: 'A lot of Slack.',
    });
    const w = writes();
    expect(w.get('reclaim_calendar_completeness')?.value).toBe('Mostly complete.');
    expect(w.get('reclaim_calendar_messaging_load')?.value).toBe('A lot of Slack.');
    expect(w.has('reclaim_calendar_offcal_work')).toBe(false); // whitespace only
  });

  it('does not touch calendar hours when no corrections are given', async () => {
    await confirmCalendarReview('u1', 'run-1', { completeness: 'x' });
    const slugs = saveAnswerMock.mock.calls.map(([a]) => a.slotSlug);
    expect(slugs.some((s: string) => s.startsWith('reclaim_calendar_hours__'))).toBe(false);
    expect(slugs).not.toContain('reclaim_calendar_total_hours');
  });

  it('computes the composite from the cleaned off-calendar attribution and returns it', async () => {
    persistCompositeMock.mockResolvedValue({ compositeHours: { deep_work: 15 }, variance: [] });
    const result = await confirmCalendarReview('u1', 'run-1', {
      offCalAttribution: { deep_work: 3, bogus: 10 },
    });
    expect(persistCompositeMock).toHaveBeenCalledWith('u1', 'run-1', { deep_work: 3 });
    expect(result.compositeHours.deep_work).toBe(15);
  });
});
