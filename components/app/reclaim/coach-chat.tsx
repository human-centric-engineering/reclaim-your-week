'use client';

/**
 * The coach conversation (F4 t-4) — the consumer SSE client over the module surface stream. A calm,
 * letter-like exchange, not a chat-bubble dashboard: the coach speaks in the page's ink, the leader's
 * lines sit in a soft band to the right. Streams one turn at a time via `fetch` + `getReader()` (the
 * module route the admin chat only references). Shell only — live turns, no transcript rehydration on
 * reload yet (the conversation persists server-side; showing prior turns is a later task).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';

const STREAM_URL = '/api/v1/framework/modules/reclaim-audit/chat/stream';

/** The stream events this client acts on (the handler emits more; we ignore the rest). */
const eventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start'), conversationId: z.string() }),
  z.object({ type: z.literal('content'), delta: z.string() }),
  z.object({ type: z.literal('done') }),
  z.object({ type: z.literal('error'), message: z.string().optional() }),
]);

interface Turn {
  role: 'leader' | 'coach';
  text: string;
}

export function CoachChat() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, streaming]);

  const send = useCallback(async () => {
    const message = draft.trim();
    if (message.length === 0 || streaming) return;
    setError(null);
    setDraft('');
    setTurns((t) => [...t, { role: 'leader', text: message }, { role: 'coach', text: '' }]);
    setStreaming(true);

    try {
      const res = await fetch(STREAM_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
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
          const dataLine = block.split('\n').find((l) => l.startsWith('data:'));
          if (dataLine === undefined) continue;
          let json: unknown;
          try {
            json = JSON.parse(dataLine.slice(5).trim());
          } catch {
            continue;
          }
          const parsed = eventSchema.safeParse(json);
          if (!parsed.success) continue;
          if (parsed.data.type === 'content') {
            const { delta } = parsed.data;
            setTurns((t) => {
              const next = [...t];
              next[next.length - 1] = { role: 'coach', text: next[next.length - 1].text + delta };
              return next;
            });
          } else if (parsed.data.type === 'error') {
            throw new Error(parsed.data.message ?? 'The coach ran into a problem.');
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something interrupted the conversation.');
    } finally {
      setStreaming(false);
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
