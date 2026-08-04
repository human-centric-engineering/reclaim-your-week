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
 * there while the conversation carries on below them, and the move onward sits at the foot of the
 * composer band. A leader never scrolls past their own week to reach the question they are being
 * asked — which is what happened while the beats were pinned to the tail. See `CoachBeat` for why
 * each one carries a key.
 *
 * **The control a leader answers into is its own surface**, filled rather than continuous with the
 * page, and the move onward is under it rather than over it. Both of those are the same correction:
 * the place where a leader answers had been indistinguishable from the place they read, and the
 * first thing under a question was a button offering to leave it.
 *
 * The form panels are not replaced. A leader who would rather fill in fields can switch, and the two
 * paths write the same slots through the same server path (I3), so switching mid-phase keeps
 * everything already captured.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { buildChartData, buildGapChartData, truthy } from '@/lib/app/programme/chart/series';
import {
  CHART_REVEAL_MOMENT,
  CHART_REVEAL_PHASE,
  chartRevealState,
  everyVisibleAreaHasHours,
} from '@/lib/app/programme/chart/reveal';
import {
  arrivalMomentFor,
  CALENDAR_RETURN_MOMENT,
  type CoachOpeningMoment,
} from '@/lib/app/programme/coach/opening';
import { readIdealWeek } from '@/lib/app/programme/coach/ideal-week';
import {
  phaseCaptureSlots,
  slotApplies,
  type PhaseSlot,
} from '@/lib/app/programme/coach/phase-slots';
import { reflectionSlugForLeaving } from '@/lib/app/programme/runs/phases';
import type { PhaseSignpost } from '@/lib/app/programme/runs/signposts';
import type { PhaseMarks } from '@/lib/app/programme/runs/phase-marks';
import { ReclaimChart } from '@/components/app/reclaim/chart/reclaim-chart';
import { GapChart } from '@/components/app/reclaim/chart/gap-chart';
import { IdealWeekChart } from '@/components/app/reclaim/chart/ideal-week-chart';
import {
  CoachChat,
  type CoachBeat,
  type CoachChatControls,
} from '@/components/app/reclaim/coach-chat';
import { CapturedPanel } from '@/components/app/reclaim/coach/captured-panel';
import { Signpost } from '@/components/app/reclaim/signpost';
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
 * **Every phase opens with the coach speaking.** Arriving is enough: the leader reads the card, and
 * the coach then says why this part is worth their time and asks the first question. What used to
 * stand here was the screen saying "when you are ready, say hello and we will begin", which asks
 * someone who came to be guided to do the guiding.
 *
 * Phase 1 has three moments and their order matters. The arrival fires on entry like every other
 * phase. The reveal waits for the leader to press the button, because the point of that beat is that
 * they choose when to look, so it is checked first: by the time they press it the arrival has long
 * since been claimed, and while they have not pressed it there is nothing to check. The calendar
 * return sits between them — a state the leader arrives back in rather than a button they pressed,
 * so it must never be queued ahead of a press.
 *
 * A moment already in the run's ledger returns `null`, so a reload never replays a beat.
 */
function openMomentFor(
  phaseKey: string,
  coachOpenings: string[],
  revealing: boolean,
  calendarReconciled: boolean
): CoachOpeningMoment | null {
  if (
    phaseKey === CHART_REVEAL_PHASE &&
    revealing &&
    !coachOpenings.includes(CHART_REVEAL_MOMENT)
  ) {
    return CHART_REVEAL_MOMENT;
  }
  // Coming back from the calendar step. Checked after the reveal because `revealing` is a button the
  // leader has just pressed and this is a state they arrive in, so a press must never be queued
  // behind it — but before the arrival, which by this point is always long since claimed.
  if (
    phaseKey === CHART_REVEAL_PHASE &&
    calendarReconciled &&
    !coachOpenings.includes(CALENDAR_RETURN_MOMENT)
  ) {
    return CALENDAR_RETURN_MOMENT;
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

/**
 * The drawer's closed width, its default open width, and how far a drag may take it.
 *
 * `NARROW` is a reading width and it is the **only** closed width: the list of readings, scanned,
 * out of the conversation's way. `WIDE` is the default open width — one row has grown a text field
 * and three choices, and at 20rem all of it wraps.
 *
 * A drag does not replace this pair; it replaces `WIDE`. Whatever width the leader pulls the edge to
 * becomes what *open* means for them, and closed stays `NARROW` — so returning to the conversation
 * always returns the conversation to full width, however far the panel was pulled out. See
 * `dragWidth`.
 *
 * `NARROW` is also the floor on a drag, so the leader cannot end up with an "open" width narrower
 * than the closed one, which would make opening the drawer shrink it.
 *
 * `MAX` is the ceiling, and `KEEP_FOR_TALK` is the real constraint behind it: the drawer slides
 * *over* the conversation, so a drag with no floor could bury the transcript entirely and leave a
 * leader looking at a panel with no way back to the thing it is a panel about. Whichever of the two
 * bites first, wins.
 */
const DRAWER_NARROW = 320;
const DRAWER_WIDE = 480;
const DRAWER_MAX = 760;
/** The conversation never gets narrower than this, however far the drawer is pulled out. */
const KEEP_FOR_TALK = 420;

/** How far a pointer must travel before a press on the grip is a drag rather than a click. */
const DRAG_SLOP = 3;

/** The widest the drawer may be drawn right now, given the room the conversation has to keep. */
function widestDrawer(): number {
  // `window` is absent on the server and in the first render of a test that never lays anything out;
  // the constant is the honest answer there, and a real drag only ever happens in a real window.
  const viewport = typeof window === 'undefined' ? Infinity : window.innerWidth;
  return Math.max(DRAWER_NARROW, Math.min(DRAWER_MAX, viewport - KEEP_FOR_TALK));
}

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
   * The panel, pulled out over the conversation while the leader is working in it.
   *
   * A 20rem column is the right width for *reading* a list of readings and the wrong width for
   * correcting one: the row grows a text field and three choices, and all of it wraps. So touching
   * the panel widens it, and it slides back the moment attention returns to the conversation.
   *
   * **It slides over the conversation rather than squeezing it**, which is the whole constraint. The
   * transcript is the thing the leader is in the middle of; re-flowing every line of it because they
   * clicked a side panel would cost them their place mid-sentence. The column below reserves the
   * space at rest and the drawer is positioned over it, so the conversation's width never changes.
   *
   * This is the *automatic* half of the width. The leader can also drag the edge, and once they have,
   * `dragWidth` wins and this stops being visible — see the note there.
   */
  const [drawerWide, setDrawerWide] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);
  /**
   * The width the leader dragged the edge to, or `null` while the default open width still applies.
   *
   * **It replaces `DRAWER_WIDE`, not the closing.** A drag says how wide *open* should be; it does
   * not say the panel should stop getting out of the way. So going back to the conversation still
   * returns the drawer to `DRAWER_NARROW` — the leader gets their full transcript back at the click
   * that returns them to it — and the next touch on the panel opens it at the width they chose
   * rather than at ours. Double-clicking the grip forgets it.
   *
   * The alternative, which this deliberately is not: treating a drag as a pin that switches the
   * automatic sizing off. That keeps a 40rem panel over the conversation until the leader thinks to
   * put it back, which makes tidying up their own screen a chore they have to remember.
   */
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  /** Where the press started, and how wide the drawer was then. Absent when nothing is being dragged. */
  const dragFrom = useRef<{ x: number; width: number } | null>(null);
  /** Whether this press has travelled far enough to be a drag, so a click does not also toggle. */
  const dragged = useRef(false);

  const drawerWidth = drawerWide ? (dragWidth ?? DRAWER_WIDE) : DRAWER_NARROW;
  /** The conversation's one outside-in move: hand a guessed reading back to the coach. */
  const chatControls = useRef<CoachChatControls>(null);
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

  // Slide the drawer back when the leader's attention leaves it. A pointer press anywhere else is
  // the honest signal — they have gone back to the conversation — and Escape is the same intent from
  // the keyboard. Nothing is discarded by narrowing: a half-typed correction is still there when they
  // come back, because only the width changed.
  //
  // **This closes a hand-dragged drawer too**, all the way back to `DRAWER_NARROW`. A leader who has
  // pulled the panel out to half the screen and then clicks into the conversation wants the
  // conversation, and leaving a 40rem panel over it until they remember to put it back makes tidying
  // their own screen a chore. What their drag bought is kept: it is the width the drawer opens to
  // next time, not a width it is stuck at (see `dragWidth`).
  useEffect(() => {
    if (!drawerWide) return;
    const away = (event: Event) => {
      if (drawerRef.current?.contains(event.target as Node) !== true) setDrawerWide(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerWide(false);
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', key);
    };
  }, [drawerWide]);

  /**
   * The panel, touched — which widens the drawer, except on the one press that must not.
   *
   * **A press on a control has to leave the layout alone.** Widening on `pointerdown` reflows the
   * panel between the press and the release: the button the leader aimed at moves out from under the
   * cursor, `pointerup` lands somewhere else, and the browser fires `click` on the common ancestor of
   * the two rather than on the button. So pressing "Not quite" opened the drawer and did nothing
   * else, which is precisely how it was reported. Everywhere else in the panel a press means "I am
   * working in here" and still widens it.
   */
  const openOnPress = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as Element | null)?.closest('button, a, [role="button"]') != null) return;
    setDrawerWide(true);
  }, []);

  /**
   * The same rule one step later, and the reason "Not quite" still gets its room.
   *
   * Only a field widens the drawer, because a button focused inside the panel was almost certainly
   * focused *by* the click still in flight, and widening on that is the bug above wearing a hat. A
   * text field is different: it is the moment the leader actually needs the width, and it arrives
   * after the click has been dispatched — "Not quite" activates cleanly, the correction field mounts
   * and takes focus, and the drawer opens around it.
   */
  const openOnFocus = useCallback((event: React.FocusEvent<HTMLDivElement>) => {
    if ((event.target as Element).matches('input, textarea, select')) setDrawerWide(true);
  }, []);

  /**
   * The grip, dragged.
   *
   * The drawer is anchored to the right edge, so pulling *left* makes it wider — which is why the
   * delta is `start.x - clientX` rather than the other way round. Pointer capture is what keeps the
   * drag alive once the cursor leaves the 12px handle, which it does immediately; without it a drag
   * would die on its first frame.
   *
   * The width is clamped on every frame rather than at the end, so the edge stops where the leader
   * can see it stop instead of springing back when they let go.
   *
   * **Nothing happens on the press itself, and that is the fix for a real bug.** The first cut opened
   * the drawer on `pointerdown` — a drag on a closed edge being a request to open it — and recorded
   * the width to drag from at the same moment, which was still the *closed* width because the state
   * had not rendered yet. Every subsequent frame then resolved to `closed + travelled`. A press with
   * a pixel or two of jitter, which is very nearly every real mouse click, therefore wrote 320 over
   * whatever width the leader had previously dragged to: the panel flashed open at their old width
   * and snapped shut again. So the press only remembers where it started, and the drag opens the
   * drawer the moment it is a drag.
   */
  const startDrag = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      // Or the press selects the panel's text on the way past, which is what a drag over prose does.
      // Preventing the default also costs the button its focus, so it is taken back by hand — the
      // arrow keys below are useless on a handle a click will not focus.
      event.preventDefault();
      event.currentTarget.focus();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragFrom.current = { x: event.clientX, width: drawerWidth };
      dragged.current = false;
      setDragging(true);
    },
    [drawerWidth]
  );

  const onDrag = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    const start = dragFrom.current;
    if (start === null) return;
    const travelled = start.x - event.clientX;
    // A press that has not travelled is a click, and a click must not resize anything. Once it *has*
    // travelled it stays a drag, even if the pointer wanders back through the threshold — otherwise
    // the edge would freeze whenever it passed close to where it started.
    if (!dragged.current && Math.abs(travelled) <= DRAG_SLOP) return;
    dragged.current = true;
    // The drag is what opens it, so the edge follows the cursor from exactly where it was pressed.
    setDrawerWide(true);
    setDragWidth(Math.max(DRAWER_NARROW, Math.min(widestDrawer(), start.width + travelled)));
  }, []);

  const endDrag = useCallback(() => {
    dragFrom.current = null;
    setDragging(false);
  }, []);

  /**
   * The grip, pressed rather than dragged — the open/closed toggle.
   *
   * Skipped when the press turned into a drag, or letting go at the end of one would also flip the
   * drawer shut and throw away what was just dragged.
   */
  const toggleDrawer = useCallback(() => {
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    // A plain flip, because the press no longer changes anything for it to read around. The leader's
    // dragged width is what "open" means; closing does not consume it, so this never touches
    // `dragWidth`.
    setDrawerWide((wide) => !wide);
  }, []);

  /** Arrow keys resize it too, because a handle only a mouse can reach is a handle half the room has. */
  const nudgeDrawer = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      const step = event.key === 'ArrowLeft' ? 32 : event.key === 'ArrowRight' ? -32 : 0;
      if (step === 0) return;
      event.preventDefault();
      setDrawerWide(true);
      setDragWidth(Math.max(DRAWER_NARROW, Math.min(widestDrawer(), drawerWidth + step)));
    },
    [drawerWidth]
  );

  /**
   * Hand one reading back to the conversation, in the leader's own words.
   *
   * The panel's third move on a guessed reading. It says the thing a leader would say — come back to
   * this, I am not sure — and lets the coach ask properly, which is what the surface is for. The
   * message lands in the transcript as an ordinary leader turn, so nothing is said on their behalf
   * that they cannot see, and the drawer closes on the way so the answer is not arriving behind it.
   */
  const discuss = useCallback((slot: PhaseSlot) => {
    chatControls.current?.ask(
      `Can we come back to ${slot.label.toLowerCase()}? I am not sure that is right. Could you ask me about it again?`
    );
    setDrawerWide(false);
    setPanelOpen(false);
  }, []);

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
  const applicableCaptured = applicable.filter((s) => answers[s.slug] !== undefined).length;
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
            ? 'The coach will ask what stands out to you before this section closes.'
            : null;

  /**
   * What sits beside the button once the phase is open to being left.
   *
   * The threshold leaves room for one or two unanswered readings on purpose, so "you may move on"
   * and "everything here has been asked" are different states, and the button alone cannot tell them
   * apart. Saying so is what makes taking it a choice: a leader who reads this and carries on knows
   * what they are carrying on for, and one who presses it knows what they are leaving. The coach
   * never says either of these things, because moving on is theirs to decide and this is where the
   * product says so (I6).
   *
   * **Both states get a sentence, which is a change.** The second one used to be silent: a phase with
   * nothing outstanding drew the button with an empty row beside it, so the one moment a leader can
   * move on with nothing left behind was the one moment the product said nothing about it — and a
   * bare button reads as an instruction rather than as an offer. It is also the state a leader is
   * most often looking at, since most phases end fully answered.
   */
  const stillOpen = !canAdvance
    ? null
    : outstanding > 0
      ? 'We have answered most of the questions in this part, so you may move on whenever you wish, or carry on here to clarify or add anything.'
      : 'That is everything this part asks about. Move on whenever you are ready, or carry on here if there is anything else you would like to add.';

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

  /**
   * The calendar branch: where it is on offer, and where the offer has been answered.
   *
   * **`offerCalendar` is the beat; `calendarInReach` is the door, and they are no longer the same
   * thing.** They used to be, and a leader who said no paid for it twice. The card stayed up, because
   * nothing but an upload withdrew it — and the coach asked again a few turns later, because its
   * briefing is rebuilt from the run's answers on every turn and a decline was recorded nowhere. Two
   * offers of an optional step, from a message that opens by saying it is optional.
   *
   * So the offer is made once and then answered: `reclaim_calendar_declined` withdraws the card and
   * silences the coach's branch (`phase-context.ts`). What it deliberately does **not** do is take the
   * step away. Someone who declines while they are mid-thought about their own week may well want it
   * ten minutes later, and having to ask the coach to re-offer something they were told was optional
   * is a worse trade than a quiet link in the composer band. That link is `calendarInReach`, and it
   * outlives the decline for the whole of this phase.
   *
   * Neither is gated on the reveal: a leader should be able to take the branch before seeing the
   * picture, which is the order the source runs them in.
   */
  const calendarInReach =
    phaseKey === CHART_REVEAL_PHASE &&
    everyVisibleAreaHasHours(answers) &&
    !truthy(answers['reclaim_calendar_uploaded']);
  const calendarDeclined = truthy(answers['reclaim_calendar_declined']);
  const offerCalendar = calendarInReach && !calendarDeclined;

  /**
   * "Not now", pressed — the leader's own decline, recorded as theirs.
   *
   * The deterministic half of the pair. The coach is also told to record a decline it hears in prose,
   * and that is a model remembering to call a tool in the middle of a warm conversation, which
   * `capture-sweep.ts` exists because it cannot be relied on. A button is not a hit rate: the leader
   * presses it, the reading lands through the same leader-owned write path as every correction they
   * make in the panel, and the card is gone by the next render.
   */
  const declineCalendar = useCallback(async () => {
    // Two things about this write. The prose is "Yes" because it is the word for the boolean's own
    // value — they did decline — and never the leader's sentence: a row reading "No" over a stored
    // `true` is the mismatch `checkSlotWrite` normalises away on the coach's path, and this path
    // writes straight through `saveAnswer`. And it is best-effort, because the worst case of a
    // failure is the offer standing, which is exactly where the leader already was; an error about
    // bookkeeping is not worth the interruption when they have just said "not now".
    await saveAnswer(runId, {
      slotSlug: 'reclaim_calendar_declined',
      value: 'Yes',
      valueJson: true,
    }).catch(() => undefined);
    await refresh();
  }, [runId, refresh]);

  // The moment the coach opens with. Only a moment that is due and absent from the run's ledger is
  // passed down, so a phase already under way never troubles the server.
  // `offerCalendar` above is the mirror of this: the card is withdrawn once an upload is reconciled,
  // and this is the beat that replaces it.
  const calendarReconciled = truthy(answers['reclaim_calendar_uploaded']);

  // Phase 4's arrival *is* its data beat (`ARRIVAL_MOMENTS['phase-4-gap']`, `opening.ts`): the coach's
  // first words are meant to follow the picture, not precede it. `answers` loads asynchronously
  // (`refresh`, above), but `CoachChat` fires its opening turn the moment it is hydrated, independent of
  // that fetch — so without this gate the opening turn lands and claims turn 0 before the gap chart's
  // beat has ever been passed down for `CoachChat` to anchor ahead of the transcript, and the question
  // ends up rendered above the chart it is meant to follow. Computed once here and reused below, so the
  // moment and the beat agree on what "ready" means.
  const gapChartData = buildGapChartData(answers, labels);
  const gapChartReady = gapChartData.buckets.some((b) => b.current > 0 || b.ideal > 0);
  const openMoment =
    phaseKey === 'phase-4-gap' && !gapChartReady
      ? null
      : openMomentFor(phaseKey, coachOpenings, revealing, calendarReconciled);

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
          {/* Both answers, side by side, because only one of them was ever on the card. A leader
              who did not want this had nothing to press and had to say no to the coach instead —
              which is a fine way to answer a person and a poor way to be sure you have been heard,
              since nothing recorded it and the question came back. "Not now" is the quieter of the
              two and says what it does: the link below the composer stays, for the whole of this
              section, whichever of these is pressed. */}
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
            {/* "Yes, …" rather than the bare "Look at my calendar" the footer link keeps: this one
                is the answer to a question the coach has just asked, it sits beside the other answer,
                and the two are told apart by name for anyone reading the page through a list of its
                links. */}
            <Link
              href="/programme/calendar"
              className="border-border text-foreground inline-block rounded-full border px-7 py-2.5 text-sm font-medium"
            >
              Yes, look at my calendar
            </Link>
            <button
              type="button"
              onClick={() => void declineCalendar()}
              className="text-muted-foreground hover:text-foreground text-sm underline underline-offset-4"
            >
              Not now
            </button>
          </div>
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

  // Phase 3 draws the week being designed over the week they have, once every area has an ideal
  // figure. The gate is the one `readIdealWeek` already applies to the "suspiciously similar"
  // challenge, for the same reason it applies it there: a half-designed week is mostly zeroes, and a
  // chart of it is a picture of the conversation not having finished rather than of anything the
  // leader chose. Unlike Phase 1 there is no reveal ceremony — the ideal week is theirs, they have
  // just been saying it out loud, so there is nothing here to be shown for the first time.
  if (phaseKey === 'phase-3-ideal' && readIdealWeek(answers, labels).complete) {
    beats.push({
      key: 'ideal-week-chart',
      node: (
        <div className="border-border/70 rounded-2xl border px-4 py-5 sm:px-6">
          <IdealWeekChart data={buildGapChartData(answers, labels)} />
        </div>
      ),
    });
  }

  // Phase 4 opens with the gap shown as a chart — the distance itself, either side of the week they
  // have now, rather than the two weeks side by side (that is Phase 3's picture, above). Both weeks
  // are already whole by the time a leader reaches this phase — Phase 1's own reveal gate and Phase
  // 3's coverage threshold saw to that — so there is nothing accumulating here to guard against and
  // no reveal ceremony to run; the picture is simply the phase's first beat.
  if (phaseKey === 'phase-4-gap' && gapChartReady) {
    beats.push({
      key: 'gap-chart',
      node: (
        <div className="border-border/70 rounded-2xl border px-4 py-5 sm:px-6">
          <GapChart data={gapChartData} />
        </div>
      ),
    });
  }

  const panel = (
    <div className="space-y-6">
      <CapturedPanel
        runId={runId}
        phaseKey={phaseKey}
        answers={answers}
        bucketLabels={labels}
        onSaved={() => void refresh()}
        onDiscuss={discuss}
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
    <div className="relative flex min-h-0 flex-1">
      <CoachChat
        runId={runId}
        controlsRef={chatControls}
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
          // One line, under the box: what this phase still owes on the left, the ways out of it on
          // the right. It used to be a stack of three — a filled button, a paragraph beside it, and a
          // link pushed to the far end — sitting *above* the composer, which is what made this band
          // feel crowded: two filled pills a centimetre apart, each claiming to be the thing to press.
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {/* Whichever of the two applies. They are the same sentence in different moods — why the
                move is not offered yet, or what taking it would leave — so they take the same place
                and the same voice rather than being laid out differently. It runs to the end of the
                row rather than to a fixed measure, and the basis is what makes it wrap onto its own
                line instead of squeezing when the row is too narrow to hold both. */}
            {(canAdvance ? stillOpen : waitingOn) !== null && (
              <p className="text-muted-foreground min-w-0 flex-1 basis-64 text-xs leading-relaxed">
                {canAdvance ? stillOpen : waitingOn}
              </p>
            )}

            {error !== null && (
              <p className="text-muted-foreground text-xs" role="status">
                {error} You can try again.
              </p>
            )}

            <div className="ml-auto flex shrink-0 items-center gap-4">
              {/* The calendar step, kept within reach for the whole of this section rather than only
                  at the moment it is offered. The card above is a beat: it appears once, is answered
                  once, and then scrolls away under the conversation that follows it — so a leader who
                  said "not now" and changed their mind twenty minutes later had no way back to a
                  step they were told was optional and open to them. This is that way back, and it
                  survives the decline on purpose. It disappears the moment an upload is reconciled,
                  because then there is nothing left to offer. */}
              {calendarInReach && (
                <Link
                  href="/programme/calendar"
                  className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-4"
                >
                  Look at my calendar
                </Link>
              )}

              {/* The panel has no column of its own below `xl`, so it is one tap away instead. */}
              <button
                type="button"
                onClick={() => setPanelOpen(true)}
                className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-4 xl:hidden"
              >
                {/* Counted over what this leader will actually be asked, which is what the panel this
                    button opens counts too. A denominator that included readings ruled out by an
                    earlier answer would sit here saying "18 of 19" beside a panel saying "18 of 18",
                    and the missing one would read as a question the coach had skipped. */}
                {applicableCaptured} of {applicable.length} noted
              </button>

              {/* **Outlined, where Send is filled**, and the hierarchy is the whole reason. Two solid
                  teal pills in one band say "press me" twice and leave the leader to work out which;
                  the filled one is what to do now, and this is what you may do instead. It is not
                  quiet — it is the only bordered thing in the band, it takes the brand ink, and it
                  fills on hover, so pointing at it turns it into the primary button it becomes the
                  moment you mean it. The arrow says which way the phase goes and is hidden from
                  screen readers, so the name the tests and a screen reader hear is still the words. */}
              {canAdvance && (
                <button
                  type="button"
                  onClick={() => void advance()}
                  disabled={busy}
                  className="group border-primary/40 text-primary hover:border-primary hover:bg-primary hover:text-primary-foreground focus-visible:ring-ring/40 focus-visible:ring-offset-background inline-flex items-center gap-2 rounded-full border px-5 py-2 text-sm font-medium transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-40 motion-reduce:transition-none"
                >
                  {busy ? 'Saving…' : 'Continue to the next section'}
                  <span
                    aria-hidden="true"
                    className="transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none"
                  >
                    →
                  </span>
                </button>
              )}
            </div>
          </div>
        }
      />

      {/* The column the drawer occupies at rest. It exists only to hold the space open, so the
          drawer can be positioned over the conversation and widen without moving a word of it. */}
      <div className="hidden w-80 shrink-0 xl:block" aria-hidden="true" />

      <aside
        ref={drawerRef}
        style={{ width: drawerWidth }}
        className={`border-border/60 bg-background absolute inset-y-0 right-0 hidden border-l ease-out motion-reduce:transition-none xl:flex ${
          // No width transition mid-drag, or the edge lags a frame behind the cursor and the whole
          // thing feels like it is being pulled through treacle.
          dragging ? 'select-none' : 'transition-[width,box-shadow] duration-300'
        } ${drawerWidth > DRAWER_NARROW ? 'shadow-[-1.5rem_0_3rem_-1.5rem_rgb(0_0_0/0.22)]' : ''}`}
      >
        {/* The pull. A hairline at rest that thickens and takes the brand teal under the cursor —
            enough to say the edge is live, quiet enough that a leader who only ever reads the panel
            never notices it. `cursor-col-resize` is the other half of that promise: the pointer says
            "this moves sideways" before anything is pressed. */}
        <button
          type="button"
          onPointerDown={startDrag}
          onPointerMove={onDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onClick={toggleDrawer}
          onDoubleClick={() => {
            setDragWidth(null);
            dragged.current = false;
          }}
          onKeyDown={nudgeDrawer}
          aria-expanded={drawerWidth > DRAWER_NARROW}
          aria-label="Resize what the coach has noted. Drag, or use the left and right arrow keys."
          title="Drag to resize"
          // The default focus ring has to go, and not because focus rings are ugly. This button is a
          // 12px strip stretched the full height of the drawer, so the ring is not a ring — it is a
          // hard blue rectangle down the whole edge of the panel, drawn on every mouse press because
          // `startDrag` takes focus by hand. What replaces it is confined to the grip itself: the
          // bar takes the brand teal and grows, exactly as it does under the cursor. A keyboard
          // user sees the handle light up, which is the thing they are about to move.
          className={`group hover:bg-accent/60 focus-visible:bg-accent/60 flex w-3 shrink-0 cursor-col-resize touch-none items-center justify-center transition-colors focus:outline-none ${
            dragging ? 'bg-accent/60' : ''
          }`}
        >
          <span
            className={`rounded-full transition-all duration-150 motion-reduce:transition-none ${
              dragging
                ? 'bg-primary h-20 w-[4px]'
                : 'bg-border group-hover:bg-primary group-focus-visible:bg-primary h-12 w-[3px] group-hover:h-20 group-hover:w-[4px] group-focus-visible:h-20 group-focus-visible:w-[4px]'
            }`}
          />
        </button>
        <div
          onPointerDown={openOnPress}
          onFocusCapture={openOnFocus}
          className="min-h-0 flex-1 overflow-y-auto py-6 pr-5 pl-2"
        >
          {panel}
        </div>
      </aside>

      {/* The same panel below `xl`, where there is no column to put it in. Kept mounted so it
          slides rather than appears, and `inert` while closed so nothing inside it can be reached
          by a tab or a screen reader that cannot see it. */}
      <div
        role="dialog"
        aria-label="What the coach has noted"
        // `overflow-hidden` because the panel is parked at `translate-x-full` while closed: without
        // it, a drawer nobody has opened puts a horizontal scrollbar on the page.
        className={`fixed inset-0 z-50 flex justify-end overflow-hidden xl:hidden ${panelOpen ? '' : 'pointer-events-none'}`}
        inert={!panelOpen}
      >
        <button
          type="button"
          aria-label="Close what the coach has noted"
          onClick={() => setPanelOpen(false)}
          className={`bg-foreground/20 absolute inset-0 transition-opacity duration-300 motion-reduce:transition-none ${
            panelOpen ? 'opacity-100' : 'opacity-0'
          }`}
        />
        <div
          className={`bg-background border-border/60 relative flex w-[min(24rem,92vw)] flex-col overflow-y-auto border-l px-5 py-6 transition-transform duration-300 ease-out motion-reduce:transition-none ${
            panelOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
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
    </div>
  );
}
