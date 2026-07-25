/**
 * The composite picture (F5 t-3, I-composite). After an upload, the Phase 1 chart must show calendar
 * data **plus** the off-calendar work the "what the calendar misses" questions surface — not raw
 * calendar totals (which would discard the self-report and invert the tool's stance that the calendar
 * is evidence, not verdict). This computes the reconciled per-bucket figure and the variance note,
 * and persists them to `reclaim_composite_*` — the third home distinct from the estimate
 * (`reclaim_current_*`) and the calendar (`reclaim_calendar_*`). **F6 t-3 plots this; F5 computes it.**
 */

import {
  round1,
  readHourSlots,
  writeCalendarAnswer,
  writeAllBucketHours,
} from '@/lib/app/programme/calendar/store';

/** A significant divergence between the Phase 1 estimate and the composite reality, for the chart note. */
export interface VarianceEntry {
  token: string;
  estimate: number;
  composite: number;
  /** composite − estimate (positive = the calendar/off-cal picture is higher than they thought). */
  delta: number;
}

export interface CompositeResult {
  /** Bucket token → reconciled hours (calendar + off-calendar). Zero buckets omitted. */
  compositeHours: Record<string, number>;
  variance: VarianceEntry[];
}

/** A divergence counts as significant at ≥ 3 hours OR ≥ 25% of the estimate — the chart's "small note". */
const VARIANCE_MIN_HOURS = 3;
const VARIANCE_MIN_RATIO = 0.25;

/**
 * Pure reconciliation: composite = calendar + off-calendar, per bucket, with a variance entry wherever
 * the Phase 1 estimate diverged significantly. Off-calendar hours are the leader's own attribution of
 * the unaccounted time (Z) to buckets — the "what fills that time?" answers.
 */
export function computeComposite(
  calendarHours: Record<string, number>,
  offCalHours: Record<string, number>,
  estimateHours: Record<string, number> = {}
): CompositeResult {
  const tokens = new Set([
    ...Object.keys(calendarHours),
    ...Object.keys(offCalHours),
    ...Object.keys(estimateHours),
  ]);

  const compositeHours: Record<string, number> = {};
  const variance: VarianceEntry[] = [];

  for (const token of tokens) {
    const composite = round1((calendarHours[token] ?? 0) + (offCalHours[token] ?? 0));
    if (composite > 0) compositeHours[token] = composite;

    const estimate = estimateHours[token];
    if (estimate !== undefined) {
      const delta = round1(composite - estimate);
      const significant =
        Math.abs(delta) >= VARIANCE_MIN_HOURS ||
        (estimate > 0 && Math.abs(delta) / estimate >= VARIANCE_MIN_RATIO);
      if (significant) variance.push({ token, estimate, composite, delta });
    }
  }

  return { compositeHours, variance };
}

/**
 * Read the calendar totals + Phase 1 estimate for this run, reconcile with the leader's off-calendar
 * attribution, and persist the composite hours + variance note (I-composite). Returns the result so
 * the review UI can render it immediately. Only written when a calendar was uploaded.
 */
export async function persistComposite(
  userId: string,
  runId: string,
  offCalHours: Record<string, number>
): Promise<CompositeResult> {
  const calendarHours = await readHourSlots(userId, 'reclaim_calendar_hours__');
  const estimateHours = await readHourSlots(userId, 'reclaim_current_hours__');

  const result = computeComposite(calendarHours, offCalHours, estimateHours);

  const note = 'Composite of calendar and off-calendar work (I-composite); no event detail stored.';
  // Write all nine composite slots (0 for absent) so a re-confirmation can't leave a stale figure.
  await writeAllBucketHours(
    userId,
    runId,
    'reclaim_composite_hours__',
    result.compositeHours,
    'synthesised'
  );
  await writeCalendarAnswer(
    userId,
    runId,
    'reclaim_composite_variance_note',
    `${result.variance.length} bucket(s) diverged from the estimate`,
    result.variance,
    'synthesised',
    note
  );

  return result;
}
