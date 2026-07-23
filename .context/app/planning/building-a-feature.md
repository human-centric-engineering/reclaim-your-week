---
name: building-a-feature (Reclaim Your Week)
description: The operational rhythm for building a Reclaim Your Week feature — plan-first → per-task gate loop → close-out. Read before starting a feature.
parent: plan.md
---

# Building a Reclaim Your Week feature — the flow

> **Who this is for:** anyone (and any AI agent) picking up a feature from the
> [board](./plan.md#features-epic-ryw-v1). [`plan.md`](./plan.md) gives the _structure_ — the levels,
> the board, how to claim. **This doc is the _execution rhythm_.** It is the leaf-app sibling of
> Daybreak's own [`building-a-feature.md`](../../framework/planning/building-a-feature.md); the loop is
> identical, one tier down. Where they differ is the **tier boundary** (§The disciplines) — we build in
> `lib/app/**`, not `lib/framework/**`.

> **Working solo.** John is the only builder, so steps 1.3 ("present the plan to the owner") and 2.5
> ("the owner merges") are self-review. Keep them anyway — the point of writing the plan down and
> reading it back before building is that it catches sizing and reconciliation errors, which does not
> require a second person. The branch-and-PR flow also stays: it is what exercises CI, and exercising
> Daybreak is half the point of this project.

## The loop, at a glance

**Claim + plan first → build each task through the gate loop → close out the feature.** Never skip the
plan. Never push to `main`. Fix review findings before merging. When a feature merges, reconcile the
board so the next person sees the truth.

## 1. Claim + plan first (don't jump to code)

1. **Claim it on the board.** In [`plan.md`](./plan.md), put your name in the feature's **Owner** cell
   and set **Status → `in flight`**. One owner per feature.
2. **Ask Claude Code to write the feature's detailed plan** at `.context/app/planning/<feature>.md`,
   following the shape of any Daybreak `f-*.md` (e.g.
   [`f-module-core.md`](../../framework/planning/f-module-core.md) is the worked example):
   - **Intent** — what and why. The binding _how_ is in the three spec files
     ([`content-source.md`](../content-source.md), [`slot-spec.md`](../slot-spec.md),
     [`invariants.md`](../invariants.md)) and the source docs they cite.
   - **Reconcile the sources against the current repo.** Every Daybreak feature this consumes is
     shipped — but verify the seam exists and has the shape you expect before baking it in. Record each
     adaptation as a decision. This is where the source docs' chat-shaped instructions get sorted into
     _carries verbatim_ / _becomes UI_ / _retired_ — see [`coverage-audit.md`](../coverage-audit.md).
   - **Cite the invariants the feature touches.** Every feature description in `plan.md` names its
     `I-N` rules; the detailed plan must show how each is honoured and tested.
   - **A promoted-tasks table** — `t-N`, files-likely-to-touch, deps, status, PR. Run the **sizing
     self-check**: a task whose only real content is scaffolding + one small file is a _commit_, fold
     it in. **Keep it to a few tasks per feature.**
   - **Per-task "Done when"** listing the gates as completion criteria.
   - **The test strategy, up front.** vitest runs on `happy-dom` with **no live DB**: unit tests mock
     `@/lib/db/client`; prove an end-to-end chain with a small stateful in-memory fake; use `smoke:*`
     (especially `smoke:reclaim`) for real-DB fidelity. Never write "integration test against the dev
     DB". Tests mirror the source path under `tests/unit/**` / `tests/integration/**`; the
     cross-cutting invariant tests live in `tests/unit/invariants/` and **must be added to
     `leaf:checks`**, which is the only hook CI runs for the leaf.
3. **Present the plan to the owner before building** — especially task sizing and any genuine
   design/content decision (a place where the source is ambiguous, or a persona line needs
   re-pointing). Surface the choices, don't pre-commit.
4. **Push the claim + plan as a standalone docs PR _before_ starting task work**, so the board is a
   real coordination surface. Docs-only, so it skips `/security-review` and `/code-review`.

## 2. Build each task — the gate loop

A **task is one PR** (~200–600 lines; cohesive, reviewable). For each:

1. **Branch off `main`** — `feat/<feature>-tN-<slug>`. **Never commit or push to `main`.**
2. **Build to the right shape, not the expedient one.** A real seam, a correct data model, the write
   path routed through `saveAnswer` (I3) — do it properly now, don't ship a review-passing-but-wrong
   version and defer the correct one.
3. **Run the gates, in this order:**

   ```
   commit → /pre-pr → /security-review → (npm run format) → push → open PR → /code-review
   ```

   - **`/pre-pr`** — type-check, lint, format, full test suite + coverage, migration-drift.
   - **`/security-review`** — before pushing. Pay special attention on `ryw-calendar` (I4: no meeting
     titles anywhere) and any slot write (I5: no `special_category`).
   - **Format before push** — `npm run format && npm run format:check`.
   - **`/code-review`** — run it to its full spec. It has earned its keep on every UI-over-backend and
     data-model task in the framework build; take it seriously.

4. **Fix confirmed findings as a transparent follow-up commit** (don't force-push over the reviewed
   commit). Document findings you accept or refute, and why.
5. **The owner merges.** Flip the task's row to `done #<PR>`. No "in-PR" status — one transition.

Every task inherits the repo rules in [`CLAUDE.md`](../../../CLAUDE.md): `logger` not `console`; the
`@/` alias; validate external input with Zod; a `userId` table needs an `onDelete` policy (hand-written
for leaf tables — see F4). And it inherits **the invariants** ([`invariants.md`](../invariants.md)):
read them before every task.

## 3. Close out the feature

When the **last task merges**, reconcile everything:

- Flip the feature to **`shipped`** on the board (features table + Project-status line), and flip its
  **dependents** from `blocked → X` to **`available` ▲**.
- In the feature's own doc, set frontmatter `status: shipped` and its `t-N` rows to `done`.
- Add a line to `plan.md`'s **Work-completed log** and, where a real lesson emerged, to
  [`planning-retro.md`](./planning-retro.md).

Docs-only changes still go on a branch + PR, but skip `/security-review` and `/code-review`.

## The disciplines underneath

- **Three tiers (Sunrise → Daybreak → Reclaim Your Week).** We are the leaf. Build in `lib/app/**`,
  `app/(protected)/programme/**`, `app/admin/programme/**`, `app-*.prisma`, `.context/app/**`. Fill the
  reserved `leaf-*` hooks; **never edit `lib/framework/**` or the three bridges** (`lib/app/bootstrap.ts`,
  `admin-nav.ts`, `db-drift.ts`). `npm run framework:boundary` enforces it. The **one exception** is F1
  (`ryw-provenance`), which lands two additive framework changes as its own upstream-style PR before
  anything depends on them, and ledgers them in [`daybreak-asks.md`](../daybreak-asks.md) so the next
  sync delegates instead of carrying them forever. Full ownership table: [`.context/app/README.md`](../README.md).
- **Content is loaded, not authored** (I11). Rashmir's IP lives verbatim in
  [`content-source.md`](../content-source.md) and loads into `Module.config`. Never paraphrase it. F2
  t-3 builds the guard that makes this mechanical — a test that parses the blockquotes out of
  `content-source.md` and asserts character-identity — because no ordinary test catches a plausible
  rewording.
- **The invariants don't travel on their own.** I1 (third-person voice) and I3 (one write path) are the
  two most likely to regress across sessions. Each feature prompt opens by reading
  [`invariants.md`](../invariants.md); each touched invariant has a test.
- **Ship nothing a fork has to delete.** A fresh checkout should boot clean — no example audit rows, no
  scaffolding to strip. Prove things in `tests/` and `smoke:reclaim`, not by shipping demo data.

## Reference

- [`plan.md`](./plan.md) — the board, the working model, how to claim.
- [`content-source.md`](../content-source.md) / [`slot-spec.md`](../slot-spec.md) /
  [`invariants.md`](../invariants.md) — the system of record for content, data, and rules.
- [`coverage-audit.md`](../coverage-audit.md) — the source-instruction audit each feature honours.
- [`daybreak-asks.md`](../daybreak-asks.md) — framework changes we carry, defects we find.
- [`f-module-core.md`](../../framework/planning/f-module-core.md) — the worked example to copy for a detailed feature plan.
- [`.context/app/README.md`](../README.md) — the three-tier ownership model.
- [`CLAUDE.md`](../../../CLAUDE.md) — repo rules every task inherits.
