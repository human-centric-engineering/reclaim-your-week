'use client';

/**
 * Phase 5 — the action plan (F7 t-3). One or two specific things to start, each with what / when / what
 * you'll stop / how you'll know it worked, and the "**do you want to, or think you should?**" question
 * (`reclaim_action_wanted_not_dutiful`, Brief §5, I16). Opens with the **journey framing** verbatim
 * (§8, I11) — a journey, not a makeover. Reflection `p5` (I9).
 */

import { useState } from 'react';
import { RECLAIM_JOURNEY_FRAMING, RECLAIM_FORWARD_CLOSE } from '@/lib/app/programme/content';
import { Reflection } from '@/components/app/reclaim/phase/reflection';
import { TextAreaField } from '@/components/app/reclaim/phase/fields';
import { AdvanceControls } from '@/components/app/reclaim/phase/advance-controls';
import { type AnswerInput } from '@/components/app/reclaim/phase/actions';

export function Phase5Panel({ runId, onAdvanced }: { runId: string; onAdvanced: () => void }) {
  const [chosen, setChosen] = useState('');
  const [when, setWhen] = useState('');
  const [stopping, setStopping] = useState('');
  const [howKnown, setHowKnown] = useState('');
  const [wantedNotDutiful, setWantedNotDutiful] = useState('');
  const [reflection, setReflection] = useState('');

  const answers = (): AnswerInput[] => {
    const out: AnswerInput[] = [];
    const text = (slug: string, v: string) => {
      if (v.trim()) out.push({ slotSlug: slug, value: v.trim() });
    };
    text('reclaim_action_chosen', chosen);
    text('reclaim_action_when', when);
    text('reclaim_action_stopping', stopping);
    text('reclaim_action_how_known', howKnown);
    text('reclaim_action_wanted_not_dutiful', wantedNotDutiful);
    out.push({ slotSlug: 'reclaim_reflection_p5', value: reflection.trim() });
    return out;
  };

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-foreground text-2xl font-light">One or two things to start</h2>
        <p className="text-foreground text-[1.02rem] leading-relaxed">{RECLAIM_JOURNEY_FRAMING}</p>
      </div>

      <TextAreaField
        id="action-chosen"
        label="What is the one thing you will do?"
        value={chosen}
        onChange={setChosen}
        rows={2}
        help="Specific and small enough to actually hold."
      />
      <TextAreaField
        id="action-when"
        label="When will you start?"
        value={when}
        onChange={setWhen}
        rows={2}
      />
      <TextAreaField
        id="action-stop"
        label="What will you say no to, or stop, to make room for it?"
        value={stopping}
        onChange={setStopping}
        rows={2}
      />
      <TextAreaField
        id="action-known"
        label="How will you know it worked?"
        value={howKnown}
        onChange={setHowKnown}
        rows={2}
      />
      <TextAreaField
        id="action-wanted"
        label="One honest question: is this something you want to do, or something you think you should?"
        value={wantedNotDutiful}
        onChange={setWantedNotDutiful}
        rows={2}
        help="Change you actually want tends to be the change that sticks (I16)."
      />

      <p className="text-foreground border-primary/30 border-l-2 pl-4 leading-relaxed">
        {RECLAIM_FORWARD_CLOSE}
      </p>

      <Reflection
        value={reflection}
        onChange={setReflection}
        prompt="What are you taking away from this?"
      />
      <AdvanceControls
        runId={runId}
        fromPhase="phase-5-action"
        answers={answers}
        canAdvance={reflection.trim().length > 0}
        onAdvanced={onAdvanced}
        label="Continue to your summary"
      />
    </div>
  );
}
