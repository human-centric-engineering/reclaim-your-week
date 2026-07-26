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
}

/** The subset the entitlement gate and consent gate need (F8). */
export interface ReclaimAccessConfig {
  clientWindowMonths: number;
  clientMustStartWithinDays: number;
  openSignup: boolean;
  policyVersion: string;
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
  if (config.strategyMirrorMode === 'off') return { strategyMirror: false };
  if (config.strategyMirrorMode === 'always') return { strategyMirror: true };
  return { strategyMirror: await hasCompletedAudit(userId) };
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
