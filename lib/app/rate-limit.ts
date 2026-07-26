/**
 * App rate-limit registrations.
 *
 * **Fork-owned scaffold** — Sunrise ships this empty and does NOT change it
 * after release, so your edits here merge cleanly on upgrade (the stable
 * contract is this file's export, not its body). Treat it like the landing
 * page: a starting point you're expected to modify.
 *
 * Auto-wired: the rate-limit middleware imports and calls this once at module
 * load (middleware runtime). Add `registerRateLimitTier()` /
 * `registerRateLimitRule()` calls — registration is namespace-scoped and fails
 * fast (it throws if a rule could shadow a Sunrise-protected surface).
 *
 * Full guide + example: CUSTOMIZATION.md §4 · .context/security/rate-limiting.md
 */
import { createRateLimiter, registerRateLimitTier } from '@/lib/security/rate-limit';
import { registerRateLimitRule } from '@/lib/security/rate-limit-policy';

/**
 * The public group-invite-link claim (F11) — `POST /api/v1/app/reclaim/join/:token`.
 *
 * **Sized for a room, not for a credential form, and that distinction is the whole point.** The
 * obvious move is to reuse the `auth` tier's OWASP-grade 5/min, because this endpoint is
 * unauthenticated and takes an email address. It would also break the feature on its first real use:
 * thirty people scanning a QR code in an office, a hotel conference room or a co-working space are
 * behind one NAT and arrive as a single IP, so the sixth person onward would be refused — in the
 * exact scenario the link exists for, with no way for anyone in the room to understand why.
 *
 * 40 per hour per IP is above a plausible room and well below anything worth calling an attack. The
 * real ceiling on abuse here is not this limiter: it is `maxClaims` on the link itself, which bounds
 * how many invitations a token can ever produce no matter how many IPs are used. This limiter exists
 * to stop the endpoint being used as a mailer, not to police the seat count.
 */
const reclaimJoinLimiter = createRateLimiter({
  interval: 60 * 60 * 1000,
  maxRequests: 40,
});

export function registerAppRateLimits(): void {
  registerRateLimitTier('reclaim-join', reclaimJoinLimiter);
  registerRateLimitRule({
    match: /^\/api\/v1\/app\/reclaim\/join\//,
    tier: 'reclaim-join',
    // Keyed on IP because there is no session — the claimant has no account yet, by definition.
    key: 'ip',
  });
}
