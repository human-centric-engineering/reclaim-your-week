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
 *   that story false.
 *
 * The allowlist is also expressed as data on the agent's capability grant (`ExposureConfig`), so the
 * framework's own `facetAllows` enforces it a second time at a different layer. This module is the
 * first layer and the one that can explain itself to the model.
 */

import type { Prisma } from '@prisma/client';
import { SLOT_DATA_TYPE } from '@/lib/framework/data-slots/vocabulary';
import { validateTypedValue } from '@/lib/framework/data-slots/capabilities/typed-value';
import { reclaimSlotDefinitions } from '@/lib/app/programme/slots';

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
    'Calendar figures are computed from an uploaded calendar, never from conversation.',
  reclaim_composite:
    'The reconciled picture is computed from the calendar and the estimates, never from conversation.',
};

/** Slug → definition, built once. Mirrors the lookup `saveAnswer` does for masking. */
const DEFINITION_BY_SLUG = new Map(reclaimSlotDefinitions.map((d) => [d.slug, d]));

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

  const refusedReason = COACH_REFUSED_GROUPS[definition.group];
  if (refusedReason !== undefined) {
    return { ok: false, refusal: { code: 'group_refused', message: refusedReason } };
  }

  if (!COACH_WRITABLE_GROUPS.includes(definition.group)) {
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
