'use client';

/**
 * One finished audit, opened again.
 *
 * **The summary leads, and the phases are behind it.** What somebody comes back for months later is
 * the artifact: the picture of the week, the areas beside their ideal, the one thing they said they
 * would start. The conversation that produced it is what they want second, and only for the phase
 * they are thinking about. So the summary is the page and the spine is how you get underneath it,
 * rather than a seven-phase table of contents with the summary filed at the end of it.
 *
 * **Nothing here can be changed, and that is enforced three deep.** The screen offers no composer, no
 * transition and no corrections (`readOnly` on the review). Behind it, the server refuses a write to a
 * run that is not in progress (`assertActiveOwnedRun`), refuses a coach turn on one
 * (`loadCoachTurnTarget`), and the journey engine refuses to complete a node that is not active. The
 * UI is therefore the least important of the three, which is the right order: a finished audit whose
 * figures could still move would make every one of them provisional, including the ones a leader has
 * already acted on.
 *
 * An audit that turns out to be **still open** is not shown read-only. It is handed back to
 * `/programme`, which is the surface that can actually continue it. This only happens on a bookmarked
 * or hand-typed URL, because the history list sends an open audit there directly, and it is worth
 * handling anyway: silently rendering a live audit as a finished one is the more confusing failure.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ProgrammeChrome } from '@/components/app/reclaim/programme-chrome';
import { PhaseRail } from '@/components/app/reclaim/phase-rail';
import { PhaseReview } from '@/components/app/reclaim/phase-review';
import { SummaryView } from '@/components/app/reclaim/summary/summary-view';
import { uiConfigSchema } from '@/components/app/reclaim/types';
import { fetchSummary } from '@/components/app/reclaim/phase/actions';
import type { AuditSummary } from '@/components/app/reclaim/summary/types';
import type { PhaseSignpost } from '@/lib/app/programme/runs/signposts';
import {
  readRun,
  auditPeriod,
  auditDate,
  RUN_COMPLETE,
  type RunState,
} from '@/components/app/reclaim/history/actions';

export function RunReview({ runId }: { runId: string }) {
  const [state, setState] = useState<RunState | null>(null);
  const [failed, setFailed] = useState(false);
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [summaryFailed, setSummaryFailed] = useState(false);
  /** As the operator has them; `null` falls the signpost back to the shipped wording. */
  const [signposts, setSignposts] = useState<PhaseSignpost[] | null>(null);
  /** The phase being read, or `null` for the summary this page opens on. */
  const [viewingKey, setViewingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      setState(await readRun(runId));
    } catch {
      setFailed(true);
    }
  }, [runId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Only for an audit that finished. An open one is handed back to `/programme` below, and asking the
  // server to build a summary of a week the leader has not described yet would be a wasted call.
  const complete = state !== null && state.run.status === RUN_COMPLETE;
  useEffect(() => {
    if (!complete) return;
    void fetchSummary(runId)
      .then(setSummary)
      .catch(() => setSummaryFailed(true));
  }, [complete, runId]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/v1/app/reclaim/config');
        const json: unknown = await res.json();
        const data = json !== null && typeof json === 'object' && 'data' in json ? json.data : null;
        const parsed = uiConfigSchema.safeParse(data);
        if (parsed.success) setSignposts(parsed.data.phaseSignposts);
      } catch {
        // The shipped wording stands.
      }
    })();
  }, []);

  if (failed) {
    return (
      <Frame>
        <p className="text-foreground text-lg font-light">We could not open that audit.</p>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          It may belong to another account, or the link may be incomplete.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-5">
          <button
            type="button"
            onClick={() => void load()}
            className="text-primary text-sm underline underline-offset-4"
          >
            Try again
          </button>
          <Link
            href="/programme/history"
            className="text-muted-foreground hover:text-foreground text-sm underline underline-offset-4"
          >
            Back to your audits
          </Link>
        </div>
      </Frame>
    );
  }

  if (state === null) {
    return (
      <Frame>
        <p className="text-muted-foreground text-sm tracking-wide">Finding that audit…</p>
      </Frame>
    );
  }

  if (!complete) {
    return (
      <Frame>
        <p className="text-foreground text-lg leading-relaxed font-light">
          This audit is still open.
        </p>
        <p className="text-muted-foreground mt-3 max-w-md text-sm leading-relaxed">
          It is waiting where you left it, and it carries on rather than starting again.
        </p>
        <Link
          href="/programme"
          className="bg-primary text-primary-foreground mt-7 inline-block rounded-full px-7 py-3 text-[0.95rem] font-medium"
        >
          Take it up again
        </Link>
      </Frame>
    );
  }

  const viewIndex = viewingKey === null ? -1 : state.phases.findIndex((p) => p.key === viewingKey);
  const viewing = viewIndex > -1 ? state.phases[viewIndex] : null;
  const period = auditPeriod(state.run);

  return (
    <>
      <ProgrammeChrome
        back={{ href: '/programme/history', label: 'Your audits' }}
        here={viewing === null ? period : `${period} · section ${viewIndex}`}
      />

      <div className="flex min-h-0 flex-1">
        {/* The spine, with no beacon on it: every phase of a finished audit is behind the leader, so
            `currentPhaseKey` is null and each row simply opens. */}
        <aside className="border-border/60 hidden w-60 shrink-0 overflow-y-auto border-r px-6 py-8 lg:block">
          <PhaseRail
            phases={state.phases}
            currentPhaseKey={null}
            viewingPhaseKey={viewingKey ?? undefined}
            onSelect={setViewingKey}
          />
        </aside>

        <main className="flex min-h-0 flex-1 flex-col">
          <div className="border-border/60 shrink-0 border-b px-4 py-2.5 sm:px-6 lg:hidden">
            <PhaseRail
              phases={state.phases}
              currentPhaseKey={null}
              viewingPhaseKey={viewingKey ?? undefined}
              onSelect={setViewingKey}
              variant="compact"
            />
          </div>

          {viewing !== null ? (
            <PhaseReview
              runId={state.run.id}
              phaseKey={viewing.key}
              phaseIndex={viewIndex}
              phaseLabel={viewing.label}
              signposts={signposts ?? undefined}
              conversationId={state.run.conversationId}
              phaseMarks={state.run.phaseMarks}
              returnLabel="the summary"
              onReturn={() => setViewingKey(null)}
              readOnly
            />
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto max-w-3xl space-y-8 px-4 py-10 sm:px-6">
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {state.run.completedAt === null
                    ? `Begun ${auditDate(state.run.startedAt)}.`
                    : `Finished ${auditDate(state.run.completedAt)}.`}{' '}
                  Any section in the spine opens the part of the conversation it came from.
                </p>

                {summary !== null ? (
                  <SummaryView summary={summary} />
                ) : summaryFailed ? (
                  <p className="text-muted-foreground text-sm leading-relaxed" role="status">
                    We could not put the summary together just now. The phases below still hold
                    everything it is built from.
                  </p>
                ) : (
                  <p className="text-muted-foreground text-sm tracking-wide">
                    Putting your summary back together…
                  </p>
                )}

                {/* Below `lg` the spine is a strip of dots at the top, which is orientation rather
                    than a way in. So the phases are also listed plainly, where the summary ends. */}
                <nav aria-label="The phases of this audit" className="lg:hidden">
                  <h2 className="text-muted-foreground text-[0.7rem] font-medium tracking-[0.2em] uppercase">
                    Look back at a section
                  </h2>
                  <ul className="mt-3 space-y-1">
                    {state.phases.map((phase, i) => (
                      <li key={phase.key}>
                        <button
                          type="button"
                          onClick={() => setViewingKey(phase.key)}
                          className="text-foreground hover:bg-accent/40 -mx-2 flex w-full items-baseline gap-3 rounded-lg px-2 py-2 text-left"
                        >
                          <span className="text-muted-foreground w-4 text-sm tabular-nums">
                            {i}
                          </span>
                          <span className="text-[0.95rem]">{phase.label}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </nav>
              </div>
            </div>
          )}
        </main>
      </div>
    </>
  );
}

/** The frame around everything that is not a finished audit on screen: loading, the failure, the hand-back. */
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ProgrammeChrome back={{ href: '/programme/history', label: 'Your audits' }} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6">{children}</div>
      </div>
    </>
  );
}
