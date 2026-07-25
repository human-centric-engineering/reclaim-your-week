/**
 * Admin client actions (F10). `fetch` is stubbed; no network.
 *
 * Same reasoning as the access-side actions test ([[planning-retro]] §B, the F4 t-4 lesson): the
 * assertions are about the **contract**, so an unexpected envelope fails loudly instead of yielding
 * `undefined` into a table, and a server refusal reaches the operator verbatim rather than as a
 * generic error.
 *
 * One assertion here is a privacy check rather than a parsing one: the client-list schema has no
 * field the sensitive setup prose could arrive in, so a server change that started sending it would
 * be dropped at the boundary rather than rendered.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  listClients,
  getClient,
  readMeasures,
  readInbox,
  readContent,
  saveContent,
} from '@/components/app/admin/actions';

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

const clientRow = {
  userId: 'u1',
  name: 'Ada',
  email: 'ada@example.com',
  joinedAt: '2026-01-01T00:00:00.000Z',
  tier: 'client',
  auditsGranted: 1,
  auditsUsed: 0,
  windowEndsAt: null,
  policyVersion: 'draft-1',
  marketingOptIn: false,
  referredByName: null,
  inviteTier: 'client',
  status: 'in_progress' as const,
  currentPhaseLabel: 'Current reality',
  completedRuns: 0,
  lastActivityAt: '2026-07-01T00:00:00.000Z',
  chatCostUsd: null,
  qualification: { reclaim_profile_role: 'CEO' },
};

describe('listClients', () => {
  it('parses the enriched list', async () => {
    fetchMock.mockResolvedValue(ok({ clients: [clientRow], abandonedAfterDays: 21 }));

    const view = await listClients();
    expect(view.clients[0]?.email).toBe('ada@example.com');
    expect(view.abandonedAfterDays).toBe(21);
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/app/reclaim/admin/clients');
  });

  it('throws on a malformed envelope rather than yielding undefined into the table', async () => {
    fetchMock.mockResolvedValue(ok({ clients: [{ userId: 'u1' }], abandonedAfterDays: 21 }));
    await expect(listClients()).rejects.toThrow();
  });

  it('surfaces the server’s message on a refusal', async () => {
    fetchMock.mockResolvedValue(fail('Admin access is required.'));
    await expect(listClients()).rejects.toThrow('Admin access is required.');
  });

  it('drops a sensitive prose field the list schema does not declare', async () => {
    fetchMock.mockResolvedValue(
      ok({
        clients: [{ ...clientRow, keepingMeUp: 'Losing my best person' }],
        abandonedAfterDays: 21,
      })
    );

    const view = await listClients();
    expect(JSON.stringify(view)).not.toContain('Losing my best person');
  });
});

describe('getClient', () => {
  it('parses the detail, including the sensitive context this endpoint is for', async () => {
    fetchMock.mockResolvedValue(
      ok({
        client: clientRow,
        context: [{ slug: 'reclaim_setup_why_now', label: 'Why now', value: 'A hard quarter' }],
        runs: [],
        journeyHref: '/admin/framework/journeys',
      })
    );

    const detail = await getClient('u1');
    expect(detail.context[0]?.value).toBe('A hard quarter');
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/app/reclaim/admin/clients/u1');
  });
});

describe('readMeasures', () => {
  it('keeps a null rate null rather than coercing it to zero', async () => {
    fetchMock.mockResolvedValue(
      ok({
        returnRate: { completedAtLeastOne: 0, completedTwoOrMore: 0, rate: null },
        referral: {
          sent: 0,
          accepted: 0,
          completed: 0,
          acceptanceRate: null,
          completionRate: null,
        },
        totals: { clients: 3, runsCompleted: 0 },
      })
    );

    const measures = await readMeasures();
    expect(measures.returnRate.rate).toBeNull();
  });
});

describe('readInbox', () => {
  it('parses shared results and a suppressed aggregate', async () => {
    fetchMock.mockResolvedValue(
      ok({
        shared: [],
        aggregate: {
          cohort: 2,
          minimumCohort: 5,
          suppressed: true,
          buckets: [],
          mostOftenEmpty: [],
        },
      })
    );

    const inbox = await readInbox();
    expect(inbox.aggregate.suppressed).toBe(true);
    expect(inbox.aggregate.cohort).toBe(2);
  });
});

describe('content', () => {
  const view = {
    buckets: [
      {
        bucketSlug: 'deep-work',
        title: { key: 'buckets.0.title', label: 'Title', value: 'Deep work', matchesSource: true },
        description: {
          key: 'buckets.0.description',
          label: 'Description',
          value: 'Protected time.',
          matchesSource: false,
        },
        benchmarkNote: {
          key: 'buckets.0.benchmarkNote',
          label: 'Benchmark range',
          value: 'no range',
          matchesSource: true,
        },
      },
    ],
    bands: [],
    prose: [],
    rules: [],
    editedCount: 1,
    baseVersion: 7,
  };

  it('parses the content view with its divergence markers', async () => {
    fetchMock.mockResolvedValue(ok(view));

    const content = await readContent();
    expect(content.editedCount).toBe(1);
    expect(content.buckets[0]?.description.matchesSource).toBe(false);
  });

  it('sends the edits and the required change summary', async () => {
    fetchMock.mockResolvedValue(ok(view));

    await saveContent({
      values: { 'buckets.0.description': 'Reworded.' },
      changeSummary: 'Softened the wording.',
      baseVersion: 7,
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, { method: string; body: string }];
    expect(url).toBe('/api/v1/app/reclaim/admin/content');
    expect(init.method).toBe('PUT');
    // `baseVersion` is carried so a concurrent save is refused by the framework's optimistic-
    // concurrency guard rather than silently overwriting the other tab's edit.
    expect(JSON.parse(init.body)).toEqual({
      values: { 'buckets.0.description': 'Reworded.' },
      changeSummary: 'Softened the wording.',
      baseVersion: 7,
    });
  });

  it('surfaces a validation refusal from the framework’s schema verbatim', async () => {
    fetchMock.mockResolvedValue(fail('Bucket title must not be empty.'));
    await expect(
      saveContent({ values: { 'buckets.0.title': '' }, changeSummary: 'Oops.', baseVersion: 7 })
    ).rejects.toThrow('Bucket title must not be empty.');
  });
});
