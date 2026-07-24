/**
 * Fork-owned ESLint config seam.
 *
 * **Fork-owned scaffold** — Sunrise ships this as `export default []` and does
 * NOT change it after release, so your edits here merge cleanly on upgrade (the
 * stable contract is this file's default export — an array of flat-config
 * blocks — not its contents). Treat it like the other `lib/app/*` seams.
 *
 * Auto-wired: the root `eslint.config.mjs` spreads this array **after** all
 * Sunrise core blocks, so a fork adds its own import-boundary rules (e.g. a
 * `framework ↔ core` layer boundary) here instead of editing the platform
 * config — no merge conflict on `git merge vX.Y.Z`.
 *
 * Two load-bearing rules of the seam:
 *
 * 1. **Spread order matters — this array lands LAST.** Because a later
 *    flat-config block overrides an earlier one for overlapping `files`, a fork
 *    block here wins for its own paths. A framework-tier fork (Sunrise →
 *    framework → leaf) spreads its `lib/framework/eslint.config.mjs` first and
 *    keeps this leaf seam last.
 *
 * 2. **`no-restricted-imports` REPLACES, it does not merge.** Flat config does
 *    not deep-merge rule options: a block that sets `no-restricted-imports` for
 *    a glob fully replaces any earlier setting for the files it matches — it
 *    does NOT add to it. So a fork block that restricts its own imports must
 *    **restate the base `@/`-alias ban** (the `no-restricted-imports` rule from
 *    core) for its globs, or relative-import enforcement silently drops on those
 *    paths. Restate the whole rule per glob; don't assume core's still applies.
 *
 * Example (a fork's `framework ↔ core` boundary — put the blocks in this array):
 *
 *   export default [
 *     {
 *       files: ['lib/framework/**\/*.{ts,tsx}'],
 *       rules: {
 *         'no-restricted-imports': ['error', { patterns: [
 *           // restate the core @/-alias ban for this glob (replace-not-merge)…
 *           { group: ['./*', '../*'], message: 'Use the @/ alias, not relative paths.' },
 *           // …then add the fork's own boundary rule:
 *           { group: ['@/lib/app/*'], message: 'framework must not import the leaf app tier.' },
 *         ] }],
 *       },
 *     },
 *   ];
 *
 * See CUSTOMIZATION.md §4 and .context/architecture/lint-toolchain.md.
 */
export default [
  // ── Leaf-seed exemption from the core → framework import ban (F3) ──────────
  // `prisma/seeds/app-reclaim/**` seeds this leaf's framework *configuration*: it publishes the
  // journey map (`createGraph`), syncs + activates the module (`initFramework`/`initLeafApp`/
  // `syncFramework`), and binds the coach agent (`bindAgent`) — all of which must import
  // `@/lib/framework`. These seeds run via `tsx` (`prisma/seed.ts`) and are NEVER part of
  // `next build`, so the build-time rationale behind Daybreak's core → framework ban
  // (`lib/framework/eslint.config.mjs`) does not apply — exactly as it already does not for the
  // exempted `scripts/smoke/**`. Daybreak's ignore list could not anticipate this path (RYW is the
  // framework's first leaf), so the leaf re-permits it through its own seam here. This block is
  // spread last (root `eslint.config.mjs`), so it wins for these files; `no-restricted-imports`
  // REPLACES rather than merges, so the core `@/`-alias ban is restated below. Filed as a
  // daybreak-ask so a future sync can fold the leaf-seed path into the upstream ignore list.
  {
    files: ['prisma/seeds/app-reclaim/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['./*', '../*'],
              message: 'Use the @/ path alias instead of relative imports (CLAUDE.md).',
            },
          ],
        },
      ],
    },
  },
];
