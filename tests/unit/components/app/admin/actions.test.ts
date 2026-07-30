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
  readReachOut,
  sendReachOut,
  listPreviewAccounts,
  createPreviewAccount,
  adoptPreviewAccount,
  fastForwardPreviewAccount,
  removePreviewAccount,
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
        timeline: [],
      })
    );

    const measures = await readMeasures();
    expect(measures.returnRate.rate).toBeNull();
    // A young product has no timeline yet, and that must survive parsing as an empty list rather
    // than failing the envelope — the panel decides whether there is enough to draw.
    expect(measures.timeline).toEqual([]);
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
        title: {
          key: 'buckets.0.title',
          label: 'Title',
          value: 'Deep work',
          matchesSource: true,
          sourceKind: 'rashmir',
        },
        description: {
          key: 'buckets.0.description',
          label: 'Description',
          value: 'Protected time.',
          matchesSource: false,
          sourceKind: 'rashmir',
        },
        benchmarkNote: {
          key: 'buckets.0.benchmarkNote',
          label: 'Benchmark range',
          value: 'no range',
          matchesSource: true,
          sourceKind: 'rashmir',
        },
      },
    ],
    bands: [],
    prose: [],
    signposts: [
      {
        phaseKey: 'phase-0-setup',
        involves: {
          key: 'phaseSignposts.0.involves',
          label: 'What this phase involves',
          value: 'A little context.',
          matchesSource: true,
          sourceKind: 'authored',
        },
        duration: {
          key: 'phaseSignposts.0.duration',
          label: 'Roughly how long',
          value: 'a few minutes',
          matchesSource: true,
          sourceKind: 'authored',
        },
        opening: [
          {
            key: 'phaseSignposts.0.opening.0',
            label: 'Opening, part 1',
            value: 'Welcome.',
            matchesSource: true,
            sourceKind: 'authored',
          },
        ],
      },
    ],
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

describe('readReachOut', () => {
  const draft = {
    subject: 'Your time audit is still open',
    body: 'Hello Ada,\n\nRashmir',
    auditRunId: 'run-1',
    phaseLabel: 'Energy',
    alreadyWrittenForThisRun: false,
    optedOutOfNudges: false,
  };

  it('parses the draft and the sent history', async () => {
    fetchMock.mockResolvedValue(
      ok({
        draft,
        sent: [
          {
            id: 'm1',
            auditRunId: 'run-1',
            subject: 'Earlier note',
            body: 'Hello,',
            status: 'sent',
            sentAt: '2026-07-01T00:00:00.000Z',
            sentByName: 'Rashmir',
          },
        ],
      })
    );

    const view = await readReachOut('u1');
    expect(view.draft.subject).toBe(draft.subject);
    expect(view.sent[0]?.status).toBe('sent');
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/app/reclaim/admin/clients/u1/reach-out');
  });

  it('URL-encodes the user id, matching every other admin client route', async () => {
    fetchMock.mockResolvedValue(ok({ draft, sent: [] }));

    await readReachOut('u/1');
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/app/reclaim/admin/clients/u%2F1/reach-out');
  });

  it('surfaces the server’s message on a refusal', async () => {
    fetchMock.mockResolvedValue(fail('No programme record for that account'));
    await expect(readReachOut('ghost')).rejects.toThrow('No programme record for that account');
  });
});

describe('sendReachOut', () => {
  it('posts exactly what was typed, not a re-derived draft', async () => {
    fetchMock.mockResolvedValue(
      ok({
        record: {
          id: 'm2',
          auditRunId: 'run-1',
          subject: 'A different subject',
          body: 'Words she actually wrote.',
          status: 'sent',
          sentAt: '2026-07-30T00:00:00.000Z',
          sentByName: 'Rashmir',
        },
        delivered: true,
      })
    );

    const result = await sendReachOut('u1', {
      subject: 'A different subject',
      body: 'Words she actually wrote.',
      auditRunId: 'run-1',
    });

    expect(result.delivered).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, { method: string; body: string }];
    expect(url).toBe('/api/v1/app/reclaim/admin/clients/u1/reach-out');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      subject: 'A different subject',
      body: 'Words she actually wrote.',
      auditRunId: 'run-1',
    });
  });

  it('reports a delivery failure without throwing — the record still saved', async () => {
    fetchMock.mockResolvedValue(
      ok({
        record: {
          id: 'm3',
          auditRunId: null,
          subject: 'Subject',
          body: 'Body',
          status: 'failed',
          sentAt: '2026-07-30T00:00:00.000Z',
          sentByName: 'Rashmir',
        },
        delivered: false,
      })
    );

    const result = await sendReachOut('u1', { subject: 'Subject', body: 'Body', auditRunId: null });
    expect(result.delivered).toBe(false);
    expect(result.record.status).toBe('failed');
  });

  it('surfaces the server’s message when the send itself is refused', async () => {
    fetchMock.mockResolvedValue(fail('A subject cannot contain a line break'));
    await expect(
      sendReachOut('u1', { subject: 'Bad\nSubject', body: 'Body', auditRunId: null })
    ).rejects.toThrow('A subject cannot contain a line break');
  });
});

describe('preview accounts (F19)', () => {
  const accountRow = {
    userId: 'u1',
    name: 'Test Leader',
    email: 'test@example.org',
    label: 'Checking the summary',
    createdAt: '2026-07-30T00:00:00.000Z',
    createdByName: 'Rashmir',
    state: 'none' as const,
    latestRunId: null,
  };

  it('unwraps the enriched list', async () => {
    fetchMock.mockResolvedValue(ok({ accounts: [accountRow] }));

    expect(await listPreviewAccounts()).toEqual([accountRow]);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/app/reclaim/admin/preview');
  });

  it('throws on an unexpected shape rather than returning undefined rows', async () => {
    fetchMock.mockResolvedValue(ok({ accounts: [{ userId: 'u1' }] }));

    await expect(listPreviewAccounts()).rejects.toThrow(/Unexpected response/);
  });

  it('creates a test account, returning the one-time password', async () => {
    fetchMock.mockResolvedValue(
      ok({
        account: { userId: 'u2', email: 'ada+rywpreview-abc@example.org', label: 'walkthrough' },
        password: 'Rwqwertyuiop7!',
        signInUrl: 'https://ryw.test/login',
        message: 'Test account created.',
      })
    );

    const result = await createPreviewAccount({ label: 'walkthrough', state: 'fresh' });

    expect(result.password).toBe('Rwqwertyuiop7!');
    const [url, init] = fetchMock.mock.calls[0] as [string, { method: string; body: string }];
    expect(url).toBe('/api/v1/app/reclaim/admin/preview');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ label: 'walkthrough', state: 'fresh' });
  });

  it('surfaces a conflict when the address is already registered', async () => {
    fetchMock.mockResolvedValue(fail('An account already exists for this email'));

    await expect(createPreviewAccount({ label: 'x', state: 'fresh' })).rejects.toThrow(
      'An account already exists for this email'
    );
  });

  it('adopts an existing account, returning the server’s confirmation', async () => {
    fetchMock.mockResolvedValue(ok({ message: 'Marked as a test account.' }));

    const message = await adoptPreviewAccount({ email: 'you+t1@example.org', label: 'front door' });

    expect(message).toBe('Marked as a test account.');
    const [url, init] = fetchMock.mock.calls[0] as [string, { method: string; body: string }];
    expect(url).toBe('/api/v1/app/reclaim/admin/preview/adopt');
    expect(JSON.parse(init.body)).toEqual({ email: 'you+t1@example.org', label: 'front door' });
  });

  it('surfaces the server’s refusal when adopting fails', async () => {
    fetchMock.mockResolvedValue(fail('No account exists for that email'));

    await expect(adoptPreviewAccount({ email: 'nobody@example.org', label: 'x' })).rejects.toThrow(
      'No account exists for that email'
    );
  });

  it('fast-forwards an account, returning the server’s confirmation', async () => {
    fetchMock.mockResolvedValue(
      ok({ message: 'That test account is now sitting at phase-4-gap.' })
    );

    const message = await fastForwardPreviewAccount('u1', { to: 'mid-audit' });

    expect(message).toBe('That test account is now sitting at phase-4-gap.');
  });

  it('fast-forwards an account and passes the engine’s refusal through unchanged', async () => {
    fetchMock.mockResolvedValue(
      fail('preview: the engine refused to leave phase-1-current (reflection required)')
    );

    await expect(fastForwardPreviewAccount('u1', { to: 'mid-audit' })).rejects.toThrow(
      'preview: the engine refused to leave phase-1-current (reflection required)'
    );
    const [url, init] = fetchMock.mock.calls[0] as [string, { method: string; body: string }];
    expect(url).toBe('/api/v1/app/reclaim/admin/preview/u1/fast-forward');
    expect(JSON.parse(init.body)).toEqual({ to: 'mid-audit' });
  });

  it('removes a test account', async () => {
    fetchMock.mockResolvedValue(ok({ message: 'Test account removed.' }));

    const message = await removePreviewAccount('u1');

    expect(message).toBe('Test account removed.');
    const [url, init] = fetchMock.mock.calls[0] as [string, { method: string }];
    expect(url).toBe('/api/v1/app/reclaim/admin/preview/u1');
    expect(init.method).toBe('DELETE');
  });

  it('surfaces the server’s refusal when removal fails', async () => {
    fetchMock.mockResolvedValue(fail('That account is an admin account and was not removed'));

    await expect(removePreviewAccount('u1')).rejects.toThrow(
      'That account is an admin account and was not removed'
    );
  });

  it('URL-encodes a userId in the fast-forward and remove paths', async () => {
    fetchMock.mockResolvedValue(ok({ message: 'ok' }));

    await removePreviewAccount('user/with slash');

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/api/v1/app/reclaim/admin/preview/user%2Fwith%20slash'
    );
  });
});
