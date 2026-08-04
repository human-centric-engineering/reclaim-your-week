/**
 * Record the three ways in that the coach just offered, rather than hoping it recorded them itself.
 *
 * ## The failure this exists for, observed on a live audit
 *
 * Phase 5 opens by offering three genuinely different places to start, each with a sentence on the
 * difference it would make, and the briefing tells the coach to record all three as
 * `reclaim_action_options` in `valueJson`. On a real run the coach never offered them at all: it went
 * straight to the chosen action, the slot stayed empty, and the leader ended the phase with the
 * summary unable to show what had been on the table.
 *
 * That is the same shape as every other capture failure this app has hit. A structured side effect
 * asked of a model in the middle of a warm conversation is a hit rate, and this product does not
 * build on hit rates — the reasoning `runCaptureSweep` opens with, one slot along.
 *
 * ## Why it reads the coach's words rather than generating the options
 *
 * The obvious fix is to build the three options server-side before the phase opens and hand them to
 * the coach to read out. It was rejected. The options have to be built from this leader's own gap
 * figures, their best hours and the commitment they named, and composing them *in* the conversation
 * — warm, in their language, connected to what they have just been looking at — is the thing the
 * coach is for. Pre-generating them would trade the one job only the model can do for a
 * determinism this pass can get another way.
 *
 * So the division of labour is the one that already works here: the coach does the conversational
 * thing, and a deterministic pass afterwards records what it did. `runCaptureSweep` excludes `json`
 * readings because "there is no honest way to read an object out of prose" — and that is true of the
 * *leader's* prose, which is where it is written. The coach's phase-5 opening is not that. It is a
 * message whose whole purpose is to list three named options with their impact, so reading three
 * objects out of it is transcription rather than inference.
 *
 * ## What it will not do
 *
 * It never invents an option. Where the coach offered fewer than three, or none, nothing is written
 * and the slot stays empty — an audit that records three options nobody was offered is worse than
 * one that records none, because the summary would show the leader a menu they never saw.
 *
 * It never overwrites. The coach's own call wins wherever it happened, exactly as with the choice
 * offer: this is the backstop for the turn where it did not.
 *
 * That check runs **before** the provider call, and deliberately: a turn where the coach recorded the
 * options itself costs nothing at all here. The briefing therefore still asks it to make the call,
 * even though this exists — on an account with a per-minute token budget, the cheapest version of
 * this pass is the one that finds the work already done and stops.
 *
 * ## Failure is silent by design
 *
 * A leader's turn is their conversation; this is bookkeeping. Every path returns rather than raises,
 * and a run where it could not work is a run where the options are simply not recorded — which is
 * where this started.
 */

import { logger } from '@/lib/logging';
import { prisma } from '@/lib/db/client';
import { getProvider } from '@/lib/orchestration/llm/provider-manager';
import { resolveAgentProviderAndModel } from '@/lib/orchestration/llm/agent-resolver';
import { runStructuredCompletion } from '@/lib/orchestration/llm/structured-completion';
import type { LlmMessage } from '@/lib/orchestration/llm/types';
import { SLOT_SOURCE_TYPE } from '@/lib/framework/data-slots/vocabulary';
import { reclaimCoachAgent } from '@/lib/app/programme/agent';
import { readRunAnswers } from '@/lib/app/programme/runs/answers';
import { saveAnswerWithRetry } from '@/lib/app/programme/slots/write';

/** The slot this pass fills, and the only one it may touch. */
export const ACTION_OPTIONS_SLUG = 'reclaim_action_options';

/** The phase whose opening offers them. */
export const ACTION_OPTIONS_PHASE = 'phase-5-action';

/** Exactly what the briefing asks the coach to offer. Fewer is a turn that did not do it. */
const REQUIRED_OPTIONS = 3;

/**
 * Bounded hard, because this runs on a key with a per-minute token budget and it is the second call
 * of that opening turn. The input is one message and the output is three short pairs.
 */
const EXTRACT_MAX_TOKENS = 500;
const EXTRACT_TIMEOUT_MS = 15_000;
const EXTRACT_TEMPERATURE = 0;

const SYSTEM_PROMPT = [
  'You transcribe, you do not compose.',
  '',
  'You are given one message a coach has just sent a leader, opening the action-plan part of a time',
  'audit. That message should offer three different places the leader could start, each with a sense',
  'of the difference it would make. Return those three, in the order they were offered.',
  '',
  'Rules, and the first one is the one that matters:',
  '- Only return an option the message actually offered. Never invent, complete, merge or improve one.',
  '- If the message offered fewer than three, return only the ones it offered. If it offered none,',
  '  return an empty list. Both are correct answers and neither is a failure.',
  "- `title` is the option itself, in the coach's own words, trimmed to a short phrase.",
  '- `impact` is the difference that option was said to make. Where none was stated, use an empty',
  '  string rather than writing one.',
  "- A question the coach asked is not an option. Neither is a summary of the leader's figures.",
].join('\n');

const responseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['options'],
  properties: {
    options: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'impact'],
        properties: {
          title: { type: 'string' },
          impact: { type: 'string' },
        },
      },
    },
  },
} as const;

/** One entry point the coach put in front of the leader. */
export interface ActionOption {
  title: string;
  impact: string;
}

function parseOptions(content: string): ActionOption[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const raw = (parsed as { options?: unknown }).options;
  if (!Array.isArray(raw)) return null;

  const options: ActionOption[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) return null;
    const { title, impact } = entry as { title?: unknown; impact?: unknown };
    if (typeof title !== 'string' || typeof impact !== 'string') return null;
    // A blank title is not an option, however confidently it was returned.
    if (title.trim().length === 0) continue;
    options.push({ title: title.trim(), impact: impact.trim() });
  }
  return options;
}

export interface ActionOptionsInput {
  userId: string;
  runId: string;
  phaseKey: string;
  conversationId?: string;
}

export interface ActionOptionsResult {
  recorded: boolean;
  /** Why nothing was written, when nothing was. Slugs and reasons only — never the leader's words. */
  skipped?:
    | 'wrong_phase'
    | 'no_transcript'
    | 'already_held'
    | 'nothing_offered'
    | 'too_few_offered'
    | 'provider_unavailable'
    | 'failed';
  /** How many the coach actually offered, when that is why nothing was written. */
  offered?: number;
}

/**
 * The coach's most recent message in this conversation — the opening it has just spoken.
 *
 * One message, not an exchange. The options are offered in a single turn by design ("this phase
 * begins with you, not with the leader"), and widening the window would let an option the coach
 * mentioned in a later, different context be transcribed as part of the opening menu.
 */
async function latestCoachMessage(conversationId: string): Promise<string | null> {
  const row = await prisma.aiMessage.findFirst({
    where: { conversationId, role: 'assistant' },
    orderBy: { createdAt: 'desc' },
    select: { content: true },
  });
  const content = row?.content.trim() ?? '';
  return content.length > 0 ? content : null;
}

/**
 * Read the three options out of the opening the coach has just spoken, and record them.
 *
 * Called on the way past the `done` frame of a phase-5 opening turn, which is the one opening that
 * has something in it to record. Returns rather than throws, always.
 */
export async function sweepActionOptions(input: ActionOptionsInput): Promise<ActionOptionsResult> {
  const { userId, runId, phaseKey, conversationId } = input;
  if (phaseKey !== ACTION_OPTIONS_PHASE) return { recorded: false, skipped: 'wrong_phase' };
  if (conversationId === undefined) return { recorded: false, skipped: 'no_transcript' };

  try {
    // The coach's own call wins wherever it happened. This is the backstop for the turn where it
    // did not, so a slot already holding this run's options is left exactly as it is.
    const answers = await readRunAnswers(userId, runId, [ACTION_OPTIONS_SLUG]);
    if (answers[ACTION_OPTIONS_SLUG] !== undefined) {
      return { recorded: false, skipped: 'already_held' };
    }

    const opening = await latestCoachMessage(conversationId);
    if (opening === null) return { recorded: false, skipped: 'no_transcript' };

    const agent = await prisma.aiAgent.findUnique({
      where: { slug: reclaimCoachAgent.slug },
      select: { id: true, provider: true, model: true, fallbackProviders: true },
    });
    if (agent === null) return { recorded: false, skipped: 'provider_unavailable' };
    const { providerSlug, model } = await resolveAgentProviderAndModel(agent, 'chat');
    const provider = await getProvider(providerSlug);

    const messages: LlmMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `The message the coach just sent:\n\n${opening}` },
    ];

    const { value: options } = await runStructuredCompletion<ActionOption[]>({
      provider,
      model,
      messages,
      responseSchema,
      responseSchemaName: 'reclaim_action_options',
      parse: parseOptions,
      retryUserMessage:
        'Respond ONLY with {"options":[{"title","impact"}]}. An empty options array is a valid answer. Never invent an option the message did not offer. No prose.',
      temperature: EXTRACT_TEMPERATURE,
      maxTokens: EXTRACT_MAX_TOKENS,
      timeoutMs: EXTRACT_TIMEOUT_MS,
      phase: 'reclaim-action-options',
    });

    if (options.length === 0) return { recorded: false, skipped: 'nothing_offered' };
    // **Fewer than three is not written, and this is the guard that matters.** The reading means
    // "the menu this leader was shown". A partial menu recorded as the whole one would put a choice
    // in the summary that the leader was never actually given, and there is no way to tell later
    // that it was partial. A turn that offered two is a turn the coach did not do properly, and the
    // honest record of that is an empty slot.
    if (options.length < REQUIRED_OPTIONS) {
      return { recorded: false, skipped: 'too_few_offered', offered: options.length };
    }

    // The slot is `json`, so the value carries the structure and the plain string is the titles, for
    // any surface that shows a reading as text without knowing its shape.
    const chosen = options.slice(0, REQUIRED_OPTIONS);
    await saveAnswerWithRetry({
      userId,
      runId,
      slotSlug: ACTION_OPTIONS_SLUG,
      value: chosen.map((option) => option.title).join('; '),
      // Spread into plain objects: `ActionOption` is an interface, and Prisma's `InputJsonValue`
      // rejects one for want of an index signature even though the shape is pure JSON.
      valueJson: chosen.map((option) => ({ title: option.title, impact: option.impact })),
      // The coach offered these and the leader has read them; this pass only wrote down what was
      // already said. `inferred` would tell the panel to offer them back for checking, which would
      // ask the leader to confirm a menu rather than choose from it.
      sourceType: SLOT_SOURCE_TYPE.built_across_turns,
      confidence: 9,
      reasoningNote: 'Transcribed from the coach opening that offered them.',
      conversationId,
      nodeKey: phaseKey,
    });

    return { recorded: true };
  } catch (error: unknown) {
    logger.warn('Reclaim action-options sweep failed; the phase carries on without them', {
      runId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { recorded: false, skipped: 'failed' };
  }
}
