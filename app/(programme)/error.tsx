'use client';

/**
 * The frame's error boundary — core's protected one, re-exported.
 *
 * **Why this file has to exist.** Moving the audit out of `(protected)` (see `layout.tsx` for the
 * reason) moved it out of the reach of `app/(protected)/error.tsx`, which does something a generic
 * boundary does not: it checks whether the session has expired and, if it has, offers the way back to
 * sign in rather than a "something went wrong" dead end. Without this file the audit would fall
 * through to the root `app/error.tsx`, and a leader whose session lapsed mid-phase — the single most
 * likely error on a surface people sit in for forty minutes — would get no route back.
 *
 * It sits at the group root rather than on `programme/` so that `/profile` and `/settings`, which
 * joined this frame later, are covered by the same session-aware boundary they had while they were
 * still Sunrise's pages. A boundary that stopped at the audit would have quietly downgraded them.
 *
 * **Why a re-export rather than a copy.** The behaviour wanted here is exactly core's, and it is
 * Sunrise-owned: session detection, the structured log, the Sentry severity call. Copying it would
 * fork three concerns to gain a different visual register on a screen a leader should almost never
 * see, and the copy would rot the first time upstream improved the original. One line inherits every
 * future fix instead.
 *
 * **Why the directive is here as well as on the file it re-exports.** `'use client'` is not inherited
 * through a re-export: Next.js checks the `error.tsx` boundary file *itself*, because it is the module
 * the router turns into a client entry. Without it the route fails to build outright — "must be a
 * Client Component" — so this line is load-bearing, not a leftover from a copy.
 */

export { default } from '@/app/(protected)/error';
