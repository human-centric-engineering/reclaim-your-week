/**
 * The calendar, read back as perception versus reality (F13 t-1).
 *
 * Pure over a run's answers — no Prisma, no config, no model. Same shape and same reasoning as
 * `coach/ideal-week.ts`, whose header states the rule this file follows:
 *
 * > a coach asked to notice that from memory ... will either miss it or invent a difference that is
 * > not there. So the arithmetic happens here and the model is given the result.
 *
 * **What was missing.** The optional branch computes a per-bucket comparison between what a leader
 * estimated and what their calendar shows, stores it in `reclaim_composite_variance_note.valueJson`,
 * and then tells the coach a count. `buildChartData` picks the composite **or** the estimate and
 * never both (`chart/series.ts:82`), so there is no arithmetic anywhere in the model's context that
 * could produce "higher than you thought" — which is the summary
 * `sources/Time_Audit_Tool_Prompt_Text.md:233` asks for by name:
 *
 * > a summary of the key perception vs reality gaps (what is higher than expected, what is lower,
 * > what is confirmed)
 *
 * **I17 governs how it is said, and the reading carries that responsibility rather than delegating
 * it.** A difference between an estimate and a calendar is information about what a calendar
 * captures. It is never evidence that the leader was wrong about their own week, and the difference
 * between those two readings is the difference between a mirror and a verdict. `calendarReadingLines`
 * therefore ships the framing sentence beside the figures, in this file, so the arithmetic and the
 * words that present it cannot drift apart — exactly as `challengeEvidence` sits beside
 * `readIdealWeek`.
 */

import { RECLAIM_BUCKETS, bucketToken } from '@/lib/app/programme/content';
import { isSignificantVariance, type VarianceEntry } from '@/lib/app/programme/calendar/composite';
import { truthy, type Answers, type SlotAnswer } from '@/lib/app/programme/chart/series';

/** One area, as the leader estimated it and as the reconciled composite came out. */
export interface PerceptionEntry {
  /** Canonical bucket token (I7). */
  token: string;
  /** The leader's own label for the area where they have renamed it, else the shipped title. */
  title: string;
  estimate: number;
  composite: number;
  /** composite − estimate. Positive means the week holds more of this than they thought. */
  delta: number;
}

/** The rhythm of the week, as distinct from where the hours went. */
export interface CalendarShape {
  eventsPerDay: number | null;
  backToBack: number | null;
  longestBlockMinutes: number | null;
}

/** What the leader said a calendar cannot see. Their words, not the tool's arithmetic. */
export interface OffCalendarNotes {
  switchFrequency: string | null;
  reactiveTime: string | null;
  offCalWork: string | null;
  messagingLoad: string | null;
}

export interface CalendarReading {
  /** False for every run that did not take the branch, which is most of them. */
  uploaded: boolean;
  /** How completely their calendar reflects their working life — reframes every figure below. */
  completeness: string | null;
  period: string | null;
  calendarHours: number | null;
  /** The source's three categories, in the source's order. */
  higher: PerceptionEntry[];
  lower: PerceptionEntry[];
  confirmed: PerceptionEntry[];
  shape: CalendarShape;
  offCalendar: OffCalendarNotes;
  /** Whether there is a comparison worth putting in front of anyone. */
  hasReading: boolean;
}

const EMPTY: CalendarReading = {
  uploaded: false,
  completeness: null,
  period: null,
  calendarHours: null,
  higher: [],
  lower: [],
  confirmed: [],
  shape: { eventsPerDay: null, backToBack: null, longestBlockMinutes: null },
  offCalendar: {
    switchFrequency: null,
    reactiveTime: null,
    offCalWork: null,
    messagingLoad: null,
  },
  hasReading: false,
};

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** A stored number, or `null` for "never answered" — which is not the same fact as zero. */
function numberOf(answer: SlotAnswer): number | null {
  if (answer === undefined) return null;
  const raw =
    typeof answer.valueJson === 'number' && Number.isFinite(answer.valueJson)
      ? answer.valueJson
      : Number(answer.value);
  return Number.isFinite(raw) ? raw : null;
}

/** A stored string, trimmed, or `null` for absent or blank. */
function textOf(answer: SlotAnswer): string | null {
  const value = answer?.value?.trim();
  return value === undefined || value.length === 0 ? null : value;
}

/**
 * The variance list as it was persisted.
 *
 * Read from `valueJson` rather than recomputed, so the block cannot disagree with the note the run
 * actually carries. Anything malformed is dropped rather than guessed at: this is JSON from the
 * database and a half-parsed entry would put an invented figure in front of a leader.
 */
function storedVariance(answer: SlotAnswer): VarianceEntry[] {
  const raw = answer?.valueJson;
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry): entry is VarianceEntry => {
    if (entry === null || typeof entry !== 'object') return false;
    const { token, estimate, composite, delta } = entry as Record<string, unknown>;
    return (
      typeof token === 'string' &&
      typeof estimate === 'number' &&
      typeof composite === 'number' &&
      typeof delta === 'number'
    );
  });
}

/**
 * Read the calendar branch's result as three categories.
 *
 * `higher` and `lower` come from the stored variance list. **`confirmed` is recomputed**, because
 * `persistComposite` records only significant divergences — the third category the source names has
 * never existed in the data. It is the complement of the same rule, taken from the same two numbers
 * via `isSignificantVariance`, which is why that predicate is exported rather than restated here.
 *
 * A conditional area the leader was never asked about is in no category. `bucketHours` already
 * makes that distinction for the chart and the reasoning is identical: `persistComposite` writes all
 * nine composite slots including a real `0`, so a leader with no fundraising in their role would
 * otherwise be told their fundraising time is confirmed at nothing.
 */
export function readCalendarReading(
  answers: Answers,
  bucketLabels: Record<string, string> = {}
): CalendarReading {
  if (!truthy(answers['reclaim_calendar_uploaded'])) return EMPTY;

  const fundraisingRelevant = truthy(answers['reclaim_setup_fundraising_relevant']);
  const variance = storedVariance(answers['reclaim_composite_variance_note']);
  const diverged = new Map(variance.map((entry) => [entry.token, entry]));

  const higher: PerceptionEntry[] = [];
  const lower: PerceptionEntry[] = [];
  const confirmed: PerceptionEntry[] = [];

  for (const bucket of RECLAIM_BUCKETS) {
    if (bucket.conditional && !fundraisingRelevant) continue;

    const token = bucketToken(bucket.slug);
    const title = bucketLabels[token] ?? bucket.title;
    const stored = diverged.get(token);

    if (stored !== undefined) {
      // `stored` last would overwrite `title`; it carries the token and the three figures, and the
      // label is the only thing this adds.
      const entry: PerceptionEntry = { ...stored, title };
      // A delta of exactly zero cannot be significant, so this is a real direction either way.
      (entry.delta > 0 ? higher : lower).push(entry);
      continue;
    }

    // Not in the variance list. Either it never diverged, or one of the two figures is missing —
    // and only the first is "confirmed". An area with no estimate to compare against is not a
    // match; it is a question that was never asked.
    const estimate = numberOf(answers[`reclaim_current_hours__${token}`]);
    const composite = numberOf(answers[`reclaim_composite_hours__${token}`]);
    if (estimate === null || composite === null) continue;

    const delta = round1(composite - estimate);
    if (!isSignificantVariance(estimate, delta)) {
      confirmed.push({ token, title, estimate, composite, delta });
    }
  }

  // Largest movement first, so a coach told to name one or two names the ones that matter.
  higher.sort((a, b) => b.delta - a.delta);
  lower.sort((a, b) => a.delta - b.delta);

  return {
    uploaded: true,
    completeness: textOf(answers['reclaim_calendar_completeness']),
    period: textOf(answers['reclaim_calendar_period']),
    calendarHours: numberOf(answers['reclaim_calendar_total_hours']),
    higher,
    lower,
    confirmed,
    shape: {
      eventsPerDay: numberOf(answers['reclaim_calendar_events_per_day']),
      backToBack: numberOf(answers['reclaim_calendar_back_to_back']),
      longestBlockMinutes: numberOf(answers['reclaim_calendar_longest_block']),
    },
    offCalendar: {
      switchFrequency: textOf(answers['reclaim_calendar_switch_frequency']),
      reactiveTime: textOf(answers['reclaim_calendar_reactive_time']),
      offCalWork: textOf(answers['reclaim_calendar_offcal_work']),
      messagingLoad: textOf(answers['reclaim_calendar_messaging_load']),
    },
    hasReading: higher.length > 0 || lower.length > 0 || confirmed.length > 0,
  };
}

/** `6.5` → `6.5`, `6.0` → `6` — hours read as speech, not as a spreadsheet. */
const hours = (n: number): string => `${round1(n)}h`;

function line(entry: PerceptionEntry): string {
  const direction = entry.delta > 0 ? 'more' : 'less';
  return `- ${entry.title}: they estimated ${hours(entry.estimate)}, the reconciled figure is ${hours(
    entry.composite
  )} (${hours(Math.abs(entry.delta))} ${direction} than they thought).`;
}

/**
 * The reading, as the lines that go into the coach's briefing.
 *
 * Beside the arithmetic on purpose. The figures and the sentence that frames them are one artefact:
 * a list of deltas with no framing is a scorecard, and I17 is the difference between this beat
 * landing as information and landing as a verdict on how someone spends their week.
 *
 * Returns `[]` when there is nothing to say, so the caller can spread it unconditionally.
 */
export function calendarReadingLines(reading: CalendarReading): string[] {
  if (!reading.uploaded || !reading.hasReading) return [];

  const out: string[] = [
    'They uploaded a calendar and it has been reconciled, so the figures below are the composite:',
    'their calendar plus the work that never reaches one. The comparison is with what they estimated',
    'before they looked. Where the two differ, that difference is information about what a calendar',
    'captures and what it cannot see. It is never evidence that they were wrong about their own week,',
    'and it must never be put to them that way.',
    '',
  ];

  if (reading.completeness !== null) {
    out.push(
      `They said this about how completely their calendar reflects their working life: "${reading.completeness}". Read every figure below in that light.`,
      ''
    );
  }

  const section = (heading: string, entries: PerceptionEntry[]): void => {
    if (entries.length === 0) return;
    out.push(heading, ...entries.map(line), '');
  };

  section('Higher than they thought:', reading.higher);
  section('Lower than they thought:', reading.lower);
  section('Close to what they thought:', reading.confirmed);

  const { eventsPerDay, backToBack, longestBlockMinutes } = reading.shape;
  const rhythm: string[] = [];
  if (eventsPerDay !== null)
    rhythm.push(`${round1(eventsPerDay)} scheduled items a day on average`);
  if (backToBack !== null) rhythm.push(`${backToBack} of them back to back with no gap`);
  if (longestBlockMinutes !== null) {
    rhythm.push(`the longest uninterrupted block in the period was ${longestBlockMinutes} minutes`);
  }
  if (rhythm.length > 0) {
    out.push(
      `The shape of the week, separately from where the hours went: ${rhythm.join(', ')}.`,
      'Only raise this if it speaks to something they have already said. It is a fact about their',
      'diary, not a problem they have asked anyone to solve.',
      ''
    );
  }

  const { switchFrequency, reactiveTime, offCalWork, messagingLoad } = reading.offCalendar;
  const theirWords: string[] = [];
  if (switchFrequency !== null)
    theirWords.push(`on switching between kinds of work: "${switchFrequency}"`);
  if (reactiveTime !== null)
    theirWords.push(`on what happens to unscheduled time: "${reactiveTime}"`);
  if (offCalWork !== null) theirWords.push(`on what never reaches the calendar: "${offCalWork}"`);
  if (messagingLoad !== null) theirWords.push(`on email and messaging load: "${messagingLoad}"`);
  if (theirWords.length > 0) {
    out.push(
      'In their own words, about what a calendar cannot see:',
      ...theirWords.map((w) => `- ${w}`),
      ''
    );
  }

  out.push(
    'Name one or two of these specifically, starting with the largest movement, and use the real',
    'figures rather than describing them in general terms. Then stop and ask what they make of it.',
    'Their noticing comes first.'
  );

  return out;
}
