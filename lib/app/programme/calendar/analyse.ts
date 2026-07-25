/**
 * Calendar upload orchestration (F5 t-2) — the seam between the HTTP route and the privacy-critical
 * core. Parses the `.ics` text in memory, reads the leader's Phase 0 context best-effort, categorises
 * in one LLM call, and persists **only** per-bucket totals + structural metrics + the ambiguous list
 * through `saveAnswer` (I3). Lives in `lib/app` so the framework reads/writes stay out of the
 * core-scanned `app/api` surface. Returns the review payload the shell renders (F5 t-3).
 *
 * Nothing here writes a meeting title, attendee, or description to a slot or a log (I4).
 */

import { z } from 'zod';
import { getSlotHeads } from '@/lib/framework/data-slots';
import { saveAnswer } from '@/lib/app/programme/slots/write';
import { RECLAIM_BUCKETS } from '@/lib/app/programme/content';
import { parseIcs } from '@/lib/app/programme/calendar/parse';
import {
  categoriseCalendar,
  bucketToken,
  type CalendarContext,
  type AmbiguousItem,
  type TaskSwitchMetrics,
} from '@/lib/app/programme/calendar/categorise';

const TITLE_BY_TOKEN = new Map(RECLAIM_BUCKETS.map((b) => [bucketToken(b.slug), b.title]));

export interface CalendarReviewBucket {
  bucketSlug: string;
  token: string;
  title: string;
  hours: number;
}

/** The nine canonical buckets (token + title), so the review can attribute off-calendar hours to any. */
export interface BucketRef {
  token: string;
  title: string;
}

/** The review the leader confirms (F5 t-3). No raw event data — totals, metrics, and ambiguous flags. */
export interface CalendarReview {
  buckets: CalendarReviewBucket[];
  /** All nine buckets (including those with no calendar time), for off-calendar attribution. */
  allBuckets: BucketRef[];
  totalHours: number;
  /** Y — the leader's Phase 0 self-reported weekly hours, or `null` if not captured yet. */
  selfReportedWeeklyHours: number | null;
  /** Z — hours the calendar does not account for (max(0, Y − X)); `null` when Y is unknown. */
  unaccountedHours: number | null;
  /** True when the calendar meets or exceeds the self-report (Z ≤ 0) — a different, non-alarming framing. */
  calendarMeetsOrExceeds: boolean;
  metrics: TaskSwitchMetrics;
  ambiguous: AmbiguousItem[];
  calendarNames: string[];
  truncated: boolean;
  excludedPersonalCount: number;
}

export interface AnalyseOptions {
  windowStart?: Date;
  windowEnd?: Date;
  /** A human label for the analysed period, stored in `reclaim_calendar_period`. */
  periodLabel?: string;
}

const numberHead = z.coerce.number();

/** Read the Phase 0 context that sharpens categorisation. Best-effort — absent slots yield an empty context. */
async function loadCalendarContext(userId: string): Promise<CalendarContext> {
  const heads = await getSlotHeads(userId, {
    slotSlugs: ['reclaim_setup_priorities', 'reclaim_setup_fundraising_relevant'],
  });
  const value = (slug: string) => heads.find((h) => h.slotSlug === slug)?.value;
  const fundraising = value('reclaim_setup_fundraising_relevant');
  return {
    priorities: value('reclaim_setup_priorities') ?? undefined,
    fundraisingRelevant:
      fundraising === undefined ? undefined : fundraising === 'true' || fundraising === 'yes',
  };
}

/** Read Y — the self-reported weekly hours — for the [X]/[Y]/[Z] arithmetic. `null` if not set. */
async function loadSelfReportedWeeklyHours(userId: string): Promise<number | null> {
  const heads = await getSlotHeads(userId, { slotSlugs: ['reclaim_setup_weekly_hours'] });
  const head = heads.find((h) => h.slotSlug === 'reclaim_setup_weekly_hours');
  if (head === undefined) return null;
  const parsed = numberHead.safeParse(head.value);
  return parsed.success ? parsed.data : null;
}

/**
 * Parse → categorise → persist → review. The raw `.ics` text is consumed here and never stored. Writes
 * `reclaim_calendar_*` totals + metrics + ambiguous through the single write path; the composite and
 * the "what the calendar misses" answers are captured later, at review confirmation (F5 t-3).
 */
export async function analyseCalendarUpload(
  userId: string,
  runId: string,
  icsText: string,
  options: AnalyseOptions = {}
): Promise<CalendarReview> {
  const parsed = parseIcs(icsText, {
    windowStart: options.windowStart,
    windowEnd: options.windowEnd,
  });
  const context = await loadCalendarContext(userId);
  const categorised = await categoriseCalendar(parsed.events, context);

  const save = (slotSlug: string, value: string, valueJson?: unknown) =>
    saveAnswer({
      userId,
      runId,
      slotSlug,
      value,
      valueJson: valueJson as Parameters<typeof saveAnswer>[0]['valueJson'],
      sourceType: 'inferred',
      reasoningNote: 'Inferred from the uploaded calendar; no event detail stored (I4).',
    });

  await save('reclaim_calendar_uploaded', 'true', true);
  for (const [token, hours] of Object.entries(categorised.perBucketHours)) {
    await save(`reclaim_calendar_hours__${token}`, String(hours), hours);
  }
  await save(
    'reclaim_calendar_total_hours',
    String(categorised.totalHours),
    categorised.totalHours
  );
  await save(
    'reclaim_calendar_events_per_day',
    String(categorised.metrics.eventsPerDay),
    categorised.metrics.eventsPerDay
  );
  await save(
    'reclaim_calendar_back_to_back',
    String(categorised.metrics.backToBack),
    categorised.metrics.backToBack
  );
  await save(
    'reclaim_calendar_longest_block',
    String(categorised.metrics.longestBlockMinutes),
    categorised.metrics.longestBlockMinutes
  );
  await save(
    'reclaim_calendar_ambiguous_items',
    `${categorised.ambiguous.length} item(s) to confirm`,
    categorised.ambiguous
  );
  if (options.periodLabel) {
    await save('reclaim_calendar_period', options.periodLabel);
  }

  const selfReportedWeeklyHours = await loadSelfReportedWeeklyHours(userId);
  const unaccountedHours =
    selfReportedWeeklyHours === null
      ? null
      : Math.round(Math.max(0, selfReportedWeeklyHours - categorised.totalHours) * 10) / 10;

  const buckets: CalendarReviewBucket[] = Object.entries(categorised.perBucketHours)
    .map(([token, hours]) => ({
      token,
      bucketSlug: token.replace(/_/g, '-'),
      title: TITLE_BY_TOKEN.get(token) ?? token,
      hours,
    }))
    .sort((a, b) => b.hours - a.hours);

  return {
    buckets,
    allBuckets: RECLAIM_BUCKETS.map((b) => ({ token: bucketToken(b.slug), title: b.title })),
    totalHours: categorised.totalHours,
    selfReportedWeeklyHours,
    unaccountedHours,
    calendarMeetsOrExceeds:
      selfReportedWeeklyHours !== null && categorised.totalHours >= selfReportedWeeklyHours,
    metrics: categorised.metrics,
    ambiguous: categorised.ambiguous,
    calendarNames: parsed.calendarNames,
    truncated: parsed.truncated,
    excludedPersonalCount: categorised.excludedPersonalCount,
  };
}
