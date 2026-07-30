/**
 * Let an audit go (F16 t-1).
 *
 * POST /api/v1/app/reclaim/runs/:runId/abandon → the updated run
 *
 * **Why a named verb rather than the obvious alternatives.** Not `DELETE /runs/:runId`: nothing is
 * deleted, the row and its transcript stay in the leader's history, and a `DELETE` on a resource
 * that survives is a lie the API tells its own clients. Not `PATCH { status }`: that invites a
 * client to set `complete`, and which transitions are legal is the server's to decide, exactly as
 * `/complete` and `/transition` already are.
 *
 * **No body, not even an optional reason.** Asking a leader why they are leaving is a retention
 * survey, and Brief §2 asks for no pressure on next steps anywhere in the product. If that signal is
 * ever wanted it is a separate decision with its own consent question, not a field quietly added to
 * a route they reach while giving something up.
 */

import { withAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { ValidationError } from '@/lib/api/errors';
import { getRouteLogger } from '@/lib/api/context';
import { cuidSchema } from '@/lib/validations/common';
import { abandonRun } from '@/app/api/v1/app/reclaim/runs/service';

export const POST = withAuth<{ runId: string }>(async (request, session, { params }) => {
  const parsed = cuidSchema.safeParse((await params).runId);
  if (!parsed.success) {
    throw new ValidationError('Invalid run id', { runId: ['Must be a valid id'] });
  }
  const runId = parsed.data;

  // Ownership is `abandonRun`'s first act (`loadOwnedRun`), so another leader's run is a 404 rather
  // than a refusal that confirms it exists.
  const run = await abandonRun(session.user.id, runId);

  const log = await getRouteLogger(request);
  log.info('Reclaim audit let go', { runId, userId: session.user.id });

  return successResponse({ id: run.id, status: run.status, abandonedAt: run.abandonedAt });
});
