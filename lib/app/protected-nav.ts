/**
 * The authenticated header nav — **a local shim for a seam Sunrise does not have.**
 *
 * Sunrise reserves `lib/app/public-nav.ts` for the marketing nav and auto-wires it from
 * `components/layouts/public-nav.tsx`. There is no equivalent for the *authenticated* nav:
 * `components/layouts/protected-nav.tsx` carries a hardcoded array (Dashboard / Profile / Settings /
 * Admin), so an app whose whole product lives at its own route has no way to link to it. Filed as
 * **sunrise#473**; when a platform seam lands, this file becomes its value and the one-line read in
 * `protected-nav.tsx` goes away.
 *
 * **Why this was worth fixing rather than working around.** The gap is not cosmetic. A leader who
 * followed an invite link, claimed a seat and set a password arrived at Sunrise's stock dashboard —
 * profile completion, email status, account role — with no route to the audit they were invited to.
 * The entitlement chain was correct the whole time (the invite resolves lazily at run creation,
 * `runs/entitlement.ts`); nothing linked to the door. Found 2026-07-26 by walking the join flow as a
 * participant, which no test does.
 *
 * **Replacement, not append** — the same model as `public-nav.ts`, and for the same reason: an app
 * owns its own navigation, including the order. "Your audit" goes *first* because it is the product;
 * appending would have put the primary surface after Settings. The cost of replacement is the
 * documented one: a nav item Sunrise adds later will not appear here until someone adds it. That is
 * the right trade for a four-item nav, and `public-nav.ts` already accepted it.
 *
 * Boundary-clean apart from the `lucide-react` icon type, which `PublicNavItem` also carries.
 */
import type { LucideIcon } from 'lucide-react';
import { Compass, LayoutDashboard, User, Settings, Shield } from 'lucide-react';

/**
 * One authenticated nav link. Mirrors `PublicNavItem` (`lib/public-nav/types.ts`) and adds the
 * `adminOnly` flag the protected nav has always had — the platform component keeps the filtering,
 * this is only the data.
 */
export interface ProtectedNavItem {
  href: string;
  label: string;
  /**
   * Required here, unlike `PublicNavItem`'s optional one: `protected-nav.tsx` renders `<Icon />`
   * unconditionally, because its own default array always had one. Requiring it in the shim keeps the
   * platform edit to the single `??` read — the alternative was a second edit adding public-nav's
   * `{Icon && …}` guard, and this file is meant to disappear when sunrise#473 lands anyway. The
   * upstream proposal has it optional, matching `PublicNavItem`.
   */
  icon: LucideIcon;
  /** Active only on an exact pathname match, rather than on child routes too. */
  exact?: boolean;
  /** Rendered only for `role === 'ADMIN'`. */
  adminOnly?: boolean;
}

/**
 * The nav a signed-in leader sees. `null` would mean "keep the platform default" — we set a list, so
 * this replaces it wholesale.
 *
 * The stock dashboard stays: it is where email-verification state and the profile-completion prompt
 * live, and both are still reachable things a leader may need. It is simply no longer the first thing
 * they meet, or the only thing they can find.
 */
export const protectedNavItems: ProtectedNavItem[] | null = [
  { href: '/programme', label: 'Your audit', icon: Compass },
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/profile', label: 'Profile', icon: User },
  { href: '/settings', label: 'Settings', icon: Settings },
  { href: '/admin', label: 'Admin', icon: Shield, adminOnly: true },
];
