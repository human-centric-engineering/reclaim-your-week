/**
 * Journey transitions + progress read (F4 t-3/t-4). The framework's journey writer
 * (`applyJourneyTransition`) and readers (`getJourney`, `getNodeStates`) are mocked, so no DB is
 * needed. The load-bearing behaviour: a transition is complete-then-enter and never trusts the
 * client's `leavingPhaseKey` past the engine (I6); the progress read is run-scoped (the journey is
 * keyed on the run id as `contextKey`) and derives "where you are" from the node states.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { applyMock, getJourneyMock, getNodeStatesMock } = vi.hoisted(() => ({
  applyMock: vi.fn(),
  getJourneyMock: vi.fn(),
  getNodeStatesMock: vi.fn(),
}));
vi.mock('@/lib/framework/guidance/guidance', () => ({ applyJourneyTransition: applyMock }));
vi.mock('@/lib/framework/facilitation/journey/queries', () => ({
  getJourney: getJourneyMock,
  getNodeStates: getNodeStatesMock,
}));

import {
  enterFirstPhase,
  advancePhase,
  completeFinalPhase,
  emptyPhaseProgress,
  loadPhaseProgress,
} from '@/lib/app/programme/runs/journey';
import { ValidationError } from '@/lib/api/errors';
import { RECLAIM_MAP_SLUG } from '@/lib/app/programme/map';

/** `applyJourneyTransition` results as journey.ts reads them (`.ok` / `.rejection.message` / null). */
const ok = { ok: true } as const;
const rejected = (message: string) => ({ ok: false, rejection: { message } }) as const;

const KEY = (runId: string) => ({ userId: 'u1', graphSlug: RECLAIM_MAP_SLUG, contextKey: runId });

beforeEach(() => {
  applyMock.mockReset();
  getJourneyMock.mockReset();
  getNodeStatesMock.mockReset();
});

describe('enterFirstPhase', () => {
  it('enters phase-0-setup on the run-scoped journey key', async () => {
    applyMock.mockResolvedValue(ok);
    await enterFirstPhase('u1', 'run-1');
    expect(applyMock).toHaveBeenCalledWith({ userId: 'u1' }, KEY('run-1'), {
      nodeKey: 'phase-0-setup',
      kind: 'enter',
    });
  });
});

describe('advancePhase', () => {
  it('completes the leaving node, enters the next, and returns the entered key', async () => {
    applyMock.mockResolvedValue(ok);
    const result = await advancePhase('u1', 'run-1', 'phase-1-current');

    expect(result).toEqual({ enteredPhaseKey: 'phase-2-energy' });
    expect(applyMock).toHaveBeenNthCalledWith(1, { userId: 'u1' }, KEY('run-1'), {
      nodeKey: 'phase-1-current',
      kind: 'complete',
    });
    expect(applyMock).toHaveBeenNthCalledWith(2, { userId: 'u1' }, KEY('run-1'), {
      nodeKey: 'phase-2-energy',
      kind: 'enter',
    });
  });

  it('refuses when there is no phase after the leaving one (the final phase)', async () => {
    await expect(advancePhase('u1', 'run-1', 'phase-6-summary')).rejects.toBeInstanceOf(
      ValidationError
    );
    // The engine is never touched — the guard is adjacency, before any write.
    expect(applyMock).not.toHaveBeenCalled();
  });

  it('surfaces the engine rejection when the leaving node cannot complete (a lying client, I6)', async () => {
    applyMock.mockResolvedValueOnce(rejected('node is not active'));
    await expect(advancePhase('u1', 'run-1', 'phase-1-current')).rejects.toThrow(
      'Could not complete the current phase'
    );
    // It stopped after the failed complete; it never tried to enter the next node.
    expect(applyMock).toHaveBeenCalledTimes(1);
  });

  it('treats a null (unstarted journey) complete as a refusal', async () => {
    applyMock.mockResolvedValueOnce(null);
    await expect(advancePhase('u1', 'run-1', 'phase-1-current')).rejects.toBeInstanceOf(
      ValidationError
    );
    expect(applyMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces a rejection on the enter half after a successful complete', async () => {
    applyMock.mockResolvedValueOnce(ok).mockResolvedValueOnce(rejected('locked'));
    await expect(advancePhase('u1', 'run-1', 'phase-1-current')).rejects.toThrow(
      'Could not enter the next phase'
    );
    expect(applyMock).toHaveBeenCalledTimes(2);
  });
});

describe('completeFinalPhase', () => {
  it('completes phase-6-summary', async () => {
    applyMock.mockResolvedValue(ok);
    await completeFinalPhase('u1', 'run-1');
    expect(applyMock).toHaveBeenCalledWith({ userId: 'u1' }, KEY('run-1'), {
      nodeKey: 'phase-6-summary',
      kind: 'complete',
    });
  });

  it('is best-effort: a thrown engine error does not propagate (the run completes regardless)', async () => {
    applyMock.mockRejectedValue(new Error('journey gone'));
    await expect(completeFinalPhase('u1', 'run-1')).resolves.toBeUndefined();
  });
});

describe('emptyPhaseProgress', () => {
  it('is all seven phases upcoming, positioned at the first', () => {
    const progress = emptyPhaseProgress();
    expect(progress.phases).toHaveLength(7);
    expect(progress.phases.every((p) => p.status === 'upcoming')).toBe(true);
    expect(progress.phases[0]).toEqual({
      key: 'phase-0-setup',
      label: 'Setup',
      status: 'upcoming',
    });
    expect(progress.currentPhaseKey).toBe('phase-0-setup');
  });
});

describe('loadPhaseProgress', () => {
  it('reads the run-scoped journey by contextKey = runId', async () => {
    getJourneyMock.mockResolvedValue(null);
    await loadPhaseProgress('u1', 'run-1');
    expect(getJourneyMock).toHaveBeenCalledWith({ userId: 'u1' }, KEY('run-1'));
  });

  it('with no journey yet, every phase is upcoming and the position is the first phase', async () => {
    getJourneyMock.mockResolvedValue(null);
    const progress = await loadPhaseProgress('u1', 'run-1');

    expect(getNodeStatesMock).not.toHaveBeenCalled();
    expect(progress.phases.every((p) => p.status === 'upcoming')).toBe(true);
    expect(progress.currentPhaseKey).toBe('phase-0-setup');
  });

  it('maps node states to statuses and positions at the active node', async () => {
    getJourneyMock.mockResolvedValue({ id: 'j1' });
    getNodeStatesMock.mockResolvedValue([
      { nodeKey: 'phase-0-setup', status: 'completed' },
      { nodeKey: 'phase-1-current', status: 'active' },
    ]);

    const progress = await loadPhaseProgress('u1', 'run-1');

    expect(getNodeStatesMock).toHaveBeenCalledWith(
      { userId: 'u1' },
      { journeyId: 'j1', subject: 'u1' }
    );
    expect(progress.phases[0].status).toBe('completed');
    expect(progress.phases[1].status).toBe('active');
    expect(progress.phases[2].status).toBe('upcoming'); // no state → upcoming
    expect(progress.currentPhaseKey).toBe('phase-1-current');
  });

  it('with no active node, positions at the first not-yet-completed phase', async () => {
    getJourneyMock.mockResolvedValue({ id: 'j1' });
    getNodeStatesMock.mockResolvedValue([
      { nodeKey: 'phase-0-setup', status: 'completed' },
      { nodeKey: 'phase-1-current', status: 'completed' },
    ]);

    const progress = await loadPhaseProgress('u1', 'run-1');
    expect(progress.currentPhaseKey).toBe('phase-2-energy');
  });

  it('with every phase completed, positions at the final phase', async () => {
    getJourneyMock.mockResolvedValue({ id: 'j1' });
    getNodeStatesMock.mockResolvedValue(
      emptyPhaseProgress().phases.map((p) => ({ nodeKey: p.key, status: 'completed' }))
    );

    const progress = await loadPhaseProgress('u1', 'run-1');
    expect(progress.phases.every((p) => p.status === 'completed')).toBe(true);
    expect(progress.currentPhaseKey).toBe('phase-6-summary');
  });
});
