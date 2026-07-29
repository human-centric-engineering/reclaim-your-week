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
import { arrivalMomentFor, type CoachOpeningMoment } from '@/lib/app/programme/coach/opening';
import { phaseCaptureSlots, slotApplies } from '@/lib/app/programme/coach/phase-slots';
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
 * **Every phase opens with the coach speaking.** Arriving is enough: the leader reads the card, and
 * the coach then says why this part is worth their time and asks the first question. What used to
 * stand here was the screen saying "when you are ready, say hello and we will begin", which asks
 * someone who came to be guided to do the guiding.
 *
 * Phase 1 has two moments and their order is the whole of I12. The arrival fires on entry like every
 * other phase. The reveal waits for the leader to press the button, because the point of that beat is
 * that they choose when to look, so it is checked first: by the time they press it the arrival has
 * long since been claimed, and while they have not pressed it there is nothing to check.
 *
 * A moment already in the run's ledger returns `null`, so a reload never replays a beat.
 */
function openMomentFor(
  phaseKey: string,
  coachOpenings: string[],
  revealing: boolean
): CoachOpeningMoment | null {
  if (
    phaseKey === CHART_REVEAL_PHASE &&
    revealing &&
    !coachOpenings.includes(CHART_REVEAL_MOMENT)
  ) {
    return CHART_REVEAL_MOMENT;
  }
  const arrival = arrivalMomentFor(phaseKey);
  if (arrival === null || coachOpenings.includes(arrival)) return null;
  return arrival;
}

/**
 * How much of a phase has to be covered before the way onward is offered, when the operator's own
 * number has not arrived.
 *
 * Not all of it, and the shortfall is the point. A phase whose every applicable reading must land
 * would be held open by one question a leader would rather not answer, and there is no way for them
 * to say so: the coach cannot record a decline. Leaving room for roughly one in ten means the common
 * case — a leader who has genuinely been through the phase and left one thing — is not a hostage.
 *
 * The live value is `Module.config.phaseCoveredPercent`, edited on the content screen and served
 * through `GET /api/v1/app/reclaim/config`. This is the fallback for the moment before it lands and
 * for a read that failed, and it is deliberately the same number the config defaults to: a leader
 * whose config fetch missed should meet the shipped behaviour, not a stricter or looser one.
 */
const PHASE_COVERED = 0.9;

/**
 * At or below this, an inferred reading is the coach's guess and not the leader's answer.
 *
 * The same number the captured panel uses to decide what to offer back for checking, and the same
 * band `answer-quality.ts` calls `unconfirmed`. A guess counts towards the picture but not towards
 * "this phase has happened": a phase whose coverage was made of inferences is a phase where the
 * coach filled in the leader's audit for them.
 */
const GUESS_CONFIDENCE = 6;

function isAGuess(answer: RunAnswers[string]): boolean {
  return answer.sourceType === 'inferred' && answer.confidence <= GUESS_CONFIDENCE;
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
  /**
   * The operator's coverage threshold as a percentage; omitted falls back to `PHASE_COVERED`.
   *
   * A percentage rather than a fraction because that is what an operator types into the content
   * screen, and converting it once here is cheaper than remembering which of the two a given caller
   * holds.
   */
  coveredPercent?: number;
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
  coveredPercent,
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

  // What this phase still owes, and what counts as owed. Readings whose condition came back the other
  // way are not outstanding, they are finished — `slotApplies` answers that from the run's own data,
  // so a leader with no fundraising in their role is not held behind a question about their
  // development team.
  const applicable = captureSlots.filter((s) => slotApplies(s.askOnlyIf, answers) !== false);
  const settled = applicable.filter((s) => {
    const answer = answers[s.slug];
    return answer !== undefined && !isAGuess(answer);
  }).length;
  const outstanding = applicable.length - settled;

  // I12, the reveal as an event rather than a running total. `revealing` folds in the click that has
  // not yet reached the run's ledger, so the chart and the coach's beat start together.
  const revealState =
    phaseKey === CHART_REVEAL_PHASE ? chartRevealState(answers, coachOpenings) : null;
  const revealed = revealState === 'revealed' || (revealState === 'ready' && revealing);

  // The move onward, offered when the phase has actually happened.
  //
  // **This used to be `capturedCount > 0`**, which offered the way out of Phase 0 the moment the
  // leader's first name landed. One reading in fifteen is not a phase, and a button that says
  // "continue" beside a panel reading five of fifteen is the product telling them they are finished
  // when the coach is on question three. A leader who takes it loses everything the phase was for and
  // the audit is built on what it did not ask.
  //
  // Both hard gates are still the server's (I9 for the reflection, I12 for the reveal). This is the
  // one the client owns, and it is a judgement about coverage rather than a rule about data, which is
  // why it lives here rather than in the transition route.
  //
  // **The risk it introduces, named rather than hidden.** A threshold can strand a leader who will
  // not answer something. Four things keep that from being a trap: inapplicable readings are
  // excluded rather than waited for, the threshold leaves room for one or two unanswered, what is
  // still open is said beside the button rather than left to be guessed at, and the form panel is one
  // click away and writes the same slots. If a leader still gets stuck, the fix is to let them record
  // a decline, not to lower this back to one.
  // The operator's number, or the shipped one. Clamped rather than trusted: this arrives over HTTP,
  // and a nought would offer the way out of an empty phase while a figure above one would hold every
  // phase open for ever.
  const threshold = Math.min(1, Math.max(0.5, (coveredPercent ?? PHASE_COVERED * 100) / 100));
  const covered = applicable.length > 0 && settled >= Math.ceil(applicable.length * threshold);
  const canAdvance = covered && reflected && (revealState === null || revealed);

  /** Why the move is not offered yet, in one sentence, because a dimmed button explains nothing. */
  const waitingOn =
    capturedCount === 0
      ? 'The conversation records as you go.'
      : !covered
        ? `There ${outstanding === 1 ? 'is one thing' : `are ${outstanding} things`} still to cover in this part.`
        : revealState !== null && !revealed
          ? 'Have a look at the shape of your week before moving on.'
          : !reflected
            ? 'The coach will ask what stands out to you before this phase closes.'
            : null;

  /**
   * What sits beside the button when the phase is covered but not finished.
   *
   * The threshold leaves room for one or two unanswered readings on purpose, so "you may move on"
   * and "everything here has been asked" are different states, and the button alone cannot tell them
   * apart. Saying so is what makes taking it a choice: a leader who reads this and carries on knows
   * what they are carrying on for, and one who presses it knows what they are leaving. The coach
   * never says either of these things, because moving on is theirs to decide and this is where the
   * product says so (I6).
   */
  const stillOpen =
    canAdvance && outstanding > 0
      ? 'We have answered most of the questions in this part, so you may move on whenever you wish, or carry on here to clarify or add anything.'
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

  // The moment the coach opens with. Only a moment that is due and absent from the run's ledger is
  // passed down, so a phase already under way never troubles the server.
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
              <>
                <button
                  type="button"
                  onClick={() => void advance()}
                  disabled={busy}
                  className="bg-primary text-primary-foreground rounded-full px-6 py-2 text-sm font-medium disabled:opacity-40"
                >
                  {busy ? 'Saving…' : 'Continue to the next phase'}
                </button>
                {/* Runs to the end of the row rather than to a fixed measure, so it takes the same
                    width as the composer below it and settles on two lines beside the button. The
                    basis is what makes it wrap onto its own line instead of squeezing when the row
                    is too narrow to hold both. */}
                {stillOpen !== null && (
                  <p className="text-muted-foreground min-w-0 flex-1 basis-64 text-xs leading-relaxed">
                    {stillOpen}
                  </p>
                )}
              </>
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
