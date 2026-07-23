---
name: Reclaim Your Week — planning (.context/app/planning/)
description: The app-tier development plan. Mirrors Daybreak's .context/framework/planning/ one tier down.
parent: ../README.md
---

# Reclaim Your Week — planning

This folder is the **app tier's** development plan, in the same accountable style as Daybreak's
`.context/framework/planning/`. It exists so the build is a real coordination surface: a flat feature
board, one owner per feature, plan-first, per-task gates, append-only logs.

## Where this sits

```
.context/
  framework/
    planning/            ← Daybreak's own plan (all 23 features shipped) — the model we mirror
      plan.md
      building-a-feature.md
      planning-retro.md
      f-*.md             ← one detailed doc per framework feature
  app/
    README.md            ← the three-tier ownership model (what the leaf may edit)
    sources/             ← the five originals, byte-identical and READ-ONLY (the authority)
    content-source.md    ← working extract of sources/, verbatim (load, never paraphrase — I11)
    slot-spec.md         ← the 105 slot definitions
    invariants.md        ← I1–I18 + I-frame + I-composite, the rules that don't travel alone
    coverage-audit.md    ← the source-instruction audit (carries / becomes UI / retired / gap)
    planning/            ← THIS FOLDER
      README.md          ← you are here
      plan.md            ← the board + working model + decision/work logs
      building-a-feature.md
      planning-retro.md
      ryw-*.md           ← one detailed doc per app feature (written when the feature is claimed)
```

The four spec files (`content-source.md`, `slot-spec.md`, `invariants.md`, `coverage-audit.md`) live in
`.context/app/` — one level up from this folder — because they are referenced by code and by every
feature, not just by the plan. `plan.md` links to them as `[[content-source]]` etc.

## What is here

All five pieces are in place (landed 2026-07-23):

1. **`.context/app/invariants.md`** — I1–I18 plus I-frame and I-composite. The `CLAUDE.md` banner
   carries the pointer to it, so every session reads it before writing code.
2. **`.context/app/content-source.md`** — Rashmir's IP verbatim, with the coverage-audit fixes folded
   in (§0 frame, §4 process outline, §8 parsing/perception/composite, §11 register, §12 reassurance).
3. **`.context/app/slot-spec.md`** — the 105 slot definitions.
4. **`.context/app/coverage-audit.md`** — the audit trail behind those fixes, and
   **`.context/app/daybreak-asks.md`** — the ledger of framework changes we carry and defects we
   find, so a Daybreak sync knows what to delegate.
5. **This folder** — `plan.md`, `building-a-feature.md`, `planning-retro.md`, this `README.md`.

These four spec files are the **working system of record** — but they are not the authority. The five
documents they derive from are now checked in at
[`.context/app/sources/`](../sources/README.md), byte-identical and read-only, with a SHA-256
manifest. When `content-source.md` says "verbatim", `npm run leaf:content-diff` proves it against
those originals.

That was not true until 2026-07-23. The sources lived outside the repo, so `content-source.md` was
itself the diff target — and the first machine run against the real originals found nine altered
blockquotes, three of them material, including calendar export steps that appear in no source
document. A guard anchored on a transcription cannot catch a bad transcription. The `RYW_*.md`
drafts these were built from remain outside the repo; they are superseded and not worth carrying.

Feature detail docs (`ryw-module.md`, `ryw-current.md`, …) are **not** written up front. Each is
created when its feature is claimed, by asking Claude Code to plan it (see `building-a-feature.md`
step 1). That is deliberate: the detailed plan is where reconciliation against the live repo happens,
and doing it up front bakes in assumptions that go stale.

## The rhythm

Read [`building-a-feature.md`](./building-a-feature.md). In short: claim a feature on the board →
ask Claude Code to write its `ryw-<feature>.md` plan (reading `plan.md`, the invariants, and the
relevant spec sections) → review the promoted-task breakdown → build each task through the gate loop →
close out and reconcile the board.

To plan a feature, the prompt is roughly:

> "Let's plan **ryw-current**. Read `.context/app/planning/plan.md` for intent, `../invariants.md`
> (I1–I18, I-frame, I-composite), the relevant parts of `../content-source.md` and
> `../slot-spec.md`, and the source docs they cite. Reconcile against the current repo — every
> Daybreak feature this consumes is shipped, so verify the seams exist — then propose the
> promoted-task breakdown for review before building."

## Why mirror the framework's style

The framework plan is how Daybreak got built accountably: a claim nobody can see doesn't stop two
people starting the same work; a lesson nobody wrote down gets relearned; a task sized as a commit
wastes a PR. The same discipline one tier down keeps this app's build legible to Rashmir and to whoever
picks up a feature next. It also keeps the two plans navigable together — a leaf feature that leans on a
framework seam can link straight to that feature's shipped doc.
