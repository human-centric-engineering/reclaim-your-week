# Reclaim Your Week — project invariants

**This file lives at `.context/app/invariants.md` and is referenced from the `CLAUDE.md` banner.**
Every Claude Code session must read it before writing code. These are the rules that
do not travel on their own: each one is a decision that looks arbitrary in isolation and is
load-bearing in aggregate.

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

**Test:** `tests/unit/invariants/voice.test.ts` asserts no first-person-as-Rashmir construction in agent
system prompt content.

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

**Test:** `tests/unit/invariants/voice.test.ts` greps agent config for the banned list and for U+2014.

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
`smoke:reclaim` uploads a real `.ics` and asserts no meeting title exists anywhere in the database.

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

## I6 — The agent reads; it does not write or transition

Granted capabilities: `get_journey_state`, `get_next_steps`, `get_state`. That is the whole list.

**Never** `request_transition` — the server owns phase transitions. **Never** `fill_slot` for any
run-carrying group. The agent may write only `reclaim_profile_*`, which is run-independent,
enforced by the exposure allowlist in `AiAgentCapability.customConfig`.

**Why:** `contextKey` is an LLM-supplied optional argument
(`lib/framework/guidance/capabilities/shared.ts:18-21`). The model can pass any string. Trusting it
for run selection would let a hallucinated key write one run's answers into another.

**Test:** `tests/unit/invariants/agent-caps.test.ts` asserts the exposure config refuses `reclaim_current_*`.

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

---

## I10 — Tier boundaries

Three tiers: **Sunrise → Daybreak → Reclaim Your Week (this app, the leaf)**.

**Ours to edit:**

- `lib/app/*` scaffolds and the three `leaf-*` hooks (`leaf-bootstrap.ts`, `leaf-admin-nav.ts`,
  `leaf-db-drift.ts`)
- `lib/app/programme/**` — domain logic
- `app/api/v1/app/**` — HTTP API
- `app/(protected)/programme/**` — end-user UI
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
summary footnote are **Rashmir's IP**. They live verbatim in `content-source.md` and load into
`Module.config` defaults.

Do not paraphrase, summarise, tighten, or improve any of it. "Recommended ceiling: 10-15% for a
senior leader. Above this is often a signal of under-delegation or difficulty letting go of an
earlier identity as a practitioner" is a diagnostic in her voice. A cleaner version is a different
product.

Anything Rashmir might want to reword must be editable through `Module.config` without a deploy.

---

## I12 — Pacing: chart and interpretation are separate beats

After a big reveal, especially the perception-versus-reality chart, the UI shows the picture, asks
one question, and lets it land. It does not render the interpretation in the same beat.

This is a structural requirement from Brief §5, not a prompt nicety. The component boundary
enforces it.

---

## I13 — The refer-back is a data flow

What the user said at setup about what keeps them up at night must return **in their own words** at
gap analysis. Implemented as a context contributor injecting the verbatim
`reclaim_setup_keeping_me_up` and `reclaim_setup_why_now` slot values for this run.

Brief §5 is explicit: "This is a data-flow requirement, not just prompt text." Do not implement it
by asking the model to remember.

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

Honoured in F6 t-3, alongside I12.

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

| #           | Rule                                                                           |
| ----------- | ------------------------------------------------------------------------------ |
| I1          | Third-person attribution; never speaks as Rashmir                              |
| I2          | Banned lexicon; no em dashes; no bullets in conversation                       |
| I3          | Only `saveAnswer()` calls `appendSlotValue()`                                  |
| I4          | Calendar: in-memory, `runStructuredCompletion` only, totals only               |
| I5          | Never `special_category`                                                       |
| I6          | Agent reads only; no `request_transition`, no `fill_slot`                      |
| I7          | Canonical bucket slugs never change                                            |
| I8          | Hours, never percentages                                                       |
| I9          | Reflection enforced server-side, `422 REFLECTION_REQUIRED`                     |
| I10         | Tier boundaries; never edit `lib/framework/**` or the bridges                  |
| I11         | Content loaded verbatim, never paraphrased                                     |
| I12         | Chart and interpretation are separate beats                                    |
| I13         | Refer-back is a data flow, not a prompt                                        |
| I14         | Entitlement at run creation                                                    |
| I15         | `isActive: false` on completion                                                |
| I16         | The tool returns people to their own discernment; it reflects, does not decide |
| I-frame     | Not a productivity exercise; an invitation to lead differently                 |
| I-composite | After an upload the chart shows calendar plus discursive, never raw calendar   |
| I17         | Never judged; possibility, not failure                                         |
| I18         | Slow down on emotion; slow and refer, never counsel                            |
