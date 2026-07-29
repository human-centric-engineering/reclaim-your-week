/**
 * Whether the week a leader has just designed is actually different from the one they described.
 *
 * The source asks for one thing here and it is the only genuine challenge in phase 3: "gently
 * challenge any ideal week that looks suspiciously similar to their current reality — especially if
 * delivery and operations remains high, or recovery remains near zero." Nothing implemented it. A
 * coach asked to notice that from memory, across nine pairs of figures it has been handed one at a
 * time over several turns, will either miss it or invent a difference that is not there. So the
 * arithmetic happens here and the model is given the result, which is the same reasoning I13 gives
 * for the refer-back and the reveal beat gives for the chart.
 *
 * **Why nothing fires until every area has an ideal figure.** A half-designed week looks nothing like
 * the current one, because most of it is still zero. Challenging that is challenging an artefact of
 * the conversation not being finished yet, and it would fire on the first turn of the phase, every
 * time. This is the same gate `chartRevealReady` applies for the same reason.
 *
 * Pure — no Prisma, no framework reads, no config. Every threshold is either derived from the areas'
 * own benchmarks (which are operator-editable) or is a stated tolerance with its reasoning beside it.
 */

import {
  buildChartData,
  buildIdealChartData,
  type Answers,
} from '@/lib/app/programme/chart/series';

/** The two areas the source names by name. */
const DELIVERY = 'delivery-operations';
const RECOVERY = 'recovery-white-space';

/**
 * How close two figures have to be before the area counts as unmoved, in **hours**.
 *
 * Hours and not a percentage (I8): one hour is below the resolution of a figure given out loud. A
 * leader who said "about eight" and then "about nine" has not redesigned anything, and a percentage
 * tolerance would mean something different on a two-hour area than on a twenty-hour one.
 */
const UNMOVED_HOURS = 1;

/** How close the ideal total has to be to the reported one before the week has not really changed. */
const UNCHANGED_TOTAL_HOURS = 2;

/**
 * How little of the week has to be redistributed before it counts as barely redesigned, as a share of
 * the hours they are already working.
 *
 * **Counting unmoved areas was the obvious rule and it is the wrong one.** A leader who takes twelve
 * hours out of delivery and puts them into deep work has redesigned their week in the way that
 * matters, and may quite reasonably leave five small areas exactly where they are. Under a
 * count-based rule that is "six of eight unmoved" and gets challenged, which would be the tool
 * arguing with someone who has just done the hard thing. Measuring the hours that actually move
 * catches the week that was re-typed rather than rethought, and leaves the concentrated change alone.
 *
 * Ours rather than Rashmir's — a threshold inside a heuristic, not a policy she has a view on — so it
 * lives here as a named constant rather than in `Module.config`.
 */
const BARELY_MOVED_SHARE = 0.15;

/** One area that came back the same as it went in. */
export interface UnmovedArea {
  title: string;
  now: number;
  want: number;
}

export interface IdealWeekReading {
  /** Every visible area has an ideal figure. Nothing below this is meaningful until it is true. */
  complete: boolean;
  /** Areas whose ideal is within a whisker of what they already reported. */
  unmoved: UnmovedArea[];
  /** Delivery and operations is above its guide in both weeks — the source's first named case. */
  deliveryStaysHigh: boolean;
  /** Recovery is near nothing in both weeks — the source's second. */
  recoveryStaysNearZero: boolean;
  /** The ideal weekly total is within a couple of hours of what they are working now. */
  totalUnchanged: boolean;
  idealTotal: number | null;
  /** Whether any of the above is worth putting in front of the coach. */
  shouldChallenge: boolean;
}

/** A finite number from a reading, or null. */
function figure(answer: { value: string; valueJson?: unknown } | undefined): number | null {
  if (answer === undefined) return null;
  const typed = typeof answer.valueJson === 'number' ? answer.valueJson : Number(answer.value);
  return Number.isFinite(typed) ? typed : null;
}

/**
 * Read the designed week against the reported one.
 *
 * `bucketLabels` is threaded through so the areas this names are the areas on the leader's screen,
 * under the names they gave them (I7).
 */
export function readIdealWeek(
  answers: Answers,
  bucketLabels: Record<string, string> = {}
): IdealWeekReading {
  const now = buildChartData(answers, bucketLabels);
  const want = buildIdealChartData(answers, bucketLabels);

  // Every *visible* area, so a leader for whom fundraising is irrelevant is not held to a lane they
  // were never shown. `buildIdealChartData` has already dropped it, so the two series line up.
  const complete = want.buckets.length > 0 && want.buckets.every((b) => b.hours > 0);

  const idealTotalAnswer = figure(answers['reclaim_ideal_total_hours']);
  const reportedTotal = figure(answers['reclaim_setup_weekly_hours']) ?? now.totalHours;
  const idealTotal = idealTotalAnswer ?? (complete ? want.totalHours : null);

  if (!complete) {
    return {
      complete: false,
      unmoved: [],
      deliveryStaysHigh: false,
      recoveryStaysNearZero: false,
      totalUnchanged: false,
      idealTotal,
      shouldChallenge: false,
    };
  }

  const byslug = new Map(now.buckets.map((b) => [b.slug, b]));
  const unmoved: UnmovedArea[] = [];
  let hoursMoved = 0;
  for (const area of want.buckets) {
    const current = byslug.get(area.slug);
    if (current === undefined) continue;
    const shift = Math.abs(area.hours - current.hours);
    hoursMoved += shift;
    if (shift <= UNMOVED_HOURS) {
      unmoved.push({ title: area.title, now: current.hours, want: area.hours });
    }
  }

  // "Remains" is the source's word, so both halves are required. An ideal week that is high on
  // delivery for the first time is a different conversation, and one the leader has chosen.
  const stays = (slug: string, status: 'over' | 'under'): boolean =>
    byslug.get(slug)?.status === status &&
    want.buckets.find((b) => b.slug === slug)?.status === status;

  const deliveryStaysHigh = stays(DELIVERY, 'over');

  const idealRecovery = want.buckets.find((b) => b.slug === RECOVERY);
  const recoveryStaysNearZero =
    stays(RECOVERY, 'under') &&
    idealRecovery !== undefined &&
    idealRecovery.lowPercent !== null &&
    idealRecovery.percent < idealRecovery.lowPercent / 2;

  const totalUnchanged =
    idealTotal !== null &&
    reportedTotal > 0 &&
    Math.abs(idealTotal - reportedTotal) <= UNCHANGED_TOTAL_HOURS;

  // How much of the week actually moved. See `BARELY_MOVED_SHARE` for why this is hours rather than
  // a count of areas. The two named cases and the unchanged total each stand on their own, because
  // the source names them on their own.
  const barelyMoved = now.totalHours > 0 && hoursMoved / now.totalHours < BARELY_MOVED_SHARE;

  return {
    complete: true,
    unmoved,
    deliveryStaysHigh,
    recoveryStaysNearZero,
    totalUnchanged,
    idealTotal,
    // **`totalUnchanged` is deliberately not a trigger on its own.** This challenge is about the
    // ideal week resembling the current one in *shape*, and a leader who moves forty hours between
    // areas while keeping the same weekly total has redesigned their week — they have just not
    // decided to work less, which is a different conversation and the one the 55+ note has at the
    // gap. Firing here would tell someone who did the hard thing that they did not. It stays on the
    // reading and appears as supporting evidence when the shape has genuinely not moved.
    shouldChallenge: barelyMoved || deliveryStaysHigh || recoveryStaysNearZero,
  };
}

/**
 * The specific facts behind a challenge, in the leader's own figures.
 *
 * Given rather than described, for the reason the gap arithmetic is given: a coach asked to challenge
 * an ideal week without the numbers says something true and vague, and a leader can put down a vague
 * observation without picking it up. "Delivery is eighteen hours now and seventeen in the week you
 * have just designed" cannot be put down.
 */
export function challengeEvidence(reading: IdealWeekReading): string[] {
  if (!reading.shouldChallenge) return [];
  const lines: string[] = [];

  if (reading.deliveryStaysHigh) {
    lines.push(
      '- Delivery and operations is above its guide in both weeks, the one they described and the one they designed.'
    );
  }
  if (reading.recoveryStaysNearZero) {
    lines.push('- Recovery and white space is near nothing in both weeks.');
  }
  if (reading.totalUnchanged && reading.idealTotal !== null) {
    lines.push(
      `- The total barely moves: their ideal week comes to about ${reading.idealTotal} hours, which is roughly what they are working now.`
    );
  }
  for (const area of reading.unmoved) {
    lines.push(`- ${area.title}: ${area.now}h now, ${area.want}h in the ideal week.`);
  }
  return lines;
}
