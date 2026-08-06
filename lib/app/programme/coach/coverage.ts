/**
 * Whether a phase has been covered enough to be left — decided once, for both the screen that draws
 * the button and the briefing that tells the coach whether to mention it.
 *
 * **Why this is a module and not two similar expressions.** The gate was written in
 * `phase-conversation.tsx`, where it belongs: it is a judgement about coverage rather than a rule
 * about data, and the client owns it. The coach was then told, in prose, that it could not see the
 * answer — "you cannot see that, so a turn that announces it either contradicts the screen in front
 * of them or closes a phase that is still open" — and forbidden from mentioning the way onward at
 * all. That forbidding is a hit rate, and it missed: observed on a live audit, the coach ended a
 * phase-5 turn with "whenever you're ready, you can move on to the next section" while the screen
 * beside it offered nothing, because a reading the coach had never asked for was holding the gate.
 *
 * Prose cannot fix that, for the same reason `runCaptureSweep` exists: a rule a model is asked to
 * follow is a rule it follows most of the time. What fixes it is removing the ignorance. The coach
 * is now told, as fact, whether the way onward is currently offered — so a turn that mentions it is
 * agreeing with the screen rather than guessing at it.
 *
 * **The gate stays the product's, not the model's.** This tells the coach what is already true; it
 * never lets the coach make it true. A model that decides a phase is finished still cannot open one,
 * because nothing here reads anything the model wrote — the readings come from the run's own slot
 * values and the threshold from the operator's configuration. That direction matters: the button
 * exists to stop a leader skipping the audit, and a gate a model could talk its way past would not.
 */

import type { PhaseSlot } from '@/lib/app/programme/coach/phase-slots';
import { slotApplies } from '@/lib/app/programme/coach/phase-slots';

/**
 * At or below this, an inferred reading is the coach's guess and not the leader's answer.
 *
 * The same number the captured panel uses to decide what to offer back for checking, and the same
 * band `answer-quality.ts` calls `unconfirmed`. A guess counts towards the picture but not towards
 * "this phase has happened": a phase whose coverage was made of inferences is a phase where the
 * coach filled in the leader's audit for them.
 */
export const GUESS_CONFIDENCE = 6;

/**
 * How much of a phase has to be covered before the way onward is offered, when the operator's own
 * number has not arrived.
 *
 * Not all of it, and the shortfall is the point. A phase whose every applicable reading must land
 * would be held open by one question a leader would rather not answer, and there is no way for them
 * to say so: the coach cannot record a decline. Leaving room for roughly one in ten means the common
 * case — a leader who has genuinely been through the phase and left one thing — is not a hostage.
 *
 * The live value is `Module.config.phaseCoveredPercent`, edited on the content screen and served
 * through `GET /api/v1/app/reclaim/config`. This is the fallback for the moment before it lands and
 * for a read that failed, and it is deliberately the same number the config defaults to: a leader
 * whose config fetch missed should meet the shipped behaviour, not a stricter or looser one.
 */
export const PHASE_COVERED = 0.9;

/**
 * The shape both callers already hold: a run's answers, keyed by slug.
 *
 * `value` / `valueJson` are here for `slotApplies`, which reads them to decide whether a conditional
 * reading applies at all; the two provenance fields are what `isAGuess` reads.
 */
export interface CoverageAnswer {
  value: string;
  valueJson?: unknown;
  sourceType: string;
  confidence: number;
}

/** A reading the coach worked out and was not sure of, rather than one the leader gave. */
export function isAGuess(answer: CoverageAnswer): boolean {
  return answer.sourceType === 'inferred' && answer.confidence <= GUESS_CONFIDENCE;
}

/**
 * The operator's threshold as a fraction, clamped rather than trusted.
 *
 * It arrives over HTTP. A nought would offer the way out of an empty phase; a figure above one would
 * hold every phase open for ever.
 */
export function coverageThreshold(coveredPercent?: number): number {
  return Math.min(1, Math.max(0.5, (coveredPercent ?? PHASE_COVERED * 100) / 100));
}

export interface PhaseCoverage {
  /** Readings this leader will actually be asked: ruled-out and coach-authored ones removed. */
  applicable: PhaseSlot[];
  /** How many of those are settled — answered, and not a low-confidence guess. */
  settled: number;
  /** How many settled readings this phase needs before it may be left. */
  needed: number;
  /** Whether the coverage half of the gate is satisfied. */
  covered: boolean;
}

/**
 * What this phase still owes, and whether that is little enough to move on.
 *
 * Two kinds of reading are excluded from `applicable`, and both are exclusions rather than waits.
 * A reading whose condition came back the other way is finished, not outstanding — a leader with no
 * fundraising in their role is not held behind a question about their development team. And a
 * reading the **coach** authors rather than asks (`authoredByCoach`) says nothing about whether the
 * leader has been taken through the phase, which is the only thing this gate is measuring.
 *
 * `needed` rounds **down**. `Math.ceil` was the original, and it made the slack the design promises
 * disappear on every phase shorter than ten readings: `ceil(n × 0.9) === n` for all n ≤ 9, so
 * energy (2 readings), gap (5) and action (6) each silently demanded a full house. Rounding down is
 * what the proportion always meant — ninety percent of six is 5.4, and five of six is ninety percent
 * of the phase by any reading a person would recognise.
 *
 * `Math.max(1, …)` because rounding down has its own edge: a one-reading phase would floor to nought
 * and open on an empty conversation.
 */
export function phaseCoverage(
  slots: readonly PhaseSlot[],
  answers: Record<string, CoverageAnswer | undefined>,
  coveredPercent?: number
): PhaseCoverage {
  const applicable = slots.filter(
    (s) => slotApplies(s.askOnlyIf, answers) !== false && s.authoredByCoach !== true
  );
  const settled = applicable.filter((s) => {
    const answer = answers[s.slug];
    return answer !== undefined && !isAGuess(answer);
  }).length;
  const needed = Math.max(1, Math.floor(applicable.length * coverageThreshold(coveredPercent)));
  return { applicable, settled, needed, covered: applicable.length > 0 && settled >= needed };
}
