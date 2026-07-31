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

/**
 * The **diverging** pair, for the one chart whose subject is a direction rather than an identity.
 *
 * `<GapChart>` plots `ideal − current` either side of a centre line, so the question every bar answers
 * is *which way*, not *which area* — the area is already named in the row label beside it. Colouring
 * those bars by bucket would spend the identity channel re-encoding something the label carries and
 * leave the polarity, which is the whole point of the chart, encoded by position alone. So a diverging
 * chart takes two poles and a neutral middle, per the dataviz formula, and the nine-hue categorical set
 * above is deliberately not used there.
 *
 * Warm/cool, so the two poles read as opposites: the brand teal for *more* (the direction the audit is
 * mostly trying to open up) and a bronze for *less*. **Bronze rather than red** — wanting fewer hours
 * in delivery and operations is the healthy answer, not a failure, and red would score it as one.
 *
 * Both modes pass all six dataviz checks against this app's own surfaces (`#ffffff` light,
 * `#112c36` dark): lightness band, chroma floor, CVD separation (worst pair ΔE 16.2 light / 16.4 dark,
 * ≥8 target), normal-vision separation (23.4 / 21.5, ≥15 floor) and 3:1 contrast. The steps differ from
 * `deep_work` / `fundraising_capital` above for that reason — those are stepped for a nine-way
 * adjacent-pair test, these for a two-pole one.
 */
const POLARITY = {
  light: { more: '#0E7E9E', less: '#BD7530' },
  dark: { more: '#2F9BB8', less: '#C4853F' },
} as const;

/** The pole colour for a gap direction: `more` hours wanted, or `less`. */
export function gapColour(direction: 'more' | 'less', mode: 'light' | 'dark'): string {
  return POLARITY[mode][direction];
}
