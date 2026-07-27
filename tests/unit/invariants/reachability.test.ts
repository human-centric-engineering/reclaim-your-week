/**
 * Every page a leader is meant to reach has something that links to it.
 *
 * **This guard exists because a whole feature was invisible for four features.** F5 built the
 * calendar branch — parse, categorise, review, reconcile, the privacy promises, an invariant guard of
 * its own — and shipped it behind a route that nothing in the product linked to. The component was
 * written with the note "F6 will link here from Phase 1", F6 did not, and nobody noticed, because
 * every test the flow had passed: the parser worked, the route worked, the screens rendered when
 * mounted directly. A leader could only reach it by typing the URL.
 *
 * No unit test catches that, because there is nothing wrong with any of the parts. What catches it is
 * asking the only question the parts cannot: can you get there from here.
 *
 * Deliberately crude. It looks for the route's own path as a string anywhere under the app's
 * components and pages, which is enough to fail loudly when a surface is orphaned and cheap enough to
 * never be the reason someone skips writing a page. A route that is genuinely meant to be
 * unlinked — reached by email, by redirect, by deep link — belongs in `REACHED_ANOTHER_WAY` with the
 * reason written down.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

/**
 * Where a leader's pages live.
 *
 * `(programme)` rather than `(protected)`: the audit moved into its own route group so it could own
 * the viewport (see that group's layout for why). The URLs did not change — route groups do not
 * appear in them — but this sweep walks the *tree*, and the `expect(routes.length)` assertion below
 * exists precisely so a move like that fails loudly instead of quietly checking nothing.
 */
const PAGE_ROOT = join(root, 'app/(programme)/programme');

/** Where a link to one of them could plausibly be written. */
const LINK_ROOTS = [
  join(root, 'components/app'),
  join(root, 'app/(programme)'),
  join(root, 'app/(protected)'),
];

/**
 * Routes that are correctly reachable without an in-app link, each with the reason.
 * Empty today, and that is the point: the calendar was in here by accident, not by decision.
 */
const REACHED_ANOTHER_WAY: Record<string, string> = {};

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

/** Every `page.tsx` under the programme surface, as the URL path a leader would visit. */
function programmeRoutes(): string[] {
  if (!statSync(PAGE_ROOT, { throwIfNoEntry: false })?.isDirectory()) return [];
  return walk(PAGE_ROOT)
    .filter((p) => p.endsWith('page.tsx'))
    .map(
      (p) =>
        p
          .slice(root.length)
          .replace(/\/page\.tsx$/, '')
          .replace(/\/\([^)]+\)/g, '') // route groups shape the tree, not the URL
          .replace(/^\/app\b/, '') // `app/` is the router root, not a segment
    )
    .filter((route) => route !== '/programme'); // the surface's own entry, reached from the nav
}

const linkText = LINK_ROOTS.filter(
  (dir) => statSync(dir, { throwIfNoEntry: false })?.isDirectory() === true
)
  .flatMap((dir) => walk(dir))
  .filter((p) => p.endsWith('.tsx') || p.endsWith('.ts'))
  .map((p) => readFileSync(p, 'utf8'))
  .join('\n');

describe('every programme page can be reached from inside the product', () => {
  const routes = programmeRoutes();

  it('finds the routes to check, so an empty sweep cannot pass silently', () => {
    expect(routes.length).toBeGreaterThan(0);
    expect(routes).toContain('/programme/calendar');
  });

  it.each(routes)('%s is linked from somewhere', (route) => {
    if (REACHED_ANOTHER_WAY[route] !== undefined) return;
    // `href="…"` in any component under the app's own surfaces.
    expect(linkText, `${route} has no link into it — a leader cannot get there`).toContain(
      `"${route}"`
    );
  });
});
