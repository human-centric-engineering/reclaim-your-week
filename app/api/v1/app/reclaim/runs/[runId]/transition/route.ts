/**
 * Reclaim audit runs — phase transition.
 *
 * POST /api/v1/app/reclaim/runs/:runId/transition   body: { fromPhase }
 *
 * Advances one phase: completes `fromPhase`, enters the next. **The reflection gate is server-owned
 * (I9):** if the leaving phase's `reclaim_reflection_p<N>` slot is absent for this run, it returns
 * `422 REFLECTION_REQUIRED` and no transition happens — a UI-only guard is not sufficient.
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
import { loadOwnedRun, transitionRun } from '@/app/api/v1/app/reclaim/runs/service';

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

  const { enteredPhaseKey } = await transitionRun(session.user.id, runId, fromPhase);

  log.info('Reclaim audit run transitioned', { runId, fromPhase, enteredPhaseKey });
  return successResponse({ enteredPhase: enteredPhaseKey });
});
