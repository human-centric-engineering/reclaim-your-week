/**
 * The comparative open for a repeat audit (F9 t-2).
 *
 * GET /api/v1/app/reclaim/runs/:runId/compare → the previous audit beside this one.
 *
 * `previous: null` for a first audit — the UI is then absent rather than showing an empty comparison,
 * which is the difference between "you have nothing to compare yet" and "nothing changed".
 *
 * Ownership is verified server-side (`loadOwnedRun`); the run id in the path never authorises on its
 * own, and the previous audit is resolved from the session user, not from anything the client sends.
 */

import { withAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { getRouteLogger } from '@/lib/api/context';
import { ValidationError } from '@/lib/api/errors';
import { cuidSchema } from '@/lib/validations/common';
import { loadOwnedRun } from '@/app/api/v1/app/reclaim/runs/service';
import { readComparison } from '@/lib/app/programme/compare';

export const GET = withAuth<{ runId: string }>(async (request, session, { params }) => {
  const log = await getRouteLogger(request);

  const parsed = cuidSchema.safeParse((await params).runId);
  if (!parsed.success) {
    throw new ValidationError('Invalid run id', { runId: ['Must be a valid id'] });
  }
  await loadOwnedRun(parsed.data, session.user.id);

  const comparison = await readComparison(session.user.id, parsed.data);
  log.info('Reclaim: comparison read', {
    runId: parsed.data,
    hasPrevious: comparison.previous !== null,
  });
  return successResponse(comparison);
});
