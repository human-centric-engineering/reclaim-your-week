/**
 * Reclaim audit runs — create.
 *
 * POST /api/v1/app/reclaim/runs
 *
 * Starts a new audit run for the caller: the `app_reclaim_audit_run` row + its `UserJourney`, entered
 * at Phase 0. Refuses a second in-progress run. Auth + the inherited 100/min section cap (proxy.ts).
 */

import { z } from 'zod';
import { withAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import { createRun } from '@/app/api/v1/app/reclaim/runs/service';

const createRunSchema = z.object({
  /** The audit period label (e.g. "2026 Q3"). Optional; the setup form sets it in F6. */
  quarter: z.string().trim().min(1).max(40).optional(),
});

export const POST = withAuth(async (request, session) => {
  const log = await getRouteLogger(request);
  const body = await validateRequestBody(request, createRunSchema);

  const run = await createRun(session.user.id, body.quarter);

  log.info('Reclaim audit run created', { runId: run.id, userId: session.user.id });
  return successResponse({ runId: run.id, status: run.status }, { status: 201 });
});
