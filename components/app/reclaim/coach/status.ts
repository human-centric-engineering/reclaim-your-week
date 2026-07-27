/**
 * What to show a leader while the coach is working.
 *
 * The stream has always carried this. `streaming-handler.ts` emits `status` frames — `Thinking...`
 * before the first iteration, `Processing tool results...` after a tool call, `Executing <tool>` for
 * each one, `Summarizing conversation history...` when the transcript is folded — and the leaf's
 * stream route pipes every frame through untouched. The conversation simply dropped them, which is
 * why a leader met an empty paragraph and a blinking bar for the whole of a turn that was calling a
 * tool.
 *
 * **They are translated rather than displayed.** Two reasons, and the first is the hard one: the raw
 * text says `Executing reclaim_audit__record_answers`, which puts an internal slug in front of a
 * leader and describes the tool's plumbing rather than what is happening to them. The second is voice
 * — I1 (the tool never speaks in the first person) and I2 (which binds app-authored coach-voiced copy
 * as much as the agent's own output). So the mapping is total: anything unrecognised falls back to
 * "Thinking…" rather than passing an upstream string through to a screen.
 *
 * "Making a note" is the honest phrase for `record_answers`, and it is worth saying out loud rather
 * than hiding: the capture is silent in the conversation, but a leader who sees a reading appear in
 * the panel should have seen the moment it was written.
 */

/** The one tool whose name is worth translating specifically; every other is a read. */
const CAPTURE = 'record_answers';

export function leaderFacingStatus(message: string | null | undefined): string {
  const raw = (message ?? '').trim();
  if (raw.length === 0) return 'Thinking…';
  if (raw.startsWith('Executing')) {
    return raw.includes(CAPTURE) ? 'Making a note…' : 'Looking back over your audit…';
  }
  if (raw.startsWith('Summarizing')) return 'Gathering the thread…';
  // `Thinking...`, `Processing tool results...`, and anything an upstream release adds later.
  return 'Thinking…';
}
