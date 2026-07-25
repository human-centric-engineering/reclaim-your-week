---
name: ryw-phases
feature: F7 · ryw-phases
epic: RYW v1
status: in flight
owner: John
depends_on: F6 · ryw-current (shipped #37) · F5 · ryw-calendar (optional, shipped #34)
spec: ../content-source.md §8 (Phases 2–6) · §9 (footnote) · §10 (summary) · ../slot-spec.md (reclaim_energy 4 · reclaim_ideal 5 · reclaim_gap 6 · reclaim_action 5 · reclaim_share 6) · ../invariants.md (I13 refer-back, I11, I1/I2, I9, I12, I15, I16/I17, I-frame) · Brief §5 (coaching craft), §3 (share + quote consent)
parent: plan.md
opened: 2026-07-25
---

# ryw-phases — the remaining phases

> Feature-level build plan for **F7 `ryw-phases`**, the audit's second half: energy (Phase 2), the
> ideal week (Phase 3), gap analysis (Phase 4), the action plan (Phase 5), and the summary + share
> (Phase 6). Parent: [[plan#F7 · `ryw-phases` — the remaining phases|plan.md]].
> Binding _how_: [[content-source]] §8/§9/§10, [[slot-spec]] (the phase slot groups), and
> [[invariants]] — **I13** the refer-back is a data flow, **I11** content loaded verbatim, **I1/I2**
> voice, **I9** reflection gates, **I12** chart ≠ interpretation, **I15** complete closes the run,
> **I16/I17** possibility-not-verdict, **I-frame**. Sizing follows the parent: **task = one PR**.

## Intent

F6 put Phase 0 + Phase 1 on screen. **F7 completes the journey** — the four remaining phases and the
summary a leader walks away with. It is where the tool's _method_ does its work: not more charts, but
the coaching moves that turn "here is my week" into "here is one thing I will change, and it is mine."

Four things govern it and must not drift:

- **The refer-back is a data flow, not a prompt** (I13). What the leader said at setup about what keeps
  them up at night returns **in their own words** at gap analysis — read from the run's slot values by
  a context contributor, never by asking the model to remember (Brief §5: "a data-flow requirement").
- **Content is loaded, not authored** (I11). The under-delegation invitation, the Phase 5 journey
  framing, the §9 footnote, and the closing affirmations are Rashmir's — rendered verbatim from
  `Module.config`, not paraphrased in a component. This is F7's highest drift risk (paraphrase looks
  like success).
- **The tool returns people to their own discernment** (I16). The "want to, or think you should?"
  question, the once-per-audit permission-based challenge, and "invited, never required" sharing are
  all the same stance: it offers a mirror and options; the decision stays with the leader.
- **Sharing is invited, never required** (§10, Brief §3). Everything optional — demographics, age
  band, the feedback line, the separate quote consent — appears **only after** the leader chooses to
  share, each with a "prefer not to say".

## Reconciliation against the live repo

Verified during planning, 2026-07-25. Every seam F7 consumes shipped with F2/F4/F5/F6; confirmed shape
and found **four things that shape the tasks** — two of them decisions Rashmir owes.

- **The refer-back (I13) has its seam, and it does not need a new framework ask.** The context
  contributor lives in `lib/app/context-contributors.ts` (`initAppContextContributors()`, reserved and
  empty today) and registers via `registerContextContributor(type, loader)`
  (`lib/orchestration/chat/context-builder.ts`). The loader signature is `(id, request) => Promise<string>`
  with `request: { userId?: string }` — **`userId` is the per-request input Sunrise#412 landed**. It
  does **not** receive the run's `contextKey`, but it does not need to: exactly **one** run is
  `in_progress` per user (F4's partial-unique index), so the loader finds that run from `userId` and
  reads its `reclaim_setup_keeping_me_up` / `reclaim_setup_why_now` **run-scoped** (via
  `readRunAnswers`, filtered by `provenance.runId`, F1). **Reconciliation to verify at build (t-2):**
  that `request.userId` is actually populated on the **module-surface** chat path (not just the admin
  chat), and that the module surface's context builder invokes app contributors — if either is false,
  _that_ is the [[daybreak-asks]] row this feature files, not the refer-back logic itself.

- **`<ReclaimChart>` is a single-series chart; Phase 3 needs a two-series (current vs ideal) view.**
  F6's `ReclaimChart` (`components/app/reclaim/chart/`) takes one `ChartData` (hours per bucket). Phase
  2/3's "current vs ideal" and the live gap need **two** series side by side. **Decision for t-1:**
  extend `buildChartData` to an optional paired form (current + ideal per bucket) and add a grouped
  variant to the chart, rather than a second chart component — one data contract, the same palette +
  benchmark machinery. The energy grid (Phase 2) is its own small visual (energising vs draining ×
  buckets), not a bar chart.

- **The phase content is all `reclaim_*` slots that already exist (F2), and the phases already
  transition (F4).** `reclaim_energy` (4), `reclaim_ideal` (5), `reclaim_gap` (6, incl.
  `reclaim_gap_challenge_offered` + `reclaim_gap_strategy_mirror`), `reclaim_action` (5, incl.
  `reclaim_action_wanted_not_dutiful`), `reclaim_share` (6) — all registered. The reflection gates
  `reclaim_reflection_p2 … p5` are enforced server-side (F4, I9); F7 builds the UI half for each, reusing
  F6's `<Reflection>`. The batch save/read routes + `saveRunAnswers` (F6) are the write path. **No new
  slots, no new Prisma model** — the `ReclaimShare` / `ReclaimReportShare` / `ReclaimFeedback` tables
  are already in the schema (F4 t-1). A `prisma/` diff on this feature is a red flag.

- **Two open items Rashmir owes block sign-off, and one voice test must extend.** Build against the
  current spec and surface the choice — do **not** silently resolve:
  - **Open item 11 (Phase 2 coaching signal, F7 t-1):** the system prompt tells Phase 2 to "signal a
    dedicated coaching conversation can go deeper"; Brief §2 says consultation offers appear "at the
    end and in follow-up, never mid-process". Either the Brief retired the signal or a depth remark is
    not an offer ([[content-source]] §8, Phase 2). Gate it behind a **`Module.config`** value (coach-
    editable, the F2 config schema — **not** feature-flag machinery, per the leaf's no-flags stance),
    defaulting to off until she rules.
  - **Open item 10 (strategy mirror placement, F7 t-2):** "If a stranger read your calendar…" — run 1,
    repeat audits, or both? (`reclaim_gap_strategy_mirror` exists.) Same treatment: a `Module.config`
    toggle, default per her latest steer.
  - **I1/I2 voice (t-2/t-3):** F7 ports the most agent-facing verbatim copy yet (the under-delegation
    invitation, journey framing, closing affirmations). The F2 `voice` invariant test must be extended
    to cover this copy — first-person "I, Rashmir" re-pointed to third person, no banned lexicon, no em
    dashes in agent voice (I2). Paraphrase will pass type-check; the test is the guard.

## Invariants this feature touches

| Invariant                        | How F7 honours it                                                                                                                                     | Guard                                                                                                                          |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **I13** (refer-back data flow)   | a context contributor injects the verbatim `reclaim_setup_keeping_me_up` / `reclaim_setup_why_now` for **this run** at Phase 4 — read, not remembered | unit test on the contributor: given the two run-scoped slot values, the injected block contains them verbatim; not from an LLM |
| **I11** (content loaded)         | under-delegation invitation, journey framing, §9 footnote, closing affirmations render verbatim from `Module.config`; no paraphrase in components     | `leaf:content-diff` (hop 1) + a hop-2 assertion per new verbatim block; **the voice test extended** to F7 copy                 |
| **I1/I2** (voice)                | all F7 agent-facing copy is third-person, banned-lexicon-free, no em dashes                                                                           | `tests/unit/invariants/voice.test.ts` extended to the F7 config strings                                                        |
| **I9** (reflection gates)        | Phases 2–5 each require `reclaim_reflection_p<N>` before advancing; F7 builds the UI, server already enforces the 422                                 | F4's transition test still passes; a component test that each phase blocks advance until reflected                             |
| **I12** (chart ≠ interpretation) | the current-vs-ideal chart renders the two series + the gap; the "suspiciously similar" challenge and naming-the-absence are separate coaching beats  | code review — the chart has no verdict text                                                                                    |
| **I15** (complete closes run)    | Phase 6 completion calls `completeRun` — sets `isActive:false` (I15) and consumes the free grant (F6 I14)                                             | F3's smoke asserts the fresh-conversation effect; a unit test that finishing Phase 6 completes the run                         |
| **I16 / I17** (possibility)      | "want to, or think you should?"; the once-per-audit permission challenge; sharing invited never required; varied closing affirmation                  | copy review against §5 / §10; the challenge fires at most once (guarded by `reclaim_gap_challenge_offered`)                    |
| **I-frame** (not productivity)   | the action plan is "one or two things you can start", framed as a journey not a makeover (§Phase 5); the summary is a mirror, not a scorecard         | copy review                                                                                                                    |

## Test strategy

vitest runs on `happy-dom` with **no live DB** ([[building-a-feature]] §1.2). So:

- **Refer-back contributor (t-2)** — unit test mocking the run lookup + `getSlotHeads`: given the two
  run-scoped setup values, the contributor's returned string contains them **verbatim**; given a
  different run's values, they do not leak (run-scoping). This is the I13 guard.
- **Challenge-once (t-2)** — unit test: the permission-based challenge is offered only when
  `reclaim_gap_challenge_offered` is absent, and writing it guards the second offer.
- **Chart current-vs-ideal (t-1)** — pure test on the paired `buildChartData`: two series aligned by
  bucket, the live gap = ideal − current per bucket.
- **Voice (t-2/t-3)** — extend `voice.test.ts` to the new `Module.config` copy (banned lexicon, em
  dashes, first-person leak).
- **Verbatim (t-3/t-4)** — hop-2 assertions that the journey framing, the footnote, and the closing
  affirmations in config are character-identical to [[content-source]].
- **Completion (t-4)** — unit test that finishing Phase 6 calls `completeRun`; `smoke:reclaim-run`
  already exercises complete → close.

## Promoted tasks

| id  | Intent                                                                                               | Files likely to touch                                                                                                                  | Deps | Status | PR  |
| --- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------ | --- |
| t-1 | Phase 2 energy grid + Phase 3 ideal-week sliders (live gap) + current-vs-ideal chart + hard gate     | `components/app/reclaim/phase/**`, `lib/app/programme/chart/series.ts`, `components/app/reclaim/chart/**`                              | F6   | todo   | —   |
| t-2 | Phase 4 gap analysis + **the refer-back** (I13 context contributor) + once-per-audit challenge       | `lib/app/context-contributors.ts`, `lib/app/programme/**`, `components/app/reclaim/phase/**`, `tests/unit/invariants/voice.test.ts`    | t-1  | todo   | —   |
| t-3 | Phase 5 action plan — entry points, what/when/stop/how-known, wanted-not-dutiful, journey framing    | `components/app/reclaim/phase/**`, `lib/app/programme/content.ts` (verbatim config)                                                    | t-2  | todo   | —   |
| t-4 | Phase 6 summary + share — downloadable artifact, tokenised link, optional demographics/quote consent | `app/(protected)/programme/**`, `app/api/v1/app/reclaim/share/**`, `components/app/reclaim/summary/**`, `lib/app/programme/summary/**` | t-3  | todo   | —   |

> **Sizing note.** Four tasks. t-1 (two phases + the paired chart) and t-4 (the summary artifact +
> share + optional capture) are the heavy ones. **Watch:** if the Phase 6 share flow (tokenised link,
> the artifact render, the optional demographics/quote-consent capture) grows past a reviewable diff,
> split the **share + optional capture** from the **summary artifact** — they are separable (the
> artifact renders from slots; sharing is a token + a gated form).

### t-1 — Phase 2 energy + Phase 3 ideal week

- **Perception-vs-reality is a hard gate before Phase 2** ([[content-source]] §8): the Phase 1 chart +
  the gap must be presented before energy; where the calendar branch was taken, frame a gap as "the
  calendar does not capture everything", not "your estimate was wrong" (I17), with the off-calendar
  note. Reuse F6's `<ReclaimChart>`.
- **Phase 2 energy grid** — which work energises vs drains, per bucket (`reclaim_energy_*`); the
  **team-distribution brainstorm**; the **light coaching-conversation signal behind a `Module.config`
  toggle** (open item 11, default off).
- **Phase 3 ideal week** — sliders per bucket with the **gap updating live** (ideal − current), the
  **"suspiciously similar" gentle challenge** (§8), and the **current-vs-ideal chart** (the paired
  `buildChartData`). Required reflection `reclaim_reflection_p2` / `p3` (I9).

_Done when:_ the perception gate shows before Phase 2; the ideal sliders update the gap live; the
current-vs-ideal chart renders; the coaching signal is config-gated (default off); reflections gate
advance. _Gates:_ full loop (`/code-review` — the paired chart data model).

### t-2 — Phase 4 gap + the refer-back (I13)

- **The refer-back context contributor** in `lib/app/context-contributors.ts`: registered from
  `initAppContextContributors()`, it resolves the user's active run and injects
  `reclaim_setup_keeping_me_up` + `reclaim_setup_why_now` **verbatim, run-scoped** into the Phase 4
  context (I13 — a data flow, never "remember what they said"). **Verify `request.userId` is populated
  on the module surface**; if not, file the [[daybreak-asks]] row.
- **Name the absence**; the **under-delegation invitation verbatim** (§8, Module.config, I11); the
  **hours question at 55+** (§8); the **strategy mirror behind a `Module.config` toggle** (open item
  10); the **once-per-audit permission-based challenge** guarded by `reclaim_gap_challenge_offered` (I16).
- **Extend the voice test** to the new config copy. Required reflection `reclaim_reflection_p4`.

_Done when:_ Phase 4 quotes the Phase 0 answer **verbatim from slot data** (I13 test); the challenge
fires at most once; the under-delegation copy is character-identical to source; the voice test covers
the new copy. _Gates:_ full loop (`/security-review` for the `sensitive`-slot reads; the contributor is
the load-bearing piece).

### t-3 — Phase 5 action plan

- Three **specific entry points**; per action: **what / when / how you'll stop / how you'll know it
  worked**; the **"do you want to, or think you should?"** question (`reclaim_action_wanted_not_dutiful`,
  Brief §5, I16). **Journey framing verbatim** ("a journey, not a makeover", §Phase 5, Module.config,
  I11). Required reflection `reclaim_reflection_p5`.

_Done when:_ the action fields capture the four facets + the wanted-not-dutiful answer; the journey
framing is character-identical to source. _Gates:_ full loop.

### t-4 — Phase 6 summary + share

- **The summary artifact**: a standalone page rendered from the run's slots (buckets, gaps, actions),
  **downloadable** (print-friendly) as well as shareable; the **§9 footnote verbatim** (I11); the
  **closing affirmation, varied** (Module.config). Completing Phase 6 calls `completeRun` (I15 + F6's
  entitlement consume).
- **Sharing invited, never required** — a **tokenised link** (`ReclaimShare`, already in the schema).
  Everything optional appears **only after** the leader opts to share, each with "prefer not to say":
  the **age band in broad bands** (`reclaim_share_age_band`), the **two/three demographic questions**
  (open item 2 — Rashmir owes the exact wording; build against placeholders), the **one-line feedback**
  ("what did you take from this?", `reclaim_share_takeaway`), and the **separate quote-consent checkbox**
  ("Happy for this to be quoted anonymously", `reclaim_share_quotable`) — its own field, governing
  republication, not implied by sharing.
- The **consultation offer once, at the end** (invitation not pitch, §10); the **distinct existing-client
  close** (F8's client tier makes this knowable — coordinate).

_Done when:_ the summary renders from slot data and downloads; the footnote is character-identical;
sharing is genuinely optional (nothing captured before the choice); quote consent is a separate field;
completing Phase 6 completes the run. _Gates:_ full loop (`/security-review` — the tokenised link +
`sensitive` share fields; `/code-review` — the artifact).

## Notes / deferrals

- **F7 finishes the critical path** (`ryw-provenance → ryw-module → ryw-firstlight → ryw-shell →
ryw-current → ryw-phases`). After it, the audit runs end to end. F9 (repeat) and F10 (admin) build on
  the run index + share/feedback tables F7 populates.
- **Three items Rashmir owes gate sign-off, not the build:** open items 2 (demographics), 10 (strategy
  mirror), 11 (Phase 2 coaching signal). Build against the current spec; config-gate 10 & 11, placeholder
  2; none of them blocks starting the work.
- **No new slots, no new Prisma model** — F7 writes F2's registered slugs and F4's `ReclaimShare` /
  `ReclaimFeedback` tables. The tokenised link is a row + a token, not a schema change.
- **Possible [[daybreak-asks]] shape (t-2):** if the module-surface context builder does **not** pass
  `request.userId` (or does not invoke app contributors at all), the refer-back can't scope to the user
  without it — that gap is a framework ask, filed against Daybreak, with the leaf reading the active run
  directly meanwhile.
