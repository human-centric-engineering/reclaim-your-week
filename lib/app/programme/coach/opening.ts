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
  /**
   * The leader has come back from the calendar step, and it has been reconciled.
   *
   * **The beat this closes was silence.** The calendar branch is the one effortful optional thing in
   * the whole audit: a leader exports a file, uploads it, confirms the ambiguous items and answers
   * five questions about what a calendar cannot see. `persistComposite` then rewrites every figure
   * under their chart. Before this moment existed they returned to `/programme` and the conversation
   * said nothing at all — the arrival moment was long since claimed and the reveal had not been
   * asked for, so the transcript simply sat there until they typed something. Having done the work,
   * they had to open the conversation about it themselves.
   *
   * A **data** moment rather than an arrival: it fires on figures the leader has just produced, and
   * the coach's briefing already carries them (`calendar/reading.ts` via `momentForPhase`). Absent
   * from `ARRIVAL_MOMENTS` for that reason, so it opens with `COACH_OPENING_TRIGGER`.
   */
  'phase-1-calendar-return': 'phase-1-current',
  /** Arrival. The energy phase, whose whole value is in why it is worth ten minutes. */
  'phase-2-open': 'phase-2-energy',
  /** Arrival. The week they would want, opened from what the last two phases established. */
  'phase-3-open': 'phase-3-ideal',
  /** Arrival, and a data beat. Current and ideal side by side, with the refer-back (`:305`, I13). */
  'phase-4-gap': 'phase-4-gap',
  /** Arrival, and a data beat. Three ways in, for the leader to choose between (`:322`). */
  'phase-5-action': 'phase-5-action',
  /**
   * Arrival. Phase 6 opens by asking what the leader is taking away, before the summary exists.
   *
   * **This used to be a textarea, and it was the last one.** The audit was rebuilt as a conversation
   * and phase 6 kept asking the question the whole method rests on with a form field, which is the
   * exact complaint P19 fixed everywhere else. The machinery to do otherwise already existed:
   * `reflectionSlugForPhase('phase-6-summary')` returns `reclaim_reflection_p6` and the write
   * allowlist permits the coach to record it, under the same three conditions as every other
   * reflection (this phase only, never inferred, always visible and editable).
   *
   * The source puts this before the artifact on purpose (`Prompt_Text.md:35`): "ask 'what are you
   * taking away from this?' before producing the final summary in Phase 6, one final moment of
   * reflection before the written output."
   */
  'phase-6-open': 'phase-6-summary',
} as const;

/**
 * **`phase-6-close` was here, and it is gone with the surface that fired it.**
 *
 * It was the warm close: a second conversation, rendered *underneath the finished report*, so that
 * the last thing on the screen at the end of the audit was a composer asking what else the leader
 * would like to say. The report is the end of the audit. A screen that has just handed somebody the
 * document forty minutes of work produced should be showing them the document, not inviting another
 * turn — so section 6 now holds exactly one conversation, and the close is said in it
 * (`closingContext` still asks the coach to close warmly after the takeaway lands).
 *
 * Removing the key is safe because moments are only ever *claimed*: a run that already recorded
 * `phase-6-close` in `coachOpenings` keeps a string nothing looks up, and no leader is replayed a
 * beat. Re-adding the name later would replay it for exactly those people, which is the reason this
 * note is here rather than the key.
 */

export type CoachOpeningMoment = keyof typeof COACH_OPENING_PHASES;

/**
 * The moment fired when a leader returns from the calendar step with a reconciled upload.
 *
 * Named here rather than at the call site so the surface and the server refer to one string. Moment
 * names are persisted on the run, so renaming this would replay the beat for anyone mid-audit.
 */
export const CALENDAR_RETURN_MOMENT: CoachOpeningMoment = 'phase-1-calendar-return';

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
 * **Phase 6 is here now, and this comment used to explain why it was not.** It said the takeaway is
 * asked on the screen "because a reflection is the leader's to write (I6)" — which was true when it
 * was written and stopped being true on 2026-07-27, when P19 reversed exactly that refusal and
 * replaced the blanket ban with three narrower guards. The comment outlived the decision it cited
 * by three days, in the file that decides what the coach says first.
 *
 * Phase 6 carries exactly one moment: this one, which asks the takeaway before the artifact exists
 * (`Prompt_Text.md:35`). It had a second — a warm close fired under the rendered report — and both
 * that moment and the conversation it spoke into have been removed; see the note below
 * `COACH_OPENING_PHASES`.
 */
export const ARRIVAL_MOMENTS: Readonly<Record<string, CoachOpeningMoment>> = {
  'phase-0-setup': 'phase-0-open',
  'phase-1-current': 'phase-1-open',
  'phase-2-energy': 'phase-2-open',
  'phase-3-ideal': 'phase-3-open',
  'phase-4-gap': 'phase-4-gap',
  'phase-5-action': 'phase-5-action',
  'phase-6-summary': 'phase-6-open',
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
 * The text sent in the leader's place when a turn that had already reached the conversation is asked
 * for again.
 *
 * **The failure this exists for, observed on a live audit.** The leader answered, the server wrote
 * their message, and the provider returned a 429 before the model said a word. Nothing in the chat
 * path retries: `chatStream` opens the provider stream without the backoff `withRetry` gives the
 * non-streaming path, and the handler's only recovery is failing over to a *different* provider,
 * which a single-provider install does not have. So the turn ended with the leader's sentence in the
 * conversation, no reply under it, and a line telling them to ask the coach to pick it up. The one
 * thing they could not do was press a button.
 *
 * They cannot simply say it again: the words are already persisted, and re-sending them would put the
 * same sentence in the audit twice and invite the coach to record the reading twice with it. So this
 * asks for the turn that was lost rather than the message that produced it, and it is a stage
 * direction for the same three reasons `COACH_OPENING_TRIGGER` is: it stays in the model's history
 * for the rest of the run, it never reaches the leader's screen (both surfaces filter it), and
 * anybody reading the row in a database can tell what it is.
 *
 * **It says not to mention the interruption**, which is a product decision rather than a stylistic
 * one. The screen has already told the leader what happened, in the app's own voice; a coach opening
 * with an apology for a provider error would be the audit talking about itself at exactly the moment
 * the leader is waiting to be answered.
 */
export const COACH_RESUME_TRIGGER =
  '(Your reply to the leader was lost before it reached them: the connection dropped after they spoke and nothing you said arrived. They have seen no answer and have not spoken again. Take that turn now, from their last message, exactly as you would have. Do not apologise, do not mention the interruption, and do not ask them to repeat themselves.)';

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
  COACH_RESUME_TRIGGER,
];

/** Which trigger a moment is opened with. Arrivals introduce the phase; the rest open a beat. */
export function openingTriggerFor(moment: CoachOpeningMoment): string {
  return isArrivalMoment(moment) ? COACH_ARRIVAL_TRIGGER : COACH_OPENING_TRIGGER;
}

/** Whether a stored message is one of our triggers rather than something the leader wrote. */
export function isCoachSyntheticMessage(role: string, content: string): boolean {
  return role === 'user' && COACH_SYNTHETIC_MESSAGES.includes(content.trim());
}
