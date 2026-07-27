/**
 * The coach-editable config (F7 UI toggles, F8 access policy). Prisma mocked.
 *
 * Both readers fall back to the schema defaults, which is the load-bearing part for F8: a module row
 * that has never been edited must behave as **invite-only** (`openSignup: false`). A malformed stored
 * config falling open would silently un-gate the product.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { moduleFindUnique, runFindFirst } = vi.hoisted(() => ({
  moduleFindUnique: vi.fn(),
  runFindFirst: vi.fn(),
}));
vi.mock('@/lib/db/client', () => ({
  prisma: {
    module: { findUnique: moduleFindUnique },
    reclaimAuditRun: { findFirst: runFindFirst },
  },
}));

import {
  readReclaimUiConfig,
  readReclaimAccessConfig,
  readReclaimSignposts,
} from '@/lib/app/programme/config';
import { RECLAIM_PROCESS_OUTLINE } from '@/lib/app/programme/content';

beforeEach(() => {
  moduleFindUnique.mockReset();
  runFindFirst.mockReset();
});

const USER = 'user-1';

describe('readReclaimUiConfig — the strategy mirror (open item 10)', () => {
  it('shows the mirror on an unedited module row, because the default is `always`', async () => {
    moduleFindUnique.mockResolvedValue({ config: {} });
    expect(await readReclaimUiConfig(USER)).toMatchObject({ strategyMirror: true });
  });

  it('does not query runs for `always` — the mode alone settles it', async () => {
    moduleFindUnique.mockResolvedValue({ config: { strategyMirrorMode: 'always' } });
    expect(await readReclaimUiConfig(USER)).toMatchObject({ strategyMirror: true });
    expect(runFindFirst).not.toHaveBeenCalled();
  });

  it('hides the mirror on `off`, without querying runs', async () => {
    moduleFindUnique.mockResolvedValue({ config: { strategyMirrorMode: 'off' } });
    expect(await readReclaimUiConfig(USER)).toMatchObject({ strategyMirror: false });
    expect(runFindFirst).not.toHaveBeenCalled();
  });

  it("hides the mirror on `repeat_only` during a leader's first audit", async () => {
    moduleFindUnique.mockResolvedValue({ config: { strategyMirrorMode: 'repeat_only' } });
    runFindFirst.mockResolvedValue(null);
    expect(await readReclaimUiConfig(USER)).toMatchObject({ strategyMirror: false });
  });

  it('shows the mirror on `repeat_only` once an audit has been completed', async () => {
    moduleFindUnique.mockResolvedValue({ config: { strategyMirrorMode: 'repeat_only' } });
    runFindFirst.mockResolvedValue({ id: 'run-earlier' });
    expect(await readReclaimUiConfig(USER)).toMatchObject({ strategyMirror: true });
    // Scoped to this leader and to finished audits: another leader's history must not unlock it, and
    // neither must the audit currently in progress.
    expect(runFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: USER, status: 'complete' } })
    );
  });

  it('falls back to defaults when the module row is missing', async () => {
    moduleFindUnique.mockResolvedValue(null);
    expect(await readReclaimUiConfig(USER)).toMatchObject({ strategyMirror: true });
  });

  it('falls back to defaults when the stored config is malformed', async () => {
    moduleFindUnique.mockResolvedValue({ config: { strategyMirrorMode: 'sometimes' } });
    expect(await readReclaimUiConfig(USER)).toMatchObject({ strategyMirror: true });
  });

  /**
   * The reason `strategyMirrorMode` is a NEW key rather than the old `strategyMirror` retyped.
   *
   * Any row saved through the content editor carries the retired booleans, because `saveModuleConfig`
   * replaces the whole config object. `readReclaimConfig` parses all-or-nothing and falls back to
   * `parse({})`, so had the key been retyped in place this row would fail to parse and silently
   * revert every value Rashmir had edited — her content strings included. Unknown keys are stripped
   * instead, which is what makes that impossible.
   */
  it('ignores the retired booleans on a row saved before the decision, keeping the rest intact', async () => {
    moduleFindUnique.mockResolvedValue({
      config: { strategyMirror: false, phase2CoachingSignal: true, policyVersion: 'draft-7' },
    });
    expect(await readReclaimUiConfig(USER)).toMatchObject({ strategyMirror: true });
    expect((await readReclaimAccessConfig()).policyVersion).toBe('draft-7');
  });
});

describe('the phase signposts — how a phase opens itself', () => {
  it('serves the shipped cards on an unedited row', async () => {
    moduleFindUnique.mockResolvedValue({ config: {} });

    const signposts = await readReclaimSignposts();

    expect(signposts.map((s) => s.phaseKey)).toContain('phase-0-setup');
    expect(signposts.find((s) => s.phaseKey === 'phase-0-setup')!.opening).toContain(
      RECLAIM_PROCESS_OUTLINE
    );
  });

  it("serves Rashmir's rewording rather than the shipped copy once she has edited it", async () => {
    // The whole reason the cards are config and not constants: how a phase greets someone is hers to
    // change without a deploy (I11).
    moduleFindUnique.mockResolvedValue({
      config: {
        phaseSignposts: [
          {
            phaseKey: 'phase-0-setup',
            involves: 'HERS',
            duration: 'a moment',
            opening: ['HER OPEN'],
          },
        ],
      },
    });

    const signposts = await readReclaimSignposts();

    expect(signposts).toHaveLength(1);
    expect(signposts[0].opening).toEqual(['HER OPEN']);
  });

  it('falls back to the shipped cards when the stored config is malformed', async () => {
    // A card is the first thing a leader reads in a phase. A bad row must cost them nothing.
    moduleFindUnique.mockResolvedValue({ config: { phaseSignposts: 'not-an-array' } });

    expect((await readReclaimSignposts()).length).toBeGreaterThan(0);
  });

  it('reaches the UI config too, so the shell and the coach read one source', async () => {
    moduleFindUnique.mockResolvedValue({ config: {} });

    const ui = await readReclaimUiConfig(USER);

    expect(ui.phaseSignposts.length).toBeGreaterThan(0);
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
