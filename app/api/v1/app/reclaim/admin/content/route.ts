/**
 * Content editing (F10 t-4). Admin only.
 *
 * GET /api/v1/app/reclaim/admin/content → the editable fields, each marked against the source doc
 * PUT /api/v1/app/reclaim/admin/content → apply edits and save
 *
 * **The save goes through the framework's own `saveModuleConfig`** (plan D6), which is the whole
 * point of building a leaf form rather than a leaf write path: validation against the registered Zod
 * schema, the `ModuleVersion` snapshot, the change summary and the admin audit entry all keep
 * happening in the tier that already does them. The leaf contributes a form the nine bucket
 * descriptions can actually be edited in, and nothing else.
 *
 * The reads and the save live in `lib/app/programme/admin/content-config.ts` rather than here, because
 * `Module` / `ModuleVersion` / `moduleId` are framework vocabulary and `framework:boundary` keeps them
 * out of the core-scanned `app/**` surface — it failed on the first version of this file. What is left
 * here is HTTP glue.
 *
 * `changeSummary` is **required** here though the framework treats it as optional. Content is the one
 * thing in this product that is somebody else's writing; "what changed and why" is worth the friction
 * on a screen that edits it, and version history without it is a list of anonymous diffs.
 */

import { z } from 'zod';
import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import { getClientIP } from '@/lib/security/ip';
import { buildContentView, applyContentEdits } from '@/lib/app/programme/admin/content-diff';
import { readStoredContent, saveStoredContent } from '@/lib/app/programme/admin/content-config';

const saveContentSchema = z.object({
  /** Dotted field path → new text. Unknown paths are dropped by `applyContentEdits`, not written. */
  values: z.record(z.string(), z.string().max(4000)),
  changeSummary: z.string().trim().min(1).max(500),
  /**
   * The config version this edit was composed against, echoed back from the GET, so a concurrent save
   * is refused rather than silently overwritten. Optional so an older client fails open — that is the
   * last-writer-wins behaviour it has today, rather than a 400 it cannot act on.
   */
  baseVersion: z.number().int().nullable().optional(),
});

export const GET = withAdminAuth(async (request, session) => {
  const log = await getRouteLogger(request);
  const { config, version } = await readStoredContent(false);
  const view = { ...buildContentView(config), baseVersion: version };

  log.info('Reclaim admin: content read', {
    adminId: session.user.id,
    editedFields: view.editedCount,
    baseVersion: version,
  });
  return successResponse(view);
});

export const PUT = withAdminAuth(async (request, session) => {
  const log = await getRouteLogger(request);
  const body = await validateRequestBody(request, saveContentSchema);

  const { config } = await readStoredContent(true);
  const next = applyContentEdits(config, body.values);

  const version = await saveStoredContent({
    config: next,
    changeSummary: body.changeSummary,
    userId: session.user.id,
    clientIp: getClientIP(request),
    ...(body.baseVersion !== undefined ? { baseVersion: body.baseVersion } : {}),
  });

  const view = { ...buildContentView(next), baseVersion: version };
  log.info('Reclaim admin: content saved', {
    adminId: session.user.id,
    version,
    editedFields: view.editedCount,
  });
  return successResponse(view);
});
