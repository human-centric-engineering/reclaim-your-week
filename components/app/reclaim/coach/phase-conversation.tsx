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
 *  - **The conversation** captures the phase's readings, and closes it. The coach writes them
 *    silently through `record_answers` as it goes, taking the run and the phase from the
 *    server-issued scope (I6).
 *  - **The panel** shows what has been recorded, and offers back anything the coach inferred rather
 *    than was told, so an inference cannot become part of the audit unseen. The reflection sits there
 *    too, in the leader's own words, editable.
 *  - **The move onward stays with the leader.** The coach holds no transition capability and the
 *    server enforces the gate (I9); this is the UI half — the button is theirs to press.
 *
 * **The reflection used to be a textarea under all of this**, which is the one place the form crept
 * back into the conversation: the question the whole method rests on, asked by a field. The coach now
 * asks it as the phase's closing beat and records the answer, under conditions the server owns — this
 * phase only, never inferred, always visible and always editable. See `coach/writable-slots.ts` for
 * the reasoning and what replaced the blanket refusal.
 *
 * **Nothing stacks below the conversation any more.** The signpost opens it, the beats (the calendar
 * branch, the reveal, the picture) are dropped into the transcript at the moment they appear and stay
 * there while the conversation carries on below them, and the move onward sits above the composer. A
 * leader never scrolls past their own week to reach the question they are being asked — which is what
 * happened while the beats were pinned to the tail. See `CoachBeat` for why each one carries a key.
 *
 * The form panels are not replaced. A leader who would rather fill in fields can switch, and the two
 * paths write the same slots through the same server path (I3), so switching mid-phase keeps
 * everything already captured.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { buildChartData, truthy } from '@/lib/app/programme/chart/series';
import {
  CHART_REVEAL_MOMENT,
  CHART_REVEAL_PHASE,
  chartRevealState,
  everyVisibleAreaHasHours,
} from '@/lib/app/programme/chart/reveal';
import type { CoachOpeningMoment } from '@/lib/app/programme/coach/opening';
import { phaseCaptureSlots } from '@/lib/app/programme/coach/phase-slots';
import { reflectionSlugForLeaving } from '@/lib/app/programme/runs/phases';
import type { PhaseSignpost } from '@/lib/app/programme/runs/signposts';
import type { PhaseMarks } from '@/lib/app/programme/runs/phase-marks';
import { ReclaimChart } from '@/components/app/reclaim/chart/reclaim-chart';
import { CoachChat, type CoachBeat } from '@/components/app/reclaim/coach-chat';
import { CapturedPanel } from '@/components/app/reclaim/coach/captured-panel';
import { Signpost } from '@/components/app/reclaim/signpost';
import {
  advancePhase,
  readAnswers,
  readLabels,
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
  /** Where this phase sits in the seven, for the signpost that opens the transcript. */
  phaseIndex: number;
  phaseLabel: string;
  /** The operator's signpost cards; omitted falls back to the shipped defaults. */
  signposts?: PhaseSignpost[];
  /** The run's conversation, or `null` until the first turn opens one. */
  conversationId: string | null;
  /** The coach-opening moments this run has already had, so none is replayed on a reload. */
  coachOpenings: string[];
  /** Where each phase's part of the run's one conversation begins, so this phase draws only its own. */
  phaseMarks?: PhaseMarks;
  /** Re-read the run state after the phase advances, or after a moment fires. */
  onAdvanced: () => void;
  /** Switch this phase to its form panel. */
  onSwitchToForm: () => void;
}

export function PhaseConversation({
  runId,
  phaseKey,
  phaseIndex,
  phaseLabel,
  signposts,
  conversationId,
  coachOpenings,
  phaseMarks,
  onAdvanced,
  onSwitchToForm,
}: PhaseConversationProps) {
  const [answers, setAnswers] = useState<RunAnswers>({});
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The captured panel, on a screen too narrow to keep it beside the conversation. */
  const [panelOpen, setPanelOpen] = useState(false);
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
  const captureSlots = phaseCaptureSlots(phaseKey, {
    fundraisingRelevant: truthy(answers['reclaim_setup_fundraising_relevant']),
    bucketLabels: labels,
  });
  const capturedCount = captureSlots.filter((s) => answers[s.slug] !== undefined).length;
  const reflected = reflectionSlug === null || answers[reflectionSlug] !== undefined;

  // I12, the reveal as an event rather than a running total. `revealing` folds in the click that has
  // not yet reached the run's ledger, so the chart and the coach's beat start together.
  const revealState =
    phaseKey === CHART_REVEAL_PHASE ? chartRevealState(answers, coachOpenings) : null;
  const revealed = revealState === 'revealed' || (revealState === 'ready' && revealing);

  // A leader who has said nothing yet has nothing to move on from, so the button waits rather than
  // letting them skip a phase they have not had. Both gates are the server's (I9 for the reflection,
  // I12 for the reveal); this only avoids offering a move that would be refused.
  const canAdvance = capturedCount > 0 && reflected && (revealState === null || revealed);

  /** Why the move is not offered yet, in one sentence, because a dimmed button explains nothing. */
  const waitingOn =
    capturedCount === 0
      ? 'The conversation records as you go.'
      : revealState !== null && !revealed
        ? 'Have a look at the shape of your week before moving on.'
        : !reflected
          ? 'The coach will ask what stands out to you before this phase closes.'
          : null;

  const advance = async () => {
    setBusy(true);
    setError(null);
    try {
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

  // Offered once every area has a figure, and withdrawn once a calendar has been reconciled. Not
  // gated on the reveal: a leader should be able to take the branch before seeing the picture, which
  // is the order the source runs them in.
  const offerCalendar =
    phaseKey === CHART_REVEAL_PHASE &&
    everyVisibleAreaHasHours(answers) &&
    !truthy(answers['reclaim_calendar_uploaded']);

  // The moment the coach opens, or `null` for a phase the leader leads. Only a moment that is due and
  // absent from the run's ledger is passed down, so the common case never troubles the server.
  const openMoment = openMomentFor(phaseKey, coachOpenings, revealing);

  /**
   * The phase's beats, each with a stable key so `CoachChat` can leave it where it appeared.
   *
   * Keys, not positions: the calendar card and the picture arrive at different moments and the
   * calendar card is withdrawn once an upload has been reconciled, so identifying a beat by its place
   * in this array would move the chart up the transcript the moment the card above it vanished.
   */
  const beats: CoachBeat[] = [];

  // The calendar branch. It had been unreachable since F5 merged: nothing in the app linked to it, on
  // either surface, so the only way in was to type the URL. Offered once every area has a figure,
  // which is where the source puts it, and never presented as the better option — the audit is worth
  // doing without it and several testers were anxious about this step.
  if (offerCalendar) {
    beats.push({
      key: 'calendar-offer',
      node: (
        <div className="border-border/70 rounded-2xl border border-dashed px-6 py-5">
          <p className="text-foreground text-[1.02rem] leading-relaxed text-balance">
            If you would like, you can reality-check this against your actual calendar. It is
            optional, your calendar file is never stored, and the audit works just as well without
            it.
          </p>
          <Link
            href="/programme/calendar"
            className="border-border text-foreground mt-4 inline-block rounded-full border px-7 py-2.5 text-sm font-medium"
          >
            Look at my calendar
          </Link>
        </div>
      ),
    });
  }

  // I12 — the picture and its interpretation are separate beats.
  //
  // Until every area has a figure there is nothing whole to show. Once there is, the leader asks for
  // it, and what they get is the chart on its own: no summary beside it, no reading of what it means.
  // The coach's turn then names the figures, checks they are right, and asks one question. This used
  // to draw itself the instant one reading landed, which meant the leader met their week one bar at a
  // time and there was no reveal left to have.
  if (revealState === 'ready' && !revealing) {
    beats.push({
      key: 'chart-invite',
      node: (
        <div className="border-border/70 rounded-2xl border px-6 py-5">
          <p className="text-foreground text-[1.02rem] leading-relaxed text-balance">
            That is every area accounted for. Whenever you are ready, we can look at the shape of
            the week you have described.
          </p>
          <button
            type="button"
            onClick={() => setRevealing(true)}
            className="bg-primary text-primary-foreground mt-4 rounded-full px-8 py-3 text-[0.95rem] font-medium"
          >
            Show me where the week is going
          </button>
        </div>
      ),
    });
  }

  // The picture itself. Hoisted into a `const` under its own guard rather than written inline in the
  // `beats.push` call, so `chart !== null` stays on the lines directly above the render site: that
  // adjacency is what `tests/unit/invariants/chart-beat.test.ts` reads to hold I12, and burying the
  // guard five lines up would have left the invariant unable to see a gate that is still there.
  if (chart !== null) {
    const picture = (
      <div className="border-border/70 rounded-2xl border px-4 py-5 sm:px-6">
        <ReclaimChart data={chart} />
      </div>
    );
    beats.push({ key: 'chart', node: picture });
  }

  const panel = (
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
  );

  return (
    <div className="flex min-h-0 flex-1">
      <CoachChat
        runId={runId}
        conversationId={conversationId}
        openMoment={openMoment}
        phaseKey={phaseKey}
        phaseMarks={phaseMarks}
        onTurnComplete={() => {
          void refresh();
          // The run's ledger has moved if a moment just fired; re-reading it is what stops the
          // moment being offered again on the next render.
          onAdvanced();
        }}
        intro={
          <Signpost
            phaseKey={phaseKey}
            index={phaseIndex}
            label={phaseLabel}
            signposts={signposts}
          />
        }
        beats={beats}
        footer={
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {canAdvance ? (
              <button
                type="button"
                onClick={() => void advance()}
                disabled={busy}
                className="bg-primary text-primary-foreground rounded-full px-6 py-2 text-sm font-medium disabled:opacity-40"
              >
                {busy ? 'Saving…' : 'Continue to the next phase'}
              </button>
            ) : (
              <p className="text-muted-foreground text-xs leading-relaxed">{waitingOn}</p>
            )}

            {error !== null && (
              <p className="text-muted-foreground text-xs" role="status">
                {error} You can try again.
              </p>
            )}

            {/* The panel has no column of its own below `xl`, so it is one tap away instead. */}
            <button
              type="button"
              onClick={() => setPanelOpen(true)}
              className="text-muted-foreground hover:text-foreground ml-auto text-xs underline underline-offset-4 xl:hidden"
            >
              {capturedCount} of {captureSlots.length} noted
            </button>
          </div>
        }
      />

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
