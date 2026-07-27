'use client';

/**
 * The run's transcript: reading it, cutting it to a phase, and drawing a turn.
 *
 * Extracted from `coach-chat.tsx` when a phase stopped meaning "the whole conversation". Two surfaces
 * now render the same turns — the live conversation, and a finished phase opened again from the spine
 * — and they must draw them identically: a leader going back to phase 1 should meet the conversation
 * they had, in the shape they had it, not a second rendering of it that happens to look similar.
 *
 * What stayed in `coach-chat.tsx` is everything about a turn *in flight*: streaming, the typing
 * animation, the caret, the thinking indicator. None of that means anything to a transcript that has
 * already happened.
 */

import { z } from 'zod';
import { parseEnvelope } from '@/components/app/reclaim/calendar/types';
import { isCoachSyntheticMessage } from '@/lib/app/programme/coach/opening';

/** One message, as either surface draws it. The id is what the phase windows are cut against. */
export interface TranscriptMessage {
  id: string;
  role: 'leader' | 'coach';
  text: string;
  /**
   * A trigger this app sent in the leader's place to make the coach speak first, never shown.
   *
   * Kept in the list rather than filtered out at load, because its **position** is information: it is
   * exactly where the leader pressed the button that produced a beat. A phase re-read later puts the
   * picture of the week back where it appeared, instead of at the end of whatever it can find.
   */
  synthetic: boolean;
}

/**
 * `id` is optional on purpose.
 *
 * It is what the phase windows are cut against, so a response without it cannot be sliced — but the
 * failure mode of *requiring* it is that the whole envelope fails to parse and the leader is shown an
 * empty conversation, which is the one outcome this loader exists to avoid. A message with no id
 * falls back to its position: the transcript still draws, and an unmatched mark degrades to "no
 * boundary", which `sliceByWindow` already treats as the open end.
 */
const transcriptEnvelope = z.object({
  messages: z.array(z.object({ id: z.string().optional(), role: z.string(), content: z.string() })),
});

/**
 * Read the run's transcript back.
 *
 * Only `user` and `assistant` rows become messages: a conversation also carries system and tool rows,
 * and an assistant row can be empty when a turn did nothing but call a capability (which is exactly
 * what a silent `record_answers` call looks like). Best-effort — a leader whose transcript cannot be
 * read should be able to carry on talking, not be locked out of their own audit.
 */
export async function loadTranscript(conversationId: string): Promise<TranscriptMessage[]> {
  try {
    const res = await fetch(`/api/v1/chat/conversations/${conversationId}/messages`);
    if (!res.ok) return [];
    const { messages } = parseEnvelope(await res.json(), transcriptEnvelope);
    return messages
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content.trim().length > 0)
      .map((m, i) => ({
        id: m.id ?? `position-${i}`,
        role: m.role === 'user' ? ('leader' as const) : ('coach' as const),
        text: m.content,
        synthetic: isCoachSyntheticMessage(m.role, m.content),
      }));
  } catch {
    return [];
  }
}

/**
 * A coach turn as the paragraphs it was written in.
 *
 * The coach is told to separate its beats with a blank line: what it heard, then its reading, then
 * the question (see `BRAND_VOICE_INSTRUCTIONS` in `lib/app/programme/agent.ts`). Drawing that in one
 * `whitespace-pre-wrap` block honoured the break as a stray empty line and gave the question no more
 * weight than the sentence before it, which is the opposite of what the break was for.
 *
 * Single newlines stay inside their paragraph and are preserved by `whitespace-pre-wrap`, so a line
 * the coach broke on purpose is not promoted to a full paragraph gap. Empty blocks are dropped: an
 * answer still streaming often ends mid-break, and an empty trailing paragraph would carry the caret
 * off on its own line. A turn with no blank lines at all is simply one paragraph.
 */
export function splitParagraphs(text: string): string[] {
  const parts = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  return parts.length > 0 ? parts : [text];
}

/** The leader's own line. */
export function LeaderLine({ text }: { text: string }) {
  // `bg-accent`, not `bg-muted`. Full-strength cream is this app's *section band* — the signpost, the
  // phase-4 panel, the calendar review, the summary all wear it — so dressing the leader's own words
  // in it made their speech look like another card the app was showing them, directly under a
  // signpost of exactly the same colour. The low-chroma teal tint is the one other surface token the
  // brand defines in both modes, and cool-against-warm separates at a glance.
  //
  // `w-fit` is the other half. A `<p>` is a block, so "hello" was drawn as an 85%-wide band with the
  // text stranded at its left edge — a section, not an utterance. Short answers are most of a time
  // audit ("3", "about 5"), so this is the common case, not the edge one. `max-w` still caps a long
  // answer.
  return (
    <p className="bg-accent text-foreground ml-auto w-fit max-w-[85%] rounded-2xl rounded-tr-sm px-4 py-3 text-[0.95rem] leading-relaxed">
      {text}
    </p>
  );
}

/** A coach turn that has finished arriving. The live one is drawn by `coach-chat.tsx`. */
export function CoachLine({ text }: { text: string }) {
  return (
    // `space-y-4`, a little wider than the line spacing inside a paragraph: enough that the question
    // at the end reads as its own beat, not so much that one turn looks like several.
    <div className="max-w-[92%] space-y-4">
      {splitParagraphs(text).map((paragraph, p) => (
        <p key={p} className="text-foreground text-[1.02rem] leading-relaxed whitespace-pre-wrap">
          {paragraph}
        </p>
      ))}
    </div>
  );
}
