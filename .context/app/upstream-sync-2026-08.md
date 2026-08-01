---
name: Reclaim Your Week — the 2026-08 Sunrise release
description: Every Sunrise ask this app filed is now closed upstream. What shipped, where it differs from what we asked for, and what will break when it reaches us through Daybreak.
parent: upstream-sync.md
---

# The 2026-08 Sunrise release — adoption plan and risks

> **Status on 2026-08-01: nothing has been merged, and nothing can be yet.** All
> fourteen Sunrise-tier rows in [[daybreak-asks]] are closed upstream. None of
> the code is reachable from here. This document is the readiness assessment, to
> be worked through with [[upstream-sync]] on the sync that finally lands it, and
> deleted once it has.

## 1. The ordering blocker

Sunrise `main` has closed roughly forty issues since `0.7.0` (2026-07-09),
including **every one this app filed** — #461, #462, #463, #464, #465, #466,
#467, #468, #469, #472, #473, #474, #475, #476.

Daybreak has not taken any of it:

```
git fetch upstream
git merge-base HEAD upstream/main        # c9e9fa26 — 2026-07-21
git rev-list --count HEAD..upstream/main # 0
```

`upstream/main` is unmoved. `git merge upstream/main` is a no-op today.

**We do not fix this by adding a `sunrise` remote.** [`CLAUDE.md`](../../CLAUDE.md)
is explicit — "Sunrise reaches you _through_ Daybreak; you do not merge Sunrise
directly" — and the reason is mechanical rather than ceremonial. Merging Sunrise
here would put the leaf **ahead of the framework tier on core files that Daybreak
also has to merge**. Every subsequent `git merge upstream/main` would then be a
three-way conflict between our Sunrise, Daybreak's Sunrise, and our own edits, on
exactly the files [[upstream-sync]] already lists as the dangerous ones. That is
the failure the three-tier model exists to prevent, and it is not worth trading
for a few days.

**The unblocking action is on Daybreak, not here:** Daybreak merges Sunrise
`main`, resolves its own tier, and pushes. Then this app runs [[upstream-sync]]
normally and works through §3 and §4 below.

## 2. What closed, and what we do about it

Ranked by the work adopting it costs us, not by the size of the upstream change.
The **Delegate** column is the ledger row's action, corrected where what shipped
differs from what the row assumed.

| Ask                                   | What shipped                                                                                                      | Delegate                                                                               | Risk       |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------- |
| **#467** subject access               | `exportUserData()`, `SUBJECT_DATA_SOURCES`, seam `collectAppSubjectData()`, two endpoints, **a coverage guard**   | Move our tables to the seam — **but see §C1**, the guard breaks first                  | **High**   |
| **#463** `SIGNUP_MODE`                | `invite_only` closes the route, `userCreateBeforeHook` (default-deny) and `/signup`; `runInvitedSignup()` exempts | Set it — **after** wrapping the preview fabricator (§C3)                               | **High**   |
| **#464** user-creation seam           | `lib/app/user-created.ts`, `registerUserCreatedHook()`, after-creation, throws swallowed                          | **Recommend not adopting** as our row described (§C4)                                  | **Medium** |
| **#474** agent-opened turn            | `ChatRequest.openingTurn` — no user row persisted, content reaches the model as a **system** message              | Adopt, then re-test all seven phase openings live (§C5)                                | **Medium** |
| **#475** message metadata             | `ChatRequest.messageMetadata`, stored under `MessageMetadata.app`                                                 | Adopt — but the filter must keep the sentinel path for historical rows (§C6)           | **Medium** |
| **#466** email change                 | Cleared `emailVerified` + re-verification; then **#489** added old-address approval, password, session revocation | **Keep** our two compensating conditions; update the comment (§C7)                     | **Medium** |
| **#469** recurring-job seam           | `lib/app/jobs.ts`, `registerAppJob({ name, intervalMs, run })` on the maintenance tick                            | Register `runNudgeTick`, delete the route, update [[operations]] (§C8)                 | Low        |
| **#465** open hook events             | `HookEventType` widened to core plus the `app.` and `framework.` template-literal namespaces                      | Emit `app.reclaim.*`, **not** `reclaim.*` (§C9)                                        | Low        |
| **#476** default-allow binding        | Handler refuses un-advertised tool names (**default on**); `CAPABILITY_BINDING_MODE=strict` (opt-in)              | Drop the `RETIRED` block; audit before flipping strict (§C10)                          | Low        |
| **#472** structured-completion writes | Non-persistence is now contractual, guarded by an upstream test                                                   | **Keep our canary** rather than delete it (§C11)                                       | Low        |
| **#473** protected nav + auth landing | `lib/app/protected-nav.ts` and `lib/app/auth-landing.ts`; a dozen call sites, plus a label                        | Delete both shims, revert eight literal swaps, set the seams (§C12)                    | Low        |
| **#468** open `EmailPropsMap`         | `defaultTemplates` is `Partial`; `resolveEmailTemplate` throws by name when neither override nor default exists   | Register the quarterly nudge as an `app.`-namespaced kind via `lib/app/emails.ts`      | Low        |
| **#462** boot registries lost         | `globalThis`-backed context contributors + capability dispatcher                                                  | Delete both keep-mine blocks. **daybreak#160 is still open**, so keep the registry one | Low        |
| **#461** missing SSE variant          | `chatStreamEventSchema` models `budget_exceeded_per_turn`                                                         | Delete the raw-frame fallback at `coach-chat.tsx:418`                                  | Low        |

**Not one of the fourteen is a row we close by deleting our copy and walking
away.** Four change behaviour we have to re-verify by hand, three are worse than
what we already run, and one does not compile until we rename our events.

## 3. Concerns — where Sunrise's answer is not our ask

### C1 — #467's coverage guard fails on twenty leaf and framework models, and the only green path is a core edit

**High. Breaks the test suite on merge; unfixable at our tier.**

`tests/unit/lib/privacy/export-sources.test.ts` scans **every** file in
`prisma/schema/`, not core's own:

```ts
const files = readdirSync(SCHEMA_DIR).filter((file) => file.endsWith('.prisma'));
```

Its second net matches a bare `userId` / `createdBy` / `uploadedBy` / `ownerId` /
`actorUserId` / `subjectUserId` `String` with no `@relation` behind it — which is
precisely how **both tiers above core** declare their user links, because our FKs
are hand-written in the migration rather than modelled ([[upstream-sync]], "What
to be suspicious of"). Twenty models land in that net:

- **Ours (10):** `ReclaimAuditRun`, `ReclaimConsent`, `ReclaimGrant`,
  `ReclaimBucketLabel`, `ReclaimShare`, `ReclaimReportShare`, `ReclaimFeedback`,
  `ReclaimNudge`, `ReclaimReachOut`, `ReclaimPreviewAccount`
- **Daybreak's (10):** `SlotValue`, `FacilitationGraph`,
  `FacilitationGraphVersion`, `UserJourney`, `JourneyEvent`,
  `FacilitationPolicy`, `StructureChangeProposal`, `FrameworkJourneyNudge`,
  `ModuleVersion`, `ModuleWorkflowBinding`

Every one must appear in `SUBJECT_DATA_SOURCES` or `EXCLUDED_SOURCES` — **both in
core-owned `lib/privacy/export-sources.ts`**. There is no app- or framework-tier
registration into the guard. `collectAppSubjectData()` covers the _export_; it
does not satisfy the _test_, and the seam's own docstring confirms it, telling
forks to write a separate test of their own:

> "Your tables need the same protection, and core cannot write it for you — the
> pattern worth copying is a constant listing the tables you export plus a test
> that greps your own schema file…"

So the guard is written as though core's schema directory holds only core's
models, on a platform whose whole customization model is that two tiers above it
add files to that directory. We already have the leaf half it recommends —
`EXPORTED_SOURCES` in `lib/app/programme/admin/export.ts`, thirteen tables,
pinned by a test. That does not stop the core test going red.

**Ask (new row, unfiled):** the guard should skip `app-*.prisma` /
`framework-*.prisma`, or accept per-tier manifests the way `erasure-hooks.ts`
accepts per-tier cleanup. Until then the sync lands a red suite with no
tier-legal fix.

**A second decision hides behind this one.** Our export today is
**admin-guarded** — an operator answers a subject-access request, and it includes
the `sensitive` prose deliberately. Registering the same tables through
`collectAppSubjectData()` also exposes them at `GET /api/v1/users/me/export`,
self-service, behind only `exportLimiter`. That is defensible under Art. 15 and
is arguably the better answer, but it changes who can read a leader's own words
unmediated, and it should be made on purpose rather than as a side effect of
closing a ledger row.

### C2 — #482's `prisma format` CI gate fails on a Daybreak-owned file

**High. Breaks CI; unfixable at our tier.**

#482 makes the `lint` job run `prisma format` and fail on a non-empty diff. It
fixed core's own `orchestration-agents.prisma`. Nothing fixed Daybreak's — run it
here today and `prisma/schema/framework-facilitation.prisma` is rewritten, ten
lines across `UserJourney` and `UserNodeState` (attribute-column alignment only,
no schema change).

Our own `app-reclaim.prisma` is already clean, so this is entirely inherited. The
gate is correct and worth having; it simply arrives before the tier below is
ready for it. **Ask (new row, unfiled) → Daybreak.** Meanwhile the only options
are a keep-mine format of a Daybreak file (a conflict on every sync, for
whitespace) or a red `lint` job.

### C3 — `SIGNUP_MODE=invite_only` would silently break the preview fabricator

**High. Breaks a feature merged three days ago.**

`app/api/v1/app/reclaim/admin/preview/_lib/fabricate.ts:158` calls
`auth.api.signUpEmail()` directly. `lib/auth/signup-mode.ts` documents that this
is **not** exempt:

> "better-auth routes `auth.api.*` through the same dispatcher as HTTP requests,
> so the call arrives at the hook with `ctx.path === '/sign-up/email'` and would
> be refused by its own gate."

And `userCreateBeforeHook` is default-deny and **deliberately path-independent**,
so there is no second door. The fix is one line — wrap the call in
`runInvitedSignup()` — but it has to be made _before_ the env var is set, or
F19's preview participants stop being creatable with no obvious cause. The ledger
row could not have known: F19 shipped after it was written.

Note also that setting `SIGNUP_MODE` is a **decision, not a delegation**. Our
answer to open signup has always been the run-creation gate (I14), and that stays
regardless — the platform toggle stops accounts being created, not audits being
started.

### C4 — #464's hook cannot do what our row wanted, and fails more quietly than what we run today

**Medium. Recommend not adopting as the row describes.**

Our row asked for the grant to exist **before the user's first action**, so
`assertEntitled` could simplify back to a pure entitlement check. What shipped
runs after the row exists, **cannot reject a signup, and swallows a throw**:

> "a throw is logged and ignored rather than failing account creation, since the
> account is already there."

So a grant-mint that fails leaves an account with no entitlement, no error to the
user, and nothing but a log line. Our lazy redemption at the gate is idempotent
and **self-healing** — it reconciles on every attempt, so a transient failure
costs nothing. The row's original framing (lazy resolution is "the weaker model")
is inverted by what actually shipped: here the seam is the weaker model.

**Recommendation:** keep `assertEntitled` exactly as it is. Adopt
`registerUserCreatedHook` only as an eager optimisation layered _on top of_ the
gate, if at all.

One more reason for caution: `initAppUserCreatedHooks()` is a **boot-time
registry** — the same shape as the two registries #462 had to `globalThis`-back
for this app, and the shape Sunrise itself deliberately avoided for #465 ("these
schemas are built at module load… #462 showed boot order across module realms
isn't guaranteed under Turbopack") and for #467 ("a static import cannot be
missed"). Verify it survives the instrumentation/route split before depending on
it for anything that gates access.

### C5 — #474 changes the coach's prompt, not just its plumbing

**Medium. Behavioural; needs live re-testing, not a green suite.**

Today `COACH_OPENING_TRIGGER` reaches the model as a **user** message.
`openingTurn` delivers the same text as a **system** message. That is a different
position in the prompt, with different weight, composed against a persona
(`003-reclaim-coach-voice`) tuned while the trigger arrived as user text.

Since ryw-conversational, **every phase opens with the coach speaking** — seven
per audit. So this is not a change to one greeting; it is a change to the opening
move of the entire programme. Swap it, then re-run the phase openings by hand
against the voice the persona specifies. `smoke:reclaim` proves tools resolve; it
does not prove the coach still sounds right.

Minor and mechanical: `ChatEvent.start.messageId` becomes optional.

### C6 — #475's tag does not reach transcripts already written

**Medium. User-visible regression if adopted literally.**

The sentinel is read in six places, including `lib/app/programme/admin/transcript.ts`
(what Rashmir sees) and `components/app/reclaim/coach/transcript.tsx` (what the
leader sees). Rows already in the database carry the sentinel **string** and no
`metadata.app` tag.

The ledger row says to "delete `COACH_OPENING_TRIGGER`, `COACH_ARRIVAL_TRIGGER`,
`COACH_SYNTHETIC_MESSAGES`, `isCoachSyntheticMessage` and the filter". Doing that
makes every historical opening turn — a stage direction written in the second
person about the leader — appear in their own transcript as something they said.

**Adopt the tag for new rows; keep the sentinel match as a second arm** until a
backfill has stamped the historical rows, and delete the strings only then.

### C7 — #466 closed, and #489 went further than the row anticipated

**Medium. A judgement call, not a delegation.**

Two things changed. First, #489 is **breaking for API callers**: a successful
`PATCH /api/v1/users/me` now returns the _old_ address plus
`emailChangeRequested: true`, and the change lands only after approval at the old
address and verification at the new one. Any leaf UI or test asserting the new
address in the response needs updating.

Second, our row says to "drop the leaf's two compensating conditions in
`lib/app/programme/access/grants.ts` and let redemption match on email alone".
**Recommend keeping them.** They cost one query, they are already tested, and
they are the only thing between a future core regression and the invite-hijack
that `/security-review` rated High. Change the comment from "core does not
re-verify" to "core re-verifies as of #466/#489; these remain as defence in
depth" — the reasoning is what a later reader needs, and deleting the conditions
deletes the reasoning with them.

### C8 — #469's seam is safe for us specifically

**Low.**

The seam's honest limits — `intervalMs` is a minimum, last-run times live in
process memory, a multi-instance deployment runs each job about once per instance
per interval — would be alarming for an email job. They are not for ours:
`claimNudge` in `lib/app/programme/nudges/tick.ts` already holds a
database-backed atomic claim (`updateMany` guarded on
`lastNudgedForRunId: { not: runId }`, plus a unique-violation path on create), so
a tick that fires more often than intended cannot double-send.

What we give up is the admin guard and our own rate-limit sub-cap; what we gain
is one fewer external cron. Worth doing — and **[[operations]] documents the
nudge schedule as something that must be running**, so it changes in the same
commit.

### C9 — #465 namespaces fork events as `app.*`

**Low.**

`HookEventType` is now the core enum plus the two template-literal namespaces
`app.<name>` and `framework.<name>`. The names in our row — `reclaim.signup`,
`reclaim.audit_completed` — do not type-check. Use `app.reclaim.signup` and
`app.reclaim.audit_completed`.

Two follow-ons. `WEBHOOK_EVENT_TYPES` stays **closed** and is now documented as
such, so our events will not appear in the admin hook form's `<select>` — a
subscription has to be created through the API. And the change is flagged
BREAKING: an exhaustive `switch` over `HookEventType` with an `assertNever`
default no longer compiles. We have none today
(`lib/app/guard-event-contributors.ts` does not switch on it), but that is a fact
to re-check on the merge rather than assume.

### C10 — #476 landed in two halves; only one is on by default

**Low.**

The handler-side refusal of tool names outside the advertised set is **on by
default**, which satisfies the second of our row's two conditions — so the
`RETIRED` block in `prisma/seeds/app-reclaim/004-reclaim-coach-grants.ts` can go
and absence can mean absence again.

`CAPABILITY_BINDING_MODE=strict` is opt-in and, per the CHANGELOG,
"retroactively revokes capabilities agents relied on implicitly, including
`mcp-system`". The coach's own grants are all explicitly seeded with
`AiAgentCapability` rows, so it is likely safe — but check `005-reclaim-analyst`
and any Daybreak-registered agent before flipping it.

Related, from #488: refused calls now emit a `{ type: 'warning', code }` SSE
frame. `components/app/reclaim/coach-chat.tsx` must ignore an unrecognised
`warning` gracefully rather than treat it as terminal.

### C11 — keep the #472 canary

**Low. Deliberately overriding the ledger row.**

Upstream now states the non-persistence contractually and guards it with
`structured-completion-no-persistence.test.ts`. The row says to delete our canary
(`tests/unit/invariants/calendar-privacy.test.ts`) and cite the guarantee.

**Keep it.** It costs one assertion, and **I4 is a promise this app makes to
leaders in its own words** — that no meeting title is ever kept. A guarantee held
only by somebody else's test is a guarantee we discover has moved on the sync
that breaks it. Cite the upstream contract in the canary's header instead of
deleting the canary.

### C12 — #473 moves more sites than our eight

**Low. Mechanical, with one visible change.**

Upstream consumes the landing route at a dozen sites across twelve files —
including the protected layout's brand link, the admin header and the admin
sidebar, which our eight local swaps never touched. Adopting the seam therefore
changes where **admin** "back to the app" links point: from `/dashboard` to
whatever we set. Almost certainly what we want; still a change to verify rather
than discover.

Also new: `appAuthLandingLabel`, so the user-visible copy on those controls stops
saying "Dashboard"; `exact?` and `icon` on `ProtectedNavItem`; and a route that
is not root-relative now throws at module load.

### C13 — `defaults.test.ts` will conflict, and the resolution is counter-intuitive

**Low, but easy to get wrong.**

#480 makes `tests/unit/lib/app/defaults.test.ts` table-driven across fourteen
seams (from nine). We fill twelve or more. The upstream instruction is explicit:
**filling a seam is expected to fail a row — pin the new value, do not delete the
row.** Our daybreak#157 row's "paired assertion" lives in this file.

## 4. Changes nobody asked for that still land on us

| Change                                                            | Effect here                                                                                                                    |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **#487** `Cache-Control: private, no-cache` on all JSON responses | **Good for us.** `/api/v1/app/reclaim/shared/[token]` returns one leader's audit; it should never sit in a shared cache        |
| **#502** system-owned inbound/scheduled runs + migration          | We run no inbound triggers. Take the migration, verify nothing else                                                            |
| **#445** `DATABASE_POOL_MAX` (default 10) + 10s timeouts          | Set `1` if we deploy serverless behind a pooler. Exhaustion now fails fast instead of hanging                                  |
| **#442** maintenance-tick idle gate + per-task intervals          | Matters only once the nudge job moves onto the tick (§C8); `getAppJobsMinIntervalMs()` bounds the skip                         |
| **#456** `costLogRetentionDays` validation at three write paths   | Could reject an existing settings row. Check ours before the merge, not after                                                  |
| **#429** `app.prisma` ships empty                                 | Contradicts [[README]]'s "`app.prisma` is **not** ours" note — update it on the merge. No table or migration change            |
| **#481** `generatedColumnExists()`                                | Candidate for `lib/app/leaf-db-drift.ts` if we ever add a generated column                                                     |
| **#452 / #453 / #454 / #455 / #497** CI and test knobs            | `ci.yml` hardcodes `--max-old-space-size=5120`; `vitest.config.ts` sets `testTimeout: 10000`. Both become upstream's. Conflict |
| **#435 / #451 / #434** `validatePathParam`, `slugify`, boundary   | No leaf copies found — nothing to unwind                                                                                       |
| **#490** storage private objects                                  | We store no objects. No action                                                                                                 |

## 5. Order of work, when Daybreak lands it

1. **Before merging:** wrap `fabricate.ts:158` in `runInvitedSignup()` (§C3). It
   is a one-line change that stops a shipped feature breaking the moment anyone
   sets the env var.
2. Run [[upstream-sync]] "The procedure" as written — the file table there still
   governs, with the #473 rows now resolvable by taking upstream's seam.
3. **Expect two red gates that are not ours to fix** (§C1, §C2). File both before
   resolving them, so the workaround has a row pointing at it.
4. Close the ledger rows one at a time, in the §2 order. Do **not** batch — four
   of them need behaviour verified by hand, and a batched commit hides which one
   moved the coach.
5. Re-run the smokes, including the two CI cannot: `smoke:reclaim` (the
   `globalThis` resolution) and `smoke:reclaim-calendar` (I4).
6. Re-read the coach's phase openings live (§C5) and one historical transcript
   (§C6). Neither is covered by a test.

## 6. New asks this assessment found

Both are unfiled, and both are recorded in [[daybreak-asks]]:

- **→ Sunrise:** the #467 coverage guard scans every `prisma/schema/*.prisma`, so
  a fork's and a framework tier's own models fail a core test whose only green
  path is editing a core file (§C1).
- **→ Daybreak:** `prisma/schema/framework-facilitation.prisma` is not
  `prisma format`-clean, and Sunrise #482 now fails CI on the diff (§C2).
