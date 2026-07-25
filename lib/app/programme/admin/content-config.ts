/**
 * Reading and writing the module's stored content config (F10 t-4).
 *
 * Lives in `lib/app` rather than beside its route for the same reason `runs/journey.ts` does: this is
 * where framework vocabulary belongs. `Module`, `ModuleVersion`, `moduleId` are the tier below's
 * nouns, and `npm run framework:boundary` fails when they appear in the core-scanned `app/**` surface
 * — which it did, on the first version of this. The route stays thin HTTP glue.
 *
 * The save itself is the framework's `saveModuleConfig`, deliberately (plan D6): validation against
 * the registered Zod schema, the `ModuleVersion` snapshot, the change summary and the admin audit
 * entry all keep happening one tier down. The leaf contributes a form and this thin read.
 */

import { prisma } from '@/lib/db/client';
import { ValidationError } from '@/lib/api/errors';
import { saveModuleConfig } from '@/lib/framework/modules/config/version-service';
import {
  reclaimConfigSchema,
  RECLAIM_MODULE_SLUG,
  type ReclaimConfig,
} from '@/lib/app/programme/module';

export interface StoredContent {
  config: ReclaimConfig;
  /** The latest config version, or `null` for a module never edited. Carried for concurrency. */
  version: number | null;
}

/**
 * The stored config plus the version it came from.
 *
 * **A parse failure is fatal on the write path, not something to paper over.** Falling back to the
 * schema defaults is right for a *read* — a module never edited has no stored config and behaves as
 * the defaults say. On a save it would be destructive: `applyContentEdits` would layer a bucket
 * reword onto a fresh default object and `saveModuleConfig` replaces `Module.config` wholesale, so
 * rewording one sentence would silently reset `openSignup`, `policyVersion`, `clientWindowMonths` and
 * the stall rule. `strict` is which of those two callers is asking.
 */
export async function readStoredContent(strict: boolean): Promise<StoredContent> {
  const row = await prisma.module.findUnique({
    where: { slug: RECLAIM_MODULE_SLUG },
    select: { id: true, config: true },
  });

  const parsed = reclaimConfigSchema.safeParse(row?.config ?? {});
  if (!parsed.success && strict) {
    throw new ValidationError('The stored content could not be read', {
      config: [
        'The saved configuration does not match the current schema, so editing it would overwrite settings that are not on this screen. Restore a known-good version from the module’s history first.',
      ],
    });
  }
  const config = parsed.success ? parsed.data : reclaimConfigSchema.parse({});

  const latest =
    row == null
      ? null
      : await prisma.moduleVersion.findFirst({
          where: { moduleId: row.id },
          orderBy: { version: 'desc' },
          select: { version: true },
        });

  return { config, version: latest?.version ?? null };
}

/**
 * Save through the framework, returning the new version number.
 *
 * `expectedBaseVersion` is passed only when the caller supplied one. `saveModuleConfig` replaces the
 * whole config row, so two tabs open on the content editor would otherwise clobber each other — the
 * second save carries the first's fields as they were when *its* page loaded. The framework already
 * built the guard; the leaf's job is to carry the number through.
 */
export async function saveStoredContent(input: {
  config: ReclaimConfig;
  changeSummary: string;
  userId: string;
  clientIp: string | null;
  baseVersion?: number | null;
}): Promise<number> {
  const result = await saveModuleConfig({
    slug: RECLAIM_MODULE_SLUG,
    config: input.config,
    changeSummary: input.changeSummary,
    userId: input.userId,
    clientIp: input.clientIp,
    ...(input.baseVersion !== undefined ? { expectedBaseVersion: input.baseVersion } : {}),
  });
  return result.version.version;
}
