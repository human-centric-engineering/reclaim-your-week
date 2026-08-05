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
  reportUpdateMany,
  feedbackFindFirst,
  feedbackCreate,
  feedbackUpdate,
} = vi.hoisted(() => ({
  shareUpsert: vi.fn(),
  shareFindUnique: vi.fn(),
  reportUpsert: vi.fn(),
  reportUpdateMany: vi.fn(),
  feedbackFindFirst: vi.fn(),
  feedbackCreate: vi.fn(),
  feedbackUpdate: vi.fn(),
}));
vi.mock('@/lib/db/client', () => ({
  prisma: {
    reclaimShare: { upsert: shareUpsert, findUnique: shareFindUnique },
    reclaimReportShare: { upsert: reportUpsert, updateMany: reportUpdateMany },
    reclaimFeedback: {
      findFirst: feedbackFindFirst,
      create: feedbackCreate,
      update: feedbackUpdate,
    },
  },
}));

import { createShare } from '@/lib/app/programme/share';

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
  reportUpdateMany.mockReset().mockResolvedValue({ count: 0 });
  feedbackFindFirst.mockReset().mockResolvedValue(null);
  feedbackCreate.mockReset().mockResolvedValue(undefined);
  feedbackUpdate.mockReset().mockResolvedValue(undefined);
});

describe('createShare', () => {
  /**
   * The public link is gone, and this is the assertion that keeps it gone.
   *
   * A leader used to be able to mint an unguessable, **unrevokable** token that served the most
   * personal document this product makes from a URL with no session behind it. Removing the UI would
   * not have been enough — the mint lived here, and a route or a script could still have called it.
   * `ReclaimShare` is untouched by this module now, and the table survives only so a leader who
   * minted a link before the change can still see that they did, in their data export.
   */
  it('never touches the public share table, whatever it is asked for', async () => {
    await createShare('u1', 'run-1', {
      withCoach: true,
      shareTranscript: true,
      takeaway: 'A clearer week.',
      quotable: true,
    });
    expect(shareUpsert).not.toHaveBeenCalled();
    expect(shareFindUnique).not.toHaveBeenCalled();
  });

  it('reports back whether the report is now shared with the coach', async () => {
    await expect(createShare('u1', 'run-1', { withCoach: true })).resolves.toEqual({
      sharedWithCoach: true,
    });
    expect(reportUpsert).toHaveBeenCalled();
  });

  it('reports back a run that was saved without being shared', async () => {
    await expect(createShare('u1', 'run-1', { withCoach: false })).resolves.toEqual({
      sharedWithCoach: false,
    });
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
      create: { userId: 'u1', auditRunId: 'run-1', transcriptConsent: false },
      // F17: `update` is no longer empty. The share token must not be regenerated on a re-save, but
      // a consent must be changeable on one or it cannot be withdrawn, so every save restates the
      // leader's current answer — including "no".
      update: { transcriptConsent: false },
    });
  });

  describe('transcript consent (F17)', () => {
    it('records it when the leader says the conversation may be read', async () => {
      await createShare('u1', 'run-1', { withCoach: true, shareTranscript: true });
      expect(reportUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: { userId: 'u1', auditRunId: 'run-1', transcriptConsent: true },
          update: { transcriptConsent: true },
        })
      );
    });

    it('withdraws it when they untick it on a later save', async () => {
      await createShare('u1', 'run-1', { withCoach: true, shareTranscript: false });
      expect(reportUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: { transcriptConsent: false } })
      );
    });

    it('withdraws it when they stop sharing the results at all', async () => {
      // Sharing the exchange but not the summary it produced is a state nobody asked for.
      await createShare('u1', 'run-1', { withCoach: false, shareTranscript: true });
      expect(reportUpdateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', auditRunId: 'run-1', transcriptConsent: true },
        data: { transcriptConsent: false },
      });
      expect(reportUpsert).not.toHaveBeenCalled();
    });

    it('leaves it alone when the request never mentions coach sharing', async () => {
      // A save that only records the feedback line must not revoke a consent nobody touched, and
      // must not put a write on the database to discover that.
      await createShare('u1', 'run-1', { takeaway: 'A clearer week.' });
      expect(reportUpdateMany).not.toHaveBeenCalled();
      expect(reportUpsert).not.toHaveBeenCalled();
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
