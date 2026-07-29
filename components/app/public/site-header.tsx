'use client';

/**
 * The bar the public pages wear.
 *
 * **Why this replaced the platform header.** `components/layouts/app-header.tsx` composes a bold
 * wordmark, `PublicNav`'s row of filled pills, an outlined theme button and `UserButton`. Every part
 * of that is right for a starter template and wrong here for the same reason the programme grew its
 * own bar: it is chrome that announces software, sitting above pages written as set text. A leader
 * who follows "Privacy" out of the audit met a different typeface, a different header and a different
 * footer, and had to work out whether they had left the product. They had not — they had left the
 * frame, which is worse, because nothing said so.
 *
 * **What it actually fixes is the corner.** `UserButton` offers profile, settings and sign out; it
 * cannot offer *your audits*, because `/programme/history` is a leaf route and that component is the
 * platform's. So a signed-in leader reading the privacy notice had no way back to the thing they were
 * in the middle of. This bar carries `AccountMenu` — the same menu as the programme bar, the same
 * session, the same sign-out — so the way back is where they last saw it.
 *
 * **Signed out it says "Sign in", and nothing else.** v1 is invite-gated (F8), so the platform menu's
 * "Create account" was a door into a room with nothing in it. The landing page's own close already
 * explains where invitations come from; the bar's job is only to let someone holding one through.
 *
 * **The links stay on the `lib/app/public-nav.ts` seam.** Rendering moved here, the data did not:
 * this reads the same fork-owned lists as the platform components, so the header, the platform footer
 * and this app's footer cannot disagree about what the public pages are. Icons are ignored on
 * purpose — the public surface is typographic (Brief §7) — and labels are never hidden, unlike the
 * platform nav, which hides them below `sm` and would leave our icon-less items rendering as nothing
 * at all on a phone.
 *
 * Sticky, because the privacy notice is long and the way out should not be a scroll away.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AccountMenu } from '@/components/app/reclaim/account-menu';
import { ThemeSwitch } from '@/components/app/reclaim/theme-switch';
import { publicNavItems } from '@/lib/app/public-nav';
import { DEFAULT_PUBLIC_NAV } from '@/lib/public-nav/types';
import { BRAND } from '@/lib/brand';
import { cn } from '@/lib/utils';

// A non-null fork override replaces the platform default wholesale — the same contract the platform
// components honour, restated here rather than re-decided.
const navItems = publicNavItems ?? DEFAULT_PUBLIC_NAV;

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="border-border/60 bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-30 border-b backdrop-blur">
      <div className="mx-auto flex min-h-14 max-w-5xl flex-wrap items-center gap-x-6 gap-y-1 px-6 py-2 sm:px-8">
        <Link
          href="/"
          className="text-primary hover:text-primary/80 text-[0.65rem] font-medium tracking-[0.22em] whitespace-nowrap uppercase transition-colors"
        >
          {BRAND.name}
        </Link>

        <nav aria-label="Pages" className="flex flex-wrap items-center gap-x-5 gap-y-1">
          {navItems.map((item) => {
            // Exact items — and the root, which every path is a prefix of — match on equality;
            // everything else prefix-matches, so a child page keeps its parent lit.
            const isActive =
              item.exact || item.href === '/'
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'text-sm font-light transition-colors',
                  isActive
                    ? 'text-foreground decoration-primary/60 underline underline-offset-[7px]'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <ThemeSwitch />
          <AccountMenu
            signedOut={
              <Link
                href="/login"
                className="text-muted-foreground hover:text-foreground px-1 text-sm font-light transition-colors"
              >
                Sign in
              </Link>
            }
          />
        </div>
      </div>
    </header>
  );
}
