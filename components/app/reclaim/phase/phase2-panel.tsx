'use client';

/**
 * Phase 2 — energy (F7 t-1). Two questions (§8): when they are at their best, and whether the schedule
 * protects or consumes that window. Ends with the required reflection `reclaim_reflection_p2` (I9).
 *
 * ## The coaching signal that used to render here (open item 11, decided 2026-07-26: no)
 *
 * A config toggle once put `RECLAIM_PHASE2_COACHING_SIGNAL` on this screen. It is gone, and both
 * halves of that are decisions.
 *
 * **Not here**, because Brief §2 says consultation offers appear "at the end and in follow-up, never
 * mid-process" and Phase 2 is mid-process. The source system prompt says the opposite; the Brief is
 * later and `sources/README.md` gives it precedence. Phase 6 already carries the one offer, so the
 * product is not silent about coaching, only about coaching *here*.
 *
 * **Not behind a toggle either**, because the string is facilitator instruction voice: "Where useful,
 * signal that a dedicated coaching conversation with Rashmir can go much further here" is addressed
 * to whoever runs the audit, telling them to signal something. Shown to a leader it reads as leaked
 * prompt. There is no configuration in which rendering it is correct, so leaving a switch would have
 * preserved only the ability to ship broken copy.
 *
 * Rashmir's sentence is untouched in `lib/app/programme/content.ts` and still guarded verbatim.
 * Bringing the signal back means authoring a leader-facing line with her.
 */

import { useState } from 'react';
import { Reflection } from '@/components/app/reclaim/phase/reflection';
import { TextAreaField } from '@/components/app/reclaim/phase/fields';
import { AdvanceControls } from '@/components/app/reclaim/phase/advance-controls';
import { type AnswerInput } from '@/components/app/reclaim/phase/actions';

export function Phase2Panel({ runId, onAdvanced }: { runId: string; onAdvanced: () => void }) {
  const [peak, setPeak] = useState('');
  const [protectedWindow, setProtectedWindow] = useState('');
  const [reflection, setReflection] = useState('');

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
        label="When in the day or week are you at your best, most focused, creative, and energised?"
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
