---
name: planning-retro (Reclaim Your Week)
description: Process lessons discovered while building Reclaim Your Week. Read before planning a feature; append after shipping one.
parent: plan.md
---

# Reclaim Your Week — planning retro

> Feedback about the **build process itself**, discovered while executing the plan. Read the entries
> before planning a feature; **append a new one after shipping a feature** if you learned something the
> hard way. This is the leaf-app sibling of Daybreak's own
> [`planning-retro.md`](../../framework/planning/planning-retro.md) — its §A/§B lessons about
> plan-authoring and feature-authoring still apply to us; this file captures what is specific to
> building _this app_ on the framework.

## How to use this

- **§A — overall-plan lessons.** Things about the board, sequencing, or the source docs that would
  change how the whole plan is structured.
- **§B — feature-plan lessons.** Things about building an individual feature — reconciliation traps,
  where `/code-review` paid off, sizing surprises, invariant regressions.

Newest at the top within each section. Keep each entry to a few sentences with a bold lead phrase, the
way the framework retro does.

---

## §A — overall-plan authoring

- _(none yet — the first will likely come from F3 `ryw-firstlight`, the spike: if the framework
  surfaces more than the budgeted two to three defects, that is a §A lesson about how much end-to-end
  risk a first-consumer plan should price in.)_

## §B — feature-plan authoring

- _(none yet. Candidates the build is likely to surface: whether the 95-slot declaration in F2 wants
  splitting from content-loading; whether the `<ReclaimChart>` family in F6 is honestly one task or
  three; whether the refer-back context contributor in F7 needs a seam the framework doesn't expose.)_

---

## Seed expectations (things we already suspect, to confirm or refute at build)

These are not lessons yet — they are the plan's own predictions, recorded so that confirming or
refuting them is a deliberate act rather than a silent drift.

- **F1 is genuinely one framework file plus its test, and no migration.** `runId` is additive to an
  existing Json column; `getSlotHistory` is a read helper. Both live in
  `lib/framework/data-slots/values.ts` — which is why F1 t-3's done-when is a one-file diff. If F1
  grows a migration or a second framework file, something was misunderstood about the slot store.
- **F3 will find framework bugs.** It is the first end-to-end run of machinery built for this shape but
  never exercised by a real app. Budget two to three. More than three → re-scope F4 before building
  (the plan says so; hold the line).
- **The voice regresses without a test (I1).** The source system prompt is first-person as Rashmir.
  Any feature that ports prompt text will carry the wrong persona unless re-pointed. F2's voice test is
  the guard; if a later feature adds agent-facing copy, it needs the same check.
- **Paraphrase looks like success (I11).** F2's bucket descriptions must be diffed against
  `content-source.md` by a human; a plausible rewording passes every automated test and is still wrong.
- **`/code-review` pays for itself on data-model and UI-over-backend tasks.** The framework build found
  this repeatedly (its retro §B). F4's schema + cascades and F6's charts are where to expect real
  findings.
- **This build is also Daybreak's acceptance test.** Being the first real consumer is a stated goal,
  so friction is a finding, not an annoyance: anywhere the framework makes the leaf work harder than
  it should, that is a §A lesson and probably a [[daybreak-asks]] row. F1 is already one — the leaf
  could not write run-scoped answers at all without changing a framework file.
