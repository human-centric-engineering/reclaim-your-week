/**
 * `reclaim_record_answers` — how a conversation becomes audit data.
 *
 * The coach calls this mid-conversation, silently, whenever it learns something the audit tracks.
 * It takes **several answers in one call**, which is the point: a leader who says "I'm probably in
 * meetings twenty hours a week and honestly most of it is delivery firefighting" has answered two
 * slots in one breath, and a one-slot-per-call tool would either lose the second reading or spend a
 * whole extra turn on it.
 *
 * Three properties make this safe to grant where the framework's own `fill_slot` was not:
 *
 * 1. **The run comes from the server.** `context.scope` is built by the route and threaded verbatim
 *    by the chat handler; the model never sees it. So there is no argument the model can get wrong
 *    about which run it is writing into, which was the whole objection in I6.
 * 2. **The groups are allowlisted, twice.** `checkSlotWrite` refuses reflections, sharing consent
 *    and the computed calendar lanes with an explanation, and the agent's grant carries the same
 *    allowlist as an `ExposureConfig` the framework enforces independently.
 * 3. **Typed slots need typed values.** An hours slot cannot be filled with "about eight". See
 *    `../writable-slots.ts` for why that one rule carries most of the product risk.
 *
 * Every write goes through `saveAnswerWithRetry`, so masking, run stamping and the single write path
 * (I3) all hold exactly as they do for the forms.
 *
 * **Partial success is the contract.** One bad answer in a batch of five does not fail the other
 * four. The result names what was recorded and what was refused, and the refusals carry the sentence
 * the coach needs to put things right, because the result is fed back to the model on the next
 * iteration of the same turn.
 */

import { z } from 'zod';
import { logger } from '@/lib/logging';
import { BaseCapability } from '@/lib/orchestration/capabilities/base-capability';
import type {
  CapabilityContext,
  CapabilityFunctionDefinition,
  CapabilityResult,
} from '@/lib/orchestration/capabilities/types';
import { redactedString } from '@/lib/security/redact';
import { SLOT_SOURCE_TYPE } from '@/lib/framework/data-slots/vocabulary';
import { saveAnswerWithRetry } from '@/lib/app/programme/slots/write';
import {
  exposureConfigSchema,
  facetAllows,
} from '@/lib/framework/data-slots/capabilities/exposure';
import { readCoachScope } from '@/lib/app/programme/coach/scope';
import { checkSlotWrite, slotDefinitionFor } from '@/lib/app/programme/coach/writable-slots';

/** The most answers one turn may record. Generous for a rich answer, bounded against a runaway. */
const MAX_ANSWERS_PER_CALL = 12;

const answerSchema = z.object({
  slotSlug: z.string().min(1).max(120),
  value: z.string().min(1),
  valueJson: z.unknown().optional(),
  confidence: z.number().int().min(1).max(10),
  sourceType: z.enum(SLOT_SOURCE_TYPE),
  reasoningNote: z.string().min(1),
});

const recordAnswersSchema = z.object({
  answers: z.array(answerSchema).min(1).max(MAX_ANSWERS_PER_CALL),
});

type RecordAnswersArgs = z.infer<typeof recordAnswersSchema>;

interface RecordedAnswer {
  slotSlug: string;
  version: number;
  confidence: number;
  sourceType: string;
}

interface RefusedAnswer {
  slotSlug: string;
  code: string;
  message: string;
}

interface RecordAnswersData {
  recorded: RecordedAnswer[];
  refused: RefusedAnswer[];
}

export class ReclaimRecordAnswersCapability extends BaseCapability<
  RecordAnswersArgs,
  RecordAnswersData
> {
  /** Bare snake_case, as a module capability must be. The framework namespaces it to
   *  `reclaim_audit__record_answers` for the dispatcher key, the DB slug and the LLM tool name. */
  readonly slug = 'record_answers';
  readonly processesPii = true;

  readonly functionDefinition: CapabilityFunctionDefinition = {
    // Overwritten with the namespaced slug by `namespaceModuleCapability`; the three must match.
    name: 'record_answers',
    description:
      "Record what you have learned from the conversation against this audit's slots. Silent: the leader is not shown the call. Send every reading you took from what they just said, including ones they gave in passing while answering something else. Mark how you came by each reading and how sure you are of it. A reading you inferred rather than heard directly belongs here too, at lower confidence, so it can be offered back for the leader to confirm.",
    parameters: {
      type: 'object',
      properties: {
        answers: {
          type: 'array',
          minItems: 1,
          maxItems: MAX_ANSWERS_PER_CALL,
          description: 'One entry per reading. Several readings from one answer is normal.',
          items: {
            type: 'object',
            properties: {
              slotSlug: {
                type: 'string',
                description: 'The slot this reading fills, exactly as named in the current phase.',
              },
              value: {
                type: 'string',
                description: "The reading in plain language, close to the leader's own words.",
              },
              valueJson: {
                description:
                  'The typed form, required for any slot that is not free text: a number for hours or counts, true or false for a yes or no, an object for structured slots. A slot needing a number is refused without one.',
              },
              confidence: {
                type: 'integer',
                minimum: 1,
                maximum: 10,
                description:
                  'How sure this reading is. 9 or 10 when the leader stated it plainly, 4 to 6 when you inferred it from something adjacent, lower when it is a guess worth checking.',
              },
              sourceType: {
                type: 'string',
                enum: Object.values(SLOT_SOURCE_TYPE),
                description:
                  'How you came by it: direct when they answered the question, unprompted when they volunteered it, emerged_naturally when it surfaced while discussing something else, built_across_turns when it took several exchanges to settle, inferred when you read it between the lines, user_confirmed when they verified something you offered back.',
              },
              reasoningNote: {
                type: 'string',
                description: 'One sentence: how you arrived at this reading.',
              },
            },
            required: ['slotSlug', 'value', 'confidence', 'sourceType', 'reasoningNote'],
          },
        },
      },
      required: ['answers'],
    },
  };

  protected readonly schema = recordAnswersSchema;

  /**
   * Everything a leader says about their week is personal, so the durable audit row keeps the shape
   * of the write and none of its content. Slugs survive: they are vetted identifiers from this
   * module's own definitions, never model-authored free text, and without them the trace cannot
   * answer "what did the coach record here" at all. Values, typed values and reasoning notes are
   * masked, the last of these because it quotes the value it explains.
   */
  redactProvenance(
    args: RecordAnswersArgs,
    result: CapabilityResult<RecordAnswersData>
  ): { args: unknown; resultPreview: string } {
    return {
      args: {
        answers: args.answers.map((a) => ({
          slotSlug: a.slotSlug,
          value: redactedString('slot-value'),
          ...(a.valueJson !== undefined ? { valueJson: redactedString('slot-value-json') } : {}),
          confidence: a.confidence,
          sourceType: a.sourceType,
          reasoningNote: redactedString('slot-reasoning'),
        })),
      },
      resultPreview: JSON.stringify(result),
    };
  }

  async execute(
    args: RecordAnswersArgs,
    context: CapabilityContext
  ): Promise<CapabilityResult<RecordAnswersData>> {
    if (context.userId === null) {
      return this.error('There is no leader in this conversation to record against.', 'no_user');
    }

    // No run in scope means the capability cannot tell which audit it is writing into. Refusing is
    // the only safe reading — guessing is precisely what I6 exists to prevent.
    const scope = readCoachScope(context.scope);
    if (scope === null) {
      return this.error(
        'This conversation is not attached to an audit run, so nothing can be recorded.',
        'no_run_scope'
      );
    }

    // The operator-tunable outer bound: which slot groups this grant permits at all. It is read from
    // the binding rather than re-queried, and it is the layer I6 claimed for a year without anything
    // running it — `facetAllows` is called by the framework's own `fill_slot` and `get_state`, and by
    // nobody else, so a module capability that does not call it has an `ExposureConfig` that enforces
    // nothing. Malformed config fails closed: a grant we cannot read is not a grant.
    const exposure = exposureConfigSchema.safeParse(context.customConfig ?? {});
    if (!exposure.success) {
      return this.error(
        'This capability is not configured correctly, so nothing was recorded.',
        'exposure_invalid'
      );
    }
    const writeFacet = exposure.data.write;

    const recorded: RecordedAnswer[] = [];
    const refused: RefusedAnswer[] = [];

    // Sequential on purpose. These are separate slugs so they do not contend with each other, and a
    // serial loop keeps the version numbers legible in the provenance archive an operator reads.
    for (const answer of args.answers) {
      // Both layers, ANDed. The grant says which groups; the code says which slugs within them and
      // enforces the typed-value rule. Neither is redundant: the grant is what an operator can
      // tighten without a deploy, and the code is the product rule that must hold whatever the grant
      // says.
      // `scope` is passed as null: every reclaim slot is registered without one, and the grant's
      // facet names no `scopes`, so scope plays no part in this decision. Passing the definition's
      // absent field would say the same thing less plainly.
      const definition = slotDefinitionFor(answer.slotSlug);
      if (definition !== undefined && !facetAllows(writeFacet, definition.group ?? null, null)) {
        refused.push({
          slotSlug: answer.slotSlug,
          code: 'group_refused',
          message: `"${answer.slotSlug}" is outside what this conversation is permitted to record.`,
        });
        continue;
      }

      const check = checkSlotWrite(answer.slotSlug, answer.valueJson);
      if (!check.ok) {
        refused.push({
          slotSlug: answer.slotSlug,
          code: check.refusal.code,
          message: check.refusal.message,
        });
        continue;
      }

      const written = await saveAnswerWithRetry({
        userId: context.userId,
        runId: scope.runId,
        slotSlug: check.accepted.slotSlug,
        value: answer.value,
        ...(check.accepted.valueJson !== undefined ? { valueJson: check.accepted.valueJson } : {}),
        confidence: answer.confidence,
        sourceType: answer.sourceType,
        reasoningNote: answer.reasoningNote,
        ...(context.conversationId !== undefined ? { conversationId: context.conversationId } : {}),
        ...(scope.nodeKey !== undefined ? { nodeKey: scope.nodeKey } : {}),
      });

      recorded.push({
        slotSlug: written.slotSlug,
        version: written.version,
        confidence: answer.confidence,
        sourceType: answer.sourceType,
      });
    }

    // Slugs and counts only. Values never reach the app log, which is not covered by erasure.
    if (refused.length > 0) {
      logger.info('reclaim_record_answers: refused one or more answers', {
        runId: scope.runId,
        refused: refused.map((r) => `${r.slotSlug}:${r.code}`),
      });
    }

    return this.success({ recorded, refused });
  }
}
