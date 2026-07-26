/**
 * Where an authenticated leader lands — **a local shim for a seam Sunrise does not have.**
 *
 * Sunrise hardcodes `/dashboard` as the post-authentication destination across **eight sites in seven
 * files**: the login form's callback fallback, the OAuth button's fallback, the signup form's
 * post-session push and its OAuth `callbackUrl`, the accept-invite form's push and its OAuth
 * `callbackUrl`, the verify-email callback's replace, and the proxy's "signed-in user on an auth page"
 * redirect — plus the verify-email copy, which named the destination out loud ("Redirecting to
 * dashboard…"). There is no config, env var or `lib/app/*` scaffold for any of it, so an app whose home
 * is its own route has to touch every one, and re-resolve them on each upgrade. Filed as
 * **sunrise#473** alongside the nav gap; when a platform seam lands, this file becomes its value.
 *
 * **This is the other half of the same bug.** A nav link makes the audit *findable*; this makes it
 * where a leader *arrives*. Getting only the first would still have every invited participant land on
 * account scaffolding and have to notice a header link — for an invite-only programme, the audit is
 * the app, and the dashboard is the detour. See [[protected-nav]] for how the gap was found.
 *
 * Kept as a bare string with no imports so it stays safe in the proxy's edge runtime, exactly as
 * `protected-routes.ts` is. Must be a root-relative path: every consumer either passes it through
 * `safeCallbackUrl` (which rejects absolute and protocol-relative URLs) or hands it to `new URL(…,
 * request.url)`.
 */
export const appAuthLandingRoute = '/programme';
