/**
 * The quarterly-nudge tick (F9 t-3). Admin only.
 *
 * POST /api/v1/app/reclaim/nudges/tick → decide, send, report.
 *
 * Designed to be called by an external cron **daily**, not per-minute: the nudge falls due ninety days
 * after a completed audit, so the resolution that matters is a day. It mirrors core's own pattern
 * (`POST /api/v1/admin/orchestration/schedules/tick` carries the same "called by an external cron"
 * contract) because Sunrise's scheduler only runs workflow schedules, with no seam for a leaf job.
 *
 * **Admin-guarded rather than secret-guarded**, deliberately: a cron caller can hold an admin API key,
 * and inventing a second authentication scheme for one route would be a worse trade than reusing the
 * one the platform already audits. It also carries its own rate-limit sub-cap — a route that sends
 * mail is precisely the expensive sub-flow `CLAUDE.md` carves out of the inherited section cap, and
 * the failure mode without one is a misconfigured cron hammering the mail provider.
 *
 * Idempotent by construction: `runNudgeTick` claims each send against the audit it is about, so
 * running it twice in a day sends nothing the second time. That is the property that lets an operator
 * re-run it without thinking.
 */

import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { getRouteLogger } from '@/lib/api/context';
import { inviteLimiter, createRateLimitResponse } from '@/lib/security/rate-limit';
import { getClientIP } from '@/lib/security/ip';
import { runNudgeTick } from '@/lib/app/programme/nudges/tick';

export const POST = withAdminAuth(async (request, session) => {
  const log = await getRouteLogger(request);

  const limit = inviteLimiter.check(getClientIP(request));
  if (!limit.success) return createRateLimitResponse(limit);

  const result = await runNudgeTick();

  log.info('Reclaim: nudge tick invoked', { adminId: session.user.id, ...result });
  return successResponse(result);
});
