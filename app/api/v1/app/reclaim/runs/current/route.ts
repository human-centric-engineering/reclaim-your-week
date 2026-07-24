/**
 * Reclaim audit runs — the current run + progress.
 *
 * GET /api/v1/app/reclaim/runs/current
 *
 * The single enriched read the programme shell (F4 t-4) loads on mount: the active run (or `null`)
 * and every phase's status, so the client renders where the leader is and resumes there. One request,
 * no per-phase fetches (repo rule).
 */

import { withAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { loadCurrentRunState } from '@/app/api/v1/app/reclaim/runs/service';

export const GET = withAuth(async (_request, session) => {
  const state = await loadCurrentRunState(session.user.id);
  return successResponse(state);
});
