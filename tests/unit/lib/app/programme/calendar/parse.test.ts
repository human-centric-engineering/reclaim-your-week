/**
 * `.ics` parser (F5 t-1) — pure, fixture-driven. The four shapes the audit must handle: recurring
 * (expanded per instance + window-bounded), all-day, timezoned (resolved to absolute instants), and
 * multiple VCALENDAR blocks. No DB, no LLM.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseIcs } from '@/lib/app/programme/calendar/parse';

const fixture = (name: string) =>
  readFileSync(join(process.cwd(), 'tests', 'fixtures', 'calendar', `${name}.ics`), 'utf8');

const utc = (iso: string) => new Date(iso);

describe('parseIcs — recurring', () => {
  const text = fixture('recurring-weekly');

  it('expands a weekly series to one entry per instance within the window', () => {
    const { events } = parseIcs(text, {
      windowStart: utc('2026-01-01T00:00:00Z'),
      windowEnd: utc('2026-02-01T00:00:00Z'),
    });
    // COUNT=4 from 2026-01-05: Jan 5, 12, 19, 26.
    expect(events).toHaveLength(4);
    expect(events.every((e) => e.durationMinutes === 90)).toBe(true);
    expect(events.every((e) => !e.isAllDay)).toBe(true);
    expect(events[0].calendarName).toBe('Recurring');
    // Sorted ascending by start.
    expect(events.map((e) => e.start.getTime())).toEqual(
      [...events.map((e) => e.start.getTime())].sort((a, b) => a - b)
    );
  });

  it('a narrower window keeps only the instances that start inside it', () => {
    const { events } = parseIcs(text, {
      windowStart: utc('2026-01-01T00:00:00Z'),
      windowEnd: utc('2026-01-13T00:00:00Z'),
    });
    // Only Jan 5 and Jan 12 start before the 13th.
    expect(events).toHaveLength(2);
  });
});

describe('parseIcs — all-day', () => {
  it('flags date-only events and gives them a full-day duration', () => {
    const { events } = parseIcs(fixture('all-day'), {
      windowStart: utc('2026-01-01T00:00:00Z'),
      windowEnd: utc('2026-02-01T00:00:00Z'),
    });
    expect(events).toHaveLength(1);
    expect(events[0].isAllDay).toBe(true);
    expect(events[0].durationMinutes).toBe(24 * 60);
  });
});

describe('parseIcs — timezoned', () => {
  it('resolves a TZID event to the correct absolute instant', () => {
    const { events } = parseIcs(fixture('timezoned'), {
      windowStart: utc('2026-06-01T00:00:00Z'),
      windowEnd: utc('2026-07-01T00:00:00Z'),
    });
    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event.isAllDay).toBe(false);
    expect(event.durationMinutes).toBe(90);
    // 09:00 Europe/London in June is BST (UTC+1) → 08:00Z.
    expect(event.start.getUTCHours()).toBe(8);
  });
});

describe('parseIcs — multiple calendars', () => {
  it('reads events from every VCALENDAR block and tags each with its calendar name', () => {
    const { events, calendarNames } = parseIcs(fixture('multi-calendar'), {
      windowStart: utc('2026-01-01T00:00:00Z'),
      windowEnd: utc('2026-02-01T00:00:00Z'),
    });
    expect(events).toHaveLength(2);
    expect(calendarNames.sort()).toEqual(['Personal', 'Work']);
    const byName = new Map(events.map((e) => [e.calendarName, e]));
    expect(byName.has('Work')).toBe(true);
    expect(byName.has('Personal')).toBe(true);
  });
});

describe('parseIcs — safety', () => {
  it('returns an empty result for non-calendar text rather than throwing', () => {
    expect(() => parseIcs('BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR')).not.toThrow();
    const { events } = parseIcs('BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR');
    expect(events).toEqual([]);
  });

  it('caps a runaway unbounded series and marks the result truncated', () => {
    const daily = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:daily@ryw.test',
      'DTSTAMP:20251201T000000Z',
      'DTSTART:20260101T090000Z',
      'DTEND:20260101T093000Z',
      'RRULE:FREQ=DAILY',
      'SUMMARY:Daily',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\n');
    // No window end → bounded by the one-year ceiling; cap per series low to force truncation.
    const { events, truncated } = parseIcs(daily, { maxInstancesPerSeries: 10 });
    expect(events).toHaveLength(10);
    expect(truncated).toBe(true);
  });
});
