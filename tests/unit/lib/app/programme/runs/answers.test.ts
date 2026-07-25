/**
 * Run-scoped answer reads (F6). `getSlotHeads` is mocked. Load-bearing: only heads whose
 * `provenance.runId` matches this run are returned — a repeat audit never inherits a prior run's
 * answers (F1).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { getHeadsMock } = vi.hoisted(() => ({ getHeadsMock: vi.fn() }));
vi.mock('@/lib/framework/data-slots', () => ({ getSlotHeads: getHeadsMock }));

import { readRunAnswers } from '@/lib/app/programme/runs/answers';

const head = (slotSlug: string, value: string, runId: string, valueJson: unknown = null) => ({
  slotSlug,
  value,
  valueJson,
  provenance: { runId },
});

beforeEach(() => getHeadsMock.mockReset());

describe('readRunAnswers', () => {
  it('returns only the heads stamped with this run id, with value + valueJson', async () => {
    getHeadsMock.mockResolvedValue([
      head('reclaim_current_hours__deep_work', '10', 'run-1', 10),
      head('reclaim_setup_weekly_hours', '50', 'a-previous-run', 50),
    ]);
    const answers = await readRunAnswers('u1', 'run-1');
    expect(answers['reclaim_current_hours__deep_work']).toEqual({ value: '10', valueJson: 10 });
    expect(answers['reclaim_setup_weekly_hours']).toBeUndefined(); // belongs to another run
  });

  it('ignores a head with no runId in its provenance', async () => {
    getHeadsMock.mockResolvedValue([
      { slotSlug: 'x', value: 'v', valueJson: null, provenance: { conversationId: 'c' } },
    ]);
    const answers = await readRunAnswers('u1', 'run-1');
    expect(answers).toEqual({});
  });

  it('passes the slug filter through to getSlotHeads', async () => {
    getHeadsMock.mockResolvedValue([]);
    await readRunAnswers('u1', 'run-1', ['reclaim_setup_weekly_hours']);
    expect(getHeadsMock).toHaveBeenCalledWith('u1', { slotSlugs: ['reclaim_setup_weekly_hours'] });
  });
});
