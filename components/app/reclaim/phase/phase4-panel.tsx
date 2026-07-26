'use client';

/**
 * Phase 4 — gap analysis (F7 t-2). The **refer-back** (I13): the leader's own Phase 0 words return
 * verbatim, read from slot data (not "remembered"). Names the absence (the priority-gap), offers the
 * **under-delegation invitation** verbatim (I11, an invitation not a diagnosis — I16), the **hours
 * question at 55+**, the **strategy mirror** (config-gated, open item 10), and the **once-per-audit
 * permission-based challenge** guarded by `reclaim_gap_challenge_offered`. Reflection `p4` (I9).
 */

import { useEffect, useMemo, useState } from 'react';
import {
  RECLAIM_UNDER_DELEGATION_INVITATION,
  RECLAIM_STRATEGY_MIRROR,
} from '@/lib/app/programme/content';
import { buildChartData, truthy, type Answers } from '@/lib/app/programme/chart/series';
import { Reflection } from '@/components/app/reclaim/phase/reflection';
import { TextAreaField } from '@/components/app/reclaim/phase/fields';
import { AdvanceControls } from '@/components/app/reclaim/phase/advance-controls';
import {
  readAnswers,
  type AnswerInput,
  type RunAnswers,
} from '@/components/app/reclaim/phase/actions';
import { fetchUiConfig } from '@/components/app/reclaim/phase/config';

const HOURS_55_NOTE =
  'You are running at a high number of hours. The goal here is not only to reallocate time but to reclaim a sustainable way of working. Sometimes the most strategic thing a leader can do is stop.';

export function Phase4Panel({ runId, onAdvanced }: { runId: string; onAdvanced: () => void }) {
  const [base, setBase] = useState<RunAnswers>({});
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [strategyMirrorOn, setStrategyMirrorOn] = useState(false);
  const [challengeResponse, setChallengeResponse] = useState('');
  const [strategyMirror, setStrategyMirror] = useState('');
  const [unfunded, setUnfunded] = useState('');
  const [reflection, setReflection] = useState('');

  useEffect(() => {
    void readAnswers(runId)
      .then((a) => {
        setBase(a);
        setLoaded(true);
      })
      .catch(() => setFailed(true));
    void fetchUiConfig().then((c) => setStrategyMirrorOn(c.strategyMirror));
  }, [runId]);

  const keepingMeUp = base['reclaim_setup_keeping_me_up']?.value ?? null;
  const whyNow = base['reclaim_setup_why_now']?.value ?? null;
  const weeklyHours = Number(base['reclaim_setup_weekly_hours']?.value ?? '');
  const highHours = Number.isFinite(weeklyHours) && weeklyHours >= 55;
  // The challenge is offered once per audit — suppressed if the guard slot is already set.
  const challengeAlreadyOffered = truthy(base['reclaim_gap_challenge_offered']);

  const unallocated = useMemo(() => buildChartData(base as Answers).unallocated, [base]);

  const answers = (): AnswerInput[] => {
    const out: AnswerInput[] = [];
    if (unfunded.trim())
      out.push({ slotSlug: 'reclaim_gap_unfunded_priorities', value: unfunded.trim() });
    if (!challengeAlreadyOffered) {
      // Mark the challenge as offered so it never fires again this audit (I16).
      out.push({ slotSlug: 'reclaim_gap_challenge_offered', value: 'Yes', valueJson: true });
      if (challengeResponse.trim())
        out.push({ slotSlug: 'reclaim_gap_challenge_response', value: challengeResponse.trim() });
    }
    if (strategyMirrorOn && strategyMirror.trim())
      out.push({ slotSlug: 'reclaim_gap_strategy_mirror', value: strategyMirror.trim() });
    out.push({ slotSlug: 'reclaim_reflection_p4', value: reflection.trim() });
    return out;
  };

  // Gate on the load: the refer-back, the unallocated list, and the once-per-audit challenge guard
  // all read `base`. Rendering before it arrives (or after it failed) would show a false picture —
  // and could re-fire the challenge that was already offered (I16).
  if (failed) {
    return (
      <p className="text-muted-foreground text-sm">
        We could not load this phase just now. Please refresh to try again.
      </p>
    );
  }
  if (!loaded) {
    return <p className="text-muted-foreground text-sm tracking-wide">Loading the gaps…</p>;
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h2 className="text-foreground text-2xl font-light">The gaps</h2>
        <p className="text-muted-foreground text-[1.02rem] leading-relaxed">
          The distance between the week you have and the one you pictured, and what it might be
          pointing to.
        </p>
      </div>

      {/* The refer-back (I13) — the leader's own words, verbatim from setup. */}
      {(keepingMeUp || whyNow) && (
        <section className="bg-muted rounded-2xl px-6 py-5">
          <p className="text-muted-foreground text-[0.7rem] font-medium tracking-[0.2em] uppercase">
            When we started, you said
          </p>
          {keepingMeUp && (
            <p className="text-foreground mt-3 leading-relaxed">
              What keeps you up at night: <span className="italic">“{keepingMeUp}”</span>
            </p>
          )}
          {whyNow && (
            <p className="text-foreground mt-2 leading-relaxed">
              Why now: <span className="italic">“{whyNow}”</span>
            </p>
          )}
          <p className="text-muted-foreground mt-3 text-sm">
            Worth holding that next to what the week shows.
          </p>
        </section>
      )}

      {unallocated.length > 0 && (
        <TextAreaField
          id="unfunded"
          label={`Areas with no protected time this period: ${unallocated.join(', ')}. Which of your priorities sits in one of them?`}
          value={unfunded}
          onChange={setUnfunded}
          rows={2}
        />
      )}

      {highHours && (
        <p className="text-foreground border-primary/40 bg-muted/40 rounded-xl border-l-2 px-5 py-4 text-sm leading-relaxed">
          {HOURS_55_NOTE}
        </p>
      )}

      {/* The under-delegation invitation — verbatim (I11), an invitation not a diagnosis (I16). */}
      <p className="text-foreground text-[1.02rem] leading-relaxed">
        {RECLAIM_UNDER_DELEGATION_INVITATION}
      </p>

      {!challengeAlreadyOffered && (
        <TextAreaField
          id="challenge"
          label="If you are open to it: what would it take to let go of some of this, and lead more through others?"
          value={challengeResponse}
          onChange={setChallengeResponse}
          rows={2}
          help="Only if you would like to sit with it. There is no right answer."
        />
      )}

      {strategyMirrorOn && (
        <TextAreaField
          id="strategy-mirror"
          label={RECLAIM_STRATEGY_MIRROR}
          value={strategyMirror}
          onChange={setStrategyMirror}
          rows={2}
        />
      )}

      <Reflection value={reflection} onChange={setReflection} prompt="What are you noticing?" />
      <AdvanceControls
        runId={runId}
        fromPhase="phase-4-gap"
        answers={answers}
        canAdvance={reflection.trim().length > 0}
        onAdvanced={onAdvanced}
      />
    </div>
  );
}
