/**
 * The moments where the coach speaks first, and the trigger that makes that possible.
 *
 * Most of a phase opens from the signpost card (`runs/signposts.ts`), which costs nothing and is
 * Rashmir's to edit. Four moments cannot: they need figures the leader has just produced in front of
 * them, and a scripted card cannot name a gap it has not seen. Those are the moments here.
 *
 * **Pure on purpose.** No Prisma, no framework imports, so the client can import the moment names and
 * the trigger text exactly as it imports `phase-slots.ts`.
 *
 * ## Why there is a synthetic message at all
 *
 * `streamChat` takes a required non-empty `message` and persists it as a `role:'user'` row *before*
 * the model is called (`lib/orchestration/chat/streaming-handler.ts`). Nothing in Sunrise, Daybreak or
 * the `AiAgent` schema has any concept of an agent speaking first: there is no greeting field, no
 * opener, no way to mark a turn as system-triggered. `AiMessage.metadata` exists and is written only
 * by the framework's own `persistMessage`, so a leaf cannot even tag the row after the fact without
 * writing to a core-owned table.
 *
 * So the leaf sends a message. Both halves of that gap are filed as asks
 * ([[daybreak-asks]]); until one lands, three properties keep this honest:
 *
 *  1. **It reads as a stage direction, not a leader's line.** It stays in the model's history for the
 *     rest of the run, so it has to make sense to a model reading back over the conversation. A magic
 *     token would not.
 *  2. **It never reaches the leader's screen**, live or on reload — `coach-chat.tsx` filters it.
 *  3. **It cannot reach the leader's data export.** Worth stating because it was worth checking:
 *     `admin/export.ts` covers the ten `app_reclaim_*` tables plus `framework_slot_value`, and
 *     carries no transcript at all, so there is nothing here to filter. If a future export ever
 *     includes `ai_message`, it must filter `COACH_SYNTHETIC_MESSAGES` — a leader who asks for their
 *     data should never find a message attributed to them that they did not send.
 */

/**
 * The moments the coach opens, and the phase each belongs to.
 *
 * The phase pairing is enforced **server-side**: the route reads the leader's phase from the journey
 * and refuses a moment that does not match, so a client cannot ask for the gap presentation while the
 * leader is still on phase 1. The client sends the moment; it never sends the phase.
 */
export const COACH_OPENING_PHASES = {
  /** The perception-versus-reality picture has just been revealed (I12, `Prompt_Text.md:229-237`). */
  'phase-1-chart-reveal': 'phase-1-current',
  /** Current and ideal side by side, with the refer-back (`:305`, I13). */
  'phase-4-gap': 'phase-4-gap',
  /** Three ways in, for the leader to choose between (`:322`). */
  'phase-5-action': 'phase-5-action',
  /**
   * The warm close, after the summary has rendered (`:359`, `:361`).
   *
   * A moment rather than a card because it is the one part of the close that genuinely varies: it
   * branches on whether the leader is already working with Rashmir, on whether they have done this
   * before, and it answers their own takeaway in their own words. The *question* that opens phase 6
   * is scripted on the card instead — "what are you taking away from this?" is the same question
   * every time, so a model turn would buy nothing.
   */
  'phase-6-close': 'phase-6-summary',
} as const;

export type CoachOpeningMoment = keyof typeof COACH_OPENING_PHASES;

export const COACH_OPENING_MOMENTS = Object.keys(COACH_OPENING_PHASES) as [
  CoachOpeningMoment,
  ...CoachOpeningMoment[],
];

/** Whether this moment belongs to this phase. The route's refusal reads from here. */
export function openingBelongsToPhase(moment: CoachOpeningMoment, phaseKey: string): boolean {
  return COACH_OPENING_PHASES[moment] === phaseKey;
}

/**
 * The text sent as the leader's turn when the coach opens a moment.
 *
 * Written as a parenthetical stage direction so that a model reading the transcript back understands
 * it as instruction rather than as something the leader said, and so that anyone who ever sees it in
 * a database row can tell immediately what it is.
 */
export const COACH_OPENING_TRIGGER =
  '(The leader has just arrived at this moment and has not spoken yet. Open it the way your context describes, then stop and wait for them.)';

/**
 * Every trigger string this app has ever shipped.
 *
 * A list rather than a constant because the filters have to keep working on transcripts written by
 * older builds. Changing `COACH_OPENING_TRIGGER` means **appending** the old value here, never
 * replacing it: a leader whose audit spans a deploy would otherwise find the old trigger surfacing in
 * their transcript as though they had written it.
 */
export const COACH_SYNTHETIC_MESSAGES: readonly string[] = [COACH_OPENING_TRIGGER];

/** Whether a stored message is one of our triggers rather than something the leader wrote. */
export function isCoachSyntheticMessage(role: string, content: string): boolean {
  return role === 'user' && COACH_SYNTHETIC_MESSAGES.includes(content.trim());
}
