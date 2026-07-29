'use client';

/**
 * The rail along the bottom of the public pages.
 *
 * **Why not the programme's footer.** `ProgrammeFooter` is a colophon: three links, right-aligned,
 * sized so it takes as little as possible from a fixed-height conversation. A public page is a
 * scrolling document that ends, and what a reader wants at the end of one is the ordinary things —
 * where else to go, the terms, who is responsible for this. So the two footers say different things
 * on purpose, and only the register is shared: one hairline, quiet type, no columns and no headings.
 *
 * **Why not the platform's.** `components/layouts/public-footer.tsx` is the same content in the
 * starter template's voice, and it was the second half of the seam that made `/privacy` feel like a
 * different product from the audit that linked to it.
 *
 * The lists come from the fork-owned `lib/app/public-nav.ts` seam, so this footer, the header and the
 * platform's own components cannot drift apart about what the public pages are. **Cookie preferences
 * is rendered unconditionally**, exactly as the platform footer renders it: the seam governs links,
 * not the consent control, which has to stay reachable in many jurisdictions and is the reason a
 * frame that opts out of the platform footer has to supply a real one of its own.
 */

import Link from 'next/link';
import { useConsent } from '@/lib/consent';
import { footerNavItems, footerLegalItems } from '@/lib/app/public-nav';
import { DEFAULT_FOOTER_NAV, DEFAULT_FOOTER_LEGAL } from '@/lib/public-nav/types';
import { BRAND } from '@/lib/brand';
import { BuiltByHce } from '@/components/app/brand/built-by-hce';

// Non-null fork overrides replace the platform defaults wholesale.
const navigationLinks = footerNavItems ?? DEFAULT_FOOTER_NAV;
const legalLinks = footerLegalItems ?? DEFAULT_FOOTER_LEGAL;

const linkClass = 'text-muted-foreground hover:text-foreground text-sm font-light transition-colors';

export function SiteFooter() {
  const { openPreferences } = useConsent();

  return (
    <footer className="border-border/60 mt-auto border-t">
      <div className="mx-auto max-w-5xl px-6 py-10 sm:px-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-baseline sm:justify-between">
          <nav aria-label="Pages" className="flex flex-wrap gap-x-6 gap-y-2">
            {navigationLinks.map((link) => (
              <Link key={link.href} href={link.href} className={linkClass}>
                {link.label}
              </Link>
            ))}
          </nav>

          <nav aria-label="Legal" className="flex flex-wrap gap-x-6 gap-y-2">
            {legalLinks.map((link) => (
              <Link key={link.href} href={link.href} className={linkClass}>
                {link.label}
              </Link>
            ))}
            <button type="button" onClick={openPreferences} className={linkClass}>
              Cookie preferences
            </button>
          </nav>
        </div>

        {/* The year is read at render rather than built in, so a page cached over New Year does not
            claim a copyright that has expired. `BRAND.legalName` is the entity, not the product —
            the same distinction the privacy notice's controller field depends on.

            The studio credit shares this line rather than starting a new one: it belongs with the
            copyright — who owns this and who made it are the same kind of statement — and pairing
            them keeps the footer at two visual rows instead of three. */}
        <div className="mt-8 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <p className="text-muted-foreground/70 text-xs">
            © {new Date().getFullYear()} {BRAND.legalName}
          </p>
          <BuiltByHce />
        </div>
      </div>
    </footer>
  );
}
