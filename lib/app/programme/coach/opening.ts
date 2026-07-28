/**
 * The moments where the coach speaks first, and the triggers that make that possible.
 *
 * **Every phase now opens with the coach speaking.** It used to be four moments, the ones that need
 * figures the leader has just produced in front of them, with every other phase opening from the
 * signpost card and then sitting in silence until the leader typed something. The screen said "when
 * you are ready, say hello and we will begin", which asks a person who came here to be guided to do
 * the guiding. A phase that has just told someone what it involves and then waits for them is a form
 * with a chat box on it.
 *
 * So there are two kinds of moment here and the difference is worth holding on to:
 *
 *  - **Arrival moments** (`ARRIVAL_MOMENTS`) fire the instant a leader reaches a phase. The coach
 *    says why this part is worth their time and what to expect, then asks the first question. Every
 *    phase the leader converses through has one.
 *  - **Data moments** are the beats that need arithmetic in front of them: the picture of their week,
 *    the gap, the three ways in, the close. A scripted card cannot name a gap it has not seen.
 *
 * Phases 4 and 5 are both: their arrival *is* the data beat, so one moment serves both jobs and they
 * appear in `ARRIVAL_MOMENTS` under their existing names. Moment names are persisted on the run
 * (`ReclaimAuditRun.coachOpenings`), so renaming one would replay a beat a leader has already had.
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
  /** Arrival. The audit's first words after the welcome card, and the first question of the setup. */
  'phase-0-open': 'phase-0-setup',
  /** Arrival. Opens the long phase, before any area has been asked about. */
  'phase-1-open': 'phase-1-current',
  /** The perception-versus-reality picture has just been revealed (I12, `Prompt_Text.md:229-237`). */
  'phase-1-chart-reveal': 'phase-1-current',
  /** Arrival. The energy phase, whose whole value is in why it is worth ten minutes. */
  'phase-2-open': 'phase-2-energy',
  /** Arrival. The week they would want, opened from what the last two phases established. */
  'phase-3-open': 'phase-3-ideal',
  /** Arrival, and a data beat. Current and ideal side by side, with the refer-back (`:305`, I13). */
  'phase-4-gap': 'phase-4-gap',
  /** Arrival, and a data beat. Three ways in, for the leader to choose between (`:322`). */
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
 * The moment fired the instant a leader reaches a phase, per phase.
 *
 * Phase 6 is absent on purpose. Its close is a data moment that fires *after* the summary has
 * rendered (`phase/phase6-panel.tsx`), and there is no conversation to arrive into before that: the
 * takeaway is asked on the screen itself, because a reflection is the leader's to write (I6).
 */
export const ARRIVAL_MOMENTS: Readonly<Record<string, CoachOpeningMoment>> = {
  'phase-0-setup': 'phase-0-open',
  'phase-1-current': 'phase-1-open',
  'phase-2-energy': 'phase-2-open',
  'phase-3-ideal': 'phase-3-open',
  'phase-4-gap': 'phase-4-gap',
  'phase-5-action': 'phase-5-action',
};

/** The moment that opens this phase on arrival, or `null` for a phase nobody arrives into talking. */
export function arrivalMomentFor(phaseKey: string): CoachOpeningMoment | null {
  return ARRIVAL_MOMENTS[phaseKey] ?? null;
}

/** Whether this moment is a phase arrival rather than one of the beats built from figures. */
export function isArrivalMoment(moment: CoachOpeningMoment): boolean {
  return Object.values(ARRIVAL_MOMENTS).includes(moment);
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
 * The text sent as the leader's turn when the coach opens a phase they have just walked into.
 *
 * Separate from `COACH_OPENING_TRIGGER` because the job is different, and it is the job the leader
 * was doing before this existed. "Open it the way your context describes" is right for a beat built
 * from figures; a phase arrival needs the coach to say why this part is worth the next ten minutes
 * before it starts asking, and then to ask rather than to wait.
 */
export const COACH_ARRIVAL_TRIGGER =
  '(The leader has just arrived at this phase and has not spoken yet. You speak first. Say briefly why this part of the audit is worth their time and what to expect from it, without restating the card already on their screen. Then open the phase the way your context describes, end on your first question, and stop. Do not wait for them to begin.)';

/**
 * Every trigger string this app has ever shipped.
 *
 * A list rather than a constant because the filters have to keep working on transcripts written by
 * older builds. Changing a trigger means **appending** the old value here, never replacing it: a
 * leader whose audit spans a deploy would otherwise find the old trigger surfacing in their
 * transcript as though they had written it.
 */
export const COACH_SYNTHETIC_MESSAGES: readonly string[] = [
  COACH_OPENING_TRIGGER,
  COACH_ARRIVAL_TRIGGER,
];

/** Which trigger a moment is opened with. Arrivals introduce the phase; the rest open a beat. */
export function openingTriggerFor(moment: CoachOpeningMoment): string {
  return isArrivalMoment(moment) ? COACH_ARRIVAL_TRIGGER : COACH_OPENING_TRIGGER;
}

/** Whether a stored message is one of our triggers rather than something the leader wrote. */
export function isCoachSyntheticMessage(role: string, content: string): boolean {
  return role === 'user' && COACH_SYNTHETIC_MESSAGES.includes(content.trim());
}
