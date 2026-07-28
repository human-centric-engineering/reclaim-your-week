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
 * 2. **The groups are allowlisted, twice.** `checkSlotWrite` refuses sharing consent and the computed
 *    calendar lanes with an explanation, and the agent's grant carries the same allowlist as an
 *    `ExposureConfig` the framework enforces independently. A reflection is permitted but narrowed:
 *    only the phase in the server-issued scope, and never `inferred`. Both conditions come from the
 *    route, so neither is an argument the model can choose.
 * 3. **Typed slots need typed values.** An hours slot cannot be filled with "about eight". See
 *    `../writable-slots.ts` for why that one rule carries most of the product risk.
 *
 * Every write goes through `saveAnswerWithRetry`, so masking, run stamping and the single write path
 * (I3) all hold exactly as they do for the forms.
 *
 * **Partial success is the contract, and it has to hold at the schema too.** One bad answer in a
 * batch of five does not fail the other four. The result names what was recorded and what was
 * refused, and the refusals carry the sentence the coach needs to put things right, because the
 * result is fed back to the model on the next iteration of the same turn.
 *
 * That contract was written into `execute` and then broken one layer above it, which is worth
 * spelling out because the failure mode is invisible from inside this file. `BaseCapability.validate`
 * parses the **whole** argument object before `execute` is entered, so a single malformed entry threw
 * `CapabilityValidationError` and the entire batch came back as `invalid_args` — nothing recorded,
 * nothing refused, no sentence telling the coach what to fix. A leader who answered six slots in one
 * breath ("John Durrant, Head of Engineering, 25 direct reports…") got an empty panel, because the
 * model sent `value: 25` as a number for the count and the array schema rejected all six for it.
 *
 * Worse, it did not stay a one-turn problem. The chat handler's circuit breaker
 * (`lib/orchestration/chat/streaming-handler.ts`) counts consecutive tool failures and takes the tool
 * away after two, so the model's retry burned the second life and its third, corrected call was
 * refused with `tool_unavailable`. One coercible number cost the whole phase.
 *
 * So the top-level schema now validates only the envelope, and **each answer is parsed inside the
 * loop**, where a failure is a refusal like any other. Two consequences follow, and both are
 * deliberate: a malformed entry can never fail its siblings, and this capability only ever returns
 * `success: false` for something no retry could fix (no leader, no run in scope, an unreadable
 * grant). A model-argument slip is not one of those, and must never be reported as one.
 *
 * **Liberal in what it accepts, exact in what it stores.** A coach that has just heard "25 direct
 * reports" naturally sends the count as a number, and losing the reading over the JSON type of a
 * field is bookkeeping defeating the product. Primitives are coerced to the prose reading, and where
 * a typed slot arrived without its typed form, an unambiguous one is derived from the prose (see
 * `deriveTypedValue` in `../writable-slots.ts`). "About eight" is still refused; "25" is not.
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

/**
 * The envelope's own bound, above which the call is not a batch but a bug.
 *
 * Two bounds rather than one, because they answer different questions. `MAX_ANSWERS_PER_CALL` is the
 * product bound and is enforced *inside* the loop, so an over-long batch has its first twelve
 * recorded and the rest refused with a sentence saying to send them again. This one is the runaway
 * guard, and it is the only length that fails the call outright.
 */
const ABSURD_BATCH = 64;

/** The prose reading, from whichever primitive the model reached for. See the header. */
const proseValue = z
  .union([z.string(), z.number(), z.boolean()])
  .transform((v) => (typeof v === 'string' ? v : String(v)))
  .pipe(z.string().trim().min(1));

/** Confidence, clamped rather than refused: a reading is not worth losing over a 0 or an 11. */
const DEFAULT_CONFIDENCE = 7;
const confidenceValue = z.coerce
  .number()
  .transform((n) => Math.min(10, Math.max(1, Math.round(n))))
  .catch(DEFAULT_CONFIDENCE);

/**
 * One proposed reading, parsed per entry so a malformed one refuses only itself.
 *
 * Required in the strict sense are the two fields nothing can stand in for: which slot, and what was
 * heard. `confidence` and `reasoningNote` fall back rather than refuse, because neither decides
 * whether the reading is safe to store and both are recoverable bookkeeping. `sourceType` stays
 * strict: it is an enum the model is given, and it is read by the reflection rule, so a silent
 * default there would be this file inventing provenance.
 */
const answerSchema = z.object({
  slotSlug: z.string().trim().min(1).max(120),
  value: proseValue,
  /** The leader's own sentence. Truncated rather than refused, so a long quote costs the reading nothing. */
  verbatim: proseValue.transform((s) => s.slice(0, 2000)).optional(),
  valueJson: z.unknown().optional(),
  confidence: confidenceValue,
  sourceType: z.enum(SLOT_SOURCE_TYPE),
  reasoningNote: z.string().min(1).catch('Recorded from what the leader said.'),
});

/**
 * The envelope, and nothing more.
 *
 * `z.unknown()` entries are the whole point: anything stricter here is validated by
 * `BaseCapability.validate` before `execute` runs, which turns one bad entry into a failed call and
 * a spent life on the chat handler's tool circuit breaker. See the header.
 */
const recordAnswersSchema = z.object({
  answers: z.array(z.unknown()).min(1).max(ABSURD_BATCH),
});

type RecordAnswersArgs = z.infer<typeof recordAnswersSchema>;
type ParsedAnswer = z.infer<typeof answerSchema>;

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

/**
 * The slug of an entry that did not parse, when it has one worth naming.
 *
 * A refusal the coach cannot attach to a slot is a refusal it cannot act on, so this reaches into
 * the raw entry for the one field that identifies it. It is only ever used in a message back to the
 * model, never as a key to write against.
 */
function slugOf(entry: unknown): string | null {
  if (typeof entry !== 'object' || entry === null) return null;
  const slug = (entry as Record<string, unknown>)['slotSlug'];
  return typeof slug === 'string' && slug.length > 0 ? slug.slice(0, 120) : null;
}

/** A Zod issue list as one sentence the model can act on. First issue only: more is noise. */
function issueSentence(issues: readonly z.core.$ZodIssue[]): string {
  const first = issues[0];
  if (first === undefined) return 'it was not in the expected shape';
  const path = first.path.join('.');
  return path.length > 0 ? `${path} ${first.message.toLowerCase()}` : first.message.toLowerCase();
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
                description:
                  "The reading in plain language, close to the leader's own words. Always a string, including for a count or a yes or no: the typed form of those goes in valueJson beside it.",
              },
              verbatim: {
                type: 'string',
                description:
                  "The leader's own sentence, quoted exactly as they said it, including the way they said it. Not tidied, not shortened, not corrected. Send it whenever the reading came from something they actually said, and leave it out when you worked the reading out rather than hearing it. Their words are what gets read back to them later, so a tidied version here is the tool putting words in their mouth.",
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
   *
   * The entries arrive unparsed now, so this reads each one defensively rather than trusting a shape
   * `validate` no longer guarantees. Anything that is not a recognisable answer is written as its
   * type alone — an entry the capability refused is still worth having in the trace, and an operator
   * reading it should be able to see that something malformed arrived without seeing what was in it.
   */
  redactProvenance(
    args: RecordAnswersArgs,
    result: CapabilityResult<RecordAnswersData>
  ): { args: unknown; resultPreview: string } {
    return {
      args: {
        answers: args.answers.map((entry) => {
          if (typeof entry !== 'object' || entry === null) {
            return { malformed: typeof entry };
          }
          const a = entry as Record<string, unknown>;
          return {
            // The only field carried through verbatim, and only when it is the vetted kind of string.
            ...(typeof a['slotSlug'] === 'string' ? { slotSlug: a['slotSlug'] } : {}),
            value: redactedString('slot-value'),
            // The verbatim is the leader's sentence in the strictest sense, so it is the last thing
            // that belongs in a durable trace. Redacted as its own key rather than folded into
            // `value`'s marker, so an operator reading the trace can still tell a quote was taken.
            ...(a['verbatim'] !== undefined ? { verbatim: redactedString('slot-verbatim') } : {}),
            ...(a['valueJson'] !== undefined
              ? { valueJson: redactedString('slot-value-json') }
              : {}),
            ...(typeof a['confidence'] === 'number' ? { confidence: a['confidence'] } : {}),
            ...(typeof a['sourceType'] === 'string' ? { sourceType: a['sourceType'] } : {}),
            reasoningNote: redactedString('slot-reasoning'),
          };
        }),
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
    for (const [index, entry] of args.answers.entries()) {
      // The product bound, enforced here rather than on the schema so an over-long batch keeps the
      // readings it can and is told plainly about the rest. Failing the call would lose all of them.
      if (index >= MAX_ANSWERS_PER_CALL) {
        refused.push({
          slotSlug: slugOf(entry) ?? `answers[${index}]`,
          code: 'batch_too_long',
          message: `Only the first ${MAX_ANSWERS_PER_CALL} readings in a call are recorded. This one was not. Send it again in another call.`,
        });
        continue;
      }

      // Parsed per entry, which is what makes partial success real rather than documented. A
      // malformed reading refuses itself and says what was wrong, and its siblings are unaffected.
      const parsed = answerSchema.safeParse(entry);
      if (!parsed.success) {
        refused.push({
          slotSlug: slugOf(entry) ?? `answers[${index}]`,
          code: 'invalid_answer',
          message: `This reading could not be read: ${issueSentence(parsed.error.issues)}. Send it again with that put right.`,
        });
        continue;
      }
      const answer: ParsedAnswer = parsed.data;

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

      const check = checkSlotWrite(answer.slotSlug, answer.valueJson, {
        ...(scope.nodeKey !== undefined ? { phaseKey: scope.nodeKey } : {}),
        sourceType: answer.sourceType,
        // The prose, so a typed slot whose figure arrived only in `value` is read rather than
        // refused. Nothing ambiguous is read out of it; see `deriveTypedValue`.
        value: answer.value,
      });
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
        ...(answer.verbatim !== undefined ? { verbatim: answer.verbatim } : {}),
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
