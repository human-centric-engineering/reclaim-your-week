/**
 * The report's reading — the schema, the call, and the refusals.
 *
 * ## Why the guards are structural rather than prompt discipline
 *
 * I16 is the line this must not cross: _"It offers a mirror and some options. The decisions stay with
 * them. It reflects; it does not decide."_ A report agent is the easiest place in this product to
 * build an advice engine by accident, and the arc makes it easier still: a narrative wants a
 * conclusion, and a conclusion about somebody's week is a verdict.
 *
 * The prose in `report/agent.ts` asks for the right thing, and asking is not a guarantee. P23 settled
 * that: **a side effect asked of a model is a hit rate, and this product does not build on hit
 * rates.** So three things hold in code:
 *
 *  1. **The schema has nowhere to put a verdict.** No `recommendation`, no `priority`, no `score`,
 *     no `severity`, no `risk`, and no free-text heading. A model cannot rank the leader's week
 *     because the shape it must return has no field for a ranking.
 *  2. **The model does not name or order its own chapters.** `section` is an enum and the order is
 *     applied here, by `CHAPTER_ORDER`. A model that could name a section would eventually write
 *     "Areas for improvement"; one that could sequence them would build to a finding.
 *  3. **`parseReportReading` refuses, and refuses whole.** A banned term, an em dash, an imperative
 *     opener, a token the brief did not supply, a repeated chapter, an over-length paragraph: any one
 *     of them discards the entire reading and returns `null`. Never a partial. Half a report is a
 *     report with its worst paragraph quietly deleted, and it would ship under the same "this passed
 *     the guard" belief as a clean one.
 *
 * ## Content is fatal; a short list is not. This distinction cost a live report.
 *
 * The first real run of this agent produced seven good chapters, a closing line, three pathway steps
 * and **one** gap. The parser refused the whole thing, because the rule it inherited said "fewer than
 * two gaps is not a reading". That rule was written when the reading *was* two lists and nothing
 * else. Once the chapters became the report, a gap count was a supporting detail, and discarding a
 * finished narrative over it left the leader with a chart and no reading at all, with a warning in
 * the log nobody was watching.
 *
 * So the refusals split, and the line is **safety versus quantity**:
 *
 *  - **A content violation is fatal.** A banned term, an em dash, an imperative opener, an invented
 *    area token, a repeated chapter or horizon, an over-length field. Each of these is the model
 *    doing something it must never do, and each discards everything.
 *  - **A short list is kept.** Fewer gaps than asked for, fewer pathway steps, fewer chapters. The
 *    model had less to say. Every surface already renders an empty list as nothing, so a thinner
 *    report is the honest outcome and a discarded one is not.
 *  - **An over-long list is still fatal**, because that is a model ignoring its shape rather than
 *    running short of material.
 *
 * **The provider cannot enforce the counts, which is why this matters at all.** OpenAI's strict
 * structured outputs ignore `minItems` and `maxItems`; they reach the model as a request in the
 * schema and nothing rejects a response that misses them. So the minimums below are what the model is
 * *asked* for, and the parser is where "asked for" stops being "guaranteed".
 *
 * ## What `null` means downstream
 *
 * Every surface renders nothing for a `null` reading — no error, no placeholder, no apology. The
 * report still carries the leader's own figures, their chart, their chosen action and the footnote,
 * which is the document it was for the whole of v1.
 */

import { logger } from '@/lib/logging';
import { prisma } from '@/lib/db/client';
import { getProvider } from '@/lib/orchestration/llm/provider-manager';
import { resolveAgentProviderAndModel } from '@/lib/orchestration/llm/agent-resolver';
import { runStructuredCompletion } from '@/lib/orchestration/llm/structured-completion';
import type { LlmMessage } from '@/lib/orchestration/llm/types';
import { RECLAIM_BANNED_LEXICON } from '@/lib/app/programme/agent';
import {
  reportSystemPrompt,
  reclaimReportAgent,
  REPORT_IMPERATIVE_OPENERS,
} from '@/lib/app/programme/report/agent';
import { briefToPrompt, briefTokens, type ReportBrief } from '@/lib/app/programme/report/brief';
import { readReclaimReportContent, type ReclaimReportContent } from '@/lib/app/programme/config';
// The chapter vocabulary is its own module because the render surfaces need it and this one imports
// Prisma. See `report/chapters.ts`.
import { CHAPTER_ORDER, type ChapterSection } from '@/lib/app/programme/report/chapters';

export interface ReportChapter {
  section: ChapterSection;
  paragraphs: string[];
}

/** One difference already present in the leader's own figures, anchored to an area they were asked about. */
export interface ReportGap {
  /** Must be one of the brief's tokens. A gap about anything else is the report inventing a subject. */
  token: string;
  /** One sentence. An observation about the week, never a judgement about the leader. */
  observation: string;
}

/** One step in a sequence the leader could take, with what it would likely change. */
export interface ReportStep {
  horizon: 'now' | 'next' | 'later';
  step: string;
  difference: string;
}

export interface ReportReading {
  /** The arc, already in `CHAPTER_ORDER`. Empty only for a reading stored before chapters existed. */
  chapters: ReportChapter[];
  gaps: ReportGap[];
  pathway: ReportStep[];
  /** The last line, handing it back. `null` on a reading stored before it existed. */
  closing: string | null;
}

const HORIZONS = ['now', 'next', 'later'] as const;

/**
 * What the model is **asked** for. Not what the parser enforces — see the header.
 *
 * These reach the provider in the response schema, where OpenAI's strict mode ignores them, so they
 * are a request and never a guarantee. The parser accepts anything up to the maximum.
 */
const MIN_GAPS = 2;
const MAX_GAPS = 4;
/** Three steps, one per horizon, asked for. The shape is the sequence where all three arrive. */
const PATHWAY_LENGTH = 3;

/** Three chapters asked for, and never more than the eight that exist. */
const MIN_CHAPTERS = 3;
const MAX_CHAPTERS = CHAPTER_ORDER.length;
/** One to four paragraphs each. One is a caption; five is the report talking over the leader. */
const MIN_PARAGRAPHS = 1;
const MAX_PARAGRAPHS = 4;

/**
 * The length caps, and every one of them is a refusal waiting to happen.
 *
 * **They were raised because the instructions were deepened, and that order is not optional.** An
 * over-length field discards the whole reading, so asking a model for a reading of what holds a week
 * in place and then capping the paragraph at the length of a caption is asking for a refusal and
 * getting one, with a leader left holding a chart. Six sentences of plain English is comfortably over
 * seven hundred characters; a gap observation is now two sentences rather than one; the pathway's
 * `difference` has to say what would change in **this** week rather than name a benefit.
 *
 * They are still caps. Generous is not absent: a paragraph past this length is a model that has
 * stopped writing to a person and started producing volume, which is its own failure and still fatal.
 */
const MAX_PARAGRAPH = 900;
const MAX_OBSERVATION = 340;
const MAX_STEP = 200;
const MAX_DIFFERENCE = 300;
const MAX_CLOSING = 300;

const TEMPERATURE = 0.4;
/**
 * Sized for eight chapters of four paragraphs plus the lists, with room to finish a sentence.
 *
 * The old ceiling was four thousand, which was under the length of the report it was asking for: the
 * chapters alone can reach the best part of seven thousand tokens now. A generation that stops
 * mid-object is not a short report, it is no report at all, because the JSON never closes and the
 * parse fails before any of the guards get to see it.
 */
const MAX_TOKENS = 10_000;
/**
 * Long, because this is the longest generation the product makes and a timeout costs the leader the
 * whole reading.
 *
 * **The comment here used to say neither call site is one a leader watches a spinner through, and
 * both of them are.** `completeRun` awaits it behind "finish my audit", and the summary route awaits
 * it on the first read. So this number is time a person actually spends waiting, and doubling it is
 * not free.
 *
 * It is doubled anyway, because the alternative is worse in exactly the case it is meant to cover. A
 * longer report takes longer to write, and a ceiling that cuts a successful generation short does not
 * save the leader the wait: they wait the full minute **and** get nothing, the reading is not stored,
 * and the next refresh spends the money again to fail the same way. A ceiling is reached only when
 * something has gone wrong; the wait it prevents is one a leader was already having.
 */
const TIMEOUT_MS = 120_000;

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
  required: ['chapters', 'gaps', 'pathway', 'closing'],
  properties: {
    chapters: {
      type: 'array',
      minItems: MIN_CHAPTERS,
      maxItems: MAX_CHAPTERS,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['section', 'paragraphs'],
        properties: {
          section: { type: 'string', enum: [...CHAPTER_ORDER] },
          paragraphs: {
            type: 'array',
            minItems: MIN_PARAGRAPHS,
            maxItems: MAX_PARAGRAPHS,
            items: { type: 'string' },
          },
        },
      },
    },
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
    closing: { type: 'string' },
  },
} as const;

/**
 * Rashmir's content, as the second half of the system message.
 *
 * **The descriptions are the point.** It would be natural to send the area titles and their benchmark
 * ranges and leave the prose out, on the grounds that a report does not need a definition of what
 * strategic planning is. That reading gets it exactly backwards: the definitions are where her
 * diagnostic sits. "Above this is often a signal of under-delegation or difficulty letting go of an
 * earlier identity as a practitioner" is not a description of an area, it is the reading that turns a
 * bar chart into a report, and it is the one thing this agent had no access to.
 *
 * The framing lines around them are ours and the content between them is hers, unquoted and
 * unsummarised, exactly as `contentForPhase` hands it to the coach. It is told not to quote the
 * framework at the leader for the same reason the coach is: a leader reading their own report should
 * meet their week, not a method.
 */
function contentToPrompt(content: ReclaimReportContent): string {
  const lines: string[] = [
    'The governing frame. This is the authority on how to read everything in the brief. Treat it as',
    'given, do not restate it in your own words, and never let the report become a review of how',
    'efficiently somebody works:',
    content.governingFrame,
    '',
    'The areas of leadership time, with the benchmark for each and what time in each of them tends to',
    "mean for a leader. The wording is the tool's own and it is confidential: use it to recognise what",
    'you are reading, never quote it at the leader, and never present the framework itself:',
  ];

  for (const bucket of content.buckets) {
    lines.push(`- ${bucket.title} (${bucket.benchmark.note}): ${bucket.description}`);
  }

  lines.push(
    '',
    'On deep work, which cuts across the others:',
    content.deepWorkNote,
    '',
    'The total-hours bands, for reading what their weekly total means:',
    ...content.hourBands.map(
      (band) => `- ${band.lowerHours} to ${band.upperHours ?? 'more'} hours: ${band.label}`
    )
  );

  return lines.join('\n');
}

function offends(value: string): string | null {
  const lower = value.toLowerCase();
  const banned = RECLAIM_BANNED_LEXICON.find((term) => lower.includes(term.toLowerCase()));
  if (banned !== undefined) return `banned term "${banned}"`;
  if (value.includes('—')) return 'em dash';
  // One list, shared with the guardrails prose that tells the model about it.
  const opener = REPORT_IMPERATIVE_OPENERS.find((o) => lower.trimStart().startsWith(o));
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

/** Why a field was refused, without stringifying an object into `[object Object]` in the log. */
function describe(value: unknown): string {
  return typeof value === 'string' ? (offends(value) ?? 'shape') : 'shape';
}

/**
 * Parse and refuse. Returns `null` for anything that is not a complete, clean reading.
 *
 * **Whole-or-nothing, and this is the load-bearing decision.** Dropping the one offending paragraph
 * and keeping the rest would ship a report that passed the guard with its worst sentence quietly
 * deleted, which reads to every downstream surface exactly like a report that never had one. The
 * refusal is logged with a reason so an operator can see it being refused rather than finding a
 * shorter document and no explanation.
 */
export function parseReportReading(raw: unknown, allowedTokens: Set<string>): ReportReading | null {
  const refuse = (reason: string): null => {
    logger.warn('Reclaim report reading refused', { reason });
    return null;
  };

  if (raw === null || typeof raw !== 'object') return refuse('not an object');
  const { chapters, gaps, pathway, closing } = raw as Record<string, unknown>;

  // Absent is an empty list, not a refusal: the surfaces render nothing for one, and a model that
  // had no gaps to name has told us something true.
  //
  // **Over the maximum is trimmed, not refused**, and this is the second half of the lesson the
  // header records. The audit has nine areas and a real week has a difference in most of them, so a
  // model naming one gap per area returns five or six as a matter of course. Refusing a finished
  // report over that is the same mistake as refusing it for having too few, made in the opposite
  // direction. Every gap kept is clean, nothing objectionable is hidden by the trim, and the model is
  // asked to put the most significant first so the cut falls at the least interesting end.
  const rawGaps = gaps === undefined ? [] : gaps;
  if (!Array.isArray(rawGaps)) return refuse('gaps is not a list');
  const gapList = rawGaps.slice(0, MAX_GAPS);
  if (rawGaps.length > MAX_GAPS) {
    logger.info('Reclaim report reading trimmed', { gaps: rawGaps.length, kept: MAX_GAPS });
  }
  const pathwayList = pathway === undefined ? [] : pathway;
  if (!Array.isArray(pathwayList) || pathwayList.length > PATHWAY_LENGTH) {
    return refuse(`pathway must not exceed ${PATHWAY_LENGTH} steps`);
  }

  const parsedGaps: ReportGap[] = [];
  for (const entry of gapList) {
    if (entry === null || typeof entry !== 'object') return refuse('a gap is not an object');
    const { token, observation } = entry as Record<string, unknown>;
    if (typeof token !== 'string' || !allowedTokens.has(token)) {
      return refuse(`gap anchored to an area the brief did not supply: ${String(token)}`);
    }
    const text = clean(observation, MAX_OBSERVATION);
    if (text === null) return refuse(`gap observation refused: ${describe(observation)}`);
    parsedGaps.push({ token, observation: text });
  }

  // One area, one gap. Both render surfaces key their list on the token, and a duplicate is not a
  // second observation, it is the same area named twice.
  if (new Set(parsedGaps.map((g) => g.token)).size !== parsedGaps.length) {
    return refuse('a gap repeats an area already named');
  }

  const parsedPathway: ReportStep[] = [];
  for (const entry of pathwayList) {
    if (entry === null || typeof entry !== 'object') return refuse('a step is not an object');
    const { horizon, step, difference } = entry as Record<string, unknown>;
    if (typeof horizon !== 'string' || !HORIZONS.includes(horizon as ReportStep['horizon'])) {
      return refuse(`unknown horizon: ${String(horizon)}`);
    }
    const stepText = clean(step, MAX_STEP);
    if (stepText === null) return refuse(`step refused: ${describe(step)}`);
    const differenceText = clean(difference, MAX_DIFFERENCE);
    if (differenceText === null) return refuse(`difference refused: ${describe(difference)}`);
    parsedPathway.push({
      horizon: horizon as ReportStep['horizon'],
      step: stepText,
      difference: differenceText,
    });
  }

  // One of each, in order. A pathway of three "now" steps is a list, not a sequence — a repeat is a
  // content failure and fatal, where a short pathway is only a short one.
  if (new Set(parsedPathway.map((s) => s.horizon)).size !== parsedPathway.length) {
    return refuse('the pathway repeats a horizon');
  }
  parsedPathway.sort((a, b) => HORIZONS.indexOf(a.horizon) - HORIZONS.indexOf(b.horizon));

  // The arc. **Absent is tolerated, present and dirty is not** — a reading stored before chapters
  // existed keeps its gaps and its pathway rather than being deleted for missing a field it could
  // not have had. Anything actually returned is held to every rule.
  const parsedChapters: ReportChapter[] = [];
  if (chapters !== undefined) {
    if (!Array.isArray(chapters) || chapters.length > MAX_CHAPTERS) {
      return refuse(`chapters must not exceed ${MAX_CHAPTERS}`);
    }
    for (const entry of chapters) {
      if (entry === null || typeof entry !== 'object') return refuse('a chapter is not an object');
      const { section, paragraphs } = entry as Record<string, unknown>;
      if (typeof section !== 'string' || !CHAPTER_ORDER.includes(section as ChapterSection)) {
        return refuse(`unknown chapter: ${String(section)}`);
      }
      // A chapter with no paragraphs is a heading with nothing under it, so that one *is* fatal:
      // it would render as a promise the report does not keep.
      if (
        !Array.isArray(paragraphs) ||
        paragraphs.length < MIN_PARAGRAPHS ||
        paragraphs.length > MAX_PARAGRAPHS
      ) {
        return refuse(
          `chapter ${section} must have ${MIN_PARAGRAPHS} to ${MAX_PARAGRAPHS} paragraphs`
        );
      }
      const cleaned: string[] = [];
      for (const paragraph of paragraphs) {
        const value = clean(paragraph, MAX_PARAGRAPH);
        if (value === null) {
          return refuse(`chapter ${section} paragraph refused: ${describe(paragraph)}`);
        }
        cleaned.push(value);
      }
      parsedChapters.push({ section: section as ChapterSection, paragraphs: cleaned });
    }

    if (new Set(parsedChapters.map((c) => c.section)).size !== parsedChapters.length) {
      return refuse('a chapter repeats a section already written');
    }

    // The product's order, not the model's. Applied after parsing so a model that returns them in
    // any sequence still produces the arc this report is meant to have.
    parsedChapters.sort(
      (a, b) => CHAPTER_ORDER.indexOf(a.section) - CHAPTER_ORDER.indexOf(b.section)
    );
  }

  let parsedClosing: string | null = null;
  if (closing !== undefined && closing !== null) {
    parsedClosing = clean(closing, MAX_CLOSING);
    if (parsedClosing === null) return refuse(`closing refused: ${describe(closing)}`);
  }

  return {
    chapters: parsedChapters,
    gaps: parsedGaps,
    pathway: parsedPathway,
    closing: parsedClosing,
  };
}

/**
 * Run the report agent over a brief. `null` on anything that is not a clean reading, including a
 * brief with too little in it to be worth the call.
 *
 * Never throws. Every caller is on a path where the leader is finishing or reading their audit, and
 * neither is a place to surface a model failure.
 */
export async function runReport(brief: ReportBrief): Promise<ReportReading | null> {
  if (!brief.usable) return null;

  try {
    const agent = await prisma.aiAgent.findUnique({
      where: { slug: reclaimReportAgent.slug },
      select: { id: true, provider: true, model: true, fallbackProviders: true },
    });
    if (agent === null) {
      logger.warn('Reclaim report agent row missing; skipping the reading');
      return null;
    }

    const [{ providerSlug, model }, content] = await Promise.all([
      resolveAgentProviderAndModel(agent, 'chat'),
      readReclaimReportContent(),
    ]);
    const provider = await getProvider(providerSlug);

    // The content joins the system message at the call rather than living in the authored fields,
    // which is I11 working in both directions. Her words stay in one place and reach the report the
    // same way they reach the screen; and the voice guard keeps checking the prose *we* wrote, which
    // it could not do if her content (nineteen em dashes and counting) were pasted in beside it.
    const messages: LlmMessage[] = [
      { role: 'system', content: `${reportSystemPrompt()}\n\n${contentToPrompt(content)}` },
      { role: 'user', content: briefToPrompt(brief) },
    ];

    const { value, costUsd, tokenUsage } = await runStructuredCompletion<unknown>({
      provider,
      model,
      messages,
      responseSchema,
      responseSchemaName: 'reclaim_report_reading',
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
        'Respond ONLY with {"chapters":[{"section","paragraphs":["…"]}],"gaps":[{"token","observation"}],"pathway":[{"horizon","step","difference"}],"closing":"…"}. No text outside the JSON.',
      temperature: TEMPERATURE,
      maxTokens: MAX_TOKENS,
      timeoutMs: TIMEOUT_MS,
      phase: 'reclaim-report',
    });

    // `runStructuredCompletion` writes no `AiCostLog`, so this line is the only record that the
    // report cost anything.
    logger.info('Reclaim report reading generated', {
      agentSlug: reclaimReportAgent.slug,
      costUsd,
      inputTokens: tokenUsage.input,
      outputTokens: tokenUsage.output,
    });

    return parseReportReading(value, briefTokens(brief));
  } catch (error: unknown) {
    logger.warn('Reclaim report reading failed; the report stands without it', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
