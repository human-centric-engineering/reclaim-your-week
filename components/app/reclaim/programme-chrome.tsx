/**
 * The programme's own bar — the one piece of chrome a full-screen surface keeps.
 *
 * The audit used to sit inside the platform's protected layout, which carried the app header and
 * footer. That frame is gone (see `app/(programme)/programme/layout.tsx` for why), and with it the
 * only way out of the audit that was not the browser's back button. So this bar exists for two
 * reasons and no others: to say where you are, and to let you leave.
 *
 * Deliberately quiet. A leader in the middle of an honest conversation about their week does not need
 * navigation; they need to know the door is there. Fixed height, so the conversation below it can be
 * a bounded scroll region — which is the whole point of the new frame.
 */

import Link from 'next/link';

export function ProgrammeChrome({
  /** Where the leader is, shown beside the title. Absent before a run has been read. */
  here,
}: {
  here?: string;
}) {
  return (
    <header className="border-border/60 flex h-14 shrink-0 items-center gap-4 border-b px-4 sm:px-6">
      <div className="flex min-w-0 items-baseline gap-3">
        <span className="text-primary text-[0.65rem] font-medium tracking-[0.22em] whitespace-nowrap uppercase">
          Reclaim your week
        </span>
        {here !== undefined && (
          <span className="text-muted-foreground hidden truncate text-sm sm:inline">{here}</span>
        )}
      </div>
      <Link
        href="/dashboard"
        className="text-muted-foreground hover:text-foreground ml-auto shrink-0 text-xs underline underline-offset-4"
      >
        Leave the audit
      </Link>
    </header>
  );
}
