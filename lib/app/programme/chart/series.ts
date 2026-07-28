/**
 * Chart data derivation (F6 t-3) — pure, client-safe (imports only the `content` data). Turns a run's
 * answers into the `<ReclaimChart>` series: which figure to plot (composite when a calendar was
 * uploaded and reconciled, else the self-reported current, I-composite), the benchmark status per
 * bucket, and the **priority-gap** (buckets with no time — "often the most important insight", §8).
 * Renders no interpretation (I12) — it produces numbers + flags; the chart draws them.
 */

import { RECLAIM_BUCKETS, bucketToken } from '@/lib/app/programme/content';

export type SlotAnswer = { value: string; valueJson: unknown } | undefined;
export type Answers = Record<string, SlotAnswer>;

export type BenchmarkStatus = 'under' | 'in' | 'over' | 'none';

export interface ChartBucket {
  token: string;
  slug: string;
  title: string;
  hours: number;
  /** Share of the week's total, as a derived display value (I8 — never an input). */
  percent: number;
  lowPercent: number | null;
  highPercent: number | null;
  status: BenchmarkStatus;
}

export interface ChartData {
  /** `composite` when a calendar was uploaded + reconciled, else the self-reported `current`. */
  source: 'composite' | 'current';
  buckets: ChartBucket[];
  totalHours: number;
  /** Bucket titles with zero time this period — the priority-gap element (§8). */
  unallocated: string[];
}

function num(a: SlotAnswer): number {
  if (a === undefined) return 0;
  const raw =
    typeof a.valueJson === 'number' && Number.isFinite(a.valueJson) ? a.valueJson : Number(a.value);
  // Hours are non-negative; clamp so a stray "-5" can't distort the total, the shares, or a bar width.
  return Number.isFinite(raw) ? Math.max(0, raw) : 0;
}

/**
 * One canonical reading of "hours per bucket, for this run's answers" (F9, consolidating four).
 *
 * By F9 there were four implementations of this — the chart, the comparison, the trends and the admin
 * aggregate — and they had already drifted apart in two ways that mattered:
 *
 *   - only two of them dropped a **conditional** bucket the leader was never asked about. That is not
 *     cosmetic: `persistComposite` writes all nine composite slots including `0` for the absent ones,
 *     so a leader who said fundraising was irrelevant and then uploaded a calendar had a real `0`
 *     stored — and a reader without the guard showed "Fundraising & capital · 0h" for an area the
 *     audit deliberately never put in front of them;
 *   - the numeric coercion disagreed on negatives (`num` clamps, the others did not).
 *
 * Returns `null` for "not asked / not answered" and a number for an answered value, so callers can
 * keep the distinction the plan insists on: a gap is not a zero.
 */
export function bucketHours(answers: Answers): Map<string, number | null> {
  const fundraisingRelevant = truthy(answers['reclaim_setup_fundraising_relevant']);
  const out = new Map<string, number | null>();

  for (const bucket of RECLAIM_BUCKETS) {
    const token = bucketToken(bucket.slug);
    const composite = answers[`reclaim_composite_hours__${token}`];
    const current = answers[`reclaim_current_hours__${token}`];

    // A conditional bucket that the leader was never shown is absent, not zero — whatever is stored.
    if (bucket.conditional && !fundraisingRelevant) {
      out.set(bucket.slug, null);
      continue;
    }
    if (composite === undefined && current === undefined) {
      out.set(bucket.slug, null);
      continue;
    }

    // I-composite: prefer the composite where this run reconciled a calendar, matching what the
    // leader was shown at the time.
    out.set(bucket.slug, num(composite !== undefined ? composite : current));
  }
  return out;
}

/** Read a boolean slot answer (yes/no fields) from either the typed `valueJson` or the prose value. */
export function truthy(a: SlotAnswer): boolean {
  if (a === undefined) return false;
  if (typeof a.valueJson === 'boolean') return a.valueJson;
  return a.value === 'Yes' || a.value === 'true';
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function benchmarkStatus(
  percent: number,
  low: number | null,
  high: number | null
): BenchmarkStatus {
  if (low === null && high === null) return 'none';
  if (low !== null && percent < low) return 'under';
  if (high !== null && percent > high) return 'over';
  return 'in';
}

/**
 * Build the chart series from a run's answers. Applies a per-bucket display label where given (F6 t-4).
 * The fundraising bucket is dropped when Phase 0 said fundraising is not relevant.
 */
export function buildChartData(answers: Answers, labels: Record<string, string> = {}): ChartData {
  const uploaded = truthy(answers['reclaim_calendar_uploaded']);
  const compositePresent = RECLAIM_BUCKETS.some(
    (b) => answers[`reclaim_composite_hours__${bucketToken(b.slug)}`] !== undefined
  );
  const source: ChartData['source'] = uploaded && compositePresent ? 'composite' : 'current';
  return chartSeries(answers, labels, `reclaim_${source}_hours__`, source);
}

/**
 * The same series, read from the week the leader **designed** rather than the one they reported.
 *
 * Nine `reclaim_ideal_hours__<token>` lanes, the same benchmarks, the same arithmetic. Extracted
 * rather than hand-rolled beside it because "which areas sit away from the guide" has to mean the
 * same thing in both weeks or the comparison between them is not a comparison. The only difference
 * between the two callers is the slug prefix.
 *
 * `source` stays `'current'` here: that field distinguishes reported hours from calendar-reconciled
 * ones, a question the ideal week does not have, and widening its meaning would change a published
 * shape the client already reads.
 */
export function buildIdealChartData(
  answers: Answers,
  labels: Record<string, string> = {}
): ChartData {
  return chartSeries(answers, labels, 'reclaim_ideal_hours__', 'current');
}

/** The shared body: rows, total, percentages, benchmark status, and the zero-hour list. */
function chartSeries(
  answers: Answers,
  labels: Record<string, string>,
  prefix: string,
  source: ChartData['source']
): ChartData {
  const fundraisingRelevant = truthy(answers['reclaim_setup_fundraising_relevant']);

  const rows = RECLAIM_BUCKETS.filter(
    (b) => b.slug !== 'fundraising-capital' || fundraisingRelevant
  ).map((b) => {
    const token = bucketToken(b.slug);
    const hours = round1(num(answers[`${prefix}${token}`]));
    return { bucket: b, token, hours };
  });

  const totalHours = round1(rows.reduce((sum, r) => sum + r.hours, 0));

  const buckets: ChartBucket[] = rows.map(({ bucket, token, hours }) => {
    const percent = totalHours > 0 ? Math.round((hours / totalHours) * 100) : 0;
    return {
      token,
      slug: bucket.slug,
      title: labels[token] ?? bucket.title,
      hours,
      percent,
      lowPercent: bucket.benchmark.lowPercent,
      highPercent: bucket.benchmark.highPercent,
      status: benchmarkStatus(percent, bucket.benchmark.lowPercent, bucket.benchmark.highPercent),
    };
  });

  const unallocated = buckets.filter((b) => b.hours === 0).map((b) => b.title);

  return { source, buckets, totalHours, unallocated };
}
