'use client';

/**
 * The programme shell (F4 t-4) — the frame that holds a run: the seven-phase spine, the signpost for
 * where the leader is, and the coach conversation. Loads the current run + progress in one enriched
 * read (`GET /runs/current`) and resumes there. Shell only — no phase content (F6/F7).
 */

import { useCallback, useEffect, useState } from 'react';
import { currentRunStateSchema, type CurrentRunState } from '@/components/app/reclaim/types';
import { PhaseRail } from '@/components/app/reclaim/phase-rail';
import { TrendLines } from '@/components/app/reclaim/repeat/trend-lines';
import { Signpost } from '@/components/app/reclaim/signpost';
import { CoachChat } from '@/components/app/reclaim/coach-chat';
import { BeginAudit } from '@/components/app/reclaim/begin-audit';
import { ConsentGate } from '@/components/app/reclaim/consent-gate';
import { SetupPanel } from '@/components/app/reclaim/phase/setup-panel';
import { Phase1Panel } from '@/components/app/reclaim/phase/phase1-panel';
import { Phase2Panel } from '@/components/app/reclaim/phase/phase2-panel';
import { Phase3Panel } from '@/components/app/reclaim/phase/phase3-panel';
import { Phase4Panel } from '@/components/app/reclaim/phase/phase4-panel';
import { Phase5Panel } from '@/components/app/reclaim/phase/phase5-panel';
import { Phase6Panel } from '@/components/app/reclaim/phase/phase6-panel';

export function ProgrammeShell() {
  const [state, setState] = useState<CurrentRunState | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  /** F8 t-4: set once the leader has accepted the current policy version (or already had). */
  const [consented, setConsented] = useState(false);
  // Stable identity on purpose — `ConsentGate` takes this as an effect dependency (see the note there).
  const handleConsented = useCallback(() => setConsented(true), []);

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
          <Signpost phaseKey={currentPhase.key} index={currentIndex} label={currentPhase.label} />
          <PhaseContent
            phaseKey={currentPhase.key}
            runId={state.run.id}
            onAdvanced={() => void load()}
          />
        </main>
      </div>
    </div>
  );
}

/** Render the panel for the current phase (F6/F7); phases with no panel yet show the coach chat. */
function PhaseContent({
  phaseKey,
  runId,
  onAdvanced,
}: {
  phaseKey: string;
  runId: string;
  onAdvanced: () => void;
}) {
  switch (phaseKey) {
    case 'phase-0-setup':
      return <SetupPanel runId={runId} onAdvanced={onAdvanced} />;
    case 'phase-1-current':
      return <Phase1Panel runId={runId} onAdvanced={onAdvanced} />;
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
      return <CoachChat />;
  }
}
