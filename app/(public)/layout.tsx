import type { Metadata } from 'next';
import { SiteHeader } from '@/components/app/public/site-header';
import { SiteFooter } from '@/components/app/public/site-footer';
import { MaintenanceWrapper } from '@/components/maintenance-wrapper';
import { raleway } from '@/app/fonts';
import { BRAND } from '@/lib/brand';

export const metadata: Metadata = {
  title: {
    template: `%s - ${BRAND.name}`,
    default: BRAND.name,
  },
  description:
    'A guided time audit for leaders carrying more than they can sustain. Designed by Rashmir Balasubramaniam. Open by invitation.',
};

/**
 * The frame the public pages wear — this app's, not the starter template's.
 *
 * Layout for the landing page, about, privacy, terms and contact.
 *
 * **Why this file changed rather than a seam being used.** There is no seam for header *composition*:
 * `lib/app/public-nav.ts` governs which links appear, and this layout is the only place that decides
 * which chrome renders them. The pages themselves are already this app's — written to Brief §7, set
 * as text — but they were being served inside `AppHeader` + `PublicFooter`, in the platform typeface.
 * The result was two products under one domain, and the join showed most where it hurt: a leader who
 * followed "Privacy" or "Help and support" out of the audit's own footer arrived somewhere that
 * looked like different software and offered no way back to their audit (see
 * `components/app/public/site-header.tsx` for why the corner was the real fault). The edit is kept
 * deliberately small — three swapped components and a font wrapper — so a Daybreak sync merges around
 * it rather than through it.
 *
 * **Raleway is scoped here, not raised to the root layout.** The `(auth)` and `(protected)` groups
 * and `/admin` are still the platform's; giving them the type without the frame would leave them
 * half-dressed. The variable is applied to this subtree exactly as `(programme)` applies it to its
 * own, and the shared declaration lives in `app/fonts.ts`.
 *
 * Maintenance mode is unchanged: it is applied per route group and nowhere else, so this wrapper is
 * load-bearing rather than decoration.
 */
export default function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <MaintenanceWrapper>
      <div
        className={`${raleway.variable} bg-background text-foreground flex min-h-screen flex-col [font-family:var(--font-raleway)]`}
      >
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </div>
    </MaintenanceWrapper>
  );
}
