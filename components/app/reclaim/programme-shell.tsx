'use client';

/**
 * The programme shell (F4 t-4) — the frame that holds a run: the seven-phase spine, the signpost for
 * where the leader is, and the coach conversation. Loads the current run + progress in one enriched
 * read (`GET /runs/current`) and resumes there. Shell only — no phase content (F6/F7).
 */

import { useCallback, useEffect, useState } from 'react';
import { currentRunStateSchema, type CurrentRunState } from '@/components/app/reclaim/types';
import { PhaseRail } from '@/components/app/reclaim/phase-rail';
import { Signpost } from '@/components/app/reclaim/signpost';
import { CoachChat } from '@/components/app/reclaim/coach-chat';
import { BeginAudit } from '@/components/app/reclaim/begin-audit';

export function ProgrammeShell() {
  const [state, setState] = useState<CurrentRunState | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

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
    return <BeginAudit onStarted={() => void load()} />;
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
          <CoachChat />
        </main>
      </div>
    </div>
  );
}
