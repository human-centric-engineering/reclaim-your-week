/**
 * Absolute URLs for the places this app links to from outside itself (F15 t-3).
 *
 * Only email needs these. Everything on a screen uses a relative path, because the browser already
 * knows where it is; a mail client does not, so a link in an email has to carry the origin.
 *
 * **One definition, because there are now two senders.** The quarterly nudge resolved the base URL
 * with a private helper in `nudges/tick.ts`, and F15's completion email needed the same rule. Two
 * copies of "which environment variable is the canonical origin" is exactly the drift this codebase
 * has spent a feature and a half removing: an install that sets one variable and not the other would
 * have had working nudge links and broken completion links, or the reverse, with nothing to say why.
 *
 * The fallback chain is deliberate and unchanged from the nudge's original:
 *   1. `NEXT_PUBLIC_APP_URL` — the one an operator sets on purpose.
 *   2. `BETTER_AUTH_URL` — always set, because auth cannot work without it, so it is the best guess
 *      available on an install that never set the first.
 *   3. localhost, which is only ever right in development and is obvious in an email if it is not.
 */

import { env } from '@/lib/env';

/** The origin this app is reachable at, with no trailing slash. */
export function appUrl(): string {
  return env.NEXT_PUBLIC_APP_URL ?? process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';
}

/** A leader's own finished audit, behind a sign-in. */
export function auditSummaryUrl(runId: string): string {
  return `${appUrl()}/programme/history/${encodeURIComponent(runId)}`;
}
