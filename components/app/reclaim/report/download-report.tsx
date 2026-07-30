/**
 * The download control (F15 t-2) — one link, used wherever a summary is shown.
 *
 * **A plain anchor rather than a button with a fetch.** The browser already knows how to download a
 * file: it streams, it shows progress, it handles a slow response, and it survives a leader with
 * JavaScript disabled or still loading. Wrapping that in `fetch` + `createObjectURL` would buy a
 * spinner and cost all of it.
 *
 * `download` is deliberately not given a filename. The server sets one in `Content-Disposition`
 * (`time-audit-sam-2026-07-29.pdf`), and an attribute value here would silently win over it — two
 * places naming the same file, one of which does not know the leader's name.
 *
 * Hidden from print, because a link to a download is meaningless on paper.
 */

import { Download } from 'lucide-react';

export interface DownloadReportProps {
  runId: string;
  /** Rendered inside the link. Defaults to the wording both current call sites use. */
  label?: string;
}

export function DownloadReport({ runId, label = 'Download as PDF' }: DownloadReportProps) {
  return (
    <a
      href={`/api/v1/app/reclaim/runs/${encodeURIComponent(runId)}/report.pdf`}
      download
      className="border-border text-foreground hover:bg-muted inline-flex items-center gap-2 rounded-full border px-6 py-2.5 text-sm transition-colors print:hidden"
    >
      <Download aria-hidden className="h-4 w-4" />
      {label}
    </a>
  );
}
