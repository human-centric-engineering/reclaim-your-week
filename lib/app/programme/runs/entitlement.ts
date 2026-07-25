/**
 * Entitlement gate for run creation (F6 t-1, I14). Enforced at the one place it is sufficient — the
 * run the leaf creates is the only door to the module surface (reconciliation 1), so gating creation
 * gates everything.
 *
 * **Free tier = one complete audit.** A grant carries `auditsGranted` / `auditsUsed`; a run consumes
 * one on *completion* (not creation), so a leader may abandon and restart but complete only their
 * allowance. `assertEntitled` **bootstraps a free-tier grant on first run** when none exists — the
 * least-risky path until F8 (`ryw-access`) lands the invite→grant flow, which adds client/referral
 * tiers on top of this same gate without changing it (see `ryw-current.md` reconciliation).
 */

import { prisma } from '@/lib/db/client';
import { ForbiddenError } from '@/lib/api/errors';
import { logger } from '@/lib/logging';

type Grant = Awaited<ReturnType<typeof prisma.reclaimGrant.findFirst>>;

const TWELVE_MONTHS_MS = 365 * 24 * 60 * 60 * 1000;

/** Raised (→ 403) when a leader has no remaining entitlement to start a new audit. */
export class EntitlementError extends ForbiddenError {
  constructor(message: string) {
    super(message);
    this.name = 'EntitlementError';
  }
}

/** A grant still confers a run if it has audits left AND (for a client window) has not expired. */
function grantIsLive(grant: NonNullable<Grant>, now: Date): boolean {
  if (grant.auditsUsed >= grant.auditsGranted) return false;
  // Client-tier window (F8): a started window expires 12 months after first use; an unstarted grant
  // expires at `mustStartBy`. Free grants set neither, so they are bounded only by the audit count.
  if (grant.windowStartsAt && now.getTime() > grant.windowStartsAt.getTime() + TWELVE_MONTHS_MS) {
    return false;
  }
  if (!grant.windowStartsAt && grant.mustStartBy && now > grant.mustStartBy) return false;
  return true;
}

/**
 * Assert the user may start a new audit, or throw `EntitlementError`. Bootstraps a free-tier grant the
 * first time (so run creation is never blanket-refused before F8 seeds grants). Does **not** consume —
 * consumption is on completion (`consumeAudit`).
 */
export async function assertEntitled(userId: string): Promise<void> {
  const grants = await prisma.reclaimGrant.findMany({ where: { userId } });
  const now = new Date();

  if (grants.length === 0) {
    // First run: grant the free tier (one complete audit). F8 later issues client/referral grants.
    await prisma.reclaimGrant.create({
      data: { userId, tier: 'free', auditsGranted: 1, auditsUsed: 0 },
    });
    logger.info('Reclaim: bootstrapped a free-tier grant on first run', { userId });
    return;
  }

  if (grants.some((g) => grantIsLive(g, now))) return;

  throw new EntitlementError(
    'You have used your audit for now. Reclaim Your Week is invite-based while in preview.'
  );
}

/**
 * Consume one audit on completion — increment `auditsUsed` on the live grant with the earliest expiry
 * (free grants first). Best-effort and idempotent-ish: if no live grant exists (already consumed), it
 * is a no-op rather than an error, so completing a run never fails on entitlement bookkeeping.
 */
export async function consumeAudit(userId: string): Promise<void> {
  const grants = await prisma.reclaimGrant.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
  });
  const now = new Date();
  const target = grants.find((g) => grantIsLive(g, now));
  if (!target) return;
  await prisma.reclaimGrant.update({
    where: { id: target.id },
    data: {
      auditsUsed: { increment: 1 },
      // Start the client window on first use (F8 semantics). Free grants have no window.
      ...(target.tier === 'client' && target.windowStartsAt === null
        ? { windowStartsAt: now }
        : {}),
    },
  });
}
