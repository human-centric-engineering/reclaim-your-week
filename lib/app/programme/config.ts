/**
 * Read the coach-editable Reclaim config (F7). The Phase 2 coaching signal and the strategy mirror are
 * open items Rashmir owes (plan.md 10 & 11); they live in `Module.config` (default off) so she can flip
 * them without a deploy. The phase UIs fetch these toggles to decide whether to render that copy.
 */

import { prisma } from '@/lib/db/client';
import { reclaimConfigSchema, RECLAIM_MODULE_SLUG } from '@/lib/app/programme/module';

/** The subset of config the client UIs need — the two open-item toggles. */
export interface ReclaimUiConfig {
  phase2CoachingSignal: boolean;
  strategyMirror: boolean;
}

/** Read the stored module config, falling back to the schema defaults (both toggles off). */
export async function readReclaimUiConfig(): Promise<ReclaimUiConfig> {
  const row = await prisma.module.findUnique({
    where: { slug: RECLAIM_MODULE_SLUG },
    select: { config: true },
  });
  const parsed = reclaimConfigSchema.safeParse(row?.config ?? {});
  const config = parsed.success ? parsed.data : reclaimConfigSchema.parse({});
  return {
    phase2CoachingSignal: config.phase2CoachingSignal,
    strategyMirror: config.strategyMirror,
  };
}
