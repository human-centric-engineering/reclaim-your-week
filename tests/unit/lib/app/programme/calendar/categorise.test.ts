/**
 * Calendar categorisation (F5 t-2). The provider + agent lookup are mocked, so no DB/LLM. The
 * load-bearing assertions: hours aggregate to buckets in code (not the LLM), personal events are
 * excluded, ambiguous items are surfaced, and — the I4 core — **no raw event title reaches the
 * returned result** (only tokens, hours, and reasoning). Metrics are pure and tested directly.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { runStructuredMock, getProviderMock, resolveMock, findAgentMock } = vi.hoisted(() => ({
  runStructuredMock: vi.fn(),
  getProviderMock: vi.fn(),
  resolveMock: vi.fn(),
  findAgentMock: vi.fn(),
}));

vi.mock('@/lib/orchestration/llm/structured-completion', () => ({
  runStructuredCompletion: runStructuredMock,
}));
vi.mock('@/lib/orchestration/llm/provider-manager', () => ({ getProvider: getProviderMock }));
vi.mock('@/lib/orchestration/llm/agent-resolver', () => ({
  resolveAgentProviderAndModel: resolveMock,
}));
vi.mock('@/lib/db/client', () => ({ prisma: { aiAgent: { findUnique: findAgentMock } } }));

import {
  categoriseCalendar,
  computeMetrics,
  bucketToken,
  CalendarProviderUnavailableError,
} from '@/lib/app/programme/calendar/categorise';
import type { CalendarEvent } from '@/lib/app/programme/calendar/parse';

interface EventSpec {
  start: string;
  durationMinutes: number;
  isAllDay?: boolean;
  summary?: string;
  description?: string;
  calendarName?: string | null;
}

const event = (spec: EventSpec): CalendarEvent => ({
  start: new Date(spec.start),
  end: new Date(new Date(spec.start).getTime() + spec.durationMinutes * 60_000),
  durationMinutes: spec.durationMinutes,
  isAllDay: spec.isAllDay ?? false,
  summary: spec.summary ?? 'Untitled',
  description: spec.description ?? '',
  calendarName: spec.calendarName ?? null,
});

/** All events fall in one week so weeks = 1 and hours == minutes/60. */
const oneWeek: CalendarEvent[] = [
  event({ start: '2026-01-05T09:00:00Z', durationMinutes: 120, summary: 'Deep focus block' }),
  event({ start: '2026-01-06T09:00:00Z', durationMinutes: 60, summary: 'Dentist' }),
  event({ start: '2026-01-07T09:00:00Z', durationMinutes: 90, summary: 'Catch up' }),
];

beforeEach(() => {
  runStructuredMock.mockReset();
  getProviderMock.mockReset().mockResolvedValue({ chat: vi.fn() });
  resolveMock.mockReset().mockResolvedValue({ providerSlug: 'anthropic', model: 'claude-x' });
  findAgentMock.mockReset().mockResolvedValue({
    id: 'agent-1',
    provider: 'anthropic',
    model: 'claude-x',
    fallbackProviders: [],
  });
});

describe('computeMetrics', () => {
  it('counts back-to-back events and the longest uninterrupted block', () => {
    const evs = [
      event({ start: '2026-01-05T09:00:00Z', durationMinutes: 60 }), // 09-10
      event({ start: '2026-01-05T10:00:00Z', durationMinutes: 60 }), // 10-11 back-to-back
      event({ start: '2026-01-05T14:00:00Z', durationMinutes: 30 }), // gap, new block
    ];
    const m = computeMetrics(evs);
    expect(m.backToBack).toBe(1);
    expect(m.longestBlockMinutes).toBe(120); // 09:00–11:00 merged
    expect(m.eventsPerDay).toBe(3); // all one day
  });

  it('ignores all-day events', () => {
    const m = computeMetrics([
      event({ start: '2026-01-05T00:00:00Z', durationMinutes: 1440, isAllDay: true }),
    ]);
    expect(m).toEqual({ eventsPerDay: 0, backToBack: 0, longestBlockMinutes: 0 });
  });
});

describe('categoriseCalendar', () => {
  it('aggregates hours to buckets in code, excludes personal, and surfaces ambiguous items', async () => {
    runStructuredMock.mockResolvedValue({
      value: [
        { index: 0, bucketSlug: 'deep-work', ambiguous: false, reasoning: 'protected block' },
        { index: 1, bucketSlug: 'personal', ambiguous: false, reasoning: 'dentist' },
        {
          index: 2,
          bucketSlug: 'delivery-operations',
          ambiguous: true,
          reasoning: 'generic title',
        },
      ],
      costUsd: 0.01,
    });

    const result = await categoriseCalendar(oneWeek);

    expect(result.perBucketHours[bucketToken('deep-work')]).toBe(2); // 120 min
    expect(result.perBucketHours[bucketToken('delivery-operations')]).toBe(1.5); // 90 min
    expect(result.perBucketHours[bucketToken('recovery-white-space')]).toBeUndefined();
    expect(result.totalHours).toBe(3.5);
    expect(result.excludedPersonalCount).toBe(1);
    expect(result.ambiguous).toHaveLength(1);
    expect(result.ambiguous[0].bucketSlug).toBe('delivery-operations');
  });

  it('never returns a raw event title anywhere in the result (I4)', async () => {
    runStructuredMock.mockResolvedValue({
      value: [
        { index: 0, bucketSlug: 'deep-work', ambiguous: false, reasoning: 'ok' },
        { index: 1, bucketSlug: 'personal', ambiguous: false, reasoning: 'ok' },
        { index: 2, bucketSlug: 'delivery-operations', ambiguous: true, reasoning: 'ok' },
      ],
      costUsd: 0,
    });
    const result = await categoriseCalendar(oneWeek);
    const serialised = JSON.stringify(result);
    for (const title of ['Deep focus block', 'Dentist', 'Catch up']) {
      expect(serialised).not.toContain(title);
    }
  });

  it('passes the raw titles to the provider exactly once (single call, I4)', async () => {
    runStructuredMock.mockResolvedValue({
      value: [{ index: 0, bucketSlug: 'deep-work', ambiguous: false, reasoning: '' }],
      costUsd: 0,
    });
    await categoriseCalendar([oneWeek[0]]);
    expect(runStructuredMock).toHaveBeenCalledTimes(1);
  });

  it('short-circuits with no timed events (no LLM call)', async () => {
    const result = await categoriseCalendar([
      event({ start: '2026-01-05T00:00:00Z', durationMinutes: 1440, isAllDay: true }),
    ]);
    expect(runStructuredMock).not.toHaveBeenCalled();
    expect(result.totalHours).toBe(0);
  });

  it('throws CalendarProviderUnavailableError when the coach agent is missing', async () => {
    findAgentMock.mockResolvedValue(null);
    await expect(categoriseCalendar([oneWeek[0]])).rejects.toBeInstanceOf(
      CalendarProviderUnavailableError
    );
  });

  it('builds the leader-context lines and truncates long descriptions (no crash)', async () => {
    let sentContent = '';
    runStructuredMock.mockImplementation((opts: { messages: Array<{ content: string }> }) => {
      sentContent = opts.messages[1].content;
      return Promise.resolve({
        value: [{ index: 0, bucketSlug: 'deep-work', ambiguous: false, reasoning: '' }],
        costUsd: 0,
      });
    });
    const longDesc = 'x'.repeat(400);
    await categoriseCalendar(
      [event({ start: '2026-01-05T09:00:00Z', durationMinutes: 60, description: longDesc })],
      { role: 'CEO', orgType: 'Charity', priorities: 'Fundraising', fundraisingRelevant: false }
    );
    expect(sentContent).toContain('Role: CEO');
    expect(sentContent).toContain('Fundraising is not relevant');
    // The 400-char description is capped at 200 in the payload.
    expect(sentContent).not.toContain('x'.repeat(201));
  });

  it('spreads hours across multiple weeks when the span exceeds seven days', async () => {
    runStructuredMock.mockResolvedValue({
      value: [
        { index: 0, bucketSlug: 'deep-work', ambiguous: false, reasoning: '' },
        { index: 1, bucketSlug: 'deep-work', ambiguous: false, reasoning: '' },
      ],
      costUsd: 0,
    });
    // Two 10h blocks 14 days apart → span 2 weeks → 20h / 2 = 10h/week.
    const result = await categoriseCalendar([
      event({ start: '2026-01-05T09:00:00Z', durationMinutes: 600 }),
      event({ start: '2026-01-19T09:00:00Z', durationMinutes: 600 }),
    ]);
    expect(result.perBucketHours[bucketToken('deep-work')]).toBe(10);
  });
});

describe('categoriseCalendar — the parse callback (LLM output validation)', () => {
  /** Capture the real `parse` function the categoriser hands to runStructuredCompletion. */
  async function captureParse(): Promise<(raw: string) => unknown> {
    let parseFn: ((raw: string) => unknown) | undefined;
    runStructuredMock.mockImplementation((opts: { parse: (raw: string) => unknown }) => {
      parseFn = opts.parse;
      return Promise.resolve({
        value: opts.parse(
          JSON.stringify({
            classifications: [
              { index: 0, bucketSlug: 'deep-work', ambiguous: false, reasoning: '' },
            ],
          })
        ),
        costUsd: 0,
      });
    });
    await categoriseCalendar([oneWeek[0]]);
    if (!parseFn) throw new Error('parse was not captured');
    return parseFn;
  }

  it('rejects malformed and structurally-wrong payloads', async () => {
    const parse = await captureParse();
    expect(parse('not json')).toBeNull();
    expect(parse(JSON.stringify({}))).toBeNull(); // no classifications
    expect(parse(JSON.stringify({ classifications: 'x' }))).toBeNull(); // not an array
    expect(parse(JSON.stringify({ classifications: [] }))).toBeNull(); // empty → null
    expect(
      parse(JSON.stringify({ classifications: [{ index: 'bad', bucketSlug: 'deep-work' }] }))
    ).toBeNull(); // bad index type → filtered → empty → null
    expect(
      parse(JSON.stringify({ classifications: [{ index: 0, bucketSlug: 'not-a-bucket' }] }))
    ).toBeNull(); // unknown bucket → filtered
  });

  it('accepts valid items and defaults missing ambiguous/reasoning', async () => {
    const parse = await captureParse();
    const out = parse(
      JSON.stringify({
        classifications: [
          { index: 0, bucketSlug: 'personal', ambiguous: true, reasoning: 'r' },
          { index: 1, bucketSlug: 'deep-work' }, // missing ambiguous/reasoning → defaults
        ],
      })
    ) as Array<{ index: number; ambiguous: boolean; reasoning: string }>;
    expect(out).toHaveLength(2);
    expect(out[1].ambiguous).toBe(false);
    expect(out[1].reasoning).toBe('');
  });
});
