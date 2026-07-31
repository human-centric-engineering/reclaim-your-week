/**
 * Content history. Admin only.
 *
 * GET /api/v1/app/reclaim/admin/content/versions → the saved versions, newest first, each with what
 *     it changed in the words the editor uses for those fields.
 *
 * The framework already serves its own version list at
 * `/api/v1/admin/framework/modules/:slug/versions`, and this route exists rather than the screen
 * calling that one because the two answer different questions. The framework's is generic: raw
 * snapshots, a `createdBy` id, no idea which of those JSON keys is a sentence a leader reads. This one
 * resolves the author, says which *wording* moved, and never ships the snapshot — the config carries
 * settings this screen does not edit, and an admin surface should not hand back more than it shows.
 *
 * As with the sibling route, the `Module` / `ModuleVersion` vocabulary stays in
 * `lib/app/programme/admin/content-history.ts`: `framework:boundary` keeps framework nouns out of the
 * core-scanned `app/**` surface. What is left here is HTTP glue.
 */

import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { getRouteLogger } from '@/lib/api/context';
import { listContentVersions } from '@/lib/app/programme/admin/content-history';

export const GET = withAdminAuth(async (request, session) => {
  const log = await getRouteLogger(request);
  const versions = await listContentVersions();

  log.info('Reclaim admin: content history read', {
    adminId: session.user.id,
    count: versions.length,
  });
  return successResponse({ versions });
});
