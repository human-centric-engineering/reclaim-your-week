'use client';

/**
 * The seven-phase spine (F4 t-4). A quiet vertical journey — where the leader is, what is behind, what
 * is ahead — never a percentage bar (this is not a productivity exercise, I-frame). All seven show,
 * Phase 0 labelled its own name, so "you are here" is right on resume (UserNodeState per node). A soft
 * beacon marks the current phase; completed phases fill in; upcoming ones wait, hollow. Gentle
 * staggered reveal on mount.
 */

import { useEffect, useState } from 'react';
import type { PhaseView } from '@/components/app/reclaim/types';

export function PhaseRail({
  phases,
  currentPhaseKey,
  variant = 'vertical',
}: {
  phases: PhaseView[];
  currentPhaseKey: string;
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
          {phases.map((phase) => (
            <li key={phase.key}>
              <span
                aria-hidden
                className={`block h-1.5 rounded-full transition-all ${
                  phase.key === currentPhaseKey
                    ? 'bg-primary w-6'
                    : phase.status === 'completed'
                      ? 'bg-primary/50 w-1.5'
                      : 'bg-border w-1.5'
                }`}
              />
            </li>
          ))}
        </ol>
        {current !== undefined && (
          <p className="text-muted-foreground truncate text-xs">
            <span className="text-foreground font-medium">
              {index} · {current.label}
            </span>
            <span className="sr-only">, phase {index} of 6</span>
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
          return (
            <li
              key={phase.key}
              style={{ transitionDelay: `${i * 55}ms` }}
              className={`relative flex items-center gap-4 py-3 transition-all duration-500 ease-out ${
                shown ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'
              }`}
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
                  {current && (
                    <span className="text-primary ml-2 align-middle text-[0.7rem] tracking-[0.18em] uppercase">
                      here
                    </span>
                  )}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
