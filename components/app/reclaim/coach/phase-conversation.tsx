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

/** The phase whose panel draws the leader's week as it fills in. */
const CHARTED_PHASE = 'phase-1-current';

export interface PhaseConversationProps {
  runId: string;
  phaseKey: string;
  /** The run's conversation, or `null` until the first turn opens one. */
  conversationId: string | null;
  /** Re-read the run state after the phase advances. */
  onAdvanced: () => void;
  /** Switch this phase to its form panel. */
  onSwitchToForm: () => void;
}

export function PhaseConversation({
  runId,
  phaseKey,
  conversationId,
  onAdvanced,
  onSwitchToForm,
}: PhaseConversationProps) {
  const [answers, setAnswers] = useState<RunAnswers>({});
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [reflection, setReflection] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // A leader who has said nothing yet has nothing to move on from, so the button waits rather than
  // letting them skip a phase they have not had. The reflection gate is the server's (I9); this only
  // avoids offering a move that would be refused.
  const canAdvance = capturedCount > 0 && (reflectionSlug === null || reflection.trim().length > 0);

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
            : (advanced.message ?? 'We could not move on just now.')
        );
      }
      onAdvanced();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setBusy(false);
    }
  };

  const chart = phaseKey === CHARTED_PHASE ? buildChartData(answers, labels) : null;

  return (
    <div className="space-y-10">
      <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[1fr_17rem]">
        <CoachChat
          runId={runId}
          conversationId={conversationId}
          onTurnComplete={() => void refresh()}
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

      {/* The picture the leader is talking their way into. Renders once there is anything to draw. */}
      {chart !== null && capturedCount > 0 && (
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
