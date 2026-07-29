'use client';

/**
 * The programme's own bar.
 *
 * The audit used to sit inside the platform's protected layout, which carried the app header and
 * footer. That frame is gone (see `app/(programme)/layout.tsx` for why), so this bar is
 * what stands in for it.
 *
 * **It used to hold one link, and that was one link too few.** The bar was built to do two things and
 * no others: say where you are, and let you leave. "Leave the audit" pointed at the dashboard, which
 * meant the only navigation in a forty-minute conversation was a door out to a page about an account.
 * The restraint was right; the conclusion was not. What a leader wants at hand is not fewer controls,
 * it is **the ordinary ones they have everywhere else**: their own picture, light or dark, and a way
 * to their past audits. Those are three quiet objects in a corner rather than a navigation bar, and
 * the middle of the bar stays empty, which is where the restraint actually lives.
 *
 * **The left is a breadcrumb, not a title.** The wordmark returns to the audit, an optional `back`
 * names where this screen sits, and `here` says which part of it is open. Read left to right it is
 * "Reclaim your week / Your audits / 2026 Q1", which answers "where am I" without a heading.
 *
 * Fixed height, so the conversation below can be a bounded scroll region — the whole point of the
 * frame this sits in.
 */

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { AccountMenu } from '@/components/app/reclaim/account-menu';
import { ThemeSwitch } from '@/components/app/reclaim/theme-switch';

export interface ProgrammeChromeProps {
  /** Which part of this screen is open, shown last in the trail. Absent before a run has been read. */
  here?: string;
  /** The screen this one sits inside, when it has one. Rendered as the middle of the trail. */
  back?: { href: string; label: string };
}

export function ProgrammeChrome({ here, back }: ProgrammeChromeProps) {
  return (
    <header className="border-border/60 flex h-14 shrink-0 items-center gap-3 border-b px-4 sm:px-6">
      <nav aria-label="Where you are" className="flex min-w-0 items-baseline gap-2.5">
        <Link
          href="/programme"
          className="text-primary hover:text-primary/80 text-[0.65rem] font-medium tracking-[0.22em] whitespace-nowrap uppercase transition-colors"
        >
          Reclaim your week
        </Link>

        {back !== undefined && (
          <>
            <Separator />
            <Link
              href={back.href}
              className="text-muted-foreground hover:text-foreground hidden min-w-0 truncate text-sm transition-colors sm:inline"
            >
              {back.label}
            </Link>
          </>
        )}

        {here !== undefined && (
          <>
            {back !== undefined && <Separator />}
            {/* `min-w-0` is what makes `truncate` bite: a flex item will not shrink below its
                content without it, so a long phase name would push the corner off the bar. */}
            <span className="text-muted-foreground hidden min-w-0 truncate text-sm sm:inline">
              {here}
            </span>
          </>
        )}
      </nav>

      {/* The corner. Two controls, both the ones a leader already knows from every other product they
          use, which is exactly why they can be here without the bar becoming navigation. */}
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <ThemeSwitch />
        <AccountMenu />
      </div>
    </header>
  );
}

/** The mark between two steps of the trail. Hidden with them on a narrow screen. */
function Separator() {
  return (
    <ChevronRight
      aria-hidden
      className="text-muted-foreground/40 hidden h-3.5 w-3.5 self-center sm:block"
    />
  );
}
