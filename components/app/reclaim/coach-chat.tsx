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
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { parseSseBlock } from '@/lib/api/sse-parser';
import { parseChatStreamEvent } from '@/components/admin/orchestration/chat/chat-events';
import { parseEnvelope } from '@/components/app/reclaim/calendar/types';
import {
  isCoachSyntheticMessage,
  type CoachOpeningMoment,
} from '@/lib/app/programme/coach/opening';

interface Turn {
  role: 'leader' | 'coach';
  text: string;
}

const transcriptEnvelope = z.object({
  messages: z.array(z.object({ role: z.string(), content: z.string() })),
});

/** Set the (in-flight) coach turn — always the last turn — to `text`, immutably. */
function setCoachText(turns: Turn[], text: string): Turn[] {
  const next = [...turns];
  next[next.length - 1] = { role: 'coach', text };
  return next;
}

/**
 * Read the run's transcript back.
 *
 * Only `user` and `assistant` rows become turns: a conversation also carries system and tool rows,
 * and an assistant row can be empty when a turn did nothing but call a capability (which is exactly
 * what a silent `record_answers` call looks like). Best-effort — a leader whose transcript cannot be
 * read should be able to carry on talking, not be locked out of their own audit.
 */
async function loadTranscript(conversationId: string): Promise<Turn[]> {
  try {
    const res = await fetch(`/api/v1/chat/conversations/${conversationId}/messages`);
    if (!res.ok) return [];
    const { messages } = parseEnvelope(await res.json(), transcriptEnvelope);
    return (
      messages
        .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content.trim().length > 0)
        // The trigger that makes the coach speak first is stored as a user row, because `streamChat`
        // has no other shape to put it in. It is ours, not the leader's, so it never comes back as
        // something they said. See `coach/opening.ts` for why it has to exist at all.
        .filter((m) => !isCoachSyntheticMessage(m.role, m.content))
        .map((m) => ({ role: m.role === 'user' ? 'leader' : 'coach', text: m.content }))
    );
  } catch {
    return [];
  }
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
  /** Placeholder before there is any transcript, where the leader is expected to speak first. */
  opener?: string;
}

export function CoachChat({
  runId,
  conversationId,
  onTurnComplete,
  openMoment = null,
  opener,
}: CoachChatProps) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

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
      if (prior.length > 0) setTurns((current) => (current.length === 0 ? prior : current));
      setHydrated(true);
    });
  }, [conversationId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, streaming]);

  // Cancel any in-flight stream on unmount — otherwise the reader keeps running,
  // sets state after unmount, and holds the server generation open (chat-interface.tsx pattern).
  useEffect(() => () => abortRef.current?.abort(), []);

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
      setTurns((t) => [
        ...t,
        ...(leaderText !== null ? [{ role: 'leader' as const, text: leaderText }] : []),
        { role: 'coach' as const, text: '' },
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
              setTurns((t) => setCoachText(t, t[t.length - 1].text + delta));
            } else if (event.type === 'content_reset') {
              // A fallback provider restarts generation from scratch — discard the partial so the
              // retried answer doesn't concatenate onto the abandoned one.
              setTurns((t) => setCoachText(t, ''));
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
          setStreaming(false);
          // Whatever the turn did or failed to do, the run may have moved: the coach records as it
          // goes, so a turn that ended in an error can still have captured something first.
          onTurnComplete?.();
        }
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [runId, onTurnComplete]
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

  return (
    <section className="flex min-h-[26rem] flex-col" aria-label="Conversation with the coach">
      <div ref={scrollRef} className="flex-1 space-y-6 overflow-y-auto pr-1">
        {turns.length === 0 ? (
          <p className="text-muted-foreground max-w-md pt-6 text-[0.95rem] leading-relaxed">
            {opener ??
              'When you are ready, say hello and we will begin. Take your time; there are no wrong answers here.'}
          </p>
        ) : (
          turns.map((turn, i) =>
            turn.role === 'leader' ? (
              <p
                key={i}
                className="bg-muted text-foreground ml-auto max-w-[85%] rounded-2xl rounded-tr-sm px-4 py-3 text-[0.95rem] leading-relaxed"
              >
                {turn.text}
              </p>
            ) : (
              <p
                key={i}
                className="text-foreground max-w-[92%] text-[1.02rem] leading-relaxed whitespace-pre-wrap"
              >
                {turn.text}
                {streaming && i === turns.length - 1 && (
                  <span className="bg-primary ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[0.15em] animate-pulse" />
                )}
              </p>
            )
          )
        )}
      </div>

      {error !== null && (
        <p className="text-muted-foreground border-border mt-4 border-t pt-3 text-sm" role="status">
          {error} You can try again.
        </p>
      )}

      <form
        className="border-border mt-5 flex items-end gap-3 border-t pt-5"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={1}
          placeholder="Write to the coach…"
          aria-label="Your message"
          className="text-foreground placeholder:text-muted-foreground max-h-40 min-h-[2.75rem] flex-1 resize-none bg-transparent py-2 text-[0.98rem] leading-relaxed focus:outline-none"
        />
        <button
          type="submit"
          disabled={streaming || draft.trim().length === 0}
          className="bg-primary text-primary-foreground shrink-0 rounded-full px-6 py-2.5 text-sm font-medium tracking-wide transition-opacity disabled:opacity-40"
        >
          {streaming ? 'Listening' : 'Send'}
        </button>
      </form>
    </section>
  );
}
