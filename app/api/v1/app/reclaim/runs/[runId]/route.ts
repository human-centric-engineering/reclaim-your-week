/**
 * Reclaim audit runs — one audit, whatever state it is in.
 *
 * GET /api/v1/app/reclaim/runs/:runId
 *
 * The single enriched read the review surface loads on mount: the run's own row, plus every phase's
 * status and where the audit stopped. One request, no per-phase fetches (repo rule).
 *
 * **Read-only is the server's word, not the screen's.** Nothing here opens a run for editing, and
 * nothing needs to: `saveRunAnswer` refuses a run that is not in progress, `loadCoachTurnTarget`
 * refuses a coach turn on one, and the journey engine refuses to complete a node that is not active.
 * So a finished audit is already immutable by construction, and this route only makes it legible.
 *
 * Ownership is `loadOwnedRun` inside the service: a run id belonging to somebody else is a 404, and
 * the id alone never authorises.
 */

import { withAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { ValidationError } from '@/lib/api/errors';
import { cuidSchema } from '@/lib/validations/common';
import { loadRunState } from '@/app/api/v1/app/reclaim/runs/service';

export const GET = withAuth<{ runId: string }>(async (_request, session, { params }) => {
  const parsed = cuidSchema.safeParse((await params).runId);
  if (!parsed.success)
    throw new ValidationError('Invalid run id', { runId: ['Must be a valid id'] });

  return successResponse(await loadRunState(session.user.id, parsed.data));
});
