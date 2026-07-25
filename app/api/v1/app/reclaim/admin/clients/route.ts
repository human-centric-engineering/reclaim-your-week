/**
 * The client list (F10 t-1). Admin only.
 *
 * GET /api/v1/app/reclaim/admin/clients → every leader with a programme footprint, enriched.
 *
 * **One request, every column** — tier, consent, referral provenance, run status, the phase a stalled
 * audit is sitting in, chat cost and the qualification answers all arrive here (the repo's no-N+1
 * rule, and the thing to check first in review: a table that fires a fetch per row would undo it).
 *
 * The session user's id is passed down because the cross-user read is opted into **explicitly** —
 * `listClients` builds the `isAdminSupport` viewer from it, so the widening is attributable to the
 * admin who made the request rather than to a bare boolean (plan D4).
 *
 * Auth is `withAdminAuth`; the 100/min section cap applies automatically via `proxy.ts`. No sub-cap:
 * this is a read, and an expensive-sub-flow cap is for handlers that send mail or call a model.
 */

import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { getRouteLogger } from '@/lib/api/context';
import { listClients } from '@/lib/app/programme/admin/clients';

export const GET = withAdminAuth(async (request, session) => {
  const log = await getRouteLogger(request);
  const view = await listClients(session.user.id);

  log.info('Reclaim admin: client list read', {
    adminId: session.user.id,
    clients: view.clients.length,
  });
  return successResponse(view);
});
