/**
 * Provisional `<ReclaimChart>` colour palette (F6 t-3). **Brand-sympathetic, changeable later** — a
 * teal-anchored spread (deep teal `#0D4F68` + cream/khaki warms from the confirmed brand) rather than
 * Rashmir's per-bucket `RECLAIM_BUCKETS.colour` IP, which is left untouched in `content.ts`. Chosen at
 * John's direction while the three open colour questions (open items 1 & 3 — the source palette's
 * "bright, obviously distinguishable" bar, the strategic-blue/brand-teal collision, dark-mode variants)
 * remain Rashmir's to rule.
 *
 * Validated with the dataviz palette checker: the light set passes the lightness band; identity is
 * carried by **direct bar labels** (each bar shows its bucket name + hours), the sanctioned secondary
 * encoding for a nine-category set — colour is decorative grouping, never the sole identity channel.
 * Dark steps are lighter re-steps of the same hues for a dark surface.
 */

import { RECLAIM_BUCKETS, bucketToken } from '@/lib/app/programme/content';

/** Light-mode hue per bucket token. */
const LIGHT: Record<string, string> = {
  deep_work: '#0D6A86',
  learning_development: '#4FA36B',
  strategic_planning: '#3E5C8A',
  team_development: '#58B0C9',
  organisational_oversight: '#8E7CC3',
  fundraising_capital: '#B87333',
  relationship_building: '#E0A82E',
  delivery_operations: '#D9534F',
  recovery_white_space: '#7BA05B',
};

/** Dark-mode hue per bucket token — lighter re-steps of the same hues against a dark surface. */
const DARK: Record<string, string> = {
  deep_work: '#3FA6C0',
  learning_development: '#78C892',
  strategic_planning: '#7E97C8',
  team_development: '#8FD0E0',
  organisational_oversight: '#B4A6E0',
  fundraising_capital: '#D89A54',
  relationship_building: '#F0C64E',
  delivery_operations: '#E8827E',
  recovery_white_space: '#A6C57F',
};

const FALLBACK_LIGHT = '#0D4F68';
const FALLBACK_DARK = '#6BB4CF';

/** The bucket colour for a mode, keyed by slot token. Falls back to the brand teal for an unknown token. */
export function bucketColour(token: string, mode: 'light' | 'dark'): string {
  const map = mode === 'dark' ? DARK : LIGHT;
  return map[token] ?? (mode === 'dark' ? FALLBACK_DARK : FALLBACK_LIGHT);
}

/** Every bucket token in canonical display order (I7 order from `RECLAIM_BUCKETS`). */
export const BUCKET_ORDER = RECLAIM_BUCKETS.map((b) => bucketToken(b.slug));
