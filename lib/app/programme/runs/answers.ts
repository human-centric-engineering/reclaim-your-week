/**
 * Read a run's captured answers (F6). Reads the framework slot heads and filters to **this run's**
 * versions by `provenance.runId` (F1) — so a repeat audit never inherits a prior run's answers. Lives
 * in `lib/app` (framework read) so the core-scanned `app/api` surface stays free of framework vocab.
 * The write side is `saveRunAnswers` (I3) in the run service.
 */

import { z } from 'zod';
import { getSlotHeads } from '@/lib/framework/data-slots';

const provenanceRunIdSchema = z.object({ runId: z.string() });

/** One slot's current value for a run — the prose `value` plus the typed `valueJson` (numbers/booleans). */
export interface RunAnswer {
  value: string;
  valueJson: unknown;
}

/**
 * The run-scoped answers for the given slugs (all of the run's if `slugs` is omitted), keyed by slug.
 * A head only counts when its `provenance.runId` matches `runId`.
 */
export async function readRunAnswers(
  userId: string,
  runId: string,
  slugs?: string[]
): Promise<Record<string, RunAnswer>> {
  const heads = await getSlotHeads(userId, slugs ? { slotSlugs: slugs } : undefined);
  const out: Record<string, RunAnswer> = {};
  for (const head of heads) {
    const parsed = provenanceRunIdSchema.safeParse(head.provenance);
    if (parsed.success && parsed.data.runId === runId) {
      out[head.slotSlug] = { value: head.value, valueJson: head.valueJson };
    }
  }
  return out;
}

/** Read a single run-scoped number slot (hours), or `null` when absent/non-numeric. */
export function numberAnswer(answer: RunAnswer | undefined): number | null {
  if (answer === undefined) return null;
  if (typeof answer.valueJson === 'number' && Number.isFinite(answer.valueJson))
    return answer.valueJson;
  const n = Number(answer.value);
  return Number.isFinite(n) ? n : null;
}
