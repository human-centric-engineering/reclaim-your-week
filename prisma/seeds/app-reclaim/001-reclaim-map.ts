/**
 * Seed the reclaim-audit journey map (F3 t-1).
 *
 * Publishes the seven-phase `stage` chain (`lib/app/programme/map.ts`) as v1 of the
 * `reclaim-audit` facilitation graph, via `createGraph` — which validates the definition and
 * publishes it atomically, the same gate `smoke:reclaim` and F4 rely on. Idempotent: if the map
 * is already published (a re-seed), it is left untouched.
 *
 * Ordering (numeric prefix): this runs **before** `002-reclaim-surface`, which calls
 * `initFramework()`. `initFramework` registers the post-publish auto-embed listener; publishing
 * the map first means that fire-and-forget embed (which would need an embedding provider the seed
 * environment has no reason to configure) never fires here. Nothing in the publish needs the
 * framework registry — the map references no module (stage nodes), so it stands alone.
 *
 * App seeds live under `prisma/seeds/app-reclaim/` and are discovered recursively by the runner,
 * sorted after every core (digit-prefixed) seed. See `prisma/runner.ts`.
 */

import type { SeedUnit } from '@/prisma/runner';
import { serviceAccountWhere } from '@/lib/auth/account';
import { createGraph, getPublishedMap } from '@/lib/framework/facilitation/map';
import { reclaimJourneyMap, RECLAIM_MAP_SLUG, RECLAIM_MAP_NAME } from '@/lib/app/programme/map';

const unit: SeedUnit = {
  name: 'app-reclaim/001-reclaim-map',
  async run({ prisma, logger }) {
    logger.info('🗺️  Seeding reclaim-audit journey map...');

    const existing = await getPublishedMap(RECLAIM_MAP_SLUG);
    if (existing) {
      logger.info(`reclaim-audit map already published (v${existing.version}) — leaving untouched`);
      return;
    }

    // The author of record for the initial version (createGraph audits the publish against it).
    const serviceAccount = await prisma.user.findFirst({
      where: serviceAccountWhere,
      select: { id: true },
    });
    if (!serviceAccount) {
      throw new Error('No service account found — ensure 001-system-owner runs first.');
    }

    const graph = await createGraph({
      slug: RECLAIM_MAP_SLUG,
      name: RECLAIM_MAP_NAME,
      definition: reclaimJourneyMap,
      userId: serviceAccount.id,
    });

    logger.info(
      `✅ Published reclaim-audit map "${graph.slug}" v1 (${reclaimJourneyMap.nodes.length} phases)`
    );
  },
};

export default unit;
