/**
 * Phase client actions (F6): batch-save answers, read them back, bucket labels, coach openings, the
 * Phase 6 summary, sharing, completion, and the phase transition. `fetch` is stubbed; no network.
 *
 * Same stance as the sibling actions tests ([[planning-retro]] §B): assertions are about the
 * **contract** — a malformed envelope fails loudly, a server refusal reaches the caller with the
 * server's own message. `saveLabel` and `claimOpening` are documented best-effort/fire-and-forget, so
 * their tests prove they never throw rather than that they surface errors. `advancePhase` never
 * throws at all — I9/I12's refusals come back as data (`reflectionRequired` / `chartRevealRequired`)
 * so the caller can branch without a try/catch.
 *
 * `pr-gates` found this file out of step with its own siblings on two points, both fixed here rather
 * than merely documented: every `runId`-bearing URL now runs through `encodeURIComponent`, matching
 * `history/actions.ts` (`readRun`, `abandonRun`) and `repeat/actions.ts` (`readComparison`); and
 * `readAnswers` / `fetchSummary` / `shareSummary` now read the response body through
 * `.catch(() => null)` before checking `res.ok`, matching every other function in this file and every
 * function in the three sibling files. A run id containing `/` and a non-JSON refusal body both had a
 * real, if narrow, failure mode before this — see the two tests per affected function below.
 *
 * @see /components/app/reclaim/phase/actions.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  saveAnswer,
  saveBatch,
  readAnswers,
  readLabels,
  saveLabel,
  claimOpening,
  fetchSummary,
  shareSummary,
  completeAudit,
  advancePhase,
} from '@/components/app/reclaim/phase/actions';

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

const ANSWER_ENTRY = { value: 'CEO', valueJson: null, sourceType: 'direct', confidence: 1 };

const SUMMARY = {
  firstName: 'Priya',
  auditedOn: '2026-07-29T10:00:00.000Z',
  contactEmail: 'rashmir@rashmir.net',
  role: 'CEO',
  orgType: 'Nonprofit',
  period: '2026 Q1',
  priorities: 'Grow the team without losing the mission',
  current: {
    source: 'current' as const,
    buckets: [
      {
        token: 'deep-work',
        slug: 'deep-work',
        title: 'Deep work',
        hours: 10,
        percent: 25,
        lowPercent: null,
        highPercent: null,
        status: 'in' as const,
      },
    ],
    totalHours: 40,
    unallocated: [],
  },
  rows: [{ token: 'deep-work', title: 'Deep work', current: 10, ideal: null }],
  action: { chosen: null, when: null, howKnown: null },
  report: null,
  footnote: 'One quarter is a snapshot, not a verdict.',
};

describe('saveAnswer', () => {
  it('posts the answer to the run-scoped endpoint and resolves on success', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    await saveAnswer('run-1', { slotSlug: 'reclaim_profile_role', value: 'CEO' });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { body: string }];
    expect(url).toBe('/api/v1/app/reclaim/runs/run-1/answers');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body)).toEqual({ slotSlug: 'reclaim_profile_role', value: 'CEO' });
  });

  it('sends `confirming: true` when the leader accepts a coach-offered reading rather than stating it fresh', async () => {
    // Recorded server-side as `user_confirmed` rather than `direct` — see AnswerInput.confirming's
    // own docstring for why the distinction exists.
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    await saveAnswer('run-1', { slotSlug: 'reclaim_profile_role', value: 'CEO', confirming: true });

    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(init.body)).toMatchObject({ confirming: true });
  });

  it('URL-encodes the run id, matching readRun/abandonRun and readComparison', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });
    await saveAnswer('run/../2', { slotSlug: 'x', value: 'y' });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/app/reclaim/runs/run%2F..%2F2/answers');
  });

  it('surfaces the server’s message on a refusal', async () => {
    fetchMock.mockResolvedValue(fail('That slot is not writable from here.'));
    await expect(
      saveAnswer('run-1', { slotSlug: 'reclaim_profile_role', value: 'CEO' })
    ).rejects.toThrow('That slot is not writable from here.');
  });

  it('falls back to its own message when the refusal body carries no message', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: () => Promise.resolve({ nope: true }) });
    await expect(
      saveAnswer('run-1', { slotSlug: 'reclaim_profile_role', value: 'CEO' })
    ).rejects.toThrow('We could not save that just now.');
  });

  it('falls back to its own message when the refusal body is not JSON at all', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: () => Promise.reject(new Error('not json')) });
    await expect(
      saveAnswer('run-1', { slotSlug: 'reclaim_profile_role', value: 'CEO' })
    ).rejects.toThrow('We could not save that just now.');
  });
});

describe('saveBatch', () => {
  it('posts every answer wrapped in an `answers` array to the batch endpoint', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });
    const answers = [
      { slotSlug: 'reclaim_profile_role', value: 'CEO' },
      { slotSlug: 'reclaim_profile_org_type', value: 'Nonprofit' },
    ];

    await saveBatch('run-1', answers);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { body: string }];
    expect(url).toBe('/api/v1/app/reclaim/runs/run-1/answers/batch');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ answers });
  });

  it('surfaces the server’s message on a refusal', async () => {
    fetchMock.mockResolvedValue(fail('One of those answers was rejected.'));
    await expect(saveBatch('run-1', [])).rejects.toThrow('One of those answers was rejected.');
  });

  it('falls back to its own message when the refusal body has no message', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: () => Promise.resolve({ nope: true }) });
    await expect(saveBatch('run-1', [])).rejects.toThrow(
      'We could not save your answers just now.'
    );
  });
});

describe('readAnswers', () => {
  it('parses the answers keyed by slug, with no query string when no slugs are given', async () => {
    fetchMock.mockResolvedValue(ok({ answers: { reclaim_profile_role: ANSWER_ENTRY } }));

    const answers = await readAnswers('run-1');

    expect(answers).toEqual({ reclaim_profile_role: ANSWER_ENTRY });
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/app/reclaim/runs/run-1/answers');
  });

  it('omits the query string for an empty slugs array too', async () => {
    fetchMock.mockResolvedValue(ok({ answers: {} }));
    await readAnswers('run-1', []);
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/app/reclaim/runs/run-1/answers');
  });

  it('URL-encodes the joined slugs list in the query string', async () => {
    fetchMock.mockResolvedValue(ok({ answers: {} }));
    await readAnswers('run-1', ['reclaim_profile_role', 'reclaim_profile_org_type']);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/app/reclaim/runs/run-1/answers?slugs=reclaim_profile_role%2Creclaim_profile_org_type'
    );
  });

  it('URL-encodes the run id, same as the slugs query', async () => {
    fetchMock.mockResolvedValue(ok({ answers: {} }));
    await readAnswers('run/../2');
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/app/reclaim/runs/run%2F..%2F2/answers');
  });

  it('throws on a malformed envelope rather than handing the caller a partial answer set', async () => {
    fetchMock.mockResolvedValue(
      ok({ answers: { reclaim_profile_role: { value: 'CEO' } } }) // missing sourceType/confidence
    );
    await expect(readAnswers('run-1')).rejects.toThrow();
  });

  it('surfaces the server’s message on a refusal', async () => {
    fetchMock.mockResolvedValue(fail('That audit is not yours.'));
    await expect(readAnswers('run-1')).rejects.toThrow('That audit is not yours.');
  });

  it('falls back to its own message when the refusal body has no message', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: () => Promise.resolve({ nope: true }) });
    await expect(readAnswers('run-1')).rejects.toThrow('We could not load your answers.');
  });

  it('falls back to its own message when the refusal body is not JSON at all', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: () => Promise.reject(new Error('not json')) });
    await expect(readAnswers('run-1')).rejects.toThrow('We could not load your answers.');
  });
});

describe('readLabels', () => {
  it('parses the labels keyed by bucket token', async () => {
    fetchMock.mockResolvedValue(ok({ labels: { 'deep-work': 'Focus time' } }));
    expect(await readLabels()).toEqual({ 'deep-work': 'Focus time' });
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/app/reclaim/labels');
  });

  it('returns {} rather than throwing when the response is not ok', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: () => Promise.resolve({}) });
    await expect(readLabels()).resolves.toEqual({});
  });

  it('returns {} rather than throwing when the envelope is malformed (documented best-effort)', async () => {
    fetchMock.mockResolvedValue(ok({ labels: { 'deep-work': 42 } }));
    await expect(readLabels()).resolves.toEqual({});
  });

  it('returns {} rather than throwing when fetch itself rejects', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    await expect(readLabels()).resolves.toEqual({});
  });
});

describe('saveLabel', () => {
  it('posts the bucket slug and label', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    await saveLabel('deep-work', 'Focus time');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { body: string }];
    expect(url).toBe('/api/v1/app/reclaim/labels');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ bucketSlug: 'deep-work', label: 'Focus time' });
  });

  it('resolves without throwing even when the server refuses (fire-and-forget: it never inspects res.ok)', async () => {
    fetchMock.mockResolvedValue(fail('The cap has been reached.'));
    await expect(saveLabel('deep-work', 'Focus time')).resolves.toBeUndefined();
  });

  it('resolves without throwing when fetch itself rejects', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    await expect(saveLabel('deep-work', 'Focus time')).resolves.toBeUndefined();
  });
});

describe('claimOpening', () => {
  it('posts the moment to the run-scoped openings endpoint', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    await claimOpening('run-1', 'chart-reveal');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { body: string }];
    expect(url).toBe('/api/v1/app/reclaim/runs/run-1/coach/openings');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ moment: 'chart-reveal' });
  });

  it('resolves without throwing even when the server refuses (best-effort by design)', async () => {
    fetchMock.mockResolvedValue(fail('Unknown moment.'));
    await expect(claimOpening('run-1', 'chart-reveal')).resolves.toBeUndefined();
  });

  it('resolves without throwing when fetch itself rejects', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    await expect(claimOpening('run-1', 'chart-reveal')).resolves.toBeUndefined();
  });
});

describe('fetchSummary', () => {
  it('parses the summary artifact', async () => {
    fetchMock.mockResolvedValue(ok(SUMMARY));

    const summary = await fetchSummary('run-1');

    expect(summary).toEqual(SUMMARY);
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/app/reclaim/runs/run-1/summary');
  });

  it('defaults `report` to null when the server omits it (older cached response)', async () => {
    const { report: _report, ...withoutReading } = SUMMARY;
    fetchMock.mockResolvedValue(ok(withoutReading));

    const summary = await fetchSummary('run-1');
    expect(summary.report).toBeNull();
  });

  it('throws on a malformed envelope rather than handing the caller a broken chart', async () => {
    fetchMock.mockResolvedValue(
      ok({ ...SUMMARY, current: { ...SUMMARY.current, buckets: [{ token: 'x' }] } })
    );
    await expect(fetchSummary('run-1')).rejects.toThrow();
  });

  it('surfaces the server’s message on a refusal', async () => {
    fetchMock.mockResolvedValue(fail('That audit is not yours.'));
    await expect(fetchSummary('run-1')).rejects.toThrow('That audit is not yours.');
  });

  it('falls back to its own message when the refusal body has no message', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: () => Promise.resolve({ nope: true }) });
    await expect(fetchSummary('run-1')).rejects.toThrow('We could not load your summary.');
  });

  it('falls back to its own message when the refusal body is not JSON at all', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: () => Promise.reject(new Error('not json')) });
    await expect(fetchSummary('run-1')).rejects.toThrow('We could not load your summary.');
  });
});

describe('shareSummary', () => {
  it('posts the share choices and reports back what was shared', async () => {
    fetchMock.mockResolvedValue(ok({ sharedWithCoach: true }));

    const input = { withCoach: true, shareTranscript: true };
    const shared = await shareSummary('run-1', input);

    expect(shared).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { body: string }];
    expect(url).toBe('/api/v1/app/reclaim/runs/run-1/share');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual(input);
  });

  it('reports back a save where the leader chose not to share', async () => {
    fetchMock.mockResolvedValue(ok({ sharedWithCoach: false }));
    expect(await shareSummary('run-1', { withCoach: false })).toBe(false);
  });

  it('throws on a malformed envelope', async () => {
    fetchMock.mockResolvedValue(ok({ sharedWithCoach: 42 }));
    await expect(shareSummary('run-1', {})).rejects.toThrow();
  });

  it('surfaces the server’s message on a refusal', async () => {
    fetchMock.mockResolvedValue(fail('Sharing needs a completed audit.'));
    await expect(shareSummary('run-1', {})).rejects.toThrow('Sharing needs a completed audit.');
  });

  it('falls back to its own message when the refusal body has no message', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: () => Promise.resolve({ nope: true }) });
    await expect(shareSummary('run-1', {})).rejects.toThrow(
      'We could not save your choices just now.'
    );
  });

  it('falls back to its own message when the refusal body is not JSON at all', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: () => Promise.reject(new Error('not json')) });
    await expect(shareSummary('run-1', {})).rejects.toThrow(
      'We could not save your choices just now.'
    );
  });
});

describe('completeAudit', () => {
  it('posts to the complete endpoint and resolves on success', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    await completeAudit('run-1');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/app/reclaim/runs/run-1/complete');
    expect(init.method).toBe('POST');
  });

  it('surfaces the server’s message on a refusal', async () => {
    fetchMock.mockResolvedValue(fail('This audit is already complete.'));
    await expect(completeAudit('run-1')).rejects.toThrow('This audit is already complete.');
  });

  it('falls back to its own message when the refusal body has no message', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: () => Promise.resolve({ nope: true }) });
    await expect(completeAudit('run-1')).rejects.toThrow(
      'We could not finish your audit just now.'
    );
  });

  it('falls back to its own message when the refusal body is not JSON at all', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: () => Promise.reject(new Error('not json')) });
    await expect(completeAudit('run-1')).rejects.toThrow(
      'We could not finish your audit just now.'
    );
  });
});

describe('advancePhase', () => {
  it('posts fromPhase and returns { ok: true } on success', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

    const result = await advancePhase('run-1', 'phase-1-current');

    expect(result).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { body: string }];
    expect(url).toBe('/api/v1/app/reclaim/runs/run-1/transition');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ fromPhase: 'phase-1-current' });
  });

  it('returns reflectionRequired: true on a 422 REFLECTION_REQUIRED refusal, without throwing (I9)', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      json: () =>
        Promise.resolve({
          success: false,
          error: { code: 'REFLECTION_REQUIRED', message: 'Sit with that for a moment first.' },
        }),
    });

    const result = await advancePhase('run-1', 'phase-1-current');

    expect(result).toEqual({
      ok: false,
      reflectionRequired: true,
      message: 'Sit with that for a moment first.',
    });
  });

  it('returns chartRevealRequired: true on a 422 CHART_REVEAL_REQUIRED refusal, without throwing (I12)', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      json: () =>
        Promise.resolve({
          success: false,
          error: { code: 'CHART_REVEAL_REQUIRED', message: 'Take a look at your week first.' },
        }),
    });

    const result = await advancePhase('run-1', 'phase-1-current');

    expect(result).toEqual({
      ok: false,
      chartRevealRequired: true,
      message: 'Take a look at your week first.',
    });
  });

  it('falls back to a plain refusal for any other error code, without throwing', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      json: () =>
        Promise.resolve({ success: false, error: { code: 'CONFLICT', message: 'Try again.' } }),
    });

    const result = await advancePhase('run-1', 'phase-1-current');
    expect(result).toEqual({ ok: false, message: 'Try again.' });
  });

  it('falls back to its own generic message when the refusal body carries nothing usable', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('not json')),
    });

    const result = await advancePhase('run-1', 'phase-1-current');
    expect(result).toEqual({ ok: false, message: 'We could not move on just now.' });
  });
});
