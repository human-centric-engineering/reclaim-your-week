/**
 * Pure `.ics` parser for the optional calendar branch (F5 t-1). Turns iCalendar text into a flat list
 * of normalised events — recurring series **expanded to one entry per instance** within an analysis
 * window (content-source §8: "count each instance for the quantitative view"), all-day and timezoned
 * events handled, multiple VCALENDAR blocks supported.
 *
 * **No DB, no network, no `saveAnswer`.** The `summary`/`description` fields exist ONLY in this
 * in-memory shape and are consumed by the categoriser (F5 t-2); they are never persisted (I4). This
 * module is the one place raw event text lives, and it lives only in memory.
 */

import ICAL from 'ical.js';

/** One concrete calendar occurrence, timezone-resolved to absolute instants. */
export interface CalendarEvent {
  /** Absolute start instant. */
  start: Date;
  /** Absolute end instant. */
  end: Date;
  /** Duration in minutes (end − start), never negative. */
  durationMinutes: number;
  /** True for date-only (all-day) events, which carry no wall-clock time. */
  isAllDay: boolean;
  /** The event title. In-memory only — never written to a slot (I4). */
  summary: string;
  /** The event description/notes. In-memory only — never written to a slot (I4). */
  description: string;
  /** The owning calendar's display name (`X-WR-CALNAME`), or `null` if the file did not name it. */
  calendarName: string | null;
}

export interface ParseOptions {
  /** Only keep occurrences that start on/after this instant. */
  windowStart?: Date;
  /** Only keep occurrences that start before this instant. Recurring series stop expanding here. */
  windowEnd?: Date;
  /** Hard cap on total occurrences returned, so an unbounded RRULE can't run away. Default 10000. */
  maxInstances?: number;
  /** Hard cap on occurrences expanded from a single recurring series. Default 2000. */
  maxInstancesPerSeries?: number;
}

export interface ParsedCalendar {
  events: CalendarEvent[];
  /** Distinct calendar names seen (`X-WR-CALNAME`), for the "which is your primary calendar?" prompt. */
  calendarNames: string[];
  /** True if a cap was hit and some occurrences were dropped — the caller should ask for a shorter window. */
  truncated: boolean;
}

const DEFAULT_MAX_INSTANCES = 10_000;
const DEFAULT_MAX_PER_SERIES = 2_000;
/** When a recurring series has no window end to bound it, expand at most this far past its start. */
const UNBOUNDED_WINDOW_DAYS = 366;
const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

/**
 * `ICAL.parse` returns either a single jCal component (`[name, props, subcomponents]`) or, for a file
 * with several root components, an array of them. Normalise to a list of top-level `VCALENDAR`s.
 */
function rootComponents(text: string): ICAL.Component[] {
  const parsed: unknown = ICAL.parse(text);
  const isJcal = (v: unknown): v is [string, unknown[], unknown[]] =>
    Array.isArray(v) && typeof v[0] === 'string';

  if (isJcal(parsed)) return [new ICAL.Component(parsed)];
  if (Array.isArray(parsed)) return parsed.filter(isJcal).map((c) => new ICAL.Component(c));
  return [];
}

function withinWindow(start: Date, options: ParseOptions): boolean {
  if (options.windowStart && start < options.windowStart) return false;
  if (options.windowEnd && start >= options.windowEnd) return false;
  return true;
}

/** The far edge past which we stop expanding a recurring series that the window does not bound. */
function seriesCeiling(seriesStart: Date, options: ParseOptions): Date {
  if (options.windowEnd) return options.windowEnd;
  return new Date(seriesStart.getTime() + UNBOUNDED_WINDOW_DAYS * MS_PER_DAY);
}

function toCalendarEvent(
  start: ICAL.Time,
  end: ICAL.Time,
  event: ICAL.Event,
  calendarName: string | null
): CalendarEvent {
  const startDate = start.toJSDate();
  const endDate = end.toJSDate();
  const durationMinutes = Math.max(
    0,
    Math.round((endDate.getTime() - startDate.getTime()) / MS_PER_MINUTE)
  );
  return {
    start: startDate,
    end: endDate,
    durationMinutes,
    isAllDay: start.isDate,
    summary: event.summary ?? '',
    description: event.description ?? '',
    calendarName,
  };
}

/**
 * Parse iCalendar text into normalised, window-filtered occurrences. Pure: same input → same output,
 * no side effects. Recurring events are expanded per instance; a series with no natural end is bounded
 * by `windowEnd` (or a one-year ceiling from its start) and by the per-series cap.
 */
export function parseIcs(text: string, options: ParseOptions = {}): ParsedCalendar {
  const maxInstances = options.maxInstances ?? DEFAULT_MAX_INSTANCES;
  const maxPerSeries = options.maxInstancesPerSeries ?? DEFAULT_MAX_PER_SERIES;

  const events: CalendarEvent[] = [];
  const calendarNames = new Set<string>();
  let truncated = false;

  for (const calendar of rootComponents(text)) {
    const rawName = calendar.getFirstPropertyValue('x-wr-calname');
    const calendarName = typeof rawName === 'string' && rawName.length > 0 ? rawName : null;
    if (calendarName) calendarNames.add(calendarName);

    for (const vevent of calendar.getAllSubcomponents('vevent')) {
      // A VEVENT that is itself a recurrence exception (has RECURRENCE-ID) is folded into its series
      // by ICAL.Event's exception handling below; skip it as a standalone to avoid double counting.
      if (vevent.hasProperty('recurrence-id')) continue;

      const event = new ICAL.Event(vevent);

      if (!event.isRecurring()) {
        if (event.startDate && event.endDate && withinWindow(event.startDate.toJSDate(), options)) {
          events.push(toCalendarEvent(event.startDate, event.endDate, event, calendarName));
          if (events.length >= maxInstances) return finish();
        }
        continue;
      }

      // Recurring: expand instance by instance, bounded by the window ceiling and the per-series cap.
      const ceiling = event.startDate ? seriesCeiling(event.startDate.toJSDate(), options) : null;
      const iterator = event.iterator();
      let perSeries = 0;
      let next = iterator.next();
      while (next) {
        const startJs = next.toJSDate();
        if (ceiling && startJs >= ceiling) break;
        if (++perSeries > maxPerSeries) {
          truncated = true;
          break;
        }
        if (withinWindow(startJs, options)) {
          const details = event.getOccurrenceDetails(next);
          events.push(toCalendarEvent(details.startDate, details.endDate, event, calendarName));
          if (events.length >= maxInstances) return finish();
        }
        next = iterator.next();
      }
    }
  }

  return finish();

  function finish(): ParsedCalendar {
    if (events.length >= maxInstances) truncated = true;
    events.sort((a, b) => a.start.getTime() - b.start.getTime());
    return { events, calendarNames: [...calendarNames], truncated };
  }
}
