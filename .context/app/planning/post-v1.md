---
name: post-v1
description: The board for everything left after RYW v1 shipped — hygiene, client-owed items, launch tasks, upstream, the parked epics, and the F12–F18 epic the 2026-07-29 execution-path audit opened. Mirrors plan.md's style one epic later.
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

**There are now two boards in this file, and the split is deliberate.** The **P-board** below is the
original: loose ends, each smaller than a feature. [**The next epic**](#the-next-epic--f12-to-f18) is
a features board in `plan.md`'s shape, opened by the 2026-07-29 execution-path audit, because what
that audit found was seven features rather than seven loose ends and pretending otherwise would have
put twenty-odd P-rows on a board designed for commits. Items cross-reference freely: P21 is F12 t-2,
P24 waits on F16, P16's decision now covers a script F14 adds.

**Legend.** `shipped` — merged to `main`. `in flight` — someone is on it. `ready` ▲ — nothing blocks
it. `blocked → X` — waiting on X. `waiting: <who>` — outside our control. `parked` — deliberately not
now.

**The rule that governs the whole board:** an item stays here until it is either merged or explicitly
parked with a reason. Nothing leaves by being forgotten. Since 2026-07-29 that rule has a gate behind
it rather than only a paragraph — `leaf:board-check` (F12 t-3), after four occasions on which this
file described itself inaccurately.

---

## Board

| #   | Item                                                        | Owner   | Status           | Class     | Blocks / waits on           |
| --- | ----------------------------------------------------------- | ------- | ---------------- | --------- | --------------------------- |
| P1  | The asks ledger describes code that is not there            | John    | **shipped**      | integrity | —                           |
| P2  | `invariants.md` says its own tests are unwritten            | John    | **shipped**      | integrity | —                           |
| P3  | No reclaim smoke runs in any gate                           | John    | **shipped**      | gate      | 1 of 7 needs a key (P16)    |
| P4  | The public surface is still the starter template            | John    | **shipped**      | launch    | copy sign-off: Rashmir      |
| P5  | The quarterly nudge has no scheduler                        | John    | **shipped**      | launch    | needs wiring at deploy      |
| P6  | Doc drift: stale cross-references                           | John    | **shipped**      | integrity | —                           |
| P7  | F2 has no feature plan                                      | John    | **shipped**      | record    | —                           |
| P8  | `ryw-repeat.md` has no post-build record                    | John    | **shipped**      | record    | —                           |
| P9  | Operator-side trends over the success measures              | John    | **shipped**      | feature   | —                           |
| P10 | Is I4's non-persistence contractual or incidental?          | John    | **shipped**      | risk      | —                           |
| P11 | The upstream-sync playbook                                  | John    | **shipped**      | upstream  | 18 asks + 6 defects open    |
| P12 | The eight items Rashmir owes (was eleven)                   | Rashmir | waiting: Rashmir | client    | sign-off, not build         |
| P13 | The follow-up email sequence                                | —       | parked           | scope     | Brief §2; seam only in v1   |
| P14 | User-facing subject-access export                           | —       | parked           | scope     | not asked for in the Brief  |
| P15 | The parked epics                                            | —       | parked           | scope     | future epics                |
| P16 | A provider key for CI, or a nightly smoke run               | —       | ready ▲          | gate      | P3's remainder; a cost call |
| P18 | The audit is seven forms; it was meant to be a conversation | John    | **shipped**      | feature   | [[ryw-conversational]]      |
| P19 | The conversation shipped laid out as a document             | John    | **shipped**      | feature   | [[ryw-chat-ux]]             |
| P20 | A finished audit left the product the moment it finished    | John    | **shipped**      | feature   | —                           |
| P21 | Two key-less smokes never joined the gate                   | John    | ready ▲          | gate      | P3's rule, re-broken        |
| P22 | The captured panel read as one grey column, guesses and all | John    | **shipped**      | feature   | P19's surface               |
| P23 | The coach asked closed questions into an empty box          | John    | **shipped**      | record    | shipped in #59, unrecorded  |
| P24 | An audit nobody came back to is nobody's to notice          | Rashmir | waiting: Rashmir | client    | ask after F16 ships         |

**Doing P1–P3 first was deliberate.** They are the three where the repository told a reader something
untrue, or where a claim the product makes to users was not gated by anything. Every other item was
honest about its own state; those three were not.

**Everything the team owns is now shipped, bar one gate item.** P1–P3, P5–P11 and P4's build landed
across two branches on 2026-07-26; **P18** landed on 2026-07-27, and **P19** — the surface half of the
same epic, opened the same day the first real leader used it — merged on 2026-07-27 (#56), with its
frame and phase-review halves following in #57 (2026-07-28) and #58 (2026-07-29). **P20** joined on
2026-07-28, from the same source as P19: someone asked where their finished audits were, and the
answer was that there was nowhere for them to be; it merged in #58. **P21** is new and is ours —
reconciling this board on 2026-07-29 found P3's rule quietly re-broken. **P22** and **P23** both
merged in #59 on 2026-07-29, and both came from the same place P19 and P20 did: someone used the
surface and said what was wrong with it.

What remains is the items nobody here can close alone — **P12** (the eight things Rashmir owes),
**P16** (a cost decision about a provider key in CI), **P24** (a question only she can answer), and
the three parked scope items, plus **P4's copy sign-off** — and **P21**, which is a two-line gate fix
and is the first task of the epic below.

**The board did not stop at P22, and this is where it stops being a board of loose ends.** An
execution-path audit on 2026-07-29 walked the whole app and read the live database. It found no
half-built feature, again. What it found instead was that **nobody has ever completed an audit** —
three runs exist, the deepest reached `phase-2-energy`, and two were marked `abandoned` by hand in
psql because the product has no way to do it. Phases 3 to 6, the summary, the share, the history, the
trends, the quarterly nudge and the entire admin back half have never executed against a real person.
The findings are seven features rather than seven loose ends, so they are an **epic** and they sit in
their own section below, in `plan.md`'s shape rather than this file's.

> **The table above said otherwise until 2026-07-27**, listing P5 to P11 as `ready ▲` a day after each
> one had shipped and its own section said so. Nothing was lost by it, but this is the file a reader
> opens to find out what is left, and for a day it named seven items that were done. Worth recording
> rather than quietly correcting: a board is only load-bearing while the summary line and the rows
> agree, and the rows are the part people scan. Same family as P1 and P2 — the repository describing
> itself inaccurately — one file along.
>
> **And it happened again, the same way, on 2026-07-29.** P19 and P20 sat at `in flight` for two days
> and one day after merging (#56/#57/#58); P3's row still read `2 of 5 still manual` when the count had
> been corrected to one in P16's own section three days earlier, and the true denominator had since
> gone to seven. Twice is a pattern, not a slip, and the cause is structural: **both rows were written
> by the branch that was doing the work, and nothing flips them when that branch merges.** The board is
> the one file here with no gate behind it — `leaf:checks` proves content and invariants, and neither
> can see a status column. Until something closes that loop, the honest instruction is the one at the
> top of P1: reconcile this board as the first act of any new branch, not the last act of the old one.
>
> **And a third and fourth time, on 2026-07-29, found by the audit rather than by anyone reconciling.**
> P22 sat at `in flight` after merging in #59, exactly as P19 and P20 had. Worse, the `offer_choices`
> work shipped in the _same commit_ and had no row at all — the first item to reach `main` having never
> appeared on this board in any state. The paragraph above diagnosed the cause correctly and then did
> not prevent it, which is worth saying plainly: **an instruction written in the file that the
> instruction is about is not a control.** Twice was a pattern; four times is a missing gate. The
> repair is not another sentence here. It is `leaf:board-check` (**F12 t-3**): a script that fails
> when a `ryw-*.md` frontmatter says `status: shipped` while its board row does not, and when a
> feature doc exists with no row at all. That is the smallest thing that can see a status column, and
> it belongs in `leaf:checks` beside the other two. It cannot catch P23's shape — work that never got
> a doc either — so t-3 also asserts that every `ryw-*.md` on disk has a row, which is the half that
> would have caught it.

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

**Only `smoke:reclaim-calendar` remains manual**, because it alone makes a real model call and CI
holds no provider key. `smoke:reclaim` was assumed to need one and does not — it stubs the LLM with a
fake provider — so it joined CI on 2026-07-26; see the correction in P16. That leaves one real hole,
and it is the one that already bit us, so what covers it now is worth stating precisely:

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

> **The count above is as of 2026-07-26, and the set has grown since.** There are now **seven** leaf
> smokes, not five: `smoke:reclaim-coach` arrived with the conversational stages and
> `smoke:reclaim-join` with F11. Neither needs a provider key and neither runs in CI, which means
> P3's _done when_ — every smoke that can run without a key runs on every PR — stopped being true
> without anybody changing P3. That is **P21**, not a re-opening of this item: what shipped here
> shipped, and the rule it established is what broke.

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

### P7 · F2 has no feature plan — **shipped**

_Owner:_ John · _Status:_ **shipped** · _Class:_ record

F2 `ryw-module` is the only feature with no `ryw-*.md` — and it is the one that loaded 105 slots and
all of Rashmir's verbatim IP, i.e. the feature the plan itself called the highest risk for silent
drift. There is a record in `plan.md` and in the I11 guards, but not the reconciliation-and-decisions
record every other feature has.

**Done** — [`ryw-module.md`](./ryw-module.md) now carries the reconciliation-and-decisions record, in
the shape every other feature's plan has. It had no status line here for a day after it landed, which
is how it stayed on the board as outstanding; see the note under the table.

### P8 · `ryw-repeat.md` has no post-build record — **shipped**

_Owner:_ John · _Status:_ **shipped** · _Class:_ record

`ryw-admin.md` carries "What the build changed about this plan" and "What the gates found";
`ryw-repeat.md` stops at its deferrals. So F9's D1–D7 reconciliations are never marked resolved in
their own file, and **the plan's explicit pre-flight check — re-verify that `provenance.runId` is
populated on every historical slot version — has no recorded outcome.** The nine gate findings are in
`plan.md`'s work log but not in the feature's own plan.

**Done** — [`ryw-repeat.md`](./ryw-repeat.md) now carries both "What the build changed about this
plan" and "What the gates found", including the outcome of the `provenance.runId` pre-flight check.

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

### P18 · The audit is seven forms; it was meant to be a conversation — **shipped**

The one item on this board that is a feature rather than a loose end, and it is here because the
v1 close-out audit did not look for it: it checked that every feature was finished, and every feature
was. What it could not see is that the coach agent, authored in F2 and streaming since F3, is bound to
a surface no phase ever rendered — so the tool shipped as the seven forms it was explicitly not
supposed to be.

Tracked in its own doc, [[ryw-conversational]]. Stage 0 shipped in #50 (the capture capability).
Stages 1 and 2 shipped together in #51 (the run-scoped stream and the phase surface), because stage 2
has nowhere to stand without stage 1.

**Stages 3 to 9 are now specified** (2026-07-27). They were planned from the six open questions the
built stages raised, read back against the source documents, rather than reconstructed from the lost
conversation — which is why there are seven of them and not the three the original five-stage sketch
implied. They deliver the conversation's own shape: a phase that opens itself, a chart that lands
before it is interpreted, a calendar branch anyone can reach, and a close that asks before it tells.

That planning pass also found **three defects**, all recorded in [[ryw-conversational]] and each fixed
in a named stage: I6's "enforced twice" write allowlist is enforced once (and its invariant test
asserts against a local mirror, so the guard passes while enforcing nothing); `/programme/calendar` is
linked from nowhere in the app, so F5 has been unreachable since it merged; and the `reclaim_calendar`
slot group refuses six leader self-reports on a rule written for its computed lanes.

**All stages shipped 2026-07-27.** The audit now opens itself, paces its two big reveals as beats,
offers the calendar branch that had been unreachable since F5, and closes by asking before it tells.
`smoke:reclaim-coach` proves the server contract and needs no provider key, so it gates in CI beside
the other three.

The **eval fixture named in the plan was not built**, deliberately: it would need a real key, so it
could only be a second manual gate, and what it measures is model behaviour — better measured against
a real conversation than against fixtures written by whoever wrote the prompt. That leaves **P16**
below exactly where it was, with one more argument for the nightly-workflow option.

### P19 · The conversation shipped laid out as a document

P18 made the audit a conversation and proved it: the coach opens the phase, records what it hears,
paces the two big reveals. The first session anyone actually ran through it found that the **surface**
had not come with it. The composer moved further down the page with every turn, so talking to the
coach meant scrolling past what you had already said; a turn that called a tool looked like nothing
happening; the reply arrived in provider-sized lumps; and the reflection — the question the whole
method rests on — was still a textarea bolted underneath the conversation.

**The layout could not have worked.** The chat had a `flex-1 overflow-y-auto` transcript with no
bounded ancestor anywhere above it, so the scroll region never scrolled and its autoscroll had been a
no-op since it was written. The layout in the way is Sunrise-owned, which is why the fix is a leaf
route group (`app/(programme)/`) rather than an edit: same URLs, same edge gate, same surface theme,
and a frame that owns the viewport.

**One invariant was deliberately reversed**, and it is the reason this is a feature and not a tidy:
I6 refused the coach the reflection slots, on the reasoning that a coach able to write one can open
its own phase gate. Owner decision to permit it — the point of the coach is to help a leader
articulate themselves, and a textarea under the transcript is the opposite of that. I9 is untouched;
what replaced the refusal is three narrower guards (this phase only, never inferred, always visible
and editable). Full reasoning in [[ryw-chat-ux]] and in [[invariants]] I6.

**Shipped across three PRs, not one.** #56 (2026-07-27) made the conversation look like a
conversation; #57 (2026-07-28) gave phase 1 its pause, its picture and its way back; #58 (2026-07-29)
landed the `app/(programme)/` route group described above, so every page a leader can reach is finally
in the same frame. The split was not planned — each merge put the surface in front of someone, and
each time the next thing wrong with it only became visible once the previous one was fixed.

_Owner:_ John · _Status:_ **shipped** · _Class:_ feature

### P20 · A finished audit left the product the moment it finished

`GET /runs/current` filters on `in_progress`, which is right for the question it answers and was the
only question anyone asked. The consequence was that completion **removed** the audit: the phases,
the transcript, the readings and the summary were all still in the database and still owned by the
leader, and nothing in the product could reach any of it. What survived was the tokenised share link,
and only for the people who chose to make one.

That is a poor bargain in a tool whose whole proposition is that the record belongs to the person who
made it, and it undercuts the repeat audit the product is built around: Brief §1 names coming back as
the success measure, and the second audit opened with no way to look at the first. `TrendLines` was
the only backward-looking surface, it needs **two** completed audits before it draws anything, and it
links to nothing.

**Three things landed, and the read-only rule is the load-bearing one.**

- `GET /runs` and `GET /runs/:runId`, both session-scoped, the second ownership-checked by
  `loadOwnedRun`. Neither filters on status, which is the whole point.
- `/programme/history`, and `/programme/history/[runId]` for one audit: its summary, with any phase
  of the conversation behind it. The open audit is handed to `/programme` rather than rendered here,
  because that is the surface that can continue it.
- **A finished audit cannot be edited, and the screen is the least of the three things that say so.**
  `saveRunAnswer` refuses a run that is not in progress, `loadCoachTurnTarget` refuses a coach turn on
  one, and the journey engine refuses to complete a node that is not active. All three predate this
  work. What was added is `readOnly` on `PhaseReview` and `CapturedPanel`, so the screen stops
  _offering_ a correction the server would reject: an affordance that can only fail is worse than
  none, and it would tell a leader that figures they have already acted on are still provisional.

No new plan document: this is one PR against an existing surface, which is the bar [[post-v1]] sets
for plan-first.

**Shipped in #58** (2026-07-29), alongside P19's frame and the capture split — the same PR, because
`/programme/history` had nowhere coherent to render until the route group existed.

_Owner:_ John · _Status:_ **shipped** · _Class:_ feature

### P21 · Two key-less smokes never joined the gate

Found while reconciling this board on 2026-07-29, by counting the smokes rather than trusting the
count written here. **P3 established a rule and shipped it; the rule then broke quietly**, because
adding a smoke and wiring a smoke into CI are two separate acts and only the first is anybody's habit.

| Leaf smoke               | Needs a key? | In CI's `smoke` job |
| ------------------------ | ------------ | ------------------- |
| `smoke:reclaim`          | no           | ✅ yes              |
| `smoke:reclaim-run`      | no           | ✅ yes              |
| `smoke:reclaim-erasure`  | no           | ✅ yes              |
| `smoke:reclaim-access`   | no           | ✅ yes              |
| `smoke:reclaim-coach`    | no           | ❌ **no**           |
| `smoke:reclaim-join`     | no           | ❌ **no**           |
| `smoke:reclaim-calendar` | **yes**      | ❌ no — P16         |

Both gaps guard concurrency against a real engine, which is exactly what unit tests with a mocked
Prisma cannot reach: `reclaim-coach` covers the moment ledger's conditional `updateMany` (two tabs on
the same beat) and `reclaim-join` covers the seat check in a WHERE clause under a burst of concurrent
claims (two people taking the last seat). A mocked test asserts the _shape_ of those statements and
proves nothing about whether Postgres serialises them.

**One of them also carries a false claim in its own header.** `scripts/smoke/reclaim-coach.ts` says
"it is in `leaf:checks`". It is not — `leaf:checks` is `leaf:content-diff && leaf:invariants`. Fix
the comment in the same change that makes it true.

_Done when:_ both run in CI's `smoke` job beside the other four, and `reclaim-coach.ts`'s header
describes where it actually runs.

**Claimed as F12 t-2**, so it is built rather than carried. It is first in the epic for the reason it
is on this board at all: it is the rule from P3 that broke quietly, and five features are about to
land on top of it.

_Owner:_ John · _Status:_ ready ▲ · _Class:_ gate

### P22 · The captured panel read as one grey column, guesses and all

Raised on 2026-07-29 by the owner, from a screenshot of phase 0. P19 built the panel and P18 gave it
its reason to exist; what neither did was make it **legible at a glance**, and three separate things
were wrong with it.

**Filled and unfilled looked the same.** Every reading was a label and a value in the same weights,
and an unanswered one was the same line with the value missing and the label a shade dimmer. Nothing
separated one reading from the next. The panel's whole job is to answer "how much of this is left",
and it was answering it in a sentence at the top while the list underneath said nothing.

**The guesses were unannounced.** A reading the coach _inferred_ carried a left rule and the sentence
"Taken from what you said. Have we got it right?" — which reads as a politeness, not as an admission.
A leader looking at a figure has no way to tell whether they gave it or the coach worked it out, and
those are different facts about their own audit. The panel's stated reason for existing (see the file
header, and P18) is exactly this, and it was the thing it said least clearly.

**There were two answers to a guess, and the useful third was missing.** Confirm and correct both
_end_ the question. A leader who cannot tell whether "20 hours of oversight" is right has nothing to
type into a box — what they want is to be asked about it properly, which is the one thing this
surface can do that the seven forms could not.

_What landed:_

- **Rows, with hairlines and a rail.** One row per reading, separated; a two-pixel rail whose colour
  carries the state (teal settled, cream being checked, hairline not yet asked), and a soft band
  behind the ones being checked. Plus a segmented track in the header — one segment per reading, in
  the order they are asked — so the shape of the phase is readable before a word is.
- **`Inferred` and `Unsure`, as two words.** Inferred means the coach was never told this and read it
  between the lines; unsure means it _was_ told and did not trust its own hearing. Both are shown on
  a finished audit too — which was guessed is a fact about the audit, not an invitation to change it.
- **"Talk it over."** Hands the reading back to the conversation as an ordinary leader turn, in
  the transcript, visible. It is the only one of the three moves that is not a write: nothing is
  settled on the leader's behalf on the way past. `CoachChat` grew one imperative method for it
  (`CoachChatControls.ask`) rather than lifting the stream out of the component that owns it.
- **A drawer that pulls out.** Correcting a reading in a 20rem column meant a text field and three
  choices wrapping onto five lines. Touching the panel widens it to 30rem and it slides back when
  attention returns to the conversation. It is positioned **over** the transcript rather than beside
  it, so the conversation's measure never changes — losing your place mid-sentence because you
  clicked a side panel is a worse bug than the one being fixed.
- **And a drawer the leader can size themselves.** The edge is a real drag handle: `cursor-col-resize`,
  a hairline that thickens and takes the brand teal under the cursor, arrow keys for anyone not using
  a mouse. **A drag sets what _open_ means, and does not touch the closing.** Clicking back into the
  conversation returns the drawer to 20rem however far it was pulled out — the transcript comes back
  in full at the click that returns the leader to it — and the next touch on the panel opens it at
  the width they chose rather than at ours. Double-clicking the grip forgets it.

  > The first cut had the drag switch the automatic sizing off entirely, on the reasoning that a
  > width the leader chose is an instruction and the product should stop arguing with it. Owner's
  > call, and the right one: that leaves a half-screen panel sitting over the conversation until
  > somebody remembers to put it back, which makes tidying your own screen a chore rather than a
  > side-effect of getting on with the audit. Keeping the width and dropping the pin gets both.

  The drag is floored so the conversation keeps 420px whatever happens: a panel that can bury the
  thing it is a panel about is a trap, not a preference. It is also floored at 20rem, so "open"
  cannot end up narrower than "closed".

No schema change, no server change, no new invariant. The narrow-screen drawer is now always mounted
so it can slide rather than appear, and `inert` while closed — which its tests assert, because
"cannot be tabbed into" is the fact that matters and a transition class is not.

**Shipped in #59** (2026-07-29), in the same commit as P23.

_Owner:_ John · _Status:_ **shipped** · _Class:_ feature

### P23 · The coach asked closed questions into an empty box

Some of what the audit asks has a fixed set of answers, and the form panels have always shown them
while the conversation put the same question above a blank text box. The coach now names the reading
its question is about by calling `offer_choices`, and the composer gives way to the answers.

**The mechanism is the interesting part, and it is the same lesson as the capture sweep.** On a live
audit the coach called `offer_choices` once, then asked the same question three more times with no
tool call at all, each time telling the leader "you can choose from the options on your screen" while
they looked at an empty box. Having called it once, the model believed the answers were still up. No
amount of prose fixes that: **a side effect asked of a model is a hit rate, and this product does not
build on hit rates.** So the offer stopped depending on the call. Which reading the turn is about is
decided server-side before the turn runs, and the stream injects the offer before `done` when the
model did not make it itself. The coach's own call still wins where it happens, because the model
knows when it has followed the leader somewhere else and the fallback does not.

The fallback runs **the real capability, in the real dispatch scope**, so what reaches the client is
what the model's own call would have produced and every guard has been applied. What differs is only
who decided to ask.

**It is on this board only because it was not.** It merged in #59 having never had a row, which is
the failure recorded in the note above the fold and the reason F12 t-3 exists. There is no
`ryw-*.md` for it either; this section is the record.

_Owner:_ John · _Status:_ **shipped** · _Class:_ record

### P24 · An audit nobody came back to is nobody's to notice

Two of the three audits ever started were abandoned mid-flight, and nothing in the product noticed.
Rashmir's clients screen shows them as `stalled`; the leader hears nothing.

**This is a question for Rashmir, not a defect to fix, and the distinction is the whole item.**
`nudges/select.ts` refuses to nudge anyone mid-audit, deliberately, with Brief §2 and I16 written
into the file header: _"a leader with an audit open does not need reminding to start one; they need
to be left alone to finish it."_ An email saying "you left an audit open" is precisely what that rule
forbids. Building it would be overturning a stated client constraint on the strength of a cohort of
three.

**What to ask her, and when.** After F16 ships, because F16 is the in-product answer: `/programme`
already resumes exactly where a leader stopped, and abandon finally gives them a way to close one
they do not want. The question then becomes the narrow one — _given they can always come back and can
now let go, is a single gentle message still wanted?_ — rather than the broad one. If yes, the
narrowest honest shape is one message per audit, never a sequence, opt-out in one click, and worded
as an invitation rather than a reminder.

**What not to do meanwhile:** do not treat the admin's `stalled` badge as a licence to build the
email. F18 t-2 gives her a way to write to that person herself, which is a human deciding rather than
a scheduler deciding, and is the version I16 is comfortable with.

_Owner:_ Rashmir · _Status:_ waiting: Rashmir · _Class:_ client

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

> **The denominator moves to two when F14 lands, and it is worth deciding once rather than twice.**
> The analyst is a second real model call, and the thing no key-less test can reach is the same thing
> in both cases: `parseAnalystReading`'s refusals are unit-tested against stubs, which proves the
> parser rejects what it should and proves **nothing about whether a real model, given the real
> brief, ever returns something it accepts**. An analyst that is refused on every live call would
> pass the entire suite and produce a summary with two empty sections for ever. So F14 adds
> `smoke:reclaim-analyst`, manual and key-needing, for exactly the reason `smoke:reclaim-calendar`
> is. Two scripts, one decision, unchanged options.
>
> Note what does **not** join them: `smoke:reclaim-report` renders the PDF from a hand-written
> reading and never calls the analyst, so it needs no key and gates in CI from the day it lands. That
> split is deliberate — the expensive proof and the cheap one should not share a script.

_Owner:_ — · _Status:_ ready ▲ · _Class:_ gate

### P15 · The parked epics

Unchanged from [[plan#Parked phases (future epics)]]: the V2 time-tracking module, cohort overlays,
payments and subscriptions, live calendar OAuth, the knowledge base, and the life wheel. Payments is
the one three separate feature plans point at — F9 built the quarterly _cadence_, which Brief §8 calls
"the shape of the future paid offer", but not the offer.

---

## The next epic — F12 to F18

**Where these came from.** An execution-path audit on 2026-07-29 traced the app end to end and read
the live database, then the owner asked four questions of it. Both halves are recorded here because
the answers changed the shape of the work.

**What the audit found is one sentence repeated seven times: the reasoning is ahead of the wiring.**
Almost every gap is a mechanism that exists, is documented, and has no trigger.
`RUN_STATUS.abandoned` is declared in `runs/service.ts` and written nowhere in the repository — the
two abandoned rows in the dev database were set by hand in psql, which is the finding. The coach's
calendar briefing exists and no moment fires it. `reflectionSlugForPhase` permits the phase-6
reflection and the screen still asks it with a textarea. `reclaim_action_options` is captured by the
coach and read by nothing. None of these is a half-built feature, which is why the v1 close-out audit
did not see them: each one is finished, and unreachable.

**And the fact that frames all of it: nobody has ever completed an audit.** Three runs, deepest
`phase-2-energy`, none complete. Phases 3 to 6, the summary, the share, the history, the trends, the
nudge and the whole admin back half have never run against a real person.

**The owner's four questions, and what research settled.**

| Asked                                                                | Answer                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Is a **summary agent** specified anywhere?                           | **No** — the sources assume one conversational model. But §10 asks the summary to carry _"The key gaps identified"_ and _"The phased pathway forward"_, and `buildSummary` is deterministic and produces neither. So the instinct is right and the gap is **spec-mandated, not new scope**.   |
| A downloadable **PDF**, emailed to the leader                        | Nothing PDF-related exists; `window.print()` is the whole of "downloadable". `~/code/conquest` is on identical `next@16.2.10` / `react@19.2.7` and already draws react-pdf bar charts the shape of `ReclaimChart`. Mirror it rather than invent it.                                           |
| Is there a **calendar analysis** agent feeding the prompt?           | **Half.** `categorise.ts` is a real LLM extraction step. But `phase-context.ts` touches calendar at four lines, and `buildChartData` picks composite _or_ estimate and never both — so the coach **structurally cannot** name the perception-versus-reality gap `Prompt_Text.md:233` demands. |
| Should the leader **consent** before Rashmir reads the conversation? | Yes — and there is a back door to close first. `buildClientExport` hands over `conversationId`, and core ships a conversation viewer, so an admin can read any transcript today.                                                                                                              |

**Decisions taken 2026-07-29** (owner): `@react-pdf/renderer` on the ConQuest pattern · a
**deterministic** calendar reading rather than a second model call, because `ideal-week.ts` already
established that the arithmetic happens in code and the model is given the result · a **login-gated**
report link, no new bearer token · `transcriptConsent` as a **column** on the existing
`ReclaimReportShare`, which is what avoids the five-place join a new leaf table requires.

### Board

| #   | Feature                  | Owner | Status        | Depends on | Tasks | What it closes                                                              |
| --- | ------------------------ | ----- | ------------- | ---------- | ----- | --------------------------------------------------------------------------- |
| F12 | `ryw-hygiene`            | John  | in flight     | —          | 3     | P21, P23's cause; a board that can fail CI                                  |
| F13 | `ryw-calendar-reading`   | John  | ready ▲       | F12        | 3     | The calendar reaches the coach framed; the unframed head-dump leak closes   |
| F14 | `ryw-analyst`            | John  | ready ▲       | F13 t-1    | 3     | §10's two missing bullets, as options and never as verdicts                 |
| F15 | `ryw-report`             | John  | blocked → F14 | F14 t-3    | 3     | The PDF, and the one email a finished audit should send                     |
| F16 | `ryw-audit-lifecycle`    | John  | ready ▲       | F12        | 3     | The abandon dead end, an unrecoverable failed turn, phase 6's last textarea |
| F17 | `ryw-transcript-consent` | John  | ready ▲       | F12        | 2     | Consent before Rashmir reads a conversation, and the export's back door     |
| F18 | `ryw-admin-care`         | John  | blocked → F16 | F16 t-1    | 2     | Rashmir can preview her own words, and act on a leader who stopped          |

**Two hard orderings, both of which cost a rewrite if ignored.** F13 t-1 before F14 t-2, or the
analyst re-implements I-composite's arithmetic — the thing I-composite's own note warns against. F14
t-3 before F15 t-1, or the PDF is laid out against a seven-field `AuditSummary` and re-laid out
against a ten-field one.

**One trap worth naming above the feature docs**, because it is the sharpest thing in the epic:
`AuditSummary` is served with **no session** behind a public share token, and `summary.test.ts`
asserts it is safe. The moment model prose joins that object, that promise depends on a model. F14's
brief is therefore its own module whose slug list is asserted disjoint from every `sensitive` slot
definition, and that assertion ships in the same pull request as the field it guards, not the one
after.

**What is deliberately not in the epic.** A stalled-audit email — see **P24**; that is Rashmir's
decision and F16 changes the question. And a new email _kind_: `EmailPropsMap` is closed and
core-owned (sunrise#468), so F15 uses the direct-`sendEmail` workaround `quarterly-nudge` already
established. F15's completion email is also **not P13** — P13 parks a follow-up _sequence_, and one
transactional message about the artifact a leader has just made is not a sequence. Recorded here so
the next reader does not read it as P13 unparked without a decision.

**And the thing worth more than any of it.** After F16 ships, take one leader through a complete,
supervised, end-to-end audit. Half of this product has never executed, and no amount of building
substitutes for finding that out.

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

> **And the second audit, on 2026-07-29, found that the near-miss was the whole pattern.** Everything
> above stayed true — still no half-built feature, still no `TODO` markers, still every ask filed —
> and the execution-path audit still opened seven features. The reason the first audit could not see
> them is that **it asked whether every feature was finished, and never asked whether a leader could
> reach it.** `RUN_STATUS.abandoned` is finished. The coach's calendar briefing is finished. The
> phase-6 reflection permission is finished. Each is unreachable, and "unreachable" is invisible to
> every question the close-out audit asked.
>
> P18 recorded the first instance of this and read it as a one-off — the coach bound to a surface no
> phase rendered. It was not a one-off. The generalisation, which belongs in [[planning-retro]]: **a
> completeness audit measures the code against the plan, and both can agree while the product is
> unreachable. The only audit that catches this walks the app as a user.** The dev database is part of
> that walk — three runs, none complete, two abandoned by hand, is a fact no amount of reading the
> source would have produced.

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
