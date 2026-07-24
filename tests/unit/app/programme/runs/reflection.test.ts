/**
 * The reflection gate (F4 t-3, I9) — the `422 REFLECTION_REQUIRED` logic, with `getSlotHeads` mocked
 * so no DB is needed. The load-bearing behaviour is that the check is **run-scoped**: a reflection
 * from a different run does not satisfy this one.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { getSlotHeadsMock } = vi.hoisted(() => ({ getSlotHeadsMock: vi.fn() }));
vi.mock('@/lib/framework/data-slots', () => ({ getSlotHeads: getSlotHeadsMock }));

import { missingReflectionSlug } from '@/lib/app/programme/runs/reflection';

/** A slot head as `getSlotHeads` returns it (only `provenance` matters here). */
const head = (runId: string) => ({ provenance: { runId } });

beforeEach(() => getSlotHeadsMock.mockReset());

describe('missingReflectionSlug', () => {
  it('returns null for phases with no reflection gate (Phase 0, Phase 6)', async () => {
    expect(await missingReflectionSlug('u1', 'run-1', 'phase-0-setup')).toBeNull();
    expect(await missingReflectionSlug('u1', 'run-1', 'phase-6-summary')).toBeNull();
    expect(getSlotHeadsMock).not.toHaveBeenCalled();
  });

  it('is satisfied when the reflection head belongs to this run', async () => {
    getSlotHeadsMock.mockResolvedValue([head('run-1')]);
    expect(await missingReflectionSlug('u1', 'run-1', 'phase-1-current')).toBeNull();
    expect(getSlotHeadsMock).toHaveBeenCalledWith('u1', { slotSlugs: ['reclaim_reflection_p1'] });
  });

  it('reports the slug missing when no reflection head exists', async () => {
    getSlotHeadsMock.mockResolvedValue([]);
    expect(await missingReflectionSlug('u1', 'run-1', 'phase-2-energy')).toBe(
      'reclaim_reflection_p2'
    );
  });

  it('is run-scoped: a reflection from another run does NOT satisfy this one', async () => {
    getSlotHeadsMock.mockResolvedValue([head('a-previous-run')]);
    expect(await missingReflectionSlug('u1', 'run-2', 'phase-3-ideal')).toBe(
      'reclaim_reflection_p3'
    );
  });
});
