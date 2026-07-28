/**
 * Recovering a phase mark that was never written.
 *
 * `recordPhaseMark` runs on a transition, is best-effort, and writes once and never revises. Those
 * three together are a trap: a run that was already in flight when phase marks shipped, or one whose
 * bookkeeping write lost a race with a restart, carries no mark — and `sliceByWindow` reads a missing
 * mark as "no boundary" and draws the whole audit under every later phase. Permanently, and silently.
 * What the leader sees is the end of phase 1 sitting under the phase 2 heading, with a coach offering
 * to move them on from a phase they have already left.
 *
 * So the read that draws a phase repairs it. These tests are about the two things that make that
 * repair correct rather than merely present: it cuts at the moment the phase was **entered**, not at
 * the end of a conversation that has since moved on, and it never touches a boundary that already
 * exists.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { runFindFirstMock, runUpdateMock, messageFindManyMock, loadPhaseProgressMock } = vi.hoisted(
  () => ({
    runFindFirstMock: vi.fn(),
    runUpdateMock: vi.fn(),
    messageFindManyMock: vi.fn(),
    loadPhaseProgressMock: vi.fn(),
  })
);

vi.mock('@/lib/db/client', () => ({
  prisma: {
    reclaimAuditRun: { findFirst: runFindFirstMock, update: runUpdateMock },
    aiMessage: { findMany: messageFindManyMock },
  },
}));

vi.mock('@/lib/app/programme/runs/journey', () => ({
  loadPhaseProgress: loadPhaseProgressMock,
  emptyPhaseProgress: () => ({
    phases: [],
    currentPhaseKey: 'phase-0-setup',
    currentPhaseEnteredAt: null,
  }),
  enterFirstPhase: vi.fn(),
  advancePhase: vi.fn(),
  completeFinalPhase: vi.fn(),
}));

import { backfillPhaseMark, loadCurrentRunState } from '@/app/api/v1/app/reclaim/runs/service';

const USER_ID = 'user-1';
const RUN_ID = 'run-1';
const CONVERSATION_ID = 'conv-1';
const ENTERED_AT = new Date('2026-07-27T20:37:11.735Z');

/** The run row `loadCurrentRunState` reads, with whatever marks are on it. */
const runRow = (phaseMarks: Record<string, string> = {}) => ({
  id: RUN_ID,
  quarter: null,
  conversationId: CONVERSATION_ID,
  coachOpenings: [],
  phaseMarks,
});

const onPhase = (phaseKey: string, enteredAt: Date | null = ENTERED_AT) => ({
  phases: [{ key: phaseKey, label: 'Energy', status: 'active' }],
  currentPhaseKey: phaseKey,
  currentPhaseEnteredAt: enteredAt,
});

beforeEach(() => {
  runFindFirstMock.mockReset();
  runUpdateMock.mockReset();
  messageFindManyMock.mockReset();
  loadPhaseProgressMock.mockReset();
  runUpdateMock.mockResolvedValue({});
});

describe('backfillPhaseMark', () => {
  it('cuts at the conversation as it stood when the phase opened', async () => {
    runFindFirstMock.mockResolvedValue({ conversationId: CONVERSATION_ID, phaseMarks: {} });
    messageFindManyMock.mockResolvedValue([{ id: 'm-9', content: 'The last turn of phase 1.' }]);

    const mark = await backfillPhaseMark(USER_ID, RUN_ID, 'phase-2-energy', ENTERED_AT);

    expect(mark).toBe('m-9');
    // The bound is what makes a late repair safe. Without it the mark would land at the end of a
    // conversation that has since carried on into this phase, and the leader would lose the turns
    // they have already had here.
    expect(messageFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ createdAt: { lt: ENTERED_AT } }),
      })
    );
    expect(runUpdateMock).toHaveBeenCalledWith({
      where: { id: RUN_ID },
      data: { phaseMarks: { 'phase-2-energy': 'm-9' } },
    });
  });

  it('keeps the reader’s predicate, so the id it writes is one the transcript can find', async () => {
    runFindFirstMock.mockResolvedValue({ conversationId: CONVERSATION_ID, phaseMarks: {} });
    messageFindManyMock.mockResolvedValue([{ id: 'm-9', content: 'A real turn.' }]);

    await backfillPhaseMark(USER_ID, RUN_ID, 'phase-2-energy', ENTERED_AT);

    expect(messageFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          conversationId: CONVERSATION_ID,
          role: { in: ['user', 'assistant'] },
          content: { not: '' },
          createdAt: { lt: ENTERED_AT },
        },
      })
    );
  });

  it('leaves a boundary that already exists exactly where it is', async () => {
    runFindFirstMock.mockResolvedValue({
      conversationId: CONVERSATION_ID,
      phaseMarks: { 'phase-2-energy': 'm-3' },
    });

    const mark = await backfillPhaseMark(USER_ID, RUN_ID, 'phase-2-energy', ENTERED_AT);

    expect(mark).toBe('m-3');
    expect(runUpdateMock).not.toHaveBeenCalled();
    expect(messageFindManyMock).not.toHaveBeenCalled();
  });

  it('writes nothing when the phase opened before anything was said', async () => {
    runFindFirstMock.mockResolvedValue({ conversationId: CONVERSATION_ID, phaseMarks: {} });
    messageFindManyMock.mockResolvedValue([]);

    expect(await backfillPhaseMark(USER_ID, RUN_ID, 'phase-2-energy', ENTERED_AT)).toBeNull();
    expect(runUpdateMock).not.toHaveBeenCalled();
  });

  it('swallows a failure — a repair must never break the read it rides on', async () => {
    runFindFirstMock.mockResolvedValue({ conversationId: CONVERSATION_ID, phaseMarks: {} });
    messageFindManyMock.mockRejectedValue(new Error('database gone'));

    await expect(
      backfillPhaseMark(USER_ID, RUN_ID, 'phase-2-energy', ENTERED_AT)
    ).resolves.toBeNull();
  });
});

describe('loadCurrentRunState — the repair on the read that draws the phase', () => {
  it('recovers the missing mark and answers with it, not one refresh later', async () => {
    runFindFirstMock.mockResolvedValueOnce(runRow());
    loadPhaseProgressMock.mockResolvedValue(onPhase('phase-2-energy'));
    runFindFirstMock.mockResolvedValueOnce({ conversationId: CONVERSATION_ID, phaseMarks: {} });
    messageFindManyMock.mockResolvedValue([{ id: 'm-9', content: 'The last turn of phase 1.' }]);

    const state = await loadCurrentRunState(USER_ID);

    expect(state.run?.phaseMarks).toEqual({ 'phase-2-energy': 'm-9' });
  });

  it('does not repair the first phase, which correctly has no mark', async () => {
    runFindFirstMock.mockResolvedValue(runRow());
    loadPhaseProgressMock.mockResolvedValue(onPhase('phase-0-setup'));

    const state = await loadCurrentRunState(USER_ID);

    // Nothing was entered to reach phase 0, so its part of the conversation starts at the top.
    // Writing a mark here would cut off the beginning of the audit.
    expect(state.run?.phaseMarks).toEqual({});
    expect(runUpdateMock).not.toHaveBeenCalled();
  });

  it('costs nothing on a run whose transitions recorded normally', async () => {
    runFindFirstMock.mockResolvedValue(runRow({ 'phase-2-energy': 'm-9' }));
    loadPhaseProgressMock.mockResolvedValue(onPhase('phase-2-energy'));

    const state = await loadCurrentRunState(USER_ID);

    expect(state.run?.phaseMarks).toEqual({ 'phase-2-energy': 'm-9' });
    // The guard is on the response's own marks, so the common path does not re-read the run.
    expect(runFindFirstMock).toHaveBeenCalledTimes(1);
    expect(messageFindManyMock).not.toHaveBeenCalled();
  });

  it('leaves a run with no conversation alone', async () => {
    runFindFirstMock.mockResolvedValue({ ...runRow(), conversationId: null });
    loadPhaseProgressMock.mockResolvedValue(onPhase('phase-2-energy'));

    const state = await loadCurrentRunState(USER_ID);

    expect(state.run?.phaseMarks).toEqual({});
    expect(messageFindManyMock).not.toHaveBeenCalled();
  });

  it('does not guess a boundary the journey has no record of', async () => {
    runFindFirstMock.mockResolvedValue(runRow());
    loadPhaseProgressMock.mockResolvedValue(onPhase('phase-2-energy', null));

    const state = await loadCurrentRunState(USER_ID);

    expect(state.run?.phaseMarks).toEqual({});
    expect(messageFindManyMock).not.toHaveBeenCalled();
  });

  it('keeps the entry time off the wire', async () => {
    runFindFirstMock.mockResolvedValue(runRow({ 'phase-2-energy': 'm-9' }));
    loadPhaseProgressMock.mockResolvedValue(onPhase('phase-2-energy'));

    const state = await loadCurrentRunState(USER_ID);

    // It is a repair input, not part of the leader's state, and the client schema would reject it.
    expect(state).not.toHaveProperty('currentPhaseEnteredAt');
  });
});
