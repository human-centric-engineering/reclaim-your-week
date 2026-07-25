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
  if (typeof a.valueJson === 'number' && Number.isFinite(a.valueJson)) return a.valueJson;
  const n = Number(a.value);
  return Number.isFinite(n) ? n : 0;
}

function truthy(a: SlotAnswer): boolean {
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
  const fundraisingRelevant = truthy(answers['reclaim_setup_fundraising_relevant']);

  const rows = RECLAIM_BUCKETS.filter(
    (b) => b.slug !== 'fundraising-capital' || fundraisingRelevant
  ).map((b) => {
    const token = bucketToken(b.slug);
    const hours = round1(num(answers[`reclaim_${source}_hours__${token}`]));
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
