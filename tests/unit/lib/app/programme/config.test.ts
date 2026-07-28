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
  readReclaimCalendarExports,
  readReclaimCoachContent,
  readReclaimPresentation,
  readReclaimJoinConfig,
  readReclaimShortcutConfig,
  readReclaimNudgeConfig,
  readReclaimAdminConfig,
} from '@/lib/app/programme/config';
import {
  RECLAIM_PROCESS_OUTLINE,
  RECLAIM_CALENDAR_EXPORT_STEPS,
} from '@/lib/app/programme/content';
import { DEFAULT_PRESENTATION } from '@/lib/app/programme/slots/present';

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

describe('readReclaimCalendarExports', () => {
  it('serves the shipped walkthroughs on an unedited row', async () => {
    moduleFindUnique.mockResolvedValue({ config: {} });
    expect(await readReclaimCalendarExports()).toEqual(RECLAIM_CALENDAR_EXPORT_STEPS);
  });

  it("serves Rashmir's rewording once she has edited the walkthroughs", async () => {
    moduleFindUnique.mockResolvedValue({
      config: { calendarExportSteps: [{ service: 'Fake Cal', steps: ['Click here'] }] },
    });
    expect(await readReclaimCalendarExports()).toEqual([
      { service: 'Fake Cal', steps: ['Click here'] },
    ]);
  });
});

describe('readReclaimCoachContent — the coach’s prompt context', () => {
  it('resolves governing frame, presentation, and questioning from an unedited row', async () => {
    moduleFindUnique.mockResolvedValue({ config: {} });

    const content = await readReclaimCoachContent(USER);

    expect(content.presentation).toEqual(DEFAULT_PRESENTATION);
    expect(content.questioning).toEqual({ pairing: 'paired', opportunistic: true });
    expect(content.strategyMirror).toBe(true); // default mode is `always`
    expect(content.governingFrame.length).toBeGreaterThan(0);
  });

  it('reflects an edited presentation lean and per-slug overrides, the same as the UI reads', async () => {
    moduleFindUnique.mockResolvedValue({
      config: {
        answerPresentation: 'verbatim',
        answerPresentationOverrides: { reclaim_action_stopping: 'paraphrase' },
      },
    });

    const content = await readReclaimCoachContent(USER);

    expect(content.presentation).toEqual({
      lean: 'verbatim',
      overrides: { reclaim_action_stopping: 'paraphrase' },
    });
  });

  it('resolves `repeat_only` per leader, exactly as `readReclaimUiConfig` does', async () => {
    moduleFindUnique.mockResolvedValue({ config: { strategyMirrorMode: 'repeat_only' } });
    runFindFirst.mockResolvedValue(null);

    expect((await readReclaimCoachContent(USER)).strategyMirror).toBe(false);
  });
});

describe('readReclaimPresentation — the narrow read for the refer-back', () => {
  it('reads the lean + overrides alone, with no user query at all', async () => {
    moduleFindUnique.mockResolvedValue({ config: {} });

    expect(await readReclaimPresentation()).toEqual(DEFAULT_PRESENTATION);
    expect(runFindFirst).not.toHaveBeenCalled();
  });

  it("honours Rashmir's stored lean and overrides", async () => {
    moduleFindUnique.mockResolvedValue({
      config: { answerPresentation: 'verbatim', answerPresentationOverrides: {} },
    });

    expect(await readReclaimPresentation()).toEqual({ lean: 'verbatim', overrides: {} });
  });

  it('propagates a database failure rather than swallowing it — the caller supplies the fallback', async () => {
    // `lib/app/context-contributors.ts` does `readReclaimPresentation().catch(() => DEFAULT_PRESENTATION)`
    // — a leader must never meet a phase with no orientation just because a config read failed. That
    // recovery only works if this function actually rejects rather than resolving to a silent default
    // of its own; a swallowed error here would make the `.catch` downstream dead code.
    const dbError = new Error('connection reset');
    moduleFindUnique.mockRejectedValue(dbError);

    await expect(readReclaimPresentation()).rejects.toBe(dbError);
  });
});

describe('readReclaimJoinConfig (F11)', () => {
  it('defaults the mint-form values and the ceiling', async () => {
    moduleFindUnique.mockResolvedValue({ config: {} });
    expect(await readReclaimJoinConfig()).toEqual({
      joinLinkDefaultMaxClaims: 10,
      joinLinkDefaultDays: 7,
      joinLinkMaxClaims: 50,
    });
  });

  it('honours a stored ceiling — both the admin form and the mint path read the same row', async () => {
    moduleFindUnique.mockResolvedValue({
      config: { joinLinkDefaultMaxClaims: 20, joinLinkDefaultDays: 14, joinLinkMaxClaims: 100 },
    });
    expect(await readReclaimJoinConfig()).toEqual({
      joinLinkDefaultMaxClaims: 20,
      joinLinkDefaultDays: 14,
      joinLinkMaxClaims: 100,
    });
  });
});

describe('readReclaimShortcutConfig (F9 t-2)', () => {
  it('defaults the confirm line and the recency window', async () => {
    moduleFindUnique.mockResolvedValue({ config: {} });
    const config = await readReclaimShortcutConfig();
    expect(config.recentAuditWithinDays).toBe(31);
    expect(config.recentAuditConfirm.length).toBeGreaterThan(0);
  });

  it('honours a stored confirm line and window', async () => {
    moduleFindUnique.mockResolvedValue({
      config: { recentAuditConfirm: 'Use last time?', recentAuditWithinDays: 60 },
    });
    expect(await readReclaimShortcutConfig()).toEqual({
      recentAuditConfirm: 'Use last time?',
      recentAuditWithinDays: 60,
    });
  });
});

describe('readReclaimNudgeConfig (F9 t-3)', () => {
  it('defaults both ends of the window', async () => {
    moduleFindUnique.mockResolvedValue({ config: {} });
    expect(await readReclaimNudgeConfig()).toEqual({ nudgeAfterDays: 90, nudgeUntilDays: 200 });
  });

  it('honours a stored window', async () => {
    moduleFindUnique.mockResolvedValue({ config: { nudgeAfterDays: 60, nudgeUntilDays: 150 } });
    expect(await readReclaimNudgeConfig()).toEqual({ nudgeAfterDays: 60, nudgeUntilDays: 150 });
  });
});

describe('readReclaimAdminConfig (F10)', () => {
  it('defaults the stall rule and the anonymity floor', async () => {
    moduleFindUnique.mockResolvedValue({ config: {} });
    expect(await readReclaimAdminConfig()).toEqual({
      abandonedAfterDays: 21,
      aggregateMinimumCohort: 5,
    });
  });

  it('honours a stored stall rule and anonymity floor', async () => {
    moduleFindUnique.mockResolvedValue({
      config: { abandonedAfterDays: 45, aggregateMinimumCohort: 10 },
    });
    expect(await readReclaimAdminConfig()).toEqual({
      abandonedAfterDays: 45,
      aggregateMinimumCohort: 10,
    });
  });
});
