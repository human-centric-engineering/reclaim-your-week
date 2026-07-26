---
name: Reclaim Your Week
category: expert-led app (Daybreak leaf)
status: in flight
host_framework: Daybreak (this repo is a fork of it)
daybreak_baseline: Framework v1 + v1.1 COMPLETE (all 23 features shipped)
opened: 2026-07-23
spec: ../content-source.md + ../slot-spec.md + ../invariants.md
sources: ../sources/ — Reclaim_Your_Week_Brief_for_John.md (authoritative) · Time_Audit_Tool_Prompt_Text.md (content) · Time_Audit_Tool_Setup_Guide.md (register) · Time_Audit_Tool_User_Prompts.md · Time_Audit_App_Notes.md (superseded proposal)
epic: RYW v1
---

# Reclaim Your Week — development plan

> The working plan for building **Reclaim Your Week**, the leaf app that turns Rashmir
> Balasubramaniam's time audit into a hosted product on **Daybreak**. This repo is a **fork of
> Daybreak** (which forks Sunrise); `package.json` already reads `reclaim-your-week`. This doc is the
> _build breakdown_ — the authoritative content is [[content-source|../content-source.md]] (Rashmir's
> IP, verbatim), the data shape is [[slot-spec|../slot-spec.md]], and the non-negotiable rules are
> [[invariants|../invariants.md]] (I1–I18, I-frame, I-composite). Structured to match Daybreak's own
> [[../../framework/planning/plan|planning model]] — until anything else exists, this markdown is the
> system of record.

## How to read this — the working model

Identical to Daybreak's, one tier down. Read [[building-a-feature]] for the execution rhythm; this
is the structure.

- **Task = one PR.** A cohesive, reviewable change that merges in one sitting (~200–600 lines). Not a
  commit — commits live below this resolution. **There are only a few tasks per feature.**
- **Feature = the unit of ownership.** One owner, a coherent capability, ~2–4 tasks, with explicit
  `depends on` edges. This is the atom you claim, prioritise, and advance. Features are a _flat list_;
  order emerges from dependencies.
- **Phase = an epic.** Coarse, organisational, non-gating. **This whole build is one phase: `RYW v1`.**
  Repeat audits, admin, and compliance are later features in the same epic; the V2 horizon (§Parked)
  is a separate parked phase.

- **Intent over prescription.** Each feature captures _what_ and _why_. The binding _how_ lives in the
  three spec files and in Daybreak's own framework docs. Implementation choices are made at the moment
  of work by the owner + Claude Code — **by asking Claude Code to plan the feature first** (see below).
- **Stable identifiers.** Features use semantic slugs (`ryw-module`, `ryw-shell`); tasks are `t-N`
  under their feature. Reference a feature by slug: _"let's plan ryw-module."_
- **Decisions and work-to-date are first-class** — see the logs at the end. Append, don't rewrite.

## Project

| Field              | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name               | **Reclaim Your Week** (the leaf app)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Active epic        | **RYW v1** (the whole build below)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Spec               | [[content-source]] (content, verbatim) · [[slot-spec]] (105 slots) · [[invariants]] (I1–I18, I-frame, I-composite)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Repo               | `reclaim-your-week` — fork of `human-centric-engineering/daybreak` (tracking `upstream`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Placement          | Leaf app on Daybreak. We own `lib/app/*`, the `leaf-*` hooks, `app-*.prisma`, `app/(protected)/programme/**`, `app/admin/programme/**`, `.context/app/**` — see [[../README\|.context/app/README.md]]                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Framework baseline | Daybreak Framework v1 + v1.1 — all facilitation machinery (modules, map, slots, engine, guidance, agents) shipped and available through registration seams                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Client             | Rashmir Balasubramaniam / Nsansa Ltd.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Lead               | John                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Status             | **`RYW v1` COMPLETE — all ten features shipped (F9 `ryw-repeat` #46, 2026-07-26).** An invited leader redeems a tiered invite, consents, runs the audit Phase 0 → Phase 6, leaves with a summary they can share, and comes back a quarter later to a second audit that opens by comparing with the first. Rashmir can see who is in, where they stalled, what it cost, whether people come back, what the cohort looks like anonymised, and can reword her own content without a deploy. **What remains is not features:** the open items she owes (§Open items), the parked phases, and the open [[daybreak-asks]] rows a future upstream sync lets us delete. _(Feature detail: F1 per-run provenance + `getSlotHistory`. F2 the module, 105 slots, verbatim content, third-person coach. F3 the end-to-end spike. F4 the leaf schema, the single `saveAnswer` write path (I3), the run lifecycle + reflection gate (I9/I15), the consumer shell. F5 the optional `.ics` branch, totals-only, I4 proven by smoke. F6 Phase 0/1 + the chart family + the entitlement gate. F7 Phases 2–6, the refer-back (I13), the summary + optional share. F8 tiered invites, the grant ledger, the referral unlock, versioned consent — the door actually shut. F10 the client list, the two success measures, the shared-results inbox + consent-filtered aggregate, the content editor, the erasure proof. F9 trend lines, the comparative open, the recent-audit shortcut, the quarterly nudge.)_ |

---

## Concept and intent

Rashmir's time audit currently lives as a Claude Project: a long system prompt plus three copy-paste
user prompts, run inside a Claude Pro account each user pays for themselves. It works — testers say it
"sounds like her" — but it has no accounts, no saved progress, charts that fail to render, and no way
for Rashmir to see patterns across clients.

This build turns it into a hosted, invite-gated product and is the **first real consumer of the
Daybreak framework**: the module map, per-run journey state, and slot store were built for exactly
this shape but have never run end to end for a real app. `ryw-firstlight` (F3) is where we find out
whether that is true — it is a genuine gate, not a formality.

**Three things govern every feature and must not drift** (full text in [[invariants]]):

- **The tool is not Rashmir** (I1). The _method_ is preserved in full — asking before telling, no
  verdicts, insight handed back. The _persona_ is not: it is an instrument designed by her, attributed
  in the third person, sparingly. The source system prompt is first-person; every ported line is
  re-pointed. This is the invariant most likely to regress.
- **This is not a productivity exercise** (I-frame, [[content-source]] §0). It is an invitation to a
  next level of leadership, which may mean letting go. Without this frame the tool optimises a
  calendar, which is the one thing it must not do.
- **The tool returns people to their own discernment** (I16). It offers a mirror and some options; the
  decisions stay with them. Brief §1 says this shapes every design choice.

## Relationship to Daybreak

We are the **leaf**. We build in `lib/app/**`, fill the reserved `leaf-*` hooks, add `app-*.prisma`
schema files, and register into Daybreak's seams — we never edit `lib/framework/**` or the three
bridges (`lib/app/bootstrap.ts`, `admin-nav.ts`, `db-drift.ts`). `npm run framework:boundary` enforces
the line. The one exception is **F1**, which lands two additive changes to
`lib/framework/data-slots/values.ts` as a separate, upstream-style PR — reviewed on its own, before any
leaf work depends on it. See I10.

---

## Features (epic: RYW v1)

A flat list in rough dependency order (most-ready first). Order is _emergent from `depends on`_. The
**Owner** and **Status** columns are the at-a-glance board.

| #   | Feature            | Owner | Status      | Depends on       | ~Tasks | Capability                                                                                                    |
| --- | ------------------ | ----- | ----------- | ---------------- | ------ | ------------------------------------------------------------------------------------------------------------- |
| F1  | `ryw-provenance`   | John  | **shipped** | —                | 3      | Add `runId` to slot provenance + `getSlotHistory()` (the only framework-tier change)                          |
| F2  | `ryw-module`       | John  | **shipped** | F1               | 4      | Register the module; declare 105 slots; load content verbatim; author the third-person agent                  |
| F3  | `ryw-firstlight` ★ | John  | **shipped** | F2               | 3      | The spike: boot → register → publish → stream, end to end, against real Postgres                              |
| F4  | `ryw-shell`        | John  | **shipped** | F3               | 4      | Leaf schema; single slot write-path; run lifecycle + reflection gate; consumer chat client + seven-node shell |
| F5  | `ryw-calendar`     | John  | **shipped** | F4               | 4      | Optional `.ics` branch: in-memory parse, totals-only, privacy-proven                                          |
| F6  | `ryw-current`      | John  | **shipped** | F4 (F8 for gate) | 4      | Phase 0 setup + entitlement gate; Phase 1 bucket cards + reflection; the chart family                         |
| F7  | `ryw-phases`       | John  | **shipped** | F6 (F5 optional) | 4      | Phases 2–6: energy, ideal week, gap + refer-back, action plan, summary + share                                |
| F8  | `ryw-access`       | John  | **shipped** | F4               | 4      | Tiered invites, the grant ledger, referral unlock (gates F6's run creation)                                   |
| F9  | `ryw-repeat`       | John  | **shipped** | F7               | 3      | Trend lines, comparative open, quarterly nudge, bucket relabelling                                            |
| F10 | `ryw-admin`        | John  | **shipped** | F7, F8           | 5      | Client list + access control, shared-results inbox, content editing, export + GDPR proof                      |

**Critical path:** `ryw-provenance → ryw-module → ryw-firstlight → ryw-shell → ryw-current → ryw-phases`.
`ryw-calendar` (F5) hangs off F4 and enriches F6/F7 without gating them. `ryw-access` (F8) parallels
F4–F6 and must land before F6's run-creation gate is real. `ryw-repeat` (F9) and `ryw-admin` (F10)
defer cleanly — the run index (F4), canonical slugs (F2), and grant ledger (F8) are already the seams
they need.

### Board — status & claiming

**Legend.** `shipped` — merged to `main`. `in flight` — an owner is actively building it. `available` ▲
— every dependency is shipped and no one owns it: free to claim now. `blocked → X` — waiting on X.

**Nothing in flight — `RYW v1` is complete.** All ten features are shipped (F9 `ryw-repeat` #46 was
the last, 2026-07-26). An invited leader redeems a tiered invite, consents, runs the audit Phase 0 →
Phase 6, leaves with a summary they can share, comes back a quarter later to a second audit that
opens by comparing with the first; and Rashmir can see who is in, where they stalled, what it cost,
whether people come back, what the cohort looks like anonymised, and can reword her own content
without a deploy.

**What is left is not features, and it now has its own board: [[post-v1]].** The close-out audit on
2026-07-26 found no half-built feature and no cross-feature deferral dropped — but it did find
documentation that misdescribed the codebase, privacy-critical smokes that no gate ran, and a public
surface still on the starter template. Those, plus the list Rashmir owes (below), the launch tasks,
the 17 open [[daybreak-asks]] rows and the parked epics, are tracked in `post-v1.md`. **Start there,
not here.**

**One honest caveat, worth keeping visible.** F9's value cannot be _observed_ until real leaders have
two audits weeks apart — trend lines and the comparative open are built and tested, and the first
genuine signal will be F10 t-2's return rate moving off "not enough data yet". A flat number in
month one is the calendar, not a defect.

**Solo build.** John owns every feature; the **Owner** column exists to show what is _actively in
flight_, not to allocate work. The claim step is still worth doing — it is what makes the board tell
you where you left off — but the "present the plan to the owner" gate in
[[building-a-feature]] step 1.3 is a self-review, and step 2.5's "the owner merges" is you.

**To claim a feature:** put your name in its **Owner** cell + set **Status** to `in flight`, then ask
Claude Code to write the feature's detailed plan (`.context/app/planning/<feature>.md`, following the
shape of any Daybreak `f-*.md`) and push the claim + plan as a standalone docs PR **before** starting
task work. See [[building-a-feature]] step 1.

---

## The six deliberate reconciliations against the sources

Recorded here because each is a place where a naive reading of the source docs would build the wrong
thing. Verified against the codebase and the Brief.

1. **Entitlement is enforced at run creation, not via `isModuleLive`** (I14). Daybreak's
   `isModuleLive` has an `entitlement` seam, but it is synchronous
   (`lib/framework/modules/liveness.ts`) and its only caller (`guidance/assemble.ts`) never passes the
   predicate. A grant lookup is async. The module surface is reachable only through a run the leaf
   created, so gating run creation is strictly sufficient — zero framework change. F8/F6.

2. **The tool is not Rashmir** (I1). System prompt is first-person; Brief §4 overrides the persona
   while preserving the method. Every ported line re-pointed to third person. F2.

3. **"Not a productivity exercise" is the governing frame**, not a line of tone. It changes what the
   delivery-and-operations flag and the under-delegation invitation _mean_. [[content-source]] §0, F2.

4. **The refer-back is a data flow, not a prompt** (I13). What the user said at setup about what keeps
   them up at night returns verbatim at gap analysis via a context contributor reading the run's own
   slot values — not by asking the model to remember. F7.

5. **The composite picture, not raw calendar** (I-composite). After an upload the Phase 1 chart shows
   calendar data _plus_ discursive additions, with a note where estimates differed — not calendar
   totals that silently discard the self-reported picture. F5/F6.

6. **Hours, never percentages** (I8). Forcing a total of 100 hides the overwork, which is the thing
   users most need to see. Brief §3 endorses this. Percentages may be _displayed_ as derived values;
   they are never the input. F6.

7. **Invite-gated is the v1 door, not the v1 architecture.** Brief §1 names list growth as the
   _first_ of the tool's three jobs — "it grows my email list… the success measure is not downloads;
   it is whether people come back, and whether they tell others about it unprompted" — and Brief §2
   asks that the architecture "anticipate open sign-up with email capture, because list-building is
   the commercial point". Reading only §2's opening clause ("For v1, invite-gated") builds an invite
   system with no route out of it. F8 t-4 keeps the door hinged.

---

## Feature detail

### F1 · `ryw-provenance` — slot provenance + history

_Owner:_ John · _Status:_ **shipped** (#17) · _Depends on:_ — · _~3 tasks_ · detail: [[ryw-provenance]]

The only feature that edits `lib/framework/**`. Two additive changes, landed as their own
upstream-style PR and reviewed separately before anything depends on them (I10). Without `runId` on
provenance the leaf cannot write run-scoped answers at all, and repeat audits collapse into one
another.

- **t-1** — Add optional `runId?: string` to `SlotValueProvenance` (`lib/framework/data-slots/values.ts`). Additive to an existing Json column, no migration.
- **t-2** — Add `getSlotHistory(userId, slotSlug)` returning all versions including superseded (the existing `getSlotHeads()` returns only current heads), so F9 trend lines can read run 1 and run 2 side by side.
- **t-3** — Confirm `npm run framework:boundary` passes and the diff is exactly this one file. Add the row to [[daybreak-asks]] so the next `git merge upstream/main` knows to delegate rather than carry it forever.

_Done when:_ `git diff --stat` shows one framework file; boundary + type-check green; `getSlotHistory` returns superseded versions in a unit test; the [[daybreak-asks]] row exists.

### F2 · `ryw-module` — module, content, slots, voice

_Owner:_ John · _Status:_ **shipped** (t-1 #19 · t-2/t-3 #20 · t-4 #21) · _Depends on:_ F1 (shipped #17) · _~4 tasks_

Where Rashmir's IP enters the codebase. Highest risk for silent drift, because paraphrase looks like
success. Load content, don't author it (I11).

- **t-1** — `registerModule('reclaim-audit')` from `initLeafApp()` in `lib/app/leaf-bootstrap.ts` (never the `bootstrap.ts` bridge); a `configSchema` making every coach-editable value changeable without a deploy — nine bucket titles/descriptions, benchmark ranges, hour bands, consultation email, footnote.
- **t-2** — Declare all **105** slot definitions from [[slot-spec]], exact slugs, per-bucket slots generated from the canonical list. Sensitivity as specified; nothing `special_category` (I5). The count moved 95 → 105 on 2026-07-23: reading `slot-spec.md` against `invariants.md` found **I-composite had no slot to write to** — `reclaim_current_*` holds the estimate, `reclaim_calendar_*` holds the calendar, and the composite of the two had nowhere to live, so the chart could only ever have plotted one of them. New group `reclaim_composite` (9 per-bucket + a variance note).
- **t-3** — Load content from [[content-source]] into config defaults **verbatim** — §0 frame, nine buckets, bands, footnote, phase language. No paraphrase. Plus the **second hop** of the I11 guard: a test parsing the blockquotes out of `.context/app/content-source.md` and asserting the nine bucket descriptions and the footnote are character-identical to the config defaults. The **first hop already exists** — `npm run leaf:content-diff` (in `leaf:checks`) asserts every blockquote in `content-source.md` appears verbatim in `.context/app/sources/`, and that the sources still match their SHA-256 manifest. Both hops are needed and neither substitutes for the other: config-vs-extract proves the code matches the extract and says nothing about whether the extract matches Rashmir, which is precisely how nine altered blockquotes survived to 2026-07-23.
- **t-4** — Author the agent (`Persona → systemInstructions → Guardrails → Brand Voice`): third-person (I1), banned lexicon + no em dashes + no conversational bullets (I2), scope + anti-replication guardrails ([[content-source]] §7), read-only capabilities (`get_journey_state`, `get_next_steps`, `get_state`), exposure allowlist permitting writes only to `reclaim_profile_*` (I6). Plus the invariant tests: voice, slot-sensitivity, agent-caps (in `tests/unit/invariants/`), **wired into `leaf:checks`** — the script is `exit 0` today and is the one hook CI already runs for us.

_Done when:_ all 105 slugs match the spec; bucket descriptions + footnote character-identical to source; three invariant tests pass; boundary green.

_Watch for:_ paraphrased bucket descriptions and invented slugs — diff the strings against source yourself; tests won't catch a plausible rewording.

### F3 · `ryw-firstlight` ★ — the spike

_Owner:_ John · _Status:_ **shipped** (t-1/t-2 #25 · t-3 #25) · _Depends on:_ F2 (shipped #19 #20 #21) · _~3 tasks_ · detail: [[ryw-firstlight]]

**A genuine gate.** First time boot → register → sync → publish → surface → stream runs against real
Postgres. Budget two to three unrelated framework bugs.

- **t-1** — Seed + publish the map (`prisma/seeds/app-reclaim/`): seven nodes `phase-0-setup … phase-6-summary`, `completionMode: 'repeatable'`, plain prerequisite chain, **no edge conditions** (slot conditions read the head version, which breaks on run 2). Module row `active`, coach agent `visibility: 'public'`, bound primary. `smoke:reclaim` proving one streamed turn.
- **t-2** — In the same script, assert the traps that fail silently: agent visibility is `public` (a non-public agent 404s with no diagnostic); a fresh `conversationId` is issued; no `reclaim_*` slot is `special_category`.
- **t-3** — Re-plan checkpoint. Record every framework defect in [[daybreak-asks]] with a repro, and the lesson in [[planning-retro]] §A. Re-verify the five `lib/framework/**` citations in [[invariants]] (I5, I6, I14, I15) still point at what they claim — they were exact on 2026-07-23 and will drift on syncs. **More than three framework defects → stop and re-scope F4 before building.**

_Done when:_ `db:reset && db:seed && seed:reclaim` completes; `smoke:reclaim` streams and passes all three assertions; the [[daybreak-asks]] defect rows exist; the invariant citations re-verified.

### F4 · `ryw-shell` — audit shell, chat, capture

_Owner:_ John · _Status:_ **shipped** (t-1 #27 · t-2 #28 · t-3 #29 · t-4 #30, re-landed on `main` via #32) · _Depends on:_ F3 (shipped #25) · _~4 tasks_ · detail: [[ryw-shell]]

- **t-1** — Leaf schema `prisma/schema/app-reclaim.prisma` (not `app.prisma` — that's Sunrise's). Tables `app_reclaim_{invite,grant,audit_run,bucket_label,share,report_share,feedback,consent}`; partial unique index on `(userId) WHERE status='in_progress'`; **no calendar table** (I4). Hand-written `ON DELETE CASCADE` per `userId` table (Prisma emits none without a `@relation`; read the generated SQL). Drift probes in `leaf-db-drift.ts`.
  - **`app_reclaim_consent`** carries F8 t-4: `userId`, `policyVersion`, `acceptedAt`, and a separate `marketingOptIn` boolean. Sunrise models no terms acceptance of its own (checked — the only `consent` in the schema is orchestration's cross-user conversation access, unrelated), so this has to be ours. **`onDelete: SetNull`, not `Cascade`** — unlike every other table here. A consent record is the evidence that processing was lawful; erasing it with the user destroys the proof that their data was lawfully processed while they existed. Retained config/audit, per the `CLAUDE.md` rule. That makes `userId` nullable here and nowhere else in this schema, which is the sort of asymmetry that looks like a mistake later — it is deliberate.
- **t-2** — `saveAnswer()` in `lib/app/programme/slots/write.ts`: the **only** caller of `appendSlotValue` (I3), routing through `slotMaskingPolicy` and stamping `provenance.runId`. Test (`tests/unit/invariants/write-path.test.ts`, in `leaf:checks`) asserts exactly one occurrence in the tree.
- **t-3** — Run lifecycle routes under `app/api/v1/app/reclaim/`: create (TODO marker for F6/F8 gate), transition (`assertPhaseComplete` → `422 REFLECTION_REQUIRED` when the phase's reflection slot is absent — I9), complete (`isActive:false` on the conversation — I15), answers (delegates to `saveAnswer`). Run id = journey `contextKey` = provenance `runId`; never read `contextKey` from an LLM arg (I6).
- **t-4** — First consumer SSE client (`app/(protected)/programme/`), admin chat as SSE reference only. Progress bar over all **seven** map nodes with Phase 0 labelled _Setup_ (the map is `phase-0-setup … phase-6-summary`; hiding node 0 makes "you are here" wrong on resume, which reads `UserNodeState` per node). Auto-save, resume from `UserNodeState.progress`. Plus the per-phase **signpost line** ([[content-source]] §5d, G10): entering a phase says which phase, what it involves, and roughly how long — the progress bar shows position, not duration or content. **F3 t-1 resolved the seven nodes to `stage` type** (a `module` node binds one registered `Module` and there is exactly one, reached directly by the leaf's run per I14; the phases are a progression within it — see `lib/app/programme/map.ts`), and `UserNodeState` keys on the node `key`, so the bar reads the seven `phase-*` keys directly. Shell only — no phase content yet.

_Done when:_ migration applies with cascades confirmed; write-path test passes; transition without reflection returns 422; completing sets `isActive:false`; a run can be started, left, and resumed.

### F5 · `ryw-calendar` — the optional branch

_Owner:_ John · _Status:_ **shipped** (#34, gate fixes folded in) · _Depends on:_ F4 (shipped #27–#30/#32) · _~4 tasks_ · detail: [[ryw-calendar]]

Optional, and loudly so (Brief §3). I4 is the product's trust story, not just a requirement.

- **t-1** — Add `ical.js`; `lib/app/programme/calendar/parse.ts`, pure, no DB/network, RRULE expansion. Fixture-driven tests: recurring, all-day, timezoned, multi-calendar.
- **t-2** — Upload route: raw file **never touches disk** (`formData()` → `text()` in memory); categorise via **one `runStructuredCompletion`**, never `streamChat` (which persists meeting titles); persist per-bucket totals only via `saveAnswer`; personal events excluded, ambiguous flagged with best guess + reasoning, recurring counted per instance, multi-calendar + file-size fallback ([[content-source]] §8). Test: no `streamChat` import in the path. Add a per-flow rate-limit sub-cap inside the handler — an LLM call over an uploaded file is exactly the expensive sub-flow `CLAUDE.md` carves out from the inherited 100/min section cap.
- **t-3** — Review UI: summary **by bucket**, ambiguous items listed individually to confirm — **wait for confirmation before proceeding**. Then the "what the calendar misses" questions and the task-switching profile. **The [X]/[Y]/[Z] framing is arithmetic, not copy** — X from `reclaim_calendar_total_hours`, Y from `reclaim_setup_weekly_hours`, Z the difference; a placeholder rendered literally, or a negative Z when the calendar exceeds the self-report, both read as a broken tool at the audit's most delicate moment. Handle Z ≤ 0 explicitly. Write the reconciled result to `reclaim_composite_hours__*` and the variance note (I-composite) — this task, not F6, is where the composite is computed.
- **t-4** — Both privacy messages surfaced **at** the upload step (optional; details never stored). Extend `smoke:reclaim`: after a real Google `.ics`, assert **no meeting title anywhere in the database**.

_Done when:_ parser handles all four fixture shapes; calendar-privacy test passes; smoke proves no title in DB; both messages visible at upload.

### F6 · `ryw-current` — current reality + charts

_Owner:_ John · _Status:_ **shipped** (#37) · _Depends on:_ F4 (shipped #27–#30/#32) · F8 layers tiers over the gate · _~4 tasks_ · detail: [[ryw-current]]

- **t-1** — Phase 0 setup form (warm framing, not bare fields): fields per [[content-source]] §4, first name only, role/org dropdowns, the "what keeps you up at night" and "why now" prose, quarter default. Plus the entitlement gate deferred from F4: `POST /runs` checks `app_reclaim_grant` and refuses when exhausted or expired (I14); integration test for the refusal. Opens with the "here is what we will cover" process outline verbatim ([[content-source]] §4). `<FieldHelp>` on every non-trivial field (repo rule); the hours fields accept approximations and say so (I17). Two more the coverage audit marked and never landed: **reflect the context back before moving on** — a review step confirming what was captured, which is the source's own instruction and not merely good form design; and the **atypical-week reassurance** at the audit-period field ("it's fine to do this during an atypical week", [[content-source]] §12a), which is where a leader most likely to abandon decides whether their data counts.
- **t-2** — Phase 1: show all nine buckets first (overview), then cards (eight when fundraising not relevant). **Hours per week, never percentages** (I8). Each card: hours + "what it looks like in practice". Deep-work's three extra questions. Delivery-above-15% and oversight-in-transition nuance ([[content-source]] §8). Reusable required reflection component (server enforces via 422 — I9; this is the UI half). `<FieldHelp>` on the hours and practice fields.
- **t-3** — The `<ReclaimChart>` family: standardised format, nine fixed colours, clear key, readable in light **and** dark mode, benchmark markers, over/under flags. Composite picture after upload (I-composite) — plots `reclaim_composite_hours__*` when the branch was taken, `reclaim_current_hours__*` when it was not, with the variance note rendered from `reclaim_composite_variance_note`. **The priority-gap element** — map Phase 0 priorities to buckets and flag any priority with no time against it ([[content-source]] §8, "often the most important insight"). Chart never renders interpretation (I12). **Flag the three open colour questions** as TODOs, don't silently resolve: dark-mode variants; strategic-blue vs brand-teal; and **whether the source palette actually meets Brief §3's bar** — she asks for "bright, obviously distinguishable colours", and the system prompt's own palette includes a muted purple (`#7B6D8D`) and a soft teal (`#A8DADC`) that are neither. The palette is her IP (I11) and the requirement is also hers, so this is a conflict only she can resolve; do not quietly brighten her hexes.

- **t-4** — **Bucket relabelling**, moved here from F9. Brief §3 lists user-level category customisation as a v1 amendment — "Not everyone is the head of an organisation. Users should be able to adjust category labels for their own audit, within limits" — and the audit it applies to is their _first_ one. Sequencing it with repeat audits meant the first cohort could not relabel at all. Display labels write to `app_reclaim_bucket_label` (schema already in F4 t-1); canonical `bucketSlug` is never touched (I7), so customised audits still aggregate correctly by construction, which is the other half of what Brief §3 asks for. "Within limits" is a length cap and the nine slots staying nine — relabelling is not adding or removing a bucket.

_Done when:_ setup writes every `reclaim_setup_*` / `reclaim_profile_*` slot; exhausted grant refused with a test; cards take hours; charts correct in both modes; priority-gap rendered; both colour questions flagged; a relabelled bucket renders its label and still aggregates on the canonical slug.

### F7 · `ryw-phases` — the remaining phases

_Owner:_ John · _Status:_ **shipped** (#39) · _Depends on:_ F6 (shipped #37) · F5 optional · _~4 tasks_ · detail: [[ryw-phases]]

- **t-1** — Phase 2 energy grid + Phase 3 ideal-week sliders with the gap updating live; the "suspiciously similar" challenge; current-vs-ideal chart. Perception-vs-reality is a **hard gate before Phase 2** with the off-calendar note ([[content-source]] §8). Phase 2 also carries the team-distribution brainstorm and the light coaching-conversation signal ([[content-source]] §8, Phase 2).
- **t-2** — Phase 4 gap analysis. **The refer-back** (I13): a context contributor in `lib/app/context-contributors.ts` injecting the verbatim `reclaim_setup_keeping_me_up` / `reclaim_setup_why_now` for this run. Naming the absence; the once-per-audit permission-based challenge (guarded by `reclaim_gap_challenge_offered`); the under-delegation invitation verbatim; the hours question at 55+.
- **t-3** — Phase 5 action plan: three specific entry points, what/when/stop/how-known, and "want to, or think you should?" (`reclaim_action_wanted_not_dutiful`). Journey framing verbatim, not a makeover.
- **t-4** — Phase 6 summary + share: standalone artifact ([[content-source]] §10), **downloadable** as well as shareable (the Notes' "Summary Report. Downloadable, shareable"), footnote verbatim, tokenised link. Sharing **invited, never required**. Everything optional appears **only after** they choose to share, each with "prefer not to say": the two or three demographic questions (open item 2), an **age range in broad bands**, and the one-line feedback ask — "In a sentence: what did you take from this?" with a separate **"Happy for this to be quoted anonymously"** checkbox (Brief §3). The quote consent is its own field, not implied by sharing: it is what builds Rashmir's bank of worked examples, and it governs republication rather than analysis. Consultation offer once, at the end, invitation not pitch; the distinct close for existing clients ("invite them to share their results ahead of their next session" — [[content-source]] §10), which F8's client tier makes knowable. Closing affirmation, varied.

_Done when:_ ideal sliders update live; Phase 4 quotes the Phase 0 answer verbatim from slot data; challenge fires at most once; footnote character-identical; share genuinely optional.

### F8 · `ryw-access` — invites, grants, referrals

_Owner:_ John · _Status:_ **shipped** (#41; plan #40) · _Depends on:_ F4 (shipped) · _~4 tasks_ · detail: [[ryw-access]]

Parallels F4–F6. Had to land before F6's run-creation gate was real — **it was not, before #41**:
self-signup is open and `assertEntitled` bootstrapped a free grant for any account on first run. That
bootstrap is now removed; the gate resolves a tiered invite or refuses.

- **t-1** — **Extend** `lib/utils/invitation-token.ts` + `emails/invitation.tsx` + `app/admin/users/invite/page.tsx` (don't rebuild). Add `tier` (client | standard | referral) to `app_reclaim_invite`; wire redemption to grant creation.
- **t-2** — The grant ledger: free tier = one complete audit; client tier = 12-month window starting on first use + a `mustStartBy` deadline (Brief §8); client status an admin flag. Enforced at the F6 run-creation route (I14), with the exhausted/expired test.
- **t-3** — Referral unlock: a second audit earned on the referred user's **first run completion**, not signup (Brief §8).
- **t-4** — **Signup-time capture — the commercial point and the legal basis.** Two things that only exist at account creation, and are expensive to retrofit:
  - **Consent.** Explicit acceptance of terms and privacy policy, recorded with version and timestamp. Brief §2: "everyone should be aware and agree to the terms and conditions and privacy policy, **which should allow for data to be used in aggregate**". F10 t-3's cross-client analysis has no lawful basis without this, and consent captured retroactively is not consent. The clauses themselves are Rashmir's to supply (open item 7); the capture mechanism is not blocked on them — build against a versioned policy record.
  - **Open-signup readiness.** `User.email` is already a first-class column from better-auth, so the field is not the work — the work is that **list membership is a separate fact from having an account**, and only a recorded `marketingOptIn` can distinguish "signed up for the tool" from "consented to be on Rashmir's list". Beyond that: the invite check a single gate a config flag can open, and the grant model already tier-driven (t-2), so an open-signup tier is a row rather than a refactor. Reconciliation 7. **v1 ships invite-only** — this is about not welding the door shut.
  - **The follow-up sequence seam.** Brief §2 describes a follow-up sequence for people who register. Emit the signup and first-completion events through Daybreak's hook dispatch (`.context/orchestration/hooks.md`) rather than wiring an ESP in. No sequence in v1.

_Done when:_ redeeming creates the right grant per tier; free = exactly one audit; client window starts on first use; referral fires on completion; consent version recorded per user with a test; flipping the open-signup flag creates a valid standard-tier grant without code change. **All met (#41)**, plus one thing the plan did not anticipate: redemption keys on `user.email`, and Sunrise lets any account rewrite that without re-verification, so the gate needed two extra leaf-side conditions to stop an invite being hijacked ([sunrise#466](https://github.com/human-centric-engineering/sunrise/issues/466), [[daybreak-asks]]).

### F9 · `ryw-repeat` — repeat audits

_Owner:_ John · _Status:_ **shipped** (#46; the D1 read fix #45; plan #44) · _Depends on:_ F7 (#39) · _3 tasks_ · detail: [[ryw-repeat]]

**The last feature in the epic**, and the one the product's own success measure depends on: F10 t-2
now reports how many leaders come back, and until F9 lands the second audit they come back to knows
nothing about their first.

- **t-1** — **First: fix run-scoped reads.** `readRunAnswers` reads `getSlotHeads` (heads only) and filters by `provenance.runId`, so a completed run's values vanish as soon as a later run supersedes them — which silently hollows out F7's already-shipped **public share links** the moment a leader starts audit 2 (plan D1). Then trend lines per bucket over `getSlotHistory()` (F1 t-2's read, still unused since #17), grouped by `provenance.runId`.
- **t-2** — Every repeat audit opens by comparing to the last one automatically (Brief §2). Plus the recent-audit shortcut: an audit within the last month confirms rather than re-asks stable context ([[content-source]] §4, verbatim). **Both pictures and the difference, never a verdict** (I12's sibling — a bucket that fell is not a failure).
- **t-3** — Quarterly nudge, gentle, matching the future paid cadence. Carries its own schema, a leaf email (the registry is closed to new kinds), a leaf tick route (no leaf scheduled-job seam exists), and **one-click unsubscribe without logging in** — there is no unsubscribe mechanism anywhere in the platform today.
- ~~**t-4** — Carry relabelled bucket names through trend lines and the comparative open.~~ **Collapsed into t-1** (plan D3): `ReclaimBucketLabel` is per-**user**, not per-run, so labels already carry by construction. What remains is a recorded decision (a rename applies to the whole history) and a test — a commit, not a PR.

_Done when:_ a completed run's summary and share link still render after a later run starts; trend lines show both runs; repeat opens comparatively; a relabelled bucket is one continuous series; a leader is nudged at most once per cycle and can stop it in one click without a session.

### F10 · `ryw-admin` — admin + compliance

_Owner:_ John · _Status:_ **shipped** (#43; plan #42) · _Depends on:_ F7 (#39), F8 (#41) · _~5 tasks_ · detail: [[ryw-admin]]

Admin UI under `app/admin/programme/**`; nav via `leaf-admin-nav.ts` (not the `admin-nav.ts` bridge — I10).
F8 t-1 already opened that section with the access surface; F10 fills it out rather than starting it.

- **t-1** — Client list: signed up, mid-audit, **abandoned at which phase**, never started. Invite issue/revoke, tier, client flag. (Abandonment needs a phase-progress read at the run level.) One enriched list endpoint — no per-row fetches (repo rule). Also carry the qualification signal from the setup form — Brief §2 makes the form do "double duty as qualification", and that is only useful if Rashmir can see it next to the name. Plus **cost per run**, from Sunrise's existing cost tracking: Brief §8 flags a tester who spent 4+ hours in a single audit, which is the scenario where a free tier of one audit still costs real money.
- **t-2** — **The success measures, because Rashmir named them and nothing reports them.** Brief §1: "The success measure is not downloads; it is whether people come back, and whether they tell others about it unprompted." Two numbers on the dashboard: **return rate** (users completing a second audit, which F9's run index already makes readable) and **referral conversion** (invites sent by users, and how many became completed audits — F8 t-3's unlock already tracks the second half). Without these the product cannot tell whether it is working on the terms its owner set.
- **t-3** — Shared-results inbox + cross-client aggregate patterns, anonymised (Brief §2; individual data confidential).
- **t-4** — Content editing (bucket titles, descriptions, benchmark ranges, footnote) through the `Module.config` schema from F2 — Rashmir rewords without a deploy.
- **t-5** — Data export + GDPR: verify `eraseUser()` reaches every `app_reclaim_*` row and every `framework_slot_value` row; extend `smoke:reclaim` to prove no orphans after erasure (the F4 hand-written cascades are what make this work).

_Done when:_ abandonment visible per phase; aggregate view excludes identifying data; a bucket description is editable without a deploy; erasure smoke proves no orphaned rows. **All met (#43)** — with two corrections the plan could not have known: most of the engine already existed one tier down (so F10 built the _join_, not the mechanism), and the framework's generic config form would have rendered the nine bucket descriptions as a raw JSON textarea, which is why t-4 is a leaf form posting to the framework's own endpoint ([daybreak#161](https://github.com/human-centric-engineering/daybreak/issues/161)).

---

## What the app retires

| In the Claude Project today                            | In the app                                                                                                                            |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Users buy their own Claude Pro                         | Hosted; the Anthropic API is ours. Claude only, no model choice (Brief §3)                                                            |
| 10-minute manual setup, paste the system prompt        | Gone entirely                                                                                                                         |
| Three copy-paste user prompts                          | All three become UI (F4 auto-save; F9 comparative open)                                                                               |
| Copy-paste checkpoint summaries per phase              | Auto-saved progress (F4) — but see [[content-source]] §"checkpoint decision": keep a lightweight on-screen recap, drop the copy-paste |
| "Switch to Opus at High effort"                        | Server-side model selection                                                                                                           |
| Upload previous summary to Files to compare            | Runs are in the database (F9)                                                                                                         |
| Charts that fail to render                             | `<ReclaimChart>` (F6)                                                                                                                 |
| **Nine buckets, bands, phase flow, wording, footnote** | **Preserved verbatim in `Module.config`**                                                                                             |
| **The coaching method**                                | **Preserved in full (F2)**                                                                                                            |
| **The persona "I, Rashmir"**                           | **Third-person attribution (I1)**                                                                                                     |

---

## Parked phases (future epics)

Carried so they're not lost, kept out of the active view. The grant ledger (F8), run index (F4), and
`contextKey` are the seams each of these would use.

- **The V2 time-tracking module** (Brief §9) — real-time tracking rather than recalled estimates.
- **Cohort overlays** — Daybreak's relationship/cohort overlay (framework §8), if Rashmir runs
  programmes rather than 1:1s.
- **Payments and subscriptions** — v1 is invite-gated and free; the commercial layer is a Daybreak
  adjacent component.
- **Live calendar connection** — Google/Outlook OAuth instead of `.ics` upload (Brief §3 defers it;
  privacy surface is larger).
- **The knowledge base** — Rashmir's IP, articles, and writing feeding the agent's questioning and
  reports (Brief §2 parks it until her archive is consolidated; nothing in v1 depends on it).
- **The life wheel** — a second facilitation map beyond the time audit.

---

## Open items Rashmir owes

**These are now the epic's only outstanding work.** All ten features shipped, so nothing here blocks
_building_ anything — each was built against a placeholder or behind a coach-editable config value,
exactly so her answer becomes an edit rather than a deploy. What they block is **sign-off**: the
product is complete and is not yet finished being hers.

Where a decision is involved, the shipped behaviour is named so she can see what she is confirming or
changing:

1. **Dark-mode chart variants + the strategic-blue / brand-teal collision** — F6 t-3 shipped a
   provisional brand-sympathetic palette with identity carried by direct labels, so the chart works;
   the hues are hers to rule. `#1B4965` strategic-planning blue sits close to the brand teal.
2. **The two or three optional demographic questions** — F7 t-4 ships the share capture with an age
   band only. Adding a question is a form field plus a slot, not a redesign.
3. Brand logos and which identity this sits under. **Palette now confirmed** (2026-07-24 — see
   decisions log). Primary deep teal `#0D4F68` with shade ramp `#112C36` · `#6BB4CF` · `#B8ECFF` ·
   `#E0F7FF`; secondary cream `#CCC69B` with shade ramp `#999156` · `#665E25` · `#332E08`. This
   supersedes Brief §7's `#FFFAD7` cream (the confirmed secondary is a muted khaki-cream, not the
   pale yellow). **Raleway** for headings and body, "a calm, uncluttered feel with generous white
   space. No stock-photo energy, no gradients." Still open: logos, and _which_ of her brand
   identities this sits under. The teal is also what F6.3's colour collision is against —
   `#1B4965` strategic-planning blue sits close to it.
4. Page copy for landing, Home, About, FAQs, in the reassurance register of Brief §7 (the Setup
   Guide's "no one is judging you" wording is the register — [[content-source]] §12).
5. Tester quotes and worked examples.
6. Invite list for v1.
7. Privacy and IP clauses (she has offered these). **Shipped against a versioned placeholder**:
   F8 t-4 records consent to `policyVersion` (default `draft-1`), so supplying the real text is a
   content change plus a version bump, which re-asks everyone — which is the point. F10 t-3's
   anonymised aggregate reads that consent as its lawful basis, so it is live but currently resting
   on placeholder wording.
8. Confirmation of the exact third-person register — Brief §4 notes it "may need a little refinement
   together".
9. **Decision:** checkpoint summaries — keep as an on-screen per-phase recap, or retire entirely?
   ([[content-source]] §"checkpoint decision".) F4 t-4's per-phase signpost is what shipped in their
   place; nothing is blocked either way.
10. **Decision:** where does the strategy mirror sit? Brief §5 offers "If a stranger read your
    calendar, what would they say your priorities are?" and then hedges — "though this could be in a
    follow up audit". Run 1, repeat audits only, or both? **Shipped behind `Module.config`
    `strategyMirror`, default off.** Now that F9 exists, "repeat audits only" is genuinely available
    as an answer rather than hypothetical.
11. **Decision:** does the Phase 2 coaching signal survive Brief §2? **Shipped behind
    `Module.config` `phase2CoachingSignal`, default off.** The system prompt tells Phase 2
    to "signal that a dedicated coaching conversation with Rashmir can go much further here"; Brief
    §2 says consultation offers appear "at the end and in follow-up, never mid-process", and Phase 2
    is mid-process. Either the Brief retired the signal, or a depth-of-topic remark is not a
    consultation offer. ([[content-source]] §8, Phase 2.)

---

## How features and tasks work

Identical to Daybreak's model — see [[../../framework/planning/plan#How features and tasks work|the framework plan]]
and [[building-a-feature]]. In short: a **task is one
PR** (not one commit); a **feature is one owner** and ~2–4 tasks; **there are only a few tasks per
feature**; indicative `t` bullets become promoted `t-N` rows (id, files, deps, status, PR) when the
owner writes the feature's detailed plan.

### Asking Claude Code to plan a feature

> "Let's plan **ryw-current**. Read `.context/app/planning/plan.md` for intent, `../invariants.md`
> (I1–I18, I-frame, I-composite), the relevant parts of `../content-source.md` and
> `../slot-spec.md`, and the source docs it cites. Then reconcile against the current repo and
> propose the promoted-task breakdown for review."

Claude Code reads this doc for intent and the spec files for the binding _how_, reconciles against the
actual tree (the Daybreak features it consumes are all shipped — verify their seams exist), and
produces the feature's detailed plan + promoted tasks for review **before** building. This mirrors
Daybreak's own plan-first discipline.

---

## Decisions log

Append-only. Newest at the top.

- **2026-07-24 — Brand palette confirmed with full shade ramps (open item 3, palette part).**
  Rashmir turned the working brand direction into a concrete two-colour system with ramps.
  **Primary teal `#0D4F68`** — shades `#112C36` (darkest), `#6BB4CF`, `#B8ECFF`, `#E0F7FF`
  (lightest). **Secondary cream `#CCC69B`** — shades `#999156`, `#665E25`, `#332E08` (darkest).
  This **supersedes Brief §7's `#FFFAD7` cream**: the confirmed secondary is a muted khaki-cream,
  not the pale yellow the plan had recorded. The lighter teal shades (`#B8ECFF`, `#E0F7FF`) give
  the dark-mode chart work (open item 1, F6.3) material to build against — but the **nine-bucket
  chart palette is her separate IP (I11) and is untouched by this**: F6 t-3's three colour
  questions still stand. Open item 3 now narrows to logos + which brand identity this sits under.
  Lands in the `NEXT_PUBLIC_*` brand env plus `app/brand-theme.css` and
  `components/brand/brand-mark.tsx` when the brand work builds — not by editing `lib/brand.ts`
  (leaf-fork rule).

- **2026-07-23 — Full end-to-end read of every app doc; ten findings, four of them self-inflicted.**
  The previous entries were written from targeted reads and greps. Reading all eight docs end to end
  against the checked-in sources found what partial reads had missed. **The root cause is
  methodological and now recorded in [[coverage-audit]]:** Part 1 audited the system prompt
  instruction by instruction; Part 2 audited the Brief in a ten-row table, one row per section. Six
  Brief items marked "✅ Captured" at section grain were not captured at all. [[coverage-audit]] now
  carries a **Part 2 revisited** section redoing the Brief at instruction grain, and its header no
  longer claims completeness it lacks.
  **The most serious finding was in neither part: I-composite had no slot to write to.** The
  instruction was captured and the invariant written, but `slot-spec.md` had `reclaim_current_*` and
  `reclaim_calendar_*` and nothing for the composite of the two — so the Phase 1 chart could only
  ever have plotted one of them, which is precisely what the invariant forbids. New `reclaim_composite`
  group; **slot count 95 → 105**. Also landed: her **landing line** and the **five reassurance
  statements of Brief §7** (only the Setup Guide version had been ported, losing "it's fine to do
  this during an atypical week" — the reassurance most likely to stop someone abandoning);
  **success measures** she named explicitly and nothing reported (return rate, referral conversion —
  F10 t-2); **cost per run** (she flags a 4-hour tester session, F10 t-1); the **"bright, obviously
  distinguishable colours" conflict** with her own muted palette, flagged for her rather than
  resolved; the Phase 0 **reflect-context-back** review step and the **[X]/[Y]/[Z] arithmetic**, both
  unnumbered ✗ items no task had picked up; and the **working title's presence in 105 slugs and eight
  tables** recorded as a deliberate decision rather than an accident.
  Four were mine, from the previous entry: `app_reclaim_consent` had no table under a requirement I
  wrote; F8 t-4 claimed email needed to become first-class when `User.email` already is; and
  `building-a-feature.md` and `.context/app/README.md` still described the one-hop I11 guard.

- **2026-07-23 — Source documents checked in; drift found and corrected; four intent gaps closed.**
  The five originals now live in [`.context/app/sources/`](../sources/README.md), byte-identical and
  read-only behind a SHA-256 manifest, and `npm run leaf:content-diff` (wired into `leaf:checks`,
  which was `exit 0`) asserts every blockquote in [[content-source]] appears verbatim in one of them.
  **Nine of seventy blockquotes had drifted**, three materially — the perception-vs-reality example
  had moved from delivery-and-operations to strategic planning, the three calendar walkthroughs were
  labelled verbatim but partly invented, and the 55-hours line was a synthesis. All corrected; the
  duplicated completeness question merged. **The F2 t-3 guard was one hop short**: comparing
  `content-source.md` to `Module.config` proves the code matches the extract and nothing about
  whether the extract matches Rashmir. It now runs `sources/` → `content-source.md` → config.
  Separately, re-reading the Brief end to end against the board found four things the plan had not
  absorbed: **email capture and open-signup readiness** (Brief §1 names list growth as the tool's
  first job; reconciliation 7, F8 t-4), **consent capture at signup** (F10's aggregate analysis had
  no lawful basis; F8 t-4), **bucket relabelling moved F9 → F6** (Brief §3 lists it as a v1
  amendment and it applies to a user's _first_ audit), and **the brand direction she already gave**
  (`#0D4F68` teal, `#FFFAD7` cream, Raleway, no gradients — open item 3 had treated the palette as
  unknown). Two conflicts the spec had quietly settled are now hers to rule on: the strategy
  mirror's placement (open item 10) and whether the Phase 2 coaching signal survives Brief §2's
  "never mid-process" (open item 11).

- **2026-07-23 — Reconciliation pass before implementation.** Landing the docs in the repo surfaced
  work the plan had not absorbed. Decided: **I-composite** is a real invariant and now exists (it was
  cited twice and never written). **Task references** repointed to tasks that exist (F6.5 → F7 t-2,
  F2.5 → F2 t-4, F8 → F9 t-1). **Invariant tests live in `tests/unit/invariants/`** and are wired into
  `leaf:checks`, matching the repo's `tests/unit/**` convention and the existing
  `eslint-app-boundary.test.ts` precedent — a doc-only invariant is not an invariant. **I11 gets a
  mechanical guard** in F2 t-3 (parse `content-source.md`, assert character-identity) because both the
  invariants and the rhythm doc say tests will not otherwise catch paraphrase. **`programme` is the
  surface, `reclaim` is the module** (see [[../README|.context/app/README.md]]) — the Parked life-wheel
  makes that split load-bearing, not drift. **The progress bar shows all seven map nodes** with Phase 0
  as Setup, because resume reads `UserNodeState` per node. **[[daybreak-asks]] opened** — F1 edits a
  Daybreak-owned file, and without a ledger that either conflicts or becomes permanent divergence on
  the next sync. Four unnumbered coverage-audit items (Phase 2 brainstorm + coaching signal, Phase 3
  "realistic target", Phase 6 existing-client close) folded into [[content-source]]. The repo's own
  rules (FieldHelp, upload rate-limit sub-cap, one enriched list endpoint) written into the features
  that hit them.

- **2026-07-23 — Plan opened; ten features under one epic (`RYW v1`).** The build is broken into large
  features with a few tasks each, mirroring Daybreak's flat-feature model one tier down. Six
  reconciliations against the source docs recorded above (entitlement-at-run-creation, third-person
  persona, the "not a productivity exercise" frame, refer-back-as-data-flow, composite-picture,
  hours-not-percentages). The three spec files ([[content-source]], [[slot-spec]], [[invariants]]) are
  the system of record for content, data shape, and rules; this plan is the build breakdown. F1 is the
  only framework-tier change and lands first as its own PR.

---

## Work completed to date

Append-only. Newest at the top.

- **2026-07-26 — F9 `ryw-repeat` shipped (#46; the D1 read fix #45; plan + F10 close-out #44). `RYW
v1` is complete — all ten features.** The feature that makes coming back worth doing, and therefore
  the one Brief §1's success measure was always pointing at. **Three tasks, not four:** t-4 collapsed
  into t-1 at planning because `ReclaimBucketLabel` is per-**user**, so a relabel already carried
  across audits by construction. t-1: per-bucket trend lines over every version stamped with a
  `provenance.runId` — the read **F1 t-2 added in #17 and which had no consumer for nine features**;
  small multiples rather than nine overlaid lines (the F6 t-3 colour lesson), gaps breaking the line
  rather than reading as zero. t-2: the comparative open, and [[content-source]] §4's recent-audit
  shortcut loaded verbatim into `Module.config` and guarded in the I11 hop-2 test — a **pre-fill,
  never a data copy**, so confirming re-writes every value under the new run's id (I3). t-3: the
  quarterly nudge — `app_reclaim_nudge`, the selection rules as pure functions, a leaf email (the
  registry cannot take a new kind — sunrise#468), an admin tick route for external cron (no leaf
  scheduled-job seam — sunrise#469), and **one-click unsubscribe with no login**, because a leader
  who has stopped using the product must not have to get back into it to make the email stop.
  **The planning pass found a live bug in shipped code and it shipped first, as #45:**
  `readRunAnswers` filtered slot _heads_ by `runId`, which is correct until a leader has two audits —
  and then silently emptied the first one, including **the public share link F7 invites them to send
  to a colleague**. Nobody was told. `getSlotHistory` had been waiting for exactly that since F1.
  **The gate suite found nine more, two of which were features that did not work as described:** the
  comparison's "Now" column could never populate (Phase 1 holds hours in local state and unmounts on
  submit), and the nudge had no upper bound, so the first tick would have mailed every dormant leader
  a note claiming their audit was "about three months ago". A duplication finding had already caused a
  third bug — four implementations of "hours per bucket" had drifted and two had lost the
  conditional-bucket guard, so a leader who said fundraising was irrelevant then uploaded a calendar
  saw "Fundraising · 0h"; consolidated into one `bucketHours()`. Plus: Postgres sorts NULLs **first**
  on `desc`, so a completed run with no `completedAt` outranked every real one and showed the oldest
  audit as "last time". `/security-review` found nothing at threshold. **The governing discipline
  across all three tasks was I12's sibling** — the comparison shows what changed and says nothing
  about whether that is good; a quarter spent deliberately on the team is a success a valenced chart
  would draw as failure. **This closes the epic.**

- **2026-07-25 — F10 `ryw-admin` shipped (#43; plan + F8 close-out #42; gate fixes folded in). Both
  sides of the product now exist.** All five tasks in one branch. **The finding that shaped the
  feature came at planning:** `plan.md` sized F10 as five build-it-yourself tasks, and Daybreak had
  already shipped the engine for most of it — `getMapHeat()`'s per-node drop-off _is_ "abandoned at
  which phase", plus a journey explorer, module engagement stats, and a config form with version
  history and an audit trail. **So F10 built the join, not the engine**: one row per leader stitching
  framework progress onto tier, invite provenance, consent and qualification, which no generic
  surface can know. The mirror image bit too — that same config form would have handed Rashmir her
  nine bucket descriptions as a **raw JSON textarea** (its Zod→descriptor walker is bounded to flat
  primitives and our content is arrays), so t-4 is a leaf form posting to the framework's own
  endpoint, keeping validation, `ModuleVersion` snapshots and the audit entry upstream
  ([daybreak#161](https://github.com/human-centric-engineering/daybreak/issues/161)). t-1: the client
  list, with the two `sensitive` setup slots withheld **at the API level** rather than by CSS (I5,
  D5) and a `conversationId` column so chat cost is attributable at all. t-2: the two measures Brief
  §1 named and nothing reported — return rate computed from **completed runs**, not the framework's
  `returningUsers`, which counts module entries; denominators always on screen, an empty cohort
  reading "not enough data yet" rather than 0% (I12 applied to the operator's own dashboard). t-3:
  the shared-results inbox and a consent-filtered, cohort-floored aggregate over numbers and
  canonical slugs only (I7). t-4: the content editor, every field marked _matches the source_ or
  _edited_ — because from here the words users read live in the database, where the I11 guard cannot
  reach; **I11 gained a paragraph** saying a coach-edited field with a version behind it is her
  revision and a diverged _default_ is the breach. t-5: `smoke:reclaim-erasure` finally covers
  `framework_slot_value`, where the audit answers actually live and which no smoke had ever proven
  erases, plus a subject-access export whose completeness is pinned to the schema
  ([sunrise#467](https://github.com/human-centric-engineering/sunrise/issues/467)). **The gate suite
  earned its keep on derived numbers, exactly where [[planning-retro]] §B says to expect it:**
  "stalled" was computed from `ReclaimAuditRun.updatedAt`, a real `@updatedAt` that is **never
  written while a leader works** — so a leader answering steadily for six weeks read as _Stalled,
  last active 1 June_, the most engaged person in the cohort flagged as the one to chase; the
  aggregate ranked fundraising as the most-neglected bucket because it is **conditional** and
  everyone never shown it counted as a zero; the aggregate read heads per _user_ rather than per
  completed audit; the list showed the newest grant rather than the live one, displaying a paying
  client as tier _Referral_ with no expiry; and a config parse failure fell back to schema defaults
  and then **wrote** them, so rewording a bucket could have reset `openSignup`. `/security-review`
  found no High or Medium, but two of its three notes were places a **comment claimed more than the
  code did** — including an `isAdminSupport` guard that covered the flag and not the cross-user reads
  that never mention it. Also fixed `smoke:reclaim-calendar`, red on `main` since #41 (F8 closed the
  consent gate in front of `createRun` and that smoke was not among the three #41 ran). Unblocks
  nothing new — **F9 `ryw-repeat` is the last feature standing** and is claimed next
  ([[ryw-repeat]]).

- **2026-07-25 — F8 `ryw-access` shipped (#41; plan #40; gate fixes folded in). The product is now
  actually invite-only.** It was not before this branch, and that gap — every document saying
  "invite-gated" while self-signup stayed open and F6's gate minted a free grant to anyone who asked
  — was the feature's first finding, not its premise ([[planning-retro]] §B). All four tasks in one
  branch. t-1: `app_reclaim_invite` becomes the leaf's **tier ledger beside** Sunrise's invitation
  flow rather than instead of it (I10 — the plan's "extend `lib/utils/invitation-token.ts`" was a
  tier-boundary error caught at planning); account creation stays core's, we store the token's
  **SHA-256** and never the plaintext, re-issue rotates the standing row, and the admin surface sits
  under `app/admin/programme/access` via `leaf-admin-nav.ts` with a leaf invitation email in the Brief
  §7 register (core's "excited to have you on board" is the wrong voice — I1/I2). t-2: **the gate
  closes** — no live grant → resolve a live invite → mint the tiered grant → otherwise refuse.
  Redemption is **lazy**, at the run-creation gate, because Sunrise has no fork seam at account
  creation (sunrise#464); client tier is **window**-bounded, not count-bounded (Brief §8), both
  durations coach-editable in `Module.config`; the three refusals are product copy, no pitch and no
  blame (I16/I17). t-3: the referral unlock fires on the referred leader's **first completion**, never
  their signup, with its own rate-limit sub-cap and a ceiling on outstanding invitations. t-4:
  versioned consent captured at the programme door and enforced beside entitlement, with a
  **separate, unticked** marketing opt-in — list membership is not the same fact as having an account;
  open-signup readiness is a config value shipped **off**; the follow-up-sequence seam is a local
  emitter because `HOOK_EVENT_TYPES` is closed to leaf events (sunrise#465). **The gate suite's
  biggest catch yet, and it was a hole this feature introduced:** `/security-review` found redemption
  keyed on `user.email` while `PATCH /api/v1/users/me` lets any account rewrite its address with **no
  re-verification and without clearing `emailVerified`** — a standard-tier account could rename itself
  to a pending client invite's address, take 12 months of unlimited audits, and lock the intended
  recipient out. Fixed leaf-side (no unconsumed invitation token may remain for the address, and the
  account must not predate the invitation) and filed as
  [sunrise#466](https://github.com/human-centric-engineering/sunrise/issues/466) — it affects any fork
  keying access on email. `/code-review` added four more: a `ConsentGate` fetch loop, "12 months" as
  12 × 30 days (closing a client's window five days early), four hand-rolled envelope parsers
  consolidated into one `access/actions.ts` (the F4 t-4 drift lesson again), and an existing account
  being unreachable by invite while the refusal copy promised otherwise. [[planning-retro]] §B
  predicted F6's TOCTOU shape would recur here: every mint is keyed deterministically (`invite_` /
  `referral_` / `standard_` / `regrant_`) and `smoke:reclaim-access` proves two concurrent first-runs
  mint exactly one grant against real Postgres. Unblocks **F10 `ryw-admin`**, claimed next
  ([[ryw-admin]]); F9 `ryw-repeat` stays `available` ▲.

- **2026-07-25 — F7 `ryw-phases` shipped (#39; close-out #38; gate fixes folded in). The critical
  path is complete.** `ryw-provenance → ryw-module → ryw-firstlight → ryw-shell → ryw-current →
ryw-phases` — a leader can now run the whole audit, Phase 0 to Phase 6, and leave with a summary.
  All four tasks in one branch (owner's call, as F5/F6). t-1: the Phase 2–5 panels, each ending in a
  server-enforced reflection (I9) with `AdvanceControls` surfacing the `422 REFLECTION_REQUIRED`
  distinctly; Phase 3's ideal week updates the gap live and carries the "suspiciously similar" gentle
  challenge, hours not percentages (I8). t-2: **the refer-back (I13)** — the leader's own
  `reclaim_setup_keeping_me_up` / `why_now` returned **verbatim from run-scoped slot data**, both in
  the Phase 4 UI and as a chat context contributor in `lib/app/context-contributors.ts`. The
  reconciliation the plan flagged held: `request.userId` **is** populated on the module surface, so no
  [[daybreak-asks]] row was needed. t-3: open items 10 and 11 gated behind two coach-editable
  `Module.config` toggles (`strategyMirror`, `phase2CoachingSignal`), **default off** — config, not
  feature-flag machinery. t-4: `buildSummary` assembles the standalone artifact **shareable-safe by
  construction** (only §10 fields — it never reads the sensitive-prose slugs, asserted in
  `summary.test.ts`), with the tokenised public link `/summary/[token]`, the optional coach-share, and
  the feedback line with its **separate** quote consent (Brief §3). `GET /api/v1/app/reclaim/shared/[token]`
  is the app's one unauthenticated endpoint — a 244-bit random token is the authorisation, looked up
  on a unique index. **The gate suite earned its keep again, this time on idempotence rather than
  correctness:** `/code-review` found `createShare` duplicating rows on re-save (neither share table
  has a unique constraint) and Phase 3/4 rendering a false 0h picture when the answers fetch failed —
  which could also re-fire the once-per-audit challenge (I16). Both fixed in `f930740`; a follow-up
  consolidated three drifting copies of the hours parser into one test-pinned helper (`40a326e`).
  Unblocks **F9 `ryw-repeat`**; **F8 `ryw-access`** claimed next ([[ryw-access]]), and its first
  finding is that the product is not actually invite-gated yet.

- **2026-07-25 — F6 `ryw-current` shipped (#37; close-out #36; gate fixes folded in).** The first
  feature to put real audit **content** on screen — Phase 0 (context) and Phase 1 (current reality),
  drawn back as the `<ReclaimChart>` family. All four tasks in one PR. t-1: the §4a process outline
  **verbatim** (added to `content.ts` with a hop-2 guard), the ten questions as a warm short form,
  the reflect-context-back review (§4), the atypical-week reassurance (§12a); and the **entitlement
  gate (I14)** — reads `ReclaimGrant`, **bootstraps a free-tier grant on first run** and enforces one
  complete audit (the least-risky path John chose; F8 layers tiers over the same gate). t-2: Phase 1
  nine-bucket overview → cards (hours, I8), deep-work's three questions, fundraising hidden unless
  relevant, the reusable reflection (I9 UI half). t-3: `<ReclaimChart>` — labelled bars, a **provisional
  brand-sympathetic palette** (leaf-owned, Rashmir's IP untouched, validated via the dataviz checker,
  identity carried by direct labels), benchmark markers, light/dark, table view, composite-vs-current
  (I-composite, plotted not recomputed), the priority-gap (§8), no interpretation (I12). t-4: bucket
  relabelling (`ReclaimBucketLabel`, canonical slug untouched, I7). **The `pr-gates` pass earned its
  keep again:** `/security-review` **and** `/code-review` both independently caught an **entitlement
  bootstrap TOCTOU race** (a double-click could mint two free grants → two audits), fixed with a
  deterministic primary key (idempotent, no migration); plus a negative-hours clamp and reuse dedup.
  The chart colours are provisional per John's steer — the three colour questions (open items 1 & 3)
  stay Rashmir's to rule. Full suite green (22,158); `next build` 197/197. Unblocks **F7 `ryw-phases`**,
  which finishes the critical path ([[ryw-phases]]).

- **2026-07-25 — F5 `ryw-calendar` shipped (#34; docs/close-out #33; gate fixes folded in).** The
  optional `.ics` reality-check, built to honour **I4** (the calendar never persists per-event data) as
  a structural fact, not a promise. All four tasks landed in one PR (owner's call): the pure in-memory
  parser with RRULE expansion (`ical.js`); the categorise + upload path — one `runStructuredCompletion`
  (never `streamChat`) via the coach agent's provider, task-switching metrics computed in code,
  per-bucket totals persisted through `saveAnswer` only; the review UI + the composite (I-composite,
  computed here, plotted by F6); and the two privacy messages + `smoke:reclaim-calendar` proving no
  meeting title anywhere in the DB. **No calendar table, no file on disk, no `streamChat`.** The
  `pr-gates` pass earned its keep: `/code-review` found a real parser bug (an open-ended RRULE anchored
  to an old DTSTART dropped its current occurrences) and a stale-slot bug on re-upload (both fixed with
  tests; write-all-nine), and a security-review nudge hardened I4 further (the LLM `reasoning` on
  ambiguous items is shown but never persisted). One Sunrise-core defect found earlier (F4) was filed
  as [sunrise#461](https://github.com/human-centric-engineering/sunrise/issues/461); F5 added no new
  framework asks. Unblocks nothing new (F6/F8 already open), but **F6 t-3 now has the composite to
  plot**. F6 `ryw-current` claimed next ([[ryw-current]]).

- **2026-07-25 — F4 `ryw-shell` shipped (#27 #28 #29 #30, re-landed on `main` via #32).** The feature
  that turns "the coach can talk" into "a leader can start an audit, answer, leave, and resume". t-1
  (#27) landed the leaf schema `prisma/schema/app-reclaim.prisma` — all eight `app_reclaim_*` tables
  (scope-decision A: land the whole schema now), hand-written `ON DELETE` per `userId` table (CASCADE
  for personal data, `SET NULL` for `consent`), drift probes in `leaf-db-drift.ts`, **no calendar
  table** (I4). t-2 (#28) landed `saveAnswer()` as the **sole** caller of `appendSlotValue` (I3), with
  the write-path grep guard in `leaf:checks`. t-3 (#29) landed the run lifecycle routes under
  `app/api/v1/app/reclaim/` — create (with the F6/F8 entitlement TODO), transition (`422
REFLECTION_REQUIRED` when the leaving phase's reflection slot is absent, I9), complete
  (`isActive:false`, I15), answers (delegates to `saveAnswer`) — plus the leaf-created `UserJourney`
  row (daybreak#159). t-4 (#30) landed the first consumer surface (`app/(protected)/programme/`): the
  seven-node progress shell (Phase 0 = Setup), the per-phase signpost line (§5d), and the consumer SSE
  coach client. **Process note:** #30 was first merged into the t-3 _branch_ rather than `main`, so
  t-4 was briefly stranded off `main`; caught at close-out and re-landed via **#32**, which also added
  `journey.ts`/`signposts.ts` unit tests, the programme `loading.tsx` boundary, and a coach-chat SSE
  robustness fix (shared parser + `content_reset`/budget-abort handling + abort-on-unmount) from
  `/code-review`. One Sunrise-core defect surfaced (the shared client SSE schema omits
  `budget_exceeded_per_turn`) — logged in [[daybreak-asks]]. Unblocks **F5, F6, and F8 in parallel**;
  F5 `ryw-calendar` claimed next ([[ryw-calendar]]).

- **2026-07-24 — F3 `ryw-firstlight` ★ shipped (#25).** The spike: `boot → register → sync → publish
→ resolve surface → stream` ran end to end against real Postgres for the first time. t-1 seeded and
  published the seven-`stage`-node journey map (`lib/app/programme/map.ts`), activated the module, and
  bound the coach agent `public`/primary, with `smoke:reclaim` proving one streamed turn; t-2 added the
  three silent-failure traps (agent visibility, no `special_category` slot per I5, fresh-vs-resume
  conversation per I15); t-3 was the re-plan checkpoint. **Zero framework bugs** — the budgeted two-to-
  three did not appear and the `>3 → re-scope F4` circuit-breaker did not trip. Two seam-ergonomics gaps
  surfaced instead (a leaf seed must replicate the boot chain; the ESLint ban does not exempt leaf
  seeds), both filed as [[daybreak-asks]] daybreak#157/#158, neither framework code carried. The
  node-type question resolved to `stage` (one module, reached directly by the leaf's run per I14; the
  phases are a progression within it). The I5/I6/I14/I15 `lib/framework/**` citations were re-verified
  and are all still exact. Unblocks F4 `ryw-shell`.

- **2026-07-24 — F2 `ryw-module` shipped (#19, #20, #21).** Rashmir's IP is now in the codebase:
  `registerModule('reclaim-audit')` from `initLeafApp()` with a coach-editable `configSchema` (t-1,
  #19); all **105** slot definitions from [[slot-spec]] and the verbatim `Module.config` content
  loaded from [[content-source]] with the I11 hop-2 character-identity guard (t-2/t-3, #20); the
  third-person coach agent (I1) with banned-lexicon guardrails, read-only capabilities and the
  `reclaim_profile_*`-only exposure allowlist (I6), plus the three invariant tests — `voice`,
  `slot-sensitivity`, `agent-caps` — wired into `leaf:checks` (t-4, #21). No DB, no UI: pure
  registration and unit tests on `happy-dom`. Unblocks F3 `ryw-firstlight`, the end-to-end spike, which
  is now in flight ([[ryw-firstlight]]).

- **2026-07-24 — F1 `ryw-provenance` shipped (#17).** The two additive framework-tier changes to
  `lib/framework/data-slots/values.ts` — optional `runId?` on `SlotValueProvenance` and
  `getSlotHistory(userId, slotSlug)` (superseded versions alongside the heads `getSlotHeads()` returns).
  Additive and back-compatible, no migration; unit test extended; `framework:boundary` green. Filed
  upstream as [[daybreak-asks]] daybreak#156 to delegate on the next sync. Unblocks F2 `ryw-module`.
  This was the only feature that edits `lib/framework/**` (the I10 exception).

---

## References

- [[../sources/README|.context/app/sources/]] — **the authority.** Rashmir's five original documents,
  byte-identical and read-only behind a SHA-256 manifest. Everything else derives from these.
- [[content-source]] — the working extract of `sources/` (the nine buckets, bands, phase language,
  voice rules, footnote). Load it; never paraphrase it (I11). `npm run leaf:content-diff` proves it
  against the originals.
- [[slot-spec]] — the 105 slot definitions, exact slugs, dataType, sensitivity.
- [[invariants]] — I1–I18 plus I-frame and I-composite, the rules that don't survive between
  sessions on their own. Read before any task.
- [[coverage-audit]] — the instruction-by-instruction audit of the source docs (carries / becomes UI /
  retired / gap), showing what each feature must honour.
- [[daybreak-asks]] — framework-tier changes we carry and defects we find, so a Daybreak sync knows
  what to delegate. F1 opens it.
- [[../../framework/planning/plan|Daybreak plan]] — the framework board this mirrors; every feature we
  consume is shipped there.
- [[building-a-feature]] — the execution rhythm for this tier (read before starting a feature).
- [[planning-retro]] — process lessons; read before planning, append after shipping.
- [[../../framework/planning/building-a-feature|Daybreak's building-a-feature.md]] — the tier-below sibling this mirrors.
- [[../README|.context/app/README.md]] — the three-tier ownership model; what the leaf may edit.
