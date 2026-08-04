/**
 * The run service's other half: starting an audit, moving it on, and the reads and writes a coach turn
 * makes against it (`runs/service.ts`).
 *
 * `runs-service.test.ts` beside this covers the three endings — abandon, complete, the analyst reading.
 * These are the beginnings and the middle, and they had no runtime test at all: the route tests that
 * exercise them mock the whole service module away, which is right for a route test and leaves every
 * rule in here unproven.
 *
 * The rules are not incidental. `createRun` is where entitlement is enforced (I14) and where the second
 * in-progress audit is refused. `saveRunAnswer` is the leader's half of the single write path (I3) and
 * is where `confirming` becomes `user_confirmed` — the distinction that keeps the audit honest about
 * which figures a leader volunteered and which they merely agreed to. `claimCoachOpening` is the one
 * statement standing between a leader and two coaches opening the same phase at once. Each of those
 * fails silently if it regresses: an extra opener, a figure attributed to the wrong voice, an audit
 * started by somebody with no entitlement.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ValidationError, NotFoundError } from '@/lib/api/errors';

const mocks = vi.hoisted(() => ({
  runFindFirst: vi.fn(),
  runCreate: vi.fn(),
  runUpdateMany: vi.fn(),
  journeyCreate: vi.fn(),
  saveAnswer: vi.fn(),
  assertEntitled: vi.fn(),
  consumeAudit: vi.fn(),
  advancePhase: vi.fn(),
  enterFirstPhase: vi.fn(),
  loadPhaseProgress: vi.fn(),
  completeFinalPhase: vi.fn(),
  loggerWarn: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  prisma: {
    reclaimAuditRun: {
      findFirst: mocks.runFindFirst,
      create: mocks.runCreate,
      update: vi.fn(),
      updateMany: mocks.runUpdateMany,
    },
    userJourney: { create: mocks.journeyCreate },
    aiConversation: { updateMany: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));

vi.mock('@/lib/logging', () => ({
  logger: { info: vi.fn(), warn: mocks.loggerWarn, error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/app/programme/slots/write', () => ({ saveAnswer: mocks.saveAnswer }));

vi.mock('@/lib/app/programme/runs/journey', () => ({
  completeFinalPhase: mocks.completeFinalPhase,
  advancePhase: mocks.advancePhase,
  enterFirstPhase: mocks.enterFirstPhase,
  emptyPhaseProgress: vi.fn(),
  loadPhaseProgress: mocks.loadPhaseProgress,
}));

vi.mock('@/lib/app/programme/runs/entitlement', () => ({
  assertEntitled: mocks.assertEntitled,
  consumeAudit: mocks.consumeAudit,
}));

vi.mock('@/lib/app/programme/access/referrals', () => ({ grantReferralUnlock: vi.fn() }));
vi.mock('@/lib/app/programme/access/events', () => ({ emitReclaimAccessEvent: vi.fn() }));
vi.mock('@/lib/app/programme/runs/answers', () => ({ readRunAnswers: vi.fn() }));
vi.mock('@/lib/app/programme/buckets/labels', () => ({ readBucketLabels: vi.fn() }));
vi.mock('@/lib/app/programme/analyst/brief', () => ({ buildAnalystBrief: vi.fn() }));
vi.mock('@/lib/app/programme/analyst/reading', () => ({ runAnalyst: vi.fn() }));
vi.mock('@/lib/email/send', () => ({ sendEmail: vi.fn() }));
vi.mock('@/components/app/emails/audit-complete', () => ({ default: vi.fn() }));

import {
  createRun,
  transitionRun,
  linkRunConversation,
  loadCoachTurnTarget,
  claimCoachOpening,
  readCoachOpenings,
  saveRunAnswer,
  saveRunAnswers,
} from '@/app/api/v1/app/reclaim/runs/service';
import { RECLAIM_MAP_SLUG } from '@/lib/app/programme/map';

const USER_ID = 'user-1';
const RUN_ID = 'run-1';

const runRow = (over: Record<string, unknown> = {}) => ({
  id: RUN_ID,
  userId: USER_ID,
  status: 'in_progress',
  conversationId: null,
  coachOpenings: [],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.assertEntitled.mockResolvedValue(undefined);
  mocks.enterFirstPhase.mockResolvedValue(undefined);
  mocks.journeyCreate.mockResolvedValue({ id: 'journey-1' });
  mocks.runCreate.mockResolvedValue(runRow());
  mocks.runUpdateMany.mockResolvedValue({ count: 1 });
  mocks.saveAnswer.mockResolvedValue({ id: 'slot-value-1' });
  mocks.loadPhaseProgress.mockResolvedValue({ currentPhaseKey: 'phase-1-current' });
});

describe('createRun', () => {
  it('refuses before it looks at anything, when the leader is not entitled', async () => {
    // I14 — the gate is the first thing in the function, and the order is the property: a refusal that
    // happened after the row was created would leave an audit nobody is allowed to run.
    mocks.assertEntitled.mockRejectedValue(new ValidationError('No invitation'));

    await expect(createRun(USER_ID)).rejects.toThrow(ValidationError);
    expect(mocks.runFindFirst).not.toHaveBeenCalled();
    expect(mocks.runCreate).not.toHaveBeenCalled();
  });

  it('refuses a second audit while one is in progress, with a message that says what to do', async () => {
    // The partial-unique index is the hard backstop; this is the half a leader actually reads.
    mocks.runFindFirst.mockResolvedValue(runRow());

    await expect(createRun(USER_ID)).rejects.toThrow('An audit is already in progress');
    expect(mocks.runCreate).not.toHaveBeenCalled();
  });

  it('creates the run, its journey, and enters the first phase', async () => {
    mocks.runFindFirst.mockResolvedValue(null);

    const run = await createRun(USER_ID);

    expect(run.id).toBe(RUN_ID);
    expect(mocks.runCreate).toHaveBeenCalledWith({
      data: { userId: USER_ID, status: 'in_progress', quarter: null },
    });
    // The journey's `contextKey` is the run id — what makes a leader's phase progress belong to this
    // audit rather than to their last one.
    expect(mocks.journeyCreate).toHaveBeenCalledWith({
      data: { userId: USER_ID, graphSlug: RECLAIM_MAP_SLUG, contextKey: RUN_ID },
    });
    // Without this, a resumed run opens on "you are here" pointing at nothing.
    expect(mocks.enterFirstPhase).toHaveBeenCalledWith(USER_ID, RUN_ID);
  });

  it('records the quarter when one is given', async () => {
    mocks.runFindFirst.mockResolvedValue(null);

    await createRun(USER_ID, '2026-Q3');

    expect(mocks.runCreate).toHaveBeenCalledWith({
      data: { userId: USER_ID, status: 'in_progress', quarter: '2026-Q3' },
    });
  });
});

describe('transitionRun', () => {
  it('hands the move to the engine, which is the only thing allowed to validate it', async () => {
    mocks.advancePhase.mockResolvedValue({ enteredPhaseKey: 'phase-2-energy' });

    expect(await transitionRun(USER_ID, RUN_ID, 'phase-1-current')).toEqual({
      enteredPhaseKey: 'phase-2-energy',
    });
    expect(mocks.advancePhase).toHaveBeenCalledWith(USER_ID, RUN_ID, 'phase-1-current');
  });
});

describe('linkRunConversation', () => {
  it('writes only while the run has no conversation, so the first attribution stands', async () => {
    // Write-once as one conditional statement rather than read-then-write: two turns racing on the
    // first message of a run cannot otherwise end up setting different conversations.
    await linkRunConversation(RUN_ID, 'conv-1');

    expect(mocks.runUpdateMany).toHaveBeenCalledWith({
      where: { id: RUN_ID, conversationId: null },
      data: { conversationId: 'conv-1' },
    });
  });

  it('swallows a failure, because this is bookkeeping for a report', async () => {
    // The turn is the leader's conversation; the link is so an admin can attribute cost to it later.
    mocks.runUpdateMany.mockRejectedValue(new Error('database gone'));

    await expect(linkRunConversation(RUN_ID, 'conv-1')).resolves.toBeUndefined();
    expect(mocks.loggerWarn).toHaveBeenCalled();
  });
});

describe('loadCoachTurnTarget', () => {
  it('derives the phase from the journey rather than taking it from the caller', async () => {
    // I6 — both halves of the scope the capture capability trusts are server-derived. A phase that
    // came from the client would let a turn write into a section the leader is not in.
    mocks.runFindFirst.mockResolvedValue(runRow({ conversationId: 'conv-1' }));

    expect(await loadCoachTurnTarget(USER_ID, RUN_ID)).toEqual({
      conversationId: 'conv-1',
      phaseKey: 'phase-1-current',
    });
  });

  it('reports no conversation yet as undefined, which is the signal to open one', async () => {
    mocks.runFindFirst.mockResolvedValue(runRow({ conversationId: null }));

    expect(await loadCoachTurnTarget(USER_ID, RUN_ID)).toMatchObject({
      conversationId: undefined,
    });
  });

  it('refuses a turn on an audit that is not in progress', async () => {
    // Opening a transcript on a finished audit would give the leader a coach whose every answer the
    // write path would then refuse — a conversation that cannot be recorded is worse than none.
    mocks.runFindFirst.mockResolvedValue(runRow({ status: 'complete' }));

    await expect(loadCoachTurnTarget(USER_ID, RUN_ID)).rejects.toThrow(
      'This audit is not in progress'
    );
    expect(mocks.loadPhaseProgress).not.toHaveBeenCalled();
  });

  it('refuses a run that is not the caller’s', async () => {
    mocks.runFindFirst.mockResolvedValue(null);

    await expect(loadCoachTurnTarget(USER_ID, RUN_ID)).rejects.toThrow(NotFoundError);
  });
});

describe('claimCoachOpening', () => {
  it('claims a moment in one statement, scoped to the owner and an active run', async () => {
    // Ownership lives in the `where` clause with the claim, so no caller can forget to check it.
    expect(await claimCoachOpening(USER_ID, RUN_ID, 'phase-1-open')).toBe(true);

    expect(mocks.runUpdateMany).toHaveBeenCalledWith({
      where: {
        id: RUN_ID,
        userId: USER_ID,
        status: 'in_progress',
        NOT: { coachOpenings: { has: 'phase-1-open' } },
      },
      data: { coachOpenings: { push: 'phase-1-open' } },
    });
  });

  it('loses the claim when the moment has already been fired', async () => {
    // What collapses two tabs, React's development double-effect, and a reload mid-stream into one
    // opener: the second caller updates no rows and is told not to generate.
    mocks.runUpdateMany.mockResolvedValue({ count: 0 });

    expect(await claimCoachOpening(USER_ID, RUN_ID, 'phase-1-open')).toBe(false);
  });
});

describe('readCoachOpenings', () => {
  it('returns the moments this run has fired', async () => {
    mocks.runFindFirst.mockResolvedValue({
      coachOpenings: ['phase-1-open', 'phase-1-chart-reveal'],
    });

    expect(await readCoachOpenings(USER_ID, RUN_ID)).toEqual([
      'phase-1-open',
      'phase-1-chart-reveal',
    ]);
  });

  it('returns nothing for a run that is not the caller’s, rather than throwing', async () => {
    // Read by the transition gate (I12) and the surface, both of which want an empty ledger and not an
    // error: a leader whose run cannot be found has fired no moments, which is the truthful answer.
    mocks.runFindFirst.mockResolvedValue(null);

    expect(await readCoachOpenings(USER_ID, RUN_ID)).toEqual([]);
  });
});

describe('saveRunAnswer — the leader’s half of the single write path (I3)', () => {
  it('records a typed answer as `direct`, through saveAnswer and nothing else', async () => {
    mocks.runFindFirst.mockResolvedValue(runRow());

    await saveRunAnswer(USER_ID, RUN_ID, {
      slotSlug: 'reclaim_setup_weekly_hours',
      value: '52',
      valueJson: 52,
      conversationId: 'conv-1',
    });

    expect(mocks.saveAnswer).toHaveBeenCalledWith({
      userId: USER_ID,
      runId: RUN_ID,
      slotSlug: 'reclaim_setup_weekly_hours',
      value: '52',
      valueJson: 52,
      sourceType: 'direct',
      conversationId: 'conv-1',
    });
  });

  it('records an answer the leader agreed to as `user_confirmed`, not as their own', async () => {
    // The distinction the audit is built on: a figure the coach inferred and the leader accepted is
    // theirs to stand on, but they did not volunteer it, and the capture list reads that difference.
    mocks.runFindFirst.mockResolvedValue(runRow());

    await saveRunAnswer(USER_ID, RUN_ID, {
      slotSlug: 'reclaim_setup_audit_period',
      value: 'last quarter',
      confirming: true,
    });

    expect(mocks.saveAnswer).toHaveBeenCalledWith(
      expect.objectContaining({ sourceType: 'user_confirmed' })
    );
  });

  it('refuses to write to an audit that is no longer active', async () => {
    mocks.runFindFirst.mockResolvedValue(runRow({ status: 'abandoned' }));

    await expect(
      saveRunAnswer(USER_ID, RUN_ID, { slotSlug: 'reclaim_setup_weekly_hours', value: '52' })
    ).rejects.toThrow('This audit is not in progress');
    expect(mocks.saveAnswer).not.toHaveBeenCalled();
  });

  it('refuses to write to a run that is not the caller’s', async () => {
    mocks.runFindFirst.mockResolvedValue(null);

    await expect(
      saveRunAnswer(USER_ID, RUN_ID, { slotSlug: 'reclaim_setup_weekly_hours', value: '52' })
    ).rejects.toThrow(NotFoundError);
    expect(mocks.saveAnswer).not.toHaveBeenCalled();
  });
});

describe('saveRunAnswers — the forms, which write many at once', () => {
  it('checks the run once and still routes every write through saveAnswer', async () => {
    // The batch is an ergonomics shortcut for the Phase 0 and Phase 1 forms, never a second write
    // path: a batch that wrote rows itself would sit outside every guard `saveAnswer` applies (I3).
    mocks.runFindFirst.mockResolvedValue(runRow());

    await saveRunAnswers(USER_ID, RUN_ID, [
      { slotSlug: 'reclaim_current_hours__deep_work', value: '4', valueJson: 4 },
      { slotSlug: 'reclaim_current_detail__deep_work', value: 'Whatever survives the day.' },
      { slotSlug: 'reclaim_setup_audit_period', value: 'last quarter', confirming: true },
    ]);

    expect(mocks.runFindFirst).toHaveBeenCalledTimes(1);
    expect(mocks.saveAnswer).toHaveBeenCalledTimes(3);
    expect(mocks.saveAnswer).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ sourceType: 'user_confirmed' })
    );
  });

  it('writes nothing at all when the run is not active', async () => {
    mocks.runFindFirst.mockResolvedValue(runRow({ status: 'complete' }));

    await expect(
      saveRunAnswers(USER_ID, RUN_ID, [{ slotSlug: 'reclaim_setup_weekly_hours', value: '52' }])
    ).rejects.toThrow('This audit is not in progress');
    expect(mocks.saveAnswer).not.toHaveBeenCalled();
  });

  it('accepts an empty batch without touching the write path', async () => {
    // The Phase 1 form submits whatever changed, which on a revisit with no edits is nothing.
    mocks.runFindFirst.mockResolvedValue(runRow());

    await expect(saveRunAnswers(USER_ID, RUN_ID, [])).resolves.toBeUndefined();
    expect(mocks.saveAnswer).not.toHaveBeenCalled();
  });
});
