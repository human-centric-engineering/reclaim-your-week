/**
 * Which part of the run's conversation belongs to which phase.
 *
 * A run has **one** conversation across all seven phases — `AiConversation` stays live until the run
 * completes (I15) — and the transcript was drawn whole on every phase. So a leader on phase 2 met the
 * Phase 2 signpost sitting on top of the entire phase 0 and 1 exchange, and going back to a finished
 * phase could show them a summary of what was recorded but never the conversation that recorded it.
 *
 * `ReclaimAuditRun.phaseMarks` closes that: `{ [phaseKey]: messageId }`, where the id is the **last
 * message that already existed** when the phase was entered. A phase's own messages are therefore
 * everything after its own mark, up to and including the next phase's mark.
 *
 * Pure and client-safe — no Prisma. The server writes the marks, both surfaces read them, and the
 * arithmetic has to be the same on each or the two would disagree about where a phase began.
 */

import { z } from 'zod';
import { RECLAIM_PHASE_KEYS } from '@/lib/app/programme/runs/phases';

/**
 * `phaseMarks` as it comes off a `Json` column or an API response, which is to say: unknown.
 *
 * Validated rather than cast (never `as` on external data). A column that has been hand-edited, or a
 * response from an older build, degrades to `{}` — every phase then reads from the start of the
 * conversation, which is the pre-pagination behaviour and never an error.
 */
export const phaseMarksSchema = z.record(z.string(), z.string());

export type PhaseMarks = z.infer<typeof phaseMarksSchema>;

export function readPhaseMarks(value: unknown): PhaseMarks {
  const parsed = phaseMarksSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}

/**
 * The window of messages belonging to one phase: everything **after** `afterId`, up to and
 * **including** `throughId`.
 *
 * `null` at either end means "no boundary that way" — the start of the conversation, or its end.
 * Phase 0 has no mark of its own (nothing was entered to reach it), so it opens at the start; the
 * phase the leader is on has no later mark yet, so it runs to the end.
 *
 * The upper bound is the next *marked* phase rather than literally the next phase key. They are the
 * same thing while phases are entered in order, and if a phase is ever entered without its mark
 * landing (the conversation did not exist yet), skipping to the next one that has a mark keeps the
 * window continuous instead of collapsing it to nothing.
 */
export interface PhaseWindow {
  afterId: string | null;
  throughId: string | null;
}

export function phaseWindow(marks: PhaseMarks, phaseKey: string): PhaseWindow {
  const index = RECLAIM_PHASE_KEYS.indexOf(phaseKey);
  if (index === -1) return { afterId: null, throughId: null };

  const afterId = marks[phaseKey] ?? null;
  for (let i = index + 1; i < RECLAIM_PHASE_KEYS.length; i += 1) {
    const later = marks[RECLAIM_PHASE_KEYS[i]];
    if (later !== undefined) return { afterId, throughId: later };
  }
  return { afterId, throughId: null };
}

/**
 * Apply a window to an ordered list of things carrying ids.
 *
 * **A mark whose message is gone falls back to the open end**, deliberately. Messages can be erased
 * (a conversation is core-owned and erasure is on its own schedule), and the failure a leader must
 * never see is an empty phase: showing too much of the transcript is a cosmetic regression, showing
 * none of it looks like the audit lost their conversation.
 */
export function sliceByWindow<T extends { id: string }>(items: T[], window: PhaseWindow): T[] {
  const from =
    window.afterId === null ? 0 : items.findIndex((item) => item.id === window.afterId) + 1;

  const throughIndex =
    window.throughId === null ? -1 : items.findIndex((item) => item.id === window.throughId);
  const to = window.throughId === null || throughIndex === -1 ? items.length : throughIndex + 1;

  return items.slice(from, Math.max(from, to));
}
