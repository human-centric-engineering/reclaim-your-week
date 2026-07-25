/**
 * Per-bucket trend lines across a leader's audits (F9 t-1).
 *
 * Brief §2, in Rashmir's own words: _"Yes to the trend line per area and to opening each repeat by
 * comparing with the last."_ This is the read `getSlotHistory` was added for in F1 t-2 — F9 is its
 * first consumer, and the same supersession fact that broke run-scoped reads is what makes a trend
 * possible at all: **every audit's answers are still there**, stamped with their run.
 *
 * ## What this deliberately does not do
 *
 * It returns hours per bucket per audit and nothing else. No deltas rendered as good or bad, no
 * direction-of-travel language, no "improved" / "slipped" — that is **I12's sibling**, and it is the
 * main design risk in this feature. A quarter where a leader deliberately gave time to their team at
 * the cost of strategy is a success that a naive trend line draws as two red arrows. The series is
 * the fact; what it means is theirs (I16).
 *
 * Hours, never percentages (I8). Grouped by canonical `bucketSlug` (I7), so a leader who renamed a
 * bucket still has one continuous line — see `applyLabels` for what a rename does to the history.
 */

import { prisma } from '@/lib/db/client';
import { z } from 'zod';
import { RECLAIM_BUCKETS, bucketToken } from '@/lib/app/programme/content';
import { readBucketLabels } from '@/lib/app/programme/buckets/labels';

const provenanceRunIdSchema = z.object({ runId: z.string() });

/** One audit on the timeline, oldest first. */
export interface TrendRun {
  runId: string;
  /** The period the leader was auditing ("2026 Q3"), which is the honest x-axis label. */
  quarter: string | null;
  completedAt: string;
}

export interface TrendBucket {
  bucketSlug: string;
  /** The leader's current label for it, else the canonical title (I7 — the slug never changes). */
  title: string;
  /** Hours per audit, aligned to `runs` by index. `null` where that audit recorded nothing. */
  hours: Array<number | null>;
}

export interface TrendView {
  runs: TrendRun[];
  buckets: TrendBucket[];
  /**
   * False when there is nothing to compare yet. The UI shows an invitation to come back rather than
   * a one-point "trend", which would be a chart making a claim out of a single observation.
   */
  enoughData: boolean;
}

/** The slugs a trend reads: the composite where a calendar was reconciled, else the self-report. */
function hoursSlugs(): string[] {
  return RECLAIM_BUCKETS.flatMap((b) => {
    const token = bucketToken(b.slug);
    return [`reclaim_composite_hours__${token}`, `reclaim_current_hours__${token}`];
  });
}

/** A slot value as a number, or `null` — the same coercion the chart and the aggregate use. */
function numeric(row: { value: string; valueJson: unknown } | undefined): number | null {
  if (row === undefined) return null;
  if (typeof row.valueJson === 'number' && Number.isFinite(row.valueJson)) return row.valueJson;
  const parsed = Number.parseFloat(row.value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** One slot version, reduced to what a trend needs. */
export interface TrendRow {
  slotSlug: string;
  value: string;
  valueJson: unknown;
  version: number;
  runId: string;
}

/**
 * Build the series from rows and the run timeline. Pure — no Prisma, no clock — so a test can state
 * three audits and read the shape back.
 *
 * `runs` is the spine: every bucket's `hours` array is aligned to it by index, including the `null`s,
 * so the UI never has to reconcile two orderings. A bucket a leader never reported time in at all is
 * dropped, because a flat line of nulls is not a trend.
 */
export function buildTrends(
  runs: TrendRun[],
  rows: TrendRow[],
  labels: Record<string, string> = {}
): TrendView {
  // Highest version per (runId, slotSlug) — a leader who corrected a figure mid-audit gets the
  // correction, matching what `readRunAnswers` returns for that same run.
  const latest = new Map<string, TrendRow>();
  for (const row of rows) {
    const key = `${row.runId}::${row.slotSlug}`;
    const held = latest.get(key);
    if (held === undefined || row.version > held.version) latest.set(key, row);
  }

  const buckets: TrendBucket[] = [];
  for (const bucket of RECLAIM_BUCKETS) {
    const token = bucketToken(bucket.slug);
    const hours = runs.map((run) => {
      // I-composite: prefer the composite where that audit reconciled a calendar, matching what the
      // leader was actually shown at the time. Per audit, not per leader — one audit may have had a
      // calendar and the next not.
      const composite = latest.get(`${run.runId}::reclaim_composite_hours__${token}`);
      const current = latest.get(`${run.runId}::reclaim_current_hours__${token}`);
      return numeric(composite) ?? numeric(current);
    });

    if (hours.every((h) => h === null)) continue;
    buckets.push({ bucketSlug: bucket.slug, title: labels[token] ?? bucket.title, hours });
  }

  return { runs, buckets, enoughData: runs.length >= 2 && buckets.length > 0 };
}

/**
 * A leader's trends across their completed audits.
 *
 * Two queries regardless of how many audits they have: the run timeline, and every hours version they
 * have ever recorded. Bounded by 18 slugs per audit, so this stays small by construction.
 */
export async function readTrends(userId: string): Promise<TrendView> {
  const completed = await prisma.reclaimAuditRun.findMany({
    where: { userId, status: 'complete' },
    orderBy: { startedAt: 'asc' },
    select: { id: true, quarter: true, completedAt: true, startedAt: true },
  });

  const runs: TrendRun[] = completed.map((run) => ({
    runId: run.id,
    quarter: run.quarter,
    // `completedAt` is set by `completeRun`; fall back to the start for any row that predates it.
    completedAt: (run.completedAt ?? run.startedAt).toISOString(),
  }));

  if (runs.length === 0) return { runs, buckets: [], enoughData: false };

  const [values, labels] = await Promise.all([
    // Every version, not just heads — a past audit's hours are superseded by the next audit's, and
    // those superseded rows ARE the trend. This is the same lesson `readRunAnswers` carries.
    prisma.slotValue.findMany({
      where: { userId, slotSlug: { in: hoursSlugs() } },
      orderBy: { version: 'asc' },
      select: { slotSlug: true, value: true, valueJson: true, version: true, provenance: true },
    }),
    readBucketLabels(userId),
  ]);

  const runIds = new Set(runs.map((r) => r.runId));
  const rows: TrendRow[] = [];
  for (const value of values) {
    const parsed = provenanceRunIdSchema.safeParse(value.provenance);
    // Values with no run (the coach's `fill_slot` writes — daybreak#167) and values from a run still
    // in progress are both excluded: a trend is a line through *completed* audits.
    if (!parsed.success || !runIds.has(parsed.data.runId)) continue;
    rows.push({
      slotSlug: value.slotSlug,
      value: value.value,
      valueJson: value.valueJson,
      version: value.version,
      runId: parsed.data.runId,
    });
  }

  return buildTrends(runs, rows, labels);
}
