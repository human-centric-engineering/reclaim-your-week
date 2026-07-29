'use client';

/**
 * The seven-phase spine (F4 t-4). A quiet vertical journey — where the leader is, what is behind, what
 * is ahead — never a percentage bar (this is not a productivity exercise, I-frame). All seven show,
 * Phase 0 labelled its own name, so "you are here" is right on resume (UserNodeState per node). A soft
 * beacon marks the current phase; completed phases fill in; upcoming ones wait, hollow. Gentle
 * staggered reveal on mount.
 *
 * ## What is reachable, and what is not
 *
 * A phase the leader has finished is theirs to look at again: it holds what they said about their own
 * week, and a spine that showed it without letting them open it is a table of contents for a book they
 * cannot turn back through. So completed phases are buttons, and the phase they are on is a button
 * too — the way back from a visit.
 *
 * **Upcoming phases stay inert, and that is not an oversight.** The audit is sequential by design and
 * the server enforces it (I9): a phase cannot be left until its reflection exists. Making a future
 * phase clickable would offer a door that only ever refuses.
 *
 * `onSelect` is optional. Without it the spine is exactly what it was, which is what the compact strip
 * in the summary chrome and any read-only rendering want.
 *
 * **`currentPhaseKey` may be `null`, and that is a finished audit.** A leader reading back an audit
 * they completed has no "here": every phase is behind them, so the beacon marks nothing and every row
 * opens. Passing the last phase instead would put a pulsing "here" on phase 6 of an audit that ended
 * weeks ago, which says the opposite of what it means.
 */

import { useEffect, useState } from 'react';
import type { PhaseView } from '@/components/app/reclaim/types';

/** Whether this phase can be opened: one already finished, or the one the leader is on. */
function isReachable(phase: PhaseView, currentPhaseKey: string | null): boolean {
  return phase.status === 'completed' || phase.key === currentPhaseKey;
}

export function PhaseRail({
  phases,
  currentPhaseKey,
  viewingPhaseKey,
  onSelect,
  variant = 'vertical',
}: {
  phases: PhaseView[];
  /** Where the audit has got to, or `null` when it is finished and there is no "here" left. */
  currentPhaseKey: string | null;
  /**
   * The phase actually on screen, when the leader has gone back to look at an earlier one.
   *
   * Deliberately separate from `currentPhaseKey`: "here" means where the audit has got to, and going
   * back to read phase 1 does not move the audit. Both are marked, differently — the beacon stays on
   * the run's position, and the phase being read is the one marked as the current page.
   */
  viewingPhaseKey?: string;
  /** Open a phase. Omit to render the spine as a display of progress and nothing more. */
  onSelect?: (phaseKey: string) => void;
  /**
   * `vertical` is the spine, in the frame's left column on a wide screen. `compact` is the same seven
   * phases as a single line, for the narrow layout where the column is gone and the conversation
   * needs the width — a strip rather than a stack, so it costs one row instead of seven.
   */
  variant?: 'vertical' | 'compact';
}) {
  const [shown, setShown] = useState(false);
  useEffect(() => setShown(true), []);

  if (variant === 'compact') {
    const current = phases.find((p) => p.key === currentPhaseKey);
    const index = phases.findIndex((p) => p.key === currentPhaseKey);
    return (
      <nav
        aria-label="Your progress through the audit"
        className="flex items-center gap-3 overflow-x-auto"
      >
        <ol className="flex shrink-0 items-center gap-1.5">
          {phases.map((phase, i) => {
            const dot = (
              <span
                aria-hidden
                className={`block h-1.5 rounded-full transition-all ${
                  phase.key === (viewingPhaseKey ?? currentPhaseKey)
                    ? 'bg-primary w-6'
                    : phase.status === 'completed'
                      ? 'bg-primary/50 w-1.5'
                      : 'bg-border w-1.5'
                }`}
              />
            );
            const reachable = onSelect !== undefined && isReachable(phase, currentPhaseKey);
            return (
              <li key={phase.key}>
                {reachable ? (
                  // The dot keeps its size; the button carries the tap target as padding, because a
                  // 6px circle is not something anyone hits on a phone.
                  <button
                    type="button"
                    onClick={() => onSelect(phase.key)}
                    className="flex items-center px-0.5 py-2.5"
                    aria-label={`Go to section ${i}, ${phase.label}`}
                    aria-current={phase.key === viewingPhaseKey ? 'page' : undefined}
                  >
                    {dot}
                  </button>
                ) : (
                  dot
                )}
              </li>
            );
          })}
        </ol>
        {current !== undefined && (
          <p className="text-muted-foreground truncate text-xs">
            <span className="text-foreground font-medium">
              {index} · {current.label}
            </span>
            <span className="sr-only">, section {index} of 6</span>
          </p>
        )}
      </nav>
    );
  }

  return (
    <nav aria-label="Your progress through the audit">
      <ol className="relative">
        {/* the spine */}
        <span aria-hidden className="bg-border absolute top-3 bottom-3 left-[0.6875rem] w-px" />
        {phases.map((phase, i) => {
          const current = phase.key === currentPhaseKey;
          const done = phase.status === 'completed';
          const reachable = onSelect !== undefined && isReachable(phase, currentPhaseKey);
          const viewing = phase.key === viewingPhaseKey;
          const Row = reachable ? 'button' : 'span';
          return (
            <li
              key={phase.key}
              style={{ transitionDelay: `${i * 55}ms` }}
              className={`relative transition-all duration-500 ease-out ${
                shown ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'
              }`}
            >
              {/* The whole row is the target where the phase can be opened, so there is no small
                  hit area to find; where it cannot, it is the same markup without the affordance. */}
              <Row
                {...(reachable
                  ? {
                      type: 'button' as const,
                      onClick: () => onSelect(phase.key),
                      'aria-current': viewing ? ('page' as const) : undefined,
                    }
                  : {})}
                className={`flex w-full items-center gap-4 rounded-lg py-3 text-left transition-colors ${
                  reachable ? 'hover:bg-accent/40 -mx-2 px-2' : ''
                } ${viewing ? 'bg-accent/40 -mx-2 px-2' : ''}`}
              >
                {/* marker */}
                <span className="relative flex h-6 w-6 shrink-0 items-center justify-center">
                  {current && (
                    <span
                      aria-hidden
                      className="bg-primary/25 absolute inline-flex h-full w-full animate-ping rounded-full"
                    />
                  )}
                  <span
                    aria-hidden
                    className={`relative h-3 w-3 rounded-full ring-4 transition-colors ${
                      done
                        ? 'bg-primary ring-background'
                        : current
                          ? 'bg-primary ring-background'
                          : 'bg-background ring-background border-border border'
                    }`}
                  />
                </span>

                {/* number + label */}
                <span className="flex items-baseline gap-3">
                  <span
                    className={`w-4 text-lg font-light tabular-nums ${
                      current
                        ? 'text-primary'
                        : done
                          ? 'text-foreground/70'
                          : 'text-muted-foreground/60'
                    }`}
                  >
                    {i}
                  </span>
                  <span
                    className={`text-[0.95rem] transition-colors ${
                      current
                        ? 'text-foreground font-medium'
                        : done
                          ? 'text-foreground/80'
                          : 'text-muted-foreground'
                    }`}
                  >
                    {phase.label}
                    {/* "here" stays on the run's own position even while an earlier phase is being
                      read, because that is what it means: where the audit has got to. The phase
                      being read is marked by the band behind its row instead. */}
                    {current && (
                      <span className="text-primary ml-2 align-middle text-[0.7rem] tracking-[0.18em] uppercase">
                        here
                      </span>
                    )}
                    {viewing && !current && (
                      <span className="text-muted-foreground ml-2 align-middle text-[0.7rem] tracking-[0.18em] uppercase">
                        reading
                      </span>
                    )}
                  </span>
                </span>
              </Row>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
