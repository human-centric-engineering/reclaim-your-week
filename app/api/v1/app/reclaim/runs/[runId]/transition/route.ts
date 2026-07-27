/**
 * Reclaim audit runs — phase transition.
 *
 * POST /api/v1/app/reclaim/runs/:runId/transition   body: { fromPhase }
 *
 * Advances one phase: completes `fromPhase`, enters the next.
 *
 * **Two gates, both server-owned, both for the same reason.** A guard the UI alone holds is not a
 * guard: it survives exactly as long as nobody calls the API directly or ships a component that
 * forgets it.
 *
 *  - **I9, the reflection.** If the leaving phase's `reclaim_reflection_p<N>` slot is absent for this
 *    run, `422 REFLECTION_REQUIRED`.
 *  - **I12, the picture.** Phase 1 cannot be left until the leader has been shown the week they just
 *    described: `422 CHART_REVEAL_REQUIRED`. The source is categorical about the ordering, and the
 *    reveal is recorded on the run so it survives a reload.
 */

import { z } from 'zod';
import { withAuth } from '@/lib/auth/guards';
import { successResponse, errorResponse } from '@/lib/api/responses';
import { validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import { ValidationError } from '@/lib/api/errors';
import { cuidSchema } from '@/lib/validations/common';
import { RECLAIM_PHASE_KEYS } from '@/lib/app/programme/runs/phases';
import { missingReflectionSlug } from '@/lib/app/programme/runs/reflection';
import { CHART_REVEAL_PHASE, chartRevealed } from '@/lib/app/programme/chart/reveal';
import {
  loadOwnedRun,
  transitionRun,
  readCoachOpenings,
  recordPhaseMark,
} from '@/app/api/v1/app/reclaim/runs/service';

const transitionSchema = z.object({
  /** The phase the leader is leaving. The engine still validates the move (I6). */
  fromPhase: z.string().refine((k) => RECLAIM_PHASE_KEYS.includes(k), 'Unknown phase'),
});

export const POST = withAuth<{ runId: string }>(async (request, session, { params }) => {
  const log = await getRouteLogger(request);
  const { runId: rawRunId } = await params;
  const parsed = cuidSchema.safeParse(rawRunId);
  if (!parsed.success)
    throw new ValidationError('Invalid run id', { runId: ['Must be a valid id'] });
  const runId = parsed.data;

  const { fromPhase } = await validateRequestBody(request, transitionSchema);

  // Ownership first — the run id alone never authorises.
  await loadOwnedRun(runId, session.user.id);

  // I9: the reflection for the leaving phase must be present *for this run*.
  const missing = await missingReflectionSlug(session.user.id, runId, fromPhase);
  if (missing !== null) {
    log.info('Reclaim transition blocked — reflection required', {
      runId,
      fromPhase,
      slot: missing,
    });
    return errorResponse('A reflection is needed before moving on from this phase.', {
      code: 'REFLECTION_REQUIRED',
      status: 422,
      details: { slot: missing, fromPhase },
    });
  }

  // I12: the picture of the week must have been shown before phase 1 can be left. The source is
  // categorical — "do not proceed to Phase 2 until this has been presented"
  // (`sources/Time_Audit_Tool_Prompt_Text.md:231`) — and a gate the UI alone holds is not a gate,
  // which is the argument I9 already settled for the reflection above.
  if (fromPhase === CHART_REVEAL_PHASE) {
    const openings = await readCoachOpenings(session.user.id, runId);
    if (!chartRevealed(openings)) {
      log.info('Reclaim transition blocked — chart reveal required', { runId, fromPhase });
      return errorResponse('The picture of your week has not been shown yet.', {
        code: 'CHART_REVEAL_REQUIRED',
        status: 422,
        details: { fromPhase },
      });
    }
  }

  const { enteredPhaseKey } = await transitionRun(session.user.id, runId, fromPhase);

  // Where the phase just entered begins in the run's one conversation, so each phase can draw its own
  // part of it rather than the whole audit every time. Best-effort inside; a bookkeeping failure must
  // not fail a move the leader has already earned.
  await recordPhaseMark(session.user.id, runId, enteredPhaseKey);

  log.info('Reclaim audit run transitioned', { runId, fromPhase, enteredPhaseKey });
  return successResponse({ enteredPhase: enteredPhaseKey });
});
