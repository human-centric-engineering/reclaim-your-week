/**
 * Read the coach-editable Reclaim config (F7, extended F8).
 *
 * Two readers over one `Module.config` row: the **UI** toggles the phase screens fetch (F7's two open
 * items), and the **access policy** the server-side gate reads (F8 — the client window, the open-signup
 * door, the policy version). Both fall back to the schema defaults, so a module row that has never been
 * edited behaves exactly as `reclaimConfigSchema.parse({})` says it should.
 *
 * Everything here is config rather than feature-flag machinery, deliberately: these are decisions
 * Rashmir makes and changes, not release toggles an engineer flips.
 */

import { prisma } from '@/lib/db/client';
import {
  reclaimConfigSchema,
  RECLAIM_MODULE_SLUG,
  type ReclaimConfig,
} from '@/lib/app/programme/module';

/** The subset of config the client UIs need — the two open-item toggles. */
export interface ReclaimUiConfig {
  phase2CoachingSignal: boolean;
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

/** Read the stored module config, falling back to the schema defaults (both toggles off). */
export async function readReclaimUiConfig(): Promise<ReclaimUiConfig> {
  const config = await readReclaimConfig();
  return {
    phase2CoachingSignal: config.phase2CoachingSignal,
    strategyMirror: config.strategyMirror,
  };
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

/** Read the admin policy (F10): when an unfinished audit reads as stalled, and the anonymity floor. */
export async function readReclaimAdminConfig(): Promise<ReclaimAdminConfig> {
  const config = await readReclaimConfig();
  return {
    abandonedAfterDays: config.abandonedAfterDays,
    aggregateMinimumCohort: config.aggregateMinimumCohort,
  };
}
