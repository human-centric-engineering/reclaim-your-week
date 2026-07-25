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
import { prisma } from '@/lib/db/client';
import { saveModuleConfig } from '@/lib/framework/modules/config/version-service';
import {
  reclaimConfigSchema,
  RECLAIM_MODULE_SLUG,
  type ReclaimConfig,
} from '@/lib/app/programme/module';
import { buildContentView, applyContentEdits } from '@/lib/app/programme/admin/content-diff';

/** The stored config, falling back to the schema defaults for a module never edited. */
async function readStoredConfig(): Promise<ReclaimConfig> {
  const row = await prisma.module.findUnique({
    where: { slug: RECLAIM_MODULE_SLUG },
    select: { config: true },
  });
  const parsed = reclaimConfigSchema.safeParse(row?.config ?? {});
  return parsed.success ? parsed.data : reclaimConfigSchema.parse({});
}

const saveContentSchema = z.object({
  /** Dotted field path → new text. Unknown paths are dropped by `applyContentEdits`, not written. */
  values: z.record(z.string(), z.string().max(4000)),
  changeSummary: z.string().trim().min(1).max(500),
});

export const GET = withAdminAuth(async (request, session) => {
  const log = await getRouteLogger(request);
  const view = buildContentView(await readStoredConfig());

  log.info('Reclaim admin: content read', {
    adminId: session.user.id,
    editedFields: view.editedCount,
  });
  return successResponse(view);
});

export const PUT = withAdminAuth(async (request, session) => {
  const log = await getRouteLogger(request);
  const body = await validateRequestBody(request, saveContentSchema);

  const stored = await readStoredConfig();
  const next = applyContentEdits(stored, body.values);

  const result = await saveModuleConfig({
    slug: RECLAIM_MODULE_SLUG,
    config: next,
    changeSummary: body.changeSummary,
    userId: session.user.id,
    clientIp: getClientIP(request),
  });

  const view = buildContentView(next);
  log.info('Reclaim admin: content saved', {
    adminId: session.user.id,
    version: result.version.version,
    editedFields: view.editedCount,
  });
  return successResponse(view);
});
