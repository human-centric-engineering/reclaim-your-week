---
name: ryw-hygiene
feature: F12 · ryw-hygiene
epic: RYW post-v1
status: in flight
owner: John
depends_on: —
spec: ../invariants.md (the guard table) · ./post-v1.md (P21, P23, the two-board split) · ../../../.github/workflows/ci.yml (the smoke job)
parent: post-v1.md
opened: 2026-07-29
---

# ryw-hygiene — the board says what is true, and a gate keeps it that way

> The first feature of the F12–F18 epic, and the only one that builds nothing a leader will ever
> see. It exists because five features are about to land on a coordination surface that has been
> wrong four times, in a repository whose own rule is that documentation which misdescribes the code
> is a defect. Parent: [[post-v1]]. Binding _how_: **I10** (leaf-only), and P1/P2's standard —
> a repository must not tell a reader something untrue about itself.

## Intent

[[post-v1]] is the file a reader opens to find out what is left. Twice it named shipped items as
outstanding, diagnosed the cause in its own margin ("nothing flips them when that branch merges"),
and then did it twice more: **P22** sat at `in flight` after merging in #59, and the `offer_choices`
work shipped in the same commit having never had a row at all — the first item to reach `main`
without appearing on the board in any state.

The audit that opened this epic then found the same failure one file along, in
[[invariants]] — which `CLAUDE.md` requires every session to read **before writing any code**, making
it the highest-traffic document in the repository. Four statements in its guard block were false:

| Claim in the block                                      | Truth on 2026-07-29                                                               |
| ------------------------------------------------------- | --------------------------------------------------------------------------------- |
| every guard named is "wired into `npm run leaf:checks`" | `content.test.ts` lives outside `tests/unit/invariants/`; CI's `test` job runs it |
| `smoke:reclaim-coach` is a running guard                | it runs in no gate at all (P21)                                                   |
| — (the table simply omitted it)                         | `product-voice.test.ts` had existed since open item 8                             |
| `smoke:reclaim` is "not run by any gate"                | it joined CI on 2026-07-26; P16 recorded that three days earlier                  |

None of that made a guard weaker. It made the map wrong, which is worse in the file whose job is to
be the map.

**So the feature is not "tidy the docs".** t-1 corrects both files; t-2 closes the gate hole P21
names; **t-3 is the point** — a check that fails CI when the board and the feature docs disagree.

## The decision that shapes it: a gate, not another paragraph

The margin note in [[post-v1]] already said the right thing and did not work. That is the finding
worth generalising: **an instruction written in the file the instruction is about is not a control.**
It is the documentation twin of the rule this codebase already applies to models — a side effect
asked of a model is a hit rate (P23), and a discipline asked of a future maintainer is the same
thing with a slower feedback loop.

`leaf:checks` proves content (I11) and invariants, and neither can see a status column. Nothing else
gates a document. So the smallest honest repair is a third member of that pair.

## Decisions

| Decision                                | Choice                                                                                                                                                                                                                                                                            |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Where the F12–F18 board lives           | **A second board inside [[post-v1]]**, in `plan.md`'s features shape. Not `plan.md` itself — that file is the closed `RYW v1` epic and its "all ten shipped" framing is a record worth leaving intact. Not a new file — a third board is a third place to forget.                 |
| What `leaf:board-check` compares        | Feature-doc **frontmatter** against the **board rows**, both directions. Frontmatter is already the convention (`feature:`, `status:`, `epic:`) and every doc but two carries it.                                                                                                 |
| How strictly `status` is compared       | **Loosely — `shipped`-ness only.** Real values include `shipped (#39)` and `shipped (t-1/t-2/t-3 done, #25)`. Demanding an exact match would force a format nobody wants and would fail on history that is perfectly honest.                                                      |
| Docs with no `feature:` key             | **Skipped by the F-row check, required to be linked from [[post-v1]] instead.** `ryw-chat-ux.md` and `ryw-conversational.md` are P-item records (P19, P18), not features. Failing them for lacking a field they were never meant to have would teach people to silence the check. |
| Whether it checks the reverse direction | **Yes, and this is the half that matters.** A doc with no row is exactly P23's shape, and the shape a "did you update the board?" habit never catches, because the work had no doc either.                                                                                        |
| Whether t-1 touches the guard table     | **It corrects it; it does not extend it.** Naming F13–F18's guards before they exist would repeat P2 precisely, and P2's own closing line is the reason: _an unwritten test that reads as written is worse than no test named at all._ Each feature adds its row when it lands.   |

## Tasks

| t-N | What                                                                                                                                                                                  | Files                                                                                       | Status  | PR  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------- | --- |
| t-1 | **Docs-only.** Reconcile the board (P22 → shipped, open P23 + P24, the two-board split, the F12–F18 epic section) and correct [[invariants]]'s guard block into its three real gates. | `.context/app/planning/post-v1.md`, `.context/app/invariants.md`, this file                 | done    | —   |
| t-2 | **P21.** Wire `smoke:reclaim-coach` and `smoke:reclaim-join` into CI's `smoke` job; fix the false header claim at `scripts/smoke/reclaim-coach.ts:12`.                                | `.github/workflows/ci.yml`, `scripts/smoke/reclaim-coach.ts`                                | done    | —   |
| t-3 | **`leaf:board-check`.** The gate. Added to `leaf:checks` beside `leaf:content-diff` and `leaf:invariants`.                                                                            | `scripts/planning/board-check.ts`, `package.json`, `tests/unit/scripts/board-check.test.ts` | ready ▲ | —   |

**Done when** (each task): `/pre-pr` green; t-1 skips `/security-review` and `/code-review` as
docs-only; t-2 and t-3 take the full gate loop.

## What t-2 found: the smoke was already red

**`smoke:reclaim-coach` failed on the first run under CI's invocation, and had been failing since
#59.** It is the cleanest possible vindication of P21, so it is recorded rather than quietly fixed.

Two separate rots, both from the same cause — an assertion nothing executes is a comment:

1. **The wording moved and the assertion did not.** #59 changed the coach's briefing from "phase 1 of
   6" to "**section** 1 of 6", deliberately: the leader's screen says section, the briefing says the
   word aloud, and the code, slugs and run state keep saying phase. `phase-context.ts` states that
   rule in a comment beside the count. The smoke still asserted `phase 1 of 6`, so it went red the
   day the wording landed and nobody knew.

2. **A stronger fault underneath: the I12 assertion could never have failed for the reason it
   named.** The smoke saved `reclaim_reflection_p1` **before** claiming the reveal — the reverse of
   what a leader does — then asserted the pause instruction that appears only when the reveal has
   happened and the reflection has not. `phase-context.ts` has three branches for that beat and the
   run was landing in the third. The assertion also keyed on `"what stands out to you here"`, which
   occurs **twice** in that file: once in the reveal beat and once in the phase-closing reflection
   instruction every phase carries. So it matched the wrong branch and would have passed even with
   I12's pacing removed.

The rewrite walks the beat in the leader's own order and asserts each state while it is true —
before the reveal (say nothing about the picture), after it (ask, and stop), after they answer (now
your reading belongs) — keying on a string unique to each branch. The invariants table credits this
smoke with I12; it now earns that.

**The lesson generalises past this script.** A smoke in no gate does not stay neutral, it silently
becomes false, and the second fault shows it can be false in a way that no amount of re-reading
catches: it passed for the wrong reason. That is the same shape as P23's finding one tier up — a
side effect asked of a model is a hit rate — applied to a check asked of a habit.

## t-3 in detail

**What it reads.** Every `.context/app/planning/ryw-*.md`, plus the two board tables — `plan.md`'s
`RYW v1` features table and [[post-v1]]'s epic table.

**What it asserts.**

1. Every doc carrying `feature: F<N> · <slug>` has a row for `F<N>` on exactly one board.
2. That row's slug matches the frontmatter's.
3. `status:` starting with `shipped` ⟺ the row's Status cell contains `shipped`. Both directions, so
   a doc that forgot to flip and a row that forgot to flip each fail.
4. Every `ryw-*.md` **without** a `feature:` key is referenced by name from [[post-v1]].
5. Every `F<N>` row on a board has a doc — the P23 half.

**What it does not assert.** Task-row statuses inside a feature doc. They change several times per
feature and are read by whoever is building it, not by someone deciding what is left. Gating them
would make the check noisy enough to be worked around, which is how a gate stops being one.

**Failure output names the file and the disagreement**, in the shape `leaf:content-diff` already
uses, because that is the script anyone here already knows how to read.

## Invariants this feature touches

- **I10** — leaf-only. `.context/app/**`, `scripts/planning/**`, `package.json`'s `leaf:*` scripts,
  and the leaf smoke steps in `ci.yml`. No core or framework file edited, no framework table touched.
- **No product surface, so no I1/I2/I17.** Nothing here renders to a leader; `product-voice.test.ts`
  is untouched by design.
- **P2's standard, applied to itself.** t-1 must not name a guard that does not yet run. The corrected
  block in [[invariants]] therefore lists ten files that exist and separately names the three that do
  not gate, rather than one table implying uniform coverage.

## Two things worth knowing before changing this

**The directory is the wiring.** `leaf:invariants` is `vitest run tests/unit/invariants`, so a guard
dropped in that folder gates automatically and a guard placed anywhere else does not, however
invariant-shaped it looks. That is why `content.test.ts` was mis-filed in the guard table for three
days, and it is the single most useful sentence in the corrected block.

**t-3 cannot prove the board is _right_, only that it is _consistent_.** A feature whose doc and row
both say `shipped` while the code is half-built passes. That is the correct scope: consistency is
mechanically checkable and truthfulness is not, and every one of the four failures this feature
exists for was an inconsistency. Claiming more would be the same overreach the guard block just made.

## Notes / deferrals

- **P24** (a stalled-audit nudge) is recorded on the board as Rashmir's decision, not built. The
  question changes once F16 ships, which is why it waits.
- **P16's denominator** moves from one key-needing script to two when F14 lands
  (`smoke:reclaim-analyst`). Recorded in P16 now so the decision is taken once.
- **A `leaf:checks` that grows a fourth member** should prompt a look at whether `app:ci-checks` still
  reads clearly. Three is fine; six would want a table.
