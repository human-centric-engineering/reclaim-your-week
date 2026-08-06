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

/**
 * The preview-account surface (F19) — `/api/v1/app/reclaim/admin/preview/**`.
 *
 * **Tightened rather than loosened, and against the section cap rather than a threat.** These routes
 * are `withAdminAuth`, so this is not about an attacker. It is about what one endpoint does per call:
 * provisioning creates a real account and sends a real welcome email, and a completed fast-forward
 * writes roughly forty slot versions, walks six journey transitions, and sends a completion email.
 *
 * Leaf paths fall through to the catch-all rule, which is the loosest in the table: 100 a minute. A
 * stuck button, a double-click on a slow connection, or a retry loop in a browser extension would
 * therefore be free to create a hundred accounts in a minute, each with a mailbox behind it. Twenty
 * an hour is far above what an operator doing this by hand ever needs and far below anything that
 * could make a mess worth cleaning up.
 *
 * **It was ten, and the password reset is why it is not.** Every write on the screen shares this one
 * budget, and the newest of them — **Sign-in details**, which mints a fresh password — is the one an
 * operator reaches for precisely *because* they are stuck. An operator who spent a tight budget
 * filling accounts in and then could not get back into any of them would be locked out by the
 * mechanism meant to protect them, which is the opposite of what a recovery action is for. The reset
 * itself is cheap besides: one hash and one row update, and it sends nothing.
 *
 * **Writes only — and the `skip` below is what makes the number above true.** A rule matches on path
 * and carries no method, so without it the screen's own list read would spend the same budget. That
 * is not a marginal cost: `preview-manager.tsx` re-reads the list after **every** mutation, so each
 * action costs two requests and the ten would be gone in four. Worse, it is the refresh that fails
 * rather than the action, so the operator is told "The test accounts could not be loaded" about a
 * mutation that in fact succeeded.
 *
 * Reads therefore fall through to the catch-all (100/min, session-keyed), which is the right cap for
 * them: a `GET` here is one indexed query and sends nothing. `applyRateLimit` continues down the
 * policy when `skip` fires, so this is a fall-through and not an exemption.
 *
 * Keyed on the session user rather than IP: two operators in one office should not share a budget.
 */
const reclaimPreviewLimiter = createRateLimiter({
  interval: 60 * 60 * 1000,
  maxRequests: 20,
});

export function registerAppRateLimits(): void {
  registerRateLimitTier('reclaim-join', reclaimJoinLimiter);
  registerRateLimitRule({
    match: /^\/api\/v1\/app\/reclaim\/join\//,
    tier: 'reclaim-join',
    // Keyed on IP because there is no session — the claimant has no account yet, by definition.
    key: 'ip',
  });

  registerRateLimitTier('reclaim-preview', reclaimPreviewLimiter);
  registerRateLimitRule({
    match: /^\/api\/v1\/app\/reclaim\/admin\/preview/,
    tier: 'reclaim-preview',
    key: 'session-user',
    // Reads fall through to the catch-all; the tight cap is for what provisions accounts and sends
    // mail. See the note above — without this the screen exhausts its own budget in four actions.
    skip: (request) => request.method === 'GET',
  });
}
