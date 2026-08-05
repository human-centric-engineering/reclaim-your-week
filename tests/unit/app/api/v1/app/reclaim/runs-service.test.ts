/**
 * `abandonRun`, `completeRun`'s completion email, and `ensureReportReading` — three F14/F15/F16
 * functions in `runs/service.ts` that carry real behavioural rules and, until now, no test that
 * exercises them at runtime.
 *
 * `tests/unit/invariants/conversation-close.test.ts` (I15) already proves, by reading the source,
 * that `abandonRun` and `completeRun` both *mention* `closeSurfaceConversation`. That is a shape
 * check — it would pass even if the call were commented out and the invariant regex matched a
 * stale reference. This file proves the runtime behaviour: with Prisma mocked, does calling
 * `abandonRun` actually flip `isActive` on the right conversation row.
 *
 * The route tests beside this file (`runs-transition.route.test.ts` etc.) mock the whole service
 * module away, which is correct for a route test and leaves the service itself unexercised. These
 * tests mock Prisma and the service's collaborators instead, and call the exported functions
 * directly — the same idiom `runs-list-and-read.test.ts` and `record-phase-mark.test.ts` use.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { ValidationError, NotFoundError } from '@/lib/api/errors';

const mocks = vi.hoisted(() => ({
  runFindFirst: vi.fn(),
  runUpdate: vi.fn(),
  runUpdateMany: vi.fn(),
  conversationUpdateMany: vi.fn(),
  userFindUnique: vi.fn(),
  completeFinalPhase: vi.fn(),
  assertEntitled: vi.fn(),
  consumeAudit: vi.fn(),
  grantReferralUnlock: vi.fn(),
  emitReclaimAccessEvent: vi.fn(),
  readRunAnswers: vi.fn(),
  readBucketLabels: vi.fn(),
  buildReportBrief: vi.fn(),
  runReport: vi.fn(),
  sendEmail: vi.fn(),
  auditCompleteEmail: vi.fn(),
  loggerWarn: vi.fn(),
  loggerInfo: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  prisma: {
    reclaimAuditRun: {
      findFirst: mocks.runFindFirst,
      update: mocks.runUpdate,
      updateMany: mocks.runUpdateMany,
    },
    aiConversation: { updateMany: mocks.conversationUpdateMany },
    user: { findUnique: mocks.userFindUnique },
  },
}));

vi.mock('@/lib/logging', () => ({
  logger: { info: mocks.loggerInfo, warn: mocks.loggerWarn, error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/app/programme/runs/journey', () => ({
  completeFinalPhase: mocks.completeFinalPhase,
  advancePhase: vi.fn(),
  enterFirstPhase: vi.fn(),
  emptyPhaseProgress: vi.fn(),
  loadPhaseProgress: vi.fn(),
}));

vi.mock('@/lib/app/programme/runs/entitlement', () => ({
  assertEntitled: mocks.assertEntitled,
  consumeAudit: mocks.consumeAudit,
}));

vi.mock('@/lib/app/programme/access/referrals', () => ({
  grantReferralUnlock: mocks.grantReferralUnlock,
}));

vi.mock('@/lib/app/programme/access/events', () => ({
  emitReclaimAccessEvent: mocks.emitReclaimAccessEvent,
}));

vi.mock('@/lib/app/programme/runs/answers', () => ({
  readRunAnswers: mocks.readRunAnswers,
}));

vi.mock('@/lib/app/programme/buckets/labels', () => ({
  readBucketLabels: mocks.readBucketLabels,
}));

vi.mock('@/lib/app/programme/report/brief', () => ({
  buildReportBrief: mocks.buildReportBrief,
}));

vi.mock('@/lib/app/programme/report/reading', () => ({
  runReport: mocks.runReport,
}));

vi.mock('@/lib/email/send', () => ({
  sendEmail: mocks.sendEmail,
}));

vi.mock('@/components/app/emails/audit-complete', () => ({
  default: mocks.auditCompleteEmail,
}));

import {
  abandonRun,
  completeRun,
  ensureReportReading,
} from '@/app/api/v1/app/reclaim/runs/service';
import { MODULE_SURFACE_CONTEXT_TYPE } from '@/lib/framework/guidance/surface';
import { RECLAIM_MODULE_SLUG } from '@/lib/app/programme/module';

const USER_ID = 'user-1';
const RUN_ID = 'run-1';

/** A run row as Prisma returns it, shaped for whichever function is reading it. */
const runRow = (over: Record<string, unknown> = {}) => ({
  id: RUN_ID,
  userId: USER_ID,
  status: 'in_progress',
  analystReading: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.runUpdate.mockResolvedValue(runRow({ status: 'complete' }));
  mocks.runUpdateMany.mockResolvedValue({ count: 1 });
  mocks.conversationUpdateMany.mockResolvedValue({ count: 1 });
  mocks.completeFinalPhase.mockResolvedValue(undefined);
  mocks.consumeAudit.mockResolvedValue(undefined);
  mocks.grantReferralUnlock.mockResolvedValue(undefined);
  mocks.userFindUnique.mockResolvedValue({ email: 'leader@example.com', name: 'Sam Patel' });
  mocks.readRunAnswers.mockResolvedValue({});
  mocks.readBucketLabels.mockResolvedValue({});
  mocks.buildReportBrief.mockReturnValue({ usable: true });
  mocks.runReport.mockResolvedValue(null);
  mocks.sendEmail.mockResolvedValue({ success: true, status: 'sent' });
  mocks.auditCompleteEmail.mockImplementation((props: unknown) => props);
});

describe('abandonRun', () => {
  it('sets abandonedAt and does not touch completedAt', async () => {
    mocks.runFindFirst.mockResolvedValue(runRow({ status: 'in_progress' }));
    mocks.runUpdate.mockResolvedValue(runRow({ status: 'abandoned', abandonedAt: new Date() }));

    await abandonRun(USER_ID, RUN_ID);

    // Exact-object match: a `completedAt` key sneaking into this write would fail this assertion,
    // not merely go unnoticed. `listRuns`, the nudge tick and the completion timeline all treat
    // `completedAt` as "this audit finished".
    expect(mocks.runUpdate).toHaveBeenCalledWith({
      where: { id: RUN_ID },
      data: { status: 'abandoned', abandonedAt: expect.any(Date) },
    });
  });

  it('is idempotent on an already-abandoned run: returns it unchanged, writes nothing', async () => {
    const alreadyAbandoned = runRow({ status: 'abandoned', abandonedAt: new Date('2026-01-01') });
    mocks.runFindFirst.mockResolvedValue(alreadyAbandoned);

    const result = await abandonRun(USER_ID, RUN_ID);

    expect(result).toBe(alreadyAbandoned);
    expect(mocks.runUpdate).not.toHaveBeenCalled();
    expect(mocks.conversationUpdateMany).not.toHaveBeenCalled();
  });

  it('refuses a completed run — you cannot let go of something you finished', async () => {
    mocks.runFindFirst.mockResolvedValue(runRow({ status: 'complete' }));

    await expect(abandonRun(USER_ID, RUN_ID)).rejects.toThrow(ValidationError);
    await expect(abandonRun(USER_ID, RUN_ID)).rejects.toThrow('That audit is already finished');
    expect(mocks.runUpdate).not.toHaveBeenCalled();
  });

  it('closes the surface conversation scoped to this user (I15)', async () => {
    mocks.runFindFirst.mockResolvedValue(runRow({ status: 'in_progress' }));

    await abandonRun(USER_ID, RUN_ID);

    expect(mocks.conversationUpdateMany).toHaveBeenCalledWith({
      where: {
        userId: USER_ID,
        contextType: MODULE_SURFACE_CONTEXT_TYPE,
        contextId: RECLAIM_MODULE_SLUG,
        isActive: true,
      },
      data: { isActive: false },
    });
  });

  it('honours loadOwnedRun: a run belonging to another user is not abandonable', async () => {
    // loadOwnedRun scopes the read by userId as well as id; a row that is not this caller's comes
    // back as no row at all, which is a 404 rather than a write.
    mocks.runFindFirst.mockResolvedValue(null);

    await expect(abandonRun(USER_ID, RUN_ID)).rejects.toThrow(NotFoundError);
    expect(mocks.runFindFirst).toHaveBeenCalledWith({ where: { id: RUN_ID, userId: USER_ID } });
    expect(mocks.runUpdate).not.toHaveBeenCalled();
    expect(mocks.conversationUpdateMany).not.toHaveBeenCalled();
  });
});

describe('completeRun — the completion email (sendCompletionEmail, private)', () => {
  beforeEach(() => {
    // completeRun always reaches ensureReportReading before the email. Keep it a fast no-op here
    // by pre-seeding a non-null reading, so these tests are only about the email.
    mocks.runFindFirst.mockResolvedValue(runRow({ status: 'in_progress', analystReading: 'x' }));
  });

  it('sends to the leader with an AuditCompleteEmail element', async () => {
    await completeRun(USER_ID, RUN_ID);

    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'leader@example.com',
        subject: 'Your time audit is finished',
      })
    );
    // The react element is whatever AuditCompleteEmail returned — proves the route wired the
    // mocked component's output into sendEmail rather than something else.
    expect(mocks.auditCompleteEmail).toHaveBeenCalledTimes(1);
    const sentReact = mocks.sendEmail.mock.calls[0][0].react;
    expect(sentReact).toBe(mocks.auditCompleteEmail.mock.results[0].value);
  });

  it("prefers the audit's own first name over the account name, truncated to one word", async () => {
    mocks.readRunAnswers.mockResolvedValue({
      reclaim_profile_first_name: {
        value: 'Jordan Lee',
        valueJson: null,
        sourceType: 'direct',
        confidence: 10,
      },
    });

    await completeRun(USER_ID, RUN_ID);

    expect(mocks.auditCompleteEmail).toHaveBeenCalledWith(
      expect.objectContaining({ firstName: 'Jordan' })
    );
  });

  it('falls back to the account name, also truncated to one word, when the audit has none', async () => {
    mocks.readRunAnswers.mockResolvedValue({});
    mocks.userFindUnique.mockResolvedValue({ email: 'leader@example.com', name: 'Sam Patel' });

    await completeRun(USER_ID, RUN_ID);

    expect(mocks.auditCompleteEmail).toHaveBeenCalledWith(
      expect.objectContaining({ firstName: 'Sam' })
    );
  });

  it('never blocks completeRun: a rejected sendEmail still returns the completed run', async () => {
    mocks.sendEmail.mockRejectedValue(new Error('provider outage'));
    const updatedRun = runRow({ status: 'complete', completedAt: new Date() });
    mocks.runUpdate.mockResolvedValue(updatedRun);

    const result = await completeRun(USER_ID, RUN_ID);

    expect(result).toBe(updatedRun);
  });

  it('skips the email silently when the user has gone', async () => {
    mocks.userFindUnique.mockResolvedValue(null);

    const result = await completeRun(USER_ID, RUN_ID);

    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(result).toBeDefined();
  });
});

describe('ensureReportReading', () => {
  it('does not regenerate a reading that already exists (write-once)', async () => {
    mocks.runFindFirst.mockResolvedValue({ analystReading: { gaps: [] } });

    await ensureReportReading(USER_ID, RUN_ID);

    expect(mocks.runReport).not.toHaveBeenCalled();
    expect(mocks.runUpdateMany).not.toHaveBeenCalled();
  });

  it('writes nothing when the analyst refuses (returns null)', async () => {
    mocks.runFindFirst.mockResolvedValue({ analystReading: null });
    mocks.runReport.mockResolvedValue(null);

    await ensureReportReading(USER_ID, RUN_ID);

    expect(mocks.runUpdateMany).not.toHaveBeenCalled();
  });

  it('never throws when the analyst call rejects', async () => {
    mocks.runFindFirst.mockResolvedValue({ analystReading: null });
    mocks.runReport.mockRejectedValue(new Error('model timed out'));

    await expect(ensureReportReading(USER_ID, RUN_ID)).resolves.toBeUndefined();
    expect(mocks.runUpdateMany).not.toHaveBeenCalled();
  });

  it('reads answers and bucket labels, builds the brief, and writes the reading it gets back', async () => {
    const answers = { reclaim_profile_first_name: { value: 'Jordan' } };
    const labels = { area_a: 'My label' };
    const brief = { usable: true, role: 'CEO' };
    const reading = { gaps: [{ token: 'area_a', observation: 'x' }], pathway: [] };

    mocks.runFindFirst.mockResolvedValue({ analystReading: null });
    mocks.readRunAnswers.mockResolvedValue(answers);
    mocks.readBucketLabels.mockResolvedValue(labels);
    mocks.buildReportBrief.mockReturnValue(brief);
    mocks.runReport.mockResolvedValue(reading);

    await ensureReportReading(USER_ID, RUN_ID);

    expect(mocks.readRunAnswers).toHaveBeenCalledWith(USER_ID, RUN_ID);
    expect(mocks.readBucketLabels).toHaveBeenCalledWith(USER_ID);
    expect(mocks.buildReportBrief).toHaveBeenCalledWith(answers, labels);
    expect(mocks.runReport).toHaveBeenCalledWith(brief);
    expect(mocks.runUpdateMany).toHaveBeenCalledWith({
      where: {
        id: RUN_ID,
        userId: USER_ID,
        OR: [
          { analystReading: { equals: Prisma.DbNull } },
          { analystReading: { equals: Prisma.JsonNull } },
        ],
      },
      data: { analystReading: reading },
    });
  });

  /**
   * The silent cost leak, and the reason the `where` above is an `OR`.
   *
   * `analystReading` is `Json?`, so the column has two empty states: SQL `NULL` and the JSON value
   * `null`. Both read back as `null` in JavaScript, so the write-once early return treats each as
   * "never generated" — correctly. The write condition could tell them apart, and did: a row holding
   * JSON `null` generated a reading on **every** summary read and stored none of them. The guard let
   * it through, the model was called, the write matched no row, and the leader saw no reading while
   * each refresh spent money.
   *
   * Found by winding a run back for testing with `{ analystReading: null }`, which is exactly how a
   * column reaches that state. Asserted on the condition rather than on a round trip, because the
   * whole failure was that the condition and the guard disagreed about what "empty" means.
   */
  it('stores into a column holding JSON null, not only SQL NULL', async () => {
    mocks.runFindFirst.mockResolvedValue({ analystReading: null });
    mocks.buildReportBrief.mockReturnValue({ usable: true });
    mocks.runReport.mockResolvedValue({ gaps: [], pathway: [] });

    await ensureReportReading(USER_ID, RUN_ID);

    // Identity, not serialisation: both sentinels stringify to `{}`, so a JSON comparison here would
    // pass against two copies of the same one — which is the exact bug.
    const where = mocks.runUpdateMany.mock.calls[0]?.[0]?.where as {
      OR?: Array<{ analystReading: { equals: unknown } }>;
    };
    const matched = (where.OR ?? []).map((clause) => clause.analystReading.equals);
    expect(
      matched,
      'the write matches only one of the two empty states, so the other regenerates forever'
    ).toHaveLength(2);
    expect(matched).toContain(Prisma.DbNull);
    expect(matched).toContain(Prisma.JsonNull);
  });
});
