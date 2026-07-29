'use client';

/**
 * Every audit a leader has run, in one place.
 *
 * **This is the surface v1 did not have, and its absence was not cosmetic.** `runs/current` filters on
 * `in_progress` by design, so the moment an audit completed it left the product entirely: the phases,
 * the conversation, the readings and the summary were all still in the database, still owned by the
 * leader, and reachable by nothing. What survived was the share link, and only for the people who
 * chose to make one. An audit is a record of somebody's own working life, and a tool that takes it
 * away at the end is asking them to trust it with the next one on worse terms.
 *
 * Two kinds of row, doing two different jobs:
 *
 *  - **The open audit continues.** There is at most one, the server sees to that, and the way back
 *    into it is the audit itself rather than a copy of it here. So the row says where it got to and
 *    hands straight over to `/programme`, which resumes at that phase.
 *  - **A finished audit opens for reading.** It goes to its own page, where nothing can be changed,
 *    because a finished audit that could still be edited would make every figure in it provisional.
 *
 * The order is newest first, which is the only ordering that does not make a claim: sorting by
 * anything else here would be the tool saying which audit mattered.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ProgrammeChrome } from '@/components/app/reclaim/programme-chrome';
import {
  readRuns,
  auditPeriod,
  auditDate,
  RUN_COMPLETE,
  type RunListItem,
} from '@/components/app/reclaim/history/actions';

export function AuditHistory() {
  const [runs, setRuns] = useState<RunListItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    void readRuns()
      .then(setRuns)
      .catch(() => setFailed(true));
  }, []);

  const open = runs?.find((r) => r.status !== RUN_COMPLETE) ?? null;
  const finished = runs?.filter((r) => r.status === RUN_COMPLETE) ?? [];

  return (
    <>
      <ProgrammeChrome here="Your audits" />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-10 px-4 py-10 sm:px-6 sm:py-14">
          <header className="space-y-3">
            <p className="text-primary text-[0.72rem] font-medium tracking-[0.24em] uppercase">
              Reclaim your week
            </p>
            <h1 className="text-foreground text-3xl leading-tight font-light sm:text-4xl">
              Your audits
            </h1>
            <p className="text-muted-foreground max-w-lg text-[1.02rem] leading-relaxed">
              Each one is a picture of a particular week in your working life. They stay here, in
              your own words, for as long as you want them.
            </p>
          </header>

          {failed && (
            <p className="text-muted-foreground text-sm leading-relaxed" role="status">
              We could not load your audits just now. Reloading the page usually settles it.
            </p>
          )}

          {runs === null && !failed && (
            <p className="text-muted-foreground text-sm tracking-wide">Finding your audits…</p>
          )}

          {runs !== null && runs.length === 0 && (
            <div className="border-border/70 space-y-4 rounded-2xl border px-6 py-8">
              <p className="text-foreground text-lg leading-relaxed font-light">
                There is nothing here yet.
              </p>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Your first audit will appear as soon as you begin one, whether you finish it in a
                sitting or come back to it over a week.
              </p>
              <Link
                href="/programme"
                className="bg-primary text-primary-foreground inline-block rounded-full px-7 py-3 text-[0.95rem] font-medium"
              >
                Begin an audit
              </Link>
            </div>
          )}

          {open !== null && <OpenAudit run={open} />}

          {finished.length > 0 && (
            <section className="space-y-4">
              <h2 className="text-muted-foreground text-[0.7rem] font-medium tracking-[0.2em] uppercase">
                {open === null ? 'Finished' : 'Finished before this'}
              </h2>
              <ul className="space-y-3">
                {finished.map((run) => (
                  <li key={run.id}>
                    <FinishedAudit run={run} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * The audit still open, if there is one.
 *
 * It gets the prominent card and the filled button, because a half-finished audit is the one thing on
 * this page that is waiting for the leader rather than the other way round. The phase it stopped at is
 * named, so coming back does not start with wondering how far in they were.
 */
function OpenAudit({ run }: { run: RunListItem }) {
  return (
    <section className="border-primary/40 bg-accent/30 space-y-4 rounded-2xl border px-6 py-6">
      <div className="space-y-1">
        <p className="text-primary text-[0.7rem] font-medium tracking-[0.2em] uppercase">
          Still open
        </p>
        <h2 className="text-foreground text-xl leading-snug font-light">{auditPeriod(run)}</h2>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Begun {auditDate(run.startedAt)}
          {run.progress !== null && (
            <>
              . You stopped at section {run.progress.phaseIndex}, {run.progress.phaseLabel}
            </>
          )}
          .
        </p>
      </div>
      <Link
        href="/programme"
        className="bg-primary text-primary-foreground inline-block rounded-full px-7 py-3 text-[0.95rem] font-medium"
      >
        Take this up again
      </Link>
    </section>
  );
}

/** A finished audit, as a quiet row that opens for reading. */
function FinishedAudit({ run }: { run: RunListItem }) {
  return (
    <Link
      href={`/programme/history/${run.id}`}
      className="border-border/70 hover:bg-accent/40 flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-2xl border px-6 py-5 transition-colors"
    >
      <span className="text-foreground text-lg font-light">{auditPeriod(run)}</span>
      <span className="text-muted-foreground text-sm">
        {run.completedAt === null
          ? `Begun ${auditDate(run.startedAt)}`
          : `Finished ${auditDate(run.completedAt)}`}
      </span>
      <span className="text-primary ml-auto text-sm underline underline-offset-4">Open</span>
    </Link>
  );
}
