'use client';

/**
 * The coach conversation (F4 t-4) — the consumer SSE client over the module surface stream. A calm,
 * letter-like exchange, not a chat-bubble dashboard: the coach speaks in the page's ink, the leader's
 * lines sit in a soft band to the right. Streams one turn at a time via `fetch` + `getReader()` (the
 * module route the admin chat only references). Shell only — live turns, no transcript rehydration on
 * reload yet (the conversation persists server-side; showing prior turns is a later task).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { parseSseBlock } from '@/lib/api/sse-parser';
import { parseChatStreamEvent } from '@/components/admin/orchestration/chat/chat-events';

const STREAM_URL = '/api/v1/framework/modules/reclaim-audit/chat/stream';

interface Turn {
  role: 'leader' | 'coach';
  text: string;
}

/** Set the (in-flight) coach turn — always the last turn — to `text`, immutably. */
function setCoachText(turns: Turn[], text: string): Turn[] {
  const next = [...turns];
  next[next.length - 1] = { role: 'coach', text };
  return next;
}

export function CoachChat() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, streaming]);

  // Cancel any in-flight stream on unmount — otherwise the reader keeps running,
  // sets state after unmount, and holds the server generation open (chat-interface.tsx pattern).
  useEffect(() => () => abortRef.current?.abort(), []);

  const send = useCallback(async () => {
    const message = draft.trim();
    if (message.length === 0 || streaming) return;
    setError(null);
    setDraft('');
    setTurns((t) => [...t, { role: 'leader', text: message }, { role: 'coach', text: '' }]);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch(STREAM_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
        signal: controller.signal,
      });
      if (!res.ok || res.body === null)
        throw new Error(`The coach could not be reached (${res.status}).`);

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
      if (!controller.signal.aborted) setStreaming(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [draft, streaming]);

  return (
    <section className="flex min-h-[26rem] flex-col" aria-label="Conversation with the coach">
      <div ref={scrollRef} className="flex-1 space-y-6 overflow-y-auto pr-1">
        {turns.length === 0 ? (
          <p className="text-muted-foreground max-w-md pt-6 text-[0.95rem] leading-relaxed">
            When you are ready, say hello and we will begin. Take your time; there are no wrong
            answers here.
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
