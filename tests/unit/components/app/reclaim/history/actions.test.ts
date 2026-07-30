/**
 * Client actions for the audit history: the list of a leader's audits, and one of them read back.
 * `fetch` is stubbed; no network.
 *
 * Same stance as the repeat-audit actions test ([[planning-retro]] §B): the assertions are about the
 * **contract** the shared `parseEnvelope` / `errorMessageFrom` parser enforces — a malformed envelope
 * fails loudly, and a server refusal reaches the caller as a thrown error with the server's own
 * message. `auditPeriod` and `auditDate` are pure formatting and are asserted on their branches
 * directly.
 *
 * @see /components/app/reclaim/history/actions.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  readRuns,
  readRun,
  abandonRun,
  auditPeriod,
  auditDate,
  RUN_COMPLETE,
} from '@/components/app/reclaim/history/actions';

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

const RUN_ITEM = {
  id: 'run-1',
  quarter: '2026 Q1',
  status: RUN_COMPLETE,
  startedAt: '2026-01-04T09:00:00.000Z',
  completedAt: '2026-01-06T17:30:00.000Z',
  abandonedAt: null,
  hasConversation: true,
  progress: null,
};

const RUN_STATE = {
  run: {
    id: 'run-1',
    quarter: '2026 Q1',
    status: RUN_COMPLETE,
    startedAt: '2026-01-04T09:00:00.000Z',
    completedAt: '2026-01-06T17:30:00.000Z',
    conversationId: 'conv-1',
    coachOpenings: [],
    phaseMarks: {},
  },
  phases: [{ key: 'phase-0-setup', label: 'Setup', status: 'completed' }],
  currentPhaseKey: 'phase-0-setup',
};

describe('readRuns', () => {
  it('parses the list and hits the runs collection endpoint', async () => {
    fetchMock.mockResolvedValue(ok({ runs: [RUN_ITEM] }));

    const runs = await readRuns();

    expect(runs).toEqual([RUN_ITEM]);
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/app/reclaim/runs');
  });

  it('parses a run still in progress, which carries phase progress instead of null', async () => {
    const inProgress = {
      ...RUN_ITEM,
      status: 'in_progress',
      completedAt: null,
      progress: { phaseKey: 'phase-1-current', phaseLabel: 'Current reality', phaseIndex: 1 },
    };
    fetchMock.mockResolvedValue(ok({ runs: [inProgress] }));

    const [run] = await readRuns();
    expect(run?.progress).toEqual({
      phaseKey: 'phase-1-current',
      phaseLabel: 'Current reality',
      phaseIndex: 1,
    });
  });

  it('throws on a malformed envelope rather than handing the caller an empty list silently', async () => {
    fetchMock.mockResolvedValue(ok({ runs: [{ id: 'run-1' }] }));
    await expect(readRuns()).rejects.toThrow();
  });

  it('surfaces the server’s own message on a refusal', async () => {
    fetchMock.mockResolvedValue(fail('Please sign in.'));
    await expect(readRuns()).rejects.toThrow('Please sign in.');
  });

  it('falls back to its own message when the failure body carries no message at all', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: () => Promise.resolve({ nope: true }) });
    await expect(readRuns()).rejects.toThrow('We could not load your audits.');
  });

  it('falls back to its own message when the failure body is not JSON at all', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: () => Promise.reject(new Error('not json')) });
    await expect(readRuns()).rejects.toThrow('We could not load your audits.');
  });
});

describe('readRun', () => {
  it('parses the run state and hits the run-scoped endpoint', async () => {
    fetchMock.mockResolvedValue(ok(RUN_STATE));

    const state = await readRun('run-1');

    expect(state.currentPhaseKey).toBe('phase-0-setup');
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/app/reclaim/runs/run-1');
  });

  it('defaults coachOpenings and phaseMarks when the server omits them', async () => {
    const { coachOpenings: _coachOpenings, phaseMarks: _phaseMarks, ...restRun } = RUN_STATE.run;
    fetchMock.mockResolvedValue(ok({ ...RUN_STATE, run: restRun }));

    const state = await readRun('run-1');
    expect(state.run.coachOpenings).toEqual([]);
    expect(state.run.phaseMarks).toEqual({});
  });

  it('encodes the run id into the path, so a hostile id cannot escape the segment', async () => {
    fetchMock.mockResolvedValue(ok(RUN_STATE));
    await readRun('run/../2');
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/app/reclaim/runs/run%2F..%2F2');
  });

  it('throws on a refusal, with the server’s message', async () => {
    fetchMock.mockResolvedValue(fail('That audit is not yours.'));
    await expect(readRun('run-1')).rejects.toThrow('That audit is not yours.');
  });

  it('falls back to its own message when the refusal body has no message', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: () => Promise.resolve({ nope: true }) });
    await expect(readRun('run-1')).rejects.toThrow('We could not load that audit.');
  });
});

describe('abandonRun', () => {
  it('posts to the abandon route and resolves on success', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    await abandonRun('run-1');

    const [url, init] = fetchMock.mock.calls[0] as [string, { method: string }];
    expect(url).toBe('/api/v1/app/reclaim/runs/run-1/abandon');
    expect(init.method).toBe('POST');
  });

  it('URL-encodes the run id, matching readRun', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    await abandonRun('run/../2');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/app/reclaim/runs/run%2F..%2F2/abandon',
      expect.anything()
    );
  });

  it('surfaces the server’s message on a refusal', async () => {
    fetchMock.mockResolvedValue(fail('That audit is already finished'));
    await expect(abandonRun('run-1')).rejects.toThrow('That audit is already finished');
  });

  it('falls back to a generic message when the refusal carries no envelope', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: () => Promise.reject(new Error('not json')) });
    await expect(abandonRun('run-1')).rejects.toThrow('We could not do that just now.');
  });
});

describe('auditPeriod', () => {
  it('uses the quarter the leader gave the audit when there is one', () => {
    expect(auditPeriod({ quarter: '2026 Q1', startedAt: '2026-01-04T09:00:00.000Z' })).toBe(
      '2026 Q1'
    );
  });

  it('falls back to the month and year it started when the quarter is null', () => {
    expect(auditPeriod({ quarter: null, startedAt: '2026-01-04T09:00:00.000Z' })).toBe(
      'January 2026'
    );
  });

  it('falls back to the month and year when the quarter is blank rather than absent', () => {
    // Whitespace-only is treated the same as null: an empty label is not a period worth showing.
    expect(auditPeriod({ quarter: '   ', startedAt: '2026-06-15T09:00:00.000Z' })).toBe(
      'June 2026'
    );
  });
});

describe('auditDate', () => {
  it('renders a full day, month and year', () => {
    expect(auditDate('2026-01-06T17:30:00.000Z')).toBe('6 January 2026');
  });
});
