/**
 * The shared-results inbox (F10 t-3, `transcriptConsent` added F17). Prisma is mocked; the
 * assertions are about the **joins**, not about the mocks returning what they were handed.
 *
 * Two things are load-bearing:
 *   - a share whose user has been erased renders as nothing rather than as "unknown leader shared a
 *     result" — the defensive branch `listSharedResults` itself calls out;
 *   - `transcriptConsent` reaches the row from the share, verbatim, in both directions. Without it an
 *     operator cannot tell a leader who said no to the transcript from one who was never asked, and
 *     the two read identically on screen.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  shareFindMany: vi.fn(),
  userFindMany: vi.fn(),
  runFindMany: vi.fn(),
  feedbackFindMany: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  prisma: {
    reclaimReportShare: { findMany: mocks.shareFindMany },
    user: { findMany: mocks.userFindMany },
    reclaimAuditRun: { findMany: mocks.runFindMany },
    reclaimFeedback: { findMany: mocks.feedbackFindMany },
  },
}));

import { listSharedResults } from '@/lib/app/programme/admin/inbox';

function share(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    userId: 'ada',
    auditRunId: 'run-1',
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    transcriptConsent: false,
    ...overrides,
  };
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.userFindMany.mockResolvedValue([{ id: 'ada', name: 'Ada', email: 'ada@example.com' }]);
  mocks.runFindMany.mockResolvedValue([{ id: 'run-1', quarter: '2026-Q3' }]);
  mocks.feedbackFindMany.mockResolvedValue([]);
});

describe('listSharedResults', () => {
  it('returns nothing for no shares, with no further queries', async () => {
    mocks.shareFindMany.mockResolvedValue([]);

    const result = await listSharedResults();

    expect(result).toEqual([]);
    expect(mocks.userFindMany).not.toHaveBeenCalled();
  });

  it('carries transcriptConsent through verbatim, true and false alike', async () => {
    mocks.shareFindMany.mockResolvedValue([
      share({ userId: 'ada', transcriptConsent: true }),
      share({ userId: 'ben', auditRunId: 'run-2', transcriptConsent: false }),
    ]);
    mocks.userFindMany.mockResolvedValue([
      { id: 'ada', name: 'Ada', email: 'ada@example.com' },
      { id: 'ben', name: 'Ben', email: 'ben@example.com' },
    ]);
    mocks.runFindMany.mockResolvedValue([
      { id: 'run-1', quarter: '2026-Q3' },
      { id: 'run-2', quarter: '2026-Q2' },
    ]);

    const result = await listSharedResults();

    expect(result.find((r) => r.userId === 'ada')?.transcriptConsent).toBe(true);
    expect(result.find((r) => r.userId === 'ben')?.transcriptConsent).toBe(false);
  });

  it('drops a share whose leader has been erased, rather than rendering an unknown row', async () => {
    mocks.shareFindMany.mockResolvedValue([share({ userId: 'gone' })]);
    mocks.userFindMany.mockResolvedValue([]); // erasure cascaded the user away

    const result = await listSharedResults();

    expect(result).toEqual([]);
  });

  it('keeps quoteConsent separate from having shared at all', async () => {
    mocks.shareFindMany.mockResolvedValue([share()]);
    mocks.feedbackFindMany.mockResolvedValue([
      { auditRunId: 'run-1', text: 'Useful.', quoteConsent: false },
    ]);

    const result = await listSharedResults();

    expect(result[0]?.feedback).toEqual({ text: 'Useful.', quoteConsent: false });
  });

  it('reports no feedback as null rather than an empty string', async () => {
    mocks.shareFindMany.mockResolvedValue([share()]);
    mocks.feedbackFindMany.mockResolvedValue([]);

    const result = await listSharedResults();

    expect(result[0]?.feedback).toBeNull();
  });
});
