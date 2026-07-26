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

- **The feature with the highest stated drift risk was the one built without a written plan, and
  nobody noticed for ten features (F2, found by the v1 close-out audit).** `plan.md` called F2
  `ryw-module` "the highest risk for silent drift, because paraphrase looks like success" — and it is
  the only one of the ten with no `ryw-*.md`. Nothing went wrong: the I11 two-hop guard, the voice
  test and the slot-sensitivity test all landed with the content they guard and have held ever since.
  But the absence was found by an audit rather than by anyone reaching for the document, which is the
  uncomfortable part — **a missing record does not announce itself, because the only person who needs
  it is the next person, and they do not know it should exist.** The check is mechanical and belongs
  at close-out: every shipped feature has a `detail:` link on the board, or a reason it does not.

- **A read that has no consumer has no evidence it works — and the first consumer is where the bug
  surfaces, one feature at a time (F9, the whole shape of it).** `getSlotHistory` was built in F1 t-2
  specifically so a repeat audit could read run 1 beside run 2, and then sat **unused for nine
  features** because nothing repeated a run yet. In that gap, `readRunAnswers` did the natural thing
  with the tools that _were_ being used — filter `getSlotHeads` by `provenance.runId` — which is
  correct for exactly as long as every leader has one run, and silently empties the first audit the
  moment they have two. It took F9's planning read to notice, and the damage would have landed on
  F7's public share link. **Two lessons, and the second is the general one.** (1) When a plan defers a
  capability to a later feature, the seam built for it is untested inference until that feature
  arrives; treat "built early, consumed later" as a standing item to re-verify at consumption, not as
  done. (2) More broadly: **when a feature introduces the _second_ of something the system has only
  ever had one of** — run, tenant, workspace, version — re-read every query that scopes to it. The
  bug is never in the new instance; it is in the old code's assumption that there was only ever one.

- **Check what the tier below already built before sizing a feature — and then check whether it does
  the thing your done-when actually claims (F10, both caught at planning).** Two halves of one
  lesson, and they pull in opposite directions. First half: `plan.md` sized F10 as five build-it-
  yourself tasks, and Daybreak had already shipped the engine for most of it — per-node drop-off
  (`getMapHeat`), a journey explorer, module engagement stats, and a generic module-config form with
  version history and an audit trail. Three of the five tasks shrank. Second half, and the one that
  matters more: the generic config form **would render Rashmir's nine bucket descriptions as a raw
  JSON textarea**, because its Zod→descriptor walker is deliberately bounded to flat primitives and
  falls back to raw JSON for arrays — which is exactly what our content is. "Content editing exists"
  and "Rashmir can reword a bucket without a deploy" are not the same sentence. **The check: for each
  task, name the existing surface that covers it, then open that surface and trace your own data
  through it.** A capability that exists generically may still not reach your specific shape — and the
  failure mode is asymmetric, because "already built" quietly deletes a task from the plan while
  "built but not for us" only shows up when someone tries to use it.

- **A read that filters the right field on the wrong set is invisible until a second instance exists
  (F9, found at planning).** `readRunAnswers(userId, runId)` reads `getSlotHeads` — which is
  `WHERE supersededAt IS NULL` — and then filters by `provenance.runId`. Correct-looking, correctly
  named, and correct for exactly as long as every user has one run: the head of every slug _is_ that
  run's value. The moment a leader starts a second audit, the first run's values are superseded and
  the function silently returns less and less of them, hollowing out `buildSummary` and with it the
  **public share link F7 invites leaders to send to colleagues** — a link that degrades because its
  owner started a new audit, with nobody told. Nothing about the code reads as wrong, no test failed,
  and `getSlotHistory` — built in F1 t-2 for precisely this — has sat unused since #17 because F9 is
  its only consumer. **The check: when a feature introduces the _second_ of something the system has
  only ever had one of (run, tenant, workspace, version), re-read every query that scopes to it and
  ask what the first one now looks like.** The bug is never in the new instance; it is in the old
  code's assumption that there was only ever one. Third §B entry in a row where the defect lived in a
  join — here between a filter and the set it filters.

- **A derived column is only as true as the column it derives from — go and check what actually
  writes it (F10 t-1, found by `/code-review`).** "Stalled" was computed from
  `ReclaimAuditRun.updatedAt`, which is the obvious column, is a real `@updatedAt`, and is **never
  written while a leader works**: answers go to `framework_slot_value` and phase moves to
  `UserNodeState`, so the run row is touched at creation and completion and at no point between. A
  leader answering steadily for six weeks read as "Stalled, last active 1 June" — the most engaged
  person in the cohort flagged as the one to chase, on the screen whose whole purpose is telling the
  coach who to ring. Nothing about the code looked wrong, and a test written against the same
  assumption passed (it hand-set `updatedAt` on a fixture, pinning the implementation rather than the
  definition). **The check: for any derived figure, name the write that moves its input and find that
  write in the codebase.** If you cannot point at the line, the figure is a guess. Sibling lesson to
  the two below — the failure is again in a join, this time between a column's name and its actual
  write path.

- **An aggregate over an optional question counts the people who were never asked (F10 t-3, found by
  `/code-review`).** The cross-client view reported which time buckets leaders most often left empty,
  and ranked fundraising first — because fundraising is a _conditional_ bucket, shown only to leaders
  whose setup marks it relevant, and every leader who never saw it scored a zero. The headline finding
  on the page was an artefact of the question not being asked. The code already had the right instinct
  one line away (it refuses to count zeroes for a leader who answered nothing at all, so unfinished
  audits cannot fabricate them) and simply did not extend it to conditional fields. **Lesson: in any
  aggregate, "absent" has at least three meanings — answered zero, not yet answered, and never asked —
  and only the first is data.** Where a field is conditional, the aggregate needs to know it.

- **When a leaf keys access on a user-editable field, the platform's edit rules become part of the
  leaf's threat model (F8 t-2, found by `/security-review`).** Invite redemption resolved a pending
  invite by matching `user.email`, which reads as obviously correct: the invite was sent to that
  address. It is not, because Sunrise's `PATCH /api/v1/users/me` lets any account rewrite its email
  with **no re-verification and without clearing `emailVerified`** — so a standard-tier account could
  rename itself onto a pending client invite and take twelve months of unlimited audits, locking the
  intended recipient out. Nothing in the leaf's own diff looks wrong; the vulnerability lives entirely
  in the join between "we trust this column" and "core lets it be rewritten". **The check:** for any
  field a leaf uses as an identity or authorisation key, go and read who can write it and under what
  verification — do not assume a column that _arrived_ verified _stays_ verified. The leaf fix was two
  extra conditions (no unconsumed invitation token may remain for the address, and the account must
  not predate the invitation); the root cause is [sunrise#466](https://github.com/human-centric-engineering/sunrise/issues/466),
  and it affects any fork keying access on email. This is the third §B entry in a row where the
  failure was a **join**, not a component — see the two below.

- **"12 months" is a calendar quantity, not 12 × 30 days (F8 t-2, found by `/code-review`).** The
  client window was implemented in days, which closed a paying client's access five days early — a
  small number that lands on the one tier with money attached, and that no unit test written against
  the same assumption would ever catch. Generalises past dates: **when a coach-editable config value
  is expressed in a human unit (months, weeks, quarters), implement it in that unit and pin it with a
  test that crosses a boundary the approximation gets wrong** (here, a window opened on the 31st).

- **A gate the plan describes is not a gate the app has — check the running behaviour, not the
  intent (found while planning F8, built in F6).** Every document says Reclaim Your Week is
  invite-gated, and the entitlement gate (I14) genuinely exists and is genuinely enforced at run
  creation. It is still open: Sunrise's self-signup is enabled (`emailAndPassword`, a live `/signup`
  page, no `disableSignUp`), and F6's `assertEntitled` **bootstraps a free grant for any account with
  no grant** — a deliberate, documented "least-risky path until F8", which reads in the plan as
  scaffolding and reads in production as a self-serve free tier. Neither half is a defect; the join
  is. **The check that would have caught it is behavioural, not textual:** for any feature that
  claims to restrict something, write down the actual path an unauthorised actor takes today and
  where it stops. §A's "failures live in the joins between documents" has a sibling — failures live
  in the join between a document and the running app.

- **The tier boundary invalidates plan text written before the boundary was exercised (F8 t-1,
  caught at planning).** `plan.md` told F8 to "**extend** `lib/utils/invitation-token.ts` +
  `emails/invitation.tsx` + `app/admin/users/invite/page.tsx` (don't rebuild)" — sound instinct,
  wrong verb: all three are **Sunrise-owned**, so extending them is exactly the merge conflict I10
  exists to prevent. The resolution is a third verb the original framing did not have: **consume**.
  Import the Sunrise token helpers from leaf-owned routes, register an email override through
  `lib/app/emails.ts`, put the admin UI under `app/admin/programme/**` via `leaf-admin-nav.ts`.
  **Lesson: when a feature's plan says "extend `<core file>`", resolve the ownership tier before
  sizing the task** — "extend" and "wrap" differ by a whole task's worth of surface, and the boundary
  check (`framework:boundary`) only catches the framework tier, not Sunrise's `lib/`.

- **When two independent reviewers flag the same thing, it's real — and a check-then-write on an
  un-constrained table is always a race (F6 `ryw-current`).** `/security-review` and `/code-review`,
  run separately, _both_ landed on the entitlement bootstrap: `findMany` → "no grant?" → `create`,
  with no unique constraint and no transaction, lets two concurrent first-run requests each mint a free
  grant (two free audits). Convergent findings from independent lenses are the strongest signal a gate
  gives — treat them as confirmed, not "probably." **The fix generalises: any "read, decide, insert"
  on a table without the right unique index is a TOCTOU; the cheapest idempotent fix is often a
  deterministic primary key** (here `free_<userId>`, so the second insert collides on the PK — no
  migration, no new constraint). Watch for this shape in F8's grant/referral writes.

- **A brand palette cannot pass strict categorical-colour validation at nine series — carry identity on
  the labels, not the hue (F6 t-3, `<ReclaimChart>`).** The dataviz validator failed every
  teal-and-cream nine-colour set on adjacent-pair separation, because nine distinguishable hues is past
  the safe categorical limit _and_ "sympathetic to one brand" pulls them together. The resolution was
  not a rainbow: it was to make the bars **directly labelled** (name + hours on each), which is the
  sanctioned secondary encoding, so colour becomes decorative grouping and the strict 9-way separation
  stops being load-bearing. **Lesson for any RYW chart: if the categories are fixed and labelled, don't
  burn the plan chasing a validator green that the design doesn't need** — and keep the palette an
  overridable leaf constant, since the real nine-colour choice is Rashmir's IP (open items 1 & 3).

- **The gate suite earns its keep on parsing + data-model code — budget a real fix pass, not a rubber
  stamp (F5 `ryw-calendar`).** F5 type-checked, lint-passed, and had 31 green unit tests _before_
  `/code-review` — and the review still found two genuine correctness bugs the tests missed: an
  open-ended RRULE anchored to a years-old DTSTART silently dropped its _current_ occurrences (the exact
  data a time audit needs), and a sparse per-bucket write left stale values on re-upload. Both were
  invisible to type-check and to tests written against the happy path. **The lesson: for a feature whose
  core is parsing external data or computing a persisted aggregate (F5's `.ics`, F6's charts, F7's
  refer-back), plan for a code-review fix round as part of the task, not an afterthought — and prefer
  "write the whole set" over "write the delta" for any multi-key persistence, so a re-run can't leave a
  stale key.** The "friction is a finding" stance (§A) extends to your own diff.

- **A merged PR is not a landed task — check the base branch, not the merge status (F4 t-4).** F4's
  four tasks each merged as their own PR, but t-4 (#30) was opened against the **t-3 feature branch**
  rather than `main`. GitHub happily showed it `MERGED`, yet `main` — which had already forked at the
  t-3 merge (#29) — never received the consumer shell. It surfaced only at close-out, when the board
  said "F4 shipped" but a fresh `main` checkout had no `/programme` UI. **The lesson: when a feature's
  tasks stack (t-4 built on the t-3 branch while t-3's own PR was still open), the last task's PR base
  silently defaults to the branch it was cut from, not `main`.** Close-out must verify each task's
  commits are actually on `main` (`git branch --contains`, or that the files exist in a clean
  checkout), not trust `gh pr list … MERGED`. Recovery was cheap here (re-target the branch to `main`
  via a fresh PR, #32) precisely because the plan-first discipline caught it before F5 branched off the
  hole.

- **`/code-review` paid for itself on the one UI-over-backend task, exactly as the seed expectation
  predicted (F4 t-4).** The shell, schema, lifecycle, and security all came back clean; the real
  findings clustered in the one place doing bespoke I/O — the consumer SSE client hand-rolled its own
  event schema, which had **drifted from the shared canonical union** and silently dropped two events
  the server actually sends (`content_reset`, `budget_exceeded_per_turn`), plus never aborted the
  stream on unmount. Two takeaways for later features: **(1) when the framework/core already ships a
  shared parser+schema for a wire protocol, consume it — a leaf re-implementation will drift, and the
  drift is invisible to type-check** (this is a live risk for F6/F7's richer chat surfaces and any
  future SSE consumer). **(2) Being a real consumer finds core defects the reference client masks** —
  the shared `chatStreamEventSchema` itself omits `budget_exceeded_per_turn`, so even the admin
  `ChatInterface` drops it; logged in [[daybreak-asks]]. The "friction is a finding" stance (§A / seed
  expectations) extends to core, not just Daybreak.

- _(Open candidates the build is likely to surface: whether the `<ReclaimChart>` family in F6 is
  honestly one task or three; whether the refer-back context contributor in F7 needs a seam the
  framework doesn't expose; and — surfacing now — whether F5's `.ics` parse + LLM-categorise + review
  UI is really one feature or wants the parser split from the upload/review path.)_

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
  "creating IP"). Trust it for that hop. ~~**The second hop is still unbuilt**~~ — **resolved: F2 t-3
  built it** (`tests/unit/app/programme/content.test.ts` asserts the `Module.config` defaults are
  character-identical to the extract), so both hops now run in `leaf:checks` on every PR. **And F10
  t-4 surfaced a third hop nobody had thought of:** once Rashmir edits content in the admin UI, what
  users read lives in `Module.config` **in the database**, where neither guard reaches. Answered by a
  new paragraph in [[invariants]] I11 plus a per-field "matches the source / edited" marker, so a
  legitimate revision is visible and a paraphrase cannot pass as original. The lesson generalises: a
  chain-of-custody guard is only as long as the last place the content can change.
- **`/code-review` pays for itself on data-model and UI-over-backend tasks.** The framework build found
  this repeatedly (its retro §B). F4's schema + cascades and F6's charts are where to expect real
  findings.
- **This build is also Daybreak's acceptance test.** Being the first real consumer is a stated goal,
  so friction is a finding, not an annoyance: anywhere the framework makes the leaf work harder than
  it should, that is a §A lesson and probably a [[daybreak-asks]] row. F1 is already one — the leaf
  could not write run-scoped answers at all without changing a framework file.
