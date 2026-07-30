/**
 * F19 — the exclusion, at the query. Prisma is mocked; these assert the `where` each reader builds.
 *
 * `preview-exclusion.test.ts` (in `tests/unit/invariants/`) holds the *set* of readers to account, so a
 * sixth counting query cannot appear unclassified. This file is the other half: that the three counting
 * readers actually narrow their queries, and that the two operator readers actually do not.
 *
 * Asserting the `where` rather than the returned rows is deliberate here. The rows these functions
 * return are computed by pure functions that already have their own tests; what F19 changes is which
 * rows are fetched, and the difference between "filtered" and "fetched then labelled" is invisible in
 * the output when the fixture has no preview accounts in it — which is the case that must stay cheap.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  previewFindMany: vi.fn(),
  consentFindMany: vi.fn(),
  runFindMany: vi.fn(),
  inviteFindMany: vi.fn(),
  grantFindMany: vi.fn(),
  userFindMany: vi.fn(),
  nudgeFindMany: vi.fn(),
  shareFindMany: vi.fn(),
  feedbackFindMany: vi.fn(),
  nudgeFindUnique: vi.fn(),
  nudgeCreate: vi.fn(),
  nudgeUpdateMany: vi.fn(),
  moduleFindUnique: vi.fn(),
  getSlotHeads: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  prisma: {
    reclaimPreviewAccount: { findMany: mocks.previewFindMany },
    reclaimConsent: { findMany: mocks.consentFindMany },
    reclaimAuditRun: { findMany: mocks.runFindMany },
    reclaimInvite: { findMany: mocks.inviteFindMany },
    reclaimReportShare: { findMany: mocks.shareFindMany },
    reclaimFeedback: { findMany: mocks.feedbackFindMany },
    reclaimGrant: { findMany: mocks.grantFindMany },
    reclaimNudge: {
      findMany: mocks.nudgeFindMany,
      findUnique: mocks.nudgeFindUnique,
      create: mocks.nudgeCreate,
      updateMany: mocks.nudgeUpdateMany,
    },
    user: { findMany: mocks.userFindMany },
    module: { findUnique: mocks.moduleFindUnique },
  },
}));
vi.mock('@/lib/framework/data-slots/values', () => ({ getSlotHeads: mocks.getSlotHeads }));
vi.mock('@/lib/email/send', () => ({ sendEmail: mocks.sendEmail }));

import { readAggregate } from '@/lib/app/programme/admin/aggregate';
import { readMeasures } from '@/lib/app/programme/admin/measures';
import { runNudgeTick } from '@/lib/app/programme/nudges/tick';

const PREVIEW = 'preview-user-1';

/** Every `where` a mock was called with, so an assertion can look for the filter wherever it landed. */
const wheres = (mock: { mock: { calls: unknown[][] } }): unknown[] =>
  mock.mock.calls.map((c) => (c[0] as { where?: unknown } | undefined)?.where);

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.previewFindMany.mockResolvedValue([{ userId: PREVIEW }]);
  mocks.consentFindMany.mockResolvedValue([]);
  mocks.runFindMany.mockResolvedValue([]);
  mocks.inviteFindMany.mockResolvedValue([]);
  mocks.grantFindMany.mockResolvedValue([]);
  mocks.userFindMany.mockResolvedValue([]);
  mocks.nudgeFindMany.mockResolvedValue([]);
  mocks.shareFindMany.mockResolvedValue([]);
  mocks.feedbackFindMany.mockResolvedValue([]);
  mocks.nudgeFindUnique.mockResolvedValue(null);
  mocks.nudgeCreate.mockResolvedValue({ token: 'a'.repeat(64) });
  mocks.nudgeUpdateMany.mockResolvedValue({ count: 1 });
  mocks.moduleFindUnique.mockResolvedValue({ config: {} });
  mocks.getSlotHeads.mockResolvedValue([]);
  mocks.sendEmail.mockResolvedValue({ success: true, status: 'sent' });
});

describe('readAggregate — the k-anonymity cohort', () => {
  it('excludes test accounts from the query that defines the population', async () => {
    await readAggregate();

    // The consent read IS the cohort — everything downstream is scoped to its result — so this single
    // `where` is the whole exclusion for this surface.
    expect(wheres(mocks.consentFindMany)[0]).toEqual({
      userId: { not: null, notIn: [PREVIEW] },
    });
  });

  it('keeps the existing userId-not-null condition rather than replacing it', async () => {
    // De-attributed consent rows (erasure sets `userId` null, retaining the lawful-basis proof) must
    // stay out. Losing that while adding the new filter would silently widen the cohort.
    await readAggregate();

    const where = wheres(mocks.consentFindMany)[0] as { userId: { not: null } };
    expect(where.userId.not).toBeNull();
  });

  it('emits no filter at all when no test account exists', async () => {
    mocks.previewFindMany.mockResolvedValue([]);

    await readAggregate();

    // `undefined`, not `{ notIn: [] }` — the SQL an untouched install emits must be unchanged.
    expect(wheres(mocks.consentFindMany)[0]).toEqual({ userId: { not: null } });
  });
});

describe('readMeasures — the published counts', () => {
  it('excludes test accounts from all four counting queries', async () => {
    await readMeasures();

    expect(wheres(mocks.runFindMany)).toEqual([
      { status: 'complete', userId: { notIn: [PREVIEW] } },
      { userId: { notIn: [PREVIEW] } },
    ]);
    expect(wheres(mocks.grantFindMany)[0]).toEqual({ userId: { notIn: [PREVIEW] } });
  });

  it('excludes a test account’s referrals from word of mouth', async () => {
    // A test account exercising the referral form would otherwise inflate the one measure here that is
    // about other people's enthusiasm. Filtered on the sender, which is what a referral is keyed by.
    await readMeasures();

    expect(wheres(mocks.inviteFindMany)[0]).toEqual({
      invitedByUserId: { not: null, notIn: [PREVIEW] },
    });
  });

  it('emits no filter when no test account exists', async () => {
    mocks.previewFindMany.mockResolvedValue([]);

    await readMeasures();

    expect(wheres(mocks.runFindMany)).toEqual([
      { status: 'complete', userId: undefined },
      { userId: undefined },
    ]);
  });
});

describe('the quarterly nudge — the surface that spends real deliverability', () => {
  it('never sends to a test account, because it never gathers one', async () => {
    // The filter is on the run query, not the later `user` read, so a preview account never reaches
    // `userIds` at all — and therefore never gets an `app_reclaim_nudge` row written against it
    // either. A fabricated completed audit must not put a real email in flight.
    await runNudgeTick();

    expect(wheres(mocks.runFindMany)[0]).toEqual({
      status: 'complete',
      userId: { notIn: [PREVIEW] },
    });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it('still sends to a real leader who is due', async () => {
    // The counterweight: an exclusion that quietly stopped every nudge would pass the test above.
    const NOW = Date.now();
    const daysAgo = (n: number) => new Date(NOW - n * 86_400_000);
    mocks.previewFindMany.mockResolvedValue([]);
    mocks.runFindMany.mockImplementation((args: { where: { status: string } }) =>
      Promise.resolve(
        args.where.status === 'complete'
          ? [{ id: 'run-1', userId: 'real-1', completedAt: daysAgo(100), startedAt: daysAgo(120) }]
          : []
      )
    );
    mocks.userFindMany.mockResolvedValue([{ id: 'real-1', email: 'ada@example.com', name: 'Ada' }]);

    const result = await runNudgeTick();

    expect(result.sent).toBeGreaterThan(0);
  });
});

/**
 * The other side of the rule: the operator's own screens keep showing test accounts.
 *
 * These are separate from the exclusion tests above because they assert the opposite thing, and the
 * temptation when tidying is to make all five surfaces consistent. They must not be. An operator who
 * cannot see a test account cannot remove it, and one that vanished from her screens while still
 * sitting in the database would leave the totals disagreeing with nothing visible to explain it.
 */
describe('the operator surfaces badge rather than exclude', () => {
  it('listSharedResults marks a share from a test account and still returns it', async () => {
    const { listSharedResults } = await import('@/lib/app/programme/admin/inbox');
    mocks.previewFindMany.mockResolvedValue([{ userId: PREVIEW }]);
    mocks.shareFindMany.mockResolvedValue([
      {
        userId: PREVIEW,
        auditRunId: 'run-1',
        createdAt: new Date('2026-07-20'),
        transcriptConsent: false,
      },
      {
        userId: 'real-1',
        auditRunId: 'run-2',
        createdAt: new Date('2026-07-21'),
        transcriptConsent: false,
      },
    ]);
    mocks.userFindMany.mockResolvedValue([
      { id: PREVIEW, name: 'Test Leader', email: 'test@example.com' },
      { id: 'real-1', name: 'Ada', email: 'ada@example.com' },
    ]);
    mocks.runFindMany.mockResolvedValue([
      { id: 'run-1', quarter: '2026 Q3' },
      { id: 'run-2', quarter: '2026 Q3' },
    ]);
    mocks.feedbackFindMany.mockResolvedValue([]);

    const shared = await listSharedResults();

    // Both present. The badge is the only difference.
    expect(shared).toHaveLength(2);
    expect(shared.find((s) => s.userId === PREVIEW)?.isPreview).toBe(true);
    expect(shared.find((s) => s.userId === 'real-1')?.isPreview).toBe(false);
  });
});
