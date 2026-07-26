/**
 * The recent-audit shortcut (F9 t-2, [[content-source]] §4).
 *
 * GET /api/v1/app/reclaim/shortcut → the previous audit's context to confirm, or nothing.
 *
 * Read at the top of Phase 0. When the leader's last audit finished inside the configured window,
 * this returns the §4 confirm line with their own answers interpolated and those answers for
 * pre-filling; otherwise `previous: null` and Phase 0 asks in full, exactly as it always did.
 *
 * **Read-only, and that is load-bearing.** The shortcut pre-fills a form; confirming still writes
 * every value again through `saveAnswer` under the new run's id (I3). Carrying values forward at the
 * database level would make the previous audit's picture change when the new one confirms something.
 */

import { withAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { getRouteLogger } from '@/lib/api/context';
import { readShortcut } from '@/lib/app/programme/compare';

export const GET = withAuth(async (request, session) => {
  const log = await getRouteLogger(request);
  const shortcut = await readShortcut(session.user.id);

  log.info('Reclaim: recent-audit shortcut read', { applies: shortcut.previous !== null });
  return successResponse(shortcut);
});
