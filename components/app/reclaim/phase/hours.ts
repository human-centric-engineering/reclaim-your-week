/**
 * Shared hours/count parsing for the phase panels (I8 — the audit works in hours, never percentages).
 * A single source for the two shapes that recurred across setup / Phase 1 / Phase 3: clamp a text
 * input to a non-negative number for display + arithmetic, and decide whether an input is worth
 * persisting. Kept dependency-free so any panel can import it.
 */

/** Parse an hours/count input to a non-negative number, or 0 when blank or invalid. */
export function parseHours(v: string): number {
  const n = Number(v);
  return v.trim().length > 0 && Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * True when `v` is a non-negative finite number — a valid hours/count entry worth saving. Distinct
 * from `parseHours(v) > 0`: an explicit "0" is a real answer (0 hours), a stray "-" or "" is not.
 */
export function isHours(v: string): boolean {
  const n = Number(v);
  return v.trim().length > 0 && Number.isFinite(n) && n >= 0;
}
