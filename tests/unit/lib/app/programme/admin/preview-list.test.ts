/**
 * The preview-account list (F19). Prisma is mocked — no DB.
 *
 * Load-bearing behaviours, in the order they can mislead an operator:
 *   - **`state` is read from the run, not the registry row** — the row records a decision an operator
 *     made, the run records what actually happened, and an operator signing in as the account and
 *     continuing by hand must be reflected without a second write anywhere.
 *   - **the most recent run wins**, on a `startedAt`-desc read, so a second fast-forward on the same
 *     account shows its latest state rather than its first.
 *   - **a missing user is dropped, not rendered "unknown"** — the registry cascades with the account,
 *     so this should not happen, but a list an operator acts on must never show a phantom row.
 *   - **no per-row fetches** — one call each to `user`, `user` again (creators), `reclaimAuditRun`.
 *   - **the phase is read for in-progress runs only**, and it is what tells an operator how an
 *     account was set up. A finished or unstarted audit is not sitting at a phase, and asking for one
 *     would widen the journey read for an answer nothing renders.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  previewFindMany: vi.fn(),
  userFindMany: vi.fn(),
  runFindMany: vi.fn(),
  currentPhaseByRun: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  prisma: {
    reclaimPreviewAccount: { findMany: mocks.previewFindMany },
    user: { findMany: mocks.userFindMany },
    reclaimAuditRun: { findMany: mocks.runFindMany },
  },
}));

/**
 * The phase read is the client list's own, mocked here rather than re-implemented.
 *
 * `phaseLabelForKey` is deliberately **not** mocked away — it is a pure lookup over the map, and
 * stubbing it would let this file assert a label the map does not actually have.
 */
vi.mock('@/lib/app/programme/admin/clients', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/app/programme/admin/clients')>();
  return {
    phaseLabelForKey: actual.phaseLabelForKey,
    supportViewer: (adminUserId: string) => ({ userId: adminUserId }),
    currentPhaseByRun: mocks.currentPhaseByRun,
  };
});

import { listPreviewAccounts } from '@/lib/app/programme/admin/preview-list';

const registryRow = (over: Record<string, unknown> = {}) => ({
  userId: 'u1',
  label: 'Rashmir’s walkthrough',
  createdByUserId: 'admin-1',
  createdAt: new Date('2026-07-30T00:00:00Z'),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.previewFindMany.mockResolvedValue([]);
  mocks.userFindMany.mockResolvedValue([]);
  mocks.runFindMany.mockResolvedValue([]);
  mocks.currentPhaseByRun.mockResolvedValue(new Map());
});

describe('listPreviewAccounts — the empty cases', () => {
  it('returns nothing for no test accounts, with no further queries', async () => {
    const rows = await listPreviewAccounts('admin-1');

    expect(rows).toEqual([]);
    expect(mocks.userFindMany).not.toHaveBeenCalled();
    expect(mocks.runFindMany).not.toHaveBeenCalled();
  });
});

describe('listPreviewAccounts — state', () => {
  it('reports none for an account with no run at all', async () => {
    mocks.previewFindMany.mockResolvedValue([registryRow()]);
    mocks.userFindMany.mockImplementation(({ where }: { where: { id: { in: string[] } } }) =>
      Promise.resolve(
        where.id.in.includes('u1') ? [{ id: 'u1', name: 'Sam', email: 'sam@example.org' }] : []
      )
    );

    const [row] = await listPreviewAccounts('admin-1');

    expect(row?.state).toBe('none');
    expect(row?.latestRunId).toBeNull();
  });

  it('reads state from the run, not the registry row', async () => {
    // The registry only ever records that the account IS a test account. Everything about what has
    // actually happened to it — including whether it has a run at all — comes from the run table.
    mocks.previewFindMany.mockResolvedValue([registryRow()]);
    mocks.userFindMany.mockResolvedValue([{ id: 'u1', name: 'Sam', email: 'sam@example.org' }]);
    mocks.runFindMany.mockResolvedValue([{ id: 'run-1', userId: 'u1', status: 'complete' }]);

    const [row] = await listPreviewAccounts('admin-1');

    expect(row?.state).toBe('complete');
    expect(row?.latestRunId).toBe('run-1');
  });

  it('takes the most recent run when an account has more than one', async () => {
    // A second fast-forward on the same account must show its LATEST state — the whole reason this
    // screen exists is to look at what an account is doing right now.
    mocks.previewFindMany.mockResolvedValue([registryRow()]);
    mocks.userFindMany.mockResolvedValue([{ id: 'u1', name: 'Sam', email: 'sam@example.org' }]);
    // `orderBy: startedAt desc` is the query's own contract — the mock returns them already ordered
    // that way, as the real query would.
    mocks.runFindMany.mockResolvedValue([
      { id: 'run-2', userId: 'u1', status: 'in_progress' },
      { id: 'run-1', userId: 'u1', status: 'complete' },
    ]);

    const [row] = await listPreviewAccounts('admin-1');

    expect(row?.state).toBe('in_progress');
    expect(row?.latestRunId).toBe('run-2');
  });
});

describe('listPreviewAccounts — where the audit is', () => {
  it('reports the phase key, its label and its number for an open audit', async () => {
    // This is what the screen shows under the state badge, and it is the answer to "how was this
    // account set up". Before it existed the only phase on the row was the one sitting in the Fill
    // in control — a command, which operators read as a state.
    mocks.previewFindMany.mockResolvedValue([registryRow()]);
    mocks.userFindMany.mockResolvedValue([{ id: 'u1', name: 'Sam', email: 'sam@example.org' }]);
    mocks.runFindMany.mockResolvedValue([{ id: 'run-1', userId: 'u1', status: 'in_progress' }]);
    mocks.currentPhaseByRun.mockResolvedValue(new Map([['run-1', 'phase-4-gap']]));

    const [row] = await listPreviewAccounts('admin-1');

    expect(row?.phaseKey).toBe('phase-4-gap');
    expect(row?.phaseLabel).toBe('Gap analysis');
    expect(row?.phaseNumber).toBe(4);
  });

  it('asks for the phase of in-progress runs only', async () => {
    // A finished or abandoned audit is not sitting at a phase. Passing its id would widen the
    // journey read — a cross-user read — to produce something nothing renders.
    mocks.previewFindMany.mockResolvedValue([
      registryRow(),
      registryRow({ userId: 'u2' }),
      registryRow({ userId: 'u3' }),
    ]);
    mocks.userFindMany.mockResolvedValue([
      { id: 'u1', name: 'A', email: 'a@x.org' },
      { id: 'u2', name: 'B', email: 'b@x.org' },
      { id: 'u3', name: 'C', email: 'c@x.org' },
    ]);
    mocks.runFindMany.mockResolvedValue([
      { id: 'run-1', userId: 'u1', status: 'in_progress' },
      { id: 'run-2', userId: 'u2', status: 'complete' },
    ]);

    await listPreviewAccounts('admin-1');

    expect(mocks.currentPhaseByRun).toHaveBeenCalledTimes(1);
    expect(mocks.currentPhaseByRun.mock.calls[0]?.[1]).toEqual(['run-1']);
  });

  it('leaves the phase null for an account with no audit at all', async () => {
    mocks.previewFindMany.mockResolvedValue([registryRow()]);
    mocks.userFindMany.mockResolvedValue([{ id: 'u1', name: 'Sam', email: 'sam@example.org' }]);

    const [row] = await listPreviewAccounts('admin-1');

    expect(row?.phaseKey).toBeNull();
    expect(row?.phaseLabel).toBeNull();
    expect(row?.phaseNumber).toBeNull();
  });

  it('passes the calling admin’s own id through to the journey viewer', async () => {
    // The framework's cross-user widening is an explicit input attributable to a person, not a role
    // lookup — so the id this list is given has to be the one that reaches the journey read.
    mocks.previewFindMany.mockResolvedValue([registryRow()]);
    mocks.userFindMany.mockResolvedValue([{ id: 'u1', name: 'Sam', email: 'sam@example.org' }]);
    mocks.runFindMany.mockResolvedValue([{ id: 'run-1', userId: 'u1', status: 'in_progress' }]);

    await listPreviewAccounts('rashmir-the-admin');

    expect(mocks.currentPhaseByRun.mock.calls[0]?.[0]).toEqual({ userId: 'rashmir-the-admin' });
  });
});

describe('listPreviewAccounts — who made it', () => {
  it('resolves the creator’s name in the same enriched read', async () => {
    mocks.previewFindMany.mockResolvedValue([registryRow({ createdByUserId: 'admin-1' })]);
    mocks.userFindMany.mockImplementation(({ where }: { where: { id: { in: string[] } } }) =>
      Promise.resolve(
        where.id.in.includes('u1')
          ? [{ id: 'u1', name: 'Sam', email: 'sam@example.org' }]
          : [{ id: 'admin-1', name: 'Rashmir' }]
      )
    );

    const [row] = await listPreviewAccounts('admin-1');

    expect(row?.createdByName).toBe('Rashmir');
  });

  it('is null when nobody is recorded as having created it', async () => {
    mocks.previewFindMany.mockResolvedValue([registryRow({ createdByUserId: null })]);
    mocks.userFindMany.mockResolvedValue([{ id: 'u1', name: 'Sam', email: 'sam@example.org' }]);

    const [row] = await listPreviewAccounts('admin-1');

    expect(row?.createdByName).toBeNull();
    // No creator id to look up, so the second `user` read must not fire at all.
    expect(mocks.userFindMany).toHaveBeenCalledTimes(1);
  });

  it('is null once the creator’s own account has been erased, rather than throwing', async () => {
    // `createdByUserId` is SET NULL on erasure at the DB level, but a row read between that erasure
    // and this one running could still carry an id the `user` table no longer has.
    mocks.previewFindMany.mockResolvedValue([registryRow({ createdByUserId: 'gone-admin' })]);
    mocks.userFindMany.mockImplementation(({ where }: { where: { id: { in: string[] } } }) =>
      Promise.resolve(
        where.id.in.includes('u1') ? [{ id: 'u1', name: 'Sam', email: 'sam@example.org' }] : []
      )
    );

    const [row] = await listPreviewAccounts('admin-1');

    expect(row?.createdByName).toBeNull();
  });
});

describe('listPreviewAccounts — a missing account', () => {
  it('drops a registry row whose account is gone, rather than rendering an unknown row', async () => {
    // Expected never to happen — the registry cascades with the account — but a list an operator acts
    // on (including deleting from) must never show a row for something that no longer exists.
    mocks.previewFindMany.mockResolvedValue([registryRow(), registryRow({ userId: 'u2' })]);
    mocks.userFindMany.mockResolvedValue([{ id: 'u1', name: 'Sam', email: 'sam@example.org' }]);

    const rows = await listPreviewAccounts('admin-1');

    expect(rows).toHaveLength(1);
    expect(rows[0]?.userId).toBe('u1');
  });
});

describe('listPreviewAccounts — no per-row fetches', () => {
  it('issues the same number of queries for five accounts as for one', async () => {
    mocks.previewFindMany.mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => registryRow({ userId: `u${i}` }))
    );
    mocks.userFindMany.mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => ({
        id: `u${i}`,
        name: `Leader ${i}`,
        email: `u${i}@x.org`,
      }))
    );

    await listPreviewAccounts('admin-1');

    // One call for the accounts themselves, one for their creators, one for their runs.
    expect(mocks.userFindMany).toHaveBeenCalledTimes(2);
    expect(mocks.runFindMany).toHaveBeenCalledTimes(1);
  });

  it('orders by createdAt desc — newest test account first', async () => {
    mocks.previewFindMany.mockResolvedValue([registryRow()]);
    mocks.userFindMany.mockResolvedValue([{ id: 'u1', name: 'Sam', email: 'sam@example.org' }]);

    await listPreviewAccounts('admin-1');

    expect(mocks.previewFindMany).toHaveBeenCalledWith({ orderBy: { createdAt: 'desc' } });
  });
});
