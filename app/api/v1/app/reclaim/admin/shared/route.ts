/**
 * Shared results + the anonymised aggregate (F10 t-3). Admin only.
 *
 * GET /api/v1/app/reclaim/admin/shared
 *
 * Two payloads on one screen, and they are deliberately different in kind:
 *
 *   - **`shared`** names people, because every row is someone who chose to send Rashmir their result.
 *   - **`aggregate`** names nobody, is restricted to leaders who accepted terms permitting aggregate
 *     use, and suppresses any figure over a cohort smaller than the configured floor.
 *
 * Keeping them in one response is what makes the difference legible on the page. Keeping them in one
 * *function* would not — the aggregate's consent filter must never be able to drift into the inbox's
 * "they opted in by sharing" logic, so they are separate modules with separate rules.
 */

import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { getRouteLogger } from '@/lib/api/context';
import { listSharedResults } from '@/lib/app/programme/admin/inbox';
import { readAggregate } from '@/lib/app/programme/admin/aggregate';

export const GET = withAdminAuth(async (request, session) => {
  const log = await getRouteLogger(request);

  const [shared, aggregate] = await Promise.all([listSharedResults(), readAggregate()]);

  log.info('Reclaim admin: shared results read', {
    adminId: session.user.id,
    shared: shared.length,
    cohort: aggregate.cohort,
    suppressed: aggregate.suppressed,
  });
  return successResponse({ shared, aggregate });
});
