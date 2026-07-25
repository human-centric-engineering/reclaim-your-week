/**
 * Repeat-audit client actions (F9). `fetch` is stubbed; no network.
 *
 * Same stance as the access-side actions test ([[planning-retro]] §B, the F4 t-4 lesson): the
 * assertions are about the **contract**, so a malformed envelope fails loudly rather than putting
 * `undefined` into a chart, and a server refusal reaches the caller as a thrown error it can choose
 * to swallow — which is exactly what the trend and comparison components do, since neither is
 * important enough to interrupt a leader mid-audit with.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { readTrends, readComparison, readShortcut } from '@/components/app/reclaim/repeat/actions';

const fetchMock = vi.fn();

const ok = (data: unknown) => ({ ok: true, json: () => Promise.resolve({ success: true, data }) });
const fail = (message: string) => ({
  ok: false,
  json: () => Promise.resolve({ success: false, error: { code: 'FORBIDDEN', message } }),
});

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const RUN = { runId: 'run-1', quarter: '2026 Q1', completedAt: '2026-04-01T00:00:00.000Z' };

describe('readTrends', () => {
  it('parses the series, keeping gaps as null', async () => {
    fetchMock.mockResolvedValue(
      ok({
        runs: [RUN, { ...RUN, runId: 'run-2', quarter: '2026 Q2' }],
        buckets: [{ bucketSlug: 'deep-work', title: 'Deep work', hours: [10, null] }],
        enoughData: true,
      })
    );

    const view = await readTrends();
    // A gap must survive parsing as a gap. Coerced to 0 it would draw a line to the floor and say
    // the leader did none of this that quarter.
    expect(view.buckets[0]?.hours).toEqual([10, null]);
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/app/reclaim/trends');
  });

  it('throws on a malformed envelope rather than yielding undefined into a chart', async () => {
    fetchMock.mockResolvedValue(
      ok({ runs: [], buckets: [{ bucketSlug: 'x' }], enoughData: false })
    );
    await expect(readTrends()).rejects.toThrow();
  });

  it('surfaces the server’s message on a refusal, for the caller to swallow or show', async () => {
    fetchMock.mockResolvedValue(fail('Please sign in.'));
    await expect(readTrends()).rejects.toThrow('Please sign in.');
  });
});

describe('readComparison', () => {
  it('parses previous: null for a first audit', async () => {
    fetchMock.mockResolvedValue(ok({ previous: null, buckets: [] }));

    const view = await readComparison('run-2');
    expect(view.previous).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/app/reclaim/runs/run-2/compare');
  });

  it('keeps a null difference null rather than coercing it to zero', async () => {
    fetchMock.mockResolvedValue(
      ok({
        previous: RUN,
        buckets: [
          {
            bucketSlug: 'deep-work',
            title: 'Deep work',
            previousHours: 10,
            currentHours: null,
            differenceHours: null,
          },
        ],
      })
    );

    // "Not yet answered" and "no change" are different facts, and only one of them is a zero.
    expect((await readComparison('run-2')).buckets[0]?.differenceHours).toBeNull();
  });

  it('encodes the run id into the path', async () => {
    fetchMock.mockResolvedValue(ok({ previous: null, buckets: [] }));
    await readComparison('run/../2');
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/app/reclaim/runs/run%2F..%2F2/compare');
  });

  it('throws on a refusal', async () => {
    fetchMock.mockResolvedValue(fail('That audit is not yours.'));
    await expect(readComparison('run-2')).rejects.toThrow('That audit is not yours.');
  });
});

describe('the failure fallback', () => {
  it('uses its own message when the server sends a body with no message in it', async () => {
    // A 502 from a proxy, or a body that is not our envelope at all. The caller still gets something
    // sayable rather than "undefined".
    fetchMock.mockResolvedValue({ ok: false, json: () => Promise.resolve({ nope: true }) });
    await expect(readTrends()).rejects.toThrow('We could not load your history.');
  });

  it('uses its own message when the body is not JSON at all', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: () => Promise.reject(new Error('not json')) });
    await expect(readComparison('run-2')).rejects.toThrow('We could not load your last audit.');
  });
});

describe('readShortcut', () => {
  it('parses the confirm line and the answers to pre-fill', async () => {
    fetchMock.mockResolvedValue(
      ok({
        previous: RUN,
        confirmLine: '"I can see from your recent audit that you are CEO at Nonprofit…"',
        answers: { reclaim_profile_role: 'CEO' },
      })
    );

    const shortcut = await readShortcut();
    expect(shortcut.confirmLine).toContain('CEO at Nonprofit');
    expect(shortcut.answers['reclaim_profile_role']).toBe('CEO');
  });

  it('parses the not-applicable shape without inventing a shortcut', async () => {
    fetchMock.mockResolvedValue(ok({ previous: null, confirmLine: null, answers: {} }));

    const shortcut = await readShortcut();
    expect(shortcut.previous).toBeNull();
    expect(shortcut.confirmLine).toBeNull();
  });

  it('throws on a refusal', async () => {
    fetchMock.mockResolvedValue(fail('Please sign in.'));
    await expect(readShortcut()).rejects.toThrow('Please sign in.');
  });
});
