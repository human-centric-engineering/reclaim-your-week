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
 */

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { parseSseBlock } from '@/lib/api/sse-parser';
import { parseChatStreamEvent } from '@/components/admin/orchestration/chat/chat-events';
import { ThinkingIndicator } from '@/components/admin/orchestration/chat/thinking-indicator';
import { useTypingAnimation } from '@/lib/hooks/use-typing-animation';
import { leaderFacingStatus } from '@/components/app/reclaim/coach/status';
import type { CoachOpeningMoment } from '@/lib/app/programme/coach/opening';
import {
  loadTranscript,
  splitParagraphs,
  CoachLine,
  LeaderLine,
} from '@/components/app/reclaim/coach/transcript';
import { phaseWindow, sliceByWindow, type PhaseMarks } from '@/lib/app/programme/runs/phase-marks';

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

/** Set the (in-flight) coach turn — always the last turn — to `text`, immutably. */
function setCoachText(turns: Turn[], text: string): Turn[] {
  const next = [...turns];
  next[next.length - 1] = { ...next[next.length - 1], role: 'coach', text };
  return next;
}

export interface CoachChatProps {
  runId: string;
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
  /** Rendered directly above the composer, where a move onward belongs: always in reach, never lost. */
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

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
  useEffect(() => () => abortRef.current?.abort(), []);

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
      setStatus(null);
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
      try {
        const res = await fetch(`/api/v1/app/reclaim/runs/${runId}/coach/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (!res.ok || res.body === null)
          throw new Error(`The coach could not be reached (${res.status}).`);

        // An opening whose moment was already claimed answers in JSON rather than SSE. Nothing has
        // gone wrong: this run has had that beat, so drop the placeholder and leave the transcript
        // exactly as it was.
        if (res.headers.get('content-type')?.includes('application/json')) {
          setTurns((t) => t.slice(0, -1));
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
              throw new Error(event.message);
            }
          }
        }
      } catch (e) {
        if (controller.signal.aborted) return; // unmounted / superseded — leave state untouched
        setError(e instanceof Error ? e.message : 'Something interrupted the conversation.');
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

  const send = useCallback(async () => {
    const message = draft.trim();
    if (message.length === 0 || streaming) return;
    setDraft('');
    await runTurn({ kind: 'leader', message }, message);
  }, [draft, streaming, runTurn]);

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
    const paragraphs = splitParagraphs(text);
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
              {paragraph}
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
              {opener ??
                'The coach is opening this part. Take your time; there are no wrong answers here.'}
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
            <p className="text-muted-foreground border-border border-t pt-3 text-sm" role="status">
              {error} You can try again.
            </p>
          )}
        </div>
      </div>

      <div className="border-border/60 shrink-0 border-t px-4 py-4 sm:px-6">
        <div className="mx-auto max-w-3xl space-y-3">
          {footer}
          <form
            className="border-border bg-background focus-within:border-primary/50 flex items-end gap-3 rounded-2xl border px-4 py-2 transition-colors"
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
        </div>
      </div>
    </section>
  );
}
