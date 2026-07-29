/**
 * The two reads that let a leader look at an audit they have already finished.
 *
 * `GET /runs/current` filters on `in_progress`, which was the only question anyone asked and meant
 * that finishing an audit removed it from the product. These are the two reads that do not filter on
 * status: `listRuns` for the leader's own history, `loadRunState` for one of them.
 *
 * The route tests beside this file mock both of these away — correctly, since a route test is about
 * status codes and envelopes. That leaves the service itself unexercised, and the service is where
 * the two things that matter live: what "where has this audit got to" means for a finished run
 * versus an open one, and whether a run id belonging to somebody else is a read at all.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundError } from '@/lib/api/errors';

const { runFindManyMock, runFindFirstMock, loadPhaseProgressMock } = vi.hoisted(() => ({
  runFindManyMock: vi.fn(),
  runFindFirstMock: vi.fn(),
  loadPhaseProgressMock: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  prisma: {
    reclaimAuditRun: { findMany: runFindManyMock, findFirst: runFindFirstMock },
    aiMessage: { findMany: vi.fn() },
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

import { listRuns, loadRunState, loadOwnedRun } from '@/app/api/v1/app/reclaim/runs/service';

const USER_ID = 'user-1';

const STARTED = new Date('2026-04-01T09:00:00.000Z');
const FINISHED = new Date('2026-04-01T10:30:00.000Z');

/** A run row as Prisma returns it. */
const run = (over: Record<string, unknown> = {}) => ({
  id: 'run-open',
  userId: USER_ID,
  quarter: '2026 Q2',
  status: 'in_progress',
  startedAt: STARTED,
  completedAt: null,
  conversationId: 'conv-1',
  coachOpenings: [],
  phaseMarks: {},
  ...over,
});

const PHASES = [
  { key: 'phase-0-setup', label: 'Setting up', status: 'complete' },
  { key: 'phase-1-profile', label: 'Your profile', status: 'active' },
  { key: 'phase-2-areas', label: 'Where the time goes', status: 'pending' },
];

beforeEach(() => {
  vi.clearAllMocks();
  loadPhaseProgressMock.mockResolvedValue({
    phases: PHASES,
    currentPhaseKey: 'phase-1-profile',
    currentPhaseEnteredAt: new Date('2026-04-01T09:20:00.000Z'),
  });
});

describe('listRuns — every audit, not only the live one', () => {
  it('returns a finished audit alongside an open one', async () => {
    runFindManyMock.mockResolvedValue([
      run(),
      run({ id: 'run-done', quarter: '2026 Q1', status: 'complete', completedAt: FINISHED }),
    ]);

    const runs = await listRuns(USER_ID);

    // The whole point of this read: nothing filters on status, so the finished audit is in the list.
    expect(runs.map((r) => r.id)).toEqual(['run-open', 'run-done']);
    expect(runs[1]).toMatchObject({ status: 'complete', completedAt: FINISHED });
  });

  it('asks the journey where the leader is, but only for the unfinished audit', async () => {
    runFindManyMock.mockResolvedValue([
      run({ id: 'run-done-a', status: 'complete', completedAt: FINISHED }),
      run(),
      run({ id: 'run-done-b', status: 'abandoned', completedAt: FINISHED }),
    ]);

    const runs = await listRuns(USER_ID);

    // The loop looks like an N+1 and is not: `createRun` allows one `in_progress` run per leader, so
    // exactly one iteration can ever take the journey branch. Assert the count, not just the shape —
    // it is what stops a future edit turning a history page into one query per audit.
    expect(loadPhaseProgressMock).toHaveBeenCalledTimes(1);
    expect(loadPhaseProgressMock).toHaveBeenCalledWith(USER_ID, 'run-open');
    expect(runs.find((r) => r.id === 'run-open')?.progress).toEqual({
      phaseKey: 'phase-1-profile',
      phaseLabel: 'Your profile',
      phaseIndex: 1,
    });
  });

  it('leaves a finished audit with no "here" to be', async () => {
    runFindManyMock.mockResolvedValue([
      run({ id: 'run-done', status: 'complete', completedAt: FINISHED }),
    ]);

    const [finished] = await listRuns(USER_ID);

    // A completed audit has no current phase, and inventing one would put a "you are here" marker on
    // a conversation that has ended.
    expect(finished.progress).toBeNull();
  });

  it('reports progress as absent rather than guessing when the journey does not know the phase', async () => {
    runFindManyMock.mockResolvedValue([run()]);
    loadPhaseProgressMock.mockResolvedValue({
      phases: PHASES,
      currentPhaseKey: 'phase-9-nonexistent',
      currentPhaseEnteredAt: null,
    });

    const [open] = await listRuns(USER_ID);

    // `findIndex` returning -1 must not become `phases[-1]`. Null is the honest answer.
    expect(open.progress).toBeNull();
  });

  it('says whether there is a transcript to read back', async () => {
    runFindManyMock.mockResolvedValue([
      run({ id: 'run-talked', conversationId: 'conv-1' }),
      run({ id: 'run-formed', status: 'complete', completedAt: FINISHED, conversationId: null }),
    ]);

    const runs = await listRuns(USER_ID);

    // The form path records answers and never opens a conversation, so the review surface has to know
    // not to offer a transcript that was never written.
    expect(runs.map((r) => r.hasConversation)).toEqual([true, false]);
  });

  it('asks for this leader only, newest first', async () => {
    runFindManyMock.mockResolvedValue([]);

    expect(await listRuns(USER_ID)).toEqual([]);
    expect(runFindManyMock).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      orderBy: { startedAt: 'desc' },
    });
  });
});

describe('loadRunState — one audit, whatever state it is in', () => {
  it('carries the status and both dates, so the surface can tell finished from live', async () => {
    runFindFirstMock.mockResolvedValue(
      run({ id: 'run-done', status: 'complete', completedAt: FINISHED })
    );

    const state = await loadRunState(USER_ID, 'run-done');

    expect(state.run).toMatchObject({
      id: 'run-done',
      status: 'complete',
      startedAt: STARTED,
      completedAt: FINISHED,
      quarter: '2026 Q2',
    });
    expect(state.phases).toEqual(PHASES);
    expect(state.currentPhaseKey).toBe('phase-1-profile');
  });

  it('does not leak the phase entry time into the response', async () => {
    runFindFirstMock.mockResolvedValue(run());

    const state = await loadRunState(USER_ID, 'run-open');

    // `loadPhaseProgress` hands back `currentPhaseEnteredAt` because it is free, not because anyone
    // may have it. Spreading the object without destructuring it away would ship it to the client.
    expect(state).not.toHaveProperty('currentPhaseEnteredAt');
  });

  it('hands the stored phase marks to the surface that slices the transcript', async () => {
    runFindFirstMock.mockResolvedValue(
      run({ phaseMarks: { 'phase-1-profile': 'msg-42', 'phase-2-areas': 'msg-88' } })
    );

    const state = await loadRunState(USER_ID, 'run-open');

    expect(state.run.phaseMarks).toEqual({
      'phase-1-profile': 'msg-42',
      'phase-2-areas': 'msg-88',
    });
  });

  it('degrades a malformed marks column to no marks rather than passing the JSON through', async () => {
    runFindFirstMock.mockResolvedValue(run({ phaseMarks: { 'phase-1-profile': 99 } }));

    const state = await loadRunState(USER_ID, 'run-open');

    // Validated, never cast. A hand-edited or half-written column reaching `sliceByWindow` as
    // something it will index into is the failure; `{}` means every phase reads from the start of
    // the conversation, which is the pre-pagination behaviour and never an error.
    expect(state.run.phaseMarks).toEqual({});
  });

  it('refuses a run id that belongs to somebody else', async () => {
    // Ownership is in the `where`, so a run the leader does not own comes back as no row at all.
    runFindFirstMock.mockResolvedValue(null);

    await expect(loadRunState(USER_ID, 'run-theirs')).rejects.toThrow(NotFoundError);
    // And it stops there — no journey read, so nothing about another leader's audit is touched.
    expect(loadPhaseProgressMock).not.toHaveBeenCalled();
  });
});

describe('loadOwnedRun — the run id alone never authorises', () => {
  it('scopes the read by user as well as id', async () => {
    runFindFirstMock.mockResolvedValue(run());

    await loadOwnedRun('run-open', USER_ID);

    expect(runFindFirstMock).toHaveBeenCalledWith({ where: { id: 'run-open', userId: USER_ID } });
  });

  it('is a 404 and not a 403, so an id that exists is indistinguishable from one that does not', async () => {
    runFindFirstMock.mockResolvedValue(null);

    await expect(loadOwnedRun('run-theirs', USER_ID)).rejects.toThrow(
      new NotFoundError('Audit run run-theirs not found')
    );
  });
});
