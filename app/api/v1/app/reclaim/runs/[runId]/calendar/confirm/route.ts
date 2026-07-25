/**
 * Reclaim audit runs — confirm the calendar review (F5 t-3).
 *
 * POST /api/v1/app/reclaim/runs/:runId/calendar/confirm
 *   body: { corrections?, offCalAttribution?, completeness?, switchFrequency?, reactiveTime?, offCalWork?, messagingLoad? }
 *
 * Applies the leader's confirmed/corrected categorisation and the "what the calendar misses" answers,
 * then computes and persists the composite picture (I-composite). Returns the composite for render.
 * Still totals-only — no event detail is involved (I4). Run verified from the path (I6).
 */

import { z } from 'zod';
import { withAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import { ValidationError } from '@/lib/api/errors';
import { cuidSchema } from '@/lib/validations/common';
import { loadOwnedRun, RUN_STATUS } from '@/app/api/v1/app/reclaim/runs/service';
import { confirmCalendarReview } from '@/lib/app/programme/calendar/confirm';

const hoursMap = z.record(z.string(), z.number().min(0).max(168));
const prose = z.string().trim().max(2000);

const confirmSchema = z.object({
  corrections: hoursMap.optional(),
  offCalAttribution: hoursMap.optional(),
  completeness: prose.optional(),
  switchFrequency: prose.optional(),
  reactiveTime: prose.optional(),
  offCalWork: prose.optional(),
  messagingLoad: prose.optional(),
});

export const POST = withAuth<{ runId: string }>(async (request, session, { params }) => {
  const log = await getRouteLogger(request);
  const { runId: rawRunId } = await params;
  const parsed = cuidSchema.safeParse(rawRunId);
  if (!parsed.success)
    throw new ValidationError('Invalid run id', { runId: ['Must be a valid id'] });
  const runId = parsed.data;

  const run = await loadOwnedRun(runId, session.user.id);
  if (run.status !== RUN_STATUS.inProgress) {
    throw new ValidationError('This audit is not in progress', {
      run: ['A calendar review can only be confirmed on an active run.'],
    });
  }

  const body = await validateRequestBody(request, confirmSchema);
  const composite = await confirmCalendarReview(session.user.id, runId, body);

  log.info('Reclaim calendar review confirmed', {
    runId,
    compositeBuckets: Object.keys(composite.compositeHours).length,
    varianceCount: composite.variance.length,
  });
  return successResponse(composite);
});
