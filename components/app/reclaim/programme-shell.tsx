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
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <p className="text-muted-foreground text-sm tracking-wide">Gathering your audit…</p>
      </div>
    );
  }

  if (failed || state === null) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <p className="text-foreground text-lg font-light">We could not load your audit just now.</p>
        <button
          type="button"
          onClick={() => void load()}
          className="text-primary mt-4 text-sm underline underline-offset-4"
        >
          Try again
        </button>
      </div>
    );
  }

  if (state.run === null) {
    // F8 t-4: the consent gate stands at the programme door, before the invitation to begin. The
    // server refuses run creation without a recorded acceptance of the current policy version — this
    // is the UI half, so a leader meets the terms as a step rather than as a 403. Once accepted (or
    // already on file), it hands straight through to the entry.
    if (!consented) {
      return <ConsentGate onAccepted={handleConsented} />;
    }
    // F9 t-1: a returning leader sees where they have been before being invited to begin again.
    // `TrendLines` renders nothing until there are two completed audits to compare, so a first-time
    // leader's page is unchanged.
    // `TrendLines` returns null until there are two audits with something to plot, and it carries its
    // own wrapper so a first-time leader's page has no empty container in it either.
    return (
      <>
        <TrendLines />
        <BeginAudit onStarted={() => void load()} />
      </>
    );
  }

  const currentIndex = Math.max(
    0,
    state.phases.findIndex((p) => p.key === state.currentPhaseKey)
  );
  const currentPhase = state.phases[currentIndex];

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:py-14">
      <header className="mb-12">
        <p className="text-primary text-[0.72rem] font-medium tracking-[0.24em] uppercase">
          Reclaim your week
        </p>
        <h1 className="text-foreground mt-4 text-3xl leading-tight font-light sm:text-4xl">
          Your audit
        </h1>
      </header>

      <div className="grid gap-x-14 gap-y-12 md:grid-cols-[15rem_1fr]">
        <aside className="md:pt-1">
          <PhaseRail phases={state.phases} currentPhaseKey={state.currentPhaseKey} />
        </aside>

        <main className="min-w-0 space-y-9">
          <Signpost
            phaseKey={currentPhase.key}
            index={currentIndex}
            label={currentPhase.label}
            signposts={signposts ?? undefined}
          />
          {phaseMode === 'conversation' && currentPhase.key !== FINAL_PHASE_KEY ? (
            <PhaseConversation
              runId={state.run.id}
              phaseKey={currentPhase.key}
              conversationId={state.run.conversationId}
              coachOpenings={state.run.coachOpenings}
              onAdvanced={() => void load()}
              onSwitchToForm={() => setPhaseMode('form')}
            />
          ) : (
            <div className="space-y-9">
              <PhaseContent
                phaseKey={currentPhase.key}
                runId={state.run.id}
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
          )}
        </main>
      </div>
    </div>
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
  coachOpenings,
  onAdvanced,
}: {
  phaseKey: string;
  runId: string;
  /** Phase 1 needs it for the reveal beat (I12); the other panels have no moments. */
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
      return <Phase6Panel runId={runId} onAdvanced={onAdvanced} />;
    default:
      return (
        <p className="text-muted-foreground text-sm leading-relaxed">
          This part of the audit is not available just now.
        </p>
      );
  }
}
