/**
 * A leader's trend lines across their completed audits (F9 t-1).
 *
 * GET /api/v1/app/reclaim/trends → per-bucket hours per audit, oldest first.
 *
 * Their own data only — `withAuth` supplies the user id and nothing in the request can widen it, so
 * there is no id to validate and no ownership check to get wrong.
 */

import { withAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { getRouteLogger } from '@/lib/api/context';
import { readTrends } from '@/lib/app/programme/trends';

export const GET = withAuth(async (request, session) => {
  const log = await getRouteLogger(request);
  const trends = await readTrends(session.user.id);

  log.info('Reclaim: trends read', { audits: trends.runs.length, enoughData: trends.enoughData });
  return successResponse(trends);
});
