/**
 * Reclaim audit runs — create, and list the caller's own.
 *
 * POST /api/v1/app/reclaim/runs   → start a new audit
 * GET  /api/v1/app/reclaim/runs   → every audit this leader has run, newest first
 *
 * POST starts a new audit run for the caller: the `app_reclaim_audit_run` row + its `UserJourney`,
 * entered at Phase 0. Refuses a second in-progress run. Auth + the inherited 100/min section cap
 * (proxy.ts).
 *
 * GET is the audit history. There was none for the whole of v1, and the consequence was that a
 * finished audit became unreachable the moment it finished: `runs/current` filters on `in_progress`
 * by design, so the only thing a leader kept of a completed audit was the share link, if they had
 * chosen to make one. Their own data only, scoped by the session user, so there is no id to validate
 * and no ownership check to get wrong.
 */

import { z } from 'zod';
import { withAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import { createRun, listRuns } from '@/app/api/v1/app/reclaim/runs/service';

const createRunSchema = z.object({
  /** The audit period label (e.g. "2026 Q3"). Optional; the setup form sets it in F6. */
  quarter: z.string().trim().min(1).max(40).optional(),
});

export const POST = withAuth(async (request, session) => {
  const log = await getRouteLogger(request);
  const body = await validateRequestBody(request, createRunSchema);

  const run = await createRun(session.user.id, body.quarter);

  log.info('Reclaim audit run created', { runId: run.id, userId: session.user.id });
  return successResponse({ runId: run.id, status: run.status }, undefined, { status: 201 });
});

export const GET = withAuth(async (request, session) => {
  const log = await getRouteLogger(request);
  const runs = await listRuns(session.user.id);

  log.info('Reclaim audit runs listed', { audits: runs.length });
  return successResponse({ runs });
});
