/**
 * Regression: a completed audit stays readable after the next one starts.
 *
 * **This is the test whose absence let the bug ship.** Every other test around this code mocks
 * `readRunAnswers`, so they assert what `buildSummary` does with answers it is handed and can say
 * nothing about whether the right answers arrive. The defect lived one layer below that mock: the
 * reader filtered slot *heads* by `provenance.runId`, and a completed run's values stop being heads
 * the moment a later run supersedes them.
 *
 * So this suite deliberately runs the **real** `readRunAnswers` over a stateful in-memory slot store,
 * and exercises the thing a leader would actually notice — the tokenised public summary link F7
 * invites them to send to a colleague, which quietly emptied when they started their next audit.
 *
 * It is written as the user-visible sequence rather than as unit assertions on internals, because the
 * property worth protecting is "the link you shared still shows what you shared", not any particular
 * query shape.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

interface Row {
  userId: string;
  slotSlug: string;
  version: number;
  value: string;
  valueJson: unknown;
  provenance: unknown;
  supersededAt: Date | null;
}

const { store, findMany } = vi.hoisted(() => ({
  store: { rows: [] as unknown[] },
  findMany: vi.fn(),
}));

// `buildSummary` also reads the run row for the analyst's stored reading (F14). These fixtures are
// about run-scoping the *answers*, so every run here simply has no reading.
vi.mock('@/lib/db/client', () => ({
  prisma: {
    slotValue: { findMany },
    reclaimAuditRun: {
      // A fixed date: this suite compares whole summaries, and a clock read per call would make
      // every one of those comparisons flap by a millisecond.
      findFirst: async () => ({
        analystReading: null,
        completedAt: null,
        startedAt: new Date('2026-04-01T09:00:00.000Z'),
      }),
    },
    // The report carries the contact address, so `buildSummary` reads the module row too. Empty
    // here, which falls through to the schema default exactly as an untouched database does.
    module: { findUnique: async () => null },
  },
}));

import { buildSummary } from '@/lib/app/programme/summary';

const rows = () => store.rows as Row[];

/** Append a slot value the way `saveAnswer` does — new version, previous head superseded. */
function answer(slotSlug: string, value: string, runId: string, valueJson: unknown = null) {
  const existing = rows().filter((r) => r.slotSlug === slotSlug);
  for (const row of existing) row.supersededAt = new Date();
  rows().push({
    userId: 'leader-1',
    slotSlug,
    version: existing.length + 1,
    value,
    valueJson,
    provenance: { runId },
    supersededAt: null,
  });
}

/** One complete audit's worth of answers, so the summary has something real to render. */
function completeAuditIn(runId: string, deepWorkHours: number, period: string) {
  answer('reclaim_profile_first_name', 'Sam', runId);
  answer('reclaim_profile_role', 'CEO', runId);
  answer('reclaim_profile_org_type', 'Nonprofit', runId);
  answer('reclaim_setup_audit_period', period, runId);
  answer('reclaim_setup_priorities', 'Grow the team', runId);
  answer('reclaim_current_hours__deep_work', String(deepWorkHours), runId, deepWorkHours);
  answer('reclaim_ideal_hours__deep_work', '14', runId, 14);
  answer('reclaim_action_chosen', 'Protect two mornings a week', runId);
  answer('reclaim_action_when', 'From Monday', runId);
}

beforeEach(() => {
  store.rows = [];
  findMany.mockReset();
  findMany.mockImplementation((args: { where: Record<string, unknown>; orderBy?: unknown }) => {
    const where = args.where;
    const slugFilter = where.slotSlug as { in: string[] } | undefined;
    const provenance = where.provenance as { path: string[]; equals: string } | undefined;
    const direction = (args.orderBy as { version?: string } | undefined)?.version ?? 'asc';

    // The fake honours `supersededAt` **if the query asks for it**, which is what makes this a real
    // regression test rather than a description of the fix: re-introduce that filter in
    // `readRunAnswers` and these assertions fail, exactly as they would have before the fix.
    return Promise.resolve(
      rows()
        .filter((r) => r.userId === where.userId)
        .filter((r) => (slugFilter ? slugFilter.in.includes(r.slotSlug) : true))
        .filter((r) => (where.supersededAt === null ? r.supersededAt === null : true))
        .filter((r) => {
          if (provenance === undefined) return true;
          const p = r.provenance as Record<string, unknown>;
          const key = provenance.path[0];
          return key !== undefined && p[key] === provenance.equals;
        })
        .sort((a, b) => (direction === 'desc' ? b.version - a.version : a.version - b.version))
    );
  });
});

describe('an earlier report survives the leader starting their next audit', () => {
  it('renders Q1 in full after Q2 has been started and answered', async () => {
    completeAuditIn('run-q1', 10, 'last quarter');

    // What the colleague saw when the link was first sent.
    const asShared = await buildSummary('leader-1', 'run-q1');
    expect(asShared.firstName).toBe('Sam');
    expect(asShared.role).toBe('CEO');
    expect(asShared.period).toBe('last quarter');
    expect(asShared.rows.find((r) => r.token === 'deep_work')).toMatchObject({
      current: 10,
      ideal: 14,
    });

    // Three months later the same leader begins their next audit and works through it.
    completeAuditIn('run-q2', 4, 'last month');

    // The link they shared must still show what they shared. Before the fix this came back with a
    // null name, a null role, and zero hours in every bucket — a blank page at a URL the leader had
    // sent to somebody, with nothing anywhere telling them it had happened.
    const asSharedLater = await buildSummary('leader-1', 'run-q1');
    expect(asSharedLater).toEqual(asShared);
  });

  it('shows the new audit’s own picture, not the old one', async () => {
    completeAuditIn('run-q1', 10, 'last quarter');
    completeAuditIn('run-q2', 4, 'last month');

    const q2 = await buildSummary('leader-1', 'run-q2');
    expect(q2.period).toBe('last month');
    expect(q2.rows.find((r) => r.token === 'deep_work')?.current).toBe(4);
  });

  it('keeps three audits distinct, so a trend has something to read', async () => {
    completeAuditIn('run-q1', 10, 'Q1');
    completeAuditIn('run-q2', 7, 'Q2');
    completeAuditIn('run-q3', 12, 'Q3');

    const hours = await Promise.all(
      ['run-q1', 'run-q2', 'run-q3'].map(async (runId) => {
        const s = await buildSummary('leader-1', runId);
        return s.rows.find((r) => r.token === 'deep_work')?.current;
      })
    );

    // The series F9's trend lines will plot. It reads as a series at all only because of this fix.
    expect(hours).toEqual([10, 7, 12]);
  });
});
