/**
 * Reclaim audit runs — the leader's own summary (F7 t-4).
 *
 * GET /api/v1/app/reclaim/runs/:runId/summary  → the AuditSummary for this run.
 *
 * The in-app Phase 6 view (before any sharing). Ownership-scoped (`loadOwnedRun`); the public,
 * token-gated view is `/api/v1/app/reclaim/shared/:token`.
 */

import { withAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { ValidationError } from '@/lib/api/errors';
import { cuidSchema } from '@/lib/validations/common';
import { loadOwnedRun } from '@/app/api/v1/app/reclaim/runs/service';
import { buildSummary } from '@/lib/app/programme/summary';

export const GET = withAuth<{ runId: string }>(async (_request, session, { params }) => {
  const parsed = cuidSchema.safeParse((await params).runId);
  if (!parsed.success)
    throw new ValidationError('Invalid run id', { runId: ['Must be a valid id'] });
  const runId = parsed.data;

  await loadOwnedRun(runId, session.user.id);
  return successResponse(await buildSummary(session.user.id, runId));
});
