'use client';

/**
 * The rail along the bottom of the programme frame.
 *
 * **A colophon, not navigation.** Everything a leader does is above it; what lives here is the three
 * things somebody looks for when they stop and wonder about the thing they are using rather than the
 * week they are auditing: where their answers go, how to reach a person, and what was agreed about
 * cookies. Right-aligned and small, so it reads as the edge of the page.
 *
 * **The size is the design.** This frame is a fixed viewport and the conversation gets what is left,
 * so every pixel here is taken from the transcript. One line, one rule above it, no headings, no
 * copyright, no columns. On a narrow screen the links wrap rather than shrink, because unreadable
 * legal links are worse than a second row.
 *
 * **Cookie preferences is not optional.** The platform renders that control in its own footer
 * regardless of the nav seam, because consent has to stay reachable in many jurisdictions. A frame
 * that opts out of the platform's footer inherits that obligation, which is the whole reason this
 * exists as a real footer rather than two links in a corner.
 *
 * Privacy is deliberately first. For an invite-only audit it is part of the offer rather than fine
 * print, which is the same reasoning that put it in the public header (`lib/app/public-nav.ts`).
 */

import Link from 'next/link';
import { useConsent } from '@/lib/consent';
import { BuiltByHce } from '@/components/app/brand/built-by-hce';

const linkClass =
  'text-muted-foreground/80 hover:text-foreground text-[0.7rem] tracking-wide transition-colors';

export function ProgrammeFooter() {
  const { openPreferences } = useConsent();

  return (
    <footer className="border-border/40 flex shrink-0 flex-wrap items-center justify-between gap-x-5 gap-y-1 border-t px-4 py-2 sm:px-6">
      {/* The credit sits at the far edge from the links rather than joining the end of them: it is a
          statement about who made the tool, not a fourth thing to click while auditing a week, and
          the links stay a single group that wraps together on a narrow screen. */}
      <BuiltByHce size="sm" />

      <div className="flex flex-wrap items-center justify-end gap-x-5 gap-y-1">
        <Link href="/privacy" className={linkClass}>
          Privacy
        </Link>
        <Link href="/contact" className={linkClass}>
          Help and support
        </Link>
        <button type="button" onClick={openPreferences} className={linkClass}>
          Cookie preferences
        </button>
      </div>
    </footer>
  );
}
