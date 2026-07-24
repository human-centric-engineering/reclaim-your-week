# Daybreak asks — Reclaim Your Week → Daybreak

The leaf-tier sibling of Daybreak's own
[`upstream-asks.md`](../framework/upstream-asks.md), one tier down. Two kinds of
row live here:

- **Fork-first seams** — framework-tier code this app carried because the seam it
  needs does not exist in Daybreak yet. `upstream`'s push URL is disabled, so the
  change lives here until Daybreak adopts it. On every Daybreak pull
  (`git fetch upstream && git merge upstream/main`), check each **open** row: if
  Daybreak has landed it, **delete our copy and delegate**, then close the row.
- **Defects** — framework bugs this app found by being Daybreak's first real
  consumer. That is a stated goal of this build, not a side effect: F3
  (`ryw-firstlight`) budgets two to three, and anything the build trips over
  afterwards belongs here too.

Without this ledger, a framework-tier change we carry either conflicts on the
next sync or quietly becomes permanent local divergence. That is the whole reason
the tier below keeps the same file.

**This is not a boundary-breach log.** A breach is editing a Daybreak-owned file
because no seam exists — those get a minimal `keep-mine` edit and a follow-up, per
the [`CLAUDE.md`](../../CLAUDE.md) banner. This ledger is the sanctioned case: the
code is clean framework-tier work whose final home is upstream.

## The ledger

| Our change                                                                                                                                                                                                                                                        | Feature                                   | Delegate-when-it-lands action                                                                                                                            | Status                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`lib/framework/data-slots/values.ts`](../../lib/framework/data-slots/values.ts) — optional `runId?: string` on `SlotValueProvenance`, plus `getSlotHistory(userId, slotSlug)` returning superseded versions alongside the heads `getSlotHeads()` already returns | [F1 `ryw-provenance`](./planning/plan.md) | Drop our copy in favour of Daybreak's (reconcile the signature if it differs); keep the leaf callers in `saveAnswer()` (I3) and the F9 trend-line reads. | **open — filed [daybreak#156](https://github.com/human-centric-engineering/daybreak/issues/156)** (2026-07-24). Additive and back-compatible, so nothing breaks meanwhile: per-run provenance and value history are generic facilitation needs, not RYW-specific, and any repeat-audit-shaped app hits the same wall. Close this row on the sync that lands it, once our copy is deleted and callers delegate. |

## Defects found in Daybreak

_(none yet — F3 `ryw-firstlight` is the first end-to-end run. Record each one
here with a one-line repro, and add the lesson to
[`planning/planning-retro.md`](./planning/planning-retro.md) §A.)_

| Defect | Found by | Repro | Status |
| ------ | -------- | ----- | ------ |
| —      | —        | —     | —      |

## Adding a row

1. Add the row (our change or the defect, the owning feature, the concrete
   delegate/fix action, status).
2. File it against Daybreak as the feature's own Done-when deliverable — a
   fork-perspective note on an existing issue if one tracks it, otherwise a new one.
3. Close the row on the Daybreak pull that lands it, once our copy is deleted and
   callers delegate.
