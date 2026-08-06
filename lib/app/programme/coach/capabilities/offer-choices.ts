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
 * The slug itself is checkable rather than trusted, and it is checked five ways: the slot must exist,
 * it must have an authored answer set, it must belong to the section the leader is actually on —
 * which comes from the server-issued dispatch scope, not from the model (I6) — the question it is for
 * must be a question on its own rather than half of a pair, and it must be a question this audit is
 * still asking. A refusal says which of the five failed, because the result is fed back into the same
 * turn and the coach can still ask the question properly with no offer attached.
 *
 * The last two are the ones paid for in a database read. The pairing check was added after a live audit asked
 * "with a team split between two locations, how does having a distributed team shape your leadership?"
 * and put **Yes / No** underneath it. Nothing the other three check was wrong: the reading exists, it
 * is a boolean, and it was in section 0. What was wrong is that the reading is the *anchor* of a pair
 * whose second half is answered in the leader's own words, so the question actually on screen was the
 * pair and the buttons answered a question nobody had asked. `compoundQuestionSlugs` in
 * `../phase-slots.ts` states the rule and explains why it lives beside the definition of a pair.
 *
 * The fifth was added after the same audit went one further: told to end the turn on the period being
 * audited, and handed that period by the leader, the coach recorded it, offered its answers, and
 * asked something else. The four periods were then drawn under "what stands out to you about your
 * current situation and priorities?". `readingIsSettled` in `../settled-reading.ts` states that rule,
 * and explains why the test is "settled" rather than "answered": the audit really does go back to
 * readings it holds but has not had confirmed, and those turns keep their buttons.
 *
 * The context builder already decides which reading the turn should end on
 * (`nextQuestionFor` in `../phase-context.ts`) and now tells the coach when that reading has a set.
 * So in the common case the model is confirming a choice made deterministically upstream rather than
 * making one.
 *
 * ## It writes nothing, and that is what keeps I6 intact
 *
 * This capability has no side effects at all: no slot write, no run mutation. It reads the run only to
 * answer the pairing check above, and reads nothing else. `record_answers` remains the coach's only
 * write, and the answer a leader taps comes back through the ordinary path — it is sent as their own
 * turn, in their column of the transcript, and recorded from what they said like anything else.
 * Nothing is stored on their behalf because a button was drawn.
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
import { asksInsideCompoundQuestion } from '@/lib/app/programme/coach/compound-question';
import { readingIsSettled } from '@/lib/app/programme/coach/settled-reading';

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
      'Show the leader the answers to pick from, for a question whose answers are a fixed set. Call it in the same turn as the question, straight after asking, and name the reading the question is about. The answers themselves come from the audit, not from you, so there is nothing to supply beyond the reading. Ask the question in your own words exactly as you otherwise would, and do not list the options in your reply: they appear on screen under it, and reading them out as well is the same question asked twice. Use it only when the answers really are a fixed set, which your context tells you. Never for a question about what something is like, what stands out, or anything the leader answers in their own words. Never when you are asking two readings as one question either, even if one of them has a set: the leader is reading a two-part question, and a set of buttons under it answers only half of it. Never for a reading you have just recorded, or one this audit already holds and is not going back to: the offer belongs to the question you are asking now, not to the one they have finished answering. The leader can always type something else instead, so an offer never closes a question.',
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
   * Which answers to draw, or why there are none.
   *
   * `context` is read for the two things the model must not be allowed to choose: which section this
   * question is in, and which run it is in. Both come from the server-issued dispatch scope.
   */
  async execute(
    args: OfferChoicesArgs,
    context: CapabilityContext
  ): Promise<CapabilityResult<OfferChoicesData>> {
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
    if (scope === null || phaseKey === undefined) {
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

    // An offer belongs to a question, and a reading this audit has answered and left is not one. The
    // failure this closes is the coach recording the leader's answer and offering that same reading's
    // buttons in the same breath, which puts four answers to a settled question under whatever it
    // asked next. Refused rather than dropped silently, because the coach is mid-turn and what it
    // needs to know is that the question moved on, not that a tool happened to return nothing.
    //
    // Fails open on an unreadable run, for the reason `asksInsideCompoundQuestion` does below.
    if (
      context.userId !== null &&
      (await readingIsSettled({
        userId: context.userId,
        runId: scope.runId,
        slotSlug: args.slotSlug,
      }))
    ) {
      return this.error(
        `The leader has already answered "${args.slotSlug}" in this audit and nothing about it is outstanding, so there is no question here for them to pick an answer to. Ask whatever you are actually asking now, with no offer attached. If they raise this reading again themselves, take what they say in their own words.`,
        'already_answered'
      );
    }

    // The last check, and the other one that needs the run: a reading asked as half of a two-part
    // question has no answer set to offer, because the question the leader is reading is the pair.
    // Refused with the reason stated plainly, so the coach's next iteration knows it may still ask —
    // it is the *offer* that is wrong here, never the question.
    //
    // A conversation with no leader in it cannot be asked this — there is no run to read a pairing
    // out of — and it fails open, exactly as a database hiccup does inside the helper. `record_answers`
    // refuses on the same condition because it is about to *write*; this one draws four buttons the
    // leader can walk past, and the honest cost of getting it wrong is a wrong offer rather than a
    // wrong record.
    if (
      context.userId !== null &&
      (await asksInsideCompoundQuestion({
        userId: context.userId,
        runId: scope.runId,
        phaseKey,
        slotSlug: args.slotSlug,
      }))
    ) {
      return this.error(
        `"${args.slotSlug}" is being asked together with the reading that follows it, and that second half is answered in the leader's own words. A set of answers under a two-part question answers the wrong half. Ask both as one open question, with no offer.`,
        'inside_compound_question'
      );
    }

    return this.success({
      slotSlug: args.slotSlug,
      // The plain label rather than a relabelled one: bucket renaming (I7) touches the nine per-area
      // lanes, and no lane has an answer set, so there is nothing here for a leader's own label to
      // reach. Passing no labels keeps the label free of the bucket read it would otherwise need.
      label: slotLabel(args.slotSlug),
      options: [...options],
    });
  }
}
