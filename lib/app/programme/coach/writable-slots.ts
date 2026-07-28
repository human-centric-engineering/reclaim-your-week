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
 *   that story false. **Two slugs inside `reclaim_calendar` are the exception**; see
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
 * - **number** — the whole trimmed string is a finite number. "25" yes; "about 25", "25 hours",
 *   "twenty five" all no, because each of those needs a reading rather than a parse.
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
      if (!/^-?\d+(\.\d+)?$/.test(text)) return undefined;
      const n = Number(text);
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
    | 'reflection_not_inferred';
  message: string;
}

/** An accepted write, with the typed value resolved to what `saveAnswer` should store. */
export interface SlotWriteAccepted {
  slotSlug: string;
  /** The validated typed form for a non-text slot; `undefined` for text slots. */
  valueJson?: Prisma.InputJsonValue;
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

  const dataType = definition.dataType ?? SLOT_DATA_TYPE.text;
  if (dataType === SLOT_DATA_TYPE.text) return { ok: true, accepted: { slotSlug } };

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

  return { ok: true, accepted: { slotSlug, valueJson: typed } };
}
