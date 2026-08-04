/**
 * Read the coach-editable Reclaim config (F7, extended F8).
 *
 * Several readers over one `Module.config` row: the **UI** setting the phase screens fetch, and the
 * **access policy** the server-side gate reads (F8 — the client window, the open-signup door, the
 * policy version), among others. All fall back to the schema defaults, so a module row that has never
 * been edited behaves exactly as `reclaimConfigSchema.parse({})` says it should.
 *
 * Everything here is config rather than feature-flag machinery, deliberately: these are decisions
 * Rashmir makes and changes, not release toggles an engineer flips.
 */

import { prisma } from '@/lib/db/client';
import { hasCompletedAudit } from '@/lib/app/programme/compare';
import type { PhaseSignpost } from '@/lib/app/programme/runs/signposts';
import type { PresentationPolicy } from '@/lib/app/programme/slots/present';
import {
  reclaimConfigSchema,
  RECLAIM_MODULE_SLUG,
  type ReclaimConfig,
} from '@/lib/app/programme/module';

/**
 * The subset of config the client UIs need.
 *
 * Still a plain `boolean` even though the stored value is now a three-way mode: the client asks
 * "should I render the strategy mirror for *this* leader", and resolving `repeat_only` needs a
 * database read the browser has no business making. Keeping the answer here means `phase4-panel`
 * never learns that placement is configurable at all.
 */
export interface ReclaimUiConfig {
  strategyMirror: boolean;
  /**
   * The per-phase signpost cards, which are how a phase opens itself before anyone speaks.
   *
   * Served to the client rather than imported from the constants, so an operator's rewording reaches
   * the screen the same way it reaches the coach's context. The client falls back to the shipped
   * defaults if this read fails, because a leader should never meet a phase with no orientation at
   * all just because a config row could not be read.
   */
  phaseSignposts: PhaseSignpost[];
  calendarExportSteps: ReclaimCalendarExport[];
  /**
   * How much of a phase has to be covered before the move onward is offered, as a percentage.
   *
   * Served rather than compiled in because it is the operator's judgement about how much of a phase
   * counts as having happened. The conversation falls back to the schema default if this read fails,
   * so a config the browser could not fetch never strands a leader behind a threshold of 100.
   */
  phaseCoveredPercent: number;
}

/** One service's export walkthrough, shown on the upload screen. */
export interface ReclaimCalendarExport {
  service: string;
  steps: string[];
}

/**
 * The calendar export walkthroughs, as the operator currently has them.
 *
 * Read at the upload step rather than injected into the conversation, which is where the content
 * extract puts them: a list of menu clicks is something a leader scans while tabbing to another
 * window. It also keeps them out of a model's recall, which matters here more than usual — the
 * transcription audit found the Outlook steps had once been invented outright.
 */
export async function readReclaimCalendarExports(): Promise<ReclaimCalendarExport[]> {
  return (await readReclaimConfig()).calendarExportSteps;
}

/** The subset the entitlement gate and consent gate need (F8). */
export interface ReclaimAccessConfig {
  clientWindowMonths: number;
  clientMustStartWithinDays: number;
  openSignup: boolean;
  policyVersion: string;
}

/** The subset the group-invite-link surfaces need (F11): what to default a link to, and the ceiling. */
export interface ReclaimJoinConfig {
  joinLinkDefaultMaxClaims: number;
  joinLinkDefaultDays: number;
  joinLinkMaxClaims: number;
}

/** The subset the recent-audit shortcut needs (F9 t-2): the confirm line and its window. */
export interface ReclaimShortcutConfig {
  recentAuditConfirm: string;
  recentAuditWithinDays: number;
}

/** The subset the quarterly nudge needs (F9 t-3): both ends of its window. */
export interface ReclaimNudgeConfig {
  nudgeAfterDays: number;
  nudgeUntilDays: number;
}

/** The subset the admin surfaces need (F10): the stall rule and the anonymity floor. */
export interface ReclaimAdminConfig {
  abandonedAfterDays: number;
  aggregateMinimumCohort: number;
}

/**
 * The subset the coach needs in its prompt context — Rashmir's own words, as the operator currently
 * has them.
 *
 * The agent's system instructions have always said that "the tool's governing frame and the areas of
 * leadership time are supplied to you in context", and I11 is the reason they are not restated in the
 * authored prose: one source of truth, editable without a deploy. What was missing was the supply. The
 * framework's module context injects the module's name, description and the user's slot values, and
 * nothing has ever injected `Module.config`, so the coach has been running a nine-area audit without
 * the nine areas. It did not show while the phases were forms, because the panels read this config
 * directly and the coach was rendered nowhere.
 *
 * Read from the stored row, so an operator's rewording reaches the conversation the same way it
 * reaches the screen.
 */
export interface ReclaimCoachContent {
  governingFrame: string;
  buckets: ReclaimConfig['buckets'];
  deepWorkNote: string;
  hourBands: ReclaimConfig['hourBands'];
  /** Which of a reading's two strings the prompt shows. See `slots/present.ts`. */
  presentation: PresentationPolicy;
  /** How the coach works through a phase's readings: paired or singly, opportunistic or in order. */
  questioning: ReclaimConfig['questioning'];
  /** Whether the strategy mirror is live for this leader. Resolved, not the raw mode. */
  strategyMirror: boolean;
  /**
   * The operator's coverage threshold, so the briefing can work out whether the way onward is
   * currently offered and tell the coach the truth about it.
   *
   * The screen has always decided this for itself (`coach/coverage.ts`, via the same number served to
   * the client). The coach was told it could not see the answer and forbidden from mentioning the
   * move at all — and then said "whenever you're ready, you can move on to the next section" beside a
   * screen offering nothing. It is here so that both surfaces answer the question from the same
   * figure rather than one of them guessing.
   */
  phaseCoveredPercent: number;
}

/**
 * The coach's view of the config, resolved for one leader.
 *
 * `userId` is what makes `strategyMirror` answerable: the mode is `off | always | repeat_only`, and
 * only the last of those depends on who is asking. Resolving it here rather than in the prompt builder
 * keeps one home for the policy — `readReclaimUiConfig` answers the same question for the form panel
 * through the same helper, so the two surfaces cannot drift into disagreeing about whether the mirror
 * is on.
 */
export async function readReclaimCoachContent(userId: string): Promise<ReclaimCoachContent> {
  const config = await readReclaimConfig();
  return {
    governingFrame: config.governingFrame,
    buckets: config.buckets,
    deepWorkNote: config.deepWorkNote,
    hourBands: config.hourBands,
    presentation: {
      lean: config.answerPresentation,
      overrides: config.answerPresentationOverrides,
    },
    questioning: config.questioning,
    strategyMirror: await resolveStrategyMirror(config, userId),
    phaseCoveredPercent: config.phaseCoveredPercent,
  };
}

/** Whether the strategy mirror is live for this leader. One reading of the mode, two callers. */
async function resolveStrategyMirror(config: ReclaimConfig, userId: string): Promise<boolean> {
  if (config.strategyMirrorMode === 'off') return false;
  if (config.strategyMirrorMode === 'always') return true;
  return hasCompletedAudit(userId);
}

/** Read + parse the stored module config, falling back to the schema defaults. */
async function readReclaimConfig(): Promise<ReclaimConfig> {
  const row = await prisma.module.findUnique({
    where: { slug: RECLAIM_MODULE_SLUG },
    select: { config: true },
  });
  const parsed = reclaimConfigSchema.safeParse(row?.config ?? {});
  return parsed.success ? parsed.data : reclaimConfigSchema.parse({});
}

/**
 * Resolve the UI config for one leader (open item 10).
 *
 * `repeat_only` is the only mode that costs a query, and it only costs one when selected — `off` and
 * `always` are answered from the config row alone.
 */
export async function readReclaimUiConfig(userId: string): Promise<ReclaimUiConfig> {
  const config = await readReclaimConfig();
  return {
    strategyMirror: await resolveStrategyMirror(config, userId),
    phaseSignposts: config.phaseSignposts,
    calendarExportSteps: config.calendarExportSteps,
    phaseCoveredPercent: config.phaseCoveredPercent,
  };
}

/**
 * The signposts alone, for a reader that wants nothing else.
 *
 * Separate from `readReclaimUiConfig` and `readReclaimCoachContent` because both of those resolve
 * `repeat_only` with a database read per call. The smoke script checks the cards are seeded and has
 * no leader to resolve anything for, so it takes this one.
 */
export async function readReclaimSignposts(): Promise<PhaseSignpost[]> {
  return (await readReclaimConfig()).phaseSignposts;
}

/**
 * The presentation policy alone, for a reader that has no leader to resolve anything else for.
 *
 * The refer-back is built beside the phase block rather than inside it, so it cannot borrow the config
 * that block already read. This is the narrow read that keeps it honest about whether it is serving a
 * quote — one indexed lookup, no user query, no `repeat_only` resolution.
 */
export async function readReclaimPresentation(): Promise<PresentationPolicy> {
  const config = await readReclaimConfig();
  return { lean: config.answerPresentation, overrides: config.answerPresentationOverrides };
}

/** Read the access policy (F8): client-window durations, the open-signup door, the policy version. */
export async function readReclaimAccessConfig(): Promise<ReclaimAccessConfig> {
  const config = await readReclaimConfig();
  return {
    clientWindowMonths: config.clientWindowMonths,
    clientMustStartWithinDays: config.clientMustStartWithinDays,
    openSignup: config.openSignup,
    policyVersion: config.policyVersion,
  };
}

/**
 * Read the group-invite-link policy (F11): the mint-form defaults and the seat ceiling.
 *
 * Read on the admin form (to prefill) and again on the server at mint (to refuse). Both, deliberately
 * — a ceiling enforced only where the form renders it is not a ceiling.
 */
export async function readReclaimJoinConfig(): Promise<ReclaimJoinConfig> {
  const config = await readReclaimConfig();
  return {
    joinLinkDefaultMaxClaims: config.joinLinkDefaultMaxClaims,
    joinLinkDefaultDays: config.joinLinkDefaultDays,
    joinLinkMaxClaims: config.joinLinkMaxClaims,
  };
}

/** Read the shortcut policy (F9 t-2): the §4 confirm line and how recent "recent" is. */
export async function readReclaimShortcutConfig(): Promise<ReclaimShortcutConfig> {
  const config = await readReclaimConfig();
  return {
    recentAuditConfirm: config.recentAuditConfirm,
    recentAuditWithinDays: config.recentAuditWithinDays,
  };
}

/** Read the nudge window (F9 t-3) — both ends coach-editable, per Brief §2. */
export async function readReclaimNudgeConfig(): Promise<ReclaimNudgeConfig> {
  const config = await readReclaimConfig();
  return { nudgeAfterDays: config.nudgeAfterDays, nudgeUntilDays: config.nudgeUntilDays };
}

/** Read the admin policy (F10): when an unfinished audit reads as stalled, and the anonymity floor. */
export async function readReclaimAdminConfig(): Promise<ReclaimAdminConfig> {
  const config = await readReclaimConfig();
  return {
    abandonedAfterDays: config.abandonedAfterDays,
    aggregateMinimumCohort: config.aggregateMinimumCohort,
  };
}
