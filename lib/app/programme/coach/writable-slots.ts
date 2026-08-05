/**
 * What the coach may write, and what it may never write (I6).
 *
 * The conversational coach captures audit answers directly, which the original lockdown forbade
 * outright. The hazard that lockdown named — a model-supplied run key writing one leader's answers
 * into another's run — is gone, because the run id now comes from the server-issued dispatch scope
 * (`./scope.ts`). What is *not* gone is everything else I6 was quietly protecting, so the permission
 * is an allowlist of groups rather than "any registered slug", and two groups are refused in code:
 *
 * - **`reclaim_share`** — `reclaim_share_with_coach` and `reclaim_share_quotable` decide whether a
 *   leader's words may be republished. An agent that can write consent can manufacture it.
 * - **`reclaim_calendar` and `reclaim_composite`** — computed lanes whose privacy story is that they
 *   hold deterministic per-bucket totals and nothing else. Model-derived numbers in there would make
 *   that story false. **Three slugs inside `reclaim_calendar` are the exception**; see
 *   `COACH_WRITABLE_SLOTS_IN_REFUSED_GROUPS` below.
 *
 * ## `reclaim_reflection` was the third refusal, and is now a narrowed permission
 *
 * The refusal read: the reflection slots are the phase gate, so a coach that can write one can open
 * its own gate. That is true of the mechanism and wrong about the product. The reflection was left as
 * a textarea under the transcript — the one question the whole coaching method is built around, asked
 * by a form field, in a tool whose source says "this should feel like a coaching conversation, not a
 * form". **The point of the coach is to help a leader articulate themselves**, and a leader who has
 * just said the thing out loud should not have to type it again to be allowed to move on.
 *
 * What did not change: **I9 is untouched.** The transition route still refuses to leave a phase until
 * `reclaim_reflection_p<N>` exists for this run. Only the *writer* moved. Three narrower guards stand
 * in place of the blanket refusal:
 *
 * 1. **The phase, from the server** — the one that is genuinely enforced. A reflection may only be
 *    written for the phase in the dispatch scope, which the route derives from the journey
 *    (`buildCoachScope`) and the model never sees. A conversation in phase 2 cannot record phase 4's
 *    reflection, and cannot record five of them at once to clear the gates ahead. This is what bounds
 *    the change: whatever the coach does, it does it in the phase the leader is sitting in.
 * 2. **Never inferred** — a discipline, not a boundary, and it is worth being exact about which.
 *    `sourceType: 'inferred'` is refused for a reflection, but the **model chooses that value**, so a
 *    reflection it made up and labelled `direct` passes this check. What the rule buys is that the
 *    documented path is the honest one and a well-behaved coach is told plainly what is expected;
 *    what it does not buy is a control. Compare the leader-facing `answers` route, which takes a
 *    `confirming` **boolean** rather than a client-chosen `sourceType` for exactly this reason: a
 *    caller naming its own provenance is not evidence. The residual risk is bounded and
 *    self-affecting — the worst case is the current phase's reflection recorded unprompted, in the
 *    leader's own run, where guard 3 puts it in front of them. **Do not lean on this as enforcement.**
 * 3. **Visible and editable.** The recorded reflection is shown to the leader in their own words, in
 *    the captured panel, where changing it writes over the top. That is the same honesty mechanism an
 *    inferred reading already gets, and — given exactly what guard 2 is not — it is the real backstop:
 *    a sentence the leader can see and replace is a sentence they still own.
 *
 * ## The two layers, and what each actually holds
 *
 * This module is the product rule: which slugs, and the typed-value rule. The agent's capability
 * grant carries an `ExposureConfig` naming the permitted **groups**, which the capability now reads
 * from `context.customConfig` and enforces through the framework's own `facetAllows`.
 *
 * **That second layer used to be documentation rather than code.** This header, `agent.ts` and I6 all
 * said `facetAllows` enforced the allowlist a second time; it does not run for a module capability
 * unless the capability calls it, and `record_answers` never did, so the grant's `customConfig` was
 * inert data. The writes were still correctly constrained — by this file, which is the layer that
 * actually ran — but a rule documented as held twice and held once is worse than one held once and
 * known to be. Found by reading the code rather than the docblock while planning the conversational
 * stages; the capability now reads the grant, and `agent-caps.test.ts` exercises the real
 * `facetAllows` instead of a local mirror of it.
 */

import type { Prisma } from '@prisma/client';
import { SLOT_DATA_TYPE } from '@/lib/framework/data-slots/vocabulary';
import { validateTypedValue } from '@/lib/framework/data-slots/capabilities/typed-value';
import { reclaimSlotDefinitions } from '@/lib/app/programme/slots';
import { reflectionSlugForPhase } from '@/lib/app/programme/runs/phases';
import type { SlotDefinitionInput } from '@/lib/framework/data-slots';

/** The group holding the six per-phase reflection slots, which are written under extra conditions. */
export const REFLECTION_GROUP = 'reclaim_reflection';

/** Slot groups the coach may write from conversation. */
export const COACH_WRITABLE_GROUPS: readonly string[] = [
  'reclaim_profile',
  'reclaim_setup',
  'reclaim_current',
  'reclaim_energy',
  'reclaim_ideal',
  'reclaim_gap',
  'reclaim_action',
  REFLECTION_GROUP,
];

/**
 * How a reading was come by, for the reflection rule. Mirrors `SLOT_SOURCE_TYPE`, and only one member
 * is load-bearing here: an inferred reflection is a reflection the leader did not have.
 */
const INFERRED = 'inferred';

/**
 * Groups the coach may never write, each with the sentence the model is told when it tries. The
 * refusal is worth explaining rather than stonewalling: a coach that knows *why* it cannot record a
 * sharing choice can do the right thing instead, which is to offer it on screen.
 */
export const COACH_REFUSED_GROUPS: Readonly<Record<string, string>> = {
  reclaim_share:
    'Sharing choices are consent and only the leader can give it. Offer the choice on screen instead.',
  reclaim_calendar:
    'Calendar figures are computed from an uploaded calendar, never from conversation. The two questions you ask before an upload are the exception and you may record those.',
  reclaim_composite:
    'The reconciled picture is computed from the calendar and the estimates, never from conversation.',
};

/**
 * Slugs inside a refused group that the coach **may** write, because they are the leader's own answer
 * rather than a computed lane.
 *
 * `reclaim_calendar` was refused wholesale on the reading that the group holds deterministic
 * per-bucket totals whose privacy story (I4) and arithmetic (I-composite) must never admit a
 * model-derived number. That reading is right about most of the group and wrong about two members.
 * `completeness` and `period` are the answers to two questions the source explicitly tells the tool
 * to **ask**, before any file exists — "how much does your calendar reflect your actual working
 * life?" and "what period would you like me to analyse?" — and the first of those modulates how every
 * later figure is framed. A conversation that cannot record the answer to a question it was told to
 * ask captures nothing at the one point where the whole framing is decided.
 *
 * `reclaim_calendar_declined` is the third, and it is the same argument about the *other* answer to
 * the same question. The branch is offered once and a no is meant to end it, but the briefing is
 * rebuilt from the run's answers on every turn, so nothing carried the refusal forward and the coach
 * asked again — the one thing the offer's own wording promises it will not do. A leader's "no thank
 * you" is their answer, not a computed figure, and it has to be recordable from the conversation it
 * was said in. The leader can also press it on screen (the offer card's "Not now"), which is the
 * deterministic half; this is the half that catches a decline said in prose.
 *
 * The other four self-reports in this group (`switch_frequency`, `reactive_time`, `offcal_work`,
 * `messaging_load`) stay refused. They are asked on the review screen after the upload, which is
 * where they belong, and opening them here would hand the coach four questions with no beat to ask
 * them in.
 *
 * Expressed in code alone, not on the grant: `facetSchema` is strict on `{ groups, scopes }`, so a
 * slug-level allowlist cannot be stated as data. Logged as a Daybreak ask.
 */
export const COACH_WRITABLE_SLOTS_IN_REFUSED_GROUPS: readonly string[] = [
  'reclaim_calendar_completeness',
  'reclaim_calendar_period',
  'reclaim_calendar_declined',
];

/**
 * The typed form of a reading, read out of the prose when the coach did not send one separately.
 *
 * **This does not soften the typed-value rule; it stops the rule firing on cases it was never
 * about.** The rule exists because "about eight, some weeks more" must not reach a chart as a number
 * — a figure invented from a hedge is worse than no figure, and it fails silently. That reasoning
 * has nothing to say about "25", which is a figure the leader gave and the coach passed on in the
 * only field it had for it. Refusing that spends a turn asking the coach to move a value from one
 * key to another, and in practice the coach moved on to the next question instead and the reading
 * was lost. (Observed: a leader who answered six slots in one sentence and got an empty panel.)
 *
 * So the derivation is deliberately narrow and admits nothing that requires interpretation:
 *
 * - **number** — the string names exactly one figure, and that figure is the reading. "25" yes, and
 *   so are "25 hours" and "roughly 25", because the words around a single figure change how sure the
 *   leader is of it and never what it is. "twenty five" no: spelled out, there is no figure to parse.
 *   "2 to 3", "8-10" and "5 on Mondays and 2 on Fridays" no, and this is the case the rule is for —
 *   a string naming two figures needs someone to choose between them, which is a reading and not a
 *   parse. The coach's way through that refusal is to offer one figure back and let the leader agree
 *   it, which is the same way through it has always had.
 *
 *   This was once "the whole trimmed string is a finite number", which refused "25 hours" on the
 *   grounds that it needed interpreting. It does not — but the tool telling the coach to write a
 *   figure the way the leader said it (see `record-answers.ts`) would have collided with a gate that
 *   only accepted naked ones, and the reading would have been refused for being well phrased. A
 *   single figure in a sentence is unambiguous, and nothing below this line reads the sentence.
 * - **boolean** — the whole trimmed string is one of the four words a yes or a no is written as.
 *   Anything longer is a sentence, and a sentence about a yes-or-no slot is the coach's summary of
 *   an answer rather than the answer.
 * - **date** — an ISO-8601 string, which `validateTypedValue` then re-checks on its own terms.
 * - **json** — never. There is no unambiguous structure to read out of prose, and the slots that
 *   want one (the three action options) are built by the coach rather than spoken by the leader.
 *
 * Everything derived here goes back through `validateTypedValue` below, so this widens what may be
 * *offered* as a typed value and changes nothing about what may be *stored* as one.
 */
export function deriveTypedValue(dataType: string, value: string): unknown {
  const text = value.trim();
  switch (dataType) {
    case SLOT_DATA_TYPE.number: {
      // Every figure in the string, so "one and only one" is a decision this can actually make.
      const figures = text.match(/-?\d+(?:\.\d+)?/g);
      if (figures === null || figures.length !== 1) return undefined;
      const n = Number(figures[0]);
      return Number.isFinite(n) ? n : undefined;
    }
    case SLOT_DATA_TYPE.boolean: {
      const word = text.toLowerCase().replace(/[.!]$/, '');
      if (word === 'yes' || word === 'true') return true;
      if (word === 'no' || word === 'false') return false;
      return undefined;
    }
    case SLOT_DATA_TYPE.date:
      return text;
    default:
      return undefined;
  }
}

/**
 * What a figure is called, for the slots whose prose reading would otherwise be a naked number.
 *
 * A number slot stores its reading twice: `valueJson` for everything that computes, and `value` for
 * everything a person reads. The two writers here both had a reason to put the bare figure in the
 * prose — the coach because a count arrived as a count, the sweep because its schema has no
 * `valueJson` at all and the figure must travel in `value` to be derived from — and the result was a
 * captured panel that said **"Deep work, hours a week: 5"**. A row whose value is "5" is a row that
 * only makes sense while you are looking at its label, and the leader is asked to check these
 * readings, correct them, and recognise them again in a summary weeks later.
 *
 * So a prose reading that is a figure and nothing else is dressed in the unit the figure is in. This
 * is presentation, not interpretation: the typed value is untouched, and no reading is refused or
 * altered by it. Only the case with nothing to lose is touched — see `numberProse`.
 */
interface FigureUnit {
  /** The unit at one, so "1 hour" is not written "1 hours". */
  singular: string;
  plural: string;
}

/**
 * The noun and nothing more, deliberately: "5 hours", not "5 hours a week".
 *
 * Every hours slot in this audit is a weekly rate and every label already says so ("Deep work, hours
 * a week", "Your weekly hours", "A sustainable weekly total"). A dressed value repeating it reads as
 * the audit talking to itself — "Your weekly hours: 55 hours a week" — while "55 hours" is a reading
 * that stands on its own wherever it is quoted and says nothing twice where it sits beside a label.
 */
const HOURS: FigureUnit = { singular: 'hour', plural: 'hours' };

/**
 * The units that are not the weekly-hours pattern.
 *
 * Deliberately only the slots the coach may write. The remaining number slots in the audit
 * (`reclaim_calendar_events_per_day`, `_back_to_back`, `_longest_block` and the computed lanes
 * beside them) are refused to conversational capture outright, so they never reach this and giving
 * them units here would be inventing a contract nothing exercises.
 */
const FIGURE_UNITS: Readonly<Record<string, FigureUnit>> = {
  reclaim_setup_weekly_hours: HOURS,
  reclaim_ideal_total_hours: HOURS,
  reclaim_gap_hours_to_remove: HOURS,
  reclaim_profile_direct_reports: { singular: 'direct report', plural: 'direct reports' },
};

/** The unit for one slot: the per-area hour lanes by pattern, the rest by name. */
function figureUnitFor(slotSlug: string): FigureUnit | undefined {
  // `reclaim_current_hours__deep_work`, `reclaim_ideal_hours__delivery`, and the seven others.
  if (slotSlug.includes('_hours__')) return HOURS;
  return FIGURE_UNITS[slotSlug];
}

/** A figure and nothing else. The same shape `deriveTypedValue` reads a number out of. */
const BARE_FIGURE = /^-?\d+(\.\d+)?$/;

/**
 * The prose to store for a number reading, when the one that arrived was a naked figure.
 *
 * `undefined` means leave the caller's prose exactly as it is, and that is the answer for everything
 * except the one unambiguous case: a string with no words in it at all. Anything the leader put words
 * around is theirs and stands — "roughly 5 hours", "about 8, more some weeks", "5 hrs" — because the
 * point is to keep the reading in the way they articulated it, and a rule that appended a unit to
 * prose that already carried one in different words would be correcting them into "5 hrs hours".
 * A bare "5" has no phrasing to preserve, so dressing it takes nothing away.
 *
 * Exported because the sweep needs the same string to compare against: it proposes bare figures, and
 * "have we already got this reading" must be asked of the prose as stored, not as sent.
 */
export function numberProse(slotSlug: string, value: string): string | undefined {
  const text = value.trim();
  if (!BARE_FIGURE.test(text)) return undefined;
  const unit = figureUnitFor(slotSlug);
  if (unit === undefined) return undefined;
  return `${text} ${Number(text) === 1 ? unit.singular : unit.plural}`;
}

/** Slug → definition, built once. Mirrors the lookup `saveAnswer` does for masking. */
const DEFINITION_BY_SLUG = new Map(reclaimSlotDefinitions.map((d) => [d.slug, d]));

/** The registered definition for a slug, for callers that need its group (the grant check). */
export function slotDefinitionFor(slotSlug: string): SlotDefinitionInput | undefined {
  return DEFINITION_BY_SLUG.get(slotSlug);
}

/** Why a proposed write was refused, in a form the capability can hand back to the model. */
export interface SlotWriteRefusal {
  code:
    | 'unknown_slot'
    | 'group_refused'
    | 'typed_value_required'
    | 'reflection_wrong_phase'
    | 'reflection_not_inferred'
    | 'not_an_answer'
    | 'points_at_an_answer';
  message: string;
}

/**
 * Placeholders a writer reaches for instead of leaving a reading out. The whole value, or nothing.
 *
 * Matched against the complete value rather than searched for inside one, because every word here is
 * ordinary English that a real answer may contain. "Unknown" is the audit having nothing; "the part I
 * do not have a name for yet is unknown to me" is a leader saying something.
 *
 * Deliberately **not** including a bare "no" or "none": those are answers. A boolean's prose is the
 * word for its own value, and a text reading really can come back as "none" where the question is
 * what the leader would drop.
 */
const PLACEHOLDER_VALUES: readonly string[] = [
  'n/a',
  'na',
  'nil',
  'unknown',
  'unspecified',
  'undisclosed',
  'no answer',
  'no response',
  'not applicable',
  'not answered',
  'not available',
  'not disclosed',
  'not given',
  'not known',
  'not mentioned',
  'not provided',
  'not specified',
  'not stated',
  'not supplied',
  'not yet',
  'not yet known',
  'not yet provided',
];

/**
 * A writer narrating **about** the leader rather than recording what they said.
 *
 * Anchored at the start, and that is the whole of why it is safe. The failure looks like this, from a
 * live audit: the capture sweep read a message that mentioned a role, a team and a location count, and
 * returned `reclaim_profile_first_name` with the value "The leader did not provide their first name in
 * this exchange." at confidence 9. Nothing refused it, and the leader's own screen then showed that
 * sentence, in the row headed "Your first name", as though they had said it.
 *
 * A recorded value is the leader's content. Nothing they say about themselves opens "the leader" or
 * "the participant", so an opening in the third person is the writer stepping outside its job. Left
 * unanchored the same words would catch a real reflection — "I am not the leader I want to be" — which
 * is exactly the reading this app is most careful about, so the anchor is load-bearing rather than
 * tidy.
 */
const NARRATES_ABOUT_THE_LEADER = /^\s*(?:the|this)\s+(?:leader|user|participant|person)\b/i;

/**
 * "No first name was provided", "No figure was given" — the same non-answer in the passive.
 *
 * Anchored for the same reason, and it requires the verb as well as the opening, so a leader's own
 * "no time was protected last quarter" does not read as a placeholder. That sentence is an answer
 * about their week; this pattern wants a sentence about the record.
 */
const REPORTS_AN_ABSENCE =
  /^\s*(?:no|none)\b[^.?!]{0,60}?\b(?:was|were|is|are|has been|have been)\s+(?:provided|given|mentioned|stated|specified|shared|supplied|offered|disclosed)\b/i;

/**
 * Whether this prose is a report that there was nothing to record, rather than a reading.
 *
 * Exported because it states a rule about *values*, and `checkSlotWrite` is not the only place that
 * may one day need it. False negatives here cost nothing new — the value is stored, exactly as it was
 * before this existed. A false positive discards something a leader said, so every test is anchored
 * or exact and none of them searches inside a sentence.
 *
 * **It guards what a model writes, never what a leader types.** `checkSlotWrite` is reached only from
 * `record_answers` and the capture sweep; the form panel writes through `saveAnswer` directly. So a
 * leader who types "N/A" into a field has said "N/A", and the audit keeps it. The rule is about a
 * writer reporting on the record, and only a model writes that way.
 */
/**
 * An answer that only points at one, rather than being one.
 *
 * ## The failure, from a live audit
 *
 * The coach offered three ways in. The leader typed **"1"**. `reclaim_action_chosen` was recorded as
 * `"1"`, and every reader downstream inherited it: the report's "What you will start" panel, the PDF a
 * leader keeps, the email, and now the report agent, which was asked to write a chapter about what
 * this person had decided to do and given the digit 1 to write it from.
 *
 * "1" was a true record of the keystroke and a useless record of the answer. The option's own words
 * were on the leader's screen one line above, and the audit stored the pointer instead of the thing
 * pointed at.
 *
 * ## Why this is not the tool putting words in anybody's mouth
 *
 * This is the rule `numberProse` already applies to figures, said about text: *a naked "5" under a
 * label is the audit making the leader do the reading.* Same argument, same fix.
 *
 * It resolves a **reference**, and it never interprets a **meaning**. "1" becomes the option the
 * coach itself offered, in the coach's own words. "Yes" becomes the proposition the leader agreed to,
 * which is the question that was just asked. Neither is the tool deciding what somebody meant, which
 * is what I6's "never inferred" forbids; both are the tool writing down what was said in a form that
 * still says it when read on its own six months later, in a document with no conversation around it.
 *
 * ## What it deliberately does not catch
 *
 * **A bare "no" or "none".** `PLACEHOLDER_VALUES` explains why and the reasoning holds here: asked
 * what they would drop, "none" is a complete answer with content in it. A bare *affirmative* never
 * is — "yes" carries none of the thing agreed to — which is the asymmetry this list encodes.
 *
 * **Anything with a sentence around it.** "1, the protected mornings" is self-contained enough. Every
 * pattern below matches the **whole** value, like every other rule in this file.
 *
 * **Booleans and numbers.** They have their own repairs above and "Yes" is the correct stored prose
 * for a yes-or-no. This applies to text slots only.
 */
const POINTS_AT_AN_OPTION: readonly RegExp[] = [
  // A bare index, with or without the words that usually dress one: "1", "2.", "option 3", "no. 2".
  /^\s*(?:option|number|no\.?|#)?\s*\d{1,2}\s*[.):]?\s*$/i,
  // A positional reference: "the first", "second one", "the last one".
  /^\s*(?:the\s+)?(?:first|second|third|fourth|last)(?:\s+one)?\s*[.]?\s*$/i,
  // A demonstrative standing in for the thing: "that one", "this one", "that".
  /^\s*(?:that|this|it)(?:\s+one)?\s*[.]?\s*$/i,
  // A bare affirmative. It agrees to something and carries none of it.
  /^\s*(?:yes|yeah|yep|yup|ya|sure|ok|okay|k|correct|right|true|agreed|i\s+agree|absolutely|definitely|exactly|indeed|please|go\s+ahead)\s*[.!]?\s*$/i,
];

/**
 * Whether this prose points at an answer instead of being one.
 *
 * Text slots only — the caller checks the data type. Exported so the rule can be asserted directly
 * against every text slot in the audit rather than only through one code path.
 */
export function pointsAtAnAnswer(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  return POINTS_AT_AN_OPTION.some((pattern) => pattern.test(trimmed));
}

export function isNotAnAnswer(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) return true;
  // Trailing punctuation only: a placeholder arrives as "N/A" or "Not provided." and both are the
  // same non-answer. Inner punctuation is left alone so a real sentence is never reduced to one.
  const bare = trimmed.replace(/[.!?,;:\s]+$/, '').toLowerCase();
  if (PLACEHOLDER_VALUES.includes(bare)) return true;
  return NARRATES_ABOUT_THE_LEADER.test(trimmed) || REPORTS_AN_ABSENCE.test(trimmed);
}

/** An accepted write, with the typed value resolved to what `saveAnswer` should store. */
export interface SlotWriteAccepted {
  slotSlug: string;
  /** The validated typed form for a non-text slot; `undefined` for text slots. */
  valueJson?: Prisma.InputJsonValue;
  /**
   * The prose to store instead of the one the caller sent, when the one it sent would not have read
   * as an answer.
   *
   * Two cases, both narrow and both in `checkSlotWrite`: a yes-or-no whose sentence contradicted its
   * typed value, and a figure that arrived with no words around it at all. `undefined` means the
   * caller's own prose stands, which is the ordinary case.
   */
  value?: string;
}

export type SlotWriteCheck =
  { ok: true; accepted: SlotWriteAccepted } | { ok: false; refusal: SlotWriteRefusal };

/** What else is known about the turn proposing a write, beyond the slug and the typed value. */
export interface SlotWriteConditions {
  /**
   * The phase from the dispatch scope (`scope.nodeKey`). Absent means the turn carries no phase, and
   * a reflection is refused rather than guessed at — the same stance `readCoachScope` takes about a
   * missing run. **Server-supplied**, which is what makes it the one genuinely enforced guard.
   */
  phaseKey?: string;
  /** How the model says it came by the reading. Only `inferred` changes the decision. */
  sourceType?: string;
  /**
   * The prose reading, when the caller has it. Read only as a fallback source for a typed slot's
   * typed value, and only where the prose is unambiguous — see `deriveTypedValue`.
   */
  value?: string;
}

/**
 * Decide whether the coach may record one proposed answer.
 *
 * The typed-value rule is the load-bearing one. Nine bucket hour slots feed the charts, the
 * benchmark comparisons, the gap arithmetic and the trend lines across audits. A form guarantees a
 * number; a conversation offers "about eight, some weeks more". Storing that as prose leaves every
 * one of those readers drawing a picture from nothing, and it fails silently: the chart still
 * renders. So a slot declared `number`, `boolean`, `date` or `json` is refused unless a valid typed
 * value arrives with it, and the coach's way through the refusal is to propose a figure and let the
 * leader confirm it.
 *
 * `conditions` carries what the server knows about the turn. It is optional so a caller with no
 * dispatch scope (a test, a future non-conversational caller) still gets the group and typed-value
 * rules — but a reflection needs the phase, so an absent one refuses it.
 */
export function checkSlotWrite(
  slotSlug: string,
  valueJson: unknown,
  conditions: SlotWriteConditions = {}
): SlotWriteCheck {
  const definition = DEFINITION_BY_SLUG.get(slotSlug);
  if (definition === undefined) {
    return {
      ok: false,
      refusal: {
        code: 'unknown_slot',
        message: `"${slotSlug}" is not a slot in this audit. Use one of the slots named in the current phase.`,
      },
    };
  }

  // A named exception inside a refused group is checked before the group, so the two framing
  // questions the source tells the coach to ask can be recorded while the computed lanes beside them
  // stay shut.
  const namedException = COACH_WRITABLE_SLOTS_IN_REFUSED_GROUPS.includes(slotSlug);

  const refusedReason = COACH_REFUSED_GROUPS[definition.group];
  if (refusedReason !== undefined && !namedException) {
    return { ok: false, refusal: { code: 'group_refused', message: refusedReason } };
  }

  if (!namedException && !COACH_WRITABLE_GROUPS.includes(definition.group)) {
    return {
      ok: false,
      refusal: {
        code: 'group_refused',
        message: `"${slotSlug}" is not something this conversation records.`,
      },
    };
  }

  // A reflection is the leader's own noticing, and the two conditions on writing one are the
  // replacement for the blanket refusal this group used to carry (see the header). Both are checked
  // against what the *server* supplied, never against an argument.
  if (definition.group === REFLECTION_GROUP) {
    const permitted =
      conditions.phaseKey === undefined ? null : reflectionSlugForPhase(conditions.phaseKey);
    if (permitted === null || permitted !== slotSlug) {
      return {
        ok: false,
        refusal: {
          code: 'reflection_wrong_phase',
          message: `"${slotSlug}" is not this phase's reflection. You may only record the reflection for the phase the leader is on, and only once they have said what they notice.`,
        },
      };
    }
    if (conditions.sourceType === INFERRED) {
      return {
        ok: false,
        refusal: {
          code: 'reflection_not_inferred',
          message:
            'A reflection cannot be inferred — it is what the leader noticed, in their words. Ask them, offer back what you heard, and record it once they have said it.',
        },
      };
    }
  }

  // A reading nobody gave is a reading left out, not a sentence saying so.
  //
  // Checked before the typed rule and for every slot, though only a text slot can actually reach here
  // with one: a typed slot whose prose narrates an absence has no typed value to go with it and is
  // already refused below. Keeping the rule general means the two writers cannot find a way past it by
  // sending a figure with a sentence about the figure's absence beside it.
  if (conditions.value !== undefined && isNotAnAnswer(conditions.value)) {
    return {
      ok: false,
      refusal: {
        code: 'not_an_answer',
        message: `"${slotSlug}" was not answered in what you read, so there is nothing to record. Leave it out. A note that the leader did not say is not a value, and it is shown to them under this reading's own name as though they had said it.`,
      },
    };
  }

  const dataType = definition.dataType ?? SLOT_DATA_TYPE.text;
  if (dataType === SLOT_DATA_TYPE.text) {
    // A pointer is not an answer. The refusal names what to do instead, because the coach is the one
    // holding the thing being pointed at: it offered the options, and it asked the question the
    // leader said yes to.
    if (conditions.value !== undefined && pointsAtAnAnswer(conditions.value)) {
      return {
        ok: false,
        refusal: {
          code: 'points_at_an_answer',
          message: `"${conditions.value.trim()}" points at an answer instead of being one. Record what it refers to, in a sentence that still says something on its own: the words of the option they picked, or the thing they just agreed to. This reading is shown to the leader under its own name and goes into the report they keep, where there is no conversation around it to explain what "${conditions.value.trim()}" meant.`,
        },
      };
    }
    return { ok: true, accepted: { slotSlug } };
  }

  // The typed form the caller sent, or the one its own prose plainly is. The fallback is why a coach
  // that answered "25" in the only field it had for the count no longer loses the reading over which
  // key it used; `deriveTypedValue` is exact about how little it will read out of prose.
  const proposed =
    valueJson !== undefined
      ? valueJson
      : conditions.value !== undefined
        ? deriveTypedValue(dataType, conditions.value)
        : undefined;

  const typed = validateTypedValue(dataType, proposed);
  if (typed === null) {
    return {
      ok: false,
      refusal: {
        code: 'typed_value_required',
        message: `"${slotSlug}" needs a ${dataType} in valueJson, not only a description. Offer the leader a specific figure and record it once they confirm it.`,
      },
    };
  }

  // A yes-or-no is stored as the word for the answer it is, and never as a sentence about it.
  //
  // **The failure this closes, in full, because it is quiet and it costs a question.** A leader asked
  // whether they were in a period of change said "change is a constant". The coach recorded
  // `reclaim_setup_in_transition` with that sentence as the prose and `false` as the typed value, and
  // nothing anywhere compared the two. Three readers then disagreed about the same reading: the panel
  // beside the leader showed their own sentence, which reads as a yes; `slotApplies` read the boolean,
  // which is a no, and told the coach that "What the change is" does not apply to this leader and must
  // not be asked; and the leader, looking at a row that said change is constant and a blank row
  // underneath it, saw a question the coach had simply skipped.
  //
  // Neither half can be trusted over the other here, so what is fixed is that they can differ at all.
  // The typed value is what every reader downstream acts on, so the prose is made to say the same
  // thing, in the one word a yes-or-no has. A leader who then sees "In a period of change — No" beside
  // their own answer can say so, and the coach can put it right; a leader shown their own sentence
  // over a stored `false` has nothing to notice.
  //
  // Untouched when the prose already is the answer ("Yes", "no."), which is the ordinary case and the
  // one the forms and the sweep both produce.
  if (dataType === SLOT_DATA_TYPE.boolean && typeof typed === 'boolean') {
    const word = typed ? 'Yes' : 'No';
    if (conditions.value !== undefined && deriveTypedValue(dataType, conditions.value) !== typed) {
      return { ok: true, accepted: { slotSlug, valueJson: typed, value: word } };
    }
  }

  // A figure is stored as the reading it is, never as a naked number. The leader is shown this prose
  // beside the conversation and asked to check it, so "5" under a label is the audit making them do
  // the reading. Only a value with no words in it is touched; see `numberProse`.
  if (dataType === SLOT_DATA_TYPE.number && conditions.value !== undefined) {
    const dressed = numberProse(slotSlug, conditions.value);
    if (dressed !== undefined) {
      return { ok: true, accepted: { slotSlug, valueJson: typed, value: dressed } };
    }
  }

  return { ok: true, accepted: { slotSlug, valueJson: typed } };
}
