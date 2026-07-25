'use client';

/**
 * Phase 2 — energy (F7 t-1). Two questions (§8): when they are at their best, and whether the schedule
 * protects or consumes that window; plus the team-distribution brainstorm where useful. The Phase 2
 * **coaching signal** (open item 11) renders only when the coach-editable config toggle is on
 * (default off, Rashmir's call). Ends with the required reflection `reclaim_reflection_p2` (I9).
 */

import { useEffect, useState } from 'react';
import { RECLAIM_PHASE2_COACHING_SIGNAL } from '@/lib/app/programme/content';
import { Reflection } from '@/components/app/reclaim/phase/reflection';
import { TextAreaField } from '@/components/app/reclaim/phase/fields';
import { AdvanceControls } from '@/components/app/reclaim/phase/advance-controls';
import { type AnswerInput } from '@/components/app/reclaim/phase/actions';
import { fetchUiConfig } from '@/components/app/reclaim/phase/config';

export function Phase2Panel({ runId, onAdvanced }: { runId: string; onAdvanced: () => void }) {
  const [peak, setPeak] = useState('');
  const [protectedWindow, setProtectedWindow] = useState('');
  const [reflection, setReflection] = useState('');
  const [coachingSignal, setCoachingSignal] = useState(false);

  useEffect(() => {
    void fetchUiConfig().then((c) => setCoachingSignal(c.phase2CoachingSignal));
  }, []);

  const answers = (): AnswerInput[] => {
    const out: AnswerInput[] = [];
    if (peak.trim()) out.push({ slotSlug: 'reclaim_energy_peak_description', value: peak.trim() });
    if (protectedWindow.trim())
      out.push({ slotSlug: 'reclaim_energy_protected', value: protectedWindow.trim() });
    out.push({ slotSlug: 'reclaim_reflection_p2', value: reflection.trim() });
    return out;
  };

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-foreground text-2xl font-light">Your energy</h2>
        <p className="text-muted-foreground text-[1.02rem] leading-relaxed">
          When you do your best work matters as much as how much you do. Two questions.
        </p>
      </div>

      <TextAreaField
        id="peak"
        label="When in the day or week are you at your best — most focused, creative, and energised?"
        value={peak}
        onChange={setPeak}
        help="Your peak window. We will use it when we design your ideal week."
      />
      <TextAreaField
        id="protected"
        label="Does your current schedule protect that window, or does it consume it?"
        value={protectedWindow}
        onChange={setProtectedWindow}
      />

      {coachingSignal && (
        <p className="text-muted-foreground border-primary/40 border-l-2 pl-4 text-sm leading-relaxed">
          {RECLAIM_PHASE2_COACHING_SIGNAL}
        </p>
      )}

      <Reflection value={reflection} onChange={setReflection} />
      <AdvanceControls
        runId={runId}
        fromPhase="phase-2-energy"
        answers={answers}
        canAdvance={reflection.trim().length > 0}
        onAdvanced={onAdvanced}
      />
    </div>
  );
}
