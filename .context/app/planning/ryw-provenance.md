---
name: ryw-provenance
feature: F1 · ryw-provenance
epic: RYW v1
status: shipped (t-1 #17 · t-2 close-out)
owner: John
depends_on: —
spec: ../invariants.md (I10) · lib/framework/data-slots/values.ts (the seam)
parent: plan.md
opened: 2026-07-24
---

# ryw-provenance — slot provenance + history

> Feature-level build plan for **F1 `ryw-provenance`**, the run-scoping seam.
> Parent: [[plan#F1 · `ryw-provenance` — slot provenance + history|plan.md]].
> Binding _how_: [[invariants#I10 — Tier boundaries|I10]] (the sanctioned
> framework-tier exception) and the live seam
> `lib/framework/data-slots/values.ts`. Sizing follows the parent: **task = one
> PR**; commits sit below that resolution.

## Intent

Land the two additive, back-compatible changes the leaf needs before it can write
run-scoped answers or read a slug across audits:

1. an optional **`runId?: string`** on `SlotValueProvenance`, and
2. **`getSlotHistory(userId, slotSlug)`** returning every version of a slug —
   heads and superseded — where today's `getSlotHeads()` returns current heads only.

Without `runId`, `saveAnswer` (I3, F4 t-2) has nowhere to stamp the run, and every
repeat audit overwrites the last on the same slug head. Without `getSlotHistory`,
F9's per-bucket trend lines cannot read run 1 and run 2 side by side. Both are
generic facilitation needs, not RYW-specific, which is why the change is offered
upstream ([[daybreak-asks]]) rather than carried forever.

## The framework-tier exception (I10)

F1 is the **only** feature that edits `lib/framework/**`. The rule that makes it
safe: the change stays additive and back-compatible (every existing caller and test
compiles unchanged), lands as its own reviewable diff (one framework file), and is
ledgered in [[daybreak-asks]] so the next `git merge upstream/main` delegates to
Daybreak's version instead of carrying ours. `npm run framework:boundary` must stay
green. No other invariant's behaviour changes; while in the framework tree we
re-verify the `lib/framework/**` file:line citations in [[invariants]] (I5, I6,
I14, I15), which drift silently on syncs.

## Reconciliation against the live repo

Verified during planning, 2026-07-24:

- `SlotValueProvenance` is a plain TS interface (all fields optional) backing a
  Prisma **`Json` column** (`prisma/schema/framework-data-slots.prisma:69`). Adding
  a field is compile-time only — **no migration**.
- `getSlotHeads(userId, options?)` lives in `values.ts` as the pure per-user engine.
  `getSlotHistory` is its sibling and belongs in the same file (the parent plan and
  the [[daybreak-asks]] row both specify `values.ts`). The cross-user admin reads in
  `admin-queries.ts` are a separate surface by design — not duplicated here.
- A no-live-DB unit test exists at
  `tests/unit/lib/framework/data-slots/values.test.ts` (mocks `@/lib/db/client` and
  `executeTransaction`). We extend it — no new harness.
- The [[daybreak-asks]] ledger row for this change already exists (status "open, not
  yet filed"); the close-out files the upstream issue and updates that row.

## Promoted tasks

| id  | Intent                                                                                                               | Files likely to touch                                                                                                           | Deps | Status | PR              |
| --- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---- | ------ | --------------- |
| t-1 | `runId?` on `SlotValueProvenance` + `getSlotHistory()` + export + unit tests                                         | `lib/framework/data-slots/values.ts`, `lib/framework/data-slots/index.ts`, `tests/unit/lib/framework/data-slots/values.test.ts` | —    | done   | #17             |
| t-2 | Close-out: file the Daybreak issue, update [[daybreak-asks]], reconcile the board, re-verify I5/I6/I14/I15 citations | `.context/app/daybreak-asks.md`, `.context/app/planning/plan.md`, `.context/app/invariants.md` (only if drift found)            | t-1  | done   | #17 + close-out |

> **Sizing note.** The board lists three tasks; reconciled against the repo the two
> code tasks are ~40 LOC in one file, so they fold into t-1 (one PR, one framework
> file in the diff — the clean upstream-style artifact I10 wants). The board's t-3
> becomes the docs close-out, t-2 here.

### t-1 — the framework change

- **`runId?: string`** added to `SlotValueProvenance`, documented as the leaf's
  journey `contextKey`, stamped by `saveAnswer` (I3), read by F9 grouped by run.
  Optional and generic; the engine only stores it.
- **`getSlotHistory(userId, slotSlug)`** beside `getSlotHeads`: `findMany({ where:
{ userId, slotSlug }, orderBy: { version: 'asc' } })`. No `supersededAt` filter —
  returning superseded rows is the point. Singular signature deliberately (matches
  the [[daybreak-asks]] row and the upstream filing); F9 can batch later if the
  nine-bucket read warrants it.
- Export `getSlotHistory` from `index.ts`.
- Extend the unit test: a `describe('getSlotHistory')` asserting the query shape and
  that a mixed head/superseded mock is returned un-filtered (superseded included).

_Done when:_ `getSlotHistory` returns superseded versions in a unit test;
`npm run type-check` and `npm run framework:boundary` green; `git diff --stat` shows
exactly one `lib/framework/**` file (`values.ts`); the `index.ts` export line and the
test file are the only other changes.

_Gates:_ `commit → /pre-pr → /security-review → npm run format → push → open PR →
/code-review`.

### t-2 — close-out + upstream ledger

Docs-only → skips `/security-review` and `/code-review`.

- File the Daybreak issue (fork-perspective ask; offer the diff), then update the
  [[daybreak-asks]] row from "open, not yet filed" to open-and-filed with the link.
- Re-verify the I5/I6/I14/I15 `lib/framework/**` citations in [[invariants]];
  correct any drift.
- Reconcile the board: F1 → `shipped`, F2 `ryw-module` → `available` ▲; add a
  Work-completed log line; set this doc's frontmatter `status: shipped` and t-rows to
  `done`. **After PR-1 merges** — not before, so the board never claims shipped work
  that is still on a branch.

_Done when:_ the [[daybreak-asks]] row is filed with a live issue link; the board
shows F1 `shipped` and F2 `available` ▲; the invariant citations re-verified.

_Outcome (2026-07-24):_ issue filed as daybreak#156 and the ledger row updated (in #17).
The I5/I6/I14/I15 `lib/framework/**` citations were re-verified against live code and are
**all still exact** — no drift, so `invariants.md` needed no edit. Board reconciled to F1
`shipped` / F2 `available` ▲ in the close-out PR after #17 merged.

## Notes / deferrals

- `runId` has **no producer yet** — `saveAnswer` (F4 t-2) is its first writer, and
  `getSlotHistory` gets its first real reader in F9. F1 deliberately lands the seam
  ahead of consumers; both dependent features are already blocked on it, so this is
  correct, not premature.
- No feature flags, no seed/demo rows: F1 adds a type field and a read function only.
  A fresh checkout still boots clean ("ship nothing a fork has to delete").
