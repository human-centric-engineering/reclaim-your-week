/**
 * Entitlement gate for run creation (F6 t-1, F8 t-2 — I14). Enforced at the one place it is sufficient:
 * the run the leaf creates is the only door to the module surface (reconciliation 1), so gating creation
 * gates everything.
 *
 * **F8 closed the door F6 left open.** F6 bootstrapped a free grant for any account with none — the
 * documented least-risky path while the invite flow did not exist. In production that read as a
 * self-serve free tier, because Sunrise's public signup is open and there is no platform seam to close
 * it (sunrise#463). Now: no live grant → resolve a live **invite** for this account → mint the tiered
 * grant → otherwise **refuse**. The free-tier bootstrap is gone; `openSignup` in `Module.config` is what
 * re-opens the door, deliberately (Brief §2: "we open the doors deliberately rather than by default").
 *
 * **Two tier shapes** (Brief §8, `access/tiers.ts`): free/standard/referral are bounded by their audit
 * count; client is bounded by its window, so the count is bookkeeping only and `grantIsLive` ignores it.
 */

import { prisma } from '@/lib/db/client';
import { ForbiddenError } from '@/lib/api/errors';
import { logger } from '@/lib/logging';
import { isWindowBounded } from '@/lib/app/programme/access/tiers';
import { redeemInviteForUser, grantOpenSignupTier } from '@/lib/app/programme/access/grants';
import { readConsent, ConsentRequiredError } from '@/lib/app/programme/access/consent';
import { emitReclaimAccessEvent } from '@/lib/app/programme/access/events';
import { readReclaimAccessConfig, type ReclaimAccessConfig } from '@/lib/app/programme/config';

type Grant = Awaited<ReturnType<typeof prisma.reclaimGrant.findFirst>>;

/**
 * Add whole calendar months, not 30-day blocks. Brief §8 says "12 months", and 12 × 30 days is 360 —
 * it would close a client's window five days early, every time, on an entitlement they paid attention
 * to. `setMonth` clamps a short month correctly (31 Jan + 1 month → 28 Feb).
 */
function addMonths(from: Date, months: number): Date {
  const to = new Date(from.getTime());
  to.setMonth(to.getMonth() + months);
  return to;
}

/**
 * When a grant's access actually runs out — the window's end if it has started, else the start-by
 * deadline, else `null` for the count-bounded tiers that have no clock at all.
 *
 * Exported so F10's admin surfaces show the same date the gate enforces. The alternative — the admin
 * side recomputing "12 months" for display — is precisely how the 12 × 30 bug got in, and a client
 * told the wrong expiry date is worse than one told none.
 */
export function grantExpiresAt(
  grant: Pick<NonNullable<Grant>, 'windowStartsAt' | 'mustStartBy'>,
  config: Pick<ReclaimAccessConfig, 'clientWindowMonths'>
): Date | null {
  // `!= null` rather than `!== null`: a partially-selected grant row (a `select` that omitted the
  // column) yields `undefined`, and computing a window from `undefined` throws deep inside `addMonths`
  // where the cause is unrecognisable. Absent and null both mean "no window started".
  if (grant.windowStartsAt != null)
    return addMonths(grant.windowStartsAt, config.clientWindowMonths);
  return grant.mustStartBy ?? null;
}

/** Raised (→ 403) when a leader has no remaining entitlement to start a new audit. */
export class EntitlementError extends ForbiddenError {
  constructor(message: string) {
    super(message);
    this.name = 'EntitlementError';
  }
}

/**
 * A grant still confers a run when it has audits left AND its window has not closed.
 *
 * Client tier is **window-bounded, not count-bounded** (Brief §8: "unlimited use while under contract",
 * shaped as a 12-month window): the audit count is bookkeeping for F10's reporting, so it does not
 * refuse here. Free/standard/referral have no window and are bounded purely by the count.
 */
export function grantIsLive(
  grant: NonNullable<Grant>,
  now: Date,
  config: Pick<ReclaimAccessConfig, 'clientWindowMonths'>
): boolean {
  if (!isWindowBounded(grant.tier) && grant.auditsUsed >= grant.auditsGranted) return false;

  if (grant.windowStartsAt !== null) {
    if (now > addMonths(grant.windowStartsAt, config.clientWindowMonths)) return false;
  } else if (grant.mustStartBy !== null && now > grant.mustStartBy) {
    // Issued but never started, and the start-by deadline has passed (Brief §8).
    return false;
  }
  return true;
}

/** Why a run was refused — so the surface can say something true rather than a generic 403. */
export type RefusalReason = 'no_invite' | 'exhausted' | 'expired';

const REFUSAL_MESSAGE: Record<RefusalReason, string> = {
  // Invitation, not a wall: this is the first thing an uninvited account ever hears from the product.
  no_invite:
    'Reclaim Your Week is invite-only while it is in preview. If someone has invited you, use the link in your invitation to sign in.',
  // Brief §8 — the free tier is one complete audit. No pitch here (Brief §2: offers at the end, never
  // mid-process), and no suggestion they did something wrong (I17).
  exhausted:
    'You have completed the audit your invitation included. If you would like to run it again, Rashmir can open that up for you.',
  expired:
    'The access window on your invitation has closed. Rashmir can open a new one whenever you are ready.',
};

export class EntitlementRefused extends EntitlementError {
  readonly reason: RefusalReason;
  constructor(reason: RefusalReason) {
    super(REFUSAL_MESSAGE[reason]);
    this.name = 'EntitlementRefused';
    this.reason = reason;
  }
}

/**
 * Assert the user may start a new audit, or throw `EntitlementRefused`.
 *
 * Resolves an invite into a grant on first use (F8 t-2) — lazily, because there is no leaf hook at
 * account creation (sunrise#464). Does **not** consume: consumption is on completion (`consumeAudit`),
 * so a leader may abandon and restart but complete only their allowance.
 */
export async function assertEntitled(userId: string): Promise<void> {
  const [user, grants, config] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { email: true } }),
    prisma.reclaimGrant.findMany({ where: { userId } }),
    readReclaimAccessConfig(),
  ]);
  const now = new Date();

  // Consent first (F8 t-4). Checked before entitlement deliberately: the lawful basis for processing
  // this person's answers has to exist before we care whether they have an audit left, and a leader
  // with no consent AND no invite should be told about the consent — it is the one they can act on.
  const consent = await readConsent(userId, config.policyVersion);
  if (!consent.accepted) throw new ConsentRequiredError(config.policyVersion);

  if (grants.some((g) => grantIsLive(g, now, config))) return;

  // No live grant. Two ways to earn one: an invitation addressed to this account, or the open-signup
  // door if Rashmir has opened it.
  if (user !== null && user.email !== '') {
    const tier = await redeemInviteForUser(userId, user.email, config, now);
    if (tier !== null) {
      emitReclaimAccessEvent('reclaim.access_granted', { userId, tier, via: 'invite' });
      return;
    }
  }

  if (config.openSignup) {
    await grantOpenSignupTier(userId);
    emitReclaimAccessEvent('reclaim.access_granted', {
      userId,
      tier: 'standard',
      via: 'open_signup',
    });
    return;
  }

  // Distinguish "never had access" from "had access and used it" — the same 403 to a client, but a
  // materially different sentence to a person.
  const reason: RefusalReason =
    grants.length === 0
      ? 'no_invite'
      : grants.some((g) => g.windowStartsAt !== null || g.mustStartBy !== null)
        ? 'expired'
        : 'exhausted';

  logger.info('Reclaim: run refused at the entitlement gate', { userId, reason });
  throw new EntitlementRefused(reason);
}

/**
 * Consume one audit on completion — increment `auditsUsed` on the OLDEST live grant, so an entitlement
 * that has been sitting unused is spent before a newer one (a referral unlock earned later should not
 * be burned while the original invitation still has an audit on it). Best-effort and idempotent-ish: if
 * no live grant exists (already consumed) it is a no-op, so completing a run never fails on
 * entitlement bookkeeping.
 */
export async function consumeAudit(userId: string): Promise<void> {
  const [grants, config] = await Promise.all([
    prisma.reclaimGrant.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
    readReclaimAccessConfig(),
  ]);
  const now = new Date();
  const target = grants.find((g) => grantIsLive(g, now, config));
  if (target === undefined) return;

  await prisma.reclaimGrant.update({
    where: { id: target.id },
    data: {
      auditsUsed: { increment: 1 },
      // Brief §8: the client window opens on first *use*, not on issue. Free grants have no window.
      ...(isWindowBounded(target.tier) && target.windowStartsAt === null
        ? { windowStartsAt: now }
        : {}),
    },
  });
}
