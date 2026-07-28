/**
 * The product's typeface, declared once.
 *
 * **Raleway** (Brief §7), self-hosted via `next/font` so there is no external request and no CSP
 * trouble. It began inside `app/(programme)/layout.tsx`, because the audit was the only surface that
 * had left the platform's frame. Then the public pages were given the same frame, and a second
 * `Raleway({...})` call in a second layout is a second font instance: the same files fetched under a
 * second CSS variable, and two places to keep the weight list in step. So the declaration moved here
 * and both layouts import it.
 *
 * It is a module rather than a layout export because `next/font` must be called at module scope with
 * a const binding — that is what lets the build inline the `@font-face` rules and self-host the
 * files. Importing the result is fine; calling it per-render is not.
 *
 * Consumers apply `raleway.variable` (which defines `--font-raleway`) and set the family from it,
 * scoped to their subtree, so any surface that has not adopted the frame keeps the platform font
 * rather than half-inheriting this one.
 */

import { Raleway } from 'next/font/google';

export const raleway = Raleway({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-raleway',
  display: 'swap',
});
