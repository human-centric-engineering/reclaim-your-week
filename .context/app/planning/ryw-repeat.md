---
name: ryw-repeat
feature: F9 · ryw-repeat
epic: RYW v1
status: shipped
owner: John
depends_on: F7 · ryw-phases (shipped #39) · F1 · ryw-provenance (shipped #17, whose getSlotHistory this is the only consumer of) · F6 · ryw-current (#37, the chart family + bucket labels) · F10 · ryw-admin (#43, the return-rate measure this makes meaningful)
spec: ../sources/Reclaim_Your_Week_Brief_for_John.md §1 (whether people come back) · §2 (repeat audits and nudges — trend line per area, open each repeat by comparing, gentle quarterly cadence) · ../content-source.md §4 (the recent-audit shortcut, verbatim) · ../invariants.md (I3 write path, I7 canonical slugs, I8 hours not percentages, I12 no interpretation, I16 the tool returns people to their own discernment)
parent: plan.md
opened: 2026-07-25
shipped: 2026-07-26 (#46; the D1 read fix landed ahead as #45; plan #44)
---

# ryw-repeat — the second audit, and what it knows about the first

> Feature-level build plan for **F9 `ryw-repeat`** — the **last feature in the RYW v1 epic**. Parent:
> [[plan#F9 · `ryw-repeat` — repeat audits|plan.md]]. Binding _how_: the **Brief** (§1 the success
> measure, §2 "yes to the trend line per area and to opening each repeat by comparing with the last")
> and [[content-source]] §4 (the recent-audit shortcut, verbatim), under [[invariants]] — **I12** no
> interpretation, **I16** no nagging, **I7** canonical slugs, **I3** one write path.
> Sizing follows the parent: **task = one PR**.
>
> **Documents read whole while planning this** (per [[planning-retro]] §A — "a grep is not a read"):
> the Brief §1/§2/§3/§8, [[plan]], [[ryw-admin]], [[ryw-current]], [[ryw-phases]],
> [[building-a-feature]], [[planning-retro]], [[invariants]], [[slot-spec]], [[content-source]] §4,
> and in the repo: `lib/framework/data-slots/values.ts`, `lib/app/programme/runs/answers.ts`,
> `lib/app/programme/summary.ts`, `lib/app/programme/chart/series.ts`,
> `lib/app/programme/buckets/labels.ts`, `app/api/v1/app/reclaim/runs/service.ts`,
> `app/api/v1/app/reclaim/shared/[token]/route.ts`, `lib/email/registry.ts`, `lib/email/send.ts`,
> `lib/orchestration/scheduling/scheduler.ts`.

## Intent

Brief §1 names the measure: _"The success measure is not downloads; it is whether people come back,
and whether they tell others about it unprompted."_ F10 t-2 now **reports** that number. F9 is what
makes it worth reporting — because today a leader who comes back gets a **blank second audit that
knows nothing about their first**. They re-answer the same ten context questions, see the same
single-run chart, and get no sense of whether anything moved. That is not a repeat audit; it is the
first audit again.

Three things, all of them named by Rashmir in one sentence of Brief §2:

> **Repeat audits and nudges?** Yes to the trend line per area and to opening each repeat by comparing
> with the last. The natural cadence is quarterly, which is also the shape of the future paid offer,
> so nudges should be gentle and quarterly rather than frequent.

- **The trend line per area** — how each of the nine buckets has moved across a leader's audits.
  This is what F1 t-2 built `getSlotHistory()` for, and **F9 is still its only consumer**; the read
  has sat unused since #17 waiting for this feature.
- **The comparative open** — a repeat audit begins by showing the leader where they were, not by
  starting from nothing. Plus [[content-source]] §4's recent-audit shortcut: an audit within the last
  month **confirms** stable context rather than re-asking it.
- **The gentle quarterly nudge** — the one place this product deliberately reaches out, and therefore
  the one place I16 is most at risk.

**The invariant most at risk here is I16, and it is worth naming before any code.** The tool "returns
people to their own discernment"; Brief §2 asks for _no pressure on next steps anywhere in the
product_. A nudge is, structurally, pressure. A trend line is, structurally, a scoreboard — and a
leader whose deep-work hours went **down** between audits must not open this feature and be told they
have failed. I12 says the charts do not interpret; F9 needs its sibling: **the comparison shows what
changed and says nothing about whether that is good.** A quarter where someone deliberately gave more
time to team development at the cost of strategy is a success that a naive trend line renders as two
red arrows.

## Reconciliation against the live repo

Verified 2026-07-25 against `main` at the F10 merge (#43). Seven findings. **D1 is a live bug in
shipped code, and it moves work into t-1 before any trend line is possible.**

### D1 — run-scoped reads are not actually run-scoped. F7's share links break the moment audit 2 starts.

`readRunAnswers(userId, runId)` (`lib/app/programme/runs/answers.ts:23`) reads **`getSlotHeads`** and
then filters by `provenance.runId`. `getSlotHeads` is `WHERE supersededAt IS NULL` — it returns only
the **current** version of each slug. So the filter can only ever match slugs whose latest value
belongs to the requested run.

The consequence is not subtle. The moment a leader starts audit 2 and answers anything, that slug's
run-1 version is superseded, and **`readRunAnswers(userId, run1)` stops returning it**. Everything
built on it degrades silently:

- `buildSummary(userId, run1)` returns a progressively emptier summary as audit 2 fills in.
- **`GET /api/v1/app/reclaim/shared/[token]`** — the tokenised public link F7 t-4 invites leaders to
  share — renders that emptying summary. A leader who shared their Q1 results with a colleague finds
  the link has quietly hollowed out because _they_ started a Q2 audit. Nobody is told.
- F6's chart for a past run, and anything else reading a completed run's picture.

**This is F1 t-2's whole purpose going unused.** `getSlotHistory(userId, slotSlug)` returns every
version including superseded ones, precisely so "run 1 and run 2 side by side" is readable, and F9
has been its only intended consumer since #17. Nothing switched `readRunAnswers` over because until
now no second run existed to expose it.

**Ruling: t-1 fixes `readRunAnswers` first, and the trend lines fall out of the same read.** A
history-based reader keyed on `provenance.runId` is what both need. Two constraints:

- `getSlotHistory` is **per-slug** — nine buckets plus the context slugs is a lot of round trips per
  page. The honest fix is a batched read; whether that is a leaf query over `SlotValue` (the same
  justification F10 used for node states: the route guard is the gate and `userId` is the seam) or a
  [[daybreak-asks]] row asking for `getSlotHistory`'s batched sibling is the one open question t-1
  settles. **Prefer the ask _and_ the leaf implementation** — F1 already established that per-run
  provenance is a generic facilitation need, not an RYW one.
- **Regression-test the share link explicitly.** "A run-1 share link still renders after run 2 starts"
  is the assertion that would have caught this, and its absence is why the bug shipped.

### D2 — the trend line has no second run to plot, and cannot be smoke-tested into existence.

There is no fixture, no seed, and no smoke that produces a user with two completed audits — every
existing smoke drives one run. `smoke:reclaim-run` completes a single audit and stops.

This is the honest constraint the board has been circling for two features: **F9 can be built and
tested but not observed.** The plan's answer is not to pretend otherwise:

- **A stateful in-memory fake for the unit tests** ([[building-a-feature]] §1.2's sanctioned pattern):
  two runs' worth of slot versions with distinct `provenance.runId`s, so the grouping, ordering and
  gap-handling are proven directly.
- **Extend `smoke:reclaim-run` to a second run** against real Postgres — create, answer, complete,
  then create again and assert the comparative open sees run 1. That is the fidelity test that
  matters, and it is the only way D1's fix is proven against actual `supersededAt` behaviour.
- No new smoke script; this is the existing one's natural second half.

### D3 — bucket relabelling already carries. t-4 is mostly already true.

`plan.md` t-4 asks to "carry relabelled bucket names through trend lines and the comparative open".
`ReclaimBucketLabel` is **per-user, not per-run** (`@@unique([userId, bucketSlug])`), and
`readBucketLabels(userId)` is already what `buildChartData` takes — so a bucket renamed in run 1 is
already renamed in run 2 by construction, and I7 keeps the canonical slug underneath.

**Ruling: t-4 collapses into t-1's done-when as a test**, not a task. What is genuinely left is one
question the current design does not answer: if a leader **renames a bucket between audits**, the
trend line's label changes retroactively for run 1 too — the chart says they always called it that.
That is almost certainly right (it is one continuous personal history, and the alternative is a
legend with two names for one line), but it should be a recorded decision rather than an accident.
Per [[building-a-feature]]'s sizing self-check, a task whose only content is a test is a commit.

### D4 — the email registry is closed to new kinds, exactly like F8's hook enum.

`EmailPropsMap` (`lib/email/registry.ts:28`) is a fixed interface of four auth kinds — `welcome`,
`verifyEmail`, `resetPassword`, `invitation`. `EmailKind = keyof EmailPropsMap`, and
`EmailOverrides` is keyed on it. So the leaf can **override** an existing kind (F8 t-1 did exactly
that for `invitation`) and **cannot add one**. The quarterly nudge is a new kind.

The machinery underneath is generic, though: `sendEmail({ to, subject, react })` takes any React
element. So the leaf answer is the same shape F8 reached for the closed `HOOK_EVENT_TYPES`
(sunrise#465): render a leaf-owned template and call `sendEmail` directly, skipping the registry.

**Ruling: t-3 ships `components/app/emails/quarterly-nudge.tsx` + a direct `sendEmail`, carries no
core code, and files the [[daybreak-asks]] row.** This is the third closed-enum finding in three
features, which is itself worth saying in the row: the pattern is a generic mechanism behind a shut
type, and every fork pays the same toll.

### D5 — there is no scheduled-job seam a leaf can use, and no unsubscribe anywhere.

Two separate gaps, both landing on t-3.

**Scheduling.** Sunrise's scheduler (`lib/orchestration/scheduling/scheduler.ts`) processes
**workflow** schedules only — `processDueSchedules()` walks `AiWorkflowSchedule` rows and starts
workflow executions. There is no generic "run this leaf job on a cron" registration. The tick itself
is an admin route (`POST /api/v1/admin/orchestration/schedules/tick`) documented as "designed to be
called every ~60 seconds by an external cron job".

Modelling the nudge as a workflow to reach the scheduler would be a heavy indirection for "email the
leaders whose last audit finished about ninety days ago". **Ruling: a leaf tick route** —
`POST /api/v1/app/reclaim/nudges/tick`, driven by the same external cron the platform already
assumes, mirroring core's own pattern rather than inventing one. Ledger the missing seam.

**Unsubscribe.** There is **none** — no preference centre, no unsubscribe token, no suppression list
anywhere in `lib/`. `ReclaimConsent.marketingOptIn` (F8 t-4) is the only related field and it is
about Rashmir's list, not about product email.

This is the finding that most shapes t-3, and it is a compliance point as much as a design one: an
unsolicited recurring email with no way off it is not defensible, whatever it is called. See D6.

### D6 — is the nudge a service message or marketing? Decide it, because I16 and the law both turn on it.

The nudge sits on a genuine line. It is **about the recipient's own use of a tool they signed up
for**, which reads as service/transactional. It is also **unsolicited, recurring, and exists to drive
re-engagement**, which is what marketing email is.

**Ruling — treat it as opt-in-with-easy-exit, and do not lean on the technicality.** Concretely:

1. **A per-user nudge preference**, defaulted **on at the point the leader completes an audit** (they
   have just used the thing, and Rashmir's §2 answer is "yes to nudges") but **switchable off in one
   click from the email itself**, via a tokenised unsubscribe link that needs no login. A leader who
   has stopped using the product must not have to log in to make it stop.
2. **`marketingOptIn` is not reused for this.** It means "on Rashmir's list" (F8 t-4 was explicit
   that list membership is a separate fact), and conflating the two would let an unsubscribe from one
   silently change the other.
3. **At most one nudge per audit cycle, ever.** Not "quarterly until they respond". Brief §2 says
   _gentle and quarterly rather than frequent_; a sequence is what makes a nudge a nag (I16), and the
   difference between the two is entirely in the frequency and the copy.
4. **The copy is product, like F8's refusals.** It says their last audit was about three months ago
   and the door is open. It does not say they are slipping, does not quantify what has probably
   drifted, and does not pitch. Brief §2: _no pressure on next steps anywhere in the product_.

New column on `ReclaimConsent`? No — a separate `nudgeOptOut` fact belongs with the user's programme
state, and `ReclaimConsent` is the retained lawful-basis record with a deliberate `SET NULL`. t-3
adds a small `app_reclaim_nudge` table (last sent, opted out, token) with `CASCADE`, which also gives
the "at most one per cycle" guarantee a row to hang idempotence off — the F6/F8 lesson about
deterministic keys applies here too.

### D7 — the comparative open must not become a verdict. This is I12's sibling and the plan's main design risk.

`buildChartData` already computes benchmark status per bucket (`under` / `in` / `over`), and it would
be one line to render "you were `in` and are now `over`". That is exactly the interpretation I12
forbids on the consumer side, and a delta makes it worse: it implies a direction of travel the tool
has no standing to judge.

**Ruling: the comparison presents both pictures and the arithmetic difference, and stops there.**
Hours, never percentages (I8). No arrows coloured good/bad. No "improved"/"slipped" language. Where
the tool speaks at all, it asks — the source's own register ([[content-source]] §4's "Is all of that
still accurate, or has anything changed?"), and F7's reflection prompts are the model: _what stands
out to you here?_

One deliberate exception, and it needs Rashmir: **the recent-audit shortcut's confirm line is
verbatim source** ([[content-source]] §4) and includes interpolated context —
_"I can see from your recent audit that you are [role] at [organisation], working around [hours] per
week, with [priorities]. Is all of that still accurate, or has anything changed?"_. That is loaded
into the UI as content (I11), not paraphrased.

## Invariants this feature touches

| Invariant                    | How F9 honours it                                                                                                                                             | Test                                                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **I12** (no interpretation)  | The comparison shows both runs and the difference in hours. No verdict, no good/bad colouring, no "improved"/"slipped" (D7)                                   | Component test: a bucket that fell renders the same treatment as one that rose; a grep guard for banned delta words |
| **I16** (their discernment)  | One nudge per audit cycle, opt-out in one click without logging in, copy that states a fact and offers a door (D6)                                            | Unit: a second nudge in the same cycle is refused; an opted-out user is never selected                              |
| **I8** (hours, not %)        | Trend lines and deltas are in hours. Percentages may be derived for display, never the comparison's unit                                                      | Unit on the trend series                                                                                            |
| **I7** (canonical slugs)     | Trends group by canonical `bucketSlug`; a relabel changes only the display label, across all runs (D3)                                                        | Unit: two runs with a relabel between them stay one series                                                          |
| **I3** (one write path)      | The recent-audit shortcut pre-fills the Phase 0 form; every confirmed value is still written by `saveAnswer` under the **new** run's id — never copied across | The existing `write-path` guard; unit asserting carried-forward answers carry run 2's `provenance.runId`            |
| **I11** (content is loaded)  | §4's confirm line is loaded from `Module.config`, interpolated, never paraphrased                                                                             | The hop-2 character-identity test extended to the new string                                                        |
| **I15** (fresh conversation) | Untouched — F4 already closes the surface conversation at completion, so audit 2 opens a fresh transcript                                                     | Existing                                                                                                            |

## Test strategy

vitest on `happy-dom`, **no live DB** ([[building-a-feature]] §1.2). F9's particular problem is that
its subject — two audits weeks apart — cannot be conjured, so the strategy carries more weight than
usual (D2).

- **A stateful in-memory slot fake** is the core of it: versions of a slug under two different
  `provenance.runId`s, with `supersededAt` set the way the real store sets it. Every grouping,
  ordering and gap case is proven against that, directly, not through a mocked Prisma chain.
- **The trend/compare builders are pure** — versions in, series out — and tested as such: a bucket
  present in run 1 and absent in run 2, a bucket that appeared for the first time in run 2, a relabel
  between runs, and a leader with only one audit (the trend view must degrade to "not yet" rather
  than a one-point line).
- **`smoke:reclaim-run` extended to a second run** — the only place D1's fix meets real
  `supersededAt` behaviour, and the regression test for F7's share link.
- **Component tests** for the comparative open and the trend chart, asserting the I12 discipline
  (no valenced treatment of a fall) rather than pixels.
- **No new smoke for the nudge.** Its selection query is pure logic over rows and belongs in a unit
  test; a smoke that sends mail is not something to run in CI.

## Promoted tasks

| id  | Intent                                                                                                              | Files likely to touch                                                                                                                                                                                                                                                | Deps | Status | PR  |
| --- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------ | --- |
| t-1 | **Fix run-scoped reads (D1)**, then per-bucket trend lines over the history read; relabels carried across runs (D3) | `lib/app/programme/runs/answers.ts`, `lib/app/programme/trends.ts`, `lib/app/programme/chart/**`, `components/app/reclaim/chart/**`, `app/api/v1/app/reclaim/runs/[runId]/trends/route.ts`, `scripts/smoke/reclaim-run.ts`, `.context/app/daybreak-asks.md`          | —    | done   | #46 |
| t-2 | The comparative open + the recent-audit shortcut (§4, verbatim)                                                     | `lib/app/programme/compare.ts`, `lib/app/programme/content.ts` (§4 confirm line), `components/app/reclaim/phase/setup-panel.tsx`, `components/app/reclaim/compare/**`, `app/api/v1/app/reclaim/runs/route.ts`                                                        | t-1  | done   | #46 |
| t-3 | The quarterly nudge: schema, selection, leaf email, tick route, one-click unsubscribe                               | `prisma/schema/app-reclaim.prisma` + migration, `lib/app/leaf-db-drift.ts`, `lib/app/programme/nudges/**`, `components/app/emails/quarterly-nudge.tsx`, `app/api/v1/app/reclaim/nudges/tick/route.ts`, `app/(public)/nudges/off/**`, `.context/app/daybreak-asks.md` | t-1  | done   | #46 |

> **Sizing note.** Three tasks, not the board's four: **t-4 collapses into t-1** (D3 — per-user
> labels already carry, so what is left is a decision and a test, which is a commit rather than a
> PR). t-1 is the heavy one and has grown: it carries D1's fix to already-shipped behaviour before it
> can build anything new. **If t-1's diff runs long, split D1's read fix out as its own PR** — it is a
> correctness fix to F7's share links that stands on its own merit and should not wait behind a chart.
> t-3 is independent of t-2 and can go in either order.

### t-1 — Run-scoped reads, then the trend lines

- **The read fix first** (D1): `readRunAnswers` must return a run's values whether or not a later run
  has superseded them. A batched history read keyed on `provenance.runId`, with the
  [[daybreak-asks]] row for `getSlotHistory`'s missing batched sibling — and the leaf implementation
  alongside it, since F1 already established per-run provenance as a generic need.
- **The regression test that was missing:** a run-1 share link still renders in full after run 2 has
  started. This is the assertion whose absence let the bug ship in F7.
- **Trend lines per bucket** over the leader's audits, hours (I8), grouped by canonical slug (I7),
  labelled with the user's current display label (D3). Sensible degradation: one audit shows an
  invitation to come back rather than a one-point chart.
- **Record the relabel decision** (D3): a rename applies to the whole history, so the series reads as
  one continuous line under the leader's current name for it. One legend, one name.

_Done when:_ a completed run's summary and share link render unchanged after a later run starts, with
a test; trend lines show two runs' hours per bucket; a bucket relabelled between runs is one series
under the current label; `smoke:reclaim-run` completes a second run and reads the first; the
[[daybreak-asks]] row exists. _Gates:_ full loop (`/code-review` — a data-read fix under shipped
behaviour is exactly its shape; `/security-review` — the share link is the app's one unauthenticated
endpoint).

### t-2 — The comparative open and the recent-audit shortcut

- **Every repeat audit opens by comparing** (Brief §2): entering Phase 1 on a second-or-later run
  shows the previous audit's picture beside the new one as it fills in. **Both pictures and the
  difference in hours, no verdict** (D7, I12).
- **The recent-audit shortcut** ([[content-source]] §4, verbatim): where the last completed audit is
  within the configured window, Phase 0 **confirms** rather than re-asks — the interpolated confirm
  line loaded from config (I11), with the leader able to change anything. The window is coach-editable
  (the source says "within the last month"; that is a policy, and F8 established the pattern of
  putting Rashmir's "or something like that" numbers in `Module.config`).
- **Carried-forward answers are re-written under the new run** (I3): confirming context saves through
  `saveAnswer` with run 2's id. Never copied, never shared across runs — that is what would make run
  1's picture mutate retroactively.
- The copy asks rather than tells, in §4's own register.

_Done when:_ a second run opens showing the first's picture; a run within the window pre-fills Phase 0
with the source's confirm line and writes confirmed values under the new run id, with a test; a fall
in a bucket renders with the same visual treatment as a rise (I12), with a test. _Gates:_ full loop.

### t-3 — The quarterly nudge

- **`app_reclaim_nudge`** (D6): `userId` CASCADE, `lastSentAt`, `optedOutAt`, an unsubscribe `token`,
  and the audit cycle it was sent for — so "at most one per cycle" is a **deterministic key**, not a
  count (the F6/F8 TOCTOU lesson). Drift probes in `leaf-db-drift.ts`.
- **Selection:** leaders whose most recent audit **completed** about a quarter ago, who have not
  opted out, who have no audit in progress, and who have not already been nudged for that cycle. Pure
  logic over rows, unit-tested.
- **A leaf email template** (D4) rendered through `sendEmail` directly, since the registry cannot take
  a new kind. Brief §7's reassurance register, third person (I1), no em dashes (I2), and **no pitch**.
- **The tick route** `POST /api/v1/app/reclaim/nudges/tick` (D5), driven by external cron the way
  core's own scheduler tick is. Its own rate-limit sub-cap — a route that sends mail is exactly the
  expensive sub-flow `CLAUDE.md` carves out.
- **One-click unsubscribe with no login**: a tokenised public route, the same 244-bit-token shape F7
  used for share links. A leader who has stopped using the product must be able to stop the email
  without getting back into it.
- **The [[daybreak-asks]] rows**: the closed `EmailPropsMap` (third closed-enum finding in three
  features) and the absent leaf scheduled-job seam.

_Done when:_ a leader a quarter past their last completed audit is selected exactly once, with a
test; an opted-out leader and a mid-audit leader are never selected, with tests; the unsubscribe link
works without a session and is idempotent; the tick has its own sub-cap; the email carries no pitch.
_Gates:_ full loop (`/security-review` — an unauthenticated token route plus an outbound mail path).

## Notes / deferrals

- **F9 closes the epic.** With it, RYW v1 is complete: the leader's audit (F1–F7), the door (F8), the
  operator surface (F10), and the reason to come back (F9). What follows is the Parked list in
  `plan.md`, not more of this epic.
- **This feature cannot be observed working until the cohort has repeat data**, which is a calendar
  problem rather than a build one (D2). The first real signal will be F10 t-2's return-rate figure
  moving off "not enough data yet" — worth saying out loud at close-out so nobody reads a flat number
  in month one as a defect.
- **What F9 does _not_ do:** payments and the quarterly-review paid offer (parked — Brief §8 calls the
  cadence "the shape of the future paid offer", and F9 builds the cadence, not the offer); the
  follow-up email sequence (F8 t-4 left the seam and the nudge is deliberately **not** a sequence);
  cross-run analytics for Rashmir (F10 t-2 reports return rate; per-leader trends are the leader's).
- **One open item touches this and does not block it:** the colour questions (open items 1 & 3) — the
  trend chart reuses F6's provisional palette and inherits whatever Rashmir rules.
- **The one thing to re-verify before t-1** — that `provenance.runId` is actually populated on every
  historical slot version, not just recent ones. `saveAnswer` has stamped it since F4 t-2 and no
  production data predates that, so this should hold; but the trend read is meaningless for any
  version where it is absent, and finding that out in t-1 is much cheaper than in t-2.
