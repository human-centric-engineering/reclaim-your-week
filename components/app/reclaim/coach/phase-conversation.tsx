'use client';

/**
 * A phase, done as a conversation.
 *
 * The source prompt is unambiguous about what this tool is: "Work through the following phases in
 * order. Do not rush. This should feel like a coaching conversation, not a form." What shipped was
 * seven forms, and the coach was rendered nowhere. This is the surface that closes that gap.
 *
 * Three parts, and the division between them is the invariant, not the layout:
 *
 *  - **The conversation** captures the phase's readings. The coach writes them silently through
 *    `record_answers` as it goes, taking the run from the server-issued scope (I6).
 *  - **The panel** shows what has been recorded, and offers back anything the coach inferred rather
 *    than was told, so an inference cannot become part of the audit unseen.
 *  - **The reflection and the move onward stay with the leader.** The coach may ask what they notice
 *    and offer their words back; it may not record the reflection and it holds no transition
 *    capability. The server enforces both (I9, and the ungranted `request_transition`), and this is
 *    the UI half: the leader writes the reflection and presses the button.
 *
 * The form panels are not replaced. A leader who would rather fill in fields can switch, and the two
 * paths write the same slots through the same server path (I3), so switching mid-phase keeps
 * everything already captured.
 */

import { useCallback, useEffect, useState } from 'react';
import { buildChartData } from '@/lib/app/programme/chart/series';
import {
  CHART_REVEAL_MOMENT,
  CHART_REVEAL_PHASE,
  chartRevealState,
} from '@/lib/app/programme/chart/reveal';
import type { CoachOpeningMoment } from '@/lib/app/programme/coach/opening';
import { phaseCaptureSlots } from '@/lib/app/programme/coach/phase-slots';
import { reflectionSlugForLeaving } from '@/lib/app/programme/runs/phases';
import { ReclaimChart } from '@/components/app/reclaim/chart/reclaim-chart';
import { CoachChat } from '@/components/app/reclaim/coach-chat';
import { CapturedPanel } from '@/components/app/reclaim/coach/captured-panel';
import { Reflection } from '@/components/app/reclaim/phase/reflection';
import {
  advancePhase,
  readAnswers,
  readLabels,
  saveAnswer,
  type RunAnswers,
} from '@/components/app/reclaim/phase/actions';

/**
 * Which moment, if any, the coach should open here.
 *
 * The three data moments each have their own trigger, and they differ in kind. Phase 4 and phase 5
 * open as soon as the leader arrives, because the figures they need are already captured. Phase 1's
 * waits for the leader to ask, because the whole point of that beat is that they choose when to look
 * (I12, I16 — the decision stays with them).
 *
 * A moment already in the run's ledger returns `null`, so a reload never replays a beat.
 */
function openMomentFor(
  phaseKey: string,
  coachOpenings: string[],
  revealing: boolean
): CoachOpeningMoment | null {
  const due: CoachOpeningMoment | null =
    phaseKey === CHART_REVEAL_PHASE
      ? revealing
        ? CHART_REVEAL_MOMENT
        : null
      : phaseKey === 'phase-4-gap'
        ? 'phase-4-gap'
        : phaseKey === 'phase-5-action'
          ? 'phase-5-action'
          : null;
  if (due === null || coachOpenings.includes(due)) return null;
  return due;
}

export interface PhaseConversationProps {
  runId: string;
  phaseKey: string;
  /** The run's conversation, or `null` until the first turn opens one. */
  conversationId: string | null;
  /** The coach-opening moments this run has already had, so none is replayed on a reload. */
  coachOpenings: string[];
  /** Re-read the run state after the phase advances, or after a moment fires. */
  onAdvanced: () => void;
  /** Switch this phase to its form panel. */
  onSwitchToForm: () => void;
}

export function PhaseConversation({
  runId,
  phaseKey,
  conversationId,
  coachOpenings,
  onAdvanced,
  onSwitchToForm,
}: PhaseConversationProps) {
  const [answers, setAnswers] = useState<RunAnswers>({});
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [reflection, setReflection] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Set when the leader asks to see their week. Held here rather than derived, because the run's
   * ledger only catches up on the next `GET /runs/current` and the beat has to start the moment they
   * press the button.
   */
  const [revealing, setRevealing] = useState(false);

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

  const reflectionSlug = reflectionSlugForLeaving(phaseKey);
  const captureSlots = phaseCaptureSlots(phaseKey);
  const capturedCount = captureSlots.filter((s) => answers[s.slug] !== undefined).length;

  // I12, the reveal as an event rather than a running total. `revealing` folds in the click that has
  // not yet reached the run's ledger, so the chart and the coach's beat start together.
  const revealState =
    phaseKey === CHART_REVEAL_PHASE ? chartRevealState(answers, coachOpenings) : null;
  const revealed = revealState === 'revealed' || (revealState === 'ready' && revealing);

  // A leader who has said nothing yet has nothing to move on from, so the button waits rather than
  // letting them skip a phase they have not had. Both gates are the server's (I9 for the reflection,
  // I12 for the reveal); this only avoids offering a move that would be refused.
  const canAdvance =
    capturedCount > 0 &&
    (reflectionSlug === null || reflection.trim().length > 0) &&
    (revealState === null || revealed);

  const advance = async () => {
    setBusy(true);
    setError(null);
    try {
      if (reflectionSlug !== null) {
        await saveAnswer(runId, { slotSlug: reflectionSlug, value: reflection.trim() });
      }
      const advanced = await advancePhase(runId, phaseKey);
      if (!advanced.ok) {
        throw new Error(
          advanced.reflectionRequired
            ? 'A reflection is needed before moving on.'
            : advanced.chartRevealRequired
              ? 'Have a look at the shape of your week before moving on.'
              : (advanced.message ?? 'We could not move on just now.')
        );
      }
      onAdvanced();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setBusy(false);
    }
  };

  const chart = revealed ? buildChartData(answers, labels) : null;

  // The moment the coach opens, or `null` for a phase the leader leads. Only a moment that is due and
  // absent from the run's ledger is passed down, so the common case never troubles the server.
  const openMoment = openMomentFor(phaseKey, coachOpenings, revealing);

  return (
    <div className="space-y-10">
      <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[1fr_17rem]">
        <CoachChat
          runId={runId}
          conversationId={conversationId}
          openMoment={openMoment}
          onTurnComplete={() => {
            void refresh();
            // The run's ledger has moved if a moment just fired; re-reading it is what stops the
            // moment being offered again on the next render.
            onAdvanced();
          }}
        />
        <div className="space-y-6">
          <CapturedPanel
            runId={runId}
            phaseKey={phaseKey}
            answers={answers}
            bucketLabels={labels}
            onSaved={() => void refresh()}
          />
          <button
            type="button"
            onClick={onSwitchToForm}
            className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-4"
          >
            I would rather fill this in myself
          </button>
        </div>
      </div>

      {/*
        I12 — the picture and its interpretation are separate beats.

        Until every area has a figure there is nothing whole to show. Once there is, the leader asks
        for it, and what they get is the chart on its own: no summary beside it, no reading of what it
        means. The coach's turn then names the gaps in figures and asks one question, and stops. This
        used to draw itself the instant one reading landed, which meant the leader met their week one
        bar at a time and there was no reveal left to have.
      */}
      {revealState === 'ready' && !revealing && (
        <div className="border-border/70 border-t pt-8">
          <p className="text-foreground text-[1.02rem] leading-relaxed text-balance">
            That is every area accounted for. Whenever you are ready, we can look at the shape of
            the week you have described.
          </p>
          <button
            type="button"
            onClick={() => setRevealing(true)}
            className="bg-primary text-primary-foreground mt-5 rounded-full px-8 py-3 text-[0.95rem] font-medium"
          >
            Show me where the week is going
          </button>
        </div>
      )}

      {chart !== null && (
        <div className="border-border/70 border-t pt-8">
          <ReclaimChart data={chart} />
        </div>
      )}

      {reflectionSlug !== null && <Reflection value={reflection} onChange={setReflection} />}

      {error !== null && (
        <p className="text-muted-foreground text-sm" role="status">
          {error} You can try again.
        </p>
      )}

      <button
        type="button"
        onClick={() => void advance()}
        disabled={busy || !canAdvance}
        className="bg-primary text-primary-foreground rounded-full px-8 py-3 text-[0.95rem] font-medium disabled:opacity-40"
      >
        {busy ? 'Saving…' : 'Continue to the next phase'}
      </button>
    </div>
  );
}
