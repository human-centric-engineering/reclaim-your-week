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
  /** The one-line feedback ("what did you take from this?"), if given. */
  takeaway?: string;
  /** Quote consent — separate from sharing (Brief §3). Only meaningful with a takeaway. */
  quotable?: boolean;
}

export interface ShareResult {
  /** The public token, if a link was minted. */
  token: string | null;
}

/** Apply a leader's share choices for a run. Idempotent-ish: a second public link reuses the first. */
export async function createShare(
  userId: string,
  runId: string,
  input: CreateShareInput
): Promise<ShareResult> {
  let token: string | null = null;

  if (input.publicLink) {
    const existing = await prisma.reclaimShare.findFirst({ where: { userId, auditRunId: runId } });
    token = existing?.token ?? mintToken();
    if (!existing) {
      await prisma.reclaimShare.create({ data: { userId, auditRunId: runId, token } });
    }
  }

  if (input.withCoach) {
    await prisma.reclaimReportShare.create({ data: { userId, auditRunId: runId } });
  }

  if (input.takeaway && input.takeaway.trim().length > 0) {
    await prisma.reclaimFeedback.create({
      data: {
        userId,
        auditRunId: runId,
        text: input.takeaway.trim(),
        quoteConsent: input.quotable === true,
      },
    });
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
