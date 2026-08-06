'use client';

/**
 * Section 6 — the last question, and then the report.
 *
 * Two states, and the boundary between them is the point of this file.
 *
 * ## Before: one question, asked in the conversation
 *
 * The audit asks "what are you taking away from this?" before it produces anything
 * (`Prompt_Text.md:35`), and it asks it the way it has asked everything else — the coach asks, the
 * leader answers. There is no field, here or on any other section.
 *
 * **The answer releases the report, not the recording of it.** The coach is asked to write the
 * takeaway to `reclaim_reflection_p6`, and that write can fail in ways that have nothing to do with
 * the leader: a refused write, a throttled turn, a model that answers a hard sentence warmly without
 * deciding it was a takeaway. When the slot was the gate, those failures left a leader being asked
 * the last question of their audit over and over with the finished thing behind it. So the gate is
 * `answered` — read from this section's own window of the transcript, so it survives a reload.
 *
 * ## After: the conversation is gone from the screen
 *
 * Not hidden, not scrolled past. **Gone.** This used to keep a second `CoachChat` under the report
 * for the warm close, which meant the screen still had a composer on it, still invited another turn,
 * and still looked like the middle of something. A leader who has been handed the document the whole
 * audit was for should be looking at the document, not at a text box asking what else they would
 * like to say. The coach's closing words are the last thing it says in the beat above; the report is
 * what comes after, and it is the whole screen.
 *
 * What is left is the artifact and the four honest things to do with it, each in its own component
 * and each explaining itself: keep it (`report-actions.tsx`), share it with Rashmir
 * (`share-with-coach.tsx`), pass it on (`ReferralInvite`), finish (`finish-audit.tsx`).
 *
 * Finishing completes the run (I15). The consultation offer and the closing affirmation appear once,
 * after that.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  RECLAIM_CLOSING_AFFIRMATION,
  RECLAIM_CONSULTATION_EMAIL,
} from '@/lib/app/programme/content';
import { SummaryView } from '@/components/app/reclaim/summary/summary-view';
import { CoachChat } from '@/components/app/reclaim/coach-chat';
import { ReferralInvite } from '@/components/app/reclaim/referral-invite';
import { ReportActions } from '@/components/app/reclaim/report/report-actions';
import { ShareWithCoach } from '@/components/app/reclaim/report/share-with-coach';
import { FinishAudit } from '@/components/app/reclaim/report/finish-audit';
import { fetchSummary, readAnswers } from '@/components/app/reclaim/phase/actions';
import type { AuditSummary } from '@/components/app/reclaim/summary/types';
import { FINAL_PHASE_KEY } from '@/lib/app/programme/runs/phases';
import { loadTranscript } from '@/components/app/reclaim/coach/transcript';
import { phaseWindow, sliceByWindow, type PhaseMarks } from '@/lib/app/programme/runs/phase-marks';

export function Phase6Panel({
  runId,
  conversationId,
  coachOpenings,
  phaseMarks,
  onAdvanced,
}: {
  runId: string;
  /** The run's transcript, so the last question continues the conversation rather than starting one. */
  conversationId: string | null;
  coachOpenings: string[];
  /**
   * Where this phase's part of the run's one conversation begins.
   *
   * The conversation below is cut to it, and until it was, this was the one screen in the audit that
   * drew the whole transcript: the last question arrived underneath forty minutes of everything that
   * led to it, so the leader met their own audit replayed back at them and had to find the question
   * in it.
   */
  phaseMarks: PhaseMarks;
  onAdvanced: () => void;
}) {
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  /**
   * The takeaway, as recorded. `null` while unread, `''` when there is none.
   *
   * No longer the gate (see the header) — the sharing panel quotes it, and that is now its whole
   * job. Re-read after every turn, because the coach is what records it.
   */
  const [takeawayValue, setTakeawayValue] = useState<string | null>(null);
  /**
   * Whether the leader has answered the last question, read from the transcript rather than a slot.
   *
   * `null` until read, so the gate does not flash a conversation at someone who has already finished
   * with it.
   */
  const [answered, setAnswered] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    void fetchSummary(runId)
      .then(setSummary)
      .catch(() => setFailed(true));
  }, [runId]);

  const refreshTakeaway = useCallback(async () => {
    try {
      const answers = await readAnswers(runId);
      setTakeawayValue(answers['reclaim_reflection_p6']?.value ?? '');
    } catch {
      setTakeawayValue('');
    }
  }, [runId]);

  useEffect(() => {
    void refreshTakeaway();
  }, [refreshTakeaway]);

  // Cut to this section's own window, for the same reason the conversation below is: an answer given
  // in section 3 is not an answer to the question section 6 asked. A run with no conversation cannot
  // have been answered, and a transcript that will not load reads as unanswered — the coach is then
  // still there to ask, which is the safe way round.
  const refreshAnswered = useCallback(async () => {
    if (conversationId === null) {
      setAnswered(false);
      return;
    }
    const messages = await loadTranscript(conversationId);
    const section = sliceByWindow(messages, phaseWindow(phaseMarks, FINAL_PHASE_KEY));
    setAnswered(section.some((m) => m.role === 'leader' && !m.synthetic));
  }, [conversationId, phaseMarks]);

  useEffect(() => {
    void refreshAnswered();
  }, [refreshAnswered]);

  if (failed) {
    return <p className="text-muted-foreground text-sm">We could not load your report just now.</p>;
  }

  // All three reads, not just the summary: the gate turns on them, and resolving it in stages would
  // show the conversation for a moment to somebody who had already finished with it.
  if (summary === null || takeawayValue === null || answered === null) {
    return <p className="text-muted-foreground text-sm tracking-wide">Gathering your report…</p>;
  }

  if (finished) {
    return (
      <div className="mx-auto max-w-xl space-y-8 py-10 text-center">
        <p className="text-foreground text-xl leading-relaxed font-light">
          {RECLAIM_CLOSING_AFFIRMATION}
        </p>
        <p className="text-muted-foreground text-sm leading-relaxed">
          If a 30-minute conversation would help you take this further, you can reach Rashmir at{' '}
          <a
            href={`mailto:${RECLAIM_CONSULTATION_EMAIL}`}
            className="text-primary underline underline-offset-4"
          >
            {RECLAIM_CONSULTATION_EMAIL}
          </a>
          . No pressure. The work is yours.
        </p>
        <button
          type="button"
          onClick={onAdvanced}
          className="text-primary text-sm underline underline-offset-4"
        >
          Back to your audit
        </button>
      </div>
    );
  }

  // The one question. The conversation is the only route to this answer, and the turn the leader
  // answers in is the turn that opens the report.
  if (!answered) {
    return (
      <CoachChat
        runId={runId}
        conversationId={conversationId}
        openMoment={coachOpenings.includes('phase-6-open') ? null : 'phase-6-open'}
        phaseKey={FINAL_PHASE_KEY}
        phaseMarks={phaseMarks}
        onTurnComplete={() => {
          void refreshTakeaway();
          void refreshAnswered();
          onAdvanced();
        }}
        className="border-border/60 h-[26rem] rounded-2xl border"
      />
    );
  }

  return (
    /*
     * The arrival. One staggered reveal rather than scattered micro-animations: the report is a
     * thing that appears at the end of forty minutes, and it should look like it arrived rather than
     * like it was already there. The keyframes are in `app/brand-theme.css` (the leaf's stylesheet),
     * opacity and transform only so nothing reflows, and off entirely under reduced motion.
     */
    <div className="space-y-14">
      <div className="ryw-rise">
        <SummaryView summary={summary} />
      </div>

      <div className="mx-auto max-w-3xl space-y-12">
        <div className="ryw-rise ryw-rise-2 border-border/70 border-t pt-10">
          <ReportActions runId={runId} />
        </div>

        <div className="ryw-rise ryw-rise-3">
          <ShareWithCoach runId={runId} takeaway={takeawayValue} />
        </div>

        {/* F8 t-3. After the sharing choice and before finishing: the one moment the leader has just
            seen what the audit gave them. Collapsed by default — an invitation, not a nag (I16). */}
        <div className="ryw-rise ryw-rise-4">
          <ReferralInvite />
        </div>

        <div className="ryw-rise ryw-rise-4">
          <FinishAudit runId={runId} onFinished={() => setFinished(true)} />
        </div>
      </div>
    </div>
  );
}
