'use client';

/**
 * The coach conversation — the surface a leader actually does the audit through.
 *
 * A calm, letter-like exchange rather than a chat-bubble dashboard: the coach speaks in the page's
 * ink, the leader's lines sit in a soft band to the right. One turn at a time via `fetch` +
 * `getReader()` over the run's own stream (`/runs/:runId/coach/stream`), which is the route that puts
 * the run in the dispatch scope the capture capability needs (I6).
 *
 * **Two things changed when the conversation stopped being a shell.**
 *
 * The stream is now the *leaf* route rather than the framework's module surface, because a turn has to
 * know which audit it belongs to before the coach can record anything from it.
 *
 * And the transcript is rehydrated. While this was a shell, losing every prior turn on reload cost a
 * leader nothing, since the forms held the audit. Now the conversation *is* the audit: a leader who
 * refreshes mid-phase would otherwise meet a coach with no memory of the last twenty minutes, in a
 * conversation whose whole method is asking before telling. The messages come from the run's
 * conversation, which the run points at from the moment the first turn opens it.
 *
 * ## And three things changed when it stopped reading like a form
 *
 * **It is a bounded column, not a growing page.** The transcript scrolls; the composer does not move.
 * The old shape had `min-h-[26rem] flex-col` with a `flex-1 overflow-y-auto` transcript inside an
 * unbounded document, which is a scroll region that can never scroll: the child grew to its content,
 * the page grew with it, and the autoscroll call was a no-op against a container that was never
 * overflowing. Everything above this component had to change for this line to work (see
 * `app/(programme)/layout.tsx`), which is why the fix is a frame rather than a class.
 *
 * **The turn is narrated.** `status` frames were arriving all along and being dropped, so the whole
 * of a tool round-trip looked like nothing happening. They now drive a thinking indicator, translated
 * out of the platform's vocabulary first (see `./coach/status.ts`).
 *
 * **The words arrive as speech.** The deltas are real — nothing is faked, and no delay is added once
 * the answer is complete — but they are released at an even rate through `useTypingAnimation` instead
 * of landing in whatever burst sizes the provider chose. A coaching question that appears in one lump
 * reads like a form validating; the same question at a steady pace reads like someone speaking.
 *
 * **And a closed question is not asked as an open one.** Some of what the audit asks has a fixed set
 * of answers, and the form panel has always shown them while the conversation put the same question
 * above an empty box. The coach names the reading its question is about by calling `offer_choices`,
 * that result arrives on the `capability_result` frame the platform already yields, and the composer
 * gives way to the answers (`./coach/choices.ts`, `./coach/choice-composer.tsx`). A tapped answer is
 * an ordinary leader turn, so nothing about how the audit records it changes.
 */

import { Fragment, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { parseSseBlock } from '@/lib/api/sse-parser';
import { parseChatStreamEvent } from '@/components/admin/orchestration/chat/chat-events';
import { ThinkingIndicator } from '@/components/admin/orchestration/chat/thinking-indicator';
import { useTypingAnimation } from '@/lib/hooks/use-typing-animation';
import { leaderFacingStatus } from '@/components/app/reclaim/coach/status';
import type { CoachOpeningMoment } from '@/lib/app/programme/coach/opening';
import {
  loadTranscript,
  coachParagraphs,
  renderEmphasis,
  CoachLine,
  LeaderLine,
} from '@/components/app/reclaim/coach/transcript';
import { phaseWindow, sliceByWindow, type PhaseMarks } from '@/lib/app/programme/runs/phase-marks';
import { offerFromEvent, type ChoiceOffer } from '@/components/app/reclaim/coach/choices';
import { ChoiceComposer } from '@/components/app/reclaim/coach/choice-composer';

/** A turn on screen. Ids come from the transcript; a turn still being spoken has none yet. */
interface Turn {
  id: string;
  role: 'leader' | 'coach';
  text: string;
}

/** A turn the leader has just produced, before the server has given it an id. */
let pendingSeq = 0;
const pendingId = () => `pending-${(pendingSeq += 1)}`;

/**
 * One of the phase's beats — the calendar branch, the reveal button, the picture itself.
 *
 * A beat carries a **stable key** rather than being an opaque node, and that key is the whole point.
 * These used to be a single `ReactNode` rendered after the last turn, which pinned them to the foot of
 * the transcript for as long as their condition held: the picture stayed welded above the composer, so
 * every question the coach asked afterwards was drawn *above* the chart and the leader read their
 * newest question, then a card, then their week, then the box they were meant to type in. Phase 1 asks
 * eleven more things after the reveal, so this was the common case rather than the tail of one.
 *
 * A beat belongs at the point in the conversation where it appeared. The key is what lets this
 * component remember that point, so the transcript carries on underneath it exactly as it would under
 * anything else the coach said.
 */
export interface CoachBeat {
  /** Stable across renders — it is the identity the anchor is remembered against. */
  key: string;
  node: React.ReactNode;
}

/** How close to the bottom still counts as "following along", in pixels. */
const FOLLOWING_THRESHOLD = 120;

/**
 * How long to wait before asking again for an opening the server said had already happened.
 *
 * Long enough for the server to have finished releasing the claim the cut-off turn was holding
 * (which it does as that turn's stream unwinds), short enough that a leader watching an empty column
 * reads it as the coach taking a breath rather than as a phase that failed to start.
 */
const OPENING_RETRY_MS = 2_000;

/**
 * How long to wait before asking, once and without being told to, for a turn the leader is owed.
 *
 * The failure this covers is a provider throttling the account, and a provider that is throttling
 * wants a pause rather than a faster question. Six seconds is long enough to be worth having waited,
 * and short enough that a leader who has just answered is still sitting there when the reply arrives.
 * Only one, and only automatic once: past that the button below is the leader's, and hammering a
 * provider that is already refusing is how a slow minute becomes a locked-out one.
 */
const OWED_TURN_RETRY_MS = 6_000;

/**
 * Failures worth trying again by themselves.
 *
 * All of them say the same thing: something upstream was momentarily unwilling, and the request that
 * failed was not wrong. Everything absent from this set still offers the leader the button; what it
 * does not do is act on its own. A blocked message, an exhausted budget, a missing model and a
 * rejected request are all states a second identical attempt cannot change, and retrying them buys
 * the leader another failure and another bill.
 *
 * `transport_*` codes are this app's own answer rather than the provider's, so only the ones that
 * mean "the server could not be reached" are here. Notably absent is `transport_429`, which is this
 * app's rate limit on the leader themselves: its window is a minute, so a retry six seconds later is
 * a guaranteed second refusal.
 */
const RETRIABLE_FAILURES = new Set([
  'http_429',
  'http_500',
  'http_502',
  'http_503',
  'http_504',
  'provider_error',
  'stream_error',
  'timeout',
  'transport_502',
  'transport_503',
  'transport_504',
  'transport_unreachable',
]);

/** Whether the coach has actually said anything in what is on screen. */
function spokenIn(turns: Turn[]): boolean {
  return turns.some((turn) => turn.role === 'coach' && turn.text.trim().length > 0);
}

/** Set the (in-flight) coach turn — always the last turn — to `text`, immutably. */
function setCoachText(turns: Turn[], text: string): Turn[] {
  const next = [...turns];
  next[next.length - 1] = { ...next[next.length - 1], role: 'coach', text };
  return next;
}

/**
 * The one thing this conversation can be asked to do from outside it.
 *
 * The panel beside the transcript shows readings the coach *inferred*, and a leader who does not
 * recognise one has three honest moves: confirm it, type the right figure over it, or say "come back
 * to this" — which is a thing you say to a person, not a field you edit. The third move has to reach
 * the conversation, and only the conversation can send a turn, so it is exposed here rather than
 * lifted: the transcript, the stream and the in-flight guard all stay in one place.
 *
 * What arrives is an ordinary leader turn. It is written into the transcript in full, in the leader's
 * column, exactly as though they had typed it — because a message sent on someone's behalf that they
 * cannot see is the panel putting words in their mouth, which is the failure this whole surface
 * exists to prevent.
 */
export interface CoachChatControls {
  /** Send `message` as a leader turn. Ignored while a turn is already in flight. */
  ask: (message: string) => void;
}

export interface CoachChatProps {
  runId: string;
  /** Imperative handle for the one outside-in move — see `CoachChatControls`. */
  controlsRef?: React.Ref<CoachChatControls>;
  /** The run's conversation, or `null` before the leader has said anything. */
  conversationId: string | null;
  /**
   * Called when a turn finishes. The coach records answers silently mid-turn, so the panel beside
   * this conversation only learns what was captured by re-reading the run.
   */
  onTurnComplete?: () => void;
  /**
   * A moment for the coach to open, or `null` for a conversation the leader starts.
   *
   * Set when the beat needs figures the leader has just produced: the picture of their week, the gap,
   * the action options. The turn fires once per run — the server claims the moment, so a reload or a
   * second tab cannot replay a beat the leader has already had.
   */
  openMoment?: CoachOpeningMoment | null;
  /**
   * The phase this conversation is in, and where each phase's part of the transcript begins.
   *
   * A run has one conversation across all seven phases, so without these the transcript is drawn
   * whole on every phase and a leader on phase 2 reads the Phase 2 card sitting on top of the whole
   * of phase 0 and 1. Omitted (phase 6's close, a test) draws everything, which is what it did
   * before.
   */
  phaseKey?: string;
  phaseMarks?: PhaseMarks;
  /**
   * What stands in the transcript's place before anything has been said.
   *
   * Rarely seen and deliberately not an invitation any more. Every phase now opens with a coach turn
   * (`coach/opening.ts`), so a coach placeholder appears within a frame of arriving and this is the
   * gap before it, or the case where a moment was claimed by a turn that never generated. Either
   * way, telling the leader to say hello would be telling them to do the one thing the change was
   * made to stop asking of them.
   */
  opener?: string;
  /**
   * The phase's opening card, at the head of the transcript.
   *
   * It belongs *in* the scroll region rather than pinned above it: the signpost is the tool's first
   * turn (`Prompt_Text.md:31`), and a phase that opens by speaking should read as the top of the
   * conversation, not as a banner the conversation happens underneath.
   */
  intro?: React.ReactNode;
  /**
   * The phase's beats — the chart reveal, the picture itself, the calendar branch — each dropped into
   * the transcript where it first appeared and left there, so the conversation continues below it.
   * These used to stack below the chat, which put a leader's own week further from them the more of it
   * they had described; then at the tail of the transcript, which put it between them and every
   * question that followed. See `CoachBeat`.
   */
  beats?: CoachBeat[];
  /**
   * Rendered at the foot of the composer band, under the box — always in reach, never lost.
   *
   * Under rather than over, which is a change. A move onward drawn above the composer is the first
   * thing a leader meets after the coach's question, and it reads as the product offering to end the
   * conversation before they have answered it. Below the box it is where someone looks when they have
   * finished saying something, and the band's own order then matches the order of the phase: read,
   * answer, move on.
   */
  footer?: React.ReactNode;
  /**
   * How tall the column is, which is the one thing this component cannot decide for itself.
   *
   * The default fills its parent, which is what a phase wants: the frame bounds the height and the
   * transcript is the only thing that scrolls. **A caller that is itself inside a scrolling column
   * must pass an explicit height** (`h-[26rem]`), or `flex-1` resolves against nothing, the transcript
   * grows to its content, and the composer walks down the page again — the exact bug the frame was
   * built to end. Phase 6's warm close is that caller.
   */
  className?: string;
}

export function CoachChat({
  runId,
  controlsRef,
  conversationId,
  onTurnComplete,
  openMoment = null,
  phaseKey,
  phaseMarks,
  opener,
  intro,
  beats = [],
  footer,
  className = 'min-h-0 flex-1',
}: CoachChatProps) {
  const [turns, setTurns] = useState<Turn[]>([]);
  /** The audit before this phase, kept back but never discarded. */
  const [earlier, setEarlier] = useState<Turn[]>([]);
  const [showEarlier, setShowEarlier] = useState(false);
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /**
   * What a failed turn left behind, which is what decides both the sentence and the way out.
   *
   * These need different words, and telling them apart is the difference between an accurate
   * instruction and a guess. It used to be one boolean — "owed or not" — and the `else` of that
   * boolean said "your message is back in the box below, just as you wrote it". An **opening** turn
   * lands in that `else`, because there is nothing to owe a leader who has not spoken yet. So a
   * throttled phase-opener told a leader their message was in the box, under an empty column, beside
   * an empty box, when they had not written one. Reported from a live audit, and it is the reason
   * this is four states rather than two.
   *
   * - `owed` — the server wrote their words down and only the reply is missing, so re-sending would
   *   say the same thing twice. `resume` below asks for the reply instead, which is why this is not
   *   simply "the leader spoke this turn": a resume that fails is owed all over again.
   * - `returned` — nothing was persisted and the composer was empty, so their sentence is back in it
   *   and pressing send is the whole recovery.
   * - `unsent` — the same, except the leader had started writing something else while they waited.
   *   Their words cannot go back into a box that is occupied, so they are held here instead of being
   *   dropped on the floor.
   * - `unopened` — the coach was opening the phase and did not manage it. Nothing of the leader's is
   *   at stake; what is missing is the beat, and only the coach can give it.
   */
  const [aftermath, setAftermath] = useState<
    | { kind: 'owed' | 'returned' }
    | { kind: 'unsent'; text: string }
    | { kind: 'unopened'; partial: boolean }
    | null
  >(null);
  /**
   * Whether the turn is about to be asked for again without the leader doing anything.
   *
   * Named on screen rather than left to happen silently. A reply appearing several seconds after a
   * failure, with no explanation, reads as the app having lied about the failure.
   */
  const [retrying, setRetrying] = useState(false);
  /**
   * The answers on offer for the question this turn ended with, or `null` for an open question.
   *
   * Held only for the turn it arrived in. It is cleared at the top of every turn rather than when one
   * is answered, which is what makes a stale offer impossible: whatever the leader does next — pick
   * one, type over it, or send the panel's "come back to this" — the next turn starts with no offer
   * and the coach's own call is the only thing that can put one back.
   */
  const [offer, setOffer] = useState<ChoiceOffer | null>(null);
  /**
   * Whether the leader has asked for the text box instead of the answers.
   *
   * Kept apart from `offer` rather than folded into it, because the two say different things and
   * conflating them cost the leader the way back: discarding the offer on dismiss meant "say it in
   * your own words" was a one-way door, and somebody who opened the box to reconsider, then decided
   * the offered answer was right after all, had to ask the coach to offer them again. The offer is
   * what the coach said is available; this is which of the two the leader is looking at, and it
   * clears with the offer at the top of every turn.
   */
  const [choicesHidden, setChoicesHidden] = useState(false);
  /**
   * Whether the coach was asked to open this phase, said it already had, and there is nothing here.
   *
   * The one state the transcript cannot express on its own. It only becomes true after the retry
   * below has been spent, and all it changes is what the empty column says: "the coach is opening
   * this part" is a promise, and a promise nobody is going to keep should stop being made.
   */
  const [openingGaveUp, setOpeningGaveUp] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  /**
   * The turn's own function, for the one caller that is inside it: the opening retry.
   *
   * A ref rather than a dependency, because `runTurn` cannot name itself, and because the retry must
   * run the *current* turn function rather than the one captured when the refused turn started.
   */
  const runTurnRef = useRef<
    ((body: Record<string, unknown>, leaderText: string | null) => void) | null
  >(null);
  /** The pending opening retry, so unmounting this phase does not fire a turn into the next one. */
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** One retry per phase. A refusal that survives it is reported rather than hammered at. */
  const retriedOpeningRef = useRef(false);
  /** The pending automatic ask for an owed turn, cancelled by anything the leader does first. */
  const owedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Whether this interruption has already had its one automatic retry.
   *
   * Cleared by any turn the leader starts themselves, so a fresh answer gets a fresh allowance, and
   * deliberately *not* cleared by a resume: a chain of automatic retries is the hammering this is
   * bounded to prevent.
   */
  const retriedOwedRef = useRef(false);
  /**
   * The resume function, for the one caller that runs after a fetch rather than during a render.
   *
   * The same shape as `runTurnRef`, and for the same reason: `runTurn` cannot name a callback defined
   * below it, and the timer must run the current one rather than the one the failed turn captured.
   */
  const resumeRef = useRef<(() => void) | null>(null);
  /**
   * The transcript as it stands, for code that runs after a fetch rather than during a render.
   *
   * The retry has to know whether anything is on screen, and the `turns` a turn closed over are the
   * ones it started with.
   */
  const turnsRef = useRef<Turn[]>([]);
  /**
   * What is in the composer, for the same reason: a turn that fails has to know whether the box it
   * would put the leader's words back into is free.
   */
  const draftRef = useRef('');

  /**
   * The in-flight coach turn, released at a readable pace.
   *
   * `fullRef` holds what has actually arrived, so the turn can be committed in full when the stream
   * ends while the animation is still catching up — the rAF chain keeps running and settles on the
   * same text a moment later, with no jump.
   */
  // Destructured because the hook's callbacks are stable while its object identity is not: depending
  // on `typing` itself would rebuild `runTurn` on every animation frame.
  const {
    displayText,
    isAnimating,
    appendDelta,
    reset: resetTyping,
  } = useTypingAnimation({ chunkSize: 2 });
  const fullRef = useRef('');

  // Rehydrate once per conversation. Guarded on `turns.length` deliberately: the id arrives from the
  // parent's `GET /runs/current`, which may refresh mid-phase after a save, and re-fetching then
  // would replace turns that are already on screen with the same ones a moment later.
  //
  // `hydrated` gates the opening turn below. A run part-way through a phase already has a transcript,
  // and firing the opener before it loads would put the coach's new beat above the conversation it is
  // supposed to follow.
  const hydratedRef = useRef<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (conversationId === null) {
      setHydrated(true);
      return;
    }
    if (hydratedRef.current === conversationId) return;
    hydratedRef.current = conversationId;
    void loadTranscript(conversationId).then((prior) => {
      // The run holds one conversation for the whole audit, so what belongs on screen is this
      // phase's part of it. `earlier` keeps the rest for the disclosure below rather than throwing
      // it away — it is the leader's own conversation, and it is one press from being read.
      const mine =
        phaseKey === undefined || phaseMarks === undefined
          ? prior
          : sliceByWindow(prior, phaseWindow(phaseMarks, phaseKey));
      const cut = mine.length === 0 ? 0 : prior.findIndex((m) => m.id === mine[0].id);
      const before =
        cut <= 0
          ? mine.length === prior.length
            ? []
            : prior.slice(0, prior.length - mine.length)
          : prior.slice(0, cut);
      setEarlier(
        before.filter((m) => !m.synthetic).map((m) => ({ id: m.id, role: m.role, text: m.text }))
      );
      const visible = mine
        .filter((m) => !m.synthetic)
        .map((m) => ({ id: m.id, role: m.role, text: m.text }));
      if (visible.length > 0) setTurns((current) => (current.length === 0 ? visible : current));
      setHydrated(true);
    });
    // `phaseKey` / `phaseMarks` are read to cut the transcript and deliberately not dependencies:
    // re-running on a phase change would re-fetch into a conversation that is already on screen. What
    // makes that safe is the `key={currentPhase.key}` on `PhaseConversation` in `programme-shell.tsx`
    // — the remount is what re-cuts the window, and without it this effect's guard would hold a new
    // phase on the old phase's turns. The key and this dep list are one decision; move neither alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  /**
   * Follow the conversation down, unless the leader has gone back to read.
   *
   * Scrolling to the bottom on every frame of a streaming answer is right up to the moment someone
   * scrolls up to re-read what they said three turns ago — after which it is a page that fights them.
   * So it only follows while they are already at the foot of it.
   */
  const followingRef = useRef(true);
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (el === null) return;
    followingRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < FOLLOWING_THRESHOLD;
  }, []);

  // Keyed on the beats present rather than on the array, which is rebuilt by the parent every render:
  // a beat appearing changes the height of the column and is worth following down, a re-render that
  // changes nothing is not.
  const beatKeys = beats.map((b) => b.key).join('|');
  useEffect(() => {
    if (!followingRef.current) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, displayText, streaming, beatKeys, footer]);

  // Cancel any in-flight stream on unmount — otherwise the reader keeps running,
  // sets state after unmount, and holds the server generation open (chat-interface.tsx pattern).
  // Both pending retries go with it: a phase that has been left must not open, or pick up a lost
  // turn, behind the one the leader is now in.
  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (retryTimerRef.current !== null) clearTimeout(retryTimerRef.current);
      if (owedTimerRef.current !== null) clearTimeout(owedTimerRef.current);
    },
    []
  );

  // What is on screen, and what is in the box, where code that runs after a fetch can read them.
  useEffect(() => {
    turnsRef.current = turns;
  }, [turns]);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  // Hand the cursor back when the coach finishes, so a reply can be typed without reaching for the
  // mouse. Only on the streaming→idle edge: focusing on every render would steal it mid-scroll.
  const wasStreamingRef = useRef(false);
  useEffect(() => {
    if (wasStreamingRef.current && !streaming) composerRef.current?.focus();
    wasStreamingRef.current = streaming;
  }, [streaming]);

  /**
   * Run one turn against the run's stream.
   *
   * `leaderText` is `null` for an opening turn, which is what makes the coach able to speak first:
   * only a coach placeholder is appended, and the trigger the server sends in the leader's place
   * never appears here or in the transcript on reload.
   */
  const runTurn = useCallback(
    async (body: Record<string, unknown>, leaderText: string | null) => {
      setError(null);
      setAftermath(null);
      setRetrying(false);
      setStatus(null);
      // Whatever this turn is, it supersedes an automatic retry that has not fired yet: a leader who
      // has answered, or pressed the button, is no longer waiting for one to happen by itself. Their
      // own turn also restores the allowance, so the next interruption gets its own retry.
      if (owedTimerRef.current !== null) {
        clearTimeout(owedTimerRef.current);
        owedTimerRef.current = null;
      }
      // And a leader who speaks supersedes a pending opening, rather than having the phase's scripted
      // opener arrive on top of the hello they gave it in its absence.
      if (body.kind !== 'opening' && retryTimerRef.current !== null) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      if (body.kind !== 'resume') retriedOwedRef.current = false;
      // The previous turn's answers, cleared before this one can produce any, along with the
      // leader's choice of which composer to look at. See `offer` and `choicesHidden`.
      setOffer(null);
      setChoicesHidden(false);
      fullRef.current = '';
      resetTyping();
      followingRef.current = true;
      setTurns((t) => [
        ...t,
        ...(leaderText !== null
          ? [{ id: pendingId(), role: 'leader' as const, text: leaderText }]
          : []),
        { id: pendingId(), role: 'coach' as const, text: '' },
      ]);
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;
      // Whether this turn got far enough for the server to have persisted the leader's message.
      // `streamChat` writes the user row before it calls the model, and the `start` frame is the
      // first thing it emits afterwards — so a `start` means "your words are in the conversation",
      // and its absence means nothing was written and the turn can be retried cleanly.
      let persisted = false;
      // What went wrong, in the vocabulary `RETRIABLE_FAILURES` is written in. The server's own codes
      // ride on the error frame and are used as they are; a failure this side of the stream is named
      // `transport_*` so the two can never be confused. `null` is a thrown `Error` from somewhere
      // that has no code to give, which is never retried by itself.
      let failure: string | null = null;
      try {
        const res = await fetch(`/api/v1/app/reclaim/runs/${runId}/coach/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        }).catch((e: unknown) => {
          // The network, not the server: no status to read, and the one failure most worth trying
          // again, because a leader on a train has not done anything wrong.
          failure = 'transport_unreachable';
          throw e instanceof Error ? e : new Error('The coach could not be reached.');
        });
        if (!res.ok || res.body === null) {
          failure = `transport_${res.status}`;
          throw new Error(`The coach could not be reached (${res.status}).`);
        }

        // An opening whose moment was already claimed answers in JSON rather than SSE. Usually
        // nothing has gone wrong — this run has had that beat — so drop the placeholder and leave
        // the transcript exactly as it was.
        //
        // **Unless there is no transcript**, which is the case this branch used to swallow. A phase
        // whose opener was claimed and then cut off shows a signpost card, an empty column and a
        // line promising the coach is about to speak, for ever. The server now gives a claim back
        // when its turn said nothing, but the release lands a moment after the abort that caused it
        // — so a remount that asks in that window is told "already had" about a beat that never
        // happened. One retry, a beat later, is the difference between the phase opening and the
        // leader having to open it themselves.
        if (res.headers.get('content-type')?.includes('application/json')) {
          setTurns((t) => t.slice(0, -1));
          if (body.kind === 'opening' && !spokenIn(turnsRef.current)) {
            if (retriedOpeningRef.current) setOpeningGaveUp(true);
            else {
              retriedOpeningRef.current = true;
              retryTimerRef.current = setTimeout(() => {
                retryTimerRef.current = null;
                runTurnRef.current?.(body, null);
              }, OPENING_RETRY_MS);
            }
          }
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const blocks = buffer.split('\n\n');
          buffer = blocks.pop() ?? '';
          for (const block of blocks) {
            const event = parseChatStreamEvent(block);
            if (event === null) {
              // Not in the shared client union. A per-turn budget abort can be the *sole* terminal
              // frame (no trailing `done`/`error`), so surface it from the raw frame rather than
              // dropping it — otherwise the coach turn is left silently empty.
              const raw = parseSseBlock(block);
              if (raw?.type === 'budget_exceeded_per_turn') {
                const msg = typeof raw.data.message === 'string' ? raw.data.message : undefined;
                throw new Error(msg ?? 'This turn reached its limit. You can try again.');
              }
              continue;
            }
            if (event.type === 'start') persisted = true;
            if (event.type === 'content') {
              const { delta } = event;
              fullRef.current += delta;
              appendDelta(delta);
            } else if (event.type === 'status') {
              setStatus(leaderFacingStatus(event.message));
            } else if (event.type === 'content_reset') {
              // A fallback provider restarts generation from scratch — discard the partial so the
              // retried answer doesn't concatenate onto the abandoned one.
              fullRef.current = '';
              resetTyping();
            } else if (event.type === 'error') {
              failure = event.code;
              throw new Error(event.message);
            } else {
              // The coach naming the reading its question is about, so the answers can be drawn
              // instead of a blank box. Every other capability result on this stream is a silent
              // `record_answers` call and returns `null` here. See `./coach/choices.ts`.
              const offered = offerFromEvent(event);
              if (offered !== null) setOffer(offered);
            }
          }
        }
      } catch (e) {
        if (controller.signal.aborted) return; // unmounted / superseded — leave state untouched
        setError(e instanceof Error ? e.message : 'Something interrupted the conversation.');

        // Whether a second identical attempt could plausibly do better. Everything absent from the
        // set is a state the request itself is wrong for, and retrying buys another failure.
        const worthRetrying = failure !== null && RETRIABLE_FAILURES.has(failure);

        // **Is the leader owed a turn they cannot ask for by speaking?**
        //
        // For a turn they spoke, that is exactly whether the server wrote it down. For a resume it is
        // always: the message that turn was answering is still in the conversation, and a resume that
        // fails leaves it as unanswered as the one before. An opening is neither — a leader who was
        // never spoken to is not owed a reply to anything, and its recovery is below.
        const owed = leaderText !== null ? persisted : body.kind === 'resume';

        if (owed) {
          setAftermath({ kind: 'owed' });
          // One automatic ask, for the failures that mean "not now" rather than "not this". Everything
          // else waits for the button, which is drawn for any owed turn whatever went wrong.
          if (!retriedOwedRef.current && worthRetrying) {
            retriedOwedRef.current = true;
            setRetrying(true);
            owedTimerRef.current = setTimeout(() => {
              owedTimerRef.current = null;
              resumeRef.current?.();
            }, OWED_TURN_RETRY_MS);
          }
        } else if (leaderText !== null) {
          // **The turn failed before the server wrote anything, so give the leader their words back.**
          //
          // Restoring the draft is safe *only* when the message was never persisted, which is exactly
          // what `persisted` tracks: re-sending one the server already holds would put it in the
          // conversation twice.
          //
          // The optimistic line goes with it. It was drawn on the assumption the turn would work, and
          // leaving it there beside a refilled composer would show the leader their sentence twice and
          // make sending it look like a duplicate.
          //
          // The box can be occupied — somebody who kept typing while they waited — and words cannot
          // go back into a box that is full. Then they are held in the notice instead, which is the
          // one thing that is certainly not losing them.
          setTurns((t) => t.slice(0, -2));
          if (draftRef.current.trim().length === 0) {
            setDraft(leaderText);
            setAftermath({ kind: 'returned' });
          } else {
            setAftermath({ kind: 'unsent', text: leaderText });
          }
        } else {
          // **The coach was opening the phase and did not manage it.**
          //
          // `persisted` divides this one too, and into two different screens. Without a `start` frame
          // nothing was generated and nothing was said: the empty placeholder goes, because an
          // unfilled coach bubble is an answer that looks like it is still coming, and what is left is
          // a signpost card over an empty column. That beat is the coach's to give and nobody else's,
          // so this asks for it again rather than telling the leader to write their way past it.
          // `openingGaveUp` stops the column promising an opener that is not on its way; a pending
          // retry *is* on its way, so it says so instead.
          //
          // Past the `start` frame the opener was part-said, and what is on screen stays: the turn's
          // words are committed below, asking again would open the phase twice, and a leader with
          // half a beat in front of them can simply carry on.
          setAftermath({ kind: 'unopened', partial: persisted });
          if (!persisted) {
            setTurns((t) =>
              t.length > 0 && t[t.length - 1].role === 'coach' ? t.slice(0, -1) : t
            );
            if (!retriedOpeningRef.current && worthRetrying) {
              retriedOpeningRef.current = true;
              setRetrying(true);
              retryTimerRef.current = setTimeout(() => {
                retryTimerRef.current = null;
                runTurnRef.current?.(body, null);
              }, OWED_TURN_RETRY_MS);
            } else {
              setOpeningGaveUp(true);
            }
          }
        }
      } finally {
        if (!controller.signal.aborted) {
          // The turn's text is committed here rather than on every delta: the animation keeps
          // running until it has caught up, and reads from `typing.displayText` while it does.
          setTurns((t) =>
            t.length > 0 && t[t.length - 1].role === 'coach' && fullRef.current.length > 0
              ? setCoachText(t, fullRef.current)
              : t
          );
          setStreaming(false);
          setStatus(null);
          // Whatever the turn did or failed to do, the run may have moved: the coach records as it
          // goes, so a turn that ended in an error can still have captured something first.
          onTurnComplete?.();
        }
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [runId, onTurnComplete, appendDelta, resetTyping]
  );

  // The retry inside `runTurn` runs whichever turn function is current when it fires, not the one the
  // refused turn closed over.
  useEffect(() => {
    runTurnRef.current = (body, leaderText) => void runTurn(body, leaderText);
  }, [runTurn]);

  /**
   * Ask for the turn the leader was owed, without asking them to say anything again.
   *
   * **Why this is not a re-send.** Their sentence is already in the conversation: the server writes
   * the leader's message before it calls the model, so a turn that got as far as the `start` frame
   * and then died left the words behind and only lost the reply. Sending them again would put the
   * same sentence in the audit twice, and invite the coach to record the same reading twice with it.
   * So the request carries nothing at all, and the server answers what is already there
   * (`COACH_RESUME_TRIGGER`).
   *
   * **The dead coach turn goes first.** A turn that failed leaves either an empty placeholder or a
   * sentence cut off wherever the stream stopped, and both are the same thing to a leader: an answer
   * that did not arrive. Dropping it is what makes the reply land once, whole, in the place the
   * unfinished one was standing — and it is also what makes the trigger true, since it tells the
   * coach nothing of its turn reached them.
   */
  const resume = useCallback(() => {
    if (streaming) return;
    setRetrying(false);
    setTurns((t) => (t.length > 0 && t[t.length - 1].role === 'coach' ? t.slice(0, -1) : t));
    void runTurn({ kind: 'resume' }, null);
  }, [streaming, runTurn]);

  // The automatic retry inside `runTurn`, like the opening one, runs the current function rather than
  // the one the failed turn captured.
  useEffect(() => {
    resumeRef.current = resume;
  }, [resume]);

  /**
   * Ask the coach to open this phase again, after a turn that generated nothing.
   *
   * The counterpart to `resume`, for the failure at the other end of a phase. It is safe to ask twice
   * because the server does not take the ledger's word for it: a moment whose claim outlived a turn
   * that never spoke is checked against the transcript and opened again (`coachOpeningWentUnspoken`),
   * and a moment that really was had answers "already opened" and leaves the screen alone.
   *
   * Only offered where nothing arrived. A part-said opener asked for again would open the phase twice.
   */
  const reopen = useCallback(() => {
    if (streaming || openMoment === null) return;
    setRetrying(false);
    void runTurn({ kind: 'opening', moment: openMoment }, null);
  }, [streaming, openMoment, runTurn]);

  const send = useCallback(async () => {
    const message = draft.trim();
    if (message.length === 0 || streaming) return;
    setDraft('');
    await runTurn({ kind: 'leader', message }, message);
  }, [draft, streaming, runTurn]);

  /**
   * One of the offered answers, taken.
   *
   * The same path as the composer and as the panel's "talk this through": one turn, one stream, the
   * same guard. A tapped answer is a leader turn and is indistinguishable from a typed one to the
   * server, to the transcript and to capture, which is what keeps the audit honest about where its
   * readings came from. The draft is left alone: a half-written sentence is theirs, and clearing it
   * because they pressed a button beside it would throw away work they can still see.
   */
  const answer = useCallback(
    (choice: string) => {
      if (streaming) return;
      void runTurn({ kind: 'leader', message: choice }, choice);
    },
    [streaming, runTurn]
  );

  // The panel's "talk this through". Deliberately the same path as the composer — one turn, one
  // stream, the same guard — so a prompted message and a typed one are indistinguishable to the
  // server and to the transcript. Silently ignored mid-turn rather than queued: a leader who presses
  // it while the coach is speaking is asking about the answer they are watching arrive.
  useImperativeHandle(
    controlsRef ?? { current: null },
    () => ({
      ask: (message: string) => {
        const text = message.trim();
        if (text.length === 0 || streaming) return;
        void runTurn({ kind: 'leader', message: text }, text);
      },
    }),
    [streaming, runTurn]
  );

  /**
   * The coach opens the moment, once.
   *
   * Two guards, because they catch different things. `firedRef` stops React's development double
   * effect from posting twice in one mount. The server's conditional claim stops everything else:
   * a second tab, a reload part-way through the stream, a remount after the parent refreshes. The
   * parent only passes a moment that is due and not already in the run's ledger, so the common case
   * never reaches the server at all.
   */
  const firedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!hydrated || openMoment === null || streaming) return;
    if (firedRef.current === openMoment) return;
    firedRef.current = openMoment;
    void runTurn({ kind: 'opening', moment: openMoment }, null);
    // `streaming` is read to avoid opening on top of a turn in flight, and deliberately not a
    // dependency: it flips twice per turn, and re-running this effect on that would re-fire the
    // moment the instant its own turn finished.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, openMoment, runTurn]);

  const lastIndex = turns.length - 1;
  /** While a turn is in flight, or still being spoken, the tail of the transcript is the animation. */
  const speaking = streaming || isAnimating;

  /**
   * Where each beat goes: the index of the turn it first appeared under, remembered from then on.
   *
   * Written during render rather than from an effect, which is deliberate. An effect runs after paint,
   * so a beat would be drawn at the tail for one frame and then jump up the transcript, with the
   * autoscroll chasing it. The write is idempotent — a key already anchored keeps its first value —
   * so a double render under StrictMode settles on the same map.
   *
   * A beat that appears before anyone has spoken anchors at `-1` and is drawn above the first turn.
   * Nothing is ever evicted: a beat whose condition stops holding simply stops being passed, and if it
   * comes back it comes back where it was.
   *
   * **On reload the anchors start empty**, so beats re-anchor to the foot of the rehydrated transcript
   * — which is where the leader is standing anyway — and the conversation resumes below them. Pinning
   * them to their true historical position would mean persisting it, and a run's ledger is the wrong
   * place to record where a card was drawn.
   *
   * **Nothing is anchored before the transcript has loaded.** `turns` is empty on the first render of
   * a run that is half-way through a phase, so a beat placed then would take `-1` and spend the rest
   * of the session above a conversation it came out of. Until `hydrated`, beats are simply drawn at
   * the tail and left unplaced.
   */
  const beatAnchors = useRef(new Map<string, number>());
  const beatsByAnchor = new Map<number, React.ReactNode[]>();
  const unplacedBeats: React.ReactNode[] = [];
  for (const beat of beats) {
    // Every group below is rendered as an array, so each beat needs a key of its own or React warns
    // about the parent's element rather than about this list. `beat.key` is the identity the anchors
    // are already kept against, so it is stable across the parent rebuilding the array each render,
    // and a `Fragment` carries it without adding a wrapper the column's `space-y-6` would have to
    // reach through.
    const node = <Fragment key={beat.key}>{beat.node}</Fragment>;
    let anchor = beatAnchors.current.get(beat.key);
    if (anchor === undefined) {
      if (!hydrated) {
        unplacedBeats.push(node);
        continue;
      }
      // While a turn is in flight the last entry is the coach's placeholder, and the beat belongs
      // under it: that is the turn the leader is watching arrive.
      anchor = turns.length - 1;
      beatAnchors.current.set(beat.key, anchor);
    }
    const group = beatsByAnchor.get(anchor);
    if (group === undefined) beatsByAnchor.set(anchor, [node]);
    else group.push(node);
  }
  /** Beats that predate the first turn, drawn under the signpost where the conversation starts. */
  const leadingBeats = beatsByAnchor.get(-1);
  /** Not yet placed, or anchored past the end (only reachable if turns were dropped): never lost. */
  const trailingBeats = [
    ...unplacedBeats,
    ...[...beatsByAnchor.entries()]
      .filter(([anchor]) => anchor >= turns.length)
      .flatMap(([, nodes]) => nodes),
  ];

  /** One turn, drawn. Split out so the map can put the beats of that moment underneath it. */
  const renderTurn = (turn: Turn, i: number) => {
    if (turn.role === 'leader') return <LeaderLine text={turn.text} />;
    const live = i === lastIndex && speaking;
    const text = live ? displayText : turn.text;
    // Nothing said yet on a turn that is running: the wait *is* the state, so it is named rather
    // than left as an empty paragraph with a blinking bar in it.
    if (live && text.length === 0) {
      return <ThinkingIndicator message={status} className="py-1" />;
    }
    // `live` withholds the area mark until the turn settles — see `coachParagraphs`.
    const paragraphs = coachParagraphs(text, live);
    return (
      <div className="space-y-1.5">
        {/* `space-y-4`, a little wider than the line spacing inside a paragraph: enough that the
            question at the end reads as its own beat, not so much that one turn looks like
            several. The caret rides the last paragraph so it stays where the words are arriving. */}
        <div className="max-w-[92%] space-y-4">
          {paragraphs.map((paragraph, p) => (
            <p
              key={p}
              className="text-foreground text-[1.02rem] leading-relaxed whitespace-pre-wrap"
            >
              {/* The same emphasis the finished turn gets, drawn while it is still being spoken —
                  see `renderEmphasis`, which is what keeps a half-arrived `**` from showing. */}
              {renderEmphasis(paragraph.text, paragraph.markArea)}
              {live && p === paragraphs.length - 1 && (
                <span className="bg-primary ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[0.15em] animate-pulse" />
              )}
            </p>
          ))}
        </div>
        {/* Once there are words, the status stops being the headline and becomes a note under
            them — a leader reading an answer should not lose it to a spinner. */}
        {live && status !== null && (
          <p className="text-muted-foreground text-xs italic" role="status">
            {status}
          </p>
        )}
      </div>
    );
  };

  return (
    <section className={`flex flex-col ${className}`} aria-label="Conversation with the coach">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-8 sm:px-6"
      >
        <div className="mx-auto max-w-3xl space-y-6">
          {intro}

          {/* The rest of the audit. Kept out of the way rather than out of reach: this is the
              leader's own conversation, and a phase that hid it for good would be a worse answer
              than the endless scroll it replaced. */}
          {earlier.length > 0 &&
            (showEarlier ? (
              <div className="border-border/60 space-y-6 border-b pb-6">
                {earlier.map((turn) =>
                  turn.role === 'leader' ? (
                    <LeaderLine key={turn.id} text={turn.text} />
                  ) : (
                    <CoachLine key={turn.id} text={turn.text} />
                  )
                )}
                <button
                  type="button"
                  onClick={() => setShowEarlier(false)}
                  className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-4"
                >
                  Hide what came before
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowEarlier(true)}
                className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-4"
              >
                Read what came earlier in this audit
              </button>
            ))}

          {leadingBeats}

          {turns.length === 0 ? (
            <p className="text-muted-foreground max-w-md pt-2 text-[0.95rem] leading-relaxed">
              {/* The waiting line is a promise that the coach is about to speak, so it stops being
                  made once we know it will not: a leader looking at an empty column deserves to be
                  told what to do next rather than left waiting on something that is not coming. */}
              {openingGaveUp
                ? 'The coach did not manage to open this part. Say hello below and it will pick things up from there.'
                : (opener ??
                  'The coach is opening this part. Take your time; there are no wrong answers here.')}
            </p>
          ) : (
            turns.map((turn, i) => (
              // The turn, then whatever the leader was shown at that point in the conversation. A
              // `Fragment` rather than a wrapper, so the column's `space-y-6` spaces a beat from the
              // turn above it exactly as it spaces two turns.
              <Fragment key={i}>
                {renderTurn(turn, i)}
                {beatsByAnchor.get(i)}
              </Fragment>
            ))
          )}

          {trailingBeats}

          {error !== null && (
            <div className="border-border border-t pt-3" role="status">
              <p className="text-muted-foreground text-sm">{error}</p>
              {/* Two different situations, and they used to share one sentence: "You can try again",
                  beside an empty composer, with no way to try. */}
              {aftermath?.kind === 'owed' ? (
                <>
                  <p className="text-muted-foreground mt-1 text-sm">
                    What you said was recorded, so there is no need to write it again.{' '}
                    {retrying
                      ? 'Trying again for you in a moment.'
                      : 'Ask the coach to pick it up whenever you are ready.'}
                  </p>
                  {/* **The way to try, in the place the sentence about trying is.** The wording used
                      to end at "ask the coach to pick it up", which is an instruction to compose a
                      nudge: a leader who had just been told their words were safe had to write more
                      words to get an answer to them. This asks for the same thing in one press, and
                      it stays up while the automatic attempt is pending so somebody who would rather
                      not wait does not have to. */}
                  <button
                    type="button"
                    onClick={resume}
                    disabled={streaming}
                    className="border-border text-foreground hover:border-primary/60 mt-3 rounded-full border px-4 py-1.5 text-sm transition-colors disabled:opacity-40"
                  >
                    Try again
                  </button>
                </>
              ) : aftermath?.kind === 'returned' ? (
                <p className="text-muted-foreground mt-1 text-sm">
                  Your message is back in the box below, just as you wrote it.
                </p>
              ) : aftermath?.kind === 'unsent' ? (
                <>
                  {/* Their sentence never reached the server and cannot go back into a box they have
                      since written in, so it is put in front of them to keep. Anything else discards
                      words a leader wrote. */}
                  <p className="text-muted-foreground mt-1 text-sm">
                    This did not send, and the box below has since been written in, so here it is to
                    copy if you want it:
                  </p>
                  <p className="border-border text-foreground mt-2 border-l-2 pl-3 text-sm whitespace-pre-wrap">
                    {aftermath.text}
                  </p>
                </>
              ) : aftermath?.kind === 'unopened' ? (
                <>
                  {/* The failure this screen used to lie about. Nothing of the leader's is at stake
                      here — the coach was opening the phase and they had not spoken yet — so the one
                      sentence never to say is that their message is safe in the box.

                      What it does say is deliberately not "the coach did not manage to open this
                      part": once the attempts are spent, the empty column says exactly that, and a
                      notice repeating it underneath is the app telling somebody twice. This carries
                      the part the column cannot — nothing of theirs was lost, and the beat can be
                      asked for again. */}
                  <p className="text-muted-foreground mt-1 text-sm">
                    {aftermath.partial
                      ? 'The coach did not finish opening this part. Carry on below and it will pick things up from there.'
                      : retrying
                        ? 'Nothing you have written is affected. Trying again for you in a moment.'
                        : 'Nothing you have written is affected. This part had not begun yet.'}
                  </p>
                  {!aftermath.partial && openMoment !== null && (
                    <button
                      type="button"
                      onClick={reopen}
                      disabled={streaming}
                      className="border-border text-foreground hover:border-primary/60 mt-3 rounded-full border px-4 py-1.5 text-sm transition-colors disabled:opacity-40"
                    >
                      Try again
                    </button>
                  )}
                </>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* The band stays on the page's own ground, and only the control inside it is repainted.
          Filling the whole band was tried and is wrong: on the dark canvas it reads as a slab pinned
          across the foot of the screen, so the thing that stands out is the strip of empty space
          around the box rather than the box. The hairline is enough to say where the transcript ends;
          what a leader needs told apart is the field, not the room it is in. */}
      <div className="border-border/60 shrink-0 border-t px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-3xl space-y-3">
          {/* The answers, but only once the question has finished arriving. An offer lands on the
              wire before the coach has said a word of the turn it belongs to, because a tool result
              precedes the reply it informs, so drawing it on receipt would put four buttons under a
              question the leader is still watching being written. */}
          {offer !== null && !choicesHidden && !speaking ? (
            <ChoiceComposer
              offer={offer}
              onPick={answer}
              disabled={streaming}
              onDismiss={() => {
                setChoicesHidden(true);
                composerRef.current?.focus();
              }}
            />
          ) : (
            <>
              {/* The way back, in the place the choice control keeps its own way out, so the two
                  states are each other's mirror rather than one being a door that only opens once.
                  Only while an offer is standing: every other turn, this row is not there at all and
                  the text box sits where it always has. */}
              {offer !== null && choicesHidden && !speaking && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setChoicesHidden(false)}
                    className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-4 transition-colors"
                  >
                    Choose from the answers instead
                  </button>
                </div>
              )}
              {/* **The field carries the colour.** `muted` is the token this brand keeps for its calm
                  bands, and on a control it reads as a well the page is answered into: soft cream on
                  white in light, a shade deeper than the canvas in dark. Deeper rather than lighter
                  is deliberate — a lit panel floating on a dark page is a card, and this is a place
                  to write. The `border` hairline sits above both grounds and draws the edge; on focus
                  it takes the brand teal and a soft ring, so the well comes forward when it is being
                  used and settles back when it is not. */}
              <form
                className="border-border bg-muted focus-within:border-primary/60 focus-within:ring-ring/15 flex items-end gap-3 rounded-2xl border px-4 py-2 transition-[border-color,box-shadow] focus-within:ring-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send();
                }}
              >
                <textarea
                  ref={composerRef}
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    // Grow with the answer, up to a point, then scroll inside itself. `rows={1}` alone
                    // left a long answer scrolling in a one-line window.
                    e.target.style.height = 'auto';
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  rows={1}
                  placeholder="Write to the coach…"
                  aria-label="Your message"
                  className="text-foreground placeholder:text-muted-foreground max-h-40 min-h-[2.5rem] flex-1 resize-none bg-transparent py-2 text-[0.98rem] leading-relaxed focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={streaming || draft.trim().length === 0}
                  className="bg-primary text-primary-foreground my-1 shrink-0 rounded-full px-6 py-2 text-sm font-medium tracking-wide transition-opacity disabled:opacity-40"
                >
                  {streaming ? 'Listening' : 'Send'}
                </button>
              </form>
            </>
          )}

          {/* **Below the composer, not above it.** Three things used to stack in this band — the move
              onward, its explanation, and the box or the answers — with the move onward on top, so the
              first thing under the coach's question was a button offering to leave it. Answering is
              what this surface is for and it now comes first; the way out sits under it, at the foot,
              where a leader looks when they have finished rather than while they are still thinking. */}
          {footer}
        </div>
      </div>
    </section>
  );
}
