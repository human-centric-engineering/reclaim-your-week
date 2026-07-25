---
name: ryw-admin
feature: F10 · ryw-admin
epic: RYW v1
status: in flight
owner: John
depends_on: F7 · ryw-phases (shipped #39) · F8 · ryw-access (shipped #41)
spec: ../sources/Reclaim_Your_Week_Brief_for_John.md §1 (the success measures) · §2 (qualification, confidentiality, aggregate patterns) · §3 (feedback + quote consent) · §8 (cost of a free tier) · ../invariants.md (I5 sensitivity, I7 canonical slugs, I10 tier boundary, I11 content is loaded, I12 no interpretation) · plan.md reconciliation 3 + 7
parent: plan.md
opened: 2026-07-25
---

# ryw-admin — the operator surface, and the compliance floor

> Feature-level build plan for **F10 `ryw-admin`**: what **Rashmir** sees. Parent:
> [[plan#F10 · `ryw-admin` — admin + compliance|plan.md]]. Binding _how_: the **Brief**
> (§1 success measures, §2 qualification + confidentiality + aggregate, §3 feedback, §8 cost) and
> [[invariants]] — **I10** the tier boundary, **I11** content is loaded not authored, **I12** no
> interpretation, **I5** sensitivity. Sizing follows the parent: **task = one PR**.
>
> **Documents read whole while planning this** (per [[planning-retro]] §A — "a grep is not a read"):
> the Brief §1/§2/§3/§8, [[plan]], [[ryw-access]], [[ryw-current]], [[building-a-feature]],
> [[planning-retro]], [[invariants]], `prisma/schema/app-reclaim.prisma`,
> `lib/app/leaf-admin-nav.ts`, `app/admin/programme/access/page.tsx`,
> `app/api/v1/app/reclaim/invites/route.ts`, `lib/app/programme/config.ts`,
> `lib/app/programme/module.ts`, `lib/app/programme/runs/journey.ts`, `lib/app/programme/share.ts`,
> `lib/privacy/erase-user.ts`, `scripts/smoke/reclaim-erasure.ts`, `lib/framework/shared/access.ts`,
> `lib/framework/guidance/surface.ts`, `lib/framework/engagement/{stats,map-heat}.ts`,
> `lib/framework/modules/config/schema-descriptors.ts`, and the framework admin pages under
> `app/admin/framework/**`.

## Intent

F1–F8 built the thing a leader uses and the door they come through. **F10 is the other side of the
glass: what the coach can see, change, and prove.** Three jobs, in the Brief's own order of insistence:

- **See who is in there, and where they stopped.** Brief §2 asks that the setup form do "double duty
  as qualification" — which is only true if Rashmir can read the answers next to the name. Add
  abandonment (at which phase), tier, and the cost of a run, and the client list is the one screen
  that tells her whether to pick up the phone.
- **Report the two numbers she named.** Brief §1: "The success measure is not downloads; it is
  whether people come back, and whether they tell others about it unprompted." Nothing reports either
  today. A product that cannot measure itself on its owner's terms is being flown blind.
- **Keep the promises the earlier features made.** Individual data is confidential (§2), so the
  aggregate must be genuinely anonymised and must exclude anyone who did not consent. Content stays
  Rashmir's (I11), so she rewords a bucket without a deploy. And erasure has to actually reach the
  audit answers — which live in `framework_slot_value`, a table no smoke has ever proven empties.

**The thing this feature must not become.** Every screen here reports on people who came for a
reflective exercise and were told their data is confidential. I12 governs the charts on the
consumer side; its admin sibling is that **an aggregate is a count, not a diagnosis** — F10 shows
Rashmir where attention is going across her cohort, and never a machine-written verdict on a named
leader. The refusal copy discipline F8 t-2 applied to users applies to operator surfaces too: this
is a coach's working tool, not a scoreboard for judging clients.

Two stances govern the build, as they did for F8:

- **Consume the platform; do not extend it** (I10). This time the pull is much stronger than it was
  for F8, because Daybreak has already built most of the engine — see D1, which is the finding that
  reshapes the whole feature.
- **The leaf's job is the join, not the mechanism.** Framework progress + leaf access + leaf content,
  stitched into one Rashmir-shaped view. Almost nothing here needs a new mechanism.

## Reconciliation against the live repo

Verified 2026-07-25, against `main` at the F8 merge (#41). Eight findings; **D1 changes the size and
shape of three tasks**, and D2, D6 and D7 are each a real gap the parent plan did not know about.

### D1 — Daybreak already ships most of F10's engine. The plan was written as if it did not.

`plan.md`'s F10 entry reads as five build-it-yourself tasks. It is not: the framework tier landed a
full ops-views suite, and every piece of it is generic over any module and map — which is to say,
over ours.

| What F10 asks for                | What already exists                                                                                                                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "abandoned at which phase"       | `getMapHeat()` → `MapNodeHeat.dropOff` (entered-but-never-completed, **per node**), surfaced at `/admin/framework/maps/reclaim-audit/heat`                                                              |
| per-user progress                | the journey explorer — `/admin/framework/journeys` + `[journeyId]`, cross-user via the `isAdminSupport` override                                                                                        |
| "users who came back"            | `getModuleStats()` → `returningUsers`, surfaced at the module detail page                                                                                                                               |
| content editing without a deploy | `GET/PUT /api/v1/admin/framework/modules/[slug]/config` — descriptors derived from our Zod `configSchema`, **plus `ModuleVersion` snapshots, a change summary, and an admin audit entry on every save** |
| slot inspection                  | `/admin/framework/slots` + `[slug]`                                                                                                                                                                     |

**So F10 builds the join, not the engine.** The framework answers "how does anyone travel this map";
Rashmir needs "how is _Dana_ doing, what tier is she on, what did she say she was worried about, and
has she stalled" — one row per person, which no generic surface can assemble because tier, invite,
consent and qualification are all leaf facts.

**This does not make the framework surfaces redundant, and F10 should not hide them.** They are the
diagnostic layer under the leaf's summary view; the client list should **link into** the journey
explorer for a given user rather than reproduce it. Where the leaf needs the same number in its own
page, it calls `getMapHeat()` / `getModuleStats()` directly — they are exported from
`lib/framework/engagement`, and the leaf is entitled to consume the framework tier (that is the whole
point of the eslint exemption in [[daybreak-asks]]).

**Consequences for the task table:** t-1 shrinks (the progress engine is free), t-2 shrinks a lot but
does **not** vanish (D3), and t-4 changes character completely (D6).

### D2 — "cost per run" has no join. There is a conversation per run, but nothing records which.

`AiCostLog` (Sunrise core, `ai_cost_log`) carries `conversationId`, `agentId`,
`workflowExecutionId` — **no user id and no run id**. The module surface opens exactly one
conversation per `(user, agent, module)` and resumes it while `isActive`
(`lib/framework/guidance/surface.ts:69`), and F4 t-3's completion sets `isActive: false` (I15,
`runs/service.ts:130`). So in practice each run gets its own conversation — and **nothing writes that
relationship down**. Attributing cost by time-window overlap would work most of the time and be
quietly wrong exactly when it matters (a run left open for weeks, the Brief §8 tester who spent four
hours in one audit).

**Ruling: record the link.** Add `conversationId String?` to `ReclaimAuditRun`, set when the run's
first surface conversation is resolved, and read cost as
`SUM(ai_cost_log.totalCostUsd) WHERE conversationId = run.conversationId`. It is one nullable column
and one write, it makes the number defensible, and the alternative — a heuristic on timestamps —
fails the "build to the right shape, not the expedient one" rule in [[building-a-feature]] §2.2.

Two honesty constraints on the number, both of which belong in the UI text and not just here:

- **Runs that predate the column read `null`, not `0`.** A zero is a claim that a run was free.
- **It is a lower bound.** Embedding and any `runStructuredCompletion` outside the surface
  conversation (F5's calendar categorise passes the coach agent's provider) log against a different
  conversation or none. Label it "chat cost", not "cost".

### D3 — the framework's `returningUsers` is a different question from Rashmir's return rate.

`ModuleStats.returningUsers` counts **users with more than one `module.entered` event**. Re-entering
the surface is not completing a second audit — a leader who opens the module twice in one sitting
counts, and a leader who completed two audits without a fresh entry event may not. Brief §1's measure
is people who **come back and do it again**.

**Ruling: compute the leaf measure from `ReclaimAuditRun`.** `status = 'complete'` grouped by
`userId`, where a return is a second completed run. It is exact, it is two lines of SQL, and it is
the number Rashmir asked for. Show the framework's engagement figures beside it if useful, but never
relabel one as the other. (Same pattern as D1: consume the framework where it answers the question,
compute in the leaf where it does not.)

Referral conversion has no such ambiguity and no new data need: `ReclaimInvite.invitedByUserId IS NOT
NULL` gives invites sent by users, `redeemedByUserId` gives who accepted, and a join to a completed
`ReclaimAuditRun` gives conversion. F8 t-3 already built the attribution; t-2 reads it.

### D4 — cross-user reads need the explicit `isAdminSupport` override, and F10 is the leaf's first user of it.

`canRead()` (`lib/framework/shared/access.ts`) is default-deny: a viewer reads their own subject, or
holds `isAdminSupport: true` — an **explicit, narrow flag a support surface opts into**, deliberately
not a role check read off the session inside the framework. The only call sites today are the two
framework journey admin routes.

**Ruling: every F10 read of another person's journey or slot data constructs its viewer as
`{ userId: session.user.id, isAdminSupport: true }` inside a `withAdminAuth` route, and nowhere
else.** Never in a shared helper that a consumer route might also reach, and never defaulted. The
grep guard that keeps this honest goes in `leaf:checks` alongside the F4 write-path guard: no
`isAdminSupport` outside `app/api/v1/app/reclaim/admin/**`.

Note the asymmetry this creates and accept it: `getSlotHeads(userId)` / `getSlotHistory(userId)` take
a bare `userId` with **no viewer argument at all** — the framework's own comment says access scoping
"wraps this" and `userId` is the seam. So for slot reads the gate is entirely the leaf's route guard.
That is the platform's design, not an oversight, but it means an admin slot read has no second line
of defence. Keep those reads in one module (`lib/app/programme/admin/clients.ts`) so there is one
place to review.

### D5 — the qualification read-out is a sensitive-slot read, and I5 shapes what may be shown.

Brief §2's "double duty as qualification" resolves to the Phase 0 slots F6 already captures:
`reclaim_profile_role`, `reclaim_profile_org_type`, `reclaim_profile_direct_reports`,
`reclaim_setup_weekly_hours`, `reclaim_setup_priorities`, `reclaim_setup_in_transition`. All
`standard`.

But two of the most revealing are **`sensitive`**: `reclaim_setup_keeping_me_up` and
`reclaim_setup_why_now` ([[slot-spec]] §"setup"). They are `sensitive` precisely so the masking
policy treats them carefully, and F7 t-2 returns them **to the leader themselves**, verbatim.

**Ruling: the client list shows the `standard` qualification fields inline; the two `sensitive` prose
slots are not on the list at all.** They are legitimately readable by Rashmir — she is the coach, and
a client sharing their results with her is F7's own flow — but a sensitive disclosure should never be
something you scroll past in a table. Put them behind the per-client detail view, one deliberate
click, and label the section for what it is. Nothing here is `special_category` (I5 forbids it
outright); the distinction being drawn is between "readable" and "put on a list".

### D6 — content editing exists, and would render the nine buckets as a JSON textarea.

This is the finding that changes t-4 from "wire up the existing form" to a real task, and it is
exactly the D1-shaped trap in reverse: the framework surface exists, but it does not do the thing our
done-when claims.

The generic config form derives its fields from our Zod schema via `z.toJSONSchema()` and a
**deliberately bounded** walker (`lib/framework/modules/config/schema-descriptors.ts`): it renders
string / number / boolean / enum, and **falls back to a raw-`json` descriptor for anything richer —
nested objects, arrays, unions**. The walker's own header says so, and calls the fallback a rendering
hint rather than a failure.

Our content is arrays. `buckets: z.array(bucketConfigSchema)` and `hourBands: z.array(hourBandSchema)`
are the nine bucket titles/descriptions and the three hour bands — that is to say, **the entire body
of Rashmir's content is precisely the part that renders as a raw JSON blob.** "Rashmir rewords a
bucket description without a deploy" is not satisfied by handing her a JSON editor and hoping she
balances the braces.

**Ruling: t-4 builds a leaf-owned content editor** — nine labelled title/description pairs and three
band rows — that **POSTs through the framework's existing `PUT .../config` endpoint**. That is the
whole trick: the leaf owns the _form_, the framework keeps owning validation, `ModuleVersion`
snapshots, change summaries and the admin audit entry. No framework edit, no second write path, and
version history keeps working. A [[daybreak-asks]] row records the array-of-objects descriptor gap
with the leaf answer already in hand — the same "friction is a finding" shape as F8's three Sunrise
rows.

### D7 — editing content in production breaks the I11 guard's meaning, and nothing notices.

The I11 two-hop guard proves `sources/` → `content-source.md` → **config defaults in code**. Hop 2 is
a character-identity test against the `RECLAIM_BUCKETS` constants. The moment t-4 ships, the content
users actually see comes from **`Module.config` in the database**, which no guard covers. Rashmir
rewords a bucket in production — as she is entitled to, that is the feature — and from then on the
running product diverges from the read-only sources with nothing anywhere recording it. Both halves
are correct; the join is not. (This is the same shape as F8's opening finding, which is why it is
worth naming: [[planning-retro]] §B's lesson is that failures live in the join between a document and
the running app.)

**Ruling: t-4 shows the divergence rather than preventing it.** The editor renders each field with a
"matches the source document" / "edited — differs from the source" marker, computed by comparing the
stored value against the code default. It is not a lock: Rashmir's content is Rashmir's to change,
and I11 exists so that _we_ never paraphrase her, not so that _she_ cannot revise herself. What I11
does require is that nobody can quietly rewrite her words and have it look original — a visible
marker plus the framework's existing version history satisfies exactly that. Add a paragraph to
[[invariants]] I11 recording the distinction, because a future session reading only the invariant will
otherwise treat a legitimately edited config as a violation.

### D8 — two carried defects in the erasure and share paths, both cheap to fix here.

- **`smoke:reclaim-erasure` does not touch `framework_slot_value`.** It proves all eight
  `app_reclaim_*` cascades (F4 t-1 built it for exactly that) — but the audit **answers** live in
  slot values, and that table is the one whose `ON DELETE CASCADE` is also hand-written (the
  framework schema says so at `framework-data-slots.prisma:61`). So the largest store of personal
  data in the product has never been proven to erase. t-5's done-when in `plan.md` names this; it is
  a genuine gap, not a re-verification.
- **`createShare` is a check-then-create on tables with no unique constraint.**
  `lib/app/programme/share.ts:50,58` does `findFirst` → `create` on `ReclaimShare` and
  `ReclaimReportShare`. F7's gate round fixed the observed duplicate, but fixed it with a read, and
  [[planning-retro]] §B is unambiguous that this shape is always a race. It matters more now than it
  did then, because t-3's inbox **counts** those rows. Fold `@@unique([userId, auditRunId])` onto
  both tables into t-1's migration (which is already carrying D2's column) and switch the writes to
  `upsert`.

**And one thing to check rather than assume, in t-3:** `ReclaimFeedback` is `CASCADE`. F4 t-1's
schema comment explicitly deferred to F7 t-4 "whether an anonymised, quote-consented line is split to
a retained store", and F7 shipped without splitting it. So today an erased user's quote-consented
feedback is erased with them. That is defensible — arguably it is the privacy-respecting default —
but it is a decision nobody has actually made, and t-3 is the feature that reads that table.

## Invariants this feature touches

| Invariant                       | How F10 honours it                                                                                                                                                                 | Test                                                                                                                                     |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **I5** (no `special_category`)  | The qualification read-out shows `standard` slots inline; the two `sensitive` prose slugs sit behind the per-client detail view (D5). No new slots.                                | The existing `slot-sensitivity` invariant test still passes; a list-view test asserts neither sensitive slug appears in the list payload |
| **I7** (canonical slugs)        | The aggregate groups by canonical `bucketSlug`, never by a user's `ReclaimBucketLabel` display label                                                                               | Aggregate unit test: two users with different labels for `strategic` land in one group                                                   |
| **I10** (tier boundary)         | Every surface under `app/admin/programme/**` + `app/api/v1/app/reclaim/admin/**`; nav via `leaf-admin-nav.ts`; content saves POST through the framework's own config endpoint (D6) | `framework:boundary` green; the diff touches no `lib/framework/**` and no Sunrise file                                                   |
| **I11** (content is loaded)     | t-4 edits `Module.config`, never the code defaults or [[content-source]]; the editor marks each field as matching-source or edited (D7)                                            | Hop-2 character-identity test unchanged and still green; a new test asserts the divergence marker is true for an edited field            |
| **I12** (no interpretation)     | Admin views report counts, distributions and progress. No generated verdict on a named client, no LLM in the aggregate path                                                        | Grep guard: no `streamChat` / `runStructuredCompletion` under the admin module                                                           |
| **I14** (entitlement at create) | Untouched. F10 **reads** the grant ledger; the client flag it writes is the same admin flag F8 t-2 already reads                                                                   | Existing F8 gate tests unchanged                                                                                                         |
| **I3** (single write path)      | F10 writes no slot values at all. If a task finds itself needing one, that is a design error                                                                                       | The existing `write-path` guard in `leaf:checks`                                                                                         |

## Test strategy

vitest on `happy-dom`, **no live DB** ([[building-a-feature]] §1.2) — so the split is the usual one,
with one addition F10 makes unavoidable.

- **Aggregation logic is pure and tested as such.** Return rate, referral conversion, the anonymised
  bucket distribution, abandonment bucketing — each is a function from rows to a view model, tested
  directly with hand-built rows. Do not test them through a mocked Prisma chain; that tests the mock.
- **Route handlers mock `@/lib/db/client`** for the authorisation shape (admin required, the
  `isAdminSupport` viewer constructed, non-admin refused) rather than for the numbers.
- **Component tests** for the client list (one enriched payload renders every column; no per-row
  fetch — the repo rule and F10's most likely regression) and the content editor (nine bucket rows,
  the divergence markers, a save posting the whole config).
- **`smoke:reclaim-erasure` extended (t-5)** — the one place a real DB is not optional, because the
  claim is about `ON DELETE` behaviour that only Postgres can demonstrate. Seed slot values under the
  throwaway subject, erase, assert `framework_slot_value` is empty for that user and the receipt
  exists.
- **A new `smoke:reclaim-admin` is _not_ planned.** The admin surfaces are reads over data the other
  smokes already create; a smoke that only asserts "a query returned" is green-bar theatre.

## Promoted tasks

| id  | Intent                                                                                                                                      | Files likely to touch                                                                                                                                                                                                                                                                                                             | Deps | Status | PR  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------ | --- |
| t-1 | The client list: one enriched endpoint joining access + progress + qualification + cost, and the migration D2/D8 need                       | `prisma/schema/app-reclaim.prisma` + migration, `lib/app/leaf-db-drift.ts`, `lib/app/programme/admin/clients.ts`, `app/api/v1/app/reclaim/admin/clients/**`, `app/admin/programme/clients/**`, `components/app/admin/clients/**`, `lib/app/leaf-admin-nav.ts`, `app/api/v1/app/reclaim/runs/service.ts` (record `conversationId`) | —    | done   | #43 |
| t-2 | The two success measures — return rate and referral conversion — on a programme dashboard                                                   | `lib/app/programme/admin/measures.ts`, `app/api/v1/app/reclaim/admin/measures/route.ts`, `app/admin/programme/page.tsx`, `components/app/admin/measures/**`                                                                                                                                                                       | t-1  | done   | #43 |
| t-3 | Shared-results inbox + the anonymised cross-client aggregate                                                                                | `lib/app/programme/admin/inbox.ts`, `lib/app/programme/admin/aggregate.ts`, `app/api/v1/app/reclaim/admin/shared/**`, `app/admin/programme/shared/**`, `components/app/admin/shared/**`, `lib/app/programme/share.ts` (upsert)                                                                                                    | t-1  | done   | #43 |
| t-4 | Content editing: a leaf form over the nine buckets + three bands, saving through the framework config endpoint, with the divergence markers | `app/admin/programme/content/**`, `components/app/admin/content/**`, `lib/app/programme/admin/content-diff.ts`, `.context/app/invariants.md` (I11 note), `.context/app/daybreak-asks.md`                                                                                                                                          | —    | done   | #43 |
| t-5 | Data export + the GDPR erasure proof that actually covers the answers                                                                       | `scripts/smoke/reclaim-erasure.ts`, `lib/app/programme/admin/export.ts`, `app/api/v1/app/reclaim/admin/clients/[userId]/export/route.ts`, `.context/app/daybreak-asks.md`                                                                                                                                                         | t-1  | done   | #43 |

> **Sizing note.** t-1 is the heavy one and deliberately so: it carries the migration (D2's
> `conversationId`, D8's two unique constraints), the one enriched read every later task extends, and
> the `isAdminSupport` guard. t-4 has **no dependency on t-1** — different files entirely — so it can
> go second if t-1 runs long, and it is the task most likely to interest Rashmir first. **Watch:** if
> t-3's aggregate grows past a reviewable diff once the consent filter and the anonymity floor are in,
> split the **inbox** (reading `ReclaimReportShare` + rendering F7's summary) from the **aggregate**
> (the cross-client distribution) — they share a page and nothing else.

### t-1 — The client list

- **The migration** (D2/D8): `ReclaimAuditRun.conversationId String?` plus
  `@@unique([userId, auditRunId])` on `ReclaimShare` and `ReclaimReportShare`, with drift probes in
  `leaf-db-drift.ts`. The `conversationId` write goes where the surface conversation is first known
  — set it on the run when it is resolved, idempotently, never overwriting a set value.
- **One enriched endpoint** `GET /api/v1/app/reclaim/admin/clients` (admin-guarded) returning every
  column the table shows: name, email, tier, client flag, consent version + marketing opt-in, invite
  provenance (who referred them), run status, **which phase they stalled in**, chat cost, and the
  `standard` qualification fields. **No per-row fetches** (the repo rule, and the thing to check in
  review). Progress comes from the framework — `loadPhaseProgress` per run is the wrong shape here,
  so batch the node-state read the way `admin-queries.ts` does.
- **The per-client detail view** — the two `sensitive` prose slots (D5) behind one deliberate click,
  the run history, and a link out to `/admin/framework/journeys` for the full traversal rather than
  reproducing it (D1).
- **Abandonment is a definition, not a query.** "Abandoned" needs a rule — an `in_progress` run with
  no slot write for N days, N coach-editable in `Module.config`. Pick the rule explicitly and put it
  in the UI text, or the column means nothing.
- **The `isAdminSupport` grep guard** into `leaf:checks` (D4).
- **Nav**: extend `leaf-admin-nav.ts`'s existing section (F8 t-1 opened it) — Clients, then Access.
  `<FieldHelp>` on the non-obvious columns; "abandoned" and "chat cost" both need their definitions
  where the operator reads them.

_Done when:_ the list renders every client in one request with no per-row fetch; a stalled run shows
the phase it stalled in; cost reads `null` (not `0`) for a run with no recorded conversation; the two
sensitive slugs appear nowhere in the list payload, with a test; `framework:boundary` green and the
diff touches no Sunrise or framework file. _Gates:_ full loop (`/code-review` — a data model plus an
enriched list endpoint is exactly the shape it pays for; `/security-review` — this is the feature that
reads other people's data for the first time).

### t-2 — The success measures

- **Return rate** from `ReclaimAuditRun`, not from `ModuleStats.returningUsers` (D3): completed runs
  grouped by user; the measure is the share of leaders with a second completed audit. Show the
  denominator — a rate over eleven people is a rate over eleven people, and hiding that invites the
  wrong conclusion (I12's spirit applied to Rashmir's own dashboard).
- **Referral conversion** from `ReclaimInvite` (F8 t-3's attribution): referral-tier invites sent by
  users → accepted → first audit completed. Three numbers and two ratios.
- **A programme dashboard** at `/admin/programme` as the section's landing page, with both measures,
  the counts behind them, and links to the client list and the framework's own engagement views.
- **No trend over time yet.** Both measures need a year of data to trend and F9 owns the run-history
  reads; a sparkline over three weeks of a private beta is decoration.

_Done when:_ both measures compute from real rows with unit tests over hand-built fixtures, including
the empty case (nobody has completed anything) rendering as "not enough data" rather than 0%; the
denominators are on screen; the dashboard is the section landing page. _Gates:_ full loop.

### t-3 — Shared-results inbox + the anonymised aggregate

- **The inbox** reads `ReclaimReportShare` (F7 t-4 writes it when a leader ticks "share with
  Rashmir") and renders the same `buildSummary` artifact the leader saw — which F7 built
  **shareable-safe by construction** (it reads only §10 fields and never the sensitive-prose slugs,
  asserted in `summary.test.ts`). Reuse it; do not assemble a second summary shape.
- **The aggregate** — cross-client bucket distributions grouped by **canonical slug** (I7), plus the
  common priority gaps. Three hard rules, each of which needs to be a test rather than an intention:
  1. **Consent-filtered.** Only users with a `ReclaimConsent` row whose policy version permits
     aggregate use. Brief §2 is explicit that the terms "should allow for data to be used in
     aggregate" — F8 t-4 recorded the consent so this query could rely on it.
  2. **A minimum cohort size**, below which a cell renders as suppressed rather than as a number.
     With a private beta of a dozen leaders, "the average across nonprofit CEOs" is one person.
  3. **No free text.** Aggregate over numbers and canonical slugs only. Never pool
     `reclaim_setup_keeping_me_up` — that is the slot the whole sensitivity classification exists for.
- **Fold in D8's `upsert`** for `createShare`, now that t-1 has added the constraints.
- **Settle the `ReclaimFeedback` question** F4 deferred to F7 and F7 did not answer (D8): does a
  quote-consented line survive its author's erasure? Decide it, write it down, and make the schema
  say it. Defaulting silently is how a consent promise gets broken by omission.

_Done when:_ the inbox lists shared results and renders the leader's own summary artifact; the
aggregate excludes non-consenting users with a test; a cell below the cohort floor renders suppressed
with a test; two users with different bucket labels aggregate into one canonical group; the feedback
retention decision is recorded in the schema comment and the plan. _Gates:_ full loop
(`/security-review` — this is the anonymisation claim, and the one place a leak would break a promise
made in the product's own copy).

### t-4 — Content editing

- **A leaf form over the content arrays** (D6): nine bucket title/description pairs, three hour
  bands, the governing frame, the deep-work note, the footnote, the consultation email. It **PUTs to
  `/api/v1/admin/framework/modules/reclaim-audit/config`** — the framework validates against our own
  Zod schema, snapshots a `ModuleVersion`, records the change summary and writes the admin audit
  entry. The leaf adds the form and nothing else.
- **The divergence markers** (D7): each field shows whether the stored value still matches the code
  default (which the I11 hop-2 guard proves matches `content-source.md`, which
  `leaf:content-diff` proves matches `sources/`). One small pure module, easily tested.
- **A `changeSummary` is required, not optional**, on a content save. The framework accepts it
  optionally; content edits are the one case where "what changed and why" is worth the friction.
- **The I11 paragraph** in [[invariants]] recording that a coach-edited config is a legitimate
  divergence and how to tell it from a paraphrase — otherwise a future session reads a green guard and
  a differing production string and draws the wrong conclusion.
- **The [[daybreak-asks]] row**: the config descriptor walker's array-of-objects fallback, with the
  leaf answer (a leaf form posting to the framework endpoint) already recorded, so this is a
  friction-is-a-finding row rather than a blocker.

_Done when:_ a bucket description is edited in the admin UI and the change is visible to a user with
no deploy; the version history tab shows the change with its summary; the divergence marker flips
from matching-source to edited, with a test; the I11 hop-2 guard is still green (it tests defaults,
which t-4 does not touch); no framework or Sunrise file in the diff. _Gates:_ full loop
(`/code-review` — a form over Rashmir's IP, and the task where a plausible-looking rewrite would do
real damage).

### t-5 — Export + the erasure proof

- **Extend `smoke:reclaim-erasure` to `framework_slot_value`** (D8) — seed slot values for the
  throwaway subject through `saveAnswer` (I3, so the smoke exercises the real write path), erase,
  assert zero rows remain for that user and that the `DataErasureReceipt` exists. This is the
  headline: it is the first proof that the audit **answers** are erasable.
- **Per-client data export** (admin-guarded), a JSON artifact of one leader's runs, slot values,
  grants, consents and shares — the operator half of a subject-access request. Sunrise ships **no
  data-subject export at all** (checked: the only exports under `app/api/v1` are orchestration admin
  backups), so this is genuinely leaf work and worth a [[daybreak-asks]] row noting that any fork
  handling personal data hits the same wall.
- **A self-service export is out of scope here** and should be said out loud rather than left
  ambiguous: the Brief does not ask for one, and building a user-facing SAR flow is its own feature.
- **Check the erasure hook seam while here** — `lib/privacy/erasure-hooks.ts` exists and the leaf
  registers nothing. If anything the leaf owns needs an in-transaction scrub the cascades cannot
  reach, that is where it goes.

_Done when:_ `smoke:reclaim-erasure` proves no `framework_slot_value` rows survive erasure, against
real Postgres; the export returns one leader's complete record and is admin-guarded with a test; the
[[daybreak-asks]] row exists. _Gates:_ full loop (`/security-review` — an admin route that emits
somebody's entire personal record in one response).

## What the build changed about this plan

Recorded here rather than silently edited above, because a plan that quietly rewrites itself to match
the code stops being a check on the code.

- **D1 held.** The framework surfaces are generic over our map: `listJourneys(viewer, { graphSlug })`
  returns the leaf's journeys, and the client list reads phase position through it rather than
  reproducing the traversal. The ten-minute pre-check the plan asked for was worth doing and found
  nothing. No [[daybreak-asks]] row needed.
- **The priority-gap aggregate could not be built as specified, and was replaced rather than
  approximated.** t-3's plan said the aggregate would show "the common priority gaps" (§8). There is
  no machine-readable priority-per-bucket slot: the gap is captured as
  `reclaim_gap_unfunded_priorities`, which is **`sensitive` free text**, and rule 3 of the aggregate
  forbids pooling free text. Approximating it — inferring "priority" from something else and calling
  the result a priority gap — would have put a claim on Rashmir's dashboard that the data does not
  support (I12). The aggregate instead reports **which buckets are most often left at zero**, which is
  true, is derived from the hours it already reads, and is named for what it is.
- **`grantExpiresAt` was extracted rather than reimplemented.** The client list needs the date a
  client's access ends, and F8 t-2's calendar-month arithmetic was private to `entitlement.ts`.
  Recomputing "12 months" on the admin side is exactly the shape that produced the 12 × 30 bug, so
  the gate's own helper is now exported and the admin surface shows the date the gate enforces.
- **The `isAdminSupport` guard needed the source scan to ignore comments.** The first version failed
  on the routes that _explain_ why the override lives in one module. A guard that punishes documenting
  its own rule teaches people to stop documenting it, so the scan strips comments and checks code.
- **`ReclaimAuditRun.conversationId` is written at two points, not one.** On the first answer saved to
  an active run (conditional `updateMany` on a null, so concurrent saves cannot race) and again at
  completion, before I15 closes the conversation — after which "the run's conversation" is no longer
  identifiable. A leader who only ever talks to the coach and never fills a card gets their
  attribution at completion or not at all.
- **The `ReclaimFeedback` erasure question is settled: CASCADE stays** (D8's open item). A quote
  consent is given by a person, and someone who has exercised their right to erasure has withdrawn the
  standing it rested on; keeping the sentence de-attributed would leave the product able to publish
  the words of someone who asked to be forgotten. Recorded in the schema, where the next person to
  wonder will be.

## What the gates found

`/security-review` returned **no High or Medium findings** — every new endpoint admin-guarded, the
sensitive slots kept off the list in code, the aggregate's three privacy rules holding,
`applyContentEdits` unreachable from `openSignup` (including via `__proto__`), and
`linkRunConversation` unable to cross users. Its three sub-threshold notes were all worth fixing, and
two of them were places a comment claimed more than the code did.

`/code-review` earned its keep, again on the shape [[planning-retro]] predicts: derived numbers.

- **"Stalled" was computed from a timestamp that never moves.** `ReclaimAuditRun.updatedAt` looks
  like the column for "last touched" and is not: answers go to `framework_slot_value` and phase moves
  to `UserNodeState`, so nothing writes the run row between creation and completion. A leader working
  steadily for six weeks read as **Stalled, last active 1 June** — the most engaged person in the
  cohort flagged as the one to chase, on the screen whose entire job is telling Rashmir who to ring.
  Now derived from `max(SlotValue.capturedAt)`, one batched `groupBy`.
- **The aggregate's headline finding was an artefact of a question most people never saw.**
  Fundraising is a conditional bucket, shown only to leaders Phase 0 marks it relevant to. Every
  leader who was never asked counted as having "left it at zero", so it ranked first. An answered
  zero is a fact about a week; an unasked question is not.
- **The aggregate read slot heads per _user_, not per completed audit.** Heads are the live value
  across all runs, so a leader part-way through audit 2 contributed two fresh buckets spliced onto
  seven from audit 1 — and an old composite silently outranked today's self-reported hours, because
  "prefer composite" has no notion of recency. Leaders with an open run are now excluded until they
  finish.
- **The client list showed the newest grant, not the live one.** Grants stack (a client invite, then
  a referral unlock), so a paying client displayed as tier _Referral_ with no expiry — their
  twelve-month contract gone from the one screen that reports it. Now uses the gate's own
  `grantIsLive`.
- **The content editor did not contain the fields the UI sent the operator to it for.** The client
  list's help text said "you can change how long that is in Content" and the stall rule was not there,
  nor the anonymity floor, nor `consultationEmail` (which t-4's own plan text lists). All three added.
- **The content save was a read-modify-write over the whole config with the framework's concurrency
  guard declined.** Two tabs would clobber each other silently. Worse, a `safeParse` failure fell back
  to schema defaults and then _wrote_ them — so rewording a bucket could have reset `openSignup`.
  The write path now refuses on a parse failure and carries `expectedBaseVersion`.
- **The migration created unique indexes with no dedupe**, on the two tables whose justification is
  that a duplicate was once observed. It would abort on any environment still holding one, taking
  `conversationId` down with it.
- Plus: cost summed per run rather than per conversation (double-counting if a completion ever fails
  between marking the run complete and closing the conversation), and `getClientDetail` built the
  entire cohort — a `getSlotHeads` per leader in the programme — to render one person's page.

`framework:boundary` also caught framework vocabulary (`moduleId`) leaking into the `app/**` surface,
which moved the config read into `lib/app/programme/admin/content-config.ts` where `runs/journey.ts`
already lives for the same reason.

## Notes / deferrals

- **What F10 completes.** With F10 shipped, RYW v1 has both sides: the leader's audit (F1–F7), the
  door (F8), and the coach's operating surface (F10). **F9 `ryw-repeat` is the only feature left**,
  and it stays `available` ▲ — its trend lines need users with two audits, which is a calendar
  problem rather than a build one.
- **What F10 does not do:** payments (parked), the follow-up email sequence (F8 t-4 left the seam;
  no ESP in v1), a user-facing data export (above), trends over time on the success measures (F9's
  history reads), and any change to the entitlement gate (I14 — F10 reads the ledger, never widens it).
- **Two open items land here and neither blocks:** open item 7 (the privacy/IP clauses — t-3's
  consent filter reads whatever version is recorded, and the wording is Rashmir's) and open items 1 &
  3 (the colour questions — the aggregate charts reuse F6's provisional palette and inherit whatever
  she rules).
- **The one thing to re-verify before t-1** — D1's claim that the framework surfaces are generic over
  our map. They read `graphSlug` / `moduleSlug` and both are `reclaim-audit`, so this should hold, but
  the framework admin pages have never been pointed at a leaf's map. If `/admin/framework/maps/reclaim-audit/heat`
  does not render our seven phases, that is a [[daybreak-asks]] row and t-1 computes drop-off itself
  from node states — a contained fallback, but worth ten minutes before building on the assumption.
