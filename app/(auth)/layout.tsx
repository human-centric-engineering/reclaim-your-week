import type { Metadata } from 'next';
import { ThemeToggle } from '@/components/theme-toggle';
import { raleway } from '@/app/fonts';
import { BRAND } from '@/lib/brand';

export const metadata: Metadata = {
  title: {
    template: `%s - ${BRAND.name}`,
    default: `Authentication - ${BRAND.name}`,
  },
  description: 'Sign in or create an account',
};

/**
 * Auth Layout
 *
 * Minimal centered layout for authentication pages (login, signup, etc.)
 * No navigation or footer - just centered content on a clean background
 *
 * **The type is this app's** (`app/fonts.ts`), and only the type. Sign in is the one step between the
 * public pages and the audit, and both of those are set in Raleway; a card in the platform font in
 * the middle of that walk reads as a hand-off to somebody else's system, which for an invite-only
 * product is exactly the wrong feeling at exactly the wrong moment. The layout itself is left alone —
 * it is the platform's, the forms inside it are the platform's, and a centred card on a bare
 * background needs no frame of ours.
 */
export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div
      className={`${raleway.variable} bg-background min-h-screen [font-family:var(--font-raleway)]`}
    >
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
