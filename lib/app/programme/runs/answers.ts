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
 *
 * ## The one writer that does not stamp a run, and what that means here
 *
 * "A run's answers are the values stamped with that run's id" excludes exactly one write path in this
 * app: the **coach agent's `fill_slot`**. The agent holds it scoped to the `reclaim_profile` group
 * (I6), and the framework builds that provenance from `conversationId` / `moduleSlug` / `nodeKey`
 * with **no `runId`** — the leaf's `saveAnswer` is what stamps runs, and a capability write does not
 * go through it.
 *
 * So if a leader fills the Phase 0 form with role "CEO" and later tells the coach in chat that they
 * are actually COO, the correction lands as a version belonging to no run. This function returns the
 * form's "CEO" for that audit. That is **defensible and is the intended reading** — a run summary is a
 * snapshot of what that audit captured, and the later correction genuinely belongs to no audit — but
 * it is worth knowing rather than discovering: it is not that the correction is lost (it is the head,
 * so every heads-based read has it), only that it does not join a run's picture. Filed as
 * [[daybreak-asks]] daybreak#167; the fix belongs upstream, where a capability write could carry the
 * caller's run context.
 */

import { z } from 'zod';
import { prisma } from '@/lib/db/client';

// `verbatim` is optional and read leniently: it arrived after the first runs were captured, so every
// row written before it exists without one, and a row that has it must not be discarded for having
// it. `runId` is the only field this schema is a guarantee about.
const provenanceRunIdSchema = z.object({ runId: z.string(), verbatim: z.string().optional() });

/**
 * One slot's value for a run — the prose `value`, the typed `valueJson` (numbers/booleans), and how
 * the reading was come by.
 *
 * `sourceType` and `confidence` are what let a screen tell a reading the leader stated outright from
 * one the coach inferred between the lines. Both columns have existed since the slot model did; the
 * forms simply wrote `direct` at confidence 10 every time, so nothing downstream had reason to read
 * them. Conversational capture is the reason: an inference has to be visible *as* an inference and
 * offered back for the leader to confirm, or the audit quietly contains things nobody said.
 */
export interface RunAnswer {
  value: string;
  valueJson: unknown;
  /** `direct`, `inferred`, `user_confirmed`, … from the framework's source-type vocabulary. */
  sourceType: string;
  /** 1–10. A form answer is 10; a coach's inference is lower and is worth checking. */
  confidence: number;
  /**
   * The leader's own sentence, where the writer captured one. Absent on every form-path row (the
   * leader typed it, so `value` already is their words) and on everything written before the coach
   * could record one. Read it through `presentAnswer` rather than directly, so the presentation
   * policy decides which of the two a given surface shows.
   */
  verbatim?: string;
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
  // `(provenance->>'runId')`, not a different query shape.
  //
  // On what proves this works: `smoke:reclaim-run` step 8 runs it against real Postgres, and catches
  // the filter returning **too little** (an over-narrowed query, or the head filter creeping back).
  // It cannot catch the filter returning too much, because the Zod re-check below would discard the
  // extra rows and every assertion would still pass — so the narrowing is a performance property
  // here, not a correctness one. Correctness rests on the re-check.
  const rows = await prisma.slotValue.findMany({
    where: {
      userId,
      ...(slugs?.length ? { slotSlug: { in: slugs } } : {}),
      provenance: { path: ['runId'], equals: runId },
    },
    orderBy: { version: 'asc' },
    select: {
      slotSlug: true,
      value: true,
      valueJson: true,
      provenance: true,
      sourceType: true,
      confidence: true,
    },
  });

  const out: Record<string, RunAnswer> = {};
  for (const row of rows) {
    // Re-check the id in code as well as in the query — and note the division of labour, because it
    // is what makes this safe: the JSON path filter is the **narrowing** (it keeps the row count
    // down) and this is the **guarantee** (it decides what counts). Prisma emits the path filter as
    // a bound parameter against `provenance #> ARRAY[...]`, where a missing key or a type mismatch
    // yields NULL or false and is therefore excluded rather than included — so the filter can only
    // ever under-include, and the re-check is a sufficient backstop for the case where it does not
    // behave as expected at all.
    const parsed = provenanceRunIdSchema.safeParse(row.provenance);
    if (!parsed.success || parsed.data.runId !== runId) continue;
    // Ascending version, so a later write for the same run overwrites an earlier one — last wins.
    // That is also what makes a confirmation land properly: the leader confirming a coach's inference
    // writes a fresh version at `user_confirmed`, and this read then reports the confirmed reading.
    out[row.slotSlug] = {
      value: row.value,
      valueJson: row.valueJson,
      sourceType: row.sourceType,
      confidence: row.confidence,
      ...(parsed.data.verbatim !== undefined ? { verbatim: parsed.data.verbatim } : {}),
    };
  }
  return out;
}
