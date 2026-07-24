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
  // ── Leaf exemption from the core → framework import ban (F3, F4) ───────────
  // The leaf-OWNED paths that legitimately consume `@/lib/framework`. The leaf is built ON the
  // framework (Sunrise → Daybreak → this app), so — unlike Sunrise core, which the ban protects — it
  // may import it. Daybreak's own ban already exempts `lib/app/**` and the framework-tier app routes
  // for exactly this reason; its ignore list simply could not anticipate the leaf's own paths (RYW is
  // the framework's first leaf):
  //   - `prisma/seeds/app-reclaim/**` — seeds framework config (`createGraph` / `syncFramework` /
  //     `bindAgent`); runs via `tsx`, never in `next build`, like the exempted `scripts/smoke/**`.
  //   - `app/api/v1/app/**`, `app/(protected)/programme/**`, `app/admin/programme/**` — the leaf's API
  //     and UI surfaces, which call framework services (`applyJourneyTransition`, `resolveModuleSurface`,
  //     …). These ARE part of `next build`, but the build-time rationale for the ban (a fork WITHOUT a
  //     `lib/framework/` folder would fail to resolve the specifier) does not apply: these paths exist
  //     only in a leaf, and a leaf always has `lib/framework`.
  // Filed as a daybreak-ask (daybreak#157) so a future sync folds these leaf-owned paths into the
  // upstream ignore list, after which this block is deleted. Spread last, so it wins for these files;
  // `no-restricted-imports` REPLACES rather than merges, so the core `@/`-alias ban is restated below.
  {
    files: [
      'prisma/seeds/app-reclaim/**/*.{ts,tsx}',
      'app/api/v1/app/**/*.{ts,tsx}',
      'app/(protected)/programme/**/*.{ts,tsx}',
      'app/admin/programme/**/*.{ts,tsx}',
    ],
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
