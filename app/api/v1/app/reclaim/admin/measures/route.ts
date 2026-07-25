/**
 * The two success measures (F10 t-2). Admin only.
 *
 * GET /api/v1/app/reclaim/admin/measures
 *
 * Counts over the leaf's own rows — no cross-user journey or slot reads, so no `isAdminSupport`
 * viewer is involved here at all. Aggregate counts of runs and invites are not personal data in the
 * way a client record is.
 */

import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { getRouteLogger } from '@/lib/api/context';
import { readMeasures } from '@/lib/app/programme/admin/measures';

export const GET = withAdminAuth(async (request, session) => {
  const log = await getRouteLogger(request);
  const measures = await readMeasures();

  log.info('Reclaim admin: measures read', {
    adminId: session.user.id,
    clients: measures.totals.clients,
  });
  return successResponse(measures);
});
