/**
 * `buildClientExport`'s `reachOuts` field (F18 t-2), added this branch alongside the existing
 * `EXPORTED_SOURCES` completeness check in `export.test.ts`. That file only pins the static
 * source-table list; `buildClientExport` itself has no behavioural coverage, and this file's job
 * is narrowly the one field this branch touches — not the rest of the function.
 *
 * Two things the comment above the `reclaimReachOut.findMany` query in `export.ts` calls out on
 * purpose:
 *   - the message is included in full, body and all — a subject-access request reaches what was
 *     written *to* the leader, not just what they said;
 *   - `sentByUserId` is deliberately not selected — the operator who wrote it is a fact about that
 *     operator, not about the subject whose export this is.
 *
 * Every other `Promise.all` branch is mocked with the minimal shape needed for the function to
 * complete; only `reachOuts` is asserted on.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  runFindMany: vi.fn(),
  grantFindMany: vi.fn(),
  inviteFindMany: vi.fn(),
  consentFindMany: vi.fn(),
  bucketLabelFindMany: vi.fn(),
  shareFindMany: vi.fn(),
  reportShareFindMany: vi.fn(),
  feedbackFindMany: vi.fn(),
  nudgeFindUnique: vi.fn(),
  inviteLinkFindMany: vi.fn(),
  reachOutFindMany: vi.fn(),
  getSlotHeads: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    reclaimAuditRun: { findMany: mocks.runFindMany },
    reclaimGrant: { findMany: mocks.grantFindMany },
    reclaimInvite: { findMany: mocks.inviteFindMany },
    reclaimConsent: { findMany: mocks.consentFindMany },
    reclaimBucketLabel: { findMany: mocks.bucketLabelFindMany },
    reclaimShare: { findMany: mocks.shareFindMany },
    reclaimReportShare: { findMany: mocks.reportShareFindMany },
    reclaimFeedback: { findMany: mocks.feedbackFindMany },
    reclaimNudge: { findUnique: mocks.nudgeFindUnique },
    reclaimInviteLink: { findMany: mocks.inviteLinkFindMany },
    reclaimReachOut: { findMany: mocks.reachOutFindMany },
  },
}));

vi.mock('@/lib/framework/data-slots/values', () => ({ getSlotHeads: mocks.getSlotHeads }));

import { buildClientExport } from '@/lib/app/programme/admin/export';

const USER_ID = 'clxxxxxxxxxxxxxxxxxxxxxxxx';

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();

  mocks.userFindUnique.mockResolvedValue({
    id: USER_ID,
    name: 'Ada',
    email: 'ada@example.com',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  });
  mocks.runFindMany.mockResolvedValue([]);
  mocks.grantFindMany.mockResolvedValue([]);
  mocks.inviteFindMany.mockResolvedValue([]);
  mocks.consentFindMany.mockResolvedValue([]);
  mocks.bucketLabelFindMany.mockResolvedValue([]);
  mocks.shareFindMany.mockResolvedValue([]);
  mocks.reportShareFindMany.mockResolvedValue([]);
  mocks.feedbackFindMany.mockResolvedValue([]);
  mocks.nudgeFindUnique.mockResolvedValue(null);
  mocks.inviteLinkFindMany.mockResolvedValue([]);
  mocks.reachOutFindMany.mockResolvedValue([]);
  mocks.getSlotHeads.mockResolvedValue([]);
});

describe('buildClientExport — reachOuts', () => {
  it('includes a message sent to the subject, in full, without the operator who sent it', async () => {
    // Shaped exactly like the query's own `select` — the fields it names, and nothing else. In
    // particular no `sentByUserId` and no `userId`: a real Prisma call with this `select` could
    // never hand those back, so the mock does not offer them either.
    mocks.reachOutFindMany.mockResolvedValue([
      {
        id: 'reach-1',
        auditRunId: 'run-42',
        subject: 'Checking in',
        body: "How's the change going, Ada?",
        status: 'sent',
        createdAt: new Date('2026-01-05T10:00:00.000Z'),
      },
    ]);

    const result = await buildClientExport(USER_ID);

    expect(result).not.toBeNull();
    // The sender is excluded on purpose (see the comment above the query) — the raw object the
    // function hands back must not carry it either.
    expect(result?.reachOuts[0]).not.toHaveProperty('sentByUserId');
    expect(result?.reachOuts[0]).not.toHaveProperty('userId');

    // Round-tripped through JSON — the shape an admin actually receives at the export route,
    // where `successResponse` serialises the record. This is where `createdAt` becomes the ISO
    // string a downstream reader sees.
    const serialised = JSON.parse(JSON.stringify(result?.reachOuts));
    expect(serialised).toEqual([
      {
        id: 'reach-1',
        auditRunId: 'run-42',
        subject: 'Checking in',
        body: "How's the change going, Ada?",
        status: 'sent',
        createdAt: '2026-01-05T10:00:00.000Z',
      },
    ]);
  });

  it('reports an empty array, not null or undefined, when nobody has ever been reached out to', async () => {
    mocks.reachOutFindMany.mockResolvedValue([]);

    const result = await buildClientExport(USER_ID);

    expect(result?.reachOuts).toEqual([]);
    expect(Array.isArray(result?.reachOuts)).toBe(true);
  });
});
