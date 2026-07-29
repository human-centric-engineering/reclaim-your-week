/**
 * The Phase 6 share (F7 t-4). Sharing is **invited, never required** (§10, Brief §3). A leader may mint
 * a tokenised public link to their own summary (`ReclaimShare`), and/or share the result with the coach
 * (`ReclaimReportShare`, the existing-client inbox F10 reads). The optional feedback line + its
 * **separate** quote consent land in `ReclaimFeedback` — quote consent governs republication and is its
 * own fact, not implied by sharing.
 */

import { prisma } from '@/lib/db/client';

/**
 * An unguessable public share token (64 hex chars). Uses the Web Crypto `randomUUID` global (available
 * in every realm) rather than `node:crypto`, so this file stays edge/client-bundle-safe (the leaf
 * boundary rule).
 */
function mintToken(): string {
  return (globalThis.crypto.randomUUID() + globalThis.crypto.randomUUID()).replace(/-/g, '');
}

export interface CreateShareInput {
  /** Mint a public link to the summary. */
  publicLink?: boolean;
  /** Also share the result with the coach (existing-client close). */
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
  /** The public token, if a link was minted. */
  token: string | null;
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
  let token: string | null = null;

  if (input.publicLink) {
    // The token must not be regenerated on re-save — a leader who has already sent someone the link
    // would find it dead. `update: {}` is deliberate: touch nothing, keep the existing token.
    const share = await prisma.reclaimShare.upsert({
      where: { userId_auditRunId: { userId, auditRunId: runId } },
      create: { userId, auditRunId: runId, token: mintToken() },
      update: {},
      select: { token: true },
    });
    token = share.token;
  }

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
    // at all — a caller saving only a public link, say — and taking that as a withdrawal would both
    // revoke a consent nobody touched and put a write on every save that never mentions it.
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

  return { token };
}

/** Resolve a public share token to its `{ userId, runId }`, or `null` for an unknown/expired token. */
export async function resolveShareToken(
  token: string
): Promise<{ userId: string; runId: string } | null> {
  const row = await prisma.reclaimShare.findUnique({
    where: { token },
    select: { userId: true, auditRunId: true },
  });
  return row ? { userId: row.userId, runId: row.auditRunId } : null;
}
