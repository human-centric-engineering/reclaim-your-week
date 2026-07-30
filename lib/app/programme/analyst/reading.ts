/**
 * The analyst's reading — the schema, the call, and the refusals (F14 t-2).
 *
 * Produces the two §10 items `buildSummary` has never carried: the key gaps, and a phased pathway.
 *
 * ## Why the guards are structural rather than prompt discipline
 *
 * I16 is the line this must not cross: _"It offers a mirror and some options. The decisions stay
 * with them. It reflects; it does not decide."_ A summary agent is the easiest place in this product
 * to build an advice engine by accident.
 *
 * The prose in `analyst/agent.ts` asks for the right thing, and asking is not a guarantee. P23
 * settled that: **a side effect asked of a model is a hit rate, and this product does not build on
 * hit rates.** So the two things that actually hold are here, in code:
 *
 *  1. **The schema has nowhere to put a verdict.** No `recommendation`, no `priority`, no `score`,
 *     no `severity`, no `risk`. A model cannot rank the leader's week because the shape it must
 *     return has no field for a ranking. Same move `offer_choices` makes: the model names the
 *     reading, the product owns the answer.
 *  2. **`parseAnalystReading` refuses, and refuses whole.** A banned term, an em dash, an imperative
 *     opener, a token the brief did not supply, the wrong number of items, an over-length string —
 *     any one of them discards the entire reading and returns `null`. Never a partial: half a
 *     reading is a reading with the inconvenient half removed, and it would ship under the same
 *     "this passed the guard" belief as a clean one.
 *
 * ## What `null` means downstream
 *
 * Every surface renders nothing for a `null` reading — no error, no placeholder, no apology. Telling
 * a leader their artifact is defective when it satisfies §10's other six bullets is worse than
 * silence, and the summary was complete without these two sections for the whole of v1.
 */

import { logger } from '@/lib/logging';
import { prisma } from '@/lib/db/client';
import { getProvider } from '@/lib/orchestration/llm/provider-manager';
import { resolveAgentProviderAndModel } from '@/lib/orchestration/llm/agent-resolver';
import { runStructuredCompletion } from '@/lib/orchestration/llm/structured-completion';
import type { LlmMessage } from '@/lib/orchestration/llm/types';
import { RECLAIM_BANNED_LEXICON } from '@/lib/app/programme/agent';
import {
  analystSystemPrompt,
  reclaimAnalystAgent,
  ANALYST_IMPERATIVE_OPENERS,
} from '@/lib/app/programme/analyst/agent';
import { briefToPrompt, briefTokens, type AnalystBrief } from '@/lib/app/programme/analyst/brief';

/** One difference already present in the leader's own figures, anchored to an area they were asked about. */
export interface AnalystGap {
  /** Must be one of the brief's tokens. A gap about anything else is the analyst inventing a subject. */
  token: string;
  /** One sentence. An observation about the week, never a judgement about the leader. */
  observation: string;
}

/** One step in a sequence the leader could take, with what it would likely change. */
export interface AnalystStep {
  horizon: 'now' | 'next' | 'later';
  step: string;
  difference: string;
}

export interface AnalystReading {
  gaps: AnalystGap[];
  pathway: AnalystStep[];
}

const HORIZONS = ['now', 'next', 'later'] as const;

/** Two to four gaps. Fewer than two is not a reading; more than four is a list nobody reads. */
const MIN_GAPS = 2;
const MAX_GAPS = 4;
/** Exactly three, one per horizon — the shape is the sequence. */
const PATHWAY_LENGTH = 3;

const MAX_OBSERVATION = 220;
const MAX_STEP = 160;
const MAX_DIFFERENCE = 200;

const TEMPERATURE = 0.3;
const MAX_TOKENS = 900;
const TIMEOUT_MS = 20_000;

/**
 * The response schema, forwarded to the provider natively.
 *
 * `additionalProperties: false` throughout, so a model that wants to add a `priority` cannot: the
 * provider rejects it before it reaches the parser. The parser still checks, because a fallback
 * provider without native schema support would otherwise be the one door left open.
 */
const responseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['gaps', 'pathway'],
  properties: {
    gaps: {
      type: 'array',
      minItems: MIN_GAPS,
      maxItems: MAX_GAPS,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['token', 'observation'],
        properties: {
          token: { type: 'string' },
          observation: { type: 'string' },
        },
      },
    },
    pathway: {
      type: 'array',
      minItems: PATHWAY_LENGTH,
      maxItems: PATHWAY_LENGTH,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['horizon', 'step', 'difference'],
        properties: {
          horizon: { type: 'string', enum: [...HORIZONS] },
          step: { type: 'string' },
          difference: { type: 'string' },
        },
      },
    },
  },
} as const;

function offends(value: string): string | null {
  const lower = value.toLowerCase();
  const banned = RECLAIM_BANNED_LEXICON.find((term) => lower.includes(term.toLowerCase()));
  if (banned !== undefined) return `banned term "${banned}"`;
  if (value.includes('—')) return 'em dash';
  // One list, shared with the guardrails prose that tells the model about it. See
  // `ANALYST_IMPERATIVE_OPENERS` for the live failure that made sharing it non-optional.
  const opener = ANALYST_IMPERATIVE_OPENERS.find((o) => lower.trimStart().startsWith(o));
  if (opener !== undefined) return `imperative opener "${opener.trim()}"`;
  return null;
}

/** A field that is present, non-empty, within its cap, and free of everything above. */
function clean(value: unknown, cap: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > cap) return null;
  return offends(trimmed) === null ? trimmed : null;
}

/**
 * Parse and refuse. Returns `null` for anything that is not a complete, clean reading.
 *
 * **Whole-or-nothing, and this is the load-bearing decision.** Dropping the one offending gap and
 * keeping the rest would ship a reading that passed the guard with its worst sentence quietly
 * deleted, which reads to every downstream surface exactly like a reading that never had one. The
 * refusal is logged with a reason so an operator can see the analyst being refused rather than
 * finding two empty sections and no explanation.
 */
export function parseAnalystReading(
  raw: unknown,
  allowedTokens: Set<string>
): AnalystReading | null {
  const refuse = (reason: string): null => {
    logger.warn('Reclaim analyst reading refused', { reason });
    return null;
  };

  if (raw === null || typeof raw !== 'object') return refuse('not an object');
  const { gaps, pathway } = raw as Record<string, unknown>;

  if (!Array.isArray(gaps) || gaps.length < MIN_GAPS || gaps.length > MAX_GAPS) {
    return refuse(`gaps must number ${MIN_GAPS} to ${MAX_GAPS}`);
  }
  if (!Array.isArray(pathway) || pathway.length !== PATHWAY_LENGTH) {
    return refuse(`pathway must have exactly ${PATHWAY_LENGTH} steps`);
  }

  const parsedGaps: AnalystGap[] = [];
  for (const entry of gaps) {
    if (entry === null || typeof entry !== 'object') return refuse('a gap is not an object');
    const { token, observation } = entry as Record<string, unknown>;
    if (typeof token !== 'string' || !allowedTokens.has(token)) {
      return refuse(`gap anchored to an area the brief did not supply: ${String(token)}`);
    }
    const text = clean(observation, MAX_OBSERVATION);
    if (text === null) {
      return refuse(`gap observation refused: ${offends(String(observation)) ?? 'shape'}`);
    }
    parsedGaps.push({ token, observation: text });
  }

  // One area, one gap. Both render surfaces key their list on the token (`summary-view.tsx`,
  // `summary-pdf-document.tsx`), the same reason the pathway is checked for a repeated horizon below
  // — a duplicate here is not a second observation, it is the same area named twice.
  if (new Set(parsedGaps.map((g) => g.token)).size !== parsedGaps.length) {
    return refuse('a gap repeats an area already named');
  }

  const parsedPathway: AnalystStep[] = [];
  for (const entry of pathway) {
    if (entry === null || typeof entry !== 'object') return refuse('a step is not an object');
    const { horizon, step, difference } = entry as Record<string, unknown>;
    if (typeof horizon !== 'string' || !HORIZONS.includes(horizon as AnalystStep['horizon'])) {
      return refuse(`unknown horizon: ${String(horizon)}`);
    }
    const stepText = clean(step, MAX_STEP);
    if (stepText === null) return refuse(`step refused: ${offends(String(step)) ?? 'shape'}`);
    const differenceText = clean(difference, MAX_DIFFERENCE);
    if (differenceText === null) {
      return refuse(`difference refused: ${offends(String(difference)) ?? 'shape'}`);
    }
    parsedPathway.push({
      horizon: horizon as AnalystStep['horizon'],
      step: stepText,
      difference: differenceText,
    });
  }

  // One of each, in order. A pathway of three "now" steps is a list, not a sequence, and the whole
  // reason this section exists is to let a leader see further than the step they already chose.
  const horizons = parsedPathway.map((s) => s.horizon);
  if (new Set(horizons).size !== PATHWAY_LENGTH) return refuse('the pathway repeats a horizon');
  parsedPathway.sort((a, b) => HORIZONS.indexOf(a.horizon) - HORIZONS.indexOf(b.horizon));

  return { gaps: parsedGaps, pathway: parsedPathway };
}

/**
 * Run the analyst over a brief. `null` on anything that is not a clean reading, including a brief
 * with too little in it to be worth the call.
 *
 * Never throws. Every caller is on a path where the leader is finishing or reading their audit, and
 * neither is a place to surface a model failure.
 */
export async function runAnalyst(brief: AnalystBrief): Promise<AnalystReading | null> {
  if (!brief.usable) return null;

  try {
    const agent = await prisma.aiAgent.findUnique({
      where: { slug: reclaimAnalystAgent.slug },
      select: { id: true, provider: true, model: true, fallbackProviders: true },
    });
    if (agent === null) {
      logger.warn('Reclaim analyst agent row missing; skipping the reading');
      return null;
    }

    const { providerSlug, model } = await resolveAgentProviderAndModel(agent, 'chat');
    const provider = await getProvider(providerSlug);

    const messages: LlmMessage[] = [
      { role: 'system', content: analystSystemPrompt() },
      { role: 'user', content: briefToPrompt(brief) },
    ];

    const { value, costUsd, tokenUsage } = await runStructuredCompletion<unknown>({
      provider,
      model,
      messages,
      responseSchema,
      responseSchemaName: 'reclaim_analyst_reading',
      // Parsing happens after, over the raw value, so a refusal is not mistaken for a parse failure
      // and retried at temperature zero. A model that produced a verdict once will produce it again.
      parse: (text) => {
        try {
          return JSON.parse(text) as unknown;
        } catch {
          return null;
        }
      },
      retryUserMessage:
        'Respond ONLY with {"gaps":[{"token","observation"}],"pathway":[{"horizon","step","difference"}]}. No prose.',
      temperature: TEMPERATURE,
      maxTokens: MAX_TOKENS,
      timeoutMs: TIMEOUT_MS,
      phase: 'reclaim-analyst',
    });

    // `runStructuredCompletion` writes no `AiCostLog`, so this line is the only record that the
    // analyst cost anything. Named rather than fixed here: the missing seam is upstream's, and the
    // capture sweep already has the same hole.
    logger.info('Reclaim analyst reading generated', {
      agentSlug: reclaimAnalystAgent.slug,
      costUsd,
      inputTokens: tokenUsage.input,
      outputTokens: tokenUsage.output,
    });

    return parseAnalystReading(value, briefTokens(brief));
  } catch (error: unknown) {
    logger.warn('Reclaim analyst reading failed; the summary stands without it', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
