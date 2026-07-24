/**
 * Reclaim audit runs — complete.
 *
 * POST /api/v1/app/reclaim/runs/:runId/complete
 *
 * Marks the run complete and closes the module surface conversation (`isActive:false`, I15) so a
 * repeat audit opens a fresh transcript instead of resuming this one. Idempotent.
 */

import { withAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { getRouteLogger } from '@/lib/api/context';
import { ValidationError } from '@/lib/api/errors';
import { cuidSchema } from '@/lib/validations/common';
import { completeRun } from '@/app/api/v1/app/reclaim/runs/service';

export const POST = withAuth<{ runId: string }>(async (request, session, { params }) => {
  const log = await getRouteLogger(request);
  const { runId: rawRunId } = await params;
  const parsed = cuidSchema.safeParse(rawRunId);
  if (!parsed.success)
    throw new ValidationError('Invalid run id', { runId: ['Must be a valid id'] });

  const run = await completeRun(session.user.id, parsed.data);

  log.info('Reclaim audit run completed', { runId: run.id, userId: session.user.id });
  return successResponse({ runId: run.id, status: run.status });
});
