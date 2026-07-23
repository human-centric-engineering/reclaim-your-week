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

| Field              | Value                                                                                                                                                                                                                   |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name               | **Reclaim Your Week** (the leaf app)                                                                                                                                                                                    |
| Active epic        | **RYW v1** (the whole build below)                                                                                                                                                                                      |
| Spec               | [[content-source]] (content, verbatim) · [[slot-spec]] (95 slots) · [[invariants]] (I1–I18, I-frame, I-composite)                                                                                                       |
| Repo               | `reclaim-your-week` — fork of `human-centric-engineering/daybreak` (tracking `upstream`)                                                                                                                                |
| Placement          | Leaf app on Daybreak. We own `lib/app/*`, the `leaf-*` hooks, `app-*.prisma`, `app/(protected)/programme/**`, `app/admin/programme/**`, `.context/app/**` — see [[../README\|.context/app/README.md]]                   |
| Framework baseline | Daybreak Framework v1 + v1.1 — all facilitation machinery (modules, map, slots, engine, guidance, agents) shipped and available through registration seams                                                              |
| Client             | Rashmir Balasubramaniam / Nsansa Ltd.                                                                                                                                                                                   |
| Lead               | John                                                                                                                                                                                                                    |
| Status             | **`RYW v1` in flight — nothing shipped yet.** F1 (`ryw-provenance`) is the first to build; it is the only feature that touches `lib/framework/**` and lands as its own upstream-style PR before anything depends on it. |

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

| #   | Feature            | Owner | Status          | Depends on       | ~Tasks | Capability                                                                                                    |
| --- | ------------------ | ----- | --------------- | ---------------- | ------ | ------------------------------------------------------------------------------------------------------------- |
| F1  | `ryw-provenance`   | —     | **available** ▲ | —                | 3      | Add `runId` to slot provenance + `getSlotHistory()` (the only framework-tier change)                          |
| F2  | `ryw-module`       | —     | blocked → F1    | F1               | 4      | Register the module; declare 95 slots; load content verbatim; author the third-person agent                   |
| F3  | `ryw-firstlight` ★ | —     | blocked → F2    | F2               | 3      | The spike: boot → register → publish → stream, end to end, against real Postgres                              |
| F4  | `ryw-shell`        | —     | blocked → F3    | F3               | 4      | Leaf schema; single slot write-path; run lifecycle + reflection gate; consumer chat client + seven-node shell |
| F5  | `ryw-calendar`     | —     | blocked → F4    | F4               | 4      | Optional `.ics` branch: in-memory parse, totals-only, privacy-proven                                          |
| F6  | `ryw-current`      | —     | blocked → F4    | F4               | 4      | Phase 0 setup + entitlement gate; Phase 1 bucket cards + reflection; the chart family                         |
| F7  | `ryw-phases`       | —     | blocked → F6    | F6 (F5 optional) | 4      | Phases 2–6: energy, ideal week, gap + refer-back, action plan, summary + share                                |
| F8  | `ryw-access`       | —     | blocked → F4    | F4               | 4      | Tiered invites, the grant ledger, referral unlock (gates F6's run creation)                                   |
| F9  | `ryw-repeat`       | —     | blocked → F7    | F7               | 4      | Trend lines, comparative open, quarterly nudge, bucket relabelling                                            |
| F10 | `ryw-admin`        | —     | blocked → F7    | F7, F8           | 4      | Client list + access control, shared-results inbox, content editing, export + GDPR proof                      |

**Critical path:** `ryw-provenance → ryw-module → ryw-firstlight → ryw-shell → ryw-current → ryw-phases`.
`ryw-calendar` (F5) hangs off F4 and enriches F6/F7 without gating them. `ryw-access` (F8) parallels
F4–F6 and must land before F6's run-creation gate is real. `ryw-repeat` (F9) and `ryw-admin` (F10)
defer cleanly — the run index (F4), canonical slugs (F2), and grant ledger (F8) are already the seams
they need.

### Board — status & claiming

**Legend.** `shipped` — merged to `main`. `in flight` — an owner is actively building it. `available` ▲
— every dependency is shipped and no one owns it: free to claim now. `blocked → X` — waiting on X.

**Claimable right now (▲):** **F1 `ryw-provenance`** only. Everything else is blocked on the critical
path until F1 → F2 → F3 clear. Once F4 ships, **F5, F6, and F8 all become claimable in parallel** (F6
needs F8's grant table for its gate, so coordinate if both are in flight).

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

_Owner:_ — · _Status:_ **available** ▲ · _Depends on:_ — · _~3 tasks_

The only feature that edits `lib/framework/**`. Two additive changes, landed as their own
upstream-style PR and reviewed separately before anything depends on them (I10). Without `runId` on
provenance the leaf cannot write run-scoped answers at all, and repeat audits collapse into one
another.

- **t-1** — Add optional `runId?: string` to `SlotValueProvenance` (`lib/framework/data-slots/values.ts`). Additive to an existing Json column, no migration.
- **t-2** — Add `getSlotHistory(userId, slotSlug)` returning all versions including superseded (the existing `getSlotHeads()` returns only current heads), so F9 trend lines can read run 1 and run 2 side by side.
- **t-3** — Confirm `npm run framework:boundary` passes and the diff is exactly this one file. Add the row to [[daybreak-asks]] so the next `git merge upstream/main` knows to delegate rather than carry it forever.

_Done when:_ `git diff --stat` shows one framework file; boundary + type-check green; `getSlotHistory` returns superseded versions in a unit test; the [[daybreak-asks]] row exists.

### F2 · `ryw-module` — module, content, slots, voice

_Owner:_ — · _Status:_ blocked → F1 · _Depends on:_ F1 · _~4 tasks_

Where Rashmir's IP enters the codebase. Highest risk for silent drift, because paraphrase looks like
success. Load content, don't author it (I11).

- **t-1** — `registerModule('reclaim-audit')` from `initLeafApp()` in `lib/app/leaf-bootstrap.ts` (never the `bootstrap.ts` bridge); a `configSchema` making every coach-editable value changeable without a deploy — nine bucket titles/descriptions, benchmark ranges, hour bands, consultation email, footnote.
- **t-2** — Declare all **95** slot definitions from [[slot-spec]], exact slugs, per-bucket slots generated from the canonical list. Sensitivity as specified; nothing `special_category` (I5).
- **t-3** — Load content from [[content-source]] into config defaults **verbatim** — §0 frame, nine buckets, bands, footnote, phase language. No paraphrase. Plus the **second hop** of the I11 guard: a test parsing the blockquotes out of `.context/app/content-source.md` and asserting the nine bucket descriptions and the footnote are character-identical to the config defaults. The **first hop already exists** — `npm run leaf:content-diff` (in `leaf:checks`) asserts every blockquote in `content-source.md` appears verbatim in `.context/app/sources/`, and that the sources still match their SHA-256 manifest. Both hops are needed and neither substitutes for the other: config-vs-extract proves the code matches the extract and says nothing about whether the extract matches Rashmir, which is precisely how nine altered blockquotes survived to 2026-07-23.
- **t-4** — Author the agent (`Persona → systemInstructions → Guardrails → Brand Voice`): third-person (I1), banned lexicon + no em dashes + no conversational bullets (I2), scope + anti-replication guardrails ([[content-source]] §7), read-only capabilities (`get_journey_state`, `get_next_steps`, `get_state`), exposure allowlist permitting writes only to `reclaim_profile_*` (I6). Plus the invariant tests: voice, slot-sensitivity, agent-caps (in `tests/unit/invariants/`), **wired into `leaf:checks`** — the script is `exit 0` today and is the one hook CI already runs for us.

_Done when:_ all 95 slugs match the spec; bucket descriptions + footnote character-identical to source; three invariant tests pass; boundary green.

_Watch for:_ paraphrased bucket descriptions and invented slugs — diff the strings against source yourself; tests won't catch a plausible rewording.

### F3 · `ryw-firstlight` ★ — the spike

_Owner:_ — · _Status:_ blocked → F2 · _Depends on:_ F2 · _~3 tasks_

**A genuine gate.** First time boot → register → sync → publish → surface → stream runs against real
Postgres. Budget two to three unrelated framework bugs.

- **t-1** — Seed + publish the map (`prisma/seeds/app-reclaim/`): seven nodes `phase-0-setup … phase-6-summary`, `completionMode: 'repeatable'`, plain prerequisite chain, **no edge conditions** (slot conditions read the head version, which breaks on run 2). Module row `active`, coach agent `visibility: 'public'`, bound primary. `smoke:reclaim` proving one streamed turn.
- **t-2** — In the same script, assert the traps that fail silently: agent visibility is `public` (a non-public agent 404s with no diagnostic); a fresh `conversationId` is issued; no `reclaim_*` slot is `special_category`.
- **t-3** — Re-plan checkpoint. Record every framework defect in [[daybreak-asks]] with a repro, and the lesson in [[planning-retro]] §A. Re-verify the five `lib/framework/**` citations in [[invariants]] (I5, I6, I14, I15) still point at what they claim — they were exact on 2026-07-23 and will drift on syncs. **More than three framework defects → stop and re-scope F4 before building.**

_Done when:_ `db:reset && db:seed && seed:reclaim` completes; `smoke:reclaim` streams and passes all three assertions; the [[daybreak-asks]] defect rows exist; the invariant citations re-verified.

### F4 · `ryw-shell` — audit shell, chat, capture

_Owner:_ — · _Status:_ blocked → F3 · _Depends on:_ F3 · _~4 tasks_

- **t-1** — Leaf schema `prisma/schema/app-reclaim.prisma` (not `app.prisma` — that's Sunrise's). Tables `app_reclaim_{invite,grant,audit_run,bucket_label,share,report_share,feedback}`; partial unique index on `(userId) WHERE status='in_progress'`; **no calendar table** (I4). Hand-written `ON DELETE CASCADE` per `userId` table (Prisma emits none without a `@relation`; read the generated SQL). Drift probes in `leaf-db-drift.ts`.
- **t-2** — `saveAnswer()` in `lib/app/programme/slots/write.ts`: the **only** caller of `appendSlotValue` (I3), routing through `slotMaskingPolicy` and stamping `provenance.runId`. Test (`tests/unit/invariants/write-path.test.ts`, in `leaf:checks`) asserts exactly one occurrence in the tree.
- **t-3** — Run lifecycle routes under `app/api/v1/app/reclaim/`: create (TODO marker for F6/F8 gate), transition (`assertPhaseComplete` → `422 REFLECTION_REQUIRED` when the phase's reflection slot is absent — I9), complete (`isActive:false` on the conversation — I15), answers (delegates to `saveAnswer`). Run id = journey `contextKey` = provenance `runId`; never read `contextKey` from an LLM arg (I6).
- **t-4** — First consumer SSE client (`app/(protected)/programme/`), admin chat as SSE reference only. Progress bar over all **seven** map nodes with Phase 0 labelled _Setup_ (the map is `phase-0-setup … phase-6-summary`; hiding node 0 makes "you are here" wrong on resume, which reads `UserNodeState` per node). Auto-save, resume from `UserNodeState.progress`. Plus the per-phase **signpost line** ([[content-source]] §5d, G10): entering a phase says which phase, what it involves, and roughly how long — the progress bar shows position, not duration or content. Shell only — no phase content yet.

_Done when:_ migration applies with cascades confirmed; write-path test passes; transition without reflection returns 422; completing sets `isActive:false`; a run can be started, left, and resumed.

### F5 · `ryw-calendar` — the optional branch

_Owner:_ — · _Status:_ blocked → F4 · _Depends on:_ F4 · _~4 tasks_

Optional, and loudly so (Brief §3). I4 is the product's trust story, not just a requirement.

- **t-1** — Add `ical.js`; `lib/app/programme/calendar/parse.ts`, pure, no DB/network, RRULE expansion. Fixture-driven tests: recurring, all-day, timezoned, multi-calendar.
- **t-2** — Upload route: raw file **never touches disk** (`formData()` → `text()` in memory); categorise via **one `runStructuredCompletion`**, never `streamChat` (which persists meeting titles); persist per-bucket totals only via `saveAnswer`; personal events excluded, ambiguous flagged with best guess + reasoning, recurring counted per instance, multi-calendar + file-size fallback ([[content-source]] §8). Test: no `streamChat` import in the path. Add a per-flow rate-limit sub-cap inside the handler — an LLM call over an uploaded file is exactly the expensive sub-flow `CLAUDE.md` carves out from the inherited 100/min section cap.
- **t-3** — Review UI: summary **by bucket**, ambiguous items listed individually to confirm — **wait for confirmation before proceeding**. Then the "what the calendar misses" questions and the task-switching profile.
- **t-4** — Both privacy messages surfaced **at** the upload step (optional; details never stored). Extend `smoke:reclaim`: after a real Google `.ics`, assert **no meeting title anywhere in the database**.

_Done when:_ parser handles all four fixture shapes; calendar-privacy test passes; smoke proves no title in DB; both messages visible at upload.

### F6 · `ryw-current` — current reality + charts

_Owner:_ — · _Status:_ blocked → F4 · _Depends on:_ F4 (F8 for the gate) · _~4 tasks_

- **t-1** — Phase 0 setup form (warm framing, not bare fields): fields per [[content-source]] §4, first name only, role/org dropdowns, the "what keeps you up at night" and "why now" prose, quarter default. Plus the entitlement gate deferred from F4: `POST /runs` checks `app_reclaim_grant` and refuses when exhausted or expired (I14); integration test for the refusal. Opens with the "here is what we will cover" process outline verbatim ([[content-source]] §4). `<FieldHelp>` on every non-trivial field (repo rule); the hours fields accept approximations and say so (I17).
- **t-2** — Phase 1: show all nine buckets first (overview), then cards (eight when fundraising not relevant). **Hours per week, never percentages** (I8). Each card: hours + "what it looks like in practice". Deep-work's three extra questions. Delivery-above-15% and oversight-in-transition nuance ([[content-source]] §8). Reusable required reflection component (server enforces via 422 — I9; this is the UI half). `<FieldHelp>` on the hours and practice fields.
- **t-3** — The `<ReclaimChart>` family: standardised format, nine fixed colours, clear key, readable in light **and** dark mode, benchmark markers, over/under flags. Composite picture after upload (I-composite). **The priority-gap element** — map Phase 0 priorities to buckets and flag any priority with no time against it ([[content-source]] §8, "often the most important insight"). Chart never renders interpretation (I12). **Flag the two open colour questions** (dark-mode variants; strategic-blue vs brand-teal) as TODOs, don't silently resolve.

- **t-4** — **Bucket relabelling**, moved here from F9. Brief §3 lists user-level category customisation as a v1 amendment — "Not everyone is the head of an organisation. Users should be able to adjust category labels for their own audit, within limits" — and the audit it applies to is their _first_ one. Sequencing it with repeat audits meant the first cohort could not relabel at all. Display labels write to `app_reclaim_bucket_label` (schema already in F4 t-1); canonical `bucketSlug` is never touched (I7), so customised audits still aggregate correctly by construction, which is the other half of what Brief §3 asks for. "Within limits" is a length cap and the nine slots staying nine — relabelling is not adding or removing a bucket.

_Done when:_ setup writes every `reclaim_setup_*` / `reclaim_profile_*` slot; exhausted grant refused with a test; cards take hours; charts correct in both modes; priority-gap rendered; both colour questions flagged; a relabelled bucket renders its label and still aggregates on the canonical slug.

### F7 · `ryw-phases` — the remaining phases

_Owner:_ — · _Status:_ blocked → F6 · _Depends on:_ F6 (F5 optional) · _~4 tasks_

- **t-1** — Phase 2 energy grid + Phase 3 ideal-week sliders with the gap updating live; the "suspiciously similar" challenge; current-vs-ideal chart. Perception-vs-reality is a **hard gate before Phase 2** with the off-calendar note ([[content-source]] §8). Phase 2 also carries the team-distribution brainstorm and the light coaching-conversation signal ([[content-source]] §8, Phase 2).
- **t-2** — Phase 4 gap analysis. **The refer-back** (I13): a context contributor in `lib/app/context-contributors.ts` injecting the verbatim `reclaim_setup_keeping_me_up` / `reclaim_setup_why_now` for this run. Naming the absence; the once-per-audit permission-based challenge (guarded by `reclaim_gap_challenge_offered`); the under-delegation invitation verbatim; the hours question at 55+.
- **t-3** — Phase 5 action plan: three specific entry points, what/when/stop/how-known, and "want to, or think you should?" (`reclaim_action_wanted_not_dutiful`). Journey framing verbatim, not a makeover.
- **t-4** — Phase 6 summary + share: standalone artifact ([[content-source]] §10), **downloadable** as well as shareable (the Notes' "Summary Report. Downloadable, shareable"), footnote verbatim, tokenised link. Sharing **invited, never required**. Everything optional appears **only after** they choose to share, each with "prefer not to say": the two or three demographic questions (open item 2), an **age range in broad bands**, and the one-line feedback ask — "In a sentence: what did you take from this?" with a separate **"Happy for this to be quoted anonymously"** checkbox (Brief §3). The quote consent is its own field, not implied by sharing: it is what builds Rashmir's bank of worked examples, and it governs republication rather than analysis. Consultation offer once, at the end, invitation not pitch; the distinct close for existing clients ("invite them to share their results ahead of their next session" — [[content-source]] §10), which F8's client tier makes knowable. Closing affirmation, varied.

_Done when:_ ideal sliders update live; Phase 4 quotes the Phase 0 answer verbatim from slot data; challenge fires at most once; footnote character-identical; share genuinely optional.

### F8 · `ryw-access` — invites, grants, referrals

_Owner:_ — · _Status:_ blocked → F4 · _Depends on:_ F4 · _~4 tasks_

Parallels F4–F6. Must land before F6's run-creation gate is real.

- **t-1** — **Extend** `lib/utils/invitation-token.ts` + `emails/invitation.tsx` + `app/admin/users/invite/page.tsx` (don't rebuild). Add `tier` (client | standard | referral) to `app_reclaim_invite`; wire redemption to grant creation.
- **t-2** — The grant ledger: free tier = one complete audit; client tier = 12-month window starting on first use + a `mustStartBy` deadline (Brief §8); client status an admin flag. Enforced at the F6 run-creation route (I14), with the exhausted/expired test.
- **t-3** — Referral unlock: a second audit earned on the referred user's **first run completion**, not signup (Brief §8).
- **t-4** — **Signup-time capture — the commercial point and the legal basis.** Two things that only exist at account creation, and are expensive to retrofit:
  - **Consent.** Explicit acceptance of terms and privacy policy, recorded with version and timestamp. Brief §2: "everyone should be aware and agree to the terms and conditions and privacy policy, **which should allow for data to be used in aggregate**". F10 t-2's cross-client analysis has no lawful basis without this, and consent captured retroactively is not consent. The clauses themselves are Rashmir's to supply (open item 7); the capture mechanism is not blocked on them — build against a versioned policy record.
  - **Open-signup readiness.** Email captured as a first-class field, not incidentally via auth; the invite check a single gate that a config flag can open; the grant model already tier-driven (t-2), so an open-signup tier is a row and not a refactor. Reconciliation 7. **v1 ships invite-only** — this is about not welding the door shut.
  - **The follow-up sequence seam.** Brief §2 describes a follow-up sequence for people who register. Emit the signup and first-completion events through Daybreak's hook dispatch (`.context/orchestration/hooks.md`) rather than wiring an ESP in. No sequence in v1.

_Done when:_ redeeming creates the right grant per tier; free = exactly one audit; client window starts on first use; referral fires on completion; consent version recorded per user with a test; flipping the open-signup flag creates a valid standard-tier grant without code change.

### F9 · `ryw-repeat` — repeat audits

_Owner:_ — · _Status:_ blocked → F7 · _Depends on:_ F7 · _~4 tasks_

- **t-1** — Trend lines per bucket over the last year, reading `getSlotHistory()` (F1.2), grouped by `provenance.runId`.
- **t-2** — Every repeat audit opens by comparing to the last one automatically (Brief §2). Plus the recent-audit shortcut: an audit within the last month confirms rather than re-asks stable context ([[content-source]] §4).
- **t-3** — Quarterly nudge, gentle, matching the future paid cadence.
- **t-4** — Carry relabelled bucket names (F6 t-4) through trend lines and the comparative open, so a bucket a user renamed in run 1 reads consistently in run 2.

_Done when:_ trend lines show both runs; repeat opens comparatively; a bucket relabelled in run 1 keeps its label across the comparison.

### F10 · `ryw-admin` — admin + compliance

_Owner:_ — · _Status:_ blocked → F7, F8 · _Depends on:_ F7, F8 · _~4 tasks_

Admin UI under `app/admin/programme/**`; nav via `leaf-admin-nav.ts` (not the `admin-nav.ts` bridge — I10).

- **t-1** — Client list: signed up, mid-audit, **abandoned at which phase**, never started. Invite issue/revoke, tier, client flag. (Abandonment needs a phase-progress read at the run level.) One enriched list endpoint — no per-row fetches (repo rule).
- **t-2** — Shared-results inbox + cross-client aggregate patterns, anonymised (Brief §2; individual data confidential).
- **t-3** — Content editing (bucket titles, descriptions, benchmark ranges, footnote) through the `Module.config` schema from F2 — Rashmir rewords without a deploy.
- **t-4** — Data export + GDPR: verify `eraseUser()` reaches every `app_reclaim_*` row and every `framework_slot_value` row; extend `smoke:reclaim` to prove no orphans after erasure (the F4 hand-written cascades are what make this work).

_Done when:_ abandonment visible per phase; aggregate view excludes identifying data; a bucket description is editable without a deploy; erasure smoke proves no orphaned rows.

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

Blocking the features they touch:

1. **Dark-mode chart variants + the strategic-blue / brand-teal collision** — blocks F6.3 sign-off.
2. **The two or three optional demographic questions** — blocks F7.4.
3. Brand confirmation, logos, final palette. **Not a blank slate** — Brief §7 gives a working
   direction to build against until she confirms: deep teal `#0D4F68` with a cream secondary
   `#FFFAD7`, **Raleway** for headings and body, "a calm, uncluttered feel with generous white
   space. No stock-photo energy, no gradients." She has still to confirm _which_ of her brand
   identities this sits under, which is what makes it an open item. The teal is also what F6.3's
   colour collision is against — `#1B4965` strategic-planning blue sits close to it.
4. Page copy for landing, Home, About, FAQs, in the reassurance register of Brief §7 (the Setup
   Guide's "no one is judging you" wording is the register — [[content-source]] §12).
5. Tester quotes and worked examples.
6. Invite list for v1.
7. Privacy and IP clauses (she has offered these).
8. Confirmation of the exact third-person register — Brief §4 notes it "may need a little refinement
   together".
9. **Decision:** checkpoint summaries — keep as an on-screen per-phase recap, or retire entirely?
   ([[content-source]] §"checkpoint decision".)
10. **Decision:** where does the strategy mirror sit? Brief §5 offers "If a stranger read your
    calendar, what would they say your priorities are?" and then hedges — "though this could be in a
    follow up audit". Run 1, repeat audits only, or both? Blocks F7.2 sign-off; built behind a config
    flag until she rules.
11. **Decision:** does the Phase 2 coaching signal survive Brief §2? The system prompt tells Phase 2
    to "signal that a dedicated coaching conversation with Rashmir can go much further here"; Brief
    §2 says consultation offers appear "at the end and in follow-up, never mid-process", and Phase 2
    is mid-process. Either the Brief retired the signal, or a depth-of-topic remark is not a
    consultation offer. Blocks F7.1. ([[content-source]] §8, Phase 2.)

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

- _(nothing shipped yet — F1 `ryw-provenance` is first)_

---

## References

- [[../sources/README|.context/app/sources/]] — **the authority.** Rashmir's five original documents,
  byte-identical and read-only behind a SHA-256 manifest. Everything else derives from these.
- [[content-source]] — the working extract of `sources/` (the nine buckets, bands, phase language,
  voice rules, footnote). Load it; never paraphrase it (I11). `npm run leaf:content-diff` proves it
  against the originals.
- [[slot-spec]] — the 95 slot definitions, exact slugs, dataType, sensitivity.
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
