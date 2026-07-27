'use client';

/**
 * A phase the leader has already finished, opened again.
 *
 * **What they came back for is the conversation.** The first cut of this screen showed the captured
 * readings instead — "deep work, hours a week: 5" — which is the audit's record of the phase, not the
 * phase. A leader going back to Current reality wants the exchange they had and the picture of their
 * week that came out of it; a list of the figures it produced is what the panel beside the live
 * conversation already shows them. So the transcript leads and the picture sits where it appeared in
 * it.
 *
 * **The readings keep their own column, on the right, exactly where the live phase puts them.** They
 * were stacked under the transcript first, which buried the foot of a conversation the leader had
 * come back to read under nineteen rows of figures — and moved the same panel to a different place
 * depending on which phase was open. A panel that is beside the conversation in one phase and below
 * it in another is two panels as far as anyone using it is concerned.
 *
 * The slice comes from `phaseMarks` on the run (`lib/app/programme/runs/phase-marks.ts`): a run has
 * one conversation across all seven phases, and without the marks there is no way to say where phase
 * 1 ended and phase 2 began.
 *
 * ## Why this is not the phase's own panel, or its conversation
 *
 * The obvious implementation is to render the form panel, or re-open the coach on that phase. Both
 * are wrong, and not subtly:
 *
 *  - **The form panel ends in "continue to the next phase"**, which calls the transition route with
 *    that phase as `fromPhase`. The route does not check the phase it is leaving is the one the run
 *    is on — it completes it and enters the next — so a leader reading phase 1 from phase 5 could
 *    press a button that walked their audit back to phase 2.
 *  - **The coach's phase comes from the server**, derived from the journey (`buildCoachScope`). A
 *    conversation opened here would be scoped to whatever phase the run is actually on, so the coach
 *    would answer about phase 5 under a phase 1 heading and record its reflection against the wrong
 *    phase.
 *
 * So this screen has no composer and no transition. It reads, and it lets a figure be corrected
 * through the run-scoped answers route (I3), which carries no phase at all.
 */

import { useCallback, useEffect, useState } from 'react';
import { buildChartData } from '@/lib/app/programme/chart/series';
import { CHART_REVEAL_PHASE, chartRevealReady } from '@/lib/app/programme/chart/reveal';
import { phaseWindow, sliceByWindow, type PhaseMarks } from '@/lib/app/programme/runs/phase-marks';
import type { PhaseSignpost } from '@/lib/app/programme/runs/signposts';
import { ReclaimChart } from '@/components/app/reclaim/chart/reclaim-chart';
import { CapturedPanel } from '@/components/app/reclaim/coach/captured-panel';
import {
  loadTranscript,
  CoachLine,
  LeaderLine,
  type TranscriptMessage,
} from '@/components/app/reclaim/coach/transcript';
import { Signpost } from '@/components/app/reclaim/signpost';
import { readAnswers, readLabels, type RunAnswers } from '@/components/app/reclaim/phase/actions';

export interface PhaseReviewProps {
  runId: string;
  phaseKey: string;
  phaseIndex: number;
  phaseLabel: string;
  signposts?: PhaseSignpost[];
  /** The run's conversation, or `null` if the leader has only ever used the forms. */
  conversationId: string | null;
  /** Where each phase's part of that conversation begins. */
  phaseMarks: PhaseMarks;
  /** Where the leader was before they came back here, for the way out. */
  returnLabel: string;
  returnIndex: number;
  onReturn: () => void;
}

export function PhaseReview({
  runId,
  phaseKey,
  phaseIndex,
  phaseLabel,
  signposts,
  conversationId,
  phaseMarks,
  returnLabel,
  returnIndex,
  onReturn,
}: PhaseReviewProps) {
  const [answers, setAnswers] = useState<RunAnswers>({});
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<TranscriptMessage[] | null>(null);
  /** The captured panel, on a screen too narrow to keep it beside the conversation. */
  const [panelOpen, setPanelOpen] = useState(false);

  const refresh = useCallback(async () => {
    const [loaded, bucketLabels] = await Promise.all([
      readAnswers(runId).catch((): RunAnswers => ({})),
      readLabels(),
    ]);
    setAnswers(loaded);
    setLabels(bucketLabels);
  }, [runId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (conversationId === null) {
      setMessages([]);
      return;
    }
    void loadTranscript(conversationId).then(setMessages);
  }, [conversationId]);

  const turns = messages === null ? [] : sliceByWindow(messages, phaseWindow(phaseMarks, phaseKey));

  // The picture belongs to phase 1 and only exists once the week was whole (I12). It is drawn from
  // the answers as they stand now, so a figure corrected below is reflected here — this is the same
  // chart, not a snapshot of one.
  const chart =
    phaseKey === CHART_REVEAL_PHASE && chartRevealReady(answers)
      ? buildChartData(answers, labels)
      : null;
  // Where the leader pressed "show me where the week is going": the synthetic trigger marks the spot.
  // Absent (an older run, or the form path) puts the picture at the end of the phase rather than
  // nowhere.
  const revealAt = turns.findIndex((m) => m.synthetic);

  const picture =
    chart === null ? null : (
      <div className="border-border/70 rounded-2xl border px-4 py-5 sm:px-6">
        <ReclaimChart data={chart} />
      </div>
    );

  // What was recorded, in its own column beside the conversation — the same shape and the same width
  // as the live phase (`phase-conversation.tsx`). It had been stacked under the transcript, which put
  // nineteen readings between the leader and the foot of a conversation they came back to read, and
  // made the same panel land in two different places depending on which phase they were looking at.
  const panel = (
    <CapturedPanel
      runId={runId}
      phaseKey={phaseKey}
      answers={answers}
      bucketLabels={labels}
      onSaved={() => void refresh()}
    />
  );

  return (
    <div className="flex min-h-0 flex-1">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-8 px-4 py-10 sm:px-6">
          {/* The way back sits above everything, because it is the one thing this screen is certain
              to be wanted for. Named rather than "back", so it says where it goes. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <button
              type="button"
              onClick={onReturn}
              className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-4"
            >
              Back to phase {returnIndex}, {returnLabel}
            </button>
            {/* The panel has no column of its own below `xl`, so it is one tap away instead. */}
            <button
              type="button"
              onClick={() => setPanelOpen(true)}
              className="text-muted-foreground hover:text-foreground ml-auto text-xs underline underline-offset-4 xl:hidden"
            >
              What the coach noted
            </button>
          </div>

          <Signpost
            phaseKey={phaseKey}
            index={phaseIndex}
            label={phaseLabel}
            signposts={signposts}
          />

          <p className="text-muted-foreground text-sm leading-relaxed">
            This part is behind you, and nothing here moves your audit.
          </p>

          <div className="space-y-6">
            {messages === null ? (
              <p className="text-muted-foreground text-sm">
                Finding this part of the conversation…
              </p>
            ) : turns.length === 0 ? (
              <p className="text-muted-foreground text-sm leading-relaxed">
                There is no conversation recorded for this part. You filled it in yourself, or it
                was before the coach was part of the audit.
              </p>
            ) : (
              turns.map((turn, i) => (
                <div key={turn.id} className="space-y-6">
                  {/* The trigger itself is never shown: it is ours, not something they said. Its
                      place in the conversation is, because that is where they asked to see their
                      week. */}
                  {!turn.synthetic &&
                    (turn.role === 'leader' ? (
                      <LeaderLine text={turn.text} />
                    ) : (
                      <CoachLine text={turn.text} />
                    ))}
                  {i === revealAt && picture}
                </div>
              ))
            )}
            {/* Nothing marked the reveal, so the picture goes at the foot of the phase it belongs
                to. */}
            {revealAt === -1 && picture}
          </div>

          <button
            type="button"
            onClick={onReturn}
            className="bg-primary text-primary-foreground rounded-full px-8 py-3 text-[0.95rem] font-medium"
          >
            Back to phase {returnIndex}, {returnLabel}
          </button>
        </div>
      </div>

      <aside className="border-border/60 hidden w-80 shrink-0 overflow-y-auto border-l px-5 py-6 xl:block">
        {panel}
      </aside>

      {panelOpen && (
        <div className="fixed inset-0 z-50 flex justify-end xl:hidden">
          <button
            type="button"
            aria-label="Close what the coach has noted"
            onClick={() => setPanelOpen(false)}
            className="bg-foreground/20 absolute inset-0"
          />
          <div className="bg-background border-border/60 relative flex w-[min(22rem,90vw)] flex-col overflow-y-auto border-l px-5 py-6">
            <button
              type="button"
              onClick={() => setPanelOpen(false)}
              className="text-muted-foreground hover:text-foreground mb-4 self-end text-xs underline underline-offset-4"
            >
              Close
            </button>
            {panel}
          </div>
        </div>
      )}
    </div>
  );
}
