/**
 * How the coach works through a phase's readings — the one config key the capabilities can reach.
 *
 * ## Why this is its own file
 *
 * `config.ts` reads the module row and parses it with `reclaimConfigSchema`, which lives on the
 * module definition — and the module definition declares the coach's capabilities. So anything under
 * `coach/capabilities/` that reaches for the config closes a cycle: capability → config → module →
 * capability. `identity.ts` exists for exactly this reason and says so; this is the same move for the
 * one setting a capability genuinely needs.
 *
 * `offer_choices` needs it because a reading asked *with a partner* is not a reading a leader picks
 * an answer to — see `compoundQuestionSlugs` in `./phase-slots.ts` — and whether readings are paired
 * at all is this setting. Reading it any other way would mean a guard that fights the instruction
 * under `one-at-a-time`, where the coach is told to ask each reading alone and its set is real.
 *
 * ## The schema is defined here and used there, not the other way round
 *
 * `reclaimConfigSchema` embeds `reclaimQuestioningSchema` rather than restating it, so the default
 * lives in exactly one place. A second copy of `pairing: 'paired'` would be a default that drifts the
 * first time somebody changes their mind about it, and the drift would be silent: the config form
 * would offer one thing and this guard would assume another.
 */

import { z } from 'zod';
import { prisma } from '@/lib/db/client';
import { RECLAIM_MODULE_SLUG } from '@/lib/app/programme/identity';

/**
 * Both of these select between prose blocks authored in this repo and guarded by
 * `product-voice.test.ts`; neither lets an operator write prompt text. That distinction is
 * load-bearing — see the note in `module.ts` on why no coaching prose is a config key.
 *
 * `pairing: 'paired'` asks a reading and its partner in one breath, which is what the source
 * describes for the areas ("roughly how many hours per week …? What does that time actually look
 * like in practice?") and for the energy pair. `one-at-a-time` is the older behaviour, kept as an
 * escape hatch rather than as a recommendation: asked singly, the hours arrive and the texture does
 * not, which is the failure the pairing exists to prevent.
 *
 * `opportunistic` lets the leader set the route. The capture list says what is still outstanding, so
 * a coach that follows them onto a later reading cannot lose its place; turning it off restores a
 * fixed running order.
 */
export const reclaimQuestioningSchema = z
  .object({
    pairing: z.enum(['paired', 'one-at-a-time']).default('paired'),
    opportunistic: z.boolean().default(true),
  })
  .default({ pairing: 'paired', opportunistic: true });

export type ReclaimQuestioning = z.infer<typeof reclaimQuestioningSchema>;

/**
 * The questioning settings for this deployment, or the shipped defaults.
 *
 * Parses the one key it needs out of the stored config rather than the whole of it, which is what
 * lets it stay clear of `module.ts`. A row that fails to parse — or is not there at all, which is the
 * ordinary state before an operator has ever saved the config — yields the defaults, exactly as
 * `readReclaimConfig` does with the full schema.
 */
export async function readReclaimQuestioning(): Promise<ReclaimQuestioning> {
  const row = await prisma.module.findUnique({
    where: { slug: RECLAIM_MODULE_SLUG },
    select: { config: true },
  });
  const parsed = z.object({ questioning: reclaimQuestioningSchema }).safeParse(row?.config ?? {});
  return parsed.success ? parsed.data.questioning : reclaimQuestioningSchema.parse(undefined);
}
