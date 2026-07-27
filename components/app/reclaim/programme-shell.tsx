'use client';

/**
 * The programme shell (F4 t-4) — the frame that holds a run: the seven-phase spine, the signpost for
 * where the leader is, and the phase itself. Loads the current run + progress in one enriched read
 * (`GET /runs/current`) and resumes there.
 *
 * **The conversation is the way through a phase; the form is the alternative.** Phases 0 to 5 open as
 * a coaching conversation, which is what the tool was designed to be. The form panels F6/F7 built are
 * intact and one click away, for a leader who would rather type into fields, and because the two paths
 * write the same slots through the same server path (I3) the choice can be changed mid-phase without
 * losing anything. The preference is remembered locally, per leader, so it does not have to be made
 * again at every phase.
 *
 * Phase 6 has no conversational form: its content is the summary the leader takes away and the sharing
 * choices, and consent is not something a coach may record (I6).
 *
 * **This is a frame, not a page, and that is the change.** It used to be a `max-w-5xl` document that
 * grew downwards: the transcript pushed the composer below the fold, and the reflection field and the
 * continue button below that, so talking to the coach meant scrolling past what you had already said
 * to find the box you say the next thing in. Now the shell owns the viewport — a fixed bar, a column
 * for the spine, and one bounded region for the phase — and **only the phase scrolls**. Everything a
 * leader acts with stays where they left it, which is how every chat surface they already use behaves.
 *
 * The height comes from the route group's layout (`app/(programme)/programme/layout.tsx`), which is
 * where the reasoning for leaving `(protected)` is written down.
 */

import { useCallback, useEffect, useState } from 'react';
import { useLocalStorage } from '@/lib/hooks/use-local-storage';
import {
  currentRunStateSchema,
  uiConfigSchema,
  type CurrentRunState,
} from '@/components/app/reclaim/types';
import type { PhaseSignpost } from '@/lib/app/programme/runs/signposts';
import { PhaseRail } from '@/components/app/reclaim/phase-rail';
import { ProgrammeChrome } from '@/components/app/reclaim/programme-chrome';
import { TrendLines } from '@/components/app/reclaim/repeat/trend-lines';
import { Signpost } from '@/components/app/reclaim/signpost';
import { FINAL_PHASE_KEY } from '@/lib/app/programme/runs/phases';
import { PhaseConversation } from '@/components/app/reclaim/coach/phase-conversation';
import { BeginAudit } from '@/components/app/reclaim/begin-audit';
import { ConsentGate } from '@/components/app/reclaim/consent-gate';
import { SetupPanel } from '@/components/app/reclaim/phase/setup-panel';
import { Phase1Panel } from '@/components/app/reclaim/phase/phase1-panel';
import { Phase2Panel } from '@/components/app/reclaim/phase/phase2-panel';
import { Phase3Panel } from '@/components/app/reclaim/phase/phase3-panel';
import { Phase4Panel } from '@/components/app/reclaim/phase/phase4-panel';
import { Phase5Panel } from '@/components/app/reclaim/phase/phase5-panel';
import { Phase6Panel } from '@/components/app/reclaim/phase/phase6-panel';

/** Where the leader's choice of conversation or form is remembered. Versioned, so the shape can move. */
const PHASE_MODE_KEY = 'reclaim.phase-mode.v1';

type PhaseMode = 'conversation' | 'form';

export function ProgrammeShell() {
  const [state, setState] = useState<CurrentRunState | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [phaseMode, setPhaseMode] = useLocalStorage<PhaseMode>(PHASE_MODE_KEY, 'conversation');
  /** F8 t-4: set once the leader has accepted the current policy version (or already had). */
  const [consented, setConsented] = useState(false);
  // Stable identity on purpose — `ConsentGate` takes this as an effect dependency (see the note there).
  const handleConsented = useCallback(() => setConsented(true), []);
  /**
   * The signpost cards, as the operator currently has them. `null` until they arrive, and on failure,
   * which falls the card back to the shipped defaults: a leader should never meet a phase with no
   * orientation at all because a config read did not come back.
   */
  const [signposts, setSignposts] = useState<PhaseSignpost[] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch('/api/v1/app/reclaim/runs/current');
      const json: unknown = await res.json();
      const data = json !== null && typeof json === 'object' && 'data' in json ? json.data : null;
      const parsed = currentRunStateSchema.safeParse(data);
      if (!res.ok || !parsed.success) throw new Error('bad response');
      setState(parsed.data);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Once per mount: the cards do not change while a leader is in a phase, and a failure is not worth
  // surfacing because the component falls back to the shipped defaults.
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/v1/app/reclaim/config');
        const json: unknown = await res.json();
        const data = json !== null && typeof json === 'object' && 'data' in json ? json.data : null;
        const parsed = uiConfigSchema.safeParse(data);
        if (parsed.success) setSignposts(parsed.data.phaseSignposts);
      } catch {
        // Defaults stand.
      }
    })();
  }, []);

  if (loading) {
    return (
      <Frame>
        <div className="mx-auto max-w-md px-4 py-24 text-center">
          <p className="text-muted-foreground text-sm tracking-wide">Gathering your audit…</p>
        </div>
      </Frame>
    );
  }

  if (failed || state === null) {
    return (
      <Frame>
        <div className="mx-auto max-w-md px-4 py-24 text-center">
          <p className="text-foreground text-lg font-light">
            We could not load your audit just now.
          </p>
          <button
            type="button"
            onClick={() => void load()}
            className="text-primary mt-4 text-sm underline underline-offset-4"
          >
            Try again
          </button>
        </div>
      </Frame>
    );
  }

  if (state.run === null) {
    // F8 t-4: the consent gate stands at the programme door, before the invitation to begin. The
    // server refuses run creation without a recorded acceptance of the current policy version — this
    // is the UI half, so a leader meets the terms as a step rather than as a 403. Once accepted (or
    // already on file), it hands straight through to the entry.
    if (!consented) {
      return (
        <Frame>
          <ConsentGate onAccepted={handleConsented} />
        </Frame>
      );
    }
    // F9 t-1: a returning leader sees where they have been before being invited to begin again.
    // `TrendLines` renders nothing until there are two completed audits to compare, so a first-time
    // leader's page is unchanged.
    // `TrendLines` returns null until there are two audits with something to plot, and it carries its
    // own wrapper so a first-time leader's page has no empty container in it either.
    return (
      <Frame>
        <TrendLines />
        <BeginAudit onStarted={() => void load()} />
      </Frame>
    );
  }

  const currentIndex = Math.max(
    0,
    state.phases.findIndex((p) => p.key === state.currentPhaseKey)
  );
  const currentPhase = state.phases[currentIndex];

  const talking = phaseMode === 'conversation' && currentPhase.key !== FINAL_PHASE_KEY;

  return (
    <>
      <ProgrammeChrome here={`Phase ${currentIndex} · ${currentPhase.label}`} />

      <div className="flex min-h-0 flex-1">
        {/* The spine keeps its own column on a wide screen, and its own scroll: seven phases fit, but
            a short viewport should not clip the last of them. */}
        <aside className="border-border/60 hidden w-60 shrink-0 overflow-y-auto border-r px-6 py-8 lg:block">
          <PhaseRail phases={state.phases} currentPhaseKey={state.currentPhaseKey} />
        </aside>

        <main className="flex min-h-0 flex-1 flex-col">
          <div className="border-border/60 shrink-0 border-b px-4 py-2.5 sm:px-6 lg:hidden">
            <PhaseRail
              phases={state.phases}
              currentPhaseKey={state.currentPhaseKey}
              variant="compact"
            />
          </div>

          {talking ? (
            <PhaseConversation
              runId={state.run.id}
              phaseKey={currentPhase.key}
              phaseIndex={currentIndex}
              phaseLabel={currentPhase.label}
              signposts={signposts ?? undefined}
              conversationId={state.run.conversationId}
              coachOpenings={state.run.coachOpenings}
              onAdvanced={() => void load()}
              onSwitchToForm={() => setPhaseMode('form')}
            />
          ) : (
            /* The form path scrolls inside the same bounded region, so both surfaces sit in one
               frame and switching between them does not change the shape of the page. */
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto max-w-3xl space-y-9 px-4 py-10 sm:px-6">
                <Signpost
                  phaseKey={currentPhase.key}
                  index={currentIndex}
                  label={currentPhase.label}
                  signposts={signposts ?? undefined}
                />
                <PhaseContent
                  phaseKey={currentPhase.key}
                  runId={state.run.id}
                  conversationId={state.run.conversationId}
                  coachOpenings={state.run.coachOpenings}
                  onAdvanced={() => void load()}
                />
                {currentPhase.key !== FINAL_PHASE_KEY && (
                  <button
                    type="button"
                    onClick={() => setPhaseMode('conversation')}
                    className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-4"
                  >
                    I would rather talk this through
                  </button>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </>
  );
}

/**
 * The frame around everything that is not a run in progress: loading, the failure, the consent gate,
 * and the invitation to begin. They are short pages, so they scroll in the middle region and keep the
 * bar above them — a leader who arrives at the consent gate should still be able to leave.
 */
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ProgrammeChrome />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:py-14">{children}</div>
      </div>
    </>
  );
}

/**
 * Render the form panel for the current phase (F6/F7) — the alternative to talking it through.
 *
 * The default branch is unreachable for the seven seeded phase keys and is a stated fallback rather
 * than a chat surface: it used to render the coach conversation, which meant an unknown phase key
 * silently opened a conversation with no phase behind it. A phase key that is not one of the seven is
 * a map that has moved, and saying so is more use than a chat window.
 */
function PhaseContent({
  phaseKey,
  runId,
  conversationId,
  coachOpenings,
  onAdvanced,
}: {
  phaseKey: string;
  runId: string;
  /** Phase 6's closing beat continues the run's own transcript rather than opening a new one. */
  conversationId: string | null;
  /** Phase 1 needs it for the reveal beat (I12), phase 6 for the close. */
  coachOpenings: string[];
  onAdvanced: () => void;
}) {
  switch (phaseKey) {
    case 'phase-0-setup':
      return <SetupPanel runId={runId} onAdvanced={onAdvanced} />;
    case 'phase-1-current':
      return <Phase1Panel runId={runId} coachOpenings={coachOpenings} onAdvanced={onAdvanced} />;
    case 'phase-2-energy':
      return <Phase2Panel runId={runId} onAdvanced={onAdvanced} />;
    case 'phase-3-ideal':
      return <Phase3Panel runId={runId} onAdvanced={onAdvanced} />;
    case 'phase-4-gap':
      return <Phase4Panel runId={runId} onAdvanced={onAdvanced} />;
    case 'phase-5-action':
      return <Phase5Panel runId={runId} onAdvanced={onAdvanced} />;
    case 'phase-6-summary':
      return (
        <Phase6Panel
          runId={runId}
          conversationId={conversationId}
          coachOpenings={coachOpenings}
          onAdvanced={onAdvanced}
        />
      );
    default:
      return (
        <p className="text-muted-foreground text-sm leading-relaxed">
          This part of the audit is not available just now.
        </p>
      );
  }
}
