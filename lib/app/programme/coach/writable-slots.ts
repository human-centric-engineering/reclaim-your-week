/**
 * What the coach may write, and what it may never write (I6).
 *
 * The conversational coach captures audit answers directly, which the original lockdown forbade
 * outright. The hazard that lockdown named — a model-supplied run key writing one leader's answers
 * into another's run — is gone, because the run id now comes from the server-issued dispatch scope
 * (`./scope.ts`). What is *not* gone is everything else I6 was quietly protecting, so the permission
 * is an allowlist of groups rather than "any registered slug", and three groups are refused in code:
 *
 * - **`reclaim_reflection`** — the reflection slots are the phase gate. The transition route refuses
 *   to leave a phase until the slot for that phase exists, and asking before telling is the coaching
 *   spine of the whole tool. A coach that can write these can open its own gate, and the pause stops
 *   meaning anything. The coach may *propose* the words on screen; the leader's confirmation is what
 *   writes, through the ordinary leader-initiated path.
 * - **`reclaim_share`** — `reclaim_share_with_coach` and `reclaim_share_quotable` decide whether a
 *   leader's words may be republished. An agent that can write consent can manufacture it.
 * - **`reclaim_calendar` and `reclaim_composite`** — computed lanes whose privacy story is that they
 *   hold deterministic per-bucket totals and nothing else. Model-derived numbers in there would make
 *   that story false. **Two slugs inside `reclaim_calendar` are the exception**; see
 *   `COACH_WRITABLE_SLOTS_IN_REFUSED_GROUPS` below.
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
import type { SlotDefinitionInput } from '@/lib/framework/data-slots';

/** Slot groups the coach may write from conversation. */
export const COACH_WRITABLE_GROUPS: readonly string[] = [
  'reclaim_profile',
  'reclaim_setup',
  'reclaim_current',
  'reclaim_energy',
  'reclaim_ideal',
  'reclaim_gap',
  'reclaim_action',
];

/**
 * Groups the coach may never write, each with the sentence the model is told when it tries. The
 * refusal is worth explaining rather than stonewalling: a coach that knows *why* it cannot record a
 * reflection can do the right thing instead, which is to ask the leader and let them confirm.
 */
export const COACH_REFUSED_GROUPS: Readonly<Record<string, string>> = {
  reclaim_reflection:
    "Reflections are the leader's own words and only they can record one. Ask what they notice, then offer their answer back for them to confirm.",
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

/** Slug → definition, built once. Mirrors the lookup `saveAnswer` does for masking. */
const DEFINITION_BY_SLUG = new Map(reclaimSlotDefinitions.map((d) => [d.slug, d]));

/** The registered definition for a slug, for callers that need its group (the grant check). */
export function slotDefinitionFor(slotSlug: string): SlotDefinitionInput | undefined {
  return DEFINITION_BY_SLUG.get(slotSlug);
}

/** Why a proposed write was refused, in a form the capability can hand back to the model. */
export interface SlotWriteRefusal {
  code: 'unknown_slot' | 'group_refused' | 'typed_value_required';
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
 */
export function checkSlotWrite(slotSlug: string, valueJson: unknown): SlotWriteCheck {
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

  const dataType = definition.dataType ?? SLOT_DATA_TYPE.text;
  if (dataType === SLOT_DATA_TYPE.text) return { ok: true, accepted: { slotSlug } };

  const typed = validateTypedValue(dataType, valueJson);
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
