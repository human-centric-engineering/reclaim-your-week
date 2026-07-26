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

| #   | Item                                                        | Owner   | Status                 | Class     | Blocks / waits on           |
| --- | ----------------------------------------------------------- | ------- | ---------------------- | --------- | --------------------------- |
| P1  | The asks ledger describes code that is not there            | John    | **shipped**            | integrity | —                           |
| P2  | `invariants.md` says its own tests are unwritten            | John    | **shipped**            | integrity | —                           |
| P3  | No reclaim smoke runs in any gate                           | John    | **shipped**            | gate      | 2 of 5 still manual (below) |
| P4  | The public surface is still the starter template            | —       | blocked → Rashmir      | launch    | open items 3, 4, 7          |
| P5  | The quarterly nudge has no scheduler                        | —       | ready ▲                | launch    | a deploy decision           |
| P6  | Doc drift: stale cross-references                           | —       | ready ▲                | integrity | —                           |
| P7  | F2 has no feature plan                                      | —       | ready ▲                | record    | —                           |
| P8  | `ryw-repeat.md` has no post-build record                    | —       | ready ▲                | record    | —                           |
| P9  | Operator-side trends over the success measures              | —       | ready ▲                | feature   | nobody owns it (see below)  |
| P10 | Is I4's non-persistence contractual or incidental?          | —       | ready ▲                | risk      | —                           |
| P11 | The upstream-sync playbook                                  | —       | ready ▲                | upstream  | 17 open asks                |
| P12 | The eight items Rashmir owes (was eleven)                   | Rashmir | waiting: Rashmir       | client    | sign-off, not build         |
| P13 | The follow-up email sequence                                | —       | parked                 | scope     | Brief §2; seam only in v1   |
| P14 | User-facing subject-access export                           | —       | parked                 | scope     | not asked for in the Brief  |
| P15 | The parked epics                                            | —       | parked                 | scope     | future epics                |
| P16 | A provider key for CI, or a nightly smoke run               | —       | ready ▲                | gate      | P3's remainder; a cost call |
| P18 | The audit is seven forms; it was meant to be a conversation | John    | **stages 0–2 shipped** | feature   | [[ryw-conversational]]      |

**Doing P1–P3 first was deliberate.** They are the three where the repository told a reader something
untrue, or where a claim the product makes to users was not gated by anything. Every other item was
honest about its own state; those three were not.

**Everything the team owns is now shipped.** P1–P3, P5–P11 and P4's build all landed across two
branches on 2026-07-26. What remains is the four items nobody here can close alone: **P12** (the
eight things Rashmir owes), **P16** (a cost decision about a provider key in CI), and the two parked
scope items — plus **P4's copy sign-off**, since the pages exist and the words in them are a draft
until she reads them.

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

### P4 · The public surface — **built; the words need Rashmir**

_Owner:_ John · _Status:_ **shipped** (copy sign-off outstanding) · _Class:_ launch

All four pages were stock Sunrise copy — the landing page asked "Is Sunrise really free?" and
`privacy/page.tsx` was documented in-file as a placeholder, which mattered because it is the page the
consent gate links leaders to and F10 t-3's aggregate rests its lawful basis on consent recorded
against it.

**Rebuilt around three constraints that rule out almost everything a template landing page does:**
I-frame (not a productivity exercise, so nothing sells time saved), I16 and Brief §2 (no pressure on
next steps _anywhere_, so no trial countdown, no social-proof wall, and no waiting-list form — which
is a next step under pressure by another name), and Brief §7 (calm, generous space, no stock photos,
no gradients — so the language is typographic).

The real decision was invite-only: the template's two "Get Started" buttons were the only routes to
`/signup` in the app (P1). The primary action is now **Sign in**, and everyone else is told where
invitations come from. That is not a gate — sunrise#463 is still open — but a page inviting you to
sign up for something you cannot use is worse than one that says how you get in.

Privacy and terms are written **against the implementation**: the in-memory calendar path, the model
provider, the two-step access to the sensitive prose, the aggregate's three constraints, and the
retention asymmetry where a consent record deliberately outlives the account. Both carry a visible
note that the wording is a draft.

**What is still owed:** Rashmir's sign-off on the copy, her real privacy and IP clauses (open item 7 —
after which bump `policyVersion`, which re-asks everyone), and logos (open item 3). Two assumptions
were made and are cheap to reverse — see _Assumptions taken_ at the foot of this file.

### P5 · The quarterly nudge — **`npm run nudges:tick`, still to be scheduled at deploy**

_Owner:_ John · _Status:_ **shipped** (needs wiring at deploy) · _Class:_ launch

F9 t-3's route was built for an external cron and never got one, so the mechanism has never fired.

Wiring it turned out to be a choice. The HTTP route is admin-guarded and Vercel Cron issues **GET**, so
using it would mean a mutating GET on a path that sends mail — a far worse trade than the one the
unsubscribe page makes (subtractive and idempotent; this is neither). Adding a `CRON_SECRET` beside
the platform's audited guard is what F9's own route comment declined.

So: **a command**, talking to the database the way the seeds and smokes do. No new auth surface, no
new public endpoint, runs on any host with a scheduler that can start a process. The HTTP route stays
for manual triggering and serverless hosts; both share `runNudgeTick`.

**Still to do at deploy:** actually schedule it. [[operations]] carries the cron line and the
alternatives.

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

### P9 · Operator-side trends — **shipped**

_Owner:_ John · _Status:_ **shipped** · _Class:_ feature

Deferred in a circle: each of F9 and F10 handed it to the other, both shipped, nobody owned it. The
measures were point-in-time only — the one shape that cannot answer what Brief §1 asks, because "do
people come back" is a direction and one number taken today cannot say whether it is moving.

Eight quarters: completions, how many were somebody's second or later, referrals sent. **Counts, not
rates** — a quarterly rate over eleven leaders moves several points when one person does one thing,
which looks like a trend and is not. A return is counted in the quarter the leader _came back_, which
depends on ordering each leader's completions in time, which Prisma does not guarantee; there is a
test with the rows deliberately arriving in the wrong order.

### P10 · I4's non-persistence — **answered: incidental**

_Owner:_ John · _Status:_ **shipped** · _Class:_ risk

F5 asked whether `runStructuredCompletion`'s non-persistence is a contract or merely current
behaviour, and to file upstream if the latter. Nobody recorded an answer for five features.

**It is incidental.** The function imports `calculateCost` and no database client, so nothing is
written — but its docstring commits only to being a "neutral LLM utility — no evaluation coupling, no
Next.js imports", which is about layering, not writes. Upstream prompt logging would be consistent
with everything that file says about itself and would break a **public** privacy claim without
touching a line of ours.

A canary in `calendar-privacy.test.ts` now fails on the next PR if that file acquires a route to the
database, plus an assertion that the calendar still routes through it so the canary keeps guarding the
only door. Filed as sunrise#472 for the guarantee to be made contractual where it belongs.

### P11 · The upstream-sync playbook — **shipped**

_Owner:_ John · _Status:_ **shipped** · _Class:_ upstream

**18 open asks: 8 Daybreak, 10 Sunrise. All filed.** [[upstream-sync]] is now the ordered procedure.

The fact that made it urgent rather than tidy: four rows mean we carry **modified copies of upstream
files** — edits inside core's tree, not workarounds beside it. Two fail _silently_ if resolved by
reflex, because taking upstream's version of the `globalThis` registry fixes before upstream has
actually fixed them leaves the coach answering while quietly losing its tools and its module context.
`smoke:reclaim` is the only thing that notices.

### P12 · The eight items Rashmir owes (was eleven)

Listed in [[plan#Open items Rashmir owes]] with the shipped behaviour named against each, so she can
see what she is confirming or changing. None blocks building; each blocks sign-off. The two with teeth
are **item 7** (privacy/IP clauses — F10's aggregate rests on them) and **items 1 & 3** (the palette,
provisional across every chart).

> **Three of the eleven were decided on 2026-07-26 without her**, on the owner's instruction: take
> the most defensible reading of her own documents, ship it, and reverse anything she disagrees with.
> Items **8** (the register), **10** (where the strategy mirror sits) and **11** (the Phase 2
> coaching signal) are now decided, dated, and carry a "what to ask her" line each. Two of the three
> needed a fix before they could be decided at all: item 10's config could not express the third
> option her own hedge names, and item 11's toggle would have shown a leader facilitator instruction
> voice. See the decisions log in [[plan#Decisions log]].

### P13 · The follow-up email sequence — parked

Brief §2 asks for it. F8 t-4 shipped the seam only (a local emitter, because sunrise#465 shuts the
hook enum). Three feature plans each say "not us". **Correct for v1 and now written down as parked**,
which it previously was not.

### P14 · User-facing subject-access export — parked

F10 t-5 shipped the admin-side export. `ryw-admin.md` named a self-service SAR flow as out of scope —
"the Brief does not ask for one, and building a user-facing SAR flow is its own feature". Recorded
here so it is parked rather than merely absent.

### P12–P15 · Unchanged

The items Rashmir owes, and the three parked scope items, are as described below. P12 is the
critical path to launch now that the build is not.

### P18 · The audit is seven forms; it was meant to be a conversation — **stages 0–2 shipped**

The one item on this board that is a feature rather than a loose end, and it is here because the
v1 close-out audit did not look for it: it checked that every feature was finished, and every feature
was. What it could not see is that the coach agent, authored in F2 and streaming since F3, is bound to
a surface no phase ever rendered — so the tool shipped as the seven forms it was explicitly not
supposed to be.

Planned in five stages and tracked in its own doc, [[ryw-conversational]]. Stage 0 shipped in #50
(the capture capability). Stages 1 and 2 shipped together (the run-scoped stream and the phase surface),
because stage 2 has nowhere to stand without stage 1. Stages 3 onward were never written down and are
deliberately not reconstructed; the open questions the built stages raised are listed in that doc.

### P16 · A provider key for CI, or a nightly smoke run

**One** smoke cannot run in CI without a real model key: `smoke:reclaim-calendar` (the LLM
categorise, and therefore the **end-to-end** proof of I4).

> **Corrected 2026-07-26.** This item said _two_, and named `smoke:reclaim` as the other. That was
> wrong — it stubs the LLM with a fake provider and needs no key, which its own file header states.
> It is now in CI. The remaining decision is smaller than it looked, and it is about one script.

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

## Decisions taken after the audit

### D-P17 · OpenAI during testing, Anthropic at launch

**Owner decision, 2026-07-26.** The AI layer runs on OpenAI while we are testing, and reverts to
Anthropic before launch.

This is filed as a decision rather than an assumption because it runs against something the client
stated twice, and a reader six weeks from now needs to see that it was chosen rather than drifted
into. Brief §3: _"Claude only. The AI behind this should be Claude (Anthropic API), not ChatGPT, and
users do not get a choice"_ — grounded in testers reporting a noticeably better coaching experience
with Claude. Brief §8 restates it as _"the one constraint that the AI layer is Anthropic/Claude"_.

**Why it is fine for testing:** the constraint is about what leaders experience, and no leader is on
the system yet. Access is invite-gated and the invite list is unissued (plan open item 6).

**Three things it touches, and only one of them is code:**

| Surface                  | State                                                                                                                                                                                          |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The coach agent          | Nothing to change. It seeds with `provider: ''` and resolves dynamically, so the layer follows whichever provider is configured — which is also why a swap leaves **no diff** to notice later. |
| The privacy notice       | `MODEL_VENDOR` in `app/(public)/privacy/page.tsx`, now `'OpenAI'`. It is a factual claim about where personal data goes; naming the wrong processor is worse than naming none.                 |
| `smoke:reclaim-calendar` | The one smoke needing a real key ([[post-v1#P16]]). An OpenAI key works for it, but the seeded agent must resolve to an OpenAI model — it is not a drop-in.                                    |

**Reverting is one line plus an environment change**, and it is on the before-launch list in
[[../operations|operations]]. The risk worth naming: because the swap leaves no code diff, the thing
most likely to go wrong is that nobody remembers it happened. That is what this section, the constant,
and the launch checklist are all for.

**Not decided here:** whether the coaching quality difference Rashmir's testers reported shows up in
our own testing. If it does, that is evidence for the constraint rather than against it, and worth
telling her.

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

---

## Assumptions taken

Choices made without asking, because the work was worth more than the wait. **Each is cheap to
reverse**, and each is here so reversing it is a decision rather than an archaeology exercise.

| #   | Assumption                                                                                                                                                                                                                                         | Where it lives                                   | Reversing it                                                                                     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| A1  | **The nine area _names_ may appear publicly**, the diagnostic prose may not. The names make the landing page substantive; the descriptions are the IP (I11) and stay inside the audit.                                                             | `app/(public)/page.tsx`                          | Delete the `Areas` component. The page still reads.                                              |
| A2  | **The public pages do not offer signup.** v1 is invite-only, so the primary action is Sign in and there is no waiting-list form (I16 — a waiting list is a next step under pressure).                                                              | landing + about                                  | Add a CTA when open signup arrives; `Module.config.openSignup` is the switch that makes it true. |
| A3  | **Governing law is England and Wales.** Inferred, then corroborated: the entity in the source copyright line is **Nsansa Ltd**, a UK company form. Still stated by nobody.                                                                         | `app/(public)/terms/page.tsx`                    | One line.                                                                                        |
| A4  | **Privacy and terms are drafts written against the implementation**, carrying a visible note saying so, rather than leaving a page that says "Placeholder". Accuracy about the system is not the same as legal sufficiency.                        | privacy + terms                                  | Replace the prose; bump `policyVersion`, which re-asks everyone.                                 |
| A5  | ~~The model provider is named as Anthropic.~~ **Superseded 2026-07-26 by an owner decision: OpenAI for the testing phase.** Recorded as D-P17 below, because it is a decision against a stated client constraint rather than an assumption I took. | `app/(public)/privacy/page.tsx` (`MODEL_VENDOR`) | One line, and it is on the before-launch list.                                                   |
| A6  | **The nudge cadence is 90 days, with a 200-day upper bound.** Brief §2 says "quarterly"; the upper bound is ours, so a dormant leader is not told their audit was "about three months ago" eighteen months later. Both are coach-editable config.  | `Module.config`                                  | Change the numbers; no deploy.                                                                   |
| A7  | **The trend timeline reports counts, not rates.** At this cohort size a quarterly rate is noise wearing three significant figures.                                                                                                                 | `admin/measures.ts`                              | Compute rates in `buildTimeline`; the data supports either.                                      |
| A8  | **`smoke:reclaim-calendar` stays manual** rather than adding a provider key to CI. That is P16, a cost and secret decision. (`smoke:reclaim` was in this row until it turned out to need no key; it now runs in CI.)                               | CI                                               | P16.                                                                                             |
