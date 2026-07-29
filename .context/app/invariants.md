# Reclaim Your Week — project invariants

**This file lives at `.context/app/invariants.md` and is referenced from the `CLAUDE.md` banner.**
Every Claude Code session must read it before writing code. These are the rules that
do not travel on their own: each one is a decision that looks arbitrary in isolation and is
load-bearing in aggregate.

> **The `Test:` lines below are guards that exist and run — but they do not all run in the same
> place, and this block used to imply they did.** Three gates matter and they have different reach,
> so each guard is listed under the one that actually runs it. Verified against
> `package.json` and `.github/workflows/ci.yml` on 2026-07-29.
>
> **1 · `npm run leaf:checks` — every PR, via the `app:ci-checks` seam.** It is exactly
> `leaf:content-diff && leaf:board-check && leaf:invariants`, and `leaf:invariants` is
> `vitest run tests/unit/invariants` — so **the directory is the wiring**. A new file dropped in
> there gates automatically; a guard placed anywhere else does not, however invariant-shaped it looks.
>
> | Guard                                            | Invariant   | Landed      |
> | ------------------------------------------------ | ----------- | ----------- |
> | `npm run leaf:content-diff`                      | I11 hop 1   | pre-F2      |
> | `npm run leaf:board-check`                       | — (P21/P23) | F12 t-3     |
> | `tests/unit/invariants/voice.test.ts`            | I1, I2      | F2 t-4      |
> | `tests/unit/invariants/slot-sensitivity.test.ts` | I5          | F2 t-4      |
> | `tests/unit/invariants/agent-caps.test.ts`       | I6          | F2 t-4      |
> | `tests/unit/invariants/write-path.test.ts`       | I3          | F4 t-2      |
> | `tests/unit/invariants/calendar-privacy.test.ts` | I4          | F5          |
> | `tests/unit/invariants/admin-support.test.ts`    | D4 (F10)    | F10 t-1     |
> | `tests/unit/invariants/product-voice.test.ts`    | I1, I2      | open item 8 |
> | `tests/unit/invariants/chart-beat.test.ts`       | I12         | conv. 5     |
> | `tests/unit/invariants/reachability.test.ts`     | —           | conv. 7     |
>
> **2 · The main test suite — every PR, but not via `leaf:checks`.**
> `tests/unit/app/programme/content.test.ts` (I11 hop 2, F2 t-3) lives outside
> `tests/unit/invariants/`, so `leaf:invariants` does not run it. CI's `test` job does. The
> distinction matters to anyone reasoning about which gate protects what: I11's second hop is as
> gated as the first, by a different job.
>
> **3 · CI's `smoke` job — every PR, real Postgres.** All six that need no provider key:
> `smoke:reclaim-run`, `smoke:reclaim-erasure`, `smoke:reclaim-access`, `smoke:reclaim` (a fake
> provider), and — since F12 t-2 — `smoke:reclaim-coach` (I12's pacing, the moment ledger) and
> `smoke:reclaim-join` (the seat cap under concurrency).
>
> **Not gated anywhere.** `smoke:reclaim-calendar` alone, because it needs a real model key. It is a
> deliberate manual gate ([[planning/post-v1|post-v1]] P16), and F14 will add a second of the same
> kind.
>
> **This block has now been wrong in both directions, which is the thing to take from it.** It first
> said every test below was "still to be written" and stayed that way through ten features while the
> guards were built one by one — corrected at the v1 close-out audit (P2). The correction then
> overshot: it put every guard under one heading that claimed `leaf:checks` ran them all, and by
> 2026-07-29 four statements in it were false — `content.test.ts` is not in `leaf:checks`,
> `smoke:reclaim-coach` is in no gate at all, `product-voice.test.ts` was missing entirely, and the
> closing note named `smoke:reclaim` as ungated three days after P16 recorded that it had joined CI.
> None of that made a guard weaker. It made the map wrong, in the one file `CLAUDE.md` requires
> every session to read first. **A guard's name is not its wiring; the gate that runs it is.**
>
> **Still specification rather than guard:** I-frame, I13, I16 and I17 are judgement rules no test
> can express. For those, read the `Test:` line as "this is what would have to be checked by hand".

---

## I1 — Voice: the tool is not Rashmir

The agent **never speaks as Rashmir**. No "I designed this", no "my framework", no "in my
experience". It is an instrument designed by her, attributed in the **third person**, sparingly:
"a tool designed by Rashmir Balasubramaniam".

It is also never attributed to Claude or Anthropic.

The _method_ is preserved in full — asking before telling, holding complexity without judgment,
handing insight back rather than delivering verdicts. Only the _persona_ changes.

**Why this exists:** the source system prompt is written in the first person as Rashmir. Any
content ported from it will carry the wrong persona unless deliberately re-pointed. Two testers
prompted this change, one of whom was using the tool outside its design scope precisely because it
sounded like her.

### What the tool calls itself (decided 2026-07-26 — plan.md open item 8)

Brief §4 settles that the tool is not Rashmir, then adds: "the exact register may need a little
refinement together". What it never settles is the pronoun the tool uses **for itself**, and for ten
features the answer differed by surface: the agent says "the tool", the interface says "we". Both
are defensible; having both is not, because a leader cannot tell which sentences came from which.

Four rules, decided on the most defensible reading of Brief §4 and reversible if Rashmir disagrees:

1. **The tool never says "I" in its own voice.** An instrument that says "I think" invites exactly
   the person-substitute confusion I1 exists to prevent, and one tester had already made that
   mistake. **Leader-voiced form controls are exempt and correct**: "I accept the terms", "Create a
   link I can share" are the _leader_ speaking through the interface, not the tool speaking.
2. **"We" only as inclusive-we** — the coach and the leader, together, doing the work. "We will look
   at up to nine areas" is right. Vendor-we, meaning a company behind the product, is not: "we do
   not collect your last name" becomes "your last name is not collected".
3. **System and error strings are exempt.** "We could not load your audit" is the product
   apologising for a technical failure. Rewriting roughly twenty-five of them buys a distinction no
   leader will draw, so this is a decision rather than an oversight.
4. **Third person for the tool when it describes what it does**: "the audit hands the insight back
   to you".

Rule 2 is **specification, not guard**: inclusive-we and vendor-we are a judgement no regex makes,
and a guard that fires falsely earns an allowlist within a month. It is enforced by review.

**Test:** `tests/unit/invariants/voice.test.ts` asserts no first-person-as-Rashmir construction in agent
system prompt content. `tests/unit/invariants/product-voice.test.ts` extends the same checks to
coach-voiced copy the app authors.

---

## I2 — Banned lexicon and formatting

Never in agent output:

```
leverage · optimise · optimize · productivity hack(s) · best practice(s) · KPI(s)
```

Also never:

- Em dashes (`—`, U+2014). Use commas, full stops, or restructure.
- Bullet points in conversational turns. Bullets are for structured outputs only: the visual
  artifacts and the summary document.
- Filler openers: "Certainly", "Absolutely", "Great question", "Of course", "I'd be happy to".

Short sentences. Plain language. No corporate or consultant framing.

### What "agent output" means (decided 2026-07-26 — plan.md open item 8)

I2 was written about the agent, and was read that way for ten features: the coach never used an em
dash, while the interface around it used one every other paragraph. Brief §7 says "the register of
the whole product matters as much as any single page", and a leader reads one screen, not two
sources.

So **I2 binds agent output _and_ coach-voiced copy the app authors** — the phase panels, the
reflection prompt, the signposts, the consent gate, the calendar review, and the categoriser's
runtime prose. It does **not** bind:

- **Rashmir's verbatim content** in `lib/app/programme/content.ts`. It contains nineteen em dashes
  and they are hers. **I11 outranks I2**: a paraphrase to satisfy a formatting rule would be the
  exact drift the content chain exists to prevent.
- **System and error strings**, per I1's rule 3 above.

> **A correction worth keeping.** [[planning/ryw-phases]] said four times that the F7 work must
> extend `voice.test.ts` to the `Module.config` copy, and it never happened — the done-when was
> signed off regardless. On inspection that promise was also **wrong**: that copy is Rashmir's
> verbatim IP, so the extension as specified would have failed on its first run or forced a
> paraphrase. The right target was always coach-voiced copy _we_ authored, which nobody had guarded.

**Test:** `tests/unit/invariants/voice.test.ts` greps agent config for the banned list and for U+2014.
`tests/unit/invariants/product-voice.test.ts` greps coach-voiced app copy for the same, and requires
every file under `components/app/reclaim/` to be classified as coach-voiced or not, so a new screen
cannot join the product unguarded.

---

## I3 — One write path to slots

**Only `saveAnswer()` in `lib/app/programme/slots/write.ts` calls `appendSlotValue()`.**

No route, component, or capability calls `appendSlotValue` directly. `saveAnswer` is the single
place that routes through `slotMaskingPolicy` and stamps `provenance.runId`. A direct call bypasses
both.

**Test:** `tests/unit/invariants/write-path.test.ts` greps `lib/app/**` and `app/api/v1/app/**` for
`appendSlotValue` and asserts exactly one occurrence, in `write.ts`.

---

## I4 — The calendar never persists per-event data

The `.ics` file **never touches disk**. Read it via `formData()` → `text()` in memory.

Categorise via **one `runStructuredCompletion()` call**. Never `streamChat` — `streamChat` persists
an `AiMessage`, which would put meeting titles in the database permanently.

Persist **per-bucket totals only** (`reclaim_calendar_hours__*`). No event titles, no attendees, no
descriptions, anywhere, ever.

**Why this is load-bearing:** Rashmir told us this promise must be unmissable to users. Several
testers were anxious about the calendar step. Breaking it breaks the product's trust story, not
just a requirement.

**Test:** `tests/unit/invariants/calendar-privacy.test.ts` asserts no `streamChat` import in the calendar path.
`smoke:reclaim-calendar` uploads a real `.ics` and asserts no meeting title exists anywhere in the database — plus `tests/unit/invariants/calendar-privacy.test.ts`, which is the half that runs in CI. **The smoke does not** ([[planning/post-v1|post-v1]] P3): it makes a real model call, so it is a manual gate.

---

## I5 — Slot sensitivity: never `special_category`

No `reclaim_*` slot definition is `special_category`. `slotMaskingPolicy` redacts the prose value at
that level, which would destroy `reclaim_setup_keeping_me_up` — the exact sentence F7 t-2 must quote
back verbatim.

Use `sensitive` for personal prose. It is currently a no-op in the masking policy, which is what we
want, but writes still route through `slotMaskingPolicy` so a later reclassification cannot bypass
the guard.

**Test:** `tests/unit/invariants/slot-sensitivity.test.ts` asserts no registered `reclaim_*` definition is
`special_category`.

---

## I6 — The agent never selects the run, and never transitions

Granted capabilities: `get_journey_state`, `get_next_steps`, `get_state`,
`reclaim_audit__record_answers`, `reclaim_audit__offer_choices`.

**`fill_slot` was granted here and has been removed (2026-07-27).** The reasoning that put it there
is kept below because it is the same reasoning that justifies `record_answers`' shape. It covered
`reclaim_profile`, which `record_answers` also covers — from a server-issued run rather than a
model-supplied key — so the narrower tool was both redundant and the less safe of the two, and its
removal retires the last grant on this agent whose write target a model could influence at all. A
seed unit (`004-reclaim-coach-grants`) revokes the row: neither `002` nor `003` ever deletes a grant,
so without it the removal would have shipped as a no-op on every installed database.

**Revoked means `isEnabled: false`, never a deleted row, and the difference is the whole point.** The
dispatcher synthesizes a **default-allow** binding for a missing pivot row, and `loadExposureConfig`
returns `PERMISSIVE` when there is no binding. So deleting a grant does not revoke the capability; it
removes the _restriction_ on it. For `fill_slot` that inverts the intent exactly — it was pinned to
`reclaim_profile` precisely because its run comes from a model-supplied argument, and an unpinned
`fill_slot` could reach `reclaim_reflection_*` or `reclaim_share_*`, the two things this invariant
refuses on principle. A resumed conversation's own history can contain earlier `fill_slot` calls from
before the change, which is the sort of thing a model imitates. Found by `/security-review`; the seed
now ensures the row exists and is disabled, which also repairs a database seeded while it deleted.

**Never** `request_transition`. The server owns phase transitions and the leader decides when to
move on.

**The rule is about where the run id comes from, not about writing.** A capability that selects its
run from an argument the model supplies may only touch slots belonging to no run. A capability that
takes the run from the server may write the audit.

| Capability                        | Run comes from                                 | May write           |
| --------------------------------- | ---------------------------------------------- | ------------------- |
| `fill_slot` _(no longer granted)_ | `contextKey`, an LLM-supplied argument         | nothing here        |
| `reclaim_audit__record_answers`   | `CapabilityContext.scope`, issued by the route | the allowlist below |
| `reclaim_audit__offer_choices`    | `CapabilityContext.scope`, issued by the route | nothing at all      |

**`offer_choices` is granted and writes nothing** (added 2026-07-29). It answers one question about
static data — "which answers does this reading offer?" — so the screen can draw them instead of an
empty box. The model names the reading; the **product** owns the answers (`coach/slot-choices.ts`),
so there is no argument that can make a leader be shown an option their audit cannot store. The
section is read from `readCoachScope(context.scope)`, never from an argument, and a dispatch with no
scope refuses rather than falling back to "any section" — so a coach in section 2 cannot put section
4's answers in front of the leader. The answer a leader taps is sent as an ordinary turn in their own
column and recorded through `record_answers` like anything else: nothing is stored because a button
was drawn. `record_answers` therefore remains the only capability on this agent that writes.

**Why the distinction.** `contextKey` is an optional argument on the framework's own tools
(`lib/framework/guidance/capabilities/shared.ts:18-21`) and the model can pass any string, so
trusting it for run selection would let a hallucinated key write one leader's answers into another
leader's audit. `ChatRequest.scope` is a `Record<string, string>` built by the route and threaded
verbatim into every dispatch (`lib/orchestration/chat/types.ts:41-49`); the model never sees it and
cannot influence it. So the hazard is removed by construction rather than by prohibition, and the
capability that carries the run this way is safe to grant where `fill_slot` was not. Keeping the
comparison after the removal is deliberate: it is the argument that says why `record_answers` may
write an audit at all, and it stops being obvious the moment the counter-example is deleted.

**One route issues that scope, and it is a leaf route for a reason.** The framework's module-surface
stream sends `{ moduleSlug }`, which is everything the framework knows and one key short of what the
audit needs; a run id is a leaf concept it has no vocabulary for. So the conversation runs through
`POST /api/v1/app/reclaim/runs/:runId/coach/stream`, which verifies the run is the caller's and in
progress, reads the phase from the journey, and builds the map in `buildCoachScope`
(`lib/app/programme/coach/scope.ts`). Both halves are server-derived: the client supplies the run in
the path, where ownership is checked, and the model supplies nothing at all. A turn sent to the
framework route instead carries no run and records nothing, which is the safe failure.

**Was this loosened?** The original rule read "the agent reads; it does not write". It was written
when the audit was captured entirely by forms and no conversational path existed. Making the phases
conversational means the coach must record what it hears or the conversation captures nothing. What
the rule was actually protecting — that a model can never decide which run it is writing into — is
unchanged and now enforced structurally.

### The write allowlist, and what actually enforces it

Stated in two places, doing two different jobs:

| Layer                                        | Says                                                  | Enforced by                                                         |
| -------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------- |
| The grant (`AiAgentCapability.customConfig`) | which slot **groups** this agent may write at all     | `facetAllows`, called by the capability from `context.customConfig` |
| The code (`coach/writable-slots.ts`)         | which **slugs** within them, and the typed-value rule | `checkSlotWrite`                                                    |

The capability ANDs them, and fails closed on a grant it cannot parse.

> **This invariant claimed two layers for a year and had one.** `facetAllows` is called by the
> framework's own `fill_slot` and `get_state` and by nothing else, so a _module_ capability that does
> not call it has an `ExposureConfig` that enforces nothing — and `record_answers` did not call it.
> The writes were still correctly constrained, by the code layer, which is the one that actually ran.
> What was false was the claim. Worse, `agent-caps.test.ts` asserted against its **own local mirror**
> of `facetAllows`, so the guard passed while proving only that the data said what we meant. Both are
> fixed: the capability reads the grant, and the guard imports the real function. A rule documented
> as held twice and held once is worse than one held once and known to be.

Permitted: `reclaim_profile`, `reclaim_setup`, `reclaim_current`, `reclaim_energy`, `reclaim_ideal`,
`reclaim_gap`, `reclaim_action`, and — **since 2026-07-27, under conditions** —
`reclaim_reflection`.

**`reclaim_reflection` was refused and now is not, and that is a deliberate reversal.** The refusal
read: these are the phase gate (I9), so a coach that can write one can open its own gate. True of the
mechanism, and wrong about the product. What it left on screen was a textarea under the transcript —
the question the entire coaching method rests on, asked by a form field, in a tool whose source says
"this should feel like a coaching conversation, not a form". The point of the coach is to help a
leader articulate themselves; a leader who has just said the thing out loud should not have to type
it again to be allowed to move on. Owner decision, taken with the gate's purpose in view rather than
around it.

**I9 is untouched.** The transition route still refuses to leave a phase whose
`reclaim_reflection_p<N>` is absent for this run. Only the writer moved. Three narrower guards
replace the blanket refusal, and the first two are what stop the coach walking through its own gate:

1. **The phase comes from the server.** A reflection may only be written for the phase in the
   dispatch scope, which the route reads from the journey (`buildCoachScope`). A conversation in
   phase 2 cannot write phase 4's reflection, and cannot clear five gates in one call.
2. **Never inferred** — a discipline, not a boundary, and the difference matters. `sourceType:
'inferred'` is refused for a reflection slug, but **the model chooses that value**, so a
   reflection it invented and labelled `direct` passes. It keeps the documented path the honest one
   and tells a well-behaved coach what is expected; it is not a control and nothing should be built
   on it as one. (The leader-facing `answers` route takes a `confirming` **boolean** rather than a
   client-chosen `sourceType` for exactly this reason: a caller naming its own provenance is not
   evidence.) What it leaves is bounded by guard 1 and visible through guard 3 — the worst case is
   the current phase's reflection recorded unprompted, in the leader's own run, on a screen that
   shows it to them.
3. **Visible and correctable.** The recorded reflection is shown in the captured panel under "In your
   words". The panel itself carries no box — a leader changes it by saying so, or by taking "I would
   rather fill this in myself" and using the phase panel's reflection field, which writes over the top
   through the leader's own path. This is the one that makes "the leader owns their reflection" still
   true of a reflection the coach typed, and it is why the panel is now load-bearing rather than
   reassuring.

`reclaim_reflection_p6` (the takeaway) is permitted on the same terms — it is the question the close
asks, and the coach that asks it is the one that records the answer.

Refused, and each for its own reason:

- **`reclaim_share`** — `reclaim_share_with_coach` and `reclaim_share_quotable` decide whether a
  leader's words may be republished. An agent that can write consent can manufacture it.
- **`reclaim_composite`** — the reconciled lane, whose whole story (I-composite) is that it is
  computed from the calendar and the estimates. A model-derived number there makes that false.
- **`reclaim_calendar`, except two slugs.** The lane figures stay refused for I4's reason. But the
  group also holds six _leader self-reports_, and the wholesale refusal was written for the lanes:
  `completeness` and `period` are the answers to two questions the source explicitly tells the coach
  to **ask**, before any file exists, and the first decides how every later figure is framed. A
  conversation that cannot record the answer to a question it was told to ask captures nothing at the
  point that matters. The exception is a named slug list
  (`COACH_WRITABLE_SLOTS_IN_REFUSED_GROUPS`); the other four self-reports stay refused because they
  are asked on the review screen, after the upload, where they belong.

  The grant therefore permits `reclaim_calendar` and the **code** keeps the lanes shut — the two
  layers deliberately not identical. `facetSchema` is strict on `{ groups, scopes }`, so a
  slug-level rule cannot be expressed as data at all; logged as a Daybreak ask.

**Typed slots need typed values.** `record_answers` refuses a `number`, `boolean`, `date` or `json`
slot that arrives with prose alone. Nine bucket hour slots feed the charts, the benchmarks, the gap
arithmetic and the cross-audit trends; "about eight" satisfies none of them and fails silently
because the chart still renders. The coach's way through the refusal is to offer a figure and let
the leader confirm it, which also satisfies I17.

**What the rule was never about: a figure in the wrong field.** Where the typed form is absent and
the prose _is_ the value with nothing to interpret — `"25"`, `"Yes"` — it is read out rather than
refused (`deriveTypedValue`). Only an exact match counts: `"25 hours"`, `"about 25"`, `"twenty
  five"` and any sentence about a yes-or-no slot are all still refused, because each needs a reading
rather than a parse. Refusing `"25"` cost a real audit its whole first phase — the coach answered
the next question instead of moving the value between two keys, and the reading was lost.

**A model-argument slip is a refusal, never a failed call.** The per-answer contract has to hold at
the schema as well as in the loop, so `record_answers` validates only its envelope and parses each
entry inside `execute`. Two reasons, and the second is not obvious: one bad entry must not fail its
siblings, and a `success: false` result feeds the chat handler's tool circuit breaker, which takes
the capability away after two consecutive failures — so a retryable argument error, retried, disables
capture for the rest of the turn. This capability fails the call only for something no retry could
fix: no leader, no run in scope, an unreadable grant.

**Capture has two writers, and the coach is only one of them.** `record_answers` is what the coach
calls when it notices something; **the capture sweep** (`coach/capture-sweep.ts`) is what runs
afterwards, on every leader turn, over whatever is still outstanding. The second exists because the
first is a side effect asked of a model whose actual job is the conversation, and three rounds of
live testing showed it is a hit rate however the prompt is worded: it takes a paragraph of facts
every time and drops the one-sentence answer to the question it just asked. An audit cannot be built
on a hit rate.

The sweep is a model call wrapped in code, and the code is the part that matters: it always runs, its
worklist is computed from `phaseCaptureSlots` and the run's own answers, and every write goes through
`checkSlotWrite` and `saveAnswer` exactly as the coach's do — so this invariant, I3 and I5 hold for
it without a second implementation of any of them. It may **not** write a reflection (the leader's own
noticing, excluded here as well as refused there), a `json` reading, or anything outside the phase in
the server-issued scope. It may **supersede** a reading this run already holds when the exchange adds
to it, recorded as `built_across_turns`, and never when the held reading is `user_confirmed` or the
new one is a guess. Its failures are silent: an unswept turn is a turn where capture is what it was
before the sweep existed.

**Test:** `tests/unit/lib/app/programme/coach/capture-sweep.test.ts` (the guards, driven with the
exchanges that were actually lost) and the sweep block in
`tests/unit/app/api/v1/app/reclaim/coach-stream.route.test.ts` (that it runs, when, and that it
cannot break a turn).

**Test:** `tests/unit/invariants/agent-caps.test.ts` — the grant set, the absence of
`request_transition`, both exposure allowlists, the refused groups checked against the real slot
definitions, and the reflection's three conditions (this phase only, no phase means no write, never
inferred).

---

## I7 — Canonical bucket slugs never change

The nine `bucketSlug` values in `content-source.md` §1 are the storage key everywhere. A user
relabelling a bucket writes a display label to `app_reclaim_bucket_label`; **the slug is untouched**.

This is what makes relabelled audits aggregate correctly by construction rather than by cleanup —
a requirement from Brief §3.

---

## I8 — Hours, never percentages

Users enter **hours per week**. Never percentages that must total 100.

Forcing a total of 100 hides the overwork, which is the single thing users most need to see. Brief
§3 endorses this explicitly and testers have benefited from seeing it.

Percentages may be _displayed_ as derived values. They are never the input.

---

## I9 — Reflection pauses are server-enforced

The UI renders an unskippable step, but the **server** is the enforcement. The phase transition
route returns `422 REFLECTION_REQUIRED` when the `reclaim_reflection_p<N>` slot for the phase being
left is absent.

A UI-only guard is not sufficient. "Asking before telling is the coaching spine of the tool"
(Brief §3).

**Who writes it changed on 2026-07-27; what gates the phase did not.** The coach now asks the
reflection question as the phase's closing beat and records the answer, on the three conditions I6
sets out. This invariant is deliberately unchanged by that: the route still checks the slot, still
checks it belongs to _this_ run, and still returns 422 without it. The thing worth holding on to is
that the gate was never "the leader typed into a box" — it was "this phase was not left until the
person had been asked what they noticed and had answered". A conversation satisfies that reading
better than a textarea did.

**`reclaim_reflection_p6` is a reflection but not a transition gate.** The takeaway the source asks
for before the summary is produced lives in the reflection group. But `reflectionSlugForLeaving`
deliberately does not
return it: phase 6 is the end of the audit, and gating the finish button on a reflection would be a
refusal nobody asked for. What it gates is the **summary appearing**, which is the beat the source
actually describes. Before this the question was asked _after_ the artifact and only of the leaders
who chose to share their results, so most people were never asked at all.

---

## I10 — Tier boundaries

Three tiers: **Sunrise → Daybreak → Reclaim Your Week (this app, the leaf)**.

**Ours to edit:**

- `lib/app/*` scaffolds and the three `leaf-*` hooks (`leaf-bootstrap.ts`, `leaf-admin-nav.ts`,
  `leaf-db-drift.ts`)
- `lib/app/programme/**` — domain logic
- `app/api/v1/app/**` — HTTP API
- `app/(programme)/**` — end-user UI (its own route group since 2026-07-27, so the audit can own the
  viewport; the URLs are unchanged and the edge gate still keys on `/programme`). Since 2026-07-28
  this includes `profile/` and `settings/`, whose Sunrise originals under `(protected)` were
  **deleted**: the account menu in the audit's own bar linked to them, and reaching them meant leaving
  the product's frame, typeface and register in one click. Two files cannot answer one path, so
  keeping the URLs meant taking the pages. `/dashboard` deliberately stayed Sunrise's.
- `app/admin/programme/**` — admin UI
- `prisma/schema/app-*.prisma` — **new files**, and `<timestamp>_app_<feature>` migrations
- `.context/app/**`
- `leaf:checks` in `package.json`

**Never edit:**

- `lib/framework/**` — Daybreak's, merges down from upstream
- The three **bridges** `lib/app/bootstrap.ts`, `admin-nav.ts`, `db-drift.ts` — edit the `leaf-*`
  file they delegate to instead
- `prisma/schema/app.prisma` — despite the name, this is Sunrise's (it holds `ContactSubmission`,
  `FeatureFlag`, `AuthBootstrap`). Add `app-<domain>.prisma` alongside it.
- Core `lib/`, core `components/`, core `app/api/v1` routes, `proxy.ts`, `lib/security/**`

**Check:** `npm run framework:boundary` must pass. It asserts the ESLint import boundary bites, that
no migration mixes `framework_*` and core DDL, and that no framework vocabulary leaks into core.

**The one exception:** F1 lands two additive changes to `lib/framework/data-slots/values.ts` as
their own PR, reviewed separately, before any leaf work depends on them. No other feature touches
`lib/framework/**`.

---

## I11 — Content is loaded, not authored

The nine bucket definitions, benchmark ranges, hour bands, colour codes, phase language, and the
summary footnote are **Rashmir's IP**. The authority is `.context/app/sources/` — her five original
documents, byte-identical and read-only. `content-source.md` is a working **extract** of them, and
loads into `Module.config` defaults.

**The chain of custody has two hops, and both are enforced:**

| Hop                                   | Check                                          | Catches                           |
| ------------------------------------- | ---------------------------------------------- | --------------------------------- |
| `sources/` → `content-source.md`      | `npm run leaf:content-diff` (in `leaf:checks`) | a paraphrase entering the extract |
| `content-source.md` → `Module.config` | F2 t-3 test                                    | a paraphrase entering the code    |

Neither substitutes for the other. Until 2026-07-23 only the second was planned, and the sources
lived outside the repo — so the guard compared a transcription against itself. The first machine run
against the real originals found **nine altered blockquotes out of seventy**, three material,
including calendar export steps present in no source document. Every one would have passed a
config-only guard.

`leaf:content-diff` also asserts the sources still match `sources/CHECKSUMS.txt`, because a check
whose reference file can be edited is not a check.

Do not paraphrase, summarise, tighten, or improve any of it. "Recommended ceiling: 10-15% for a
senior leader. Above this is often a signal of under-delegation or difficulty letting go of an
earlier identity as a practitioner" is a diagnostic in her voice. A cleaner version is a different
product.

### The coach reads her words from the config, and until the conversational surface it read nothing

The agent's authored prose deliberately does **not** restate the frame or the nine areas — that is
this invariant working, and its system instructions say the content "is supplied to you in context".
It was not. The framework's module context injects the module's name, description and the user's slot
values; `Module.config` reached no prompt, so the coach ran a nine-area audit without the nine areas.
Nothing showed while the phases were forms, because the panels read the config directly and the coach
was rendered nowhere.

`buildCoachPhaseContext` supplies it now, phase by phase, read from the stored row so an operator's
rewording reaches the conversation exactly as it reaches the screen. **The rule this creates: content
reaches the coach as injected context read from `Module.config`, never as text written into the agent's
prose fields.** A future session tempted to paste an area definition into `systemInstructions` to "help
the model" would fork the single source of truth and slip past both hops of the chain above.

### The third hop is Rashmir's own, and it is not a violation (F10 t-4)

Both hops above stop at the **code**. From F10 t-4, the words a leader actually reads come from
`Module.config` **in the database**, which Rashmir edits herself through
`/admin/programme/content`. So production content can differ from `sources/` with every guard green,
and a future session finding that difference must not read it as a breach.

**The distinction I11 actually draws is authorship, not immutability.** It exists so that _we_ never
paraphrase her — not so that _she_ cannot revise herself. Her rewording her own diagnostic is the
feature working; the same edit made by a developer in a config row would be the thing this invariant
forbids, and the two are told apart by three properties the editor guarantees:

1. **Every field is marked** as matching the source document or edited (`content-diff.ts`), so a
   difference is always visible rather than discovered.
2. **Every save is versioned and attributed** — the framework's `saveModuleConfig` snapshots a
   `ModuleVersion` with the author, and the leaf requires a change summary the framework treats as
   optional. "Who changed this, when, and why" is always answerable.
3. **The code defaults are never touched by an edit.** Hop 2 keeps testing the constants against the
   extract, so the chain of custody from `sources/` to what we shipped stays provable no matter what
   the stored config says.

So: a diverged field with a version history behind it is Rashmir's revision. A diverged **default**,
or a diverged field with no version behind it, is a breach — that is what to check.

Anything Rashmir might want to reword must be editable through `Module.config` without a deploy.

### Config holds our copy too, and the editor must not call it hers (2026-07-27)

`Module.config.phaseSignposts` — how each phase opens itself — is config for the reason above: the
first thing a leader reads in a phase is exactly the kind of thing Rashmir should be able to change
without a deploy, and Brief §7 puts the register of the whole product on the same footing as any
single page. But most of that copy is **ours**, not hers.

That matters because `content-diff.ts` marks every field as "matches the source document" or
"edited — differs from source", and the second would be a false statement about copy that has no
source document. **So the signposts are deliberately not in the leaf content editor yet.** They are
editable through the framework's own module config form (as raw JSON, per daybreak#161), and adding
them to `/admin/programme/content` requires `ContentField` to carry a
`sourceKind: 'rashmir' | 'authored'` first, so the marker can say "matches the shipped wording"
instead. Attributing our orientation copy to Rashmir on her own editing screen is the inverse of what
this invariant protects, and shipping the editor row before the distinction exists would do exactly
that. Tracked in [[planning/ryw-conversational]] stage 3.

**One field inside the signposts is hers**: phase 0's opening is
`[RECLAIM_WARM_OPEN, RECLAIM_PROCESS_OUTLINE]`, and `opening` is an **array of paragraphs** precisely
so the second stays a field hop 2 can compare character-identically against the extract. Folding the
two into one string would quietly move her outline out of the guarded set. Pinned by
`tests/unit/app/programme/runs/signposts.test.ts`.

---

## I12 — Pacing: chart and interpretation are separate beats

After a big reveal, especially the perception-versus-reality chart, the UI shows the picture, asks
one question, and lets it land. It does not render the interpretation in the same beat.

This is a structural requirement from Brief §5, not a prompt nicety.

### "The component boundary enforces it" was aspiration, and now is not (2026-07-27)

For a whole version **both** surfaces drew the chart as soon as there was anything to draw — the form
panel on `anyHours`, the conversation on `capturedCount > 0`. Under either, a leader assembled their
week one bar at a time while typing, so by the end of the phase there was no picture left to reveal
and nothing for the question to follow. The invariant read as satisfied because the chart component
emits no prose, which is true and is only one third of the requirement.

**Three mechanisms now hold it, and no one of them is sufficient alone:**

1. **The condition.** `chartRevealReady` (`lib/app/programme/chart/reveal.ts`) is true only when every
   bucket the leader was _asked about_ has an hours reading — and, where a calendar was uploaded,
   only once the composite exists, because I-composite forbids plotting raw calendar totals. Until
   then there is no chart and no button.
2. **The surfaces.** Ready shows a button and no chart; revealed shows the chart alone. The coach's
   turn is handed the actual figures (`buildCoachPhaseContext`) and told to name the gaps, ask one
   question, and **stop** — the source is explicit that interpretation waits until after the leader
   has answered (`Prompt_Text.md:235`, `:237`).
3. **The server.** Phase 1 cannot be left until the reveal is recorded on the run:
   `422 CHART_REVEAL_REQUIRED` from the transition route, beside the reflection gate. This is what
   makes `:231` ("do not proceed to Phase 2 until this has been presented") checkable, and it is the
   argument I9 already settled — a pause the UI alone holds is not a pause.

The reveal is recorded in `ReclaimAuditRun.coachOpenings`, so it survives a reload and a leader is
never shown their week "for the first time" twice.

**Test:** `tests/unit/invariants/chart-beat.test.ts` — the condition, both surfaces gating on the
reveal state rather than on a running count, and the server gate. Plus
`tests/unit/lib/app/programme/chart/reveal.test.ts` for the condition's edges.

---

## I13 — The refer-back is a data flow

What the user said at setup about what keeps them up at night must return **in their own words** at
gap analysis. Implemented as a context contributor injecting the verbatim
`reclaim_setup_keeping_me_up` and `reclaim_setup_why_now` slot values for this run.

Brief §5 is explicit: "This is a data-flow requirement, not just prompt text." Do not implement it
by asking the model to remember.

**Register the contributor under the chat `contextType`, not the module slug.** For ten features this
was registered under `'reclaim-audit'`, which is a conversation's `contextId`; contributors are keyed
on `contextType`, which for a module surface is `'module'`. So the block was built correctly and
never dispatched, and the test could not see it because it mocked the registry and asserted only the
loader's output. The leaf now registers under `MODULE_CONTEXT_TYPE` and **delegates to the
framework's `loadModuleContext` first**, because the registry replaces per type rather than composing:
take the type without delegating and the module's name, description and fresh slots disappear from
the prompt.

**Test:** `tests/unit/lib/app/context-contributors.test.ts` asserts the registration key, that the
framework's context is preserved, and that another module slug passes through untouched.

---

## I14 — Entitlement is enforced at run creation

Not via `isModuleLive`. Its `entitlement` seam is synchronous
(`lib/framework/modules/liveness.ts:53-83`) and its only caller
(`lib/framework/guidance/assemble.ts:66`) never passes the predicate. A grant lookup is async.

The module chat surface is reachable only through an `app_reclaim_audit_run` the leaf created, so
gating run creation against `app_reclaim_grant` is strictly sufficient.

**Test:** an integration test asserts a user with an exhausted or expired grant is refused at the
run-creation route.

---

## I15 — Close the conversation on completion

Set `isActive: false` on the `AiConversation` when a run completes.

`resolveModuleSurface` resumes on `(userId, agentId, contextType, contextId, isActive:true)`
(`lib/framework/guidance/surface.ts:69-79`). Without this, audit 2 resumes audit 1's transcript and
the repeat-audit comparison reads its own history as new input.

**Test:** `smoke:reclaim` asserts a fresh `conversationId` on the second run.

---

## I19 — The run owns its conversation

`ReclaimAuditRun.conversationId` is set by the **coach stream route** with the id of the conversation
that route's first turn opens (`app/api/v1/app/reclaim/runs/[runId]/coach/stream`). Write-once: the
update is conditional on the column still being `null`, so a resumed run keeps its original
attribution and two turns racing on the first message cannot disagree.

**It used to be a guess, and the guess was never sound.** `linkRunConversation` looked up the
leader's most-recently-updated active surface conversation and assumed it belonged to this run. That
held only while the coach was rendered nowhere: a transcript left open by a previous audit, or opened
from any other module surface entry, was equally eligible, and a leader who never spoke to the coach
still had a conversation attributed to their run. Cost is logged per conversation and never per run,
so the wrong link is a wrong cost line against a leader.

Two things depend on the link being a fact rather than an inference: the admin cost-per-audit view
(F10 t-1, Brief §8) and **resume** — the conversational surface reads the run's transcript back from
this column, so a leader who reloads mid-phase meets a coach that remembers the last twenty minutes.

**Test:** `smoke:reclaim-run` step 6a asserts the link is written, is not overwritten by a later
conversation, and is read back by `loadCoachTurnTarget`;
`tests/unit/app/api/v1/app/reclaim/coach-stream.route.test.ts` asserts the route resumes the run's own
conversation rather than the resolver's most-recent guess.

---

## I16 — The tool returns people to their own discernment

The tool exists to return people to their own discernment, agency, and wisdom. It offers a mirror
and some options. **The decisions stay with them.** It reflects; it does not decide.

Brief §1 states this "shapes every design choice". Concretely: options are offered, never
prescribed; the action plan asks what they want, not what they should do (I13's sibling in F7); the
close is a coach who believes in them, not a funnel. A short plain statement of what the tool is and
is not lives in the product (§7 of `content-source.md`).

**Why load-bearing:** it is the line between a coaching instrument and an advice engine. Paired with
the §0 frame, it is what keeps the tool from delivering verdicts.

---

## I-frame — This is not a productivity exercise

The governing frame from `content-source.md` §0, carried here because it constrains behaviour, not
just copy. The audit is an invitation to a next level of leadership, which may mean letting go — of
doing too much, of being indispensable, of an identity built on individual output.

Every flag and observation is read in this light. The delivery-and-operations flag is about
identity, not efficiency. The under-delegation invitation is about letting go, not delegation
mechanics. An agent that loses this frame optimises a calendar.

**Test:** covered indirectly by the F2 voice test (no productivity-hack framing) and by review of
the agent's Phase 4 output against `content-source.md` §8.

---

## I-composite — After an upload, the chart shows the composite picture

Where the calendar branch was taken, the Phase 1 visual shows the corrected **composite** picture,
calendar data plus the discursive additions, with a small note where the original estimates differed
significantly from the calendar reality. Where the branch was not taken, it shows the self-reported
data. Never plot raw calendar totals.

**Why this is load-bearing:** discarding the self-reported picture inverts the tool's stance that the
calendar is **evidence, not verdict**. It is the same distinction that makes a gap read as "your
calendar does not capture all your work" rather than "your estimate was wrong" — the first informs,
the second judges (`content-source.md` §8, Phase 1). It also depends on the completeness answer
(`reclaim_calendar_completeness`), which is why that slot is captured before the upload.

**Where it lands:** `reclaim_composite_hours__<bucket>` plus `reclaim_composite_variance_note`
(`slot-spec.md`). Those slots did not exist until 2026-07-23 — this invariant was written, cited in
three documents, and had **nowhere to write to**: `reclaim_current_*` holds the estimate,
`reclaim_calendar_*` holds the calendar, and the composite of the two had no home, so the chart could
only ever have plotted one of them. Do not implement it by appending a second version to
`reclaim_current_hours__*`; slot history would hold both, but "version 2 means composite" is not a
contract, and the perception-vs-reality chart needs both figures at once.

Computed in F5 t-3 (where the calendar reconciliation happens), plotted in F6 t-3, alongside I12.

---

## I17 — Never judged; possibility, not failure

Every flag, empty state, and over-benchmark indicator reads as **possibility, not failure**.
"Everything you name is named as possibility, not failure" (system prompt).

This governs UI copy as much as agent text: a near-zero recovery bucket is named as something worth
looking at, not a red error state; an over-benchmark bar is flagged "without alarm"
(`content-source.md` §8). Vague answers are fine — hours fields accept approximations and say so
(`content-source.md` §11).

---

## I18 — Slow down on emotion

When someone becomes reflective or emotional, especially around overwork or letting go, the tool
does **not** push forward. It slows, holds, and names the referral path to Rashmir where deeper
support is needed. "This is the work. Do not rush past it" (system prompt).

This interacts with the §7 guardrail that the tool never presents as therapy: it does not counsel,
it slows. In the app this is a behavioural rule for the agent plus a pacing constraint — no
auto-advance through a reflection the person is still sitting with.

---

## Quick reference

| #           | Rule                                                                                                                        |
| ----------- | --------------------------------------------------------------------------------------------------------------------------- |
| I1          | Third-person attribution; never speaks as Rashmir                                                                           |
| I2          | Banned lexicon; no em dashes; no bullets in conversation                                                                    |
| I3          | Only `saveAnswer()` calls `appendSlotValue()`                                                                               |
| I4          | Calendar: in-memory, `runStructuredCompletion` only, totals only                                                            |
| I5          | Never `special_category`                                                                                                    |
| I6          | The run comes from the server, never from a model argument; no `request_transition`; the grant is enforced, not just stated |
| I7          | Canonical bucket slugs never change                                                                                         |
| I8          | Hours, never percentages                                                                                                    |
| I9          | Reflection enforced server-side, `422 REFLECTION_REQUIRED`                                                                  |
| I10         | Tier boundaries; never edit `lib/framework/**` or the bridges                                                               |
| I11         | Content loaded verbatim from `sources/`, never paraphrased                                                                  |
| I12         | Chart and interpretation are separate beats; reveal is server-gated                                                         |
| I13         | Refer-back is a data flow, not a prompt                                                                                     |
| I14         | Entitlement at run creation                                                                                                 |
| I15         | `isActive: false` on completion                                                                                             |
| I16         | The tool returns people to their own discernment; it reflects, does not decide                                              |
| I-frame     | Not a productivity exercise; an invitation to lead differently                                                              |
| I-composite | After an upload the chart shows calendar plus discursive, never raw calendar                                                |
| I17         | Never judged; possibility, not failure                                                                                      |
| I18         | Slow down on emotion; slow and refer, never counsel                                                                         |
| I19         | The coach stream writes the run's conversation, write-once; never a timestamp guess                                         |
