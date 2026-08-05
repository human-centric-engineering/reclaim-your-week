'use client';

/**
 * What a leader can do with the report, said out loud.
 *
 * ## The thing this replaces
 *
 * Three identical pills in a row — "Download as PDF", "Print this page", "Share your results" —
 * under a chat box, above an underlined link, above a button called "Finish my audit". Nothing said
 * what any of them did, two of them looked the same as each other, and the most consequential one
 * (finishing) looked exactly like the least. A leader who has just been handed the most personal
 * document this product makes should not have to guess which control ends it.
 *
 * ## So: groups, and a sentence each
 *
 * Every action here carries one line of plain description. That is not decoration — "Share my report
 * with Rashmir" without "she will be able to read it and talk it through with you" is a consent
 * question with the consequence left off, and the whole of Brief §3 is about not doing that.
 *
 * The groups are the two honest categories: **things you take away** (yours, no consequence, do them
 * as often as you like) and **a thing you give somebody** (a choice about another person seeing your
 * week). Finishing is neither, so it is not here — it closes the run and lives on its own
 * (`finish-audit.tsx`).
 *
 * Print keeps its plain-button treatment rather than a download's: it opens the browser's dialogue
 * and produces nothing by itself, so dressing it as a download would be the third pill problem
 * coming back.
 */

import { Printer } from 'lucide-react';

import { DownloadButton } from '@/components/app/reclaim/report/download-button';

export function ReportActions({ runId }: { runId: string }) {
  const base = `/api/v1/app/reclaim/runs/${encodeURIComponent(runId)}`;

  return (
    <section className="print:hidden">
      <h2 className="text-muted-foreground text-[0.68rem] font-medium tracking-[0.22em] uppercase">
        Yours to keep
      </h2>

      <div className="mt-5 space-y-6">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-4">
          <DownloadButton
            href={`${base}/report.pdf`}
            fallbackFilename="time-audit.pdf"
            busyLabel="Making your report…"
            tone="primary"
          >
            Download the report
          </DownloadButton>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Everything on this page as a PDF, laid out to be read on paper.
          </p>
        </div>

        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-4">
          <DownloadButton
            href={`${base}/transcript.pdf`}
            fallbackFilename="time-audit-conversation.pdf"
            busyLabel="Gathering it…"
          >
            Download the conversation
          </DownloadButton>
          <p className="text-muted-foreground text-sm leading-relaxed">
            The whole exchange, in the order it happened. Also available as{' '}
            {/*
              The plain-text twin, offered inline rather than as a fourth button. It is the same
              document for a different purpose — a file that will still open in thirty years — and
              giving it equal visual weight would suggest a choice that matters more than it does.
            */}
            <PlainTextLink href={`${base}/transcript.txt`} />.
          </p>
        </div>

        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-4">
          <button
            type="button"
            onClick={() => window.print()}
            className="border-border text-foreground hover:bg-accent inline-flex items-center gap-2 rounded-full border px-5 py-2.5 text-sm transition-colors"
          >
            <Printer aria-hidden className="h-4 w-4" />
            Print this page
          </button>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Opens your browser&rsquo;s print dialogue, for the report as it is on screen.
          </p>
        </div>
      </div>
    </section>
  );
}

/**
 * The transcript as text, inline in a sentence.
 *
 * A link rather than a `DownloadButton` because it is inside prose, so it must read as a word. The
 * plain anchor is right here for the reason it was wrong for the report: this endpoint joins strings
 * and answers immediately, so there is no pause to explain and nothing to fail slowly.
 */
function PlainTextLink({ href }: { href: string }) {
  return (
    <a href={href} download className="text-primary underline underline-offset-4">
      a plain text file
    </a>
  );
}
