/**
 * The comparative open, and the recent-audit shortcut (F9 t-2).
 *
 * Brief §2: _"Yes to the trend line per area and to **opening each repeat by comparing with the
 * last**."_ Before this, a leader who came back got a blank second audit that knew nothing about
 * their first — same ten questions, same single-run chart. Two pieces:
 *
 *   - **The comparison** — a repeat audit shows the previous audit's picture beside the new one as it
 *     fills in.
 *   - **The shortcut** ([[content-source]] §4) — where the last audit finished recently, Phase 0
 *     *confirms* the stable context instead of re-asking it, in the source's own words.
 *
 * ## The rule that governs the comparison, and why it is worth stating twice
 *
 * **It presents both pictures and the arithmetic difference, and stops.** No verdict, no arrows
 * coloured good and bad, no "improved" or "slipped". That is I12's sibling on the consumer side and
 * this feature's main design risk: `buildChartData` already computes benchmark status per bucket, so
 * rendering "you were in range and are now over" is one line away and would be wrong. A quarter where
 * a leader deliberately gave time to their team at the cost of strategy is a success that a valenced
 * comparison draws as a failure. The delta is the fact; the meaning is theirs (I16).
 *
 * Hours, never percentages (I8).
 *
 * ## Nothing here writes
 *
 * The shortcut **pre-fills a form**; it does not copy values forward. Everything the leader confirms
 * is written again by `saveAnswer` under the *new* run's id (I3), which is what keeps each audit its
 * own picture — the alternative would make run 1 mutate retroactively when run 2 confirms something.
 */

import { prisma } from '@/lib/db/client';
import { readRunAnswers } from '@/lib/app/programme/runs/answers';
import { readReclaimShortcutConfig } from '@/lib/app/programme/config';
import { RECLAIM_BUCKETS, bucketToken } from '@/lib/app/programme/content';
import { bucketHours } from '@/lib/app/programme/chart/series';
import { readBucketLabels } from '@/lib/app/programme/buckets/labels';

/** The context slots the shortcut offers back for confirmation. All `standard` sensitivity. */
export const SHORTCUT_SLOTS = [
  'reclaim_profile_first_name',
  'reclaim_profile_role',
  'reclaim_profile_org_type',
  'reclaim_profile_direct_reports',
  'reclaim_profile_distributed_team',
  'reclaim_setup_fundraising_relevant',
  'reclaim_setup_weekly_hours',
  'reclaim_setup_priorities',
  'reclaim_setup_in_transition',
  // The three conditional detail fields, carried WITH the flags that reveal them. Prefilling
  // "distributed team: yes" without the "how does that affect how you lead" answer beneath it leaves
  // an empty textarea under copy that says everything is filled in — and confirming then drops data
  // run 1 had, on the path whose whole purpose is not re-asking.
  'reclaim_profile_distributed_impact',
  'reclaim_setup_transition_detail',
  'reclaim_setup_fundraising_support',
] as const;

export interface BucketComparison {
  bucketSlug: string;
  title: string;
  previousHours: number | null;
  /** `previous → now` in hours. Null until this audit has recorded the bucket. */
  currentHours: number | null;
  /** `currentHours - previousHours`, or null when either side is missing. Signed, never judged. */
  differenceHours: number | null;
}

export interface PreviousAudit {
  runId: string;
  quarter: string | null;
  completedAt: string;
}

export interface ComparisonView {
  /** Null when this is the leader's first audit — the whole feature is absent, not empty. */
  previous: PreviousAudit | null;
  buckets: BucketComparison[];
}

export interface ShortcutView {
  /** Null when there is no recent audit to confirm from; Phase 0 then asks in full, as it always did. */
  previous: PreviousAudit | null;
  /** The §4 confirm line with `[role]` / `[organisation]` / `[hours]` / `[priorities]` filled in. */
  confirmLine: string | null;
  /** Slug → the previous audit's answer, for pre-filling the form. Never written from here. */
  answers: Record<string, string>;
}

/** Round to one decimal, matching the chart — so a comparison never disagrees with the bars above it. */
const round1 = (n: number): number => Math.round(n * 10) / 10;

/** The leader's most recently completed audit, excluding `exceptRunId` (the one in progress). */
async function previousCompletedRun(
  userId: string,
  exceptRunId?: string
): Promise<PreviousAudit | null> {
  const run = await prisma.reclaimAuditRun.findFirst({
    where: {
      userId,
      status: 'complete',
      ...(exceptRunId !== undefined ? { id: { not: exceptRunId } } : {}),
    },
    // `nulls: 'last'` is load-bearing. Postgres sorts NULLs FIRST on a descending order, so a
    // `complete` row with no `completedAt` would outrank every real one and become "last time" — the
    // OLDEST audit shown as the most recent. Both this file and the nudge tick defensively fall back
    // to `startedAt`, which concedes such rows exist.
    orderBy: [{ completedAt: { sort: 'desc', nulls: 'last' } }, { startedAt: 'desc' }],
    select: { id: true, quarter: true, completedAt: true, startedAt: true },
  });
  if (run === null) return null;
  return {
    runId: run.id,
    quarter: run.quarter,
    completedAt: (run.completedAt ?? run.startedAt).toISOString(),
  };
}

/**
 * The previous audit beside the one in progress. Returns `previous: null` for a first audit, so the
 * UI can be absent rather than show an empty comparison.
 */
export async function readComparison(userId: string, runId: string): Promise<ComparisonView> {
  const previous = await previousCompletedRun(userId, runId);
  if (previous === null) return { previous: null, buckets: [] };

  const [previousAnswers, currentAnswers, labels] = await Promise.all([
    readRunAnswers(userId, previous.runId),
    readRunAnswers(userId, runId),
    readBucketLabels(userId),
  ]);

  // One reading of "hours per bucket", shared with the chart and the trends (F9's consolidation).
  // It is what drops a conditional bucket the leader was never asked about, rather than showing the
  // literal `0` that `persistComposite` stores for it.
  const before = bucketHours(previousAnswers);
  const now = bucketHours(currentAnswers);

  const buckets = RECLAIM_BUCKETS.map((bucket) => {
    const previousHours = before.get(bucket.slug) ?? null;
    const currentHours = now.get(bucket.slug) ?? null;
    return {
      bucketSlug: bucket.slug,
      // The leader's CURRENT label, applied to both columns. A rename reads as one continuous
      // history under the name they use now — one legend, one name (plan D3).
      title: labels[bucketToken(bucket.slug)] ?? bucket.title,
      previousHours,
      currentHours,
      differenceHours:
        previousHours !== null && currentHours !== null
          ? round1(currentHours - previousHours)
          : null,
    } satisfies BucketComparison;
  }).filter((b) => b.previousHours !== null || b.currentHours !== null);

  return { previous, buckets };
}

/**
 * Interpolate the §4 confirm line.
 *
 * The placeholders are shorthand for phrases, not for bare values: `[hours]` in "working around
 * [hours] per week" stands for "55 hours", not "55". Filling them literally produced "working around
 * 55 per week", which reads as though a machine assembled it — on the one line in the product whose
 * job is to sound like someone remembering you. Fixed here at the interpolation rather than in the
 * constant, which stays verbatim under the I11 guard.
 *
 * The quotation marks around the source sentence are stripped for the same reason: in the system
 * prompt they marked what the coach should say, and reproducing them on screen would make the product
 * look like it is quoting somebody.
 *
 * `replaceAll` with a function replacement, so a `$&` or `$'` sequence inside a leader's own answer
 * is inserted literally rather than re-expanding part of the template.
 */
export function fillConfirmLine(
  template: string,
  values: { role?: string; organisation?: string; hours?: string; priorities?: string }
): string {
  const hours = values.hours?.trim();
  const filled: Record<string, string> = {
    '[role]': values.role ?? 'a leader',
    '[organisation]': values.organisation ?? 'your organisation',
    // A bare number becomes "55 hours"; anything already wordy is left as the leader wrote it.
    '[hours]': hours === undefined ? 'the same' : /^[\d.]+$/.test(hours) ? `${hours} hours` : hours,
    '[priorities]': values.priorities ?? 'the priorities you named',
  };

  return template
    .replace(/\[(role|organisation|hours|priorities)\]/g, (match) => filled[match] ?? match)
    .replace(/^"|"$/g, '')
    .trim();
}

/**
 * The recent-audit shortcut for a leader about to set up a new audit.
 *
 * Applies only when their last audit **completed** within the configured window. Outside it, Phase 0
 * asks in full — which is right: a leader's role, hours and priorities are exactly the things that
 * drift over a year, and confirming stale context is worse than asking.
 */
export async function readShortcut(userId: string, runId?: string): Promise<ShortcutView> {
  const [previous, config] = await Promise.all([
    previousCompletedRun(userId, runId),
    readReclaimShortcutConfig(),
  ]);
  if (previous === null) return { previous: null, confirmLine: null, answers: {} };

  const ageDays = (Date.now() - new Date(previous.completedAt).getTime()) / 86_400_000;
  if (ageDays > config.recentAuditWithinDays) {
    return { previous: null, confirmLine: null, answers: {} };
  }

  const answers = await readRunAnswers(userId, previous.runId, [...SHORTCUT_SLOTS]);
  const allowed = new Set<string>(SHORTCUT_SLOTS);
  const asText: Record<string, string> = {};
  for (const [slug, answer] of Object.entries(answers)) {
    // Filter on the way OUT as well as asking on the way in. The query already narrows to
    // `SHORTCUT_SLOTS`, so this is redundant today — and it is the redundancy worth having, because
    // what it excludes is `reclaim_setup_keeping_me_up` and `reclaim_setup_why_now`. Those are the
    // two `sensitive` prose slots, they are the most likely things to have changed since last time,
    // and F7's refer-back returns them verbatim later in the audit. A future change to the requested
    // list, or a reader that over-returns, would otherwise put last quarter's worry into this
    // quarter's form with nothing in the diff that looked like a privacy decision.
    if (!allowed.has(slug)) continue;
    if (answer.value.trim() !== '') asText[slug] = answer.value;
  }

  return {
    previous,
    confirmLine: fillConfirmLine(config.recentAuditConfirm, {
      role: asText['reclaim_profile_role'],
      organisation: asText['reclaim_profile_org_type'],
      hours: asText['reclaim_setup_weekly_hours'],
      priorities: asText['reclaim_setup_priorities'],
    }),
    answers: asText,
  };
}
