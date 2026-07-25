/**
 * Journey transitions for a run (F4 t-3). The framework-vocabulary side of the lifecycle —
 * `applyJourneyTransition` (the framework's sole journey-state writer), keyed on the map's node keys —
 * lives here in `lib/app` (the framework-consuming tier), so `app/api` stays thin Prisma + HTTP glue.
 * This split is what keeps the framework's vocabulary out of the core-scanned `app/**` surface
 * (`framework:boundary`), the boundary tooling's leaf-tier line: framework concepts belong in the
 * tier built on the framework, not in the app shell. No Prisma here; the framework owns the writes.
 */

import { applyJourneyTransition } from '@/lib/framework/guidance/guidance';
import { ValidationError } from '@/lib/api/errors';
import { RECLAIM_MAP_SLUG } from '@/lib/app/programme/map';
import { FIRST_PHASE_KEY, FINAL_PHASE_KEY, nextPhaseKey } from '@/lib/app/programme/runs/phases';

type TransitionResult = Awaited<ReturnType<typeof applyJourneyTransition>>;

/** The journey natural key for a run: one journey per run, keyed on the run id as `contextKey`. */
function journeyKey(userId: string, runId: string) {
  return { userId, graphSlug: RECLAIM_MAP_SLUG, contextKey: runId };
}

/** A one-line reason a transition was refused, for a `ValidationError` detail. */
function rejection(result: TransitionResult): string {
  if (result === null) return 'The journey has not been started.';
  return result.ok ? 'ok' : result.rejection.message;
}

/** Enter the first phase, so "you are here" is right on resume. Called after a run is created. */
export async function enterFirstPhase(userId: string, runId: string): Promise<void> {
  await applyJourneyTransition({ userId }, journeyKey(userId, runId), {
    nodeKey: FIRST_PHASE_KEY,
    kind: 'enter',
  });
}

/**
 * Advance one phase: complete the leaving node, then enter the next. The reflection gate (I9) is the
 * route's, before this runs; here the engine validates the move itself (a non-active node cannot
 * complete), so a client that lies about `leavingPhaseKey` is refused by the engine, not trusted (I6).
 */
export async function advancePhase(
  userId: string,
  runId: string,
  leavingPhaseKey: string
): Promise<{ enteredPhaseKey: string }> {
  const next = nextPhaseKey(leavingPhaseKey);
  if (next === null) {
    throw new ValidationError('There is no phase after this one', {
      phase: ['The final phase completes the run; use complete, not transition.'],
    });
  }

  const key = journeyKey(userId, runId);
  const completed = await applyJourneyTransition({ userId }, key, {
    nodeKey: leavingPhaseKey,
    kind: 'complete',
  });
  if (completed === null || !completed.ok) {
    throw new ValidationError('Could not complete the current phase', {
      phase: [rejection(completed)],
    });
  }

  const entered = await applyJourneyTransition({ userId }, key, { nodeKey: next, kind: 'enter' });
  if (entered === null || !entered.ok) {
    throw new ValidationError('Could not enter the next phase', { phase: [rejection(entered)] });
  }

  return { enteredPhaseKey: next };
}

/** Best-effort: mark the final node complete. The run completes regardless of the journey state. */
export async function completeFinalPhase(userId: string, runId: string): Promise<void> {
  await applyJourneyTransition({ userId }, journeyKey(userId, runId), {
    nodeKey: FINAL_PHASE_KEY,
    kind: 'complete',
  }).catch(() => null);
}
