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

- **The first-consumer spike found zero framework _bugs_ and two _seam-ergonomics_ gaps — friction,
  not defects (F3 `ryw-firstlight` t-1/t-2).** The end-to-end run (boot → register → sync → publish →
  resolve → stream) worked correctly against real Postgres on the first pass; the budgeted two-to-three
  framework bugs never materialised. What it surfaced were two places the framework has no seam for a
  leaf's needs: (1) a standalone `db:seed`/smoke never boots the app, so the leaf's seed must call
  `initFramework → initLeafApp → syncFramework` itself to materialise the Module/slot/capability rows;
  (2) Daybreak's core→framework ESLint ban exempts `scripts/smoke/**` but not leaf seeds, which share
  the identical profile. Both are [[daybreak-asks]] rows, not framework code we carried. **The
  refinement for the next first-consumer plan: price in seam-ergonomics friction (missing leaf entry
  points), which is likelier than behavioural bugs in machinery that is itself well-tested — and which
  the three-defect circuit-breaker, keyed on "bugs", would not have counted.** The friction-is-a-finding
  prediction (Seed expectations, below) held; it was just the ergonomic kind, not the crash kind.

- **Failures live in the joins between documents, not inside them.** Three times now, every document
  has been internally coherent and the defect has been in the space between two of them. (1) The
  verbatim guard compared `content-source.md` to `Module.config` and had no anchor above the extract —
  nine altered blockquotes passed, three materially. (2) `coverage-audit.md` audited the system
  prompt instruction by instruction and the Brief section by section — six items marked ✅ at section
  grain were not captured at all. (3) I-composite was written as an invariant and cited in three
  docs, and `slot-spec.md` had no slot for it to write to. **Whatever you check, check it across a
  boundary**: extract against source, spec against invariant, section against instruction.

- **A grep is not a read, and confidence should track which one you did.** Every gap above survived
  targeted searching and died on an end-to-end read. Searching confirms that something you already
  thought of is present; it cannot surface the thing you did not think to look for. When planning a
  feature, read its spec sections whole — and say plainly which documents you have read whole, so a
  reader can calibrate.

- _(F3's prediction resolved into the lesson at the top of this section: it surfaced zero bugs and two
  seam-ergonomics gaps, under the budget, so no F4 re-scope was triggered.)_

## §B — feature-plan authoring

- _(none yet. Candidates the build is likely to surface: whether the 105-slot declaration in F2 wants
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
- **Paraphrase looks like success (I11) — but it is now machine-caught, in one direction.**
  `npm run leaf:content-diff` compares every blockquote in `content-source.md` against
  `.context/app/sources/` and is tamper-tested to catch a five-word reordering ("IP creation" →
  "creating IP"). Trust it for that hop. **The second hop is still unbuilt**: F2 t-3 must assert the
  `Module.config` defaults match the extract. Until that lands, config content genuinely does need a
  human diff — which was the original form of this expectation, written when neither hop existed.
- **`/code-review` pays for itself on data-model and UI-over-backend tasks.** The framework build found
  this repeatedly (its retro §B). F4's schema + cascades and F6's charts are where to expect real
  findings.
- **This build is also Daybreak's acceptance test.** Being the first real consumer is a stated goal,
  so friction is a finding, not an annoyance: anywhere the framework makes the leaf work harder than
  it should, that is a §A lesson and probably a [[daybreak-asks]] row. F1 is already one — the leaf
  could not write run-scoped answers at all without changing a framework file.
