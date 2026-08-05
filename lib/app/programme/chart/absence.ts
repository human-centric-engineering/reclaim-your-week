/**
 * Which areas are at or near nothing, and in which order they are worth naming.
 *
 * ## Why absence has its own module
 *
 * "If a category is near zero, especially recovery and white space or deep work, the tool gently
 * wonders about it rather than merely charting it" (Brief §5). Two surfaces now need that reading and
 * they must not disagree about it: the coach names it aloud at the reveal (`coach/phase-context.ts`),
 * and the report writes it into the document a leader keeps (`report/brief.ts`). A leader told in
 * conversation that their recovery is at nothing and handed a report that never mentions it has been
 * given two different audits.
 *
 * It lived inside the coach's briefing until the report needed it. Nothing about it was ever
 * coach-specific: it is a fact about a week.
 *
 * ## Near zero is not zero, and the threshold is not ours
 *
 * `ChartData.unallocated` is `hours === 0` exactly (`chart/series.ts`), which is the right definition
 * for a chart and the wrong one for this: a leader with one hour of recovery in a fifty-hour week has,
 * for every purpose the Brief cares about, none. The threshold is **derived from the area's own
 * benchmark** rather than invented here, below half of where the guide starts, so an operator moving a
 * benchmark moves this too and there is no number in this file for anyone to argue with.
 *
 * Areas with no benchmark at all (fundraising, which is season-dependent) are never named this way:
 * there is nothing to be near zero against.
 */

import { truthy, type Answers, type ChartData } from '@/lib/app/programme/chart/series';

/**
 * The two areas the Brief singles out for naming the absence, in the order it names them.
 *
 * Everything else that is near zero is worth mentioning; these two are worth mentioning first.
 */
const ABSENCE_FIRST = ['recovery-white-space', 'deep-work'];

/** Area titles at or near nothing this period, the Brief's two first and the rest as they come. */
export function nearZeroAreas(chart: ChartData, answers: Answers): string[] {
  const near = chart.buckets.filter(
    (b) =>
      b.hours > 0 && b.status === 'under' && b.lowPercent !== null && b.percent < b.lowPercent / 2
  );

  // **Deep work needs its own test, and this is not a special case so much as the right measure.**
  // The Brief names two areas to wonder about, recovery and deep work — but deep work is the one
  // area the canonical content gives no percentage range to: "no percentage range. Measured by
  // presence of protected blocks." So the percentage rule above can never flag it, and the beat
  // written for it would have quietly never fired. The signal the content itself nominates is the
  // protected-block reading, which phase 1 already asks for.
  const noBlock =
    truthy(answers['reclaim_current_deep_block_exists']) === false &&
    answers['reclaim_current_deep_block_exists'] !== undefined;
  const deepWork = chart.buckets.find((b) => b.slug === 'deep-work');
  const deepWorkAbsent =
    noBlock && deepWork !== undefined && !chart.unallocated.includes(deepWork.title)
      ? [deepWork.title]
      : [];

  const named = [...chart.unallocated, ...near.map((b) => b.title), ...deepWorkAbsent];
  const priority = new Map(
    ABSENCE_FIRST.map((slug, index) => [
      chart.buckets.find((b) => b.slug === slug)?.title ?? slug,
      index,
    ])
  );
  return named.sort(
    (a, b) => (priority.get(a) ?? ABSENCE_FIRST.length) - (priority.get(b) ?? ABSENCE_FIRST.length)
  );
}
