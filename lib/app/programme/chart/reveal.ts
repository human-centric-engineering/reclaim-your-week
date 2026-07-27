/**
 * When the picture of a leader's week is ready to be shown, and whether it has been (I12).
 *
 * Pure and client-safe, like `series.ts` beside it — both surfaces and the transition gate read it,
 * so it cannot reach for Prisma.
 *
 * ## Why this exists
 *
 * I12 says the chart and its interpretation are separate beats, and the source is unusually specific
 * about the shape: produce the visual, "do not proceed to Phase 2 until this has been presented"
 * (`sources/Time_Audit_Tool_Prompt_Text.md:231`), name the gaps in figures, "then pause. Ask: 'What
 * stands out to you here?' Give them a genuine moment to sit with what they are seeing before
 * offering any interpretation" (`:235`), and only afterwards add what they missed (`:237`).
 *
 * **Both surfaces got the trigger wrong in the same way.** The conversation drew the chart once any
 * one reading landed; the form panel drew it once any bucket had hours. Under either, the leader met
 * their week one bar at a time as they filled it in, so there was no picture to reveal by the time
 * the phase ended and no moment for the question to follow. That is a v1 defect the conversational
 * path inherited rather than introduced, which is why both are fixed here.
 *
 * The reveal is therefore an event with a before and an after: **not ready** while readings are
 * missing, **ready** once the week is whole and the leader can ask for it, **revealed** once they
 * have. The run records the third (`ReclaimAuditRun.coachOpenings`), so it survives a reload and the
 * server can refuse to move on without it.
 */

import { RECLAIM_BUCKETS, bucketToken } from '@/lib/app/programme/content';
import { truthy, type Answers } from '@/lib/app/programme/chart/series';

/** The moment name the run records once the leader has seen the picture. */
export const CHART_REVEAL_MOMENT = 'phase-1-chart-reveal';

/** The phase the reveal belongs to. Leaving it without the reveal is refused by the server. */
export const CHART_REVEAL_PHASE = 'phase-1-current';

/**
 * Whether this run's week is complete enough to show.
 *
 * Every **visible** bucket needs an hours reading. Visible does the conditional work: a leader who
 * said fundraising is not relevant was never asked about it, so waiting for it would leave them with
 * a button that never arrives (`series.ts#bucketHours` draws the same distinction, and for the same
 * reason).
 *
 * Where a calendar was uploaded, the composite must also exist. That is I-composite: the picture is
 * the calendar plus the work that never reaches a calendar, never the raw calendar totals. Revealing
 * between the upload and the reconciliation would show a leader a version of their week that the
 * product explicitly does not stand behind.
 */
export function chartRevealReady(answers: Answers): boolean {
  const fundraisingRelevant = truthy(answers['reclaim_setup_fundraising_relevant']);
  const visible = RECLAIM_BUCKETS.filter((b) => !b.conditional || fundraisingRelevant);
  if (visible.length === 0) return false;

  const everyBucketAnswered = visible.every(
    (b) => answers[`reclaim_current_hours__${bucketToken(b.slug)}`] !== undefined
  );
  if (!everyBucketAnswered) return false;

  if (truthy(answers['reclaim_calendar_uploaded'])) {
    return visible.every(
      (b) => answers[`reclaim_composite_hours__${bucketToken(b.slug)}`] !== undefined
    );
  }
  return true;
}

/** Whether this run has already had the reveal. */
export function chartRevealed(coachOpenings: readonly string[]): boolean {
  return coachOpenings.includes(CHART_REVEAL_MOMENT);
}

/**
 * The reveal state for a run, which is what both surfaces render from.
 *
 * `ready` shows a button and no chart; `revealed` shows the chart and no interpretation beside it.
 * Keeping the three states in one function rather than two booleans at each call site is what stops
 * the two surfaces drifting apart again.
 */
export type ChartRevealState = 'not-ready' | 'ready' | 'revealed';

export function chartRevealState(
  answers: Answers,
  coachOpenings: readonly string[]
): ChartRevealState {
  if (chartRevealed(coachOpenings)) return 'revealed';
  return chartRevealReady(answers) ? 'ready' : 'not-ready';
}
