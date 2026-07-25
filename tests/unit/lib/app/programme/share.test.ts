/**
 * The Phase 6 share (F7 t-4). Prisma mocked. Load-bearing: a public link mints an unguessable token
 * (reusing an existing one), coach-share and feedback are created only when chosen, and quote consent
 * is captured **separately** from sharing. Resolving a token returns its run, or null.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { shareFindFirst, shareCreate, shareFindUnique, reportCreate, feedbackCreate } = vi.hoisted(
  () => ({
    shareFindFirst: vi.fn(),
    shareCreate: vi.fn(),
    shareFindUnique: vi.fn(),
    reportCreate: vi.fn(),
    feedbackCreate: vi.fn(),
  })
);
vi.mock('@/lib/db/client', () => ({
  prisma: {
    reclaimShare: { findFirst: shareFindFirst, create: shareCreate, findUnique: shareFindUnique },
    reclaimReportShare: { create: reportCreate },
    reclaimFeedback: { create: feedbackCreate },
  },
}));

import { createShare, resolveShareToken } from '@/lib/app/programme/share';

beforeEach(() => {
  shareFindFirst.mockReset().mockResolvedValue(null);
  shareCreate.mockReset().mockResolvedValue(undefined);
  shareFindUnique.mockReset();
  reportCreate.mockReset().mockResolvedValue(undefined);
  feedbackCreate.mockReset().mockResolvedValue(undefined);
});

describe('createShare', () => {
  it('mints a new unguessable public token when a link is requested', async () => {
    const { token } = await createShare('u1', 'run-1', { publicLink: true });
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(shareCreate).toHaveBeenCalledWith({
      data: { userId: 'u1', auditRunId: 'run-1', token },
    });
  });

  it('reuses an existing token rather than minting a second link', async () => {
    shareFindFirst.mockResolvedValue({ token: 'existing-token' });
    const { token } = await createShare('u1', 'run-1', { publicLink: true });
    expect(token).toBe('existing-token');
    expect(shareCreate).not.toHaveBeenCalled();
  });

  it('does not mint a token when no public link was requested', async () => {
    const { token } = await createShare('u1', 'run-1', { withCoach: true });
    expect(token).toBeNull();
    expect(reportCreate).toHaveBeenCalled();
  });

  it('records feedback with the SEPARATE quote consent (not implied by sharing)', async () => {
    await createShare('u1', 'run-1', { takeaway: 'A clearer week.', quotable: true });
    expect(feedbackCreate).toHaveBeenCalledWith({
      data: { userId: 'u1', auditRunId: 'run-1', text: 'A clearer week.', quoteConsent: true },
    });
  });

  it('does not record feedback for an empty takeaway', async () => {
    await createShare('u1', 'run-1', { quotable: true });
    expect(feedbackCreate).not.toHaveBeenCalled();
  });
});

describe('resolveShareToken', () => {
  it('returns the run for a known token', async () => {
    shareFindUnique.mockResolvedValue({ userId: 'u1', auditRunId: 'run-1' });
    expect(await resolveShareToken('tok')).toEqual({ userId: 'u1', runId: 'run-1' });
  });

  it('returns null for an unknown token', async () => {
    shareFindUnique.mockResolvedValue(null);
    expect(await resolveShareToken('nope')).toBeNull();
  });
});
