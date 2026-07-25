/**
 * Calendar review confirmation (F5 t-3). The leader has seen the by-bucket categorisation, confirmed
 * or corrected the ambiguous items, and answered the "what the calendar misses" questions. This writes
 * the corrections + qualitative answers through the single write path, then computes and persists the
 * composite (I-composite). A correction **reassigns hours between buckets** — it does not re-run the
 * LLM (deterministic, and keeps the raw file out of a second call).
 */

import { RECLAIM_BUCKETS } from '@/lib/app/programme/content';
import { bucketToken } from '@/lib/app/programme/calendar/categorise';
import { persistComposite, type CompositeResult } from '@/lib/app/programme/calendar/composite';
import {
  round1,
  writeCalendarAnswer,
  writeAllBucketHours,
} from '@/lib/app/programme/calendar/store';

const BUCKET_TOKENS = new Set(RECLAIM_BUCKETS.map((b) => bucketToken(b.slug)));

export interface CalendarConfirmInput {
  /** Corrected per-bucket calendar hours (the full map). When present, replaces the categorised totals. */
  corrections?: Record<string, number>;
  /** The leader's attribution of unaccounted (off-calendar) hours to buckets. */
  offCalAttribution?: Record<string, number>;
  /** Qualitative answers, each optional. */
  completeness?: string;
  switchFrequency?: string;
  reactiveTime?: string;
  offCalWork?: string;
  messagingLoad?: string;
}

/** Keep only entries whose key is one of the nine canonical bucket tokens (I7) with a finite value. */
function cleanTokenMap(map: Record<string, number> | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [token, hours] of Object.entries(map ?? {})) {
    if (BUCKET_TOKENS.has(token) && Number.isFinite(hours) && hours >= 0)
      out[token] = round1(hours);
  }
  return out;
}

/**
 * Apply the leader's review and persist the composite. Corrections overwrite **all nine** per-bucket
 * calendar hours and the total (via `writeAllBucketHours`, so a bucket the leader cleared drops to 0
 * rather than keeping its stale value); the qualitative answers land in their text slots; the composite
 * reconciles calendar + off-calendar and records the variance note. Returns the composite for render.
 */
export async function confirmCalendarReview(
  userId: string,
  runId: string,
  input: CalendarConfirmInput
): Promise<CompositeResult> {
  const corrections = cleanTokenMap(input.corrections);
  if (Object.keys(corrections).length > 0) {
    const total = await writeAllBucketHours(
      userId,
      runId,
      'reclaim_calendar_hours__',
      corrections,
      'user_confirmed'
    );
    await writeCalendarAnswer(
      userId,
      runId,
      'reclaim_calendar_total_hours',
      String(total),
      total,
      'user_confirmed'
    );
  }

  const qualitative: Array<[string, string | undefined]> = [
    ['reclaim_calendar_completeness', input.completeness],
    ['reclaim_calendar_switch_frequency', input.switchFrequency],
    ['reclaim_calendar_reactive_time', input.reactiveTime],
    ['reclaim_calendar_offcal_work', input.offCalWork],
    ['reclaim_calendar_messaging_load', input.messagingLoad],
  ];
  for (const [slug, value] of qualitative) {
    if (typeof value === 'string' && value.trim().length > 0) {
      await writeCalendarAnswer(userId, runId, slug, value.trim(), undefined, 'user_confirmed');
    }
  }

  return persistComposite(userId, runId, cleanTokenMap(input.offCalAttribution));
}
