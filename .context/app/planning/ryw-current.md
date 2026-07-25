---
name: ryw-current
feature: F6 · ryw-current
epic: RYW v1
status: shipped
owner: John
depends_on: F4 · ryw-shell (shipped #27–#30/#32) · F8 · ryw-access for the entitlement gate (t-1 only; see reconciliation)
enriched_by: F5 · ryw-calendar (shipped #33/#34) — the composite the chart plots
spec: ../content-source.md §4 (Phase 0) · §8 (Phase 1) · ../slot-spec.md (reclaim_profile 6 · reclaim_setup 9 · reclaim_current 18 · reclaim_composite 10) · ../invariants.md (I8, I11, I12, I14, I16, I17, I-composite, I-frame) · Brief §3 (palette conflict, relabelling)
parent: plan.md
opened: 2026-07-25
---

# ryw-current — current reality + charts

> Feature-level build plan for **F6 `ryw-current`**, the first feature that puts real audit **content**
> on screen. Parent: [[plan#F6 · `ryw-current` — current reality + charts|plan.md]].
> Binding _how_: [[content-source]] §4 (Phase 0) and §8 (Phase 1), [[slot-spec]] (the setup/current
> slots), and [[invariants]] — **I8** hours-never-percentages, **I12** chart ≠ interpretation, **I14**
> entitlement at run creation, **I16/I17** possibility-not-verdict, **I-composite** plot the composite,
> **I11** content loaded verbatim, **I-frame** not a productivity exercise. Sizing follows the parent:
> **task = one PR**; commits sit below that resolution.

## Intent

F4 built the shell; F5 added the optional calendar branch. **F6 is where a leader actually does the
first two phases of the audit** — Phase 0 (the ten context questions) and Phase 1 (where their time
goes now, area by area) — and sees it drawn back to them as the `<ReclaimChart>` family. It is the
feature that turns the empty seven-node shell into "I can see my week."

Four things govern it and must not drift:

- **Hours, never percentages** (I8). Forcing a total to 100 hides overwork — the one thing the tool
  exists to surface. Percentages may be _displayed_ as derived values; they are never the input.
- **The chart shows, it does not conclude** (I12). The `<ReclaimChart>` renders the numbers and the
  benchmark markers; the interpretation is a separate beat (the coach, F7). A chart that renders a
  verdict inverts I16 (the tool returns people to their own discernment).
- **The composite is plotted, not recomputed** (I-composite). F5 already computes and stores
  `reclaim_composite_hours__*`; F6 t-3 **plots** it when the calendar branch was taken, and falls back
  to `reclaim_current_hours__*` when it was not. F6 must not recompute the composite.
- **This is not a productivity exercise** (I-frame). The setup form opens warm (§4a's process outline,
  verbatim), the hours fields accept approximations and say so (I17), and a gap reads as possibility,
  not failure.

## Reconciliation against the live repo

Verified during planning, 2026-07-25. Every seam F6 consumes shipped with F2/F4/F5; confirmed shape and
found **three things that shape the tasks** — one a genuine sequencing decision for John.

- **The entitlement gate (t-1) reads `ReclaimGrant`, but grants are _created_ by F8 — which is not
  built yet.** The run-creation route has the stub (`app/api/v1/app/reclaim/runs/service.ts:48`,
  `TODO(F6/F8)`); the `ReclaimGrant` model exists (F4 t-1: `tier`, `expiresAt`, `mustStartBy`,
  `userId` CASCADE). But **nothing creates a grant row** — that is F8 t-1/t-2 (invite redemption →
  grant). If F6 t-1 enforces "refuse when no grant" naively, it refuses **every** run, because no user
  has a grant. **Decision for John (sequencing):**
  1. _Recommended_ — F6 t-1 implements `assertEntitled(userId)` reading `ReclaimGrant`, **and** creates
     a minimal **free-tier grant on first run** when none exists (free tier = one complete audit, I14).
     This makes the gate real and testable standalone; F8's invite→grant flow later supersedes the
     bootstrap (client tier, referral unlock) without changing the gate. The `ReclaimGrant` write is a
     small, forward-compatible overlap with F8 t-2, not a fork.
  2. _Alternative_ — land **F8 t-1/t-2 before F6 t-1** so grants exist first; F6 t-1 then only reads.
     Cleaner separation, but serialises two features the board deliberately opened in parallel.
     Either way the **gate logic + its refusal test live in F6 t-1** (I14 is F6's done-when). Recommend
     (1); note it here so the grant bootstrap reads as a decision, not scope-creep into F8.

  > **Superseded by F8 (#41), 2026-07-25.** John took option (1) and F6 shipped the bootstrap. F8 t-2
  > **removed it**, exactly as this decision anticipated and without moving the gate: `assertEntitled`
  > now resolves a live `ReclaimInvite` into a tiered grant and otherwise **refuses**. Read the
  > bootstrap references below (test strategy, t-1, notes) as history — the gate logic and its refusal
  > test still live where I14 put them. The thing the decision did _not_ anticipate is that "a
  > deliberate, documented placeholder" and "self-signup is open" join into a self-serve free tier in
  > production; that lesson is in [[planning-retro]] §B, and it is the reason F8's plan opened with it.

- **`<ReclaimChart>` does not exist — F6 t-3 creates it.** No chart component under
  `components/app/reclaim/**` today. It reads `RECLAIM_BUCKETS` (`lib/app/programme/content.ts`) for the
  nine `colour` + `benchmark` (`note` / `lowPercent` / `highPercent`) values, plots
  `reclaim_composite_hours__*` (falling back to `reclaim_current_hours__*` when
  `reclaim_calendar_uploaded` is false), and renders `reclaim_composite_variance_note` as the "small
  note" (I-composite). **The three colour questions are flagged as TODOs, not resolved** (below).

- **The consumer surface + write path are ready.** The programme shell (`app/(protected)/programme/`,
  F4 t-4) hosts the phases; `saveRunAnswer` → `saveAnswer` (F4 t-2/t-3) is the write path (I3); the
  reflection gate (`missingReflectionSlug`, F4) is the server half of I9 — F6 t-2 builds the UI half.
  All 6 `reclaim_profile_*`, 9 `reclaim_setup_*`, 18 `reclaim_current_*` slugs are **already registered**
  (F2) — F6 writes to existing definitions, declares no new slots. `FieldHelp` (`components/ui/field-help.tsx`)
  and the `ReclaimBucketLabel` model (F4 t-1: `@@unique([userId, bucketSlug])`, canonical slug never
  renamed) are both in place for t-1's help popovers and t-4's relabelling.

## Invariants this feature touches

| Invariant                        | How F6 honours it                                                                                                                                    | Guard                                                                                                        |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **I8** (hours, never %)          | setup + Phase 1 cards capture **hours**; any % is a derived display value, never stored or entered                                                   | the `reclaim_*_hours__*` slots are `number`; code review of the cards + chart axis                           |
| **I14** (entitlement at create)  | `POST /runs` calls `assertEntitled(userId)` (reads `ReclaimGrant`); free tier = one complete audit; refuses when exhausted/expired                   | integration test: an exhausted/expired grant → run creation refused (t-1 done-when)                          |
| **I12** (chart ≠ interpretation) | `<ReclaimChart>` renders numbers + benchmark markers + over/under flags only; no verdict text; the "what stands out?" beat is the coach (F7)         | code review of the chart — no interpretive strings; renders from slot data alone                             |
| **I-composite** (plot composite) | t-3 plots `reclaim_composite_hours__*` when `reclaim_calendar_uploaded`, else `reclaim_current_hours__*`, with the variance note rendered            | unit test on the chart's series-selection: uploaded → composite; not uploaded → current                      |
| **I11** (content loaded)         | §4a process outline + the nine bucket descriptions render **verbatim** from `Module.config` / `RECLAIM_BUCKETS`; no paraphrase in components         | `leaf:content-diff` already guards the source; component copy is structural labels only, like F4's signposts |
| **I16 / I17** (possibility)      | hours fields accept approximations and say so; a priority-gap reads as insight, not failure; warm framing throughout                                 | copy review against §4 / §12a                                                                                |
| **I9** (reflection UI half)      | Phase 1's required reflection component posts and the transition route already enforces `422 REFLECTION_REQUIRED`; F6 builds the UI that respects it | the F4 transition test still passes; a component test that the reflection field blocks advance               |
| **I7** (canonical slug)          | relabelling writes `ReclaimBucketLabel.label`; `bucketSlug` is never touched, so aggregation stays on the canonical slug                             | a relabelled bucket still reads/writes `reclaim_current_hours__<canonical>`; unit test on the label read     |
| **I-frame** (not productivity)   | no percentage-complete bar, no efficiency framing; the setup opens with §4a and the audit-period field carries the atypical-week reassurance (§12a)  | copy review; the seven-node spine (F4) stays a spine, not a progress %                                       |

## Test strategy

vitest runs on `happy-dom` with **no live DB** ([[building-a-feature]] §1.2). So:

- **Setup form (t-1)** — component tests: required-field validation, the reflect-context-back review
  step, `FieldHelp` present on non-trivial fields. The **entitlement gate** is a handler test mocking
  `@/lib/db/client`: exhausted/expired `ReclaimGrant` → `POST /runs` refused; a fresh user gets the
  free-tier bootstrap grant and is allowed. `smoke:reclaim-run` extended to prove the gate against real
  Postgres.
- **Phase 1 cards (t-2)** — component tests: nine buckets shown first, then cards; fundraising bucket
  hidden when `reclaim_setup_fundraising_relevant` is false; hours captured as numbers; deep-work's
  three extra questions render; the reflection component blocks advance until filled.
- **`<ReclaimChart>` (t-3)** — pure/unit tests on the series-selection (composite vs current), the
  benchmark-marker math (over/under vs `lowPercent`/`highPercent`), and the priority-gap derivation
  (a Phase 0 priority with no bucket time is flagged). Render tests in both colour schemes are
  visual — assert the data mapping, not pixels.
- **Relabelling (t-4)** — unit test: a `ReclaimBucketLabel` renders its label while reads/writes still
  key on the canonical `bucketSlug`; the length cap is enforced at the write.

## Promoted tasks

| id  | Intent                                                                                             | Files likely to touch                                                                                                                                                    | Deps | Status | PR  |
| --- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- | ------ | --- |
| t-1 | Phase 0 setup form + entitlement gate (I14) + reflect-context-back + atypical-week reassurance     | `app/(protected)/programme/**`, `components/app/reclaim/setup/**`, `lib/app/programme/runs/entitlement.ts`, `app/api/v1/app/reclaim/runs/service.ts`, `scripts/smoke/**` | F4   | done   | #37 |
| t-2 | Phase 1 nine-bucket overview + cards (hours, I8) + deep-work questions + reusable reflection       | `components/app/reclaim/phase1/**`, `app/(protected)/programme/**`, `lib/app/programme/**`                                                                               | t-1  | done   | #37 |
| t-3 | The `<ReclaimChart>` family — composite/current plot (I-composite), benchmarks, priority-gap (I12) | `components/app/reclaim/chart/**`, `lib/app/programme/chart/**`                                                                                                          | t-2  | done   | #37 |
| t-4 | Bucket relabelling — `ReclaimBucketLabel`, canonical slug untouched (I7)                           | `components/app/reclaim/**`, `app/api/v1/app/reclaim/**`, `lib/app/programme/buckets/**`                                                                                 | t-2  | done   | #37 |

> **Sizing note.** Four tasks. t-1 (setup + gate) and t-3 (the chart family) are the heavy ones; the
> parent already asks "is `<ReclaimChart>` honestly one task or three?" ([[planning-retro]] §B). Held
> as **one** task for now: it is one component family with one data contract (series-selection +
> benchmarks + priority-gap). **Watch:** if the priority-gap element or the dark-mode variants grow past
> a reviewable diff, split the priority-gap into its own task rather than bloating t-3.

### t-1 — Phase 0 setup + entitlement gate

- The setup form under the programme surface: warm opening + **§4a process outline verbatim** (I11),
  then the ten questions as a **short form** (not ten chat turns, §4b) — first name only
  (`reclaim_profile_first_name`), role/org dropdowns, direct reports, distributed-team, the transition
  flag, the fundraising-relevance gate + support follow-up, weekly hours, priorities, **the "what is
  keeping you up at night" and "why now" prose** (`reclaim_setup_keeping_me_up` / `_why_now`, both
  `sensitive`, **never `special_category`** — I5), and the audit period (**quarter default**, §4b).
- **`<FieldHelp>` on every non-trivial field** (repo rule); the **hours field accepts approximations
  and says so** (I17); the **audit-period field carries the atypical-week reassurance** ("it's fine to
  do this during an atypical week", §12a) — where a wavering leader decides whether their data counts.
- **Reflect the context back before moving on** (§4, "briefly reflect it back to confirm") — a review
  step showing what was captured, the source's own instruction, not merely good form design.
- **Entitlement gate (I14):** `assertEntitled(userId)` in `lib/app/programme/runs/entitlement.ts`, wired
  into `createRun` (replacing the `TODO(F6/F8)`). Reads `ReclaimGrant`; refuses when exhausted/expired;
  per the reconciliation decision, bootstraps a free-tier grant on first run when none exists (F8
  supersedes). Integration test for the refusal; `smoke:reclaim-run` extended.

_Done when:_ setup writes every `reclaim_profile_*` / `reclaim_setup_*` slot; the reflect-back step
renders; hours accept approximations; the atypical-week reassurance shows at the period field; an
exhausted grant refuses run creation with a test. _Gates:_ full loop (`/security-review` for the gate +
the `sensitive` slot writes; `/code-review` for the form).

### t-2 — Phase 1 current-reality cards

- **Show all nine buckets first** (the overview, §1), **then cards** — eight when
  `reclaim_setup_fundraising_relevant` is false (the fundraising bucket is conditional). Each card:
  **hours per week (I8, never a percentage)** + "what it looks like in practice"
  (`reclaim_current_hours__<bucket>` + `reclaim_current_detail__<bucket>`). Bucket titles + descriptions
  render **verbatim** from `RECLAIM_BUCKETS` (I11).
- **Deep-work's three extra questions** and the **delivery-above-15% / oversight-in-transition nuance**
  (§8) — surfaced as card guidance, not a verdict (I16).
- **Reusable required-reflection component** — the UI half of I9 (the server already returns
  `422 REFLECTION_REQUIRED`); it blocks advancing until the phase reflection is captured. `<FieldHelp>`
  on the hours and practice fields.

_Done when:_ nine buckets shown then carded; fundraising hidden when not relevant; hours captured as
numbers; deep-work questions present; the reflection component blocks advance until filled.
_Gates:_ full loop (`/code-review` for UI-over-backend).

### t-3 — the `<ReclaimChart>` family (I-composite, I12)

- `<ReclaimChart>` under `components/app/reclaim/chart/`: standardised format, the **nine fixed
  `RECLAIM_BUCKETS` colours**, a clear key, readable in **light and dark**, **benchmark markers** +
  over/under flags from `lowPercent`/`highPercent`. **Renders no interpretation** (I12) — numbers and
  markers only.
- **Series selection (I-composite):** plot `reclaim_composite_hours__*` when
  `reclaim_calendar_uploaded` is true, else `reclaim_current_hours__*`; render the variance note from
  `reclaim_composite_variance_note`. **F6 plots; it does not recompute** — F5 already wrote the composite.
- **The priority-gap element** (§8, "often the most important insight"): map Phase 0
  `reclaim_setup_priorities` to buckets and **flag any priority with no time against it**, as a distinct
  element, not prose.
- **Flag the three colour questions as TODOs, do not resolve** (I11 — the palette is her IP): dark-mode
  variants; **strategic-planning `#1B4965` vs brand teal `#0D4F68`** (they sit close); and whether the
  source palette meets Brief §3's "bright, obviously distinguishable" bar given the muted `#7B6D8D` /
  soft `#A8DADC`. A conflict only Rashmir can rule (open item 1/3) — **do not quietly brighten her hexes.**

_Done when:_ chart correct in both modes; composite plotted when uploaded, current otherwise; variance
note rendered; priority-gap flags an unallocated priority; benchmark markers correct; the three colour
TODOs filed, not silently resolved. _Gates:_ full loop (`/code-review` — chart data model + UI, per
[[planning-retro]] §B "charts are where findings live").

### t-4 — bucket relabelling (I7)

- Display labels write to `ReclaimBucketLabel` (`@@unique([userId, bucketSlug])`); **canonical
  `bucketSlug` is never touched** (I7), so a relabelled audit still aggregates on the canonical slug by
  construction. "Within limits" (Brief §3) = a **length cap at the write** + the nine slots staying nine
  (relabelling is not adding/removing a bucket).
- The cards + chart render the user's label where present, falling back to the canonical title.

_Done when:_ a relabelled bucket renders its label and still reads/writes on the canonical slug; the
length cap is enforced; nine buckets stay nine. _Gates:_ full loop.

## Notes / deferrals

- **F6 gates F7.** The remaining phases (energy, ideal week, gap + refer-back, action plan, summary)
  build on the current-reality picture F6 draws. F5's composite enriches F6 t-3 but does not gate it —
  a run with no calendar upload plots the self-reported `reclaim_current_hours__*`.
- **The entitlement-gate/F8 sequencing** (reconciliation above) is the one decision to settle before
  t-1: bootstrap a free grant in F6, or land F8 t-1/t-2 first. Recommended: bootstrap in F6.
- **The three colour questions are Rashmir's to rule** (open items 1 & 3) — F6 t-3 flags them and
  builds against the current hexes; it does not resolve them.
- **No new slots, no new Prisma model** — F6 writes to F2's registered slugs and F4's `ReclaimGrant` /
  `ReclaimBucketLabel` tables. A `prisma/` diff on this feature is a red flag (the entitlement bootstrap
  is a row `create`, not a schema change).
- **Possible [[daybreak-asks]] shape:** if the `<ReclaimChart>` benchmark/percentage-display work wants
  a generic charting primitive the framework could own, note it — but the nine-colour, benchmark-marker
  shape is RYW-specific (her IP), so most likely it stays in the leaf.
