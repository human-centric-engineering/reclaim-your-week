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
import { RECLAIM_BUCKETS } from '@/lib/app/programme/content';

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

/**
 * The nine areas as the coach says them out loud, longest first.
 *
 * The titles are written with an ampersand (`Learning & development`) and spoken with a word
 * (`learning and development`), so each is matched either way, at any casing, across any run of
 * whitespace — the coach's own wording is what gets drawn, this only says where it starts and ends.
 * Longest first because the alternation is ordered: a shorter name that is a prefix of a longer one
 * must not win.
 */
const AREA_NAMES = new RegExp(
  `\\b(${[...RECLAIM_BUCKETS]
    .map((b) => b.title)
    .sort((a, b) => b.length - a.length)
    .map((title) =>
      title
        .split(/\s*&\s*/)
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'))
        .join('\\s+(?:&|and)\\s+')
    )
    .join('|')})\\b`,
  'i'
);

/**
 * The area a question is about, marked for the leader when the coach did not mark it itself.
 *
 * **Why this exists rather than trusting the instruction.** The coach is asked to wrap the phrase
 * (see `BRAND_VOICE_INSTRUCTIONS`), and when it does, that is what is drawn. But the pinned model is
 * `gpt-4o`, which already ignores the older and blunter prohibition in the same block against opening
 * with "Certainly" — so a leader's ability to see what they are being asked cannot rest on the model
 * remembering a formatting rule twenty turns in. The nine area names are known, finite and authored
 * (`RECLAIM_BUCKETS`), so where the coach names one, this app can mark it with no model in the loop.
 *
 * Deliberately narrow. Only the **first** name in a paragraph, so a question mentioning two does not
 * become a highlighter; only when the turn carries no `**` of its own, so the coach's judgement always
 * wins over this fallback; and the caller only asks for it on the paragraph holding the question. The
 * coach is told to put the question last and in a paragraph of its own, so marking the area where it
 * is *reflected back* would emphasise the sentence the leader has already read.
 */
function markKnownArea(text: string): string {
  return text.replace(AREA_NAMES, '**$1**');
}

/**
 * The few words a question turns on, drawn so they can be found without reading the turn twice.
 *
 * Two things can mark them: the coach, with `**…**`, and this app, with `markKnownArea` when the
 * coach did not. `**` is the only markup either surface understands. A leader half-way down a
 * nineteen-reading section is asked about a different area every turn or two, and the name of that
 * area was previously indistinguishable from the sentence carrying it: the question was legible but
 * not *scannable*, and the panel beside it lists the same nineteen names in bold. This closes that
 * gap.
 *
 * **Deliberately not a markdown renderer.** The voice bans bullets, headings and tables in
 * conversation, so parsing them would only give the model permission to use them. Bold is the whole
 * grammar, and there is no `dangerouslySetInnerHTML` anywhere near it: the parts come back as React
 * nodes, so a leader who types `**` at the coach can never inject anything.
 *
 * **The streaming tail is the interesting case.** Words arrive two characters at a time, so a marker
 * spends a frame as `*` and the closing pair does not exist yet for as long as the phrase takes to
 * type. An unclosed `**` therefore opens emphasis for whatever has arrived since, and a lone trailing
 * `*` is dropped: the phrase brightens as it is spoken instead of the leader watching asterisks land
 * and then vanish.
 *
 * `markArea` is the caller saying "this paragraph is the question, and nothing in this turn was
 * marked" — see `coachParagraphs`, which is what both surfaces actually call.
 */
export function renderEmphasis(rawText: string, markArea = false): React.ReactNode[] {
  const text = markArea ? markKnownArea(rawText) : rawText;
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  let key = 0;
  const strong = (content: string) => (
    <strong key={(key += 1)} className="text-foreground font-semibold">
      {content}
    </strong>
  );

  for (const match of text.matchAll(/\*\*([^*]+)\*\*/g)) {
    const at = match.index;
    if (at > cursor) nodes.push(text.slice(cursor, at));
    nodes.push(strong(match[1]));
    cursor = at + match[0].length;
  }

  const tail = text.slice(cursor);
  const opening = tail.indexOf('**');
  if (opening >= 0) {
    if (opening > 0) nodes.push(tail.slice(0, opening));
    const arrived = tail.slice(opening + 2);
    if (arrived.length > 0) nodes.push(strong(arrived));
  } else {
    const trimmed = tail.endsWith('*') ? tail.slice(0, -1) : tail;
    if (trimmed.length > 0) nodes.push(trimmed);
  }
  return nodes;
}

/** One paragraph of a coach turn, and whether this app should mark the area named in it. */
export interface CoachParagraph {
  text: string;
  markArea: boolean;
}

/**
 * A coach turn split into its paragraphs, with the question's paragraph flagged.
 *
 * The flag is what keeps the fallback honest, and it is off in three cases. When the coach marked
 * something itself, its judgement stands and nothing is added. When the paragraph is not the last
 * one, it is a reflection or an observation rather than the question. And **while the turn is still
 * arriving**: the "last paragraph" of a half-spoken turn is whichever one is being typed, so marking
 * it would bold an area named in the reflection and then unbold it the moment the question began.
 * The mark lands when the turn settles, which is the same beat the leader starts reading it.
 */
export function coachParagraphs(text: string, live = false): CoachParagraph[] {
  const parts = splitParagraphs(text);
  const eligible = !live && !text.includes('**');
  return parts.map((paragraph, i) => ({
    text: paragraph,
    markArea: eligible && i === parts.length - 1,
  }));
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
      {coachParagraphs(text).map((paragraph, p) => (
        <p key={p} className="text-foreground text-[1.02rem] leading-relaxed whitespace-pre-wrap">
          {renderEmphasis(paragraph.text, paragraph.markArea)}
        </p>
      ))}
    </div>
  );
}
