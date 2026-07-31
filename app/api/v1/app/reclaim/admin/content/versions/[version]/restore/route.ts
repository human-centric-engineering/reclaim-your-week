/**
 * Restore a previous content version. Admin only.
 *
 * POST /api/v1/app/reclaim/admin/content/versions/:version/restore → write that version's wording
 *      back, as a new version.
 *
 * **History rolls forward.** The framework re-validates the old snapshot against the current schema,
 * writes it to the live config and snapshots it as the next version, so nothing is rewound and the
 * restore is itself reversible. That is also why there is no confirmation token here: the destructive
 * reading of this action does not exist.
 *
 * `:version` is a version number, not a row id. A version that no longer matches the schema is
 * refused by the service with its own message rather than reinstated.
 *
 * **Zero is a version here.** It is the wording as supplied, which `ModuleVersion` has no row for
 * because its first row is written by the first edit; `content-history.ts` serves it from the config
 * defaults. So the bound is non-negative rather than positive.
 */

import { z } from 'zod';
import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { ValidationError } from '@/lib/api/errors';
import { getRouteLogger } from '@/lib/api/context';
import { getClientIP } from '@/lib/security/ip';
import { restoreContentVersion } from '@/lib/app/programme/admin/content-history';

const versionParamSchema = z.coerce.number().int().nonnegative();

export const POST = withAdminAuth<{ version: string }>(async (request, session, { params }) => {
  const log = await getRouteLogger(request);
  const parsed = versionParamSchema.safeParse((await params).version);
  if (!parsed.success) {
    throw new ValidationError('That is not a version number', {
      version: ['A version is a whole number — 0 for the wording as supplied, then 1 upwards'],
    });
  }

  const version = await restoreContentVersion({
    version: parsed.data,
    userId: session.user.id,
    clientIp: getClientIP(request),
  });

  log.info('Reclaim admin: content version restored', {
    adminId: session.user.id,
    restoredFrom: parsed.data,
    version,
  });
  return successResponse({ version });
});
