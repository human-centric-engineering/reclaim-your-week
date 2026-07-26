/**
 * App-owned protected route prefixes.
 *
 * **Fork-owned scaffold** — Sunrise ships this empty (`[]`) and does NOT change
 * it after release, so your edits merge cleanly on upgrade (the stable contract
 * is this export, not its value).
 *
 * Append your fork's new authenticated top-level sections here (e.g.
 * `/projects`) instead of editing the `proxy.ts` literal. The model is *append*:
 * these are **merged with** the core protected routes (`/dashboard`,
 * `/settings`, `/profile`), which always stay protected. Any request whose path
 * starts with a listed prefix gets the edge redirect-to-login when signed out.
 *
 * Scope: this is only the "is-logged-in-at-all" edge gate — per-resource
 * authorisation stays in `withAuth` / `withAdminAuth` (`lib/auth/guards.ts`).
 *
 * Use leading-slash prefixes (a trailing slash is normalised away); the proxy
 * drops any entry that isn't a non-empty `/`-prefixed path. Full guide:
 * CUSTOMIZATION.md §4.
 *
 * Boundary-clean: a plain string array (no imports), safe to import at the
 * proxy runtime.
 */
/**
 * `/programme` is the audit itself — the run, the seven phases, the coach, the calendar review. It was
 * missing here until 2026-07-26, and the symptom was quiet rather than loud: the page is a client
 * shell, so a signed-out visitor got the shell and then "We could not load your audit just now" from
 * the 401 behind it, instead of being sent to sign in. The guards were never the gap (every route
 * under `/api/v1/app/reclaim/**` is `withAuth`/`withAdminAuth`, and I14's entitlement gate sits behind
 * those) — this is the edge redirect that turns an authed-fetch failure back into a login prompt.
 *
 * Prefix-matched, so `/programme/calendar` and anything added under it are covered.
 *
 * Not listed: `/summary`, `/nudges` and `/join/[token]` are deliberately public — a shared report, an
 * unsubscribe and a claim page each have to work for someone with no session at all.
 */
export const appProtectedRoutes: string[] = ['/programme'];
