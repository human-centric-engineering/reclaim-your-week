/**
 * The anonymised cross-client picture (F10 t-3).
 *
 * Brief §2 asks for patterns across clients **and** promises that individual data stays confidential.
 * Those two only coexist under three rules, and each is enforced here rather than intended:
 *
 *   1. **Consent-filtered.** Only leaders with a recorded `ReclaimConsent` are in the cohort. The
 *      Brief's own wording is that the terms "should allow for data to be used in aggregate", and F8
 *      t-4 recorded consent so this query could rely on it. Consent captured retroactively is not
 *      consent, so a leader with no record is simply absent — not defaulted in.
 *   2. **A cohort floor.** Below `aggregateMinimumCohort` the figure is suppressed rather than
 *      rounded. In a private beta of a dozen leaders, "the average across nonprofit CEOs" can quietly
 *      be one identifiable person, and an average over two is a disclosure with a mean sign on it.
 *   3. **Numbers and canonical slugs only.** No free text is ever pooled. Nothing here touches
 *      `reclaim_setup_keeping_me_up` — that slot's whole sensitivity classification exists to keep it
 *      out of places like this.
 *
 * Grouping is by canonical `bucketSlug` (I7), never by a leader's `ReclaimBucketLabel` display name:
 * two leaders who renamed "Strategic planning" differently are still the same bucket, which is the
 * reason I7 says the storage key never changes.
 *
 * The median, not the mean: one leader reporting a 90-hour week should not drag a cohort figure, and
 * with a small n the mean is the more disclosive statistic of the two.
 */

import { prisma } from '@/lib/db/client';
import { getSlotHeads } from '@/lib/framework/data-slots/values';
import { RECLAIM_BUCKETS, bucketToken } from '@/lib/app/programme/content';
import { readReclaimAdminConfig } from '@/lib/app/programme/config';

export interface AggregateBucket {
  bucketSlug: string;
  title: string;
  /** How many consenting leaders reported any hours in this bucket — `null` when suppressed. */
  leaders: number | null;
  /** Median weekly hours across those leaders, or `null` when suppressed. */
  medianHours: number | null;
  suppressed: boolean;
}

export interface AggregateView {
  /** Consenting leaders with at least one completed audit — the population every figure is over. */
  cohort: number;
  minimumCohort: number;
  /** True when the whole aggregate is withheld because the cohort itself is too small. */
  suppressed: boolean;
  buckets: AggregateBucket[];
  /**
   * The buckets most often left at **zero hours** across the cohort.
   *
   * Note what this is not. §8's priority gap — a priority with no protected time — is captured per
   * leader in `reclaim_gap_unfunded_priorities`, which is a **`sensitive` free-text** slot, and rule 3
   * forbids pooling free text. So the aggregate reports the machine-readable half honestly rather
   * than approximating the sensitive half: which parts of the week are most commonly empty. Calling
   * it a "priority gap" would claim knowledge of what these leaders said mattered, which this figure
   * does not have.
   */
  mostOftenEmpty: Array<{ bucketSlug: string; title: string; leaders: number }>;
}

/** One consenting leader's contribution: hours per canonical bucket slug. Numbers only. */
export interface AggregateContribution {
  hoursByBucket: Record<string, number>;
  /** Buckets this leader reported no time in, having reported time somewhere. */
  emptyBuckets: string[];
}

/** The middle value, or the mean of the two middle values. Assumes a non-empty list. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2 === 0
      ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
      : (sorted[mid] ?? 0);
  return Math.round(value * 10) / 10;
}

/**
 * The aggregate, from contributions. Pure — no Prisma, no config lookup — so a test can state a
 * cohort of exactly four and assert the whole thing is suppressed.
 */
export function computeAggregate(
  contributions: AggregateContribution[],
  minimumCohort: number
): AggregateView {
  const cohort = contributions.length;
  const base = {
    cohort,
    minimumCohort,
    buckets: [] as AggregateBucket[],
    mostOftenEmpty: [] as AggregateView['mostOftenEmpty'],
  };

  // Below the floor, nothing is reported at all — not even per-bucket counts, which would leak the
  // cohort's shape one column at a time.
  if (cohort < minimumCohort) return { ...base, suppressed: true };

  const buckets: AggregateBucket[] = RECLAIM_BUCKETS.map((bucket) => {
    const values = contributions
      .map((c) => c.hoursByBucket[bucket.slug])
      .filter((h): h is number => h !== undefined && h > 0);

    // A bucket can fall below the floor even when the cohort does not — the fundraising bucket only
    // appears for leaders it is relevant to, so its own n is genuinely smaller.
    //
    // When it is suppressed the **count goes too**, not just the median. An earlier version returned
    // `leaders: 1` beside a withheld figure, which announces that exactly one leader reports time in
    // this bucket — the same disclosure the suppression exists to prevent, wearing a different hat.
    // No privilege boundary is crossed either way (the reader is an admin who could open the client
    // record), but this is the surface that promises "withheld below the floor", and a promise that
    // holds for the median and not the count is not the promise it appears to be.
    const suppressed = values.length < minimumCohort;
    return {
      bucketSlug: bucket.slug,
      title: bucket.title,
      leaders: suppressed ? null : values.length,
      medianHours: suppressed ? null : median(values),
      suppressed,
    };
  });

  const emptyCounts = new Map<string, number>();
  for (const contribution of contributions) {
    for (const slug of contribution.emptyBuckets) {
      emptyCounts.set(slug, (emptyCounts.get(slug) ?? 0) + 1);
    }
  }

  const mostOftenEmpty = [...emptyCounts.entries()]
    .filter(([, leaders]) => leaders >= minimumCohort)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([slug, leaders]) => ({
      bucketSlug: slug,
      title: RECLAIM_BUCKETS.find((b) => b.slug === slug)?.title ?? slug,
      leaders,
    }));

  return { ...base, suppressed: false, buckets, mostOftenEmpty };
}

/** A slot value as a number, or `null` — the same coercion the chart uses. */
function numeric(head: { value: string | null; valueJson: unknown } | undefined): number | null {
  if (head === undefined) return null;
  if (typeof head.valueJson === 'number' && Number.isFinite(head.valueJson)) return head.valueJson;
  const parsed = Number.parseFloat(head.value ?? '');
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Build one leader's contribution from their slot heads. Prefers the composite (calendar + discursive
 * additions, I-composite) over the self-reported estimate, matching what F6 actually plots — an
 * aggregate over a different series than the one leaders were shown would be a different claim.
 */
export function contributionFromHeads(
  heads: Array<{ slotSlug: string; value: string | null; valueJson: unknown }>
): AggregateContribution {
  const bySlug = new Map(heads.map((h) => [h.slotSlug, h]));
  const hoursByBucket: Record<string, number> = {};
  const zero: string[] = [];

  for (const bucket of RECLAIM_BUCKETS) {
    const token = bucketToken(bucket.slug);
    const composite = bySlug.get(`reclaim_composite_hours__${token}`);
    const current = bySlug.get(`reclaim_current_hours__${token}`);
    const hours = numeric(composite) ?? numeric(current);

    if (hours !== null && hours > 0) {
      hoursByBucket[bucket.slug] = hours;
      continue;
    }

    // A **conditional** bucket that was never written was never *asked* — fundraising only appears
    // for leaders Phase 0 marked it relevant to. Counting it as "left at zero" made the aggregate's
    // headline finding an artefact of a question most of the cohort never saw: six leaders who were
    // never shown fundraising ranked it the most-neglected part of everyone's week. An answered zero
    // is a fact about a week; an unasked question is not.
    if (bucket.conditional && composite === undefined && current === undefined) continue;

    zero.push(bucket.slug);
  }

  // Only count empties for a leader who reported time SOMEWHERE. Otherwise a run that never got as
  // far as Phase 1 would read as nine deliberate zeroes, and "everyone leaves learning empty" would
  // be an artefact of unfinished audits rather than a finding about anyone's week.
  const emptyBuckets = Object.keys(hoursByBucket).length > 0 ? zero : [];

  return { hoursByBucket, emptyBuckets };
}

/** Every slot slug the aggregate reads. Numbers only — no prose can enter here by construction. */
function aggregateSlots(): string[] {
  return RECLAIM_BUCKETS.flatMap((b) => {
    const token = bucketToken(b.slug);
    return [`reclaim_composite_hours__${token}`, `reclaim_current_hours__${token}`];
  });
}

/**
 * Read the consenting cohort and aggregate it. The consent join is the first query, deliberately: the
 * population is defined by consent before any audit data is read at all.
 */
export async function readAggregate(): Promise<AggregateView> {
  const { aggregateMinimumCohort } = await readReclaimAdminConfig();

  const consents = await prisma.reclaimConsent.findMany({
    where: { userId: { not: null } },
    select: { userId: true },
    distinct: ['userId'],
  });
  const consenting = consents.map((c) => c.userId).filter((id): id is string => id !== null);
  if (consenting.length === 0) {
    return computeAggregate([], aggregateMinimumCohort);
  }

  // Only leaders who finished an audit **and are not part-way through another one**.
  //
  // The second half is not fussiness. `getSlotHeads` returns the live head per slug across all of a
  // leader's runs, so someone who completed an audit in April and has filled in two buckets of a new
  // one today contributes a Frankenstein week: two fresh values spliced onto seven from April. The
  // same mechanism silently defeats the composite-over-current preference below — an April composite
  // outranks today's self-reported hours because "prefer composite" has no notion of recency.
  //
  // Excluding leaders with an open run makes the heads unambiguously the last completed audit's, and
  // the cost is that they rejoin the cohort when they finish. That is the right trade for a figure
  // whose entire claim is "this is what a completed week looks like". (Filtering heads by
  // `provenance.runId` would be exact, but a completed run's value that a newer run has superseded is
  // not in the heads at all — it would need `getSlotHistory` per slug per leader.)
  const [completed, openRuns] = await Promise.all([
    prisma.reclaimAuditRun.findMany({
      where: { userId: { in: consenting }, status: 'complete' },
      select: { userId: true },
      distinct: ['userId'],
    }),
    prisma.reclaimAuditRun.findMany({
      where: { userId: { in: consenting }, status: 'in_progress' },
      select: { userId: true },
      distinct: ['userId'],
    }),
  ]);

  const midAudit = new Set(openRuns.map((r) => r.userId));
  const settled = completed.filter((r) => !midAudit.has(r.userId));

  const slugs = aggregateSlots();
  const contributions = await Promise.all(
    settled.map(async (run) =>
      contributionFromHeads(await getSlotHeads(run.userId, { slotSlugs: slugs }))
    )
  );

  return computeAggregate(contributions, aggregateMinimumCohort);
}
