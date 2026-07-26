/**
 * The `reclaim-audit` journey map (F3 t-1).
 *
 * The seven-phase progression a leader walks through an audit: `phase-0-setup` …
 * `phase-6-summary`, a plain prerequisite chain. This is the **journey structure** the
 * framework's facilitation layer reasons over (`UserJourney` + `UserNodeState` per node)
 * — the progress bar and resume in F4 t-4 read it. It is distinct from the **module
 * surface** (`resolveModuleSurface`, one chat conversation per run): the map tracks
 * *where* the leader is; the module *is* the conversation. F3's spike proves both light up.
 *
 * **Why `stage` nodes, not `module` nodes.** A `module`-type node is a distinct place bound
 * to a registered `Module` (it requires a `moduleSlug`), and there is exactly one module
 * here — `reclaim-audit` — reached directly by the leaf's run, never by map navigation (I14).
 * The seven phases are a maturity *progression within* that one journey, which is precisely
 * what `stage` ("maturity markers", `map/schema.ts`) models. Seven module nodes pointing at
 * the same module would misrepresent one chat surface as seven places. This is the node-type
 * question F3 was scoped to resolve against the real schema; resolved to `stage`. F4 t-4's
 * "progress bar over all seven nodes" reads these seven directly.
 *
 * **Why no edge conditions.** The chain is plain `prerequisite` (phase N gates phase N+1) with
 * no `slot`/`state` conditions. Slot conditions read the head version, which breaks on run 2
 * (F1's `runId` provenance is consumed by `saveAnswer` (F4 t-2) and read back per run by F9's trends). Run-aware gating is
 * F4's problem; F3 proves the map publishes and resolves. `completionMode: 'repeatable'` so a
 * repeat audit reopens every phase (Brief §2, F9).
 */

import type { MapDefinition } from '@/lib/framework/facilitation/map';

/** The published `FacilitationGraph.slug` for the audit journey. One map per module; sharing the
 *  module's slug keeps the association obvious. Stable — the journey key everywhere. */
export const RECLAIM_MAP_SLUG = 'reclaim-audit';

/** Human name for the `FacilitationGraph` row (admin-facing). */
export const RECLAIM_MAP_NAME = 'Reclaim Your Week — audit journey';

/**
 * The seven phases in order. `key` is the stable `NodeKey` referenced by journey state (never a
 * row id, I7 sibling); `label` is the operator/UI-facing name (Phase 0 is labelled *Setup*, not
 * hidden — F4 t-4 needs all seven so "you are here" is right on resume). The per-phase signpost
 * line (§5d, F4 t-4) and reflection gating (I9) land in later features; here it is structure only.
 */
export const RECLAIM_PHASES = [
  { key: 'phase-0-setup', label: 'Setup' },
  { key: 'phase-1-current', label: 'Current reality' },
  { key: 'phase-2-energy', label: 'Energy' },
  { key: 'phase-3-ideal', label: 'Ideal week' },
  { key: 'phase-4-gap', label: 'Gap analysis' },
  { key: 'phase-5-action', label: 'Action plan' },
  { key: 'phase-6-summary', label: 'Summary' },
] as const;

/**
 * The authored map definition — seven `stage` nodes in a linear `prerequisite` chain. Validated by
 * `validatePublishableMap` on the way into `createGraph` (the F3 seed) and asserted directly by the
 * no-DB unit test. `phase-0-setup` is the root (no incoming prerequisite); every later phase is
 * reachable through the chain.
 */
export const reclaimJourneyMap: MapDefinition = {
  nodes: RECLAIM_PHASES.map((phase, index) => ({
    key: phase.key,
    type: 'stage' as const,
    completionMode: 'repeatable' as const,
    meta: { label: phase.label, phaseIndex: index },
  })),
  edges: RECLAIM_PHASES.slice(1).map((phase, index) => ({
    // `RECLAIM_PHASES[index]` is the phase *before* `phase` (slice(1) shifts the index by one):
    // phase N gates phase N+1. `prerequisite` is a hard AND gate on the source being complete.
    from: RECLAIM_PHASES[index].key,
    to: phase.key,
    type: 'prerequisite' as const,
  })),
};
