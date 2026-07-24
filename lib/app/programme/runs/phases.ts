/**
 * Phase adjacency + reflection-slot derivation for the audit run (F4 t-3). Pure and DB-free, so it
 * lives in `lib/app` (no Prisma) and is unit-tested directly. The seven phases are the map's `stage`
 * nodes (`lib/app/programme/map.ts`); a "transition" advances one phase by completing the current
 * node and entering the next.
 */

import { RECLAIM_PHASES } from '@/lib/app/programme/map';

/** The seven phase node keys in order: `phase-0-setup … phase-6-summary`. Widened to `string[]` so
 *  runtime lookups (`indexOf`/`includes`) accept an arbitrary key, not just the literal union. */
export const RECLAIM_PHASE_KEYS: readonly string[] = RECLAIM_PHASES.map((p) => p.key);

/** The first phase — where a fresh run starts. */
export const FIRST_PHASE_KEY = RECLAIM_PHASE_KEYS[0];

/** The last phase — completing it completes the run. */
export const FINAL_PHASE_KEY = RECLAIM_PHASE_KEYS[RECLAIM_PHASE_KEYS.length - 1];

/** The 0–6 index encoded in a phase key (`phase-4-gap` → 4), or `null` if the key is not a phase. */
export function phaseNumber(nodeKey: string): number | null {
  const index = RECLAIM_PHASE_KEYS.indexOf(nodeKey);
  return index === -1 ? null : index;
}

/** The phase after `nodeKey`, or `null` if it is the final phase (or unknown). */
export function nextPhaseKey(nodeKey: string): string | null {
  const index = RECLAIM_PHASE_KEYS.indexOf(nodeKey);
  if (index === -1 || index === RECLAIM_PHASE_KEYS.length - 1) return null;
  return RECLAIM_PHASE_KEYS[index + 1];
}

/**
 * The reflection slot that must be present before leaving `nodeKey`, or `null` when the phase has
 * none. Reflection pauses exist for phases **1–5** (`reclaim_reflection_p1 … p5`) — Phase 0 (setup)
 * and Phase 6 (summary) have no required reflection. This is the slug the server checks to enforce
 * I9; a missing head means `422 REFLECTION_REQUIRED`.
 */
export function reflectionSlugForLeaving(nodeKey: string): string | null {
  const n = phaseNumber(nodeKey);
  if (n === null || n < 1 || n > 5) return null;
  return `reclaim_reflection_p${n}`;
}
