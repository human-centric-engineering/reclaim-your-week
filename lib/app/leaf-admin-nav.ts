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
import { KeyRound } from 'lucide-react';
import { registerNavSection } from '@/lib/admin-nav/registry';

export function initLeafAdminNav(): void {
  // F8 t-1. Reclaim Your Week's own admin section. Client-safe by the contract above: the registrar
  // and a `lucide-react` icon only — no Prisma, no server-only imports (this file is evaluated inside
  // the client sidebar bundle). The rest of the section (client list, shared results, content editing)
  // lands with F10; access is the first entry because it is what gates the product.
  registerNavSection({
    title: 'Reclaim Your Week',
    items: [
      {
        href: '/admin/programme/access',
        label: 'Access',
        icon: KeyRound,
        description: 'Tiered invitations — issue, re-send, withdraw',
      },
    ],
  });
}
