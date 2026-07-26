/**
 * Calendar categorisation (F5 t-2) — the privacy-critical core of the optional branch (I4).
 *
 * Takes the in-memory parsed events and turns them into **per-bucket hour totals + structural metrics
 * + a list of ambiguous items to confirm** — the only things that get persisted. Raw event titles and
 * descriptions are sent to the provider for classification in **one `runStructuredCompletion` call**
 * (never `streamChat`, which would persist an `AiMessage`) and are never returned, logged, or written
 * to a slot. The task-switching metrics are computed **deterministically in code** — no LLM, no
 * rounding drift — so the model's only job is classifying each event to a bucket.
 */

import { prisma } from '@/lib/db/client';
import { logger } from '@/lib/logging';
import type { LlmMessage } from '@/lib/orchestration/llm/types';
import { getProvider } from '@/lib/orchestration/llm/provider-manager';
import { resolveAgentProviderAndModel } from '@/lib/orchestration/llm/agent-resolver';
import { runStructuredCompletion } from '@/lib/orchestration/llm/structured-completion';
import { tryParseJson } from '@/lib/orchestration/evaluations/parse-structured';
import { RECLAIM_BUCKETS, bucketToken } from '@/lib/app/programme/content';
import { reclaimCoachAgent, RECLAIM_BANNED_LEXICON } from '@/lib/app/programme/agent';
import type { CalendarEvent } from '@/lib/app/programme/calendar/parse';

/** Re-exported from `content` (client-safe home) so existing calendar imports keep working. */
export { bucketToken };
const BUCKET_SLUGS = RECLAIM_BUCKETS.map((b) => b.slug);
const CLASSIFY_VALUES = [...BUCKET_SLUGS, 'personal'] as const;

/** A generic-titled event surfaced for the leader to confirm (best guess + reasoning). Persisted as JSON. */
export interface AmbiguousItem {
  /** The best-guess bucket slug (kebab). */
  bucketSlug: string;
  /** Why the tool guessed this bucket. */
  reasoning: string;
  /** The event's hours, so a re-assignment can move them without re-categorising. */
  hours: number;
}

/** Structural task-switching profile, computed from the timed events (no LLM). */
export interface TaskSwitchMetrics {
  eventsPerDay: number;
  backToBack: number;
  longestBlockMinutes: number;
}

/** The categorised, persist-ready result. No raw titles anywhere. */
export interface CategorisedCalendar {
  /** Bucket **token** → hours per week. Buckets with no time are omitted. */
  perBucketHours: Record<string, number>;
  totalHours: number;
  metrics: TaskSwitchMetrics;
  ambiguous: AmbiguousItem[];
  excludedPersonalCount: number;
}

/** Raised when the categorising provider can't be resolved — the route maps this to a clean 503. */
export class CalendarProviderUnavailableError extends Error {
  constructor() {
    super('The calendar categorisation model is not available');
    this.name = 'CalendarProviderUnavailableError';
  }
}

const CATEGORISE_MAX_TOKENS = 4_096;
const CATEGORISE_TIMEOUT_MS = 60_000;
const GAP_TOLERANCE_MINUTES = 5;

/**
 * The categoriser's prompt.
 *
 * **This is the product's second LLM voice, and the leader reads its output.** The `reasoning` field
 * is rendered to them beside each ambiguous event in `calendar-review.tsx`, so it is coach-voiced
 * copy generated at runtime. It had no voice constraints at all until open item 8 was decided: no
 * banned lexicon, no register, nothing. A single "let's optimise your calendar" would have landed
 * inside an audit whose whole frame (I-frame) is that this is not a productivity exercise.
 *
 * The prohibition list is imported rather than re-typed, on the same discipline as the agent's own
 * voice guard: one list, so the ban and the guard cannot drift apart.
 */
const SYSTEM_PROMPT =
  "You categorise a leader's calendar events into fixed work buckets for a time audit. For each " +
  'event you are given, choose the single best bucket from the provided list, or "personal" for ' +
  'clearly personal events (dentist, school pickup, gym, holiday). Use the title, duration, and ' +
  "the leader's role context. Mark an event ambiguous only when its title is generic (e.g. " +
  '"Meeting", "Call", "Catch up") and give a one-sentence reason for your best guess. Respond ONLY ' +
  'with the requested JSON. Never include event titles in any reasoning field verbatim if they ' +
  'contain personal information; describe the basis for the guess instead. ' +
  'The leader reads the reasoning, so write it for them: one short plain sentence, describing what ' +
  'the event looks like rather than judging how their time is spent. Never use this language, or ' +
  `any corporate-consultant framing: ${RECLAIM_BANNED_LEXICON.join(', ')}. Do not use em dashes; ` +
  "use a comma or a full stop. Never write in the first person as the tool's designer, and never " +
  'name the model or the company that runs you.';

/**
 * Clean a model-authored `reasoning` line before a leader ever sees it.
 *
 * The prompt above is a request; this is the guard. A model that ignores an instruction is ordinary,
 * and the cost of it here is copy in the wrong register inside the one screen that is supposed to
 * feel like a mirror rather than an assessment.
 *
 * Em dashes are rewritten because the fix is unambiguous (I2 says use a comma). A banned term is not
 * rewritten but **dropped entirely**: the sentence is a rationale, not load-bearing, and showing the
 * hours with no explanation is honest where showing a patched sentence is not.
 */
export function sanitiseReasoning(reasoning: string): string {
  const noEmDash = reasoning.replace(/\s*\u2014\s*/g, ', ');
  const lower = noEmDash.toLowerCase();
  if (RECLAIM_BANNED_LEXICON.some((term) => lower.includes(term.toLowerCase()))) return '';
  return noEmDash;
}

interface Classification {
  index: number;
  bucketSlug: (typeof CLASSIFY_VALUES)[number];
  ambiguous: boolean;
  reasoning: string;
}

const responseSchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    classifications: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer' },
          bucketSlug: { type: 'string', enum: [...CLASSIFY_VALUES] },
          ambiguous: { type: 'boolean' },
          reasoning: { type: 'string' },
        },
        required: ['index', 'bucketSlug', 'ambiguous', 'reasoning'],
        additionalProperties: false,
      },
    },
  },
  required: ['classifications'],
  additionalProperties: false,
};

/** Context from Phase 0 that sharpens classification (role, org, priorities). All optional. */
export interface CalendarContext {
  role?: string;
  orgType?: string;
  priorities?: string;
  fundraisingRelevant?: boolean;
}

/** Round to one decimal place — hours are approximate; false precision reads as a machine, not a mirror. */
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Compute the task-switching profile from timed events. Pure. */
export function computeMetrics(events: CalendarEvent[]): TaskSwitchMetrics {
  const timed = events
    .filter((e) => !e.isAllDay)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  if (timed.length === 0) return { eventsPerDay: 0, backToBack: 0, longestBlockMinutes: 0 };

  const days = new Set(timed.map((e) => e.start.toISOString().slice(0, 10)));
  const eventsPerDay = round1(timed.length / days.size);

  let backToBack = 0;
  let longestBlockMinutes = 0;
  let blockStart = timed[0].start.getTime();
  let blockEnd = timed[0].end.getTime();
  for (let i = 1; i < timed.length; i++) {
    const gapMinutes = (timed[i].start.getTime() - blockEnd) / 60_000;
    if (gapMinutes <= GAP_TOLERANCE_MINUTES) {
      backToBack++;
      blockEnd = Math.max(blockEnd, timed[i].end.getTime());
    } else {
      longestBlockMinutes = Math.max(longestBlockMinutes, (blockEnd - blockStart) / 60_000);
      blockStart = timed[i].start.getTime();
      blockEnd = timed[i].end.getTime();
    }
  }
  longestBlockMinutes = Math.max(longestBlockMinutes, (blockEnd - blockStart) / 60_000);
  return { eventsPerDay, backToBack, longestBlockMinutes: Math.round(longestBlockMinutes) };
}

/** Resolve the coach agent's provider/model — the same provider the leader is already talking to (I4). */
async function resolveCategoriser() {
  const agent = await prisma.aiAgent.findUnique({
    where: { slug: reclaimCoachAgent.slug },
    select: { id: true, provider: true, model: true, fallbackProviders: true },
  });
  if (agent === null) throw new CalendarProviderUnavailableError();
  const { providerSlug, model } = await resolveAgentProviderAndModel(agent, 'chat');
  const provider = await getProvider(providerSlug);
  return { provider, model };
}

/**
 * Categorise parsed events into per-bucket hours, metrics, and ambiguous items. **All-day events are
 * excluded from the hour totals** (a full-day marker shouldn't add 24h to a bucket) but are still
 * classified so personal ones are counted out. The number of calendar weeks is inferred from the span
 * so totals are per-week, matching the self-reported estimate.
 */
export async function categoriseCalendar(
  events: CalendarEvent[],
  context: CalendarContext = {}
): Promise<CategorisedCalendar> {
  const metrics = computeMetrics(events);
  const timed = events.filter((e) => !e.isAllDay);
  if (timed.length === 0) {
    return { perBucketHours: {}, totalHours: 0, metrics, ambiguous: [], excludedPersonalCount: 0 };
  }

  const { provider, model } = await resolveCategoriser();

  // The prompt payload — raw titles live here, in memory, and never leave this function.
  const promptEvents = timed.map((e, index) => ({
    index,
    summary: e.summary,
    description: e.description.slice(0, 200),
    durationMinutes: e.durationMinutes,
    weekday: e.start.toLocaleDateString('en-GB', { weekday: 'short' }),
    startHour: e.start.getUTCHours(),
  }));

  const bucketGuide = RECLAIM_BUCKETS.map((b) => `- ${b.slug}: ${b.title}`).join('\n');
  const contextLine = [
    context.role && `Role: ${context.role}`,
    context.orgType && `Organisation: ${context.orgType}`,
    context.priorities && `Priorities: ${context.priorities}`,
    context.fundraisingRelevant === false && 'Fundraising is not relevant to this leader.',
  ]
    .filter(Boolean)
    .join('\n');

  const messages: LlmMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content:
        `Buckets:\n${bucketGuide}\n\n` +
        (contextLine ? `Leader context:\n${contextLine}\n\n` : '') +
        `Events (classify every one by its index):\n${JSON.stringify(promptEvents)}`,
    },
  ];

  const result = await runStructuredCompletion<Classification[]>({
    provider,
    model,
    messages,
    responseSchema,
    responseSchemaName: 'calendar_classifications',
    parse: (raw) =>
      tryParseJson(raw, (parsed) => {
        if (parsed === null || typeof parsed !== 'object' || !('classifications' in parsed))
          return null;
        const list = parsed.classifications;
        if (!Array.isArray(list)) return null;
        const out: Classification[] = [];
        for (const item of list) {
          if (item === null || typeof item !== 'object') continue;
          const rec = item as Record<string, unknown>;
          const index = rec.index;
          const bucketSlug = rec.bucketSlug;
          if (typeof index !== 'number' || typeof bucketSlug !== 'string') continue;
          if (!CLASSIFY_VALUES.includes(bucketSlug)) continue;
          out.push({
            index,
            bucketSlug: bucketSlug,
            ambiguous: rec.ambiguous === true,
            reasoning: typeof rec.reasoning === 'string' ? sanitiseReasoning(rec.reasoning) : '',
          });
        }
        return out.length > 0 ? out : null;
      }),
    retryUserMessage:
      'Respond ONLY with {"classifications":[{"index","bucketSlug","ambiguous","reasoning"}]} for every event. No prose.',
    maxTokens: CATEGORISE_MAX_TOKENS,
    timeoutMs: CATEGORISE_TIMEOUT_MS,
  });

  const byIndex = new Map(result.value.map((c) => [c.index, c]));

  // Weeks in the analysed span, so hours are per-week (min 1 to avoid inflating a short upload).
  const times = timed.map((e) => e.start.getTime());
  const spanDays = (Math.max(...times) - Math.min(...times)) / 86_400_000;
  const weeks = Math.max(1, spanDays / 7);

  const bucketMinutes = new Map<string, number>();
  const ambiguous: AmbiguousItem[] = [];
  let excludedPersonalCount = 0;

  timed.forEach((event, index) => {
    const c = byIndex.get(index);
    // Unclassified or explicitly personal → excluded from the working picture.
    if (c === undefined || c.bucketSlug === 'personal') {
      if (c?.bucketSlug === 'personal') excludedPersonalCount++;
      return;
    }
    const token = bucketToken(c.bucketSlug);
    bucketMinutes.set(token, (bucketMinutes.get(token) ?? 0) + event.durationMinutes);
    if (c.ambiguous) {
      ambiguous.push({
        bucketSlug: c.bucketSlug,
        reasoning: c.reasoning,
        hours: round1(event.durationMinutes / 60 / weeks),
      });
    }
  });

  const perBucketHours: Record<string, number> = {};
  let totalHours = 0;
  for (const [token, minutes] of bucketMinutes) {
    const hours = round1(minutes / 60 / weeks);
    perBucketHours[token] = hours;
    totalHours += hours;
  }

  logger.info('Calendar categorised', {
    eventCount: timed.length,
    bucketCount: Object.keys(perBucketHours).length,
    ambiguousCount: ambiguous.length,
    excludedPersonalCount,
    costUsd: result.costUsd,
  });

  return {
    perBucketHours,
    totalHours: round1(totalHours),
    metrics,
    ambiguous,
    excludedPersonalCount,
  };
}
