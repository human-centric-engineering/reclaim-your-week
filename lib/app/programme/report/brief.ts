/**
 * What the report agent is given: the audit.
 *
 * ## Derived, not listed
 *
 * The analyst's brief was a hand-written allowlist of slugs. That was load-bearing while its output
 * was served from an unauthenticated URL, because the list was the thing keeping sensitive prose off
 * a public page. With the link gone (`share.ts`), the list stopped being a guard and became a
 * maintenance burden with a failure mode nobody would notice: a slot added to `slots.ts` is a
 * question the audit asks and the report cannot see, and nothing anywhere says so.
 *
 * So this reads **every slot the run recorded**, off `reclaimSlotDefinitions`, in declaration order.
 * A new question added to the audit tomorrow reaches the report with no edit here. What is excluded
 * is excluded by rule rather than by omission, and each rule is a sentence someone can argue with:
 *
 *  - **The sharing group** (`reclaim_share_*`) — consent about the artifact is not material for the
 *    artifact. A report that discussed whether you agreed to share it would be absurd.
 *  - **The leader's name** — the report says "you" throughout. A model given a name will eventually
 *    open a paragraph with it, and that reads as a form letter.
 *  - **The per-area hour lanes** (`reclaim_current_hours__*`, `reclaim_composite_hours__*`,
 *    `reclaim_ideal_hours__*`) — they are in `areas` below, as arithmetic, with their titles. Listed
 *    twice they would be listed once as a number and once as a slug, and the model would quote the
 *    slug.
 *  - **The computed lanes** the audit derives rather than asks (`reclaim_composite_variance_note`,
 *    `reclaim_calendar_ambiguous_items`, the action options JSON) — each is already presented in a
 *    form the model can use, and the raw value is machine material.
 *
 * ## The prose is presented as questions and answers
 *
 * Each recorded prose slot becomes `{about, said}`, where `about` is the slot's own `description`
 * turned into the question it stands for. A model handed `reclaim_gap_challenge_response: "..."` has
 * to infer what was asked and infers wrong; handed "What they said when the audit challenged them",
 * it does not have to infer at all.
 *
 * ## The arithmetic is done here, not there
 *
 * `signals` is what is already true in the leader's own figures: the share each area holds, where it
 * sits against its benchmark, what is at or near nothing, and which areas move most between the week
 * they have and the week they described. None of it is new information. All of it was reachable by
 * dividing one number in this brief by another, and that is precisely the argument for computing it:
 * a model asked which two areas move most will answer with the two it happened to write about first,
 * fluently and wrongly, and the report is the one artifact where a wrong figure outlives the session.
 *
 * It is the same doctrine as I13's refer-back and the coach's gap lines. The observation is the
 * model's job. The subtraction is not.
 */

import { reclaimSlotDefinitions } from '@/lib/app/programme/slots';
import { RECLAIM_BUCKETS, bucketToken } from '@/lib/app/programme/content';
import {
  buildChartData,
  type Answers,
  type BenchmarkStatus,
  type SlotAnswer,
} from '@/lib/app/programme/chart/series';
import { nearZeroAreas } from '@/lib/app/programme/chart/absence';
import { readCalendarReading } from '@/lib/app/programme/calendar/reading';

/** Groups the report never reads. See the header for why each one. */
const EXCLUDED_GROUPS = new Set(['reclaim_share']);

/** Individual slugs the report never reads, for reasons the header gives one by one. */
const EXCLUDED_SLUGS = new Set([
  'reclaim_profile_first_name',
  'reclaim_composite_variance_note',
  'reclaim_calendar_ambiguous_items',
  'reclaim_action_options',
]);

/** Prefixes carrying per-area arithmetic, which reaches the brief through `areas` instead. */
const EXCLUDED_PREFIXES = [
  'reclaim_current_hours__',
  'reclaim_composite_hours__',
  'reclaim_ideal_hours__',
];

/**
 * The slugs this brief may read, derived once at module load.
 *
 * Exported so the invariant suite can assert what it covers and what it leaves out, and so the
 * exclusions above are checkable rather than merely described.
 */
export const REPORT_BRIEF_SLUGS: readonly string[] = reclaimSlotDefinitions
  .filter((slot) => !EXCLUDED_GROUPS.has(slot.group))
  .filter((slot) => !EXCLUDED_SLUGS.has(slot.slug))
  .filter((slot) => !EXCLUDED_PREFIXES.some((prefix) => slot.slug.startsWith(prefix)))
  .map((slot) => slot.slug);

/** One area, with everything the report may know about it. */
export interface BriefArea {
  /** The canonical token, and the only identifier a gap may be anchored to. */
  token: string;
  title: string;
  now: number;
  /**
   * The share of the week this area holds, as a derived figure (I8 — never an input, and never the
   * subject of a sentence in the output).
   *
   * Here because every benchmark in the canonical content is expressed as a percentage and the hours
   * are not, so without this the model has to divide one figure by another to know whether twenty two
   * hours is above a ceiling of ten to fifteen per cent. Models do that arithmetic badly and
   * confidently, which is the worst of the two ways to get it wrong.
   */
  percent: number;
  /** Where this sits against the area's own benchmark. Computed, never the model's reading. */
  benchmark: BenchmarkStatus;
  ideal: number | null;
  /** Where the calendar disagreed with the estimate, when one was reconciled. */
  calendarDelta: number | null;
}

/**
 * What is already true in the leader's own figures, worked out before anybody writes a sentence.
 *
 * **The same doctrine as I13's refer-back and the coach's gap lines: arithmetic happens in code, and
 * the model is given the result.** A report agent asked to notice that the two areas moving most are
 * delivery and recovery will notice the two it wrote about first. Every field here is a thing the
 * document would otherwise assert from a guess.
 *
 * None of it is a judgement. `overBenchmark` is not "too much" and `nearZero` is not "neglected";
 * they are where a figure sits against a guide, and I17 governs what may be said about that.
 */
export interface BriefSignals {
  /** The week's total, and the one figure the hour bands are read against. */
  totalHours: number;
  /** Titles above their benchmark, and titles below it. Names, so the prose can use them. */
  overBenchmark: string[];
  underBenchmark: string[];
  /** At or near nothing this period, the Brief's two areas named first (`chart/absence.ts`). */
  nearZero: string[];
  /**
   * The areas that move most between the week they have and the week they described, largest first.
   *
   * The single most useful derived figure in the brief and the one most likely to be got wrong by
   * eye: a leader who wants six hours more of deep work and eight hours less of delivery has told
   * you what the audit is actually about, and it is not always the area they talked about most.
   */
  movement: Array<{ title: string; delta: number }>;
  /**
   * How the week they want compares in size to the week they have, where they gave a total.
   *
   * A leader whose designed week is the same size as their current one has redistributed; one whose
   * designed week is eight hours smaller has said something about the hours themselves, and those
   * are different audits. Negative means the week they described is smaller.
   */
  totalDelta: number | null;
}

/** One thing the leader said, with the question it answered. Their words, never paraphrased here. */
export interface BriefSaid {
  /** What the audit asked, in plain words. */
  about: string;
  /** The leader's answer, verbatim. */
  said: string;
}

export interface ReportBrief {
  role: string | null;
  orgType: string | null;
  period: string | null;
  weeklyHours: number | null;
  areas: BriefArea[];
  /** What is already true in the figures, worked out here rather than left to the model. */
  signals: BriefSignals;
  idealTotal: number | null;
  /** The three entry points the coach offered in phase 5, if it recorded them. */
  optionsOffered: Array<{ title: string; impact: string }>;
  /**
   * Everything the leader said, in the order the audit asked it.
   *
   * The whole reason the report can be about a person rather than a spreadsheet.
   */
  said: BriefSaid[];
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
 * **They are frequently absent, and the report must cope.** `capture-sweep.ts` skips `json` slots, so
 * `reclaim_action_options` is written by the coach's own `record_answers` call or not at all.
 * Anything malformed is dropped rather than coerced: this is model-authored JSON out of the database,
 * on its way into another model's prompt.
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
 * The slot's `description` as the question it stands for.
 *
 * Descriptions are written as third-person notes to the capture agent ("What made them want to do
 * this now."), which is already the right voice for a brief about somebody. The trailing full stop
 * goes, because these are rendered as `- About: "answer"` and a stop before a colon reads as a typo.
 */
function questionFor(description: string): string {
  return description.replace(/\s+/g, ' ').trim().replace(/\.$/, '');
}

/**
 * Assemble the brief from a run's answers.
 *
 * `usable` is the gate on spending money: an audit with nothing in it has nothing to write a report
 * from, and a model asked to write one anyway will write one. That is the failure this whole module
 * is arranged against, so the cheapest guard is not asking.
 *
 * Any one of three things is enough: a figure they said they wanted, an action they chose, or a
 * sentence they wrote. The union rather than an intersection, because each of them alone supports a
 * real if shorter document, and a leader who gave the audit ten minutes has still earned one.
 */
export function buildReportBrief(
  answers: Answers,
  bucketLabels: Record<string, string> = {}
): ReportBrief {
  const chart = buildChartData(answers, bucketLabels);
  const calendar = readCalendarReading(answers, bucketLabels);
  const deltas = new Map(
    [...calendar.higher, ...calendar.lower].map((entry) => [entry.token, entry.delta])
  );

  const areas: BriefArea[] = chart.buckets.map((bucket) => ({
    token: bucket.token,
    title: bucket.title,
    now: bucket.hours,
    percent: bucket.percent,
    benchmark: bucket.status,
    ideal: numberOf(answers[`reclaim_ideal_hours__${bucket.token}`]),
    calendarDelta: deltas.get(bucket.token) ?? null,
  }));

  const idealTotal = numberOf(answers['reclaim_ideal_total_hours']);
  const signals: BriefSignals = {
    totalHours: chart.totalHours,
    overBenchmark: chart.buckets.filter((b) => b.status === 'over').map((b) => b.title),
    underBenchmark: chart.buckets.filter((b) => b.status === 'under').map((b) => b.title),
    nearZero: nearZeroAreas(chart, answers),
    // Rounded to one place, the same way `gapLines` rounds the coach's, so the two surfaces cannot
    // report a different difference for the same area. Only areas with both figures can move.
    movement: areas
      .flatMap((area) => {
        if (area.ideal === null) return [];
        const delta = Math.round((area.ideal - area.now) * 10) / 10;
        return delta === 0 ? [] : [{ title: area.title, delta }];
      })
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)),
    totalDelta: idealTotal === null ? null : Math.round((idealTotal - chart.totalHours) * 10) / 10,
  };

  // Declaration order is audit order: `slots.ts` declares them phase by phase, in the order the
  // conversation asks for them, which is exactly the order the report's arc wants to read them in.
  const said: BriefSaid[] = reclaimSlotDefinitions
    .filter((slot) => REPORT_BRIEF_SLUGS.includes(slot.slug))
    .flatMap((slot) => {
      const value = text(answers[slot.slug]);
      if (value === null) return [];
      return [{ about: questionFor(slot.description), said: value }];
    });

  const chosen = text(answers['reclaim_action_chosen']);
  const anyIdeal = areas.some((area) => area.ideal !== null);

  return {
    role: text(answers['reclaim_profile_role']),
    orgType: text(answers['reclaim_profile_org_type']),
    period: text(answers['reclaim_setup_audit_period']),
    weeklyHours: numberOf(answers['reclaim_setup_weekly_hours']),
    areas,
    signals,
    idealTotal,
    optionsOffered: optionsFrom(answers['reclaim_action_options']),
    said,
    usable: areas.length > 0 && (anyIdeal || chosen !== null || said.length > 0),
  };
}

/** The tokens a gap may be anchored to. Anything else is the report inventing a subject. */
export function briefTokens(brief: ReportBrief): Set<string> {
  return new Set(brief.areas.map((area) => area.token));
}

/** Every bucket token the audit knows about, for the guard that checks the exclusions are complete. */
export const ALL_BUCKET_TOKENS: readonly string[] = RECLAIM_BUCKETS.map((b) => bucketToken(b.slug));

/**
 * The derived block: what is already true in the figures, stated so nothing has to be inferred.
 *
 * Written as facts and never as findings. "Recovery and white space is at or near nothing" is a
 * reading of a number; "recovery has been neglected" is a verdict about a person, and the difference
 * between those two sentences is most of I17. The guardrails govern what the report may say about
 * any of this; this block only makes sure it is saying it about the right areas.
 */
function signalLines(signals: BriefSignals): string[] {
  const lines: string[] = [];

  if (signals.overBenchmark.length > 0 || signals.underBenchmark.length > 0) {
    lines.push('Where this week sits against the guide:');
    if (signals.overBenchmark.length > 0) {
      lines.push(`- Above their benchmark: ${signals.overBenchmark.join(', ')}`);
    }
    if (signals.underBenchmark.length > 0) {
      lines.push(`- Below their benchmark: ${signals.underBenchmark.join(', ')}`);
    }
  }

  if (signals.nearZero.length > 0) {
    lines.push(
      `At or near nothing this period, most worth noticing first: ${signals.nearZero.join(', ')}.`,
      'An area at nothing is usually somewhere the week has quietly taken from rather than somewhere',
      'anyone decided to drop, and it is often the most useful thing in the whole audit.'
    );
  }

  if (signals.movement.length > 0) {
    lines.push(
      '',
      'What moves most between the week they have and the week they described, largest first. This',
      'is the audit in one list, and it is not always the area they talked about most:'
    );
    for (const entry of signals.movement) {
      const direction = entry.delta > 0 ? 'more' : 'less';
      lines.push(`- ${entry.title}: ${Math.abs(entry.delta)}h ${direction}`);
    }
  }

  if (signals.totalDelta !== null) {
    lines.push(
      signals.totalDelta === 0
        ? 'The week they described is the same size as the week they have, so what they changed is the shape of it and not the hours.'
        : signals.totalDelta < 0
          ? `The week they described is ${Math.abs(signals.totalDelta)} hours smaller than the week they have. They have said something about the hours themselves, not only about how the hours are spent.`
          : `The week they described is ${signals.totalDelta} hours larger than the week they have. Worth reading carefully: a designed week that grows is usually a leader adding what matters without yet putting anything down.`
    );
  }

  if (lines.length > 0) lines.push('');
  return lines;
}

/** The brief, as the user message. Every figure here is the leader's own. */
export function briefToPrompt(brief: ReportBrief): string {
  const lines: string[] = ['This leader has just finished their audit.', ''];

  if (brief.role !== null) lines.push(`Role: ${brief.role}`);
  if (brief.orgType !== null) lines.push(`Organisation: ${brief.orgType}`);
  if (brief.period !== null) lines.push(`Period audited: ${brief.period}`);
  if (brief.weeklyHours !== null) lines.push(`Hours in a typical week: ${brief.weeklyHours}`);
  lines.push('');

  lines.push('Their areas. "now" is this period, "wanted" is the week they described wanting:');
  for (const area of brief.areas) {
    const parts = [`- ${area.title} [token: ${area.token}]: now ${area.now}h`];
    // The share and the standing travel with the figure rather than in a table of their own. Every
    // benchmark in the content is a percentage and none of the leader's figures are, so a model
    // without this line has to divide before it can read a single one of them against the guide.
    parts.push(`${area.percent} per cent of the week`);
    if (area.benchmark !== 'none') {
      parts.push(
        area.benchmark === 'over'
          ? 'above its benchmark'
          : area.benchmark === 'under'
            ? 'below its benchmark'
            : 'within its benchmark'
      );
    }
    if (area.ideal !== null) parts.push(`wanted ${area.ideal}h`);
    if (area.calendarDelta !== null) {
      const direction = area.calendarDelta > 0 ? 'more' : 'less';
      parts.push(
        `their calendar showed ${Math.abs(area.calendarDelta)}h ${direction} than they estimated`
      );
    }
    lines.push(parts.join(', '));
  }
  lines.push(`Total: ${brief.signals.totalHours} hours a week.`);
  if (brief.idealTotal !== null) lines.push(`Wanted total: ${brief.idealTotal}h`);
  lines.push('');

  lines.push(...signalLines(brief.signals));

  if (brief.optionsOffered.length > 0) {
    lines.push('The three ways in they were offered:');
    for (const option of brief.optionsOffered) {
      lines.push(`- ${option.title}: ${option.impact}`);
    }
    lines.push('');
  }

  if (brief.said.length > 0) {
    lines.push(
      'What they said, in their own words, in the order the audit asked. This is the audit itself and',
      'it is the thing to write the arc from:',
      ''
    );
    for (const entry of brief.said) {
      lines.push(`- ${entry.about}: "${entry.said}"`);
    }
    lines.push('');
  }

  lines.push(
    'Anchor every gap to one of the tokens above. Do not name an area that is not listed, and do not',
    'use a figure that does not appear here. Leave out any chapter this brief does not support.'
  );

  return lines.join('\n');
}
