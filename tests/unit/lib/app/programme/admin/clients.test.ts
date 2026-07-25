/**
 * The client list (F10 t-1). Prisma and the framework's journey query are mocked; the assertions are
 * about the **joins and the rules**, not about the mocks returning what they were handed.
 *
 * Load-bearing:
 *   - the two `sensitive` setup slots never appear in the list payload (plan D5, I5) — asserted on
 *     the serialised payload, so a future column that happens to carry one fails this;
 *   - `chatCostUsd` is `null` for an unlinked run and `0` only for a linked one that genuinely cost
 *     nothing (plan D2) — a screen that renders "not recorded" as £0 tells Rashmir an audit was free;
 *   - the stall rule is the configured number of days, and a recently-touched run is not stalled;
 *   - the cross-user journey read goes through the framework's gated `listJourneys` with an explicit
 *     `isAdminSupport` viewer (plan D4).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  userFindMany: vi.fn(),
  grantFindMany: vi.fn(),
  consentFindMany: vi.fn(),
  inviteFindMany: vi.fn(),
  runFindMany: vi.fn(),
  nodeStateFindMany: vi.fn(),
  costGroupBy: vi.fn(),
  moduleFindUnique: vi.fn(),
  getSlotHeads: vi.fn(),
  listJourneys: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  prisma: {
    user: { findMany: mocks.userFindMany },
    reclaimGrant: { findMany: mocks.grantFindMany },
    reclaimConsent: { findMany: mocks.consentFindMany },
    reclaimInvite: { findMany: mocks.inviteFindMany },
    reclaimAuditRun: { findMany: mocks.runFindMany },
    userNodeState: { findMany: mocks.nodeStateFindMany },
    aiCostLog: { groupBy: mocks.costGroupBy },
    module: { findUnique: mocks.moduleFindUnique },
  },
}));

vi.mock('@/lib/framework/data-slots/values', () => ({ getSlotHeads: mocks.getSlotHeads }));
vi.mock('@/lib/framework/facilitation/journey/queries', () => ({
  listJourneys: mocks.listJourneys,
}));

import { listClients } from '@/lib/app/programme/admin/clients';

const ADMIN = 'admin-1';
const DAY = 24 * 60 * 60 * 1000;

/** A run row with only the fields the module reads. */
function run(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'run-1',
    userId: 'ada',
    status: 'in_progress',
    quarter: null,
    conversationId: null,
    startedAt: new Date(Date.now() - DAY),
    completedAt: null,
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();

  mocks.moduleFindUnique.mockResolvedValue({ config: {} }); // schema defaults: 21 days, cohort 5
  mocks.userFindMany.mockResolvedValue([
    { id: 'ada', name: 'Ada', email: 'ada@example.com', createdAt: new Date('2026-01-01') },
  ]);
  mocks.grantFindMany.mockResolvedValue([]);
  mocks.consentFindMany.mockResolvedValue([]);
  mocks.inviteFindMany.mockResolvedValue([]);
  mocks.runFindMany.mockResolvedValue([]);
  mocks.nodeStateFindMany.mockResolvedValue([]);
  mocks.costGroupBy.mockResolvedValue([]);
  mocks.getSlotHeads.mockResolvedValue([]);
  mocks.listJourneys.mockResolvedValue({ journeys: [], total: 0 });
});

/** A grant row with the shape the real query returns — every column present, nulls where unset. */
function grant(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'grant-1',
    userId: 'ada',
    tier: 'standard',
    auditsGranted: 1,
    auditsUsed: 0,
    windowStartsAt: null,
    mustStartBy: null,
    sourceInviteId: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

/** Point the "who is a client" queries plus the run query at one leader with `runs`. */
function seedLeader(runs: ReturnType<typeof run>[]) {
  mocks.grantFindMany.mockResolvedValue([grant()]);
  mocks.runFindMany.mockResolvedValue(runs);
}

describe('listClients — the sensitive slots', () => {
  it('never carries the sensitive setup prose into the list payload', async () => {
    seedLeader([]);
    // Even if the slot read returns them — a future change to the requested slugs, say — they must
    // not reach the wire. The guard is in the code, not only in the query.
    mocks.getSlotHeads.mockResolvedValue([
      { slotSlug: 'reclaim_profile_role', value: 'CEO', valueJson: null },
      {
        slotSlug: 'reclaim_setup_keeping_me_up',
        value: 'Losing my best person',
        valueJson: null,
      },
      { slotSlug: 'reclaim_setup_why_now', value: 'A hard quarter', valueJson: null },
    ]);

    const view = await listClients(ADMIN);
    const payload = JSON.stringify(view);

    expect(payload).not.toContain('Losing my best person');
    expect(payload).not.toContain('A hard quarter');
    expect(view.clients[0]?.qualification).toEqual({ reclaim_profile_role: 'CEO' });
  });
});

describe('listClients — status', () => {
  it('reads an untouched in-progress run past the threshold as stalled', async () => {
    seedLeader([run({ updatedAt: new Date(Date.now() - 30 * DAY) })]);

    const view = await listClients(ADMIN);
    expect(view.clients[0]?.status).toBe('stalled');
    expect(view.abandonedAfterDays).toBe(21);
  });

  it('reads a recently touched in-progress run as mid-audit, not stalled', async () => {
    seedLeader([run({ updatedAt: new Date(Date.now() - 2 * DAY) })]);

    expect((await listClients(ADMIN)).clients[0]?.status).toBe('in_progress');
  });

  it('reads a leader with a grant and no runs as never started', async () => {
    seedLeader([]);
    expect((await listClients(ADMIN)).clients[0]?.status).toBe('never_started');
  });

  it('counts completed audits and reads the leader as complete', async () => {
    seedLeader([
      run({ id: 'r1', status: 'complete', completedAt: new Date() }),
      run({ id: 'r2', status: 'complete', completedAt: new Date() }),
    ]);

    const client = (await listClients(ADMIN)).clients[0];
    expect(client?.status).toBe('complete');
    expect(client?.completedRuns).toBe(2);
  });
});

describe('listClients — chat cost', () => {
  it('reports null when no run has a recorded conversation', async () => {
    seedLeader([run({ conversationId: null })]);
    expect((await listClients(ADMIN)).clients[0]?.chatCostUsd).toBeNull();
  });

  it('reports 0 for a linked run with no cost rows — a real zero, unlike an unlinked one', async () => {
    seedLeader([run({ conversationId: 'conv-1' })]);
    mocks.costGroupBy.mockResolvedValue([]);

    expect((await listClients(ADMIN)).clients[0]?.chatCostUsd).toBe(0);
  });

  it('sums the cost of the linked runs only', async () => {
    seedLeader([
      run({ id: 'r1', conversationId: 'conv-1', status: 'complete' }),
      run({ id: 'r2', conversationId: null }),
    ]);
    mocks.costGroupBy.mockResolvedValue([
      { conversationId: 'conv-1', _sum: { totalCostUsd: 1.25 } },
    ]);

    expect((await listClients(ADMIN)).clients[0]?.chatCostUsd).toBe(1.25);
  });
});

describe('listClients — the cross-user read', () => {
  it('reads journeys through the framework with an explicit admin-support viewer', async () => {
    seedLeader([run({ id: 'run-1' })]);
    mocks.listJourneys.mockResolvedValue({
      journeys: [{ id: 'j1', contextKey: 'run-1' }],
      total: 1,
    });
    mocks.nodeStateFindMany.mockResolvedValue([
      { journeyId: 'j1', nodeKey: 'phase-0-setup', status: 'completed' },
      { journeyId: 'j1', nodeKey: 'phase-1-current', status: 'active' },
    ]);

    const view = await listClients(ADMIN);

    expect(mocks.listJourneys).toHaveBeenCalledWith(
      { userId: ADMIN, isAdminSupport: true },
      { graphSlug: 'reclaim-audit' }
    );
    // And the phase it resolves to is the active node, not the last completed one.
    expect(view.clients[0]?.currentPhaseLabel).toBeTruthy();
    expect(view.clients[0]?.currentPhaseLabel).not.toBe('Setup');
  });

  it('does not query node states at all when nobody has an open run', async () => {
    seedLeader([run({ status: 'complete' })]);

    await listClients(ADMIN);
    expect(mocks.listJourneys).not.toHaveBeenCalled();
    expect(mocks.nodeStateFindMany).not.toHaveBeenCalled();
  });
});

describe('listClients — no N+1', () => {
  /** Point every query at a cohort of `size` leaders and report the resulting call counts. */
  async function callCountsFor(size: number) {
    for (const mock of Object.values(mocks)) mock.mockClear();

    const leaders = Array.from({ length: size }, (_, i) => ({
      id: `u${i}`,
      name: `Leader ${i}`,
      email: `u${i}@example.com`,
      createdAt: new Date(),
    }));
    mocks.userFindMany.mockResolvedValue(leaders);
    mocks.grantFindMany.mockResolvedValue(leaders.map((u) => grant({ userId: u.id })));

    await listClients(ADMIN);

    return {
      users: mocks.userFindMany.mock.calls.length,
      grants: mocks.grantFindMany.mock.calls.length,
      runs: mocks.runFindMany.mock.calls.length,
      consents: mocks.consentFindMany.mock.calls.length,
      invites: mocks.inviteFindMany.mock.calls.length,
      slotHeads: mocks.getSlotHeads.mock.calls.length,
    };
  }

  it('issues the same number of table queries for 25 leaders as for one', async () => {
    const one = await callCountsFor(1);
    const many = await callCountsFor(25);

    // The property that matters is not the absolute count — it is that the count does not grow with
    // the cohort. A per-row fetch is the regression this endpoint is most likely to acquire.
    expect(many.users).toBe(one.users);
    expect(many.grants).toBe(one.grants);
    expect(many.runs).toBe(one.runs);
    expect(many.consents).toBe(one.consents);
    expect(many.invites).toBe(one.invites);
  });

  it('scales only the slot read with the cohort — the documented exception', async () => {
    // `getSlotHeads` is per-user by design: its `userId` argument IS the framework's access seam, so
    // there is no batched variant to call. One indexed query per leader, and nothing else may join it.
    expect((await callCountsFor(1)).slotHeads).toBe(1);
    expect((await callCountsFor(25)).slotHeads).toBe(25);
  });
});
