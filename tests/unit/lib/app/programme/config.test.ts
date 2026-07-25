/**
 * The coach-editable config (F7 UI toggles, F8 access policy). Prisma mocked.
 *
 * Both readers fall back to the schema defaults, which is the load-bearing part for F8: a module row
 * that has never been edited must behave as **invite-only** (`openSignup: false`). A malformed stored
 * config falling open would silently un-gate the product.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { moduleFindUnique } = vi.hoisted(() => ({ moduleFindUnique: vi.fn() }));
vi.mock('@/lib/db/client', () => ({ prisma: { module: { findUnique: moduleFindUnique } } }));

import { readReclaimUiConfig, readReclaimAccessConfig } from '@/lib/app/programme/config';

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

describe('readReclaimAccessConfig (F8)', () => {
  it('defaults to invite-only, a 12-month client window, and a 30-day start-by', async () => {
    moduleFindUnique.mockResolvedValue({ config: {} });
    expect(await readReclaimAccessConfig()).toEqual({
      clientWindowMonths: 12,
      clientMustStartWithinDays: 30,
      openSignup: false,
      policyVersion: 'draft-1',
    });
  });

  it('honours Rashmir’s stored policy — the door opens by config, not by a deploy', async () => {
    moduleFindUnique.mockResolvedValue({
      config: { openSignup: true, clientWindowMonths: 6, policyVersion: '2026-09-01' },
    });
    const config = await readReclaimAccessConfig();
    expect(config.openSignup).toBe(true);
    expect(config.clientWindowMonths).toBe(6);
    expect(config.policyVersion).toBe('2026-09-01');
  });

  it('falls back to CLOSED when the module row is missing', async () => {
    moduleFindUnique.mockResolvedValue(null);
    expect((await readReclaimAccessConfig()).openSignup).toBe(false);
  });

  it('falls back to CLOSED when the stored config is malformed, rather than failing open', async () => {
    moduleFindUnique.mockResolvedValue({ config: { openSignup: 'yes-please' } });
    expect((await readReclaimAccessConfig()).openSignup).toBe(false);
  });
});
