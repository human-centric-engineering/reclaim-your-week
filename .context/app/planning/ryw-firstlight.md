---
name: ryw-firstlight
feature: F3 · ryw-firstlight ★
epic: RYW v1
status: in flight
owner: John
depends_on: F2 · ryw-module (shipped #19 #20 #21)
spec: ../invariants.md (I5, I6, I14, I15) · ../slot-spec.md · lib/framework/facilitation/map/** · lib/framework/guidance/surface.ts (the seams)
parent: plan.md
opened: 2026-07-24
---

# ryw-firstlight ★ — the spike

> Feature-level build plan for **F3 `ryw-firstlight`**, the end-to-end spike.
> Parent: [[plan#F3 · `ryw-firstlight` ★ — the spike|plan.md]].
> Binding _how_: [[invariants]] (I5, I6, I14, I15) and the live framework seams
> under `lib/framework/facilitation/map/**` and `lib/framework/guidance/surface.ts`.
> Sizing follows the parent: **task = one PR**; commits sit below that resolution.

## Intent

**This is a genuine gate, not a formality** ([[plan]] §Concept). The Daybreak
module map, per-run journey state, and slot store were built for exactly this shape
of app but have **never run end to end for a real leaf**. F3 is the first time
`boot → registerModule → syncFramework → publish map → resolve surface → stream a
turn` runs against **real Postgres**. F2 landed the code half (the `reclaim-audit`
`ModuleDefinition`, 105 slots, verbatim config, the coach agent) but nothing in F2
touches a database — it is pure registration and unit tests on `happy-dom`. F3 is
where the seams either hold or reveal their gaps.

Two outputs matter equally:

1. **A working vertical slice** — a seeded, published map with the coach agent bound
   `public` and primary, one streamed conversational turn proven by `smoke:reclaim`.
2. **An honest defect ledger.** Budget two to three unrelated framework bugs
   ([[plan]] §F3). Every one is recorded in [[daybreak-asks]] with a repro and the
   lesson in [[planning-retro]] §A. **More than three → stop and re-scope F4 before
   building** (the parent's explicit circuit-breaker).

F3 ships **no product UI and no leaf schema** — that is F4. It seeds only what the
framework needs to light up, proves the light is on, and re-verifies the four
`lib/framework/**` citations the leaf's invariants depend on before F4 bakes them in.

## Reconciliation against the live repo

Verified during planning, 2026-07-24. Every seam F3 consumes exists; three findings
change the parent's task shape and are folded into the tasks below.

- **Seed discovery is recursive and app-aware.** `runSeeds` (`prisma/runner.ts`)
  walks `prisma/seeds/**` recursively; files match `NNN-slug.ts`; app subdirectories
  (letter-prefixed) sort **after** all core seeds, and the `SeedHistory` key is the
  path relative to `seeds/` (so `app-reclaim/001-map` never collides with a core
  `001-*`). **Consequence: `prisma/seeds/app-reclaim/NNN-*.ts` is picked up by the
  existing `db:seed` automatically — there is no separate `seed:reclaim` script to
  write, and the parent's `db:reset && db:seed && seed:reclaim` done-when line is one
  command too many.** The done-when below corrects it to `db:reset` (which re-runs
  every seed) then `smoke:reclaim`. A new `smoke:reclaim` **script** is still needed;
  a new _seed_ script is not.

- **The map publish seam is `createGraph`, not `publishDefinition`.**
  `createGraph({ slug, name, definition, userId, clientIp })`
  (`lib/framework/facilitation/map/version-service.ts`) creates the graph row **and
  publishes it as v1 atomically**, raising a `ValidationError` on a duplicate slug —
  exactly a seed's idempotent-create shape. `publishDefinition` is the
  proposal-approval primitive (it deliberately ignores the draft and writes an
  `agent:<slug>` author); wrong tool here. The definition is re-validated by
  `validatePublishableMap` on the way in, so a malformed node fails loudly at seed
  time, not at first stream.

- **Node type for the seven phases is the one real open question, and the spike is
  where it gets answered.** `nodeSchema` (`map/schema.ts`) has
  `NODE_TYPES = ['module','stage','milestone','region']`; a `type:'module'` node
  **requires** a `moduleSlug` binding to a registered `Module`. There is exactly one
  registered module (`reclaim-audit`). So the seven `phase-0-setup … phase-6-summary`
  nodes are **not** seven module nodes. The likely shape is **one `module` node
  (`reclaim-audit`, `completionMode:'repeatable'`) whose seven phases are the
  module's own journey/guidance progression**, or seven `stage` nodes under a single
  module. t-1 resolves this against a real published map + a real `resolveModuleSurface`
  call — getting it wrong is precisely one of the two-to-three framework surprises F3
  budgets for. **The progress-bar-over-seven-nodes assumption in F4 t-4 rides on this
  answer; t-3 records it so F4 does not inherit a guess.**

Seams confirmed present and shaped as expected:

- `resolveModuleSurface` (`guidance/surface.ts`) resolves the primary, active,
  non-deleted binding and resumes a conversation on
  `(userId, agentId, contextType='module', contextId, isActive:true)` — the I15
  fresh-conversation trap lives here.
- `bindAgent` (`lib/framework/modules`, `BindAgentArgs`) binds an `AiAgent` into a
  module seat with `isPrimary`. The seat is `RECLAIM_COACH_ROLE = 'coach'`, already
  declared on the module (`lib/app/programme/module.ts`).
- The agent seed pattern is the existing `SeedUnit` shape (`prisma/seeds/006-quiz-master.ts`
  is the worked reference): idempotent create/update against `serviceAccountWhere`,
  `isSystem` on re-seed so admin edits survive.
- The smoke harness is `scripts/smoke/*.ts` run via `tsx --env-file=.env.local`
  (`smoke:chat` is the closest reference — it drives the real streaming chat handler
  against the dev DB).
- The `Module` row itself is created by boot-time `syncFramework()` from the F2
  `registerModule('reclaim-audit')`; the seed's job is to set it **`active`** and
  attach the map + agent, not to create it.

## Invariants this feature touches

F3 does not _implement_ new invariant behaviour — F4/F5/F6 do — but it is the first
place three of them are exercisable against real data, and it is the checkpoint that
keeps their `lib/framework/**` citations honest.

| Invariant                                  | How F3 honours / exercises it                                                                                                                                                                                                        |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **I15** (fresh conversation on completion) | The `smoke:reclaim` assertion set includes "a second run gets a fresh `conversationId`", exercising `resolveModuleSurface`'s `isActive:true` resume path directly. This is I15's named test.                                         |
| **I5** (never `special_category`)          | The seed + smoke assert no seeded `reclaim_*` slot definition is `special_category`. Belt-and-braces with F2's `slot-sensitivity.test.ts`, but here against the **synced** definitions in Postgres, not the in-memory registry.      |
| **I6** (agent reads only)                  | The coach agent is seeded with the read-only capability set and the `reclaim_profile_*`-only exposure allowlist F2 authored; F3 only binds and publishes it — it must not widen the grant. Re-verified, not re-authored.             |
| **I14** (entitlement at run creation)      | Out of scope to _enforce_ (no run-creation route until F4/F8), but its citation `liveness.ts:53-83` / `assemble.ts:66` is re-verified in t-3, because F8's whole design rests on it and a sync will drift the line numbers silently. |

t-3's citation re-verification covers **I5, I6, I14, I15** — the four the parent
names ([[plan]] §F3 t-3). They were exact on 2026-07-23 and drift on every
`git merge upstream/main`.

## Test strategy

vitest runs on `happy-dom` with **no live DB** ([[building-a-feature]] §1.2), so the
end-to-end proof cannot be a vitest integration test — it is `smoke:reclaim`, a real
Postgres script. Split accordingly:

- **`smoke:reclaim`** (`scripts/smoke/reclaim.ts`) is the fidelity proof: seed, resolve
  the surface, stream one turn, assert the three silent-failure traps (t-2). It is a
  script, not a `tests/**` file, and runs against `.env.local` like every other
  `smoke:*`.
- **Map-definition unit test** (`tests/unit/app/programme/map.test.ts`, no DB): assert
  the authored `MapDefinition` passes `validatePublishableMap`, has seven phase keys
  in a single prerequisite chain, `completionMode:'repeatable'`, and **no edge carries
  a `condition`** (the run-2 head-version trap — [[plan]] §F3 t-1). This catches a
  malformed map at PR time without waiting for a DB.
- No new invariant test file — F3 exercises existing ones (I5/I15) through the smoke
  assertions rather than adding to `tests/unit/invariants/`.

## Promoted tasks

| id  | Intent                                                                                                                                                                                                                     | Files likely to touch                                                                                                                                                                 | Deps | Status | PR  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------ | --- |
| t-1 | Seed + publish the map; seed + bind the coach agent `public`/primary; set the module row `active`; author `smoke:reclaim` proving one streamed turn                                                                        | `prisma/seeds/app-reclaim/001-reclaim-map.ts`, `.../002-reclaim-coach-agent.ts`, `scripts/smoke/reclaim.ts`, `package.json` (`smoke:reclaim`), `tests/unit/app/programme/map.test.ts` | F2   | todo   | —   |
| t-2 | Add the three silent-failure assertions to `smoke:reclaim`: agent visibility is `public`, a fresh `conversationId` is issued, no `reclaim_*` slot is `special_category`                                                    | `scripts/smoke/reclaim.ts`                                                                                                                                                            | t-1  | todo   | —   |
| t-3 | Re-plan checkpoint: ledger every framework defect in [[daybreak-asks]] with a repro; lesson in [[planning-retro]] §A; re-verify the I5/I6/I14/I15 `lib/framework/**` citations; record the resolved node-type shape for F4 | `.context/app/daybreak-asks.md`, `.context/app/planning/planning-retro.md`, `.context/app/invariants.md` (only if drift found), this doc                                              | t-2  | todo   | —   |

> **Sizing note.** t-1 and t-2 are one continuous script build; they are split only so
> the map/agent/publish plumbing (t-1) is reviewable before the assertion hardening
> (t-2) piles on. If t-1 lands small, fold t-2 in — do not manufacture a second PR for
> three `assert` calls. t-3 is docs + a checkpoint, deliberately its own task because
> **the go/no-go on F4 is decided there**, not mid-PR.

### t-1 — seed, publish, bind, stream

- **The map.** `prisma/seeds/app-reclaim/001-reclaim-map.ts` authors a `MapDefinition`
  and publishes it via `createGraph` (idempotent: catch the duplicate-slug
  `ValidationError` on re-seed, or guard on `getPublishedMap(slug)` first). Seven
  phases `phase-0-setup … phase-6-summary` in a **plain `prerequisite` chain, no edge
  `condition`** (slot conditions read the head version, which breaks on run 2 —
  resolve run-scoping in F4, not here). Node type per the reconciliation above —
  **resolve module-vs-stage against a real published map before committing the
  shape**; the resolved answer is what t-3 records for F4.
- **The agent.** `002-reclaim-coach-agent.ts` seeds the coach `AiAgent` from
  `reclaimCoachAgent` (`lib/app/programme/agent.ts`, F2 t-4), `visibility:'public'`,
  and `bindAgent`s it into the `coach` seat `isPrimary:true`. Idempotent per the
  `006-quiz-master` pattern; must not widen the F2 capability/exposure grant (I6).
- **The module row.** Set `reclaim-audit` `active` (boot `syncFramework` created it;
  the seed activates it — do not create it).
- **`smoke:reclaim`.** `scripts/smoke/reclaim.ts` + the `package.json` script
  (`tsx --env-file=.env.local scripts/smoke/reclaim.ts`): resolve the surface for a
  test user, stream **one** turn, assert non-empty streamed output. The assertion
  hardening is t-2.
- **The unit test.** `tests/unit/app/programme/map.test.ts` per the test strategy —
  no DB, validates the authored definition.

_Done when:_ `db:reset` (re-runs every seed including `app-reclaim/*`) completes clean;
`smoke:reclaim` streams one non-empty turn; the map unit test passes; `framework:boundary`
and `type-check` green; a fresh checkout still boots clean (no demo audit rows — the
seed adds map + agent + active module only, nothing a fork must delete).

_Gates:_ `commit → /pre-pr → /security-review → npm run format → push → open PR →
/code-review`. (Real streaming + a seed touching agent grants — do not skip
`/security-review`.)

### t-2 — the silent-failure assertions

The three traps from [[plan]] §F3 t-2, each of which fails with **no diagnostic** if
unguarded:

- **Agent visibility is `public`.** A non-public agent makes the module surface 404
  with nothing in the log explaining why. Assert it on the seeded agent.
- **A fresh `conversationId` is issued on a second run** (I15). Drive two runs; assert
  distinct `conversationId`s. This is the direct exercise of `resolveModuleSurface`'s
  `isActive:true` resume guard, and I15's named test.
- **No `reclaim_*` slot is `special_category`** (I5) — asserted against the **synced**
  definitions in Postgres, complementing F2's in-memory `slot-sensitivity.test.ts`.

_Done when:_ `smoke:reclaim` passes all three assertions; a deliberately-broken seed
(agent `private`, or a slot flipped to `special_category`) makes it **fail loudly** —
verify the guard bites before trusting it.

_Gates:_ same as t-1 (or folded into t-1's PR per the sizing note).

### t-3 — re-plan checkpoint + citation re-verification

Docs + checkpoint → skips `/security-review` and `/code-review`.

- **Ledger every framework defect** found in t-1/t-2 into [[daybreak-asks]] with a
  minimal repro, and the lesson into [[planning-retro]] §A. If **zero** defects: say so
  explicitly in both — a clean spike is a finding worth recording, not a silence.
- **Count the defects.** More than three unrelated framework bugs → **stop; re-scope F4
  in [[plan]] before any F4 task work.** This is the parent's circuit-breaker; honour it.
- **Re-verify the four citations** in [[invariants]] against live code — I5, I6, I14
  (`liveness.ts:53-83`, `assemble.ts:66`), I15 (`surface.ts:69-79`). Correct any drift;
  if all exact, record that (as [[ryw-provenance]] t-2 did) so the next session knows
  the check ran.
- **Record the resolved node-type shape** (module vs stage for the seven phases) in this
  doc and, if it changes the F4 t-4 progress-bar assumption, note it on the [[plan]] F4
  row — so F4 inherits the spike's finding, not the guess.

_Done when:_ the [[daybreak-asks]] rows exist (or an explicit "no defects" note); F4's
go/no-go is recorded; the four invariant citations are re-verified; the node-type shape
is written down where F4 will read it.

## Notes / deferrals

- **No leaf schema, no run-creation route, no product UI.** All F4. F3 seeds the
  framework surface and proves it streams; it deliberately stops there. The
  `app_reclaim_*` tables, `saveAnswer` write path (I3), lifecycle routes, and the SSE
  client are the next feature.
- **No run-scoping yet.** The map has no edge conditions precisely because run-scoped
  slot reads (`provenance.runId`, F1) have no writer until `saveAnswer` (F4 t-2). F3
  proves the spine lights up; F4 makes it run-aware.
- **Ship nothing a fork deletes.** The seeds add a published map, a bound public agent,
  and an active module row — framework configuration, not demo data. No example audit,
  no test user persisted. `smoke:reclaim`'s test user is created and cleaned up by the
  script, not seeded.
- **If the node-type question turns out to need a framework change**, that is itself an
  F3 finding: ledger it in [[daybreak-asks]] and weigh it against the three-defect
  circuit-breaker before proceeding — do not edit `lib/framework/**` to make the spike
  pass (I10; F1 was the one sanctioned exception).
