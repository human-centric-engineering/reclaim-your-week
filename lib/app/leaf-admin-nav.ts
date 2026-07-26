/**
 * Leaf-app admin-nav registration — RESERVED, empty by default.
 *
 * A leaf app (a fork of Daybreak) fills `initLeafAdminNav()` with its own
 * `registerNavSection()` calls to add admin sidebar sections — the client-nav
 * counterpart of the `lib/app/leaf-bootstrap.ts` boot hook. Daybreak keeps it
 * empty: this is the leaf's nav seam, reserved so a leaf's sections merge
 * cleanly on upgrade.
 *
 * Called (synchronously) by `lib/app/admin-nav.ts`'s `initAppNav()` after the
 * framework section is registered. Keep it SYNC + client-safe — nav
 * registration is read during the sidebar's render, so it cannot be async (see
 * `lib/admin-nav/registry.ts`).
 */
import { KeyRound, LayoutDashboard, Users, Inbox, FileText } from 'lucide-react';
import { registerNavSection } from '@/lib/admin-nav/registry';

export function initLeafAdminNav(): void {
  // F8 t-1, completed by F10. Reclaim Your Week's own admin section. Client-safe by the contract
  // above: the registrar and `lucide-react` icons only — no Prisma, no server-only imports (this file
  // is evaluated inside the client sidebar bundle).
  //
  // Ordered as the operator's day runs, not as the features were built: the dashboard answers "is
  // this working", clients answers "who needs me", and the rest are things she does occasionally.
  registerNavSection({
    title: 'Reclaim Your Week',
    items: [
      {
        // NOT "Overview": core's sidebar already has a top-level section by that name, and two
        // identically-labelled entries in one sidebar is a navigation bug rather than a naming
        // preference. Caught by Sunrise's own `admin-sidebar` test, which is the sort of thing a
        // leaf only finds by being rendered inside the platform's chrome.
        href: '/admin/programme',
        label: 'Programme overview',
        icon: LayoutDashboard,
        description: 'Do people come back, and do they tell others',
        // Exact match, because every other item in this section lives *under* `/admin/programme`.
        // Without it the sidebar's prefix rule keeps the overview lit on `/clients`, `/shared`, and
        // the rest — two entries highlighted at once, and the wrong one reads as "you are here".
        exact: true,
      },
      {
        href: '/admin/programme/clients',
        label: 'Clients',
        icon: Users,
        description: 'Who is in, where they reached, what it cost',
      },
      {
        href: '/admin/programme/shared',
        label: 'Shared results',
        icon: Inbox,
        description: 'Results shared with you, and the anonymised picture',
      },
      {
        href: '/admin/programme/content',
        label: 'Content',
        icon: FileText,
        description: 'Bucket wording, hour bands, and the audit rules',
      },
      {
        href: '/admin/programme/access',
        label: 'Access',
        icon: KeyRound,
        description: 'Tiered invitations — issue, re-send, withdraw',
      },
    ],
  });
}
