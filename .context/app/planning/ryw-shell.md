---
name: ryw-shell
feature: F4 · ryw-shell
epic: RYW v1
status: in flight
owner: John
depends_on: F3 · ryw-firstlight (shipped #25)
spec: ../invariants.md (I3, I4, I6, I9, I15) · ../slot-spec.md · CUSTOMIZATION.md §5 (satellite tables) · lib/framework/data-slots/values.ts · lib/framework/facilitation/engine/apply-event.ts (the seams)
parent: plan.md
opened: 2026-07-24
---

# ryw-shell — audit shell, chat, capture

> Feature-level build plan for **F4 `ryw-shell`**, the first feature that stores a real audit.
> Parent: [[plan#F4 · `ryw-shell` — audit shell, chat, capture|plan.md]].
> Binding _how_: [[invariants]] (I3 one write path, I9 reflection, I15 completion, I4 no calendar
> table, I6 no LLM-supplied run key) and the live seams `appendSlotValue`/`slotMaskingPolicy`
> (`lib/framework/data-slots/**`) and `applyEvent` (`lib/framework/facilitation/engine/**`).
> Sizing follows the parent: **task = one PR**; commits sit below that resolution.

## Intent

F3 proved the framework surface lights up and streams. F4 makes it **hold a real audit run**: the
leaf schema, the single write-path to slots, the run lifecycle (create → transition → complete) with
the server-enforced reflection gate, and the first end-user chat client over the module surface. It is
the feature that turns "the coach can talk" into "a leader can start an audit, answer, leave, and
resume" — but with **no phase content yet** (that is F6/F7). Shell, plumbing, and the write path only.

Three invariants get their _real_ implementation here, not just a smoke assertion:

- **I3 — one write path.** Every slot write in the whole app goes through `saveAnswer()`, the sole
  caller of `appendSlotValue`. This is the feature that establishes it, so the guard test lands here.
- **I9 — reflection is server-enforced.** The phase-transition route refuses (`422 REFLECTION_REQUIRED`)
  when the leaving phase's reflection slot is absent. A UI-only guard is not sufficient.
- **I15 — close the conversation on completion.** Completing a run sets `isActive:false` on the
  `AiConversation`, so audit 2 opens a fresh transcript (F3's smoke already asserts the effect).

And it lands the **leaf schema** — the one place GDPR erasure and the no-calendar-table promise (I4)
are structural, not aspirational.

## Reconciliation against the live repo

Verified during planning, 2026-07-24. The seams exist and are shaped as the parent assumed, with
**three findings** that shape the tasks (and one that is a likely [[daybreak-asks]] row).

- **Satellite-table pattern for every `userId` table (CUSTOMIZATION.md §5).** Leaf tables carry a
  **plain `String userId`** FK to `User.id` with **no Prisma `@relation`** (a relation needs a reverse
  field on the core `User` model — the fork-and-edit trap). The FK **and its `ON DELETE`** are
  **hand-written in the generated migration SQL**, then guarded two ways: a **drift probe**
  (`constraintExists` from `@/lib/db/drift-probes`) registered in `leaf-db-drift.ts` (`registerLeafDriftProbes`,
  reserved and empty today), because Prisma computes desired state from a schema that has no relation
  for the FK and a later `migrate dev` would emit a `DROP` for it; and, where the cascade can't reach
  residual PII, an erasure hook (`lib/privacy/erasure-hooks.ts`). **The schema-level `onDelete` lint
  guard does NOT catch a plain-scalar FK** — so the drift probe is what makes the policy reviewable.
  `CASCADE` for personal data; `SET NULL` (nullable FK) for retained config/audit.

- **The framework has no journey-creation seam — the leaf creates the `UserJourney` row.** `applyEvent`
  (`engine/apply-event.ts`) is the **sole writer of journey _state_** (node projections + events) and
  takes an **existing `journeyId`** on its `Transition`; `getJourney` reads by the natural key
  `@@unique([userId, graphSlug, contextKey])` (`framework_user_journey`). Nothing in the framework (or
  anywhere — grep is clean) creates a `UserJourney`; F3 didn't need one. So **F4 t-3's run-creation
  creates the `UserJourney`** (`userId`, `graphSlug: 'reclaim-audit'`, `contextKey: <runId>`) alongside
  the `app_reclaim_audit_run` row. `UserJourney.userId` is itself a hand-written-cascade satellite FK,
  so erasure already reaches it. **Open question for John:** create the row with a direct
  `prisma.userJourney.create`, or ask Daybreak for a `createJourney()` seam (a [[daybreak-asks]]
  candidate — journey creation is a generic facilitation need, like F1's `runId`)? Recommend: create
  directly in F4, file the seam ask, delegate on the sync that lands it.

- **`saveAnswer` wraps `appendSlotValue` through `slotMaskingPolicy`.** `appendSlotValue`
  (`data-slots/values.ts`) is insert-only/versioned and takes a `provenance` carrying the optional
  `runId?` F1 added. `slotMaskingPolicy(sensitivity, dataType, form)` (`capabilities/masking.ts`) is a
  pure transform — a no-op for `standard`/`sensitive`, redaction only for `special_category` (which no
  `reclaim_*` slot is, I5). `saveAnswer` computes the stored form via the policy, stamps
  `provenance.runId = <contextKey>`, and is the **only** caller. `lib/app/programme/slots/` does not
  exist yet — t-2 creates it.

- **The transition/completion routes drive `applyEvent`; the reflection gate is a leaf-side pre-check.**
  A `Transition` is `{ journeyId, nodeKey, kind: 'enter' | 'complete', payload? }`. A phase advance is
  **complete the current phase node, then enter the next**. `applyEvent` gates `complete` authoritatively
  inside its transaction (race-safe) and `enter` on availability. **I9 is not an `applyEvent` concern** —
  the reflection requirement is a leaf rule, so `assertPhaseComplete` reads the run's slot heads
  (`getSlotHeads`, filtered to `reclaim_reflection_p<N>`) and returns `422 REFLECTION_REQUIRED`
  **before** calling `applyEvent`. Completion (I15) marks the final node `complete` and sets
  `isActive:false` on the surface `AiConversation`.

- **The consumer client consumes F3's module-surface route.** `POST /api/v1/framework/modules/reclaim-audit/chat/stream`
  (built in Daybreak, exercised by F3's smoke) is the SSE endpoint; the admin chat component is the
  **reference only** (decision: leaf builds its own consumer client under `app/(protected)/programme/`).
  `run id = journey contextKey = provenance runId`, and the client never sends `contextKey` as an LLM
  arg (I6) — the server owns it.

## Invariants this feature touches

| Invariant                           | How F4 honours it                                                                                                                                | Guard                                                                                                                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **I3** (one write path)             | `saveAnswer()` is the sole caller of `appendSlotValue`, routing through `slotMaskingPolicy` and stamping `provenance.runId`                      | `tests/unit/invariants/write-path.test.ts` greps `lib/app/**` + `app/api/v1/app/**` for `appendSlotValue`, asserts exactly one occurrence (in `write.ts`); wired into `leaf:checks` |
| **I9** (reflection server-enforced) | the transition route's `assertPhaseComplete` returns `422 REFLECTION_REQUIRED` when the leaving phase's `reclaim_reflection_p<N>` slot is absent | unit test on the transition handler: absent reflection → 422; present → applyEvent called                                                                                           |
| **I15** (close on completion)       | the complete route sets `isActive:false` on the surface conversation                                                                             | F3's `smoke:reclaim` already asserts the fresh-conversation effect; F4 adds a unit test that complete sets the flag                                                                 |
| **I4** (no calendar table)          | the leaf schema has **no** calendar/event table; `reclaim_calendar_*` are slot values (F5), never rows                                           | reviewed in the schema diff; the drift-probe list names no calendar object                                                                                                          |
| **I6** (no LLM-supplied run key)    | `contextKey`/`runId` is server-owned, derived from the run the leaf created; never read from a capability arg                                    | code review of the routes; the client sends only `message`                                                                                                                          |
| **GDPR onDelete** (CLAUDE.md)       | every `userId` table declares CASCADE (personal) or SET NULL (`consent`, retained); hand-written FKs + drift probes                              | `leaf-db-drift.ts` probes; `eraseUser` reach proven in F10 t-5 (out of scope here, but the cascades that make it work land now)                                                     |

## Test strategy

vitest runs on `happy-dom` with **no live DB** ([[building-a-feature]] §1.2). So:

- **I3 write-path test** — a static grep test (mirrors the existing `eslint-app-boundary` precedent), in
  `leaf:checks`. No DB.
- **Transition / completion handlers** — unit tests mocking `@/lib/db/client`: absent reflection slot →
  `422`; present → `applyEvent` invoked; complete → `isActive:false` written. A small in-memory fake
  proves the create→transition→complete chain without a real DB.
- **Cascade + real lifecycle fidelity** — extend `smoke:reclaim` (real Postgres): create a run (journey
  - `audit_run` row), answer via `saveAnswer` (slot value stamped with `runId`), transition, complete
    (assert `isActive:false`), and a resume. The migration's hand-written cascades are confirmed by the
    drift probe (`npm run db:drift-check`, in `/pre-pr`) plus a smoke assertion that erasing the smoke
    user leaves no `app_reclaim_*` orphan (the full erasure proof is F10 t-5).
- No new invariant test files beyond `write-path.test.ts`; the others are handler unit tests under
  `tests/unit/app/api/**`.

## Promoted tasks

| id  | Intent                                                                                         | Files likely to touch                                                                                                                              | Deps | Status | PR  |
| --- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------ | --- |
| t-1 | Leaf schema + migration with hand-written cascades + drift probes                              | `prisma/schema/app-reclaim.prisma`, `prisma/migrations/<ts>_app_reclaim_shell/`, `lib/app/leaf-db-drift.ts`, `tests/unit/lib/app/db-drift.test.ts` | F3   | todo   | —   |
| t-2 | `saveAnswer()` — the single slot write-path (I3)                                               | `lib/app/programme/slots/write.ts`, `tests/unit/invariants/write-path.test.ts`, `package.json` (`leaf:checks`)                                     | t-1  | todo   | —   |
| t-3 | Run lifecycle routes (create/transition/complete/answers) + journey creation + reflection gate | `app/api/v1/app/reclaim/runs/**`, `lib/app/programme/runs/**`, `tests/unit/app/api/**`                                                             | t-2  | todo   | —   |
| t-4 | First consumer SSE client + seven-node progress shell                                          | `app/(protected)/programme/**`, `components/app/reclaim/**`                                                                                        | t-3  | todo   | —   |

> **Sizing note — one decision for John.** The parent lists **eight** `app_reclaim_*` tables in t-1
> (`invite, grant, audit_run, bucket_label, share, report_share, feedback, consent`), but F4 only
> _uses_ `audit_run` (and `consent` carries F8 t-4's legal-basis record). Two readings: **(A) land the
> whole schema now** — one migration, all cascades reviewed together, later features add only logic;
> **(B) land only `audit_run` (+ `consent`)** and let F6/F7/F8 add their tables with their logic
> (avoids shipping tables no code uses — "ship nothing a fork deletes"). Recommend **(A)** _only if_
> each table's shape is settled enough to not churn; otherwise **(B)**, which keeps each table next to
> the feature that gives it meaning. Flagged because it changes t-1's size materially and is a genuine
> judgment call, not a reconciliation fact.

### t-1 — leaf schema + cascades + drift probes

- `prisma/schema/app-reclaim.prisma` (a **new** file — `app.prisma` is Sunrise's). Per the scope
  decision above: at minimum `app_reclaim_audit_run` and `app_reclaim_consent`.
  - **`app_reclaim_audit_run`** — `id`, plain `userId`, `status` (`in_progress | complete | abandoned`),
    `quarter`, timestamps. **Partial unique index `(userId) WHERE status = 'in_progress'`** (one active
    run per user) — a Prisma-unmodelled object → a `indexExists` drift probe. `onDelete CASCADE`
    (personal data), hand-written.
  - **`app_reclaim_consent`** (F8 t-4's seam) — `userId` **nullable**, `policyVersion`, `acceptedAt`,
    and a separate `marketingOptIn` boolean. **`onDelete SET NULL`, not CASCADE** — the consent record
    is the evidence that processing was lawful; erasing it with the user destroys the proof. That makes
    `userId` nullable **here and nowhere else** in this schema — deliberate, not a mistake.
- Hand-write each FK + `ON DELETE` in the migration SQL (`migrate dev --create-only`, then edit), and
  register a probe per object in `leaf-db-drift.ts` (`constraintExists` for each FK, `indexExists` for
  the partial unique). **No calendar table** (I4).

_Done when:_ `db:migrate:dev` applies; `db:drift-check` passes with the new probes; the partial-unique
index refuses a second `in_progress` run for a user (real-DB check); `framework:boundary` + type-check
green; a fresh checkout still boots clean (schema only, no seeded audit rows).

_Gates:_ `commit → /pre-pr → /security-review → npm run format → push → open PR → /code-review`.
(Schema + cascades — `/code-review` earns its keep here per [[planning-retro]].)

### t-2 — `saveAnswer()`, the single write-path (I3)

- `lib/app/programme/slots/write.ts` exporting `saveAnswer(...)`: the **only** caller of
  `appendSlotValue`. Computes the stored form via `slotMaskingPolicy(sensitivity, dataType, form)` (read
  the slot's sensitivity/dataType from the registered definitions), stamps `provenance.runId = contextKey`,
  and appends. Every route/component/capability that persists an answer calls this — never `appendSlotValue`
  directly.
- `tests/unit/invariants/write-path.test.ts` (in `leaf:checks`): grep `lib/app/**` and `app/api/v1/app/**`
  for `appendSlotValue`, assert exactly one occurrence, in `write.ts`.

_Done when:_ `saveAnswer` appends a masked, run-stamped value in a unit test (mocked db); the write-path
grep test passes and is wired into `leaf:checks`; type-check green.

### t-3 — run lifecycle + journey creation + reflection gate

Routes under `app/api/v1/app/reclaim/runs/` (leaf API surface), guarded by `withAuth`:

- **create** — creates the `app_reclaim_audit_run` **and** the `UserJourney`
  (`graphSlug:'reclaim-audit'`, `contextKey:<runId>`); the run id is the journey `contextKey` and the
  provenance `runId`. A **TODO marker for the F6/F8 entitlement gate** (I14 is enforced here in F6, not
  yet). Refuse a second `in_progress` run (the partial-unique index backs this).
- **transition** — `assertPhaseComplete` reads the run's slot heads for the leaving phase's
  `reclaim_reflection_p<N>`; absent → **`422 REFLECTION_REQUIRED`** (I9). Otherwise drive `applyEvent`
  (complete the current node, enter the next). Never read `contextKey` from an LLM arg (I6).
- **complete** — mark the final node `complete` via `applyEvent`, set the run `status:'complete'`, and
  set **`isActive:false`** on the surface `AiConversation` (I15).
- **answers** — delegates to `saveAnswer` (I3); never appends directly.

File the `createJourney` seam ask in [[daybreak-asks]] (per the reconciliation), and create the row
directly meanwhile.

_Done when:_ a run can be created (journey + run row), a transition without the reflection slot returns
`422`, completing sets `isActive:false` and `status:'complete'`; unit tests cover the 422 and the
completion flag; `smoke:reclaim` extended to create → answer → transition → complete → resume.

_Gates:_ full loop (routes + a slot write path — `/security-review` for the auth/ownership checks, I6).

### t-4 — consumer SSE client + progress shell

- First end-user surface under `app/(protected)/programme/`, consuming F3's module-surface SSE route
  (`/api/v1/framework/modules/reclaim-audit/chat/stream`); the admin chat is an SSE **reference only**.
- Progress bar over **all seven** map nodes with Phase 0 labelled **Setup** (the map is
  `phase-0-setup … phase-6-summary`; hiding node 0 makes "you are here" wrong on resume, which reads
  `UserNodeState` per node). Auto-save; resume from node state. Plus the per-phase **signpost line**
  ([[content-source]] §5d): entering a phase says which phase, what it involves, and roughly how long.
- **Shell only — no phase content yet** (F6/F7 fill the phases).

_Done when:_ a run starts, streams a turn, can be left and resumed to the right node; the progress bar
shows all seven with Phase 0 as Setup; the signpost line renders on phase entry; no phase content.

## Notes / deferrals

- **No phase content, no charts, no calendar, no entitlement enforcement.** F6 (setup + Phase 1 +
  charts), F7 (Phases 2–6), F5 (calendar), F8 (the grant gate the create route stubs). F4 is the shell
  and the write path they all build on.
- **Schema landed early for later features** (if scope-decision A) is not demo data — empty tables with
  correct cascades, which a fresh checkout keeps. No `app_reclaim_*` rows are seeded.
- **The `createJourney` gap is the second [[daybreak-asks]] shape this build has found** (after F1's
  `runId`): a generic facilitation need the framework doesn't yet expose. Create directly in the leaf,
  file the ask, delegate on adoption — do not edit `lib/framework/**` (I10).
- **`eraseUser` reach is F10 t-5**, but the hand-written cascades that make erasure work are landed here;
  getting them wrong now is a silent GDPR violation later, which is why the drift probes (t-1) are not
  optional.
