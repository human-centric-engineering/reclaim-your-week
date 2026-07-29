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

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ProgrammeChrome } from '@/components/app/reclaim/programme-chrome';
import {
  abandonRun,
  readRuns,
  auditPeriod,
  auditDate,
  RUN_ABANDONED,
  RUN_IN_PROGRESS,
  type RunListItem,
} from '@/components/app/reclaim/history/actions';

export function AuditHistory() {
  const [runs, setRuns] = useState<RunListItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  // Extracted so letting an audit go can re-read the list: the abandoned run moves out of the open
  // card and into "Finished before this" without a page reload, which is the only way a leader can
  // tell the difference between "it worked" and "nothing happened".
  const load = useCallback(async () => {
    try {
      setRuns(await readRuns());
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Positively `in_progress`, not "anything that is not complete". A third status now exists, and
  // the old test would have kept an abandoned run in the open card, offering to resume something the
  // server refuses. See `RUN_IN_PROGRESS`.
  const open = runs?.find((r) => r.status === RUN_IN_PROGRESS) ?? null;
  const past = runs?.filter((r) => r.status !== RUN_IN_PROGRESS) ?? [];

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

          {open !== null && <OpenAudit run={open} onAbandoned={() => void load()} />}

          {past.length > 0 && (
            <section className="space-y-4">
              <h2 className="text-muted-foreground text-[0.7rem] font-medium tracking-[0.2em] uppercase">
                {open === null ? 'Earlier' : 'Before this one'}
              </h2>
              <ul className="space-y-3">
                {past.map((run) => (
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
 *
 * **And it is the only place a leader can let one go** (F16). `RUN_STATUS.abandoned` existed and was
 * written nowhere, while `createRun` refused a second run with "complete or abandon the current
 * audit" — advice the product could not take. The obvious home for the control looked like
 * `begin-audit.tsx`, and that turned out to be wrong: the shell only renders `BeginAudit` when there
 * is no run in progress, so a leader who has one never sees it. This card is where they actually
 * meet the audit they are stuck with.
 */
function OpenAudit({ run, onAbandoned }: { run: RunListItem; onAbandoned: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const letGo = async () => {
    setBusy(true);
    setError(null);
    try {
      await abandonRun(run.id);
      onAbandoned();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setBusy(false);
    }
  };

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

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <Link
          href="/programme"
          className="bg-primary text-primary-foreground inline-block rounded-full px-7 py-3 text-[0.95rem] font-medium"
        >
          Take this up again
        </Link>

        {/* Quiet, secondary, and named after what the leader wants rather than what the database
            does. Not "Abandon", not "Delete", not "Give up": almost nobody wants to destroy their
            own work, they want to start over, and I17 says the wording is the product's job. */}
        {!confirming && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="text-muted-foreground hover:text-foreground text-sm underline underline-offset-4 transition-colors"
          >
            Start again from the beginning
          </button>
        )}
      </div>

      {/* One step, and it says what is kept as well as what is not. No countdown, no typing a word
          to confirm, no second "are you sure" — this is reversible in every way that matters,
          because nothing is deleted. */}
      {confirming && (
        <div className="border-border/70 bg-background space-y-3 rounded-xl border px-5 py-4">
          <p className="text-foreground text-sm leading-relaxed">
            Everything you have said stays here, in this list, and you can still read it. A new
            audit would begin at the first section, with a fresh conversation.
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <button
              type="button"
              onClick={() => void letGo()}
              disabled={busy}
              className="border-border text-foreground hover:bg-muted rounded-full border px-6 py-2 text-sm disabled:opacity-40"
            >
              {busy ? 'One moment…' : 'Yes, start again'}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={busy}
              className="text-muted-foreground hover:text-foreground text-sm underline underline-offset-4"
            >
              Keep this one
            </button>
          </div>
          {error !== null && (
            <p className="text-muted-foreground text-sm" role="status">
              {error} You can try again.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * A past audit, as a quiet row that opens for reading.
 *
 * **An audit a leader set aside says so** (F16). It would otherwise fall through to "Begun <date>",
 * which is what an audit with no completion time used to mean and no longer does. Reading a row
 * that says only when it started, beside rows that say when they finished, invites the conclusion
 * that something went wrong with it. Nothing did: the leader chose, and the wording should carry
 * that rather than leave a gap for them to fill in (I17).
 */
function FinishedAudit({ run }: { run: RunListItem }) {
  const when =
    run.status === RUN_ABANDONED
      ? `Set aside ${auditDate(run.abandonedAt ?? run.startedAt)}`
      : run.completedAt === null
        ? `Begun ${auditDate(run.startedAt)}`
        : `Finished ${auditDate(run.completedAt)}`;

  return (
    <Link
      href={`/programme/history/${run.id}`}
      className="border-border/70 hover:bg-accent/40 flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-2xl border px-6 py-5 transition-colors"
    >
      <span className="text-foreground text-lg font-light">{auditPeriod(run)}</span>
      <span className="text-muted-foreground text-sm">{when}</span>
      <span className="text-primary ml-auto text-sm underline underline-offset-4">Open</span>
    </Link>
  );
}
