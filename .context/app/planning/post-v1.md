---
name: post-v1
description: The board for everything left after RYW v1 shipped — hygiene, client-owed items, launch tasks, upstream, and the parked epics. Mirrors plan.md's style one epic later.
parent: plan.md
---

# Reclaim Your Week — after v1

> **`RYW v1` is complete.** All ten features shipped (F1–F10, 2026-07-24 → 2026-07-26); the board and
> the work log are in [[plan]]. This file is what came next.
>
> It exists because "all the features are done" and "the project is done" turned out to be different
> sentences, and the gap between them was not written down anywhere. A close-out audit on 2026-07-26
> found no half-built feature and no deferral dropped between features — but it did find documentation
> that misdescribes the codebase, privacy-critical smokes that no gate runs, and a public-facing
> surface that is still the starter template. None of that belongs in a feature plan, and none of it
> should live only in a conversation.

## How to read this

Same discipline as [[plan]], one epic later: **a flat board, one owner per item, status at a glance,
plan-first for anything larger than a commit.** The differences are that items are smaller than
features (most are one PR, several are one commit) and that many are **not ours to close** — they wait
on Rashmir, on an upstream release, or on a deployment decision.

**Legend.** `shipped` — merged to `main`. `in flight` — someone is on it. `ready` ▲ — nothing blocks
it. `blocked → X` — waiting on X. `waiting: <who>` — outside our control. `parked` — deliberately not
now.

**The rule that governs the whole board:** an item stays here until it is either merged or explicitly
parked with a reason. Nothing leaves by being forgotten.

---

## Board

| #   | Item                                               | Owner   | Status            | Class     | Blocks / waits on           |
| --- | -------------------------------------------------- | ------- | ----------------- | --------- | --------------------------- |
| P1  | The asks ledger describes code that is not there   | John    | **shipped**       | integrity | —                           |
| P2  | `invariants.md` says its own tests are unwritten   | John    | **shipped**       | integrity | —                           |
| P3  | No reclaim smoke runs in any gate                  | John    | **shipped**       | gate      | 2 of 5 still manual (below) |
| P4  | The public surface is still the starter template   | —       | blocked → Rashmir | launch    | open items 3, 4, 7          |
| P5  | The quarterly nudge has no scheduler               | —       | ready ▲           | launch    | a deploy decision           |
| P6  | Doc drift: stale cross-references                  | —       | ready ▲           | integrity | —                           |
| P7  | F2 has no feature plan                             | —       | ready ▲           | record    | —                           |
| P8  | `ryw-repeat.md` has no post-build record           | —       | ready ▲           | record    | —                           |
| P9  | Operator-side trends over the success measures     | —       | ready ▲           | feature   | nobody owns it (see below)  |
| P10 | Is I4's non-persistence contractual or incidental? | —       | ready ▲           | risk      | —                           |
| P11 | The upstream-sync playbook                         | —       | ready ▲           | upstream  | 17 open asks                |
| P12 | The eleven items Rashmir owes                      | Rashmir | waiting: Rashmir  | client    | sign-off, not build         |
| P13 | The follow-up email sequence                       | —       | parked            | scope     | Brief §2; seam only in v1   |
| P14 | User-facing subject-access export                  | —       | parked            | scope     | not asked for in the Brief  |
| P15 | The parked epics                                   | —       | parked            | scope     | future epics                |
| P16 | A provider key for CI, or a nightly smoke run      | —       | ready ▲           | gate      | P3's remainder; a cost call |

**Doing P1–P3 first was deliberate.** They are the three where the repository currently tells a
reader something untrue, or where a claim the product makes to users is not gated by anything. Every
other item is honest about its own state; these three were not.

---

## P1 · The asks ledger describes code that is not there

_Owner:_ John · _Status:_ **shipped** · _Class:_ integrity

[[daybreak-asks]]'s **sunrise#463** row states that F8 "drops the signup link via the reserved
`lib/app/public-nav.ts` seam", and its delegate-when-it-lands action instructs a future maintainer to
"delete the leaf's `public-nav.ts` tidy". Neither is true: all three exports in `lib/app/public-nav.ts`
are `null`, and no leaf commit has ever touched the file — its only commit is the upstream seam
release.

**Why this one is first.** Everything else on this board is a gap someone can see. This is the
codebase's own map being wrong, in the one file whose entire job is to tell the next upstream sync
what to delete. A sync that follows it would go looking for a tidy that does not exist, and — worse —
might conclude the signup door was closed when it is not.

**And the tidy would not have worked anyway**, which is the more useful finding. `DEFAULT_PUBLIC_NAV`
is Home / About / Contact and contains no signup link at all. The actual routes to `/signup` are the
"Get Started" call-to-action buttons on the landing and about pages, and core's signed-out user
button. So the leaf-side cosmetic answer F8 planned was aimed at the wrong surface.

_Done when:_ the row describes the codebase as it is; the real signup entry points are named where a
reader will find them (P4, since two of the three are template pages awaiting replacement); the
delegate-when-it-lands action is executable. **Done** — the row now records that the tidy was never
built **and could not have worked**, names the three real `/signup` routes, points at P4 for the two
that are template pages, and its delegate action no longer instructs deleting a file that was never
touched.

## P2 · `invariants.md` says its own tests are unwritten

_Owner:_ John · _Status:_ **shipped** · _Class:_ integrity

The header block of [[invariants]] reads: _"Only one of them exists today… Every
`tests/unit/invariants/*.test.ts` file named below is **still to be written**"_ — naming F2 t-4, F4
t-2 and F5 as the features that will write them. All six now exist and all six run in `leaf:checks`,
which CI runs on every PR.

`CLAUDE.md` mandates reading this file before writing any code, so it is the highest-traffic document
in the repository, and its own closing line is _"an unwritten test that reads as written is worse than
no test named at all."_ That is now inverted: a written test reading as unwritten invites the next
person to either re-do it or distrust the guard.

_Done when:_ the block states which guards exist and where they run; the two mis-attributions
alongside it are corrected (I4's calendar proof is `smoke:reclaim-calendar`, not `smoke:reclaim`).
**Done** — the block is now a table of the eight guards with the feature each landed in and the fact
that `leaf:checks` runs them on every PR, plus an explicit note that it used to say the opposite and
why that matters. It also now separates the guards that **run** from the two things that are still
specification: the manual smokes (P3), and the judgement invariants (I-frame, I13, I16, I17) that no
test can express.

## P3 · No reclaim smoke runs in any gate

_Owner:_ John · _Status:_ **shipped** · _Class:_ gate

CI's `smoke` job runs Sunrise core's `scripts/smoke/erasure.ts` and the drift check. **None of the
five leaf smokes runs anywhere except an author's laptop, at their discretion.** Two of them back
claims the product makes to its users:

- `smoke:reclaim-calendar` — **I4**, that no meeting title is ever persisted anywhere. This is the
  product's trust story, not a nice-to-have.
- `smoke:reclaim-erasure` — that erasure reaches every `app_reclaim_*` row **and**
  `framework_slot_value`, where the audit answers actually live.

And one is a regression test for a bug that shipped: `smoke:reclaim-run` step 8 proves a completed
run still reads after a later run supersedes it — the defect that silently emptied F7's public share
links.

**We have already paid for this gap.** `smoke:reclaim-calendar` was red on `main` from #41 until F10
noticed it two features later, because F8 closed the consent gate in front of `createRun` and nothing
re-ran it.

**The constraint is honest and worth stating:** two of the five make real model calls
(`smoke:reclaim` streams a turn, `smoke:reclaim-calendar` categorises), so they cannot run in CI
without a provider key. The other three need only Postgres and the seed, both of which the `smoke`
job already has.

_Done when:_ every smoke that can run without a provider key runs on every PR; the two that cannot are
documented as a manual gate with the reason, and their claims are covered by whatever unit-level guard
does exist.

**Done, with one part deliberately left open.** `smoke:reclaim-run`, `smoke:reclaim-erasure` and
`smoke:reclaim-access` now run in CI's `smoke` job on every PR — verified under CI's exact invocation
(`npx tsx scripts/smoke/…`, env from the job block, no `.env.local`). The job's `db:seed` already
materialises the reclaim module, map and coach agent, because the seed runner walks subdirectories.

**`smoke:reclaim` and `smoke:reclaim-calendar` remain manual**, because both make real model calls and
CI holds no provider key. That is a real remaining hole and it is the one that already bit us, so what
covers it now is worth stating precisely:

| Claim                                  | Gated by                                                      | Runs in CI |
| -------------------------------------- | ------------------------------------------------------------- | ---------- |
| I4 — no meeting title ever persisted   | `tests/unit/invariants/calendar-privacy.test.ts`              | ✅ yes     |
| I4 — proven against a real `.ics` + DB | `smoke:reclaim-calendar`                                      | ❌ manual  |
| I15 — a repeat audit opens fresh       | `smoke:reclaim-run` (asserts a new run id + `isActive:false`) | ✅ yes     |
| I5 — no `special_category` slot        | `tests/unit/invariants/slot-sensitivity.test.ts`              | ✅ yes     |
| The coach streams a turn at all        | `smoke:reclaim`                                               | ❌ manual  |

So the **structural** half of I4 is gated and the **end-to-end** half is not. Closing that needs a
provider key in CI — a cost/secret decision rather than a code change, so it is **P16** below rather
than something to decide unilaterally here.

---

## The rest of the board, in brief

### P4 · The public surface is still the starter template

`app/(public)/page.tsx`, `about/`, `terms/` and `privacy/` are stock Sunrise copy — the landing page
still asks "Is Sunrise really free?". The sharp end is **`privacy/page.tsx`, which is documented
in-file as a placeholder**, because that is the page the consent gate links leaders to, and F10 t-3's
anonymised aggregate rests its lawful basis on consent recorded against `policyVersion: 'draft-1'`.
Open item 4 undersells this as "page copy"; it is the only user-facing surface no feature ever owned.
Blocked on Rashmir (items 3, 4, 7). P1's signup-CTA finding lands here.

### P5 · The quarterly nudge has no scheduler

`POST /api/v1/app/reclaim/nudges/tick` is built for a daily external cron, matching the platform's own
pattern. Nothing schedules it, so F9 t-3's whole mechanism never fires until someone wires it at
deploy. A deployment decision (platform cron vs. a workflow), not a code change.

### P6 · Doc drift: stale cross-references

_Owner:_ John · _Status:_ **shipped** · _Class:_ integrity

Three one-line lies, fixed alongside P1/P2 because they are the same failure mode:

- `plan.md` open item 11 said "Blocks F7.1" — F7 shipped as #39. Removed.
- `lib/app/programme/map.ts` said `runId` provenance is "not yet consumed until `saveAnswer`, F4 t-2".
  It is consumed, and F9 now reads it back per run. Corrected.
- [[planning-retro]]'s I11 seed expectation still said "the second hop is still unbuilt". F2 t-3 built
  it — and **F10 t-4 surfaced a third hop nobody had predicted**: once Rashmir edits content in the
  admin UI, what users read lives in `Module.config` in the database, where neither guard reaches.
  The entry now records both, and the lesson that generalises from it: _a chain-of-custody guard is
  only as long as the last place the content can change._

### P7 · F2 has no feature plan

F2 `ryw-module` is the only feature with no `ryw-*.md` — and it is the one that loaded 105 slots and
all of Rashmir's verbatim IP, i.e. the feature the plan itself called the highest risk for silent
drift. There is a record in `plan.md` and in the I11 guards, but not the reconciliation-and-decisions
record every other feature has.

### P8 · `ryw-repeat.md` has no post-build record

`ryw-admin.md` carries "What the build changed about this plan" and "What the gates found";
`ryw-repeat.md` stops at its deferrals. So F9's D1–D7 reconciliations are never marked resolved in
their own file, and **the plan's explicit pre-flight check — re-verify that `provenance.runId` is
populated on every historical slot version — has no recorded outcome.** The nine gate findings are in
`plan.md`'s work log but not in the feature's own plan.

### P9 · Operator-side trends over the success measures

Deferred in a circle: `ryw-admin.md` says trends over the success measures are "F9's history reads";
`ryw-repeat.md` says cross-run analytics for Rashmir are F10's and "per-leader trends are the
leader's". Both features have shipped and `admin/measures.ts` has no time series. Genuinely on the
floor — low severity (Brief §1 asks for the measures, not their trend), but nobody owns it and it is
not parked.

### P10 · Is I4's non-persistence contractual or incidental?

`ryw-calendar.md` asked t-2 to note whether the categorise step's non-persistence is a **contract** or
merely current behaviour of `runStructuredCompletion`, and to file a [[daybreak-asks]] row if the
latter. No row exists and no answer was recorded. I4 is guarded downstream by
`tests/unit/invariants/calendar-privacy.test.ts` and the calendar smoke, so the claim holds today —
but an upstream refactor could break it silently, which is exactly the question that was asked and
not answered.

### P11 · The upstream-sync playbook

**17 open asks: 8 Daybreak, 9 Sunrise. All filed.** Four carry actual upstream code that will conflict
on the next `git merge upstream/main` — daybreak#156 (`data-slots/values.ts`), daybreak#160
(`modules/registry.ts`), sunrise#462 (two `lib/orchestration/**` files). The ledger has a
delegate-when-it-lands action per row; what it does not have is a **single ordered procedure** for a
sync, which is the thing someone will want at the moment they least want to reconstruct it.

### P12 · The eleven items Rashmir owes

Listed in [[plan#Open items Rashmir owes]] with the shipped behaviour named against each, so she can
see what she is confirming or changing. None blocks building; each blocks sign-off. The two with teeth
are **item 7** (privacy/IP clauses — F10's aggregate rests on them) and **items 1 & 3** (the palette,
provisional across every chart).

### P13 · The follow-up email sequence — parked

Brief §2 asks for it. F8 t-4 shipped the seam only (a local emitter, because sunrise#465 shuts the
hook enum). Three feature plans each say "not us". **Correct for v1 and now written down as parked**,
which it previously was not.

### P14 · User-facing subject-access export — parked

F10 t-5 shipped the admin-side export. `ryw-admin.md` named a self-service SAR flow as out of scope —
"the Brief does not ask for one, and building a user-facing SAR flow is its own feature". Recorded
here so it is parked rather than merely absent.

### P16 · A provider key for CI, or a nightly smoke run

Two smokes cannot run in CI without a real model key: `smoke:reclaim` (streams a coach turn) and
`smoke:reclaim-calendar` (the LLM categorise, and therefore the **end-to-end** proof of I4). P3 gated
everything that could be gated without one; this is the remainder.

Three options, none obviously right, which is why it is a decision rather than a task:

1. **A repo secret + a nightly workflow.** Real coverage, real token spend on every run, and a secret
   in CI that a fork inherits the shape of.
2. **Keep them manual, with a release checklist.** Zero cost, and exactly the arrangement that let the
   calendar smoke rot for two features — unless the checklist is actually enforced at release.
3. **A recorded-response fake for the categorise step.** Gates the shape of the flow without a key,
   and proves less than the real thing: the whole point of that smoke is that a _real_ model response
   never reaches the database.

_Owner:_ — · _Status:_ ready ▲ · _Class:_ gate

### P15 · The parked epics

Unchanged from [[plan#Parked phases (future epics)]]: the V2 time-tracking module, cohort overlays,
payments and subscriptions, live calendar OAuth, the knowledge base, and the life wheel. Payments is
the one three separate feature plans point at — F9 built the quarterly _cadence_, which Brief §8 calls
"the shape of the future paid offer", but not the offer.

---

## What the audit did **not** find

Worth recording, because a backlog with no clean column reads as a project in trouble:

- **No half-built feature.** All ten shipped complete.
- **No cross-feature deferral dropped on the floor**, with one exception (P9). Every "F4 defers this to
  F6" was traced and discharged — the entitlement gate, the composite, abandonment tracking, the
  qualification read-out, erasure reach, bucket relabelling, the `runId` producer.
- **Zero `TODO` / `FIXME` / `HACK` markers in leaf-owned code.** The `TODO(F6/F8)` F4 planted for the
  entitlement gate is gone, as designed. Provisionality is documented in prose that names the open
  item instead, which is the better pattern and should stay.
- **[[coverage-audit]] is clean** — all 19 numbered gaps resolved, every ✗ reconciled.
- **Every upstream ask is filed.** Not one row sits unreported.

The one systemic near-miss is worth naming, since it is the reason P8's missing pre-flight record
matters: **`getSlotHistory` was built in F1 and had no consumer for nine features**, and in that gap a
plausible-looking read shipped a bug that silently emptied public share links. The lesson is in
[[planning-retro]] §B. Anything built early and consumed later is an open item until it is consumed.
