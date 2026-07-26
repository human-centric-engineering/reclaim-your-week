/**
 * App public marketing nav overrides.
 *
 * **Fork-owned scaffold** — Sunrise ships every list `null` (= use the platform
 * default) and does NOT change this file after release, so your edits here merge
 * cleanly on upgrade (the stable contract is this file's exports, not their
 * values). Treat it like the landing page: a starting point you're expected to
 * modify.
 *
 * Forks OWN these lists, so the model is *replacement*, not append: set a list
 * to a non-null `PublicNavItem[]` and it **replaces** the platform default
 * wholesale (remove/rename/reorder freely). Leave it `null` to keep the default.
 *
 * Auto-wired: `components/layouts/public-nav.tsx` reads `publicNavItems`;
 * `public-footer.tsx` reads `footerNavItems` and `footerLegalItems`. The
 * `next/link` / active-state glue stays in those platform components.
 *
 * Not overridable: the footer's **Cookie Preferences** control is always
 * rendered by the platform regardless of `footerLegalItems` — this seam governs
 * *links*, not the consent control (a legal requirement in many jurisdictions).
 *
 * Boundary-clean: type-only import, so this stays within the `lib/app/**`
 * framework-agnostic boundary.
 *
 * Full guide: CUSTOMIZATION.md §4 · lib/public-nav/types.ts
 */
import type { PublicNavItem } from '@/lib/public-nav/types';

/**
 * Header nav (post-v1 P4).
 *
 * The platform default is Home / About / Contact, which is close but not right: for an invite-only
 * audit the privacy notice is not fine print, it is **part of the pitch**. A leader deciding whether
 * to spend an hour being honest with a tool wants to know where their answers go before they start,
 * and the consent gate links there anyway. Putting it in the header says that out loud.
 *
 * No icons: the public surface is typographic (Brief §7 — calm, uncluttered), and a row of little
 * glyphs in the header is the first thing that makes a page look like software.
 *
 * Note for the next upstream sync: the F8 plan intended to use this seam to "drop the signup link",
 * which the post-v1 audit found was never possible — the default carries no signup link. The real
 * routes to `/signup` were the starter template's CTAs, and those are gone with the new landing and
 * about pages.
 */
export const publicNavItems: PublicNavItem[] | null = [
  { href: '/', label: 'Home', exact: true },
  { href: '/about', label: 'About' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/contact', label: 'Contact' },
];

/** Footer link cluster — the same shape, since there is not much surface to navigate. */
export const footerNavItems: PublicNavItem[] | null = [
  { href: '/', label: 'Home' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
];

/** Footer legal cluster. The Cookie Preferences control renders regardless. */
export const footerLegalItems: PublicNavItem[] | null = [
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
];
