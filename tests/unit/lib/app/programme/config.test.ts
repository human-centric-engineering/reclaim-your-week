/**
 * The coach-editable UI config toggles (F7). Prisma mocked. Both default off; a stored value wins.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { moduleFindUnique } = vi.hoisted(() => ({ moduleFindUnique: vi.fn() }));
vi.mock('@/lib/db/client', () => ({ prisma: { module: { findUnique: moduleFindUnique } } }));

import { readReclaimUiConfig } from '@/lib/app/programme/config';

beforeEach(() => moduleFindUnique.mockReset());

describe('readReclaimUiConfig', () => {
  it('defaults both toggles off when the module has no stored overrides', async () => {
    moduleFindUnique.mockResolvedValue({ config: {} });
    expect(await readReclaimUiConfig()).toEqual({
      phase2CoachingSignal: false,
      strategyMirror: false,
    });
  });

  it('reflects a stored override', async () => {
    moduleFindUnique.mockResolvedValue({
      config: { phase2CoachingSignal: true, strategyMirror: false },
    });
    expect(await readReclaimUiConfig()).toEqual({
      phase2CoachingSignal: true,
      strategyMirror: false,
    });
  });

  it('falls back to defaults when the module row is missing', async () => {
    moduleFindUnique.mockResolvedValue(null);
    expect(await readReclaimUiConfig()).toEqual({
      phase2CoachingSignal: false,
      strategyMirror: false,
    });
  });

  it('falls back to defaults when the stored config is malformed', async () => {
    moduleFindUnique.mockResolvedValue({ config: { phase2CoachingSignal: 'not-a-boolean' } });
    expect(await readReclaimUiConfig()).toEqual({
      phase2CoachingSignal: false,
      strategyMirror: false,
    });
  });
});
