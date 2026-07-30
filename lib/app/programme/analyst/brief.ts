/**
 * What the analyst is allowed to see (F14 t-2).
 *
 * A separate module from the call itself, and the separation is the point. `buildSummary`'s header
 * promises the object is **shareable-safe by construction** — it carries only the §10 fields and
 * never the sensitive prose — and `/summary/[token]` serves that object with **no session** to
 * anyone holding the link. `summary.test.ts` asserts the promise.
 *
 * The moment the analyst's prose joins `AuditSummary`, that promise stops being structural and
 * starts depending on a model: prose written from a brief containing sensitive material can echo it,
 * and the echo travels to a public URL. Prompt instructions do not fix that, for the same reason
 * P23 gives about side effects asked of models.
 *
 * **So the brief is an allowlist, and the allowlist is asserted disjoint from every slot definition
 * marked `sensitive`** (`tests/unit/invariants/analyst-reading.test.ts`). The assertion ships in the
 * same task as the field it guards, deliberately: a disjointness guard added one task later is a
 * guard that was absent for exactly as long as it mattered.
 *
 * Three things a reader will expect to find here and will not:
 *
 *  - **The takeaway** (`reclaim_reflection_p6`) is sensitive, so the analyst never sees what the
 *    leader said they were taking away. That is a real cost, and it is the right side of the trade:
 *    the artifact carrying the analyst's prose is the one that can be made public.
 *  - **`reclaim_ideal_protected_commitment`** and **`reclaim_action_stopping`** are sensitive too,
 *    which is why the pathway is built from the ideal figures and the chosen action rather than from
 *    what the leader said they would protect or stop.
 *  - **The calendar's qualitative answers** (`reactive_time`, `offcal_work`, `messaging_load`) are
 *    sensitive. Only the *arithmetic* categories from `readCalendarReading` are used.
 */

import { RECLAIM_BUCKETS, bucketToken } from '@/lib/app/programme/content';
import { buildChartData, type Answers, type SlotAnswer } from '@/lib/app/programme/chart/series';
import { readCalendarReading } from '@/lib/app/programme/calendar/reading';

/**
 * Every slug the brief may read, named explicitly rather than derived.
 *
 * A derived list (say, "everything not sensitive") would silently widen the day someone adds a
 * standard-classified slot holding something personal. An explicit list only widens when a person
 * edits this array, which is a moment a reviewer can see.
 *
 * The per-bucket hour lanes are reached through `buildChartData` and `readCalendarReading` rather
 * than named one by one, and both are listed here as prefixes so the guard can check them.
 */
export const ANALYST_BRIEF_SLUGS: readonly string[] = [
  'reclaim_profile_role',
  'reclaim_profile_org_type',
  'reclaim_setup_priorities',
  'reclaim_setup_weekly_hours',
  'reclaim_setup_audit_period',
  'reclaim_energy_peak_description',
  'reclaim_ideal_total_hours',
  'reclaim_ideal_deep_block_when',
  'reclaim_action_options',
  'reclaim_action_chosen',
  'reclaim_action_when',
  'reclaim_action_how_known',
  ...RECLAIM_BUCKETS.flatMap((b) => {
    const token = bucketToken(b.slug);
    return [
      `reclaim_current_hours__${token}`,
      `reclaim_composite_hours__${token}`,
      `reclaim_ideal_hours__${token}`,
    ];
  }),
  // Read by `readCalendarReading` to decide whether there is a comparison at all, and to categorise
  // it. The qualitative calendar answers it also returns are deliberately not used below.
  'reclaim_calendar_uploaded',
  'reclaim_composite_variance_note',
  'reclaim_setup_fundraising_relevant',
];

/** One area, with everything the analyst may know about it. */
export interface BriefArea {
  /** The canonical token, and the only identifier a gap may be anchored to. */
  token: string;
  title: string;
  now: number;
  ideal: number | null;
  /** Where the calendar disagreed with the estimate, when one was reconciled. */
  calendarDelta: number | null;
}

export interface AnalystBrief {
  role: string | null;
  orgType: string | null;
  period: string | null;
  priorities: string | null;
  weeklyHours: number | null;
  peakEnergy: string | null;
  areas: BriefArea[];
  idealTotal: number | null;
  deepBlockWhen: string | null;
  /** The three entry points the coach offered in phase 5, if it recorded them. */
  optionsOffered: Array<{ title: string; impact: string }>;
  chosen: string | null;
  chosenWhen: string | null;
  howKnown: string | null;
  /** Whether there is enough here to be worth a model call at all. */
  usable: boolean;
}

const text = (a: SlotAnswer): string | null => {
  const value = a?.value?.trim();
  return value === undefined || value.length === 0 ? null : value;
};

const numberOf = (a: SlotAnswer): number | null => {
  if (a === undefined) return null;
  const raw = typeof a.valueJson === 'number' ? a.valueJson : Number(a.value);
  return Number.isFinite(raw) ? raw : null;
};

/**
 * The three entry points, if the coach recorded them.
 *
 * **They are frequently absent, and the analyst must cope.** `capture-sweep.ts` skips `json` slots,
 * so `reclaim_action_options` is written by the coach's own `record_answers` call or not at all.
 * Anything malformed is dropped rather than coerced: this is model-authored JSON out of the
 * database, on its way into another model's prompt.
 */
function optionsFrom(answer: SlotAnswer): Array<{ title: string; impact: string }> {
  const raw = answer?.valueJson;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (entry === null || typeof entry !== 'object') return [];
    const { title, impact } = entry as Record<string, unknown>;
    if (typeof title !== 'string' || typeof impact !== 'string') return [];
    return [{ title: title.trim(), impact: impact.trim() }];
  });
}

/**
 * Assemble the brief from a run's answers.
 *
 * `usable` is the gate on spending money: an audit with no ideal figures and no chosen action has
 * nothing for the analyst to read, and a model asked to produce gaps from an empty brief will
 * produce gaps anyway. That is the failure mode this whole feature is arranged against, so the
 * cheapest guard against it is not asking.
 */
export function buildAnalystBrief(
  answers: Answers,
  bucketLabels: Record<string, string> = {}
): AnalystBrief {
  const chart = buildChartData(answers, bucketLabels);
  const calendar = readCalendarReading(answers, bucketLabels);
  const deltas = new Map(
    [...calendar.higher, ...calendar.lower].map((entry) => [entry.token, entry.delta])
  );

  const areas: BriefArea[] = chart.buckets.map((bucket) => ({
    token: bucket.token,
    title: bucket.title,
    now: bucket.hours,
    ideal: numberOf(answers[`reclaim_ideal_hours__${bucket.token}`]),
    calendarDelta: deltas.get(bucket.token) ?? null,
  }));

  const chosen = text(answers['reclaim_action_chosen']);
  const anyIdeal = areas.some((area) => area.ideal !== null);

  return {
    role: text(answers['reclaim_profile_role']),
    orgType: text(answers['reclaim_profile_org_type']),
    period: text(answers['reclaim_setup_audit_period']),
    priorities: text(answers['reclaim_setup_priorities']),
    weeklyHours: numberOf(answers['reclaim_setup_weekly_hours']),
    peakEnergy: text(answers['reclaim_energy_peak_description']),
    areas,
    idealTotal: numberOf(answers['reclaim_ideal_total_hours']),
    deepBlockWhen: text(answers['reclaim_ideal_deep_block_when']),
    optionsOffered: optionsFrom(answers['reclaim_action_options']),
    chosen,
    chosenWhen: text(answers['reclaim_action_when']),
    howKnown: text(answers['reclaim_action_how_known']),
    usable: areas.length > 0 && (anyIdeal || chosen !== null),
  };
}

/** The tokens a gap may be anchored to. Anything else is the analyst inventing a subject. */
export function briefTokens(brief: AnalystBrief): Set<string> {
  return new Set(brief.areas.map((area) => area.token));
}

/** The brief, as the user message. Figures only; every number here is the leader's own. */
export function briefToPrompt(brief: AnalystBrief): string {
  const lines: string[] = ['This leader has just finished their audit. Their own figures:', ''];

  if (brief.role !== null) lines.push(`Role: ${brief.role}`);
  if (brief.orgType !== null) lines.push(`Organisation: ${brief.orgType}`);
  if (brief.period !== null) lines.push(`Period audited: ${brief.period}`);
  if (brief.weeklyHours !== null) lines.push(`Hours in a typical week: ${brief.weeklyHours}`);
  if (brief.priorities !== null) lines.push(`Priorities this year: ${brief.priorities}`);
  if (brief.peakEnergy !== null)
    lines.push(`When their energy is at its best: ${brief.peakEnergy}`);
  lines.push('');

  lines.push('Areas. "now" is this period, "wanted" is the week they described wanting:');
  for (const area of brief.areas) {
    const parts = [`- ${area.title} [token: ${area.token}]: now ${area.now}h`];
    if (area.ideal !== null) parts.push(`wanted ${area.ideal}h`);
    if (area.calendarDelta !== null) {
      const direction = area.calendarDelta > 0 ? 'more' : 'less';
      parts.push(
        `their calendar showed ${Math.abs(area.calendarDelta)}h ${direction} than they estimated`
      );
    }
    lines.push(parts.join(', '));
  }
  if (brief.idealTotal !== null) lines.push(`Wanted total: ${brief.idealTotal}h`);
  if (brief.deepBlockWhen !== null) {
    lines.push(`Where they said a protected block could sit: ${brief.deepBlockWhen}`);
  }
  lines.push('');

  if (brief.optionsOffered.length > 0) {
    lines.push('The three ways in they were offered:');
    for (const option of brief.optionsOffered) {
      lines.push(`- ${option.title}: ${option.impact}`);
    }
  }
  if (brief.chosen !== null) lines.push(`What they chose to start: ${brief.chosen}`);
  if (brief.chosenWhen !== null) lines.push(`When: ${brief.chosenWhen}`);
  if (brief.howKnown !== null) lines.push(`How they will know it worked: ${brief.howKnown}`);
  lines.push('');

  lines.push(
    'Anchor every gap to one of the tokens above. Do not name an area that is not listed, and do not',
    'use a figure that does not appear here.'
  );

  return lines.join('\n');
}
