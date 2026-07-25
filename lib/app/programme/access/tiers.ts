/**
 * Access tiers and their entitlement policy (F8, Brief §8).
 *
 * Kept dependency-free (no Prisma, no framework) so the invite service, the entitlement gate, the
 * referral unlock and their unit tests all read the same definitions without a DB in the loop.
 *
 * **Three tiers, two shapes.** `free` and `referral` are *count*-bounded — a fixed number of complete
 * audits, no clock. `client` is *window*-bounded: Brief §8 offers "unlimited use while under contract"
 * and then reasons toward "a 12 month usage option that automatically shuts off 12 months after
 * initiation, and that initiation must happen within a month of being given access (or something like
 * that)". We build the window, because it is the shape she reasons toward and the one F4 already
 * modelled (`windowStartsAt` / `mustStartBy`) — and "or something like that" is why the two durations
 * are coach-editable in `Module.config` rather than constants here (see `lib/app/programme/config.ts`).
 */

/** The tiers an invite can carry, and a grant can be. Storage values — never renamed (I7 sibling). */
export const RECLAIM_TIERS = ['free', 'standard', 'client', 'referral'] as const;

export type ReclaimTier = (typeof RECLAIM_TIERS)[number];

/** The tiers Rashmir can *issue an invite* for. `free` is not one: it is what an account falls back to. */
export const RECLAIM_INVITE_TIERS = ['standard', 'client', 'referral'] as const;

export type ReclaimInviteTier = (typeof RECLAIM_INVITE_TIERS)[number];

export function isInviteTier(value: string): value is ReclaimInviteTier {
  return (RECLAIM_INVITE_TIERS as readonly string[]).includes(value);
}

/**
 * How many complete audits a tier grants. **Free tier = one complete audit** (Brief §8: "The full
 * first-audit experience is where the value and the word of mouth live"). `standard` is the same
 * allowance by a different door (an admin invite, or open signup later). `referral` mints a second
 * audit for the *referrer*, so it too is one.
 *
 * `client` is window-bounded, not count-bounded — the number here is a bookkeeping ceiling that
 * `grantIsLive` deliberately does not enforce (`consumeAudit` still increments it so F10 can report
 * usage). It is high rather than infinite so a runaway loop is still bounded by something.
 */
export const AUDITS_GRANTED: Record<ReclaimTier, number> = {
  free: 1,
  standard: 1,
  referral: 1,
  client: 1000,
};

/** True when the tier's entitlement is bounded by its window rather than its audit count. */
export function isWindowBounded(tier: string): boolean {
  return tier === 'client';
}
