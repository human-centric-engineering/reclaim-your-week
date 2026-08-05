/**
 * The Phase 6 share (F7 t-4). Sharing is **invited, never required** (§10, Brief §3).
 *
 * There is exactly one thing a leader can do here: share the report **with Rashmir**
 * (`ReclaimReportShare`, the existing-client inbox F10 reads), and optionally let her read the
 * conversation too. The optional feedback line + its **separate** quote consent land in
 * `ReclaimFeedback` — quote consent governs republication and is its own fact, not implied by sharing.
 *
 * ## The public link is gone, and this is the file where it lived
 *
 * A leader used to be able to mint an unguessable token (`ReclaimShare`) that served their summary
 * from `/summary/:token` with **no session at all**. Three things were true of it at once: the report
 * it served is the most personal thing this product makes, the token could never be revoked (there
 * was no delete, no rotate, no expiry — the deleted route's own docblock said so), and the only thing
 * keeping the artifact safe to serve that way was a promise that the analyst stayed blindfolded to
 * everything the leader actually said.
 *
 * Removing it settles all three and pays for the report the audit should have been producing: with
 * no unauthenticated surface, the analyst may read the whole audit (`analyst/brief.ts`), which is why
 * that file's allowlist could widen in the same change.
 *
 * **`ReclaimShare` the table is deliberately still in the schema.** Dropping it is a destructive
 * migration against rows that are somebody's data, and nothing writes or reads it now — the data
 * export (`admin/export.ts`) still includes it, so a leader who minted a link before this change can
 * still see that they did. Retiring the table is its own decision.
 */

import { prisma } from '@/lib/db/client';

export interface CreateShareInput {
  /** Share the report with the coach — the only sharing this product does. */
  withCoach?: boolean;
  /**
   * Also let the coach read the conversation, not only the result (F17).
   *
   * Its own fact, like `quotable` below. Only meaningful alongside `withCoach`: sharing the exchange
   * but not the summary it produced is a state nobody asked for, so unticking the parent withdraws
   * this too.
   */
  shareTranscript?: boolean;
  /** The one-line feedback ("what did you take from this?"), if given. */
  takeaway?: string;
  /** Quote consent — separate from sharing (Brief §3). Only meaningful with a takeaway. */
  quotable?: boolean;
}

export interface ShareResult {
  /** Whether the report is now shared with the coach. Echoed back so the screen states the fact. */
  sharedWithCoach: boolean;
}

/**
 * Apply a leader's share choices for a run. **Idempotent per run** — a leader may re-save (edit the
 * takeaway, tick a box) any number of times without duplicating records.
 *
 * F7 enforced that with find-then-write, which was the fix for an observed duplicate but is still a
 * TOCTOU: two saves in flight together both read "no row" and both insert.
 * [`planning-retro.md`](../../../.context/app/planning/planning-retro.md) §B names that shape as one
 * to stop accepting, and F10 t-3 made it matter — the inbox **counts** `ReclaimReportShare` rows, so
 * a duplicate would show a leader as having shared twice. F10 t-1 added
 * `@@unique([userId, auditRunId])` to both share tables; these are now `upsert`s against those
 * constraints, so the database enforces the invariant instead of this function racing for it.
 *
 * `ReclaimFeedback` keeps its find-then-write: it has no such constraint, and adding one would change
 * the erasure question below rather than a correctness one. A duplicated feedback line shows up as an
 * extra quote in a list a human reads, not as a miscount.
 */
export async function createShare(
  userId: string,
  runId: string,
  input: CreateShareInput
): Promise<ShareResult> {
  if (input.withCoach) {
    const transcriptConsent = input.shareTranscript === true;
    await prisma.reclaimReportShare.upsert({
      where: { userId_auditRunId: { userId, auditRunId: runId } },
      create: { userId, auditRunId: runId, transcriptConsent },
      // **`update` is no longer empty, and the difference matters.** The share token above must not
      // be regenerated on a re-save; a consent must be *changeable* on one, or it cannot be
      // withdrawn — and a consent that cannot be taken back is not consent. So every save restates
      // the leader's current answer, including "no".
      update: { transcriptConsent },
    });
  } else if (input.withCoach === false) {
    // Unticking "share with Rashmir" withdraws the transcript with it. The row itself stays, as it
    // always has: nothing here deletes a share, and that is a separate decision from this one.
    //
    // **`=== false`, not "falsy".** The client always sends the checkbox state, so an explicit
    // `false` is the leader unticking it. `undefined` means the field was not part of this request
    // at all — a caller saving only the feedback line, say — and taking that as a withdrawal would
    // both revoke a consent nobody touched and put a write on every save that never mentions it.
    await prisma.reclaimReportShare.updateMany({
      where: { userId, auditRunId: runId, transcriptConsent: true },
      data: { transcriptConsent: false },
    });
  }

  if (input.takeaway && input.takeaway.trim().length > 0) {
    const data = {
      userId,
      auditRunId: runId,
      text: input.takeaway.trim(),
      quoteConsent: input.quotable === true,
    };
    const existing = await prisma.reclaimFeedback.findFirst({
      where: { userId, auditRunId: runId },
      select: { id: true },
    });
    if (existing) {
      await prisma.reclaimFeedback.update({ where: { id: existing.id }, data });
    } else {
      await prisma.reclaimFeedback.create({ data });
    }
  }

  return { sharedWithCoach: input.withCoach === true };
}
