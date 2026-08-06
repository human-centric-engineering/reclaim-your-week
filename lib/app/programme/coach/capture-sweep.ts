/**
 * The capture sweep — the half of recording that does not depend on the coach remembering to.
 *
 * ## Why this exists
 *
 * Everything this product knows about a leader arrives through one mechanism: the coach noticing that
 * something it just heard belongs in a slot, and choosing, unprompted and silently, to call
 * `record_answers` in the middle of a warm conversation. That is a side effect asked of a model whose
 * actual job is the conversation, and across three rounds of live testing it failed in three
 * different ways: a schema that rejected a whole batch for one coercible number, a model that
 * narrated "I'll record that…" and called nothing, and — after both of those were fixed — a model
 * that records a paragraph of facts reliably and drops the one-sentence answer to the question it
 * just asked. Each fix was real. None of them made capture a mechanism, because prompting is a hit
 * rate however it is worded, and a hit rate is not what an audit can be built on.
 *
 * So capture stops being something the coach volunteers and becomes something that happens. The
 * conversational model still records as it goes, and should: it has the full context, it can ask for
 * a figure and record what the leader agrees to, and a reading it takes in the moment is better than
 * one reconstructed afterwards. This runs **after** it, over what is still missing.
 *
 * ## Deterministic where it can be, a model only where it must be
 *
 * The extraction is a model call, because reading "I end up spending more time with the Manchester
 * people to compensate for not being located there" as an answer about distributed leadership is a
 * language judgement and nothing else will make it. Every other part is code:
 *
 *  - **It always runs**, on every leader turn, whether or not the coach recorded anything. There is
 *    no branch where capture is skipped because a model decided the turn was conversational.
 *  - **The worklist is computed**, from `phaseCaptureSlots` and the run's own answers, so the sweep
 *    can only ever write into the phase the leader is on.
 *  - **The writes go through `checkSlotWrite` and `saveAnswer`**, exactly as the coach's own do, so
 *    the group allowlist, the typed-value rule, masking and run stamping (I3, I5, I6) hold without a
 *    second implementation of any of them.
 *  - **The response is schema-constrained** and every field is re-validated here regardless.
 *
 * ## Synthesis, and why a captured slot is not a closed one
 *
 * A leader does not deliver a reading and stop. They say "about fifteen hours on relationships", and
 * two turns later, describing something else, they mention that most of it is one board member. The
 * second sentence is not a new slot; it is the first reading, better. So the sweep sees what the run
 * already holds and may return a **superseding** value that carries both, recorded as
 * `built_across_turns` — the source type the framework's own vocabulary defines for exactly this and
 * which nothing in this app had ever written. Slot values are versioned, so the earlier reading is
 * not lost; it is behind the newer one, where the audit trail can still see it.
 *
 * Two things it may not do, and both are guards rather than instructions:
 *
 *  - **Never supersede what the leader confirmed.** A `user_confirmed` reading is one they were shown
 *    and agreed to. Improving on it is the tool editing the leader.
 *  - **Never supersede on a guess.** A superseding reading has to be at least as well-evidenced as
 *    the one it replaces, or a low-confidence inference could quietly displace something stated
 *    plainly two turns ago.
 *
 * ## What it will not touch
 *
 *  - **Reflections.** A reflection is the leader's own noticing, asked as a real question and
 *    answered in their words. A sweep that inferred one would be the tool having the pause on their
 *    behalf, which is the one thing `writable-slots.ts` is most careful about. Excluded here as well
 *    as refused there.
 *  - **Structured (`json`) readings.** There is no honest way to read an object out of prose, and the
 *    slots that want one are built by the coach rather than spoken by the leader.
 *  - **Anything outside the current phase**, or outside the coach-writable groups.
 *
 * ## Failure is silent by design
 *
 * A sweep that throws must never cost a leader their turn. Every path returns rather than raises, the
 * caller treats the result as advisory, and a turn where the sweep could not run is exactly a turn
 * where capture is what it was before this file existed.
 */

import { logger } from '@/lib/logging';
import { prisma } from '@/lib/db/client';
import { getProvider } from '@/lib/orchestration/llm/provider-manager';
import { resolveAgentProviderAndModel } from '@/lib/orchestration/llm/agent-resolver';
import { runStructuredCompletion } from '@/lib/orchestration/llm/structured-completion';
import type { LlmMessage } from '@/lib/orchestration/llm/types';
import { SLOT_SOURCE_TYPE, type SlotSourceType } from '@/lib/framework/data-slots/vocabulary';
import { reclaimCoachAgent } from '@/lib/app/programme/agent';
import { readRunAnswers, type RunAnswer } from '@/lib/app/programme/runs/answers';
import { readBucketLabels } from '@/lib/app/programme/buckets/labels';
import {
  phaseCaptureSlots,
  slotApplies,
  type PhaseSlot,
} from '@/lib/app/programme/coach/phase-slots';
import {
  checkSlotWrite,
  numberProse,
  REFLECTION_GROUP,
  slotDefinitionFor,
} from '@/lib/app/programme/coach/writable-slots';
import { saveAnswerWithRetry } from '@/lib/app/programme/slots/write';
import { truthy } from '@/lib/app/programme/chart/series';

/** How many turns of the exchange the sweep reads. Enough for a "yes" to have its question. */
const TRANSCRIPT_TURNS = 6;

/** Bounded so one long turn cannot spend a phase's worth of tokens on one sweep. */
const SWEEP_MAX_TOKENS = 1200;
const SWEEP_TIMEOUT_MS = 15_000;

/** Extraction wants the near-deterministic end of the range, not the conversational one. */
const SWEEP_TEMPERATURE = 0;

/** The most readings one sweep may write. A turn that yields more than this is not a turn. */
const MAX_READINGS = 10;

/** Below this, a proposed reading is a guess, and a guess may not displace a settled reading. */
const SUPERSEDE_MIN_CONFIDENCE = 7;

/** A reading the leader was shown and agreed to. The sweep never writes over one. */
const USER_CONFIRMED = 'user_confirmed';

/** What one sweep did, for the caller's log. Never thrown, never surfaced to the leader. */
export interface CaptureSweepResult {
  recorded: string[];
  refused: string[];
  /** Set when the sweep did not run at all, with the reason. Not an error. */
  skipped?:
    'no_slots' | 'nothing_outstanding' | 'no_transcript' | 'provider_unavailable' | 'failed';
}

/** One reading the sweep proposes, after validation. */
interface ProposedReading {
  slotSlug: string;
  value: string;
  verbatim?: string;
  confidence: number;
  sourceType: SlotSourceType;
  reasoningNote: string;
  supersedes: boolean;
}

/** Narrow a provider-supplied string to the vocabulary, or reject it. */
function asSourceType(raw: unknown): SlotSourceType | null {
  return typeof raw === 'string' && raw in SLOT_SOURCE_TYPE ? (raw as SlotSourceType) : null;
}

/**
 * The JSON Schema the provider is constrained to.
 *
 * **Every field is a string or an integer, and `valueJson` is deliberately absent.** A typed slot's
 * value arrives in `value` as the bare figure ("25", "Yes", "2026-07-28") and is converted by
 * `deriveTypedValue` inside `checkSlotWrite`, which is exact about how little it will read out of
 * prose. That keeps the schema portable across providers and removes the one field a model most
 * often gets the JSON type of wrong — which is the mistake that started this whole thread.
 *
 * The bare figure is what this sweep sends and never what gets stored: the same gate dresses a naked
 * number in its unit ("5" → "5 hours") before it reaches the panel the leader reads. See
 * `numberProse`.
 */
const responseSchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    readings: {
      type: 'array',
      maxItems: MAX_READINGS,
      items: {
        type: 'object',
        properties: {
          slotSlug: { type: 'string' },
          value: { type: 'string' },
          verbatim: { type: 'string' },
          confidence: { type: 'integer', minimum: 1, maximum: 10 },
          sourceType: { type: 'string', enum: Object.values(SLOT_SOURCE_TYPE) },
          reasoningNote: { type: 'string' },
          supersedes: { type: 'boolean' },
        },
        required: ['slotSlug', 'value', 'confidence', 'sourceType', 'reasoningNote'],
      },
    },
  },
  required: ['readings'],
};

const SYSTEM_PROMPT = `You read one exchange from a coaching conversation and say which of a named list of readings it just answered. You are not the coach and you never speak to the leader. Your entire output is the structured list.

Take only what the leader said or plainly implied. Where they answered the question they were asked, that answer belongs to the reading the question was for, even when it is a single sentence and reads like conversation rather than data. That case is the most commonly missed one and it is the main reason you exist.

Never invent. A reading you cannot support from the exchange is one you leave out, and leaving something out costs nothing because you run again on the next turn. An empty list is a correct and common answer.

Leaving one out means returning nothing for it. It never means returning it with a value that says it was not answered. "The leader did not give their first name", "not provided", "unknown" and anything like them are not values: the leader is shown every value you return, under that reading's own name, as though they had said it. If the exchange did not answer a reading, it is simply not in your list.

Where a reading needs a figure, a yes or no, or a date, put the bare value in the value field and nothing else: "25", "Yes", "No", "2026-07-28". A figure the leader hedged is still a figure if they named one, so "about twenty five" is 25. A figure they never named is not: if they said it varies and gave no number, leave the reading out rather than choosing one for them.

Everything else goes in value as plain language, close to the leader's own words, with their own sentence in verbatim when you have it.

Say how sure you are. Use 9 or 10 when they stated it plainly, 4 to 6 when you read it from something adjacent, and mark how you came by it: direct when they answered the question, unprompted when they volunteered it, emerged_naturally when it surfaced while discussing something else, inferred when you read between the lines.

Some readings on the list are already captured, and their current value is shown. Leave those alone unless this exchange genuinely adds to them. When it does, return the reading again with supersedes set to true and with a value that carries both what was already known and what is new, as one coherent sentence rather than two stuck together. Use built_across_turns as the source type. Do not return a reading again to reword it, to tidy it, or to say the same thing differently.`;

/** The transcript lines the sweep reads, oldest first. */
async function recentExchange(conversationId: string): Promise<string[]> {
  const rows = await prisma.aiMessage.findMany({
    where: { conversationId, role: { in: ['user', 'assistant'] } },
    orderBy: { createdAt: 'desc' },
    take: TRANSCRIPT_TURNS,
    select: { role: true, content: true },
  });
  return rows
    .reverse()
    .filter((row) => row.content.trim().length > 0)
    .map((row) => `${row.role === 'user' ? 'Leader' : 'Coach'}: ${row.content}`);
}

/** What a typed slot needs, in the words the extractor should act on. */
function typedHint(dataType: string): string {
  switch (dataType) {
    case 'number':
      return ' — the bare figure only';
    case 'boolean':
      return ' — "Yes" or "No" only';
    case 'date':
      return ' — an ISO date only';
    default:
      return '';
  }
}

/** One line per reading: what it is, and where this run stands on it. */
function briefLine(slot: PhaseSlot, answer: RunAnswer | undefined): string {
  if (answer === undefined) {
    return `- ${slot.slug} (not yet captured): ${slot.label}${typedHint(slot.dataType)}`;
  }
  return `- ${slot.slug} (captured as "${answer.value}"): ${slot.label}. Return this again only if the exchange adds to it.`;
}

/**
 * Whether a proposed reading may be written over what the run already holds.
 *
 * Absent an existing value there is nothing to protect, so anything goes. With one, two guards, and
 * both are about who owns the sentence rather than about which is better written.
 */
function maySupersede(existing: RunAnswer | undefined, proposed: ProposedReading): boolean {
  if (existing === undefined) return true;
  if (!proposed.supersedes) return false;
  if (existing.sourceType === USER_CONFIRMED) return false;
  if (proposed.confidence < SUPERSEDE_MIN_CONFIDENCE) return false;
  // A reading identical to the one already stored is a rewrite, not an addition. Compared against
  // the prose as it would be *stored*: this sweep sends figures bare and the gate dresses them in
  // their unit, so a proposed "5" against a stored "5 hours" is the same reading twice.
  const asStored = numberProse(proposed.slotSlug, proposed.value) ?? proposed.value;
  return asStored.trim() !== existing.value.trim();
}

/** Parse and shape-check the provider's response. Anything malformed is dropped, never guessed at. */
function parseReadings(raw: string): ProposedReading[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object') return null;
  const list = (parsed as Record<string, unknown>)['readings'];
  if (!Array.isArray(list)) return null;

  const out: ProposedReading[] = [];
  for (const item of list.slice(0, MAX_READINGS)) {
    if (item === null || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const slotSlug = row['slotSlug'];
    const value = row['value'];
    const sourceType = asSourceType(row['sourceType']);
    if (typeof slotSlug !== 'string' || slotSlug.length === 0) continue;
    if (typeof value !== 'string' || value.trim().length === 0) continue;
    if (sourceType === null) continue;
    const confidence = typeof row['confidence'] === 'number' ? Math.round(row['confidence']) : 6;
    out.push({
      slotSlug,
      value: value.trim(),
      ...(typeof row['verbatim'] === 'string' && row['verbatim'].trim().length > 0
        ? { verbatim: row['verbatim'].trim().slice(0, 2000) }
        : {}),
      confidence: Math.min(10, Math.max(1, confidence)),
      sourceType,
      reasoningNote:
        typeof row['reasoningNote'] === 'string' && row['reasoningNote'].length > 0
          ? row['reasoningNote']
          : 'Read from the exchange by the capture sweep.',
      supersedes: row['supersedes'] === true,
    });
  }
  // An empty list is a real answer, so it is returned as one rather than as a parse failure — a null
  // here would trigger the runner's retry and spend a second call saying nothing again.
  return out;
}

export interface CaptureSweepInput {
  userId: string;
  runId: string;
  /** The phase from the server-issued scope. The sweep can write nowhere else. */
  phaseKey: string;
  /** The run's conversation. Absent means there is no exchange to read, so the sweep does not run. */
  conversationId?: string;
}

/**
 * Read the last exchange and record what it answered. Never throws.
 *
 * Runs after the coach's turn has landed, so what it sees as outstanding is genuinely outstanding —
 * anything the coach recorded mid-turn is already in `readRunAnswers` by the time this reads it, and
 * the sweep quietly has nothing to do. That ordering is the whole reason the two writers do not
 * fight: the conversational one goes first and this one covers what it missed.
 */
export async function runCaptureSweep(input: CaptureSweepInput): Promise<CaptureSweepResult> {
  const { userId, runId, phaseKey, conversationId } = input;
  const empty: CaptureSweepResult = { recorded: [], refused: [] };
  if (conversationId === undefined) return { ...empty, skipped: 'no_transcript' };

  try {
    const [answers, bucketLabels] = await Promise.all([
      readRunAnswers(userId, runId),
      readBucketLabels(userId).catch(() => ({})),
    ]);

    const slots = phaseCaptureSlots(phaseKey, {
      fundraisingRelevant: truthy(answers['reclaim_setup_fundraising_relevant']),
      bucketLabels,
    })
      // A structured reading has no honest prose form, and a reflection is the leader's own to have.
      .filter((slot) => slot.dataType !== 'json')
      .filter((slot) => slotDefinitionFor(slot.slug)?.group !== REFLECTION_GROUP)
      // A reading whose condition came back the other way is finished, not missing.
      .filter((slot) => slotApplies(slot.askOnlyIf, answers) !== false);

    if (slots.length === 0) return { ...empty, skipped: 'no_slots' };

    const exchange = await recentExchange(conversationId);
    if (exchange.length === 0) return { ...empty, skipped: 'no_transcript' };

    const agent = await prisma.aiAgent.findUnique({
      where: { slug: reclaimCoachAgent.slug },
      select: { id: true, provider: true, model: true, fallbackProviders: true },
    });
    if (agent === null) return { ...empty, skipped: 'provider_unavailable' };
    const { providerSlug, model } = await resolveAgentProviderAndModel(agent, 'chat');
    const provider = await getProvider(providerSlug);

    const messages: LlmMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content:
          `The readings this part of the audit captures:\n${slots
            .map((slot) => briefLine(slot, answers[slot.slug]))
            .join('\n')}\n\n` + `The exchange, oldest first:\n${exchange.join('\n\n')}`,
      },
    ];

    const { value: readings } = await runStructuredCompletion<ProposedReading[]>({
      provider,
      model,
      messages,
      responseSchema,
      responseSchemaName: 'reclaim_capture_sweep',
      parse: parseReadings,
      retryUserMessage:
        'Respond ONLY with {"readings":[{"slotSlug","value","confidence","sourceType","reasoningNote"}]}. An empty readings array is a valid answer. No prose.',
      temperature: SWEEP_TEMPERATURE,
      maxTokens: SWEEP_MAX_TOKENS,
      timeoutMs: SWEEP_TIMEOUT_MS,
      phase: 'reclaim-capture-sweep',
    });

    if (readings.length === 0) return { ...empty, skipped: 'nothing_outstanding' };

    const onThisPhase = new Set(slots.map((slot) => slot.slug));
    const recorded: string[] = [];
    const refused: string[] = [];

    for (const reading of readings) {
      // The phase list is the outer bound and it is checked here rather than trusted from the prompt:
      // the brief names these slugs, so a slug outside it is the model reaching past its worklist.
      if (!onThisPhase.has(reading.slotSlug)) {
        refused.push(`${reading.slotSlug}:off_phase`);
        continue;
      }
      if (!maySupersede(answers[reading.slotSlug], reading)) {
        refused.push(`${reading.slotSlug}:already_held`);
        continue;
      }

      // The same gate the coach's own writes pass, for the same reasons. `valueJson` is undefined on
      // purpose: a typed slot's figure is read out of the prose by `deriveTypedValue`, so a value
      // this sweep could not state plainly is refused here rather than stored as a wrong number.
      const check = checkSlotWrite(reading.slotSlug, undefined, {
        phaseKey,
        sourceType: reading.sourceType,
        value: reading.value,
      });
      if (!check.ok) {
        refused.push(`${reading.slotSlug}:${check.refusal.code}`);
        continue;
      }

      const written = await saveAnswerWithRetry({
        userId,
        runId,
        slotSlug: check.accepted.slotSlug,
        // The gate's own prose where it had something to say about it — a yes-or-no is stored as the
        // word for the answer, never as a sentence about it. See `checkSlotWrite`.
        value: check.accepted.value ?? reading.value,
        ...(reading.verbatim !== undefined ? { verbatim: reading.verbatim } : {}),
        ...(check.accepted.valueJson !== undefined ? { valueJson: check.accepted.valueJson } : {}),
        confidence: reading.confidence,
        // A reading that adds to one already held is exactly what the vocabulary means by this, and
        // the panel reads the source type to decide what to offer back for checking.
        sourceType:
          answers[reading.slotSlug] !== undefined
            ? SLOT_SOURCE_TYPE.built_across_turns
            : reading.sourceType,
        reasoningNote: reading.reasoningNote,
        conversationId,
        nodeKey: phaseKey,
      });
      recorded.push(written.slotSlug);
    }

    return { recorded, refused };
  } catch (error: unknown) {
    // Slugs and counts only, and not even those here: a sweep that failed has nothing to name.
    logger.warn('Reclaim capture sweep failed', {
      runId,
      phaseKey,
      error: error instanceof Error ? error.message : String(error),
    });
    return { ...empty, skipped: 'failed' };
  }
}
