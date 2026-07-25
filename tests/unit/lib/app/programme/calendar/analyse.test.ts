/**
 * Calendar upload orchestration (F5 t-2). `categoriseCalendar`, the slot read (`getSlotHeads`), and the
 * write (`saveAnswer`) are mocked, so no DB/LLM. Asserts the persist contract (uploaded flag, per-bucket
 * hours, totals, metrics, ambiguous JSON), that no raw title is written, and the [X]/[Y]/[Z] arithmetic
 * including the Z ≤ 0 case.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { getHeadsMock, saveAnswerMock, categoriseMock } = vi.hoisted(() => ({
  getHeadsMock: vi.fn(),
  saveAnswerMock: vi.fn(),
  categoriseMock: vi.fn(),
}));

vi.mock('@/lib/framework/data-slots', () => ({ getSlotHeads: getHeadsMock }));
vi.mock('@/lib/app/programme/slots/write', () => ({ saveAnswer: saveAnswerMock }));
vi.mock('@/lib/app/programme/calendar/categorise', async (orig) => ({
  ...(await orig<typeof import('@/lib/app/programme/calendar/categorise')>()),
  categoriseCalendar: categoriseMock,
}));

import { analyseCalendarUpload } from '@/lib/app/programme/calendar/analyse';

const ICS =
  'BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:x\nDTSTAMP:20260101T000000Z\nDTSTART:20260105T090000Z\nDTEND:20260105T100000Z\nSUMMARY:Secret meeting title\nEND:VEVENT\nEND:VCALENDAR';

const categorised = {
  perBucketHours: { deep_work: 10, delivery_operations: 20 },
  totalHours: 30,
  metrics: { eventsPerDay: 4, backToBack: 3, longestBlockMinutes: 180 },
  ambiguous: [{ bucketSlug: 'delivery-operations', reasoning: 'generic', hours: 2 }],
  excludedPersonalCount: 1,
};

/** A slot head as getSlotHeads returns it (only slotSlug + value matter here). */
const head = (slotSlug: string, value: string) => ({ slotSlug, value });

beforeEach(() => {
  getHeadsMock.mockReset().mockResolvedValue([]);
  saveAnswerMock.mockReset().mockResolvedValue(undefined);
  categoriseMock.mockReset().mockResolvedValue(categorised);
});

/** Collect the (slug → value/json) that were written. */
const writes = () => new Map(saveAnswerMock.mock.calls.map(([arg]) => [arg.slotSlug, arg]));

describe('analyseCalendarUpload — persistence', () => {
  it('writes the uploaded flag, per-bucket hours, totals, metrics, and ambiguous JSON', async () => {
    await analyseCalendarUpload('u1', 'run-1', ICS, {});
    const w = writes();

    expect(w.get('reclaim_calendar_uploaded')?.valueJson).toBe(true);
    expect(w.get('reclaim_calendar_hours__deep_work')?.valueJson).toBe(10);
    expect(w.get('reclaim_calendar_hours__delivery_operations')?.valueJson).toBe(20);
    expect(w.get('reclaim_calendar_total_hours')?.valueJson).toBe(30);
    expect(w.get('reclaim_calendar_events_per_day')?.valueJson).toBe(4);
    expect(w.get('reclaim_calendar_back_to_back')?.valueJson).toBe(3);
    expect(w.get('reclaim_calendar_longest_block')?.valueJson).toBe(180);
    // I4: persisted ambiguous items carry only structural fields — never the LLM-authored reasoning.
    expect(w.get('reclaim_calendar_ambiguous_items')?.valueJson).toEqual([
      { bucketSlug: 'delivery-operations', hours: 2 },
    ]);
  });

  it('never persists the free-text reasoning of an ambiguous item (I4 defence-in-depth)', async () => {
    categoriseMock.mockResolvedValue({
      ...categorised,
      ambiguous: [
        { bucketSlug: 'deep-work', reasoning: 'Secret meeting title leaked here', hours: 1 },
      ],
    });
    await analyseCalendarUpload('u1', 'run-1', ICS, {});
    const persisted = writes().get('reclaim_calendar_ambiguous_items');
    expect(JSON.stringify(persisted?.valueJson)).not.toContain('Secret meeting title');
  });

  it('every write is run-scoped and routed through saveAnswer (I3)', async () => {
    await analyseCalendarUpload('u1', 'run-1', ICS, {});
    expect(saveAnswerMock.mock.calls.every(([a]) => a.userId === 'u1' && a.runId === 'run-1')).toBe(
      true
    );
  });

  it('never writes a raw meeting title to any slot (I4)', async () => {
    await analyseCalendarUpload('u1', 'run-1', ICS, {});
    const serialised = JSON.stringify(saveAnswerMock.mock.calls);
    expect(serialised).not.toContain('Secret meeting title');
  });

  it('stores the period label only when provided', async () => {
    await analyseCalendarUpload('u1', 'run-1', ICS, {});
    expect(writes().has('reclaim_calendar_period')).toBe(false);
    await analyseCalendarUpload('u1', 'run-1', ICS, { periodLabel: 'Last 4 weeks' });
    expect(writes().get('reclaim_calendar_period')?.value).toBe('Last 4 weeks');
  });
});

describe('analyseCalendarUpload — [X]/[Y]/[Z] arithmetic', () => {
  it('computes unaccounted hours Z = Y − X when the self-report is known', async () => {
    getHeadsMock.mockResolvedValue([head('reclaim_setup_weekly_hours', '50')]);
    const review = await analyseCalendarUpload('u1', 'run-1', ICS, {});
    expect(review.selfReportedWeeklyHours).toBe(50);
    expect(review.totalHours).toBe(30);
    expect(review.unaccountedHours).toBe(20);
    expect(review.calendarMeetsOrExceeds).toBe(false);
  });

  it('handles Z ≤ 0 explicitly when the calendar meets or exceeds the self-report', async () => {
    getHeadsMock.mockResolvedValue([head('reclaim_setup_weekly_hours', '25')]);
    const review = await analyseCalendarUpload('u1', 'run-1', ICS, {});
    expect(review.unaccountedHours).toBe(0); // max(0, 25 − 30)
    expect(review.calendarMeetsOrExceeds).toBe(true);
  });

  it('leaves Z null when the self-report is not captured yet', async () => {
    getHeadsMock.mockResolvedValue([]);
    const review = await analyseCalendarUpload('u1', 'run-1', ICS, {});
    expect(review.selfReportedWeeklyHours).toBeNull();
    expect(review.unaccountedHours).toBeNull();
  });

  it('leaves Z null when the self-report slot is present but non-numeric', async () => {
    getHeadsMock.mockResolvedValue([head('reclaim_setup_weekly_hours', 'about fifty')]);
    const review = await analyseCalendarUpload('u1', 'run-1', ICS, {});
    expect(review.selfReportedWeeklyHours).toBeNull();
    expect(review.unaccountedHours).toBeNull();
  });

  it('passes the Phase 0 context (priorities, fundraising relevance) to the categoriser', async () => {
    getHeadsMock.mockResolvedValue([
      head('reclaim_setup_priorities', 'Growth and fundraising'),
      head('reclaim_setup_fundraising_relevant', 'true'),
    ]);
    await analyseCalendarUpload('u1', 'run-1', ICS, {});
    const [, context] = categoriseMock.mock.calls[0];
    expect(context.priorities).toBe('Growth and fundraising');
    expect(context.fundraisingRelevant).toBe(true);
  });

  it('returns buckets sorted by hours descending with titles', async () => {
    const review = await analyseCalendarUpload('u1', 'run-1', ICS, {});
    expect(review.buckets.map((b) => b.token)).toEqual(['delivery_operations', 'deep_work']);
    expect(review.buckets[0].title).toBe('Delivery & operations');
  });
});
