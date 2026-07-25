/**
 * Read a run's captured answers (F6), scoped by `provenance.runId` (F1).
 *
 * ## Why this reads history rather than heads
 *
 * This function used to call `getSlotHeads` and then filter the results by `provenance.runId`. That
 * is correct-looking, correctly named, and correct for exactly as long as every leader has **one**
 * run — because then the head of every slug *is* that run's value.
 *
 * `getSlotHeads` is `WHERE supersededAt IS NULL`. The moment a leader starts a second audit and
 * answers anything, that slug's first-run version is superseded and stops being a head — so the
 * filter can no longer match it, and this function silently returns **less and less of run 1**.
 * Everything downstream degraded with it, in ways nobody was told about:
 *
 *   - `buildSummary(userId, run1)` hollowed out as audit 2 filled in;
 *   - **`GET /api/v1/app/reclaim/shared/[token]`** — the tokenised public link F7 t-4 invites leaders
 *     to send to a colleague — rendered that emptying summary. A leader who shared their Q1 results
 *     would find the link had quietly gone blank because *they* started a Q2 audit.
 *
 * The fix is the read `getSlotHistory` was added for in F1 t-2 (#17), which had no consumer until
 * now: **a run's answers are the values stamped with that run's id, superseded or not.** Superseded
 * means "a later version exists", not "this never happened" — and for a completed audit, a later
 * version is precisely what we must ignore.
 *
 * ## Why the query is here rather than in the framework
 *
 * `getSlotHistory(userId, slotSlug)` is per-slug, and a summary needs dozens; issuing one round trip
 * each to rebuild one page is not a fix worth having. There is no batched sibling, so the leaf
 * queries `SlotValue` directly — the same justification F10's admin reads use, and the boundary
 * allows it because `lib/app` is the framework-consuming tier. The missing batched read is filed as
 * [[daybreak-asks]] daybreak#162; when it lands, this becomes a delegation.
 *
 * ## Related reads that are NOT affected
 *
 * `runs/reflection.ts` also filters heads by `provenance.runId` and is **fail-safe** under the same
 * conditions: it asks "did *this* run write the reflection", and a head belonging to this run proves
 * it. A prior run's head fails the check, which holds the I9 gate shut — the safe direction. It is
 * left as it is deliberately; changing a working gate to fix a different bug is how a fix acquires a
 * regression.
 *
 * The calendar reads (`calendar/store.ts`, `calendar/analyse.ts`) and the F10 admin reads use heads
 * on purpose: the former only ever run inside the live run (whose values *are* the heads), and the
 * latter want the leader's data as it currently stands. Neither is run-scoped.
 */

import { z } from 'zod';
import { prisma } from '@/lib/db/client';

const provenanceRunIdSchema = z.object({ runId: z.string() });

/** One slot's value for a run — the prose `value` plus the typed `valueJson` (numbers/booleans). */
export interface RunAnswer {
  value: string;
  valueJson: unknown;
}

/**
 * The run-scoped answers for the given slugs (all of the run's if `slugs` is omitted), keyed by slug.
 *
 * A value counts when its `provenance.runId` matches `runId`, **whether or not it has since been
 * superseded**. Where a run wrote the same slug more than once — a leader correcting an hours figure
 * before moving on — the highest `version` for that run wins, which is that run's final answer.
 */
export async function readRunAnswers(
  userId: string,
  runId: string,
  slugs?: string[]
): Promise<Record<string, RunAnswer>> {
  // The `runId` filter is applied in Postgres via the JSON path rather than in JS, so a leader with
  // several audits does not drag every version of every slug across the wire to find one run's.
  //
  // On cost: the JSON path is not indexed, so this scans the user's own slot rows — which is a few
  // hundred at v1 scale (105 slugs × a handful of audits) and bounded by `userId`, not by the table.
  // If a leader ever accumulates enough audits for that to matter, the fix is an expression index on
  // `(provenance->>'runId')`, not a different query shape. Verified against real Postgres by
  // `smoke:reclaim-run` step 8, which is also what proves the JSON path operator behaves as expected.
  const rows = await prisma.slotValue.findMany({
    where: {
      userId,
      ...(slugs?.length ? { slotSlug: { in: slugs } } : {}),
      provenance: { path: ['runId'], equals: runId },
    },
    orderBy: { version: 'asc' },
    select: { slotSlug: true, value: true, valueJson: true, provenance: true },
  });

  const out: Record<string, RunAnswer> = {};
  for (const row of rows) {
    // Re-check the id in code as well as in the query. The JSON path filter is the fast narrowing;
    // this is the assertion, and it keeps the guarantee readable for anyone auditing the run-scoping
    // rule without having to trust a Prisma JSON operator's exact semantics.
    const parsed = provenanceRunIdSchema.safeParse(row.provenance);
    if (!parsed.success || parsed.data.runId !== runId) continue;
    // Ascending version, so a later write for the same run overwrites an earlier one — last wins.
    out[row.slotSlug] = { value: row.value, valueJson: row.valueJson };
  }
  return out;
}
