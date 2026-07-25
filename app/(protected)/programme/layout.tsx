/**
 * Programme layout (F4 t-4) — sets the type. The brand asks for **Raleway** (Brief §7), a calm
 * humanist sans; self-hosted via `next/font` (no external request, so no CSP trouble), scoped to the
 * programme subtree so the rest of the app keeps the platform font. Leaf-owned — the platform
 * `app/layout.tsx` is untouched. The teal/cream palette already comes from the `consumer` surface
 * tokens (`app/brand-theme.css`); this only changes the typeface.
 */

import { Raleway } from 'next/font/google';

const raleway = Raleway({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-raleway',
  display: 'swap',
});

export default function ProgrammeLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${raleway.variable} [font-family:var(--font-raleway)]`}>{children}</div>;
}
