/**
 * The Phase 6 share (F7 t-4). Prisma mocked. Load-bearing: a public link mints an unguessable token
 * (reusing an existing one), coach-share and feedback are created only when chosen, and quote consent
 * is captured **separately** from sharing. Resolving a token returns its run, or null.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const {
  shareUpsert,
  shareFindUnique,
  reportUpsert,
  feedbackFindFirst,
  feedbackCreate,
  feedbackUpdate,
} = vi.hoisted(() => ({
  shareUpsert: vi.fn(),
  shareFindUnique: vi.fn(),
  reportUpsert: vi.fn(),
  feedbackFindFirst: vi.fn(),
  feedbackCreate: vi.fn(),
  feedbackUpdate: vi.fn(),
}));
vi.mock('@/lib/db/client', () => ({
  prisma: {
    reclaimShare: { upsert: shareUpsert, findUnique: shareFindUnique },
    reclaimReportShare: { upsert: reportUpsert },
    reclaimFeedback: {
      findFirst: feedbackFindFirst,
      create: feedbackCreate,
      update: feedbackUpdate,
    },
  },
}));

import { createShare, resolveShareToken } from '@/lib/app/programme/share';

beforeEach(() => {
  // The upsert returns whatever row ends up in the table — either the one it created or the one that
  // was already there. Default: it created a fresh row carrying the token it was handed.
  shareUpsert
    .mockReset()
    .mockImplementation((args: { create: { token: string } }) =>
      Promise.resolve({ token: args.create.token })
    );
  shareFindUnique.mockReset();
  reportUpsert.mockReset().mockResolvedValue(undefined);
  feedbackFindFirst.mockReset().mockResolvedValue(null);
  feedbackCreate.mockReset().mockResolvedValue(undefined);
  feedbackUpdate.mockReset().mockResolvedValue(undefined);
});

describe('createShare', () => {
  it('mints a new unguessable public token when a link is requested', async () => {
    const { token } = await createShare('u1', 'run-1', { publicLink: true });
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    // F10 t-1 gave both share tables a unique constraint, so idempotency is the database's job now
    // rather than a findFirst that races itself (plan D8). `update: {}` is what keeps an already-sent
    // link alive: touching the row must not rotate its token.
    expect(shareUpsert).toHaveBeenCalledWith({
      where: { userId_auditRunId: { userId: 'u1', auditRunId: 'run-1' } },
      create: { userId: 'u1', auditRunId: 'run-1', token },
      update: {},
      select: { token: true },
    });
  });

  it('reuses an existing token rather than minting a second link', async () => {
    shareUpsert.mockResolvedValue({ token: 'existing-token' });
    const { token } = await createShare('u1', 'run-1', { publicLink: true });
    expect(token).toBe('existing-token');
  });

  it('does not mint a token when no public link was requested', async () => {
    const { token } = await createShare('u1', 'run-1', { withCoach: true });
    expect(token).toBeNull();
    expect(reportUpsert).toHaveBeenCalled();
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

  it('creates the coach-share at most once per run — the inbox counts these rows', async () => {
    await createShare('u1', 'run-1', { withCoach: true });
    expect(reportUpsert).toHaveBeenCalledWith({
      where: { userId_auditRunId: { userId: 'u1', auditRunId: 'run-1' } },
      create: { userId: 'u1', auditRunId: 'run-1' },
      update: {},
    });
  });

  it('updates the existing feedback in place rather than appending a second row', async () => {
    feedbackFindFirst.mockResolvedValue({ id: 'existing-feedback' });
    await createShare('u1', 'run-1', { takeaway: 'An edited takeaway.', quotable: false });
    expect(feedbackCreate).not.toHaveBeenCalled();
    expect(feedbackUpdate).toHaveBeenCalledWith({
      where: { id: 'existing-feedback' },
      data: {
        userId: 'u1',
        auditRunId: 'run-1',
        text: 'An edited takeaway.',
        quoteConsent: false,
      },
    });
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
