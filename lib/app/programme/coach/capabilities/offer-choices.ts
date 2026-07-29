/**
 * `reclaim_offer_choices` — the coach saying which reading its question is about, so the screen can
 * offer the answers instead of a blank box.
 *
 * ## The problem it solves
 *
 * Some of what the audit asks has a fixed set of answers, and on the form path the leader has always
 * been shown them. On the conversation path they were not: "which quarter or timeframe should we
 * consider when looking at your time" arrived above an empty text box, so a four-way choice was
 * presented as an essay question and the leader had to guess the wording. The answers exist
 * (`../slot-choices.ts`); the screen had no way of knowing that *this* turn was the turn to show
 * them.
 *
 * It cannot work it out on its own. The coach composes every question itself, so nothing in the
 * transcript distinguishes a closed question from an open one, and matching prose against a slot
 * would be guessing about the one thing that has to be exact.
 *
 * ## Why this shape, rather than letting the model send the options
 *
 * The model names the **reading**; the product owns the **answers**. That division is the whole
 * design. A tool that accepted an `options` array would put the wording of every choice in the hands
 * of something that improvises for a living, and the first time it offered "Q1 / Q2 / Q3 / Q4" for a
 * slot whose four values are "last week / last month / last quarter / last year", a leader would tap
 * an answer this audit cannot store. So the argument list is one slug, the options come from
 * `choicesFor`, and there is no argument that can make them come out differently.
 *
 * The slug itself is checkable rather than trusted, and it is checked three ways: the slot must
 * exist, it must have an authored answer set, and it must belong to the section the leader is
 * actually on — which comes from the server-issued dispatch scope, not from the model (I6). A refusal
 * says which of the three failed, because the result is fed back into the same turn and the coach can
 * still ask the question properly with no offer attached.
 *
 * The context builder already decides which reading the turn should end on
 * (`nextQuestionFor` in `../phase-context.ts`) and now tells the coach when that reading has a set.
 * So in the common case the model is confirming a choice made deterministically upstream rather than
 * making one.
 *
 * ## It writes nothing, and that is what keeps I6 intact
 *
 * This capability has no side effects at all: no slot write, no run mutation, no read of the
 * database. It answers a question about static data. `record_answers` remains the coach's only write,
 * and the answer a leader taps comes back through the ordinary path — it is sent as their own turn,
 * in their column of the transcript, and recorded from what they said like anything else. Nothing is
 * stored on their behalf because a button was drawn.
 */

import { z } from 'zod';
import { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';
import type {
  CapabilityContext,
  CapabilityFunctionDefinition,
  CapabilityResult,
} from '@/lib/orchestration/capabilities/types';
import { readCoachScope } from '@/lib/app/programme/coach/scope';
import { slotDefinitionFor } from '@/lib/app/programme/coach/writable-slots';
import { PHASE_SLOT_GROUPS, slotLabel } from '@/lib/app/programme/coach/phase-slots';
import { choicesFor } from '@/lib/app/programme/coach/slot-choices';

const offerChoicesSchema = z.object({
  slotSlug: z.string().trim().min(1).max(120),
});

type OfferChoicesArgs = z.infer<typeof offerChoicesSchema>;

/** What the screen is told: which reading, what it is called, and the answers to draw. */
export interface OfferChoicesData {
  slotSlug: string;
  /** The leader-facing name of the reading, for the control's accessible label. Never the slug. */
  label: string;
  options: string[];
}

export class ReclaimOfferChoicesCapability extends BaseCapability<
  OfferChoicesArgs,
  OfferChoicesData
> {
  /** Bare snake_case, as a module capability must be; namespaced to `reclaim_audit__offer_choices`. */
  readonly slug = 'offer_choices';

  readonly functionDefinition: CapabilityFunctionDefinition = {
    // Overwritten with the namespaced slug by `namespaceModuleCapability`; the three must match.
    name: 'offer_choices',
    description:
      'Show the leader the answers to pick from, for a question whose answers are a fixed set. Call it in the same turn as the question, straight after asking, and name the reading the question is about. The answers themselves come from the audit, not from you, so there is nothing to supply beyond the reading. Ask the question in your own words exactly as you otherwise would, and do not list the options in your reply: they appear on screen under it, and reading them out as well is the same question asked twice. Use it only when the answers really are a fixed set, which your context tells you. Never for a question about what something is like, what stands out, or anything the leader answers in their own words. The leader can always type something else instead, so an offer never closes a question.',
    parameters: {
      type: 'object',
      properties: {
        slotSlug: {
          type: 'string',
          description:
            'The reading this question is about, exactly as named in the current section. One only: an offer belongs to the question just asked.',
        },
      },
      required: ['slotSlug'],
    },
  };

  protected readonly schema = offerChoicesSchema;

  /**
   * Nothing here is personal. The argument is a vetted slug from this module's own definitions and
   * the result is static option text the form panel has drawn in public since v1, so the durable
   * trace keeps both in full — this is one of the few capability traces an operator can read
   * literally, and redacting it would cost the audit trail its only record of what was offered.
   */
  redactProvenance(
    args: OfferChoicesArgs,
    result: CapabilityResult<OfferChoicesData>
  ): { args: unknown; resultPreview: string } {
    return { args, resultPreview: JSON.stringify(result) };
  }

  /**
   * The capability interface is asynchronous; this one has nothing to wait for.
   *
   * Split rather than declared `async` with no `await` in it, which is a lie the linter is right to
   * refuse: the decision below is entirely synchronous, over static data and a scope the caller
   * already holds. Nothing here reads the database, and the shape of this pair is the clearest way
   * of saying so.
   */
  execute(
    args: OfferChoicesArgs,
    context: CapabilityContext
  ): Promise<CapabilityResult<OfferChoicesData>> {
    return Promise.resolve(this.offerFor(args, context));
  }

  /**
   * Which answers to draw, or why there are none.
   *
   * `context` is read for the one thing the model must not be allowed to choose: which section this
   * question is in.
   */
  private offerFor(
    args: OfferChoicesArgs,
    context: CapabilityContext
  ): CapabilityResult<OfferChoicesData> {
    const definition = slotDefinitionFor(args.slotSlug);
    if (definition === undefined) {
      return this.error(
        `There is no reading called "${args.slotSlug}" in this audit. Ask the question without an offer.`,
        'unknown_slot'
      );
    }

    // The section, from the server-issued scope. A coach in section 2 cannot put section 4's answers
    // in front of the leader, and the reason it cannot is that the phase is not an argument it holds.
    // A turn with no scope at all (which the run's own stream route never produces) refuses rather
    // than falling back to "any section", because an unchecked offer is the failure this guards.
    const scope = readCoachScope(context.scope);
    const phaseKey = scope?.nodeKey;
    if (phaseKey === undefined) {
      return this.error(
        'This conversation is not attached to a section of the audit, so nothing can be offered.',
        'no_phase_scope'
      );
    }
    const groups = PHASE_SLOT_GROUPS[phaseKey] ?? [];
    if (!groups.includes(definition.group)) {
      return this.error(
        `"${args.slotSlug}" does not belong to the section the leader is on, so its answers cannot be offered here.`,
        'wrong_phase'
      );
    }

    const options = choicesFor(args.slotSlug);
    if (options === null) {
      return this.error(
        `"${args.slotSlug}" is answered in the leader's own words, so there is nothing to pick from. Ask it as an open question.`,
        'no_choices'
      );
    }

    return this.success({
      slotSlug: args.slotSlug,
      // The plain label rather than a relabelled one: bucket renaming (I7) touches the nine per-area
      // lanes, and no lane has an answer set, so there is nothing here for a leader's own label to
      // reach. Passing no labels keeps this capability free of the run read it would otherwise need.
      label: slotLabel(args.slotSlug),
      options: [...options],
    });
  }
}
