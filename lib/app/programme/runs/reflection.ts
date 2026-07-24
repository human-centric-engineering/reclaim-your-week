/**
 * The reflection gate (F4 t-3, I9). Server-side check that the required reflection for a phase is
 * present **for this run** before the leader may leave it. Uses `getSlotHeads` (a framework read, no
 * direct Prisma), so it stays in `lib/app` and is unit-testable with the read mocked.
 *
 * Run-scoped (I9 + F1): a reflection captured in a *prior* run does not satisfy the current one, so
 * the head's `provenance.runId` must equal this run's id — otherwise a repeat audit would inherit the
 * last audit's pauses and skip the reflection.
 */

import { z } from 'zod';
import { getSlotHeads } from '@/lib/framework/data-slots';
import { reflectionSlugForLeaving } from '@/lib/app/programme/runs/phases';

/** The one field of `SlotValue.provenance` (a `Json` column) this gate reads, validated not cast. */
const provenanceRunIdSchema = z.object({ runId: z.string() });

/**
 * The reflection slot still missing before leaving `leavingPhaseKey` for `runId`, or `null` when the
 * requirement is satisfied (or the phase has no reflection). A non-null return is the leaf's
 * `422 REFLECTION_REQUIRED` signal.
 */
export async function missingReflectionSlug(
  userId: string,
  runId: string,
  leavingPhaseKey: string
): Promise<string | null> {
  const slug = reflectionSlugForLeaving(leavingPhaseKey);
  if (slug === null) return null; // Phase 0 and Phase 6 have no reflection gate.

  const heads = await getSlotHeads(userId, { slotSlugs: [slug] });
  const satisfied = heads.some((head) => {
    const parsed = provenanceRunIdSchema.safeParse(head.provenance);
    return parsed.success && parsed.data.runId === runId;
  });
  return satisfied ? null : slug;
}
