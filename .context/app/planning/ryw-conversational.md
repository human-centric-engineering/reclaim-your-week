# `ryw-conversational` — the audit as a coaching conversation

**Owner:** John · **Status:** **all stages shipped** · **Depends on:** F1–F10 (all shipped)

> **The surface half is [[ryw-chat-ux]]** (post-v1 P19, 2026-07-27). Everything below is about what
> the conversation _does_, and all of it landed. What the first real session through it found is that
> the conversation was still laid out as a **document**: the composer walked off the bottom of the
> page with every turn, a turn that called a tool looked like nothing happening, and the reflection
> was a textarea underneath the conversation rather than a question inside it. That branch also
> **reverses this plan's reading of I6 on reflections** — the coach records the reflection now, under
> three narrower conditions. Recorded there and in [[invariants]] I6; read them together, because
> several sentences below ("only they can save it") describe the rule as it was.

---

## Why

The source prompt says what this tool is, in one line
(`.context/app/sources/Time_Audit_Tool_Prompt_Text.md:84`):

> "Work through the following phases in order. Do not rush. This should feel like a coaching
> conversation, not a form."

What v1 shipped is seven forms. `programme-shell.tsx` routed every phase to a panel and `<CoachChat>`
appeared only in the `default:` branch, which the seven seeded phase keys never reach, so the coach
agent was authored, seeded, bound, streaming-capable, and **rendered nowhere**.

How that drifted is on record rather than mysterious: `.context/app/coverage-audit.md:127` retired
_"one or two at a time. Do not list all nine at once"_ with the note "form solves pacing", and the
forms were built to that reading. Pacing was solved. The conversation was not.

**The forms are not a mistake and are not being removed.** They are the fastest honest way to capture
a hundred slots, they are what proved the data model, and a leader who would rather type into fields
should be able to. What was missing was the thing the tool was designed to be.

---

## The stages

The work was planned as five stages, smallest-provable-thing first. Stage 0 shipped alone (#50); this
branch carries stages 1 and 2 together, because stage 2 has no surface to stand on without stage 1.

| Stage | What                                                                                            | State                                                             |
| ----- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 0     | `record_answers` — a conversation produces the same data a form does                            | **shipped** (#50)                                                 |
| 1     | The run-scoped conversation: the leaf stream route, and the run's conversation as a foreign key | **shipped** (this branch)                                         |
| 2     | The conversational phase surface: phase context, the captured panel, the coach re-authored      | **shipped** (this branch)                                         |
| 3–6   | The phase opens itself: the signpost card, the opening turn, the chart beat, the gap figures    | **shipped**                                                       |
| 7–9   | The calendar branch, the close, and proving it                                                  | **specified** — see [The remaining stages](#the-remaining-stages) |

**Stages 3 to 5 were never written down.** They existed in a working conversation that is gone. Rather
than reconstruct a plan nobody could check, the next stages were planned from the open questions the
built stages actually raised — listed under [What the built stages raised](#what-the-built-stages-raised)
— read back against the sources. That planning pass also found three defects, recorded below.

---

## Stage 0 — capture (shipped in #50)

`record_answers`, the module capability the coach calls mid-conversation to record several readings at
once. Each reading carries `confidence` and `sourceType`, so an inference can be told from a statement.
Three groups refused outright (reflections, sharing consent, the computed calendar lanes), and a typed
slot refused without a typed value. I6 was amended: the rule is about **where the run id comes from**,
not about writing. Full reasoning in the commit message and in [[invariants]] I6.

---

## Stage 1 — the run-scoped conversation

**`POST /api/v1/app/reclaim/runs/:runId/coach/stream`.** The framework's module-surface stream issues a
scope of `{ moduleSlug }`, which is one key short of what capture needs; a run id is a leaf concept the
framework has no vocabulary for, so the route that supplies it is the leaf's. It verifies the run is
the caller's and in progress, reads the phase from the journey, and builds the dispatch scope with
`buildCoachScope`. Nothing in that map comes from the model.

**The run owns its conversation ([[invariants]] I19).** `linkRunConversation` used to guess: the
leader's most-recently-updated active surface conversation was assumed to be this run's. That was only
ever true by accident — a transcript left open by a previous audit was equally eligible — and cost is
logged per conversation, so a wrong link is a wrong cost line against a leader. The route now writes
the id of the conversation its first turn opens, write-once, and `GET /runs/current` returns it so a
reload can read the transcript back.

---

## Stage 2 — the phase, as a conversation

**The coach is told where it is, every turn.** `buildCoachPhaseContext` names the phase, the readings
that phase captures, and which of them **this run** already holds. Run-scoped on purpose: the
framework's own module context injects slot _heads_, which on a second audit still hold the first
audit's answers, so a coach reading only that would open audit two believing it already knew the
leader's week.

**A second finding, and the larger of the two: the coach never had the content.** Its system
instructions have said since F2 that "the tool's governing frame and the areas of leadership time are
supplied to you in context", and I11 is the reason they are not restated in the authored prose. Nothing
supplied them. `loadModuleContext` injects the module's name, description and the user's slot values;
`Module.config` — where the frame, the nine areas with their benchmarks, the deep-work note and the
hour bands live — has never reached a prompt. It did not show while the phases were forms, because the
panels read that config directly and the coach was rendered nowhere. A conversational Phase 1 cannot
run without it: a coach asked to work through nine areas it has not been given would invent them,
which is exactly the drift the content chain exists to prevent. The phase block now carries the frame
in every phase, the areas and the deep-work note in phases 1 and 3, and the hour bands plus the
under-delegation invitation at the gap, read from the stored config so an operator's rewording reaches
the conversation the same way it reaches the screen.

**A bug fell out of wiring that up.** The leaf's context contributor was registered under
`'reclaim-audit'` — a conversation's `contextId`, not its `contextType` — so it had never been
dispatched, and the I13 refer-back that Brief §5 calls "a data-flow requirement, not just prompt text"
had never reached the coach. The test could not see it: it mocked the registry and asserted only the
loader's output. Fixed by registering under `MODULE_CONTEXT_TYPE` and delegating to the framework's
own loader, with the key now pinned by a test.

**The panel is the honesty mechanism, not decoration.** The coach records inferences. An inference
nobody sees is a figure in a leader's audit that they never said and cannot correct. So a reading that
came from between the lines, or at low confidence, is shown as one and offered back: confirming records
`user_confirmed`, correcting writes the leader's own figure over the top. A reading stated plainly sits
quietly.

**What stays with the leader stays with the leader.** The reflection that gates a phase, the sharing
consent, and the move to the next phase. The coach may ask and may offer words; the leader saves them.
The server enforced all three already; the surface now matches.

**The coach's instructions were re-authored**, because they still said it did not record audit answers.
A new seed unit (`003-reclaim-coach-voice`) applies the authored prose to an existing agent row, since
`002` seeds prose create-only — which meant, until now, that shipping a change to the voice changed
nothing on an installed database.

---

## Decisions taken

- **Conversation is the default for phases 0 to 5; the form is one click away.** Both write the same
  slots through the same server path (I3), so the choice can change mid-phase without losing anything.
  The preference is remembered in `localStorage`, per leader. No flag, no column, no server state.
- **Phase 6 stays a panel.** Its content is the summary the leader takes away and the sharing choices,
  and consent is not something a coach may record.
- **The authored voice in code is the source of truth for the agent's four prose fields.** The trade is
  that an admin edit to _this_ agent's prose is overwritten when the authored text next changes.
  Rashmir's editing surface is the content configuration, which is untouched by this.
- **The panel labels the nine areas from the canonical bucket titles**, honouring a leader's own
  relabelling (I7), and labels every other slot from a short authored list rather than from its slug.

---

## What the built stages raised

Recorded when stages 1 and 2 shipped, and each now assigned to a stage below:

| #   | Raised                                                                                                                               | Closed by |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 1   | **The opening turn.** A leader has to speak first. A conversation whose method is "ask before you tell" should open the phase itself | 3 + 4     |
| 2   | **The chart as a beat, not a sidebar.** It renders as soon as anything is captured, a weaker reading of I12 than a deliberate reveal | 5         |
| 3   | **The calendar branch.** Nothing connects F5's upload to the conversation                                                            | 7b        |
| 4   | **A conversational Phase 6.** The summary is a document, but "what are you taking away" is a question                                | 8a + 8b   |
| 5   | **Cost.** Every conversational phase is turns against the per-agent budget, and should be read once real audits have run             | 9         |
| 6   | **`fill_slot` and the profile group.** It overlaps `record_answers` now, and the narrower one may be redundant                       | 7a        |

---

## Three defects the planning pass found

Each is verified against the tree, and each is fixed in the stage named.

**1. I6's "stated twice on purpose" second layer does not exist for `record_answers`** (fixed in 7a).
`agent.ts:139` and `coach/writable-slots.ts:22` both say the framework's `facetAllows` enforces the
write allowlist a second time. It does not. `facetAllows` has exactly two call sites — `fill-slot.ts`
and `get-state.ts` — and `record-answers.ts` never reads `context.customConfig`, so the grant's
`customConfig` is inert data. **The writes are still correctly constrained**, by `checkSlotWrite` in
code, which is the layer that actually runs; what is false is the claim that two layers hold it. And
`tests/unit/invariants/agent-caps.test.ts:36` defines its **own local mirror** of `facetAllows` and
asserts against that — so the guard passes while enforcing nothing. That is precisely the failure mode
[[invariants]] I13 records about the context contributor, in a second place, found the same way: by
reading what the code does rather than what the docblock says.

**2. `/programme/calendar` is linked from nowhere** (fixed in 7b). Not from `Phase1Panel`, not from
the shell, not from the conversation. `calendar-entry.tsx` was built with the note "F6 will link here
from Phase 1" and F6 never did. So F5 has been unreachable except by typing the URL since it merged —
a v1 bug, not a conversational gap, and the reason the fix belongs in both paths.

**3. The `reclaim_calendar` group mixes computed lanes with leader self-reports** (narrowed in 7a).
Six of its thirteen slots — `completeness`, `period`, `switch_frequency`, `reactive_time`,
`offcal_work`, `messaging_load` — are things the leader says, not things the parser computes. I6
refused the whole group on a reading that is right about the lanes and wrong about the self-reports,
which leaves the coach unable to record the answer to a question the source explicitly tells it to ask.

---

## The remaining stages

Each is one PR through the [[building-a-feature]] gate loop. **3 and 4 are hard prerequisites; 5, 6
and 7 are independent of each other once 4 lands.**

| Stage | Delivers                                                     | Closes | State       |
| ----- | ------------------------------------------------------------ | ------ | ----------- |
| 3     | The deterministic signpost card, content in `Module.config`  | 1      | **shipped** |
| 4     | The server-triggered opening turn, and the moment ledger     | 1      | **shipped** |
| 5     | The chart as a beat (I12), both paths, server-gated          | 2      | **shipped** |
| 6     | The phase-4 gap data flow and its opening turn               | —      | **shipped** |
| 7a    | I6 amendment, real exposure enforcement, `fill_slot` removal | 6      | **shipped** |
| 7b    | The calendar hand-off and the unreachable-route bug          | 3      | **shipped** |
| 8a/8b | The close: the takeaway, then the warm close                 | 4      | **shipped** |
| 9     | `smoke:reclaim-coach`                                        | 5      | **shipped** |

**Stages 3 to 6 shipped together**, as one branch. They are the prerequisite chain — 5 and 6 have no
trigger without 4, and 4 has nothing to open without 3 — and they read as one story: the conversation
now opens itself, and the two beats that need figures land as beats rather than as running totals.

**Nothing was left deferred.** Stage 3 first shipped without its content-editor half, on the
reasoning that `content-diff.ts` would label our orientation copy "differs from source" — a sentence
about a source document that copy does not have. That was a real problem and a bad reason to stop:
the prerequisite was one field. `ContentField.sourceKind` distinguishes Rashmir's words from ours,
the marker reads "as shipped" for the latter, the diverged count is taken over her fields only, and
the signposts now have their own section in her editor. Phase 0's outline stays marked as hers, which
is the whole reason `opening` is an array of separately-comparable beats.

### Stage 3 — the deterministic signpost card

Honours the signposting mandate (`Prompt_Text.md:31`), the warm open (`:90`), the process outline
ending "Ready to begin?" (`:92`), and the nine-bucket map (`:117`).

A new `phaseSignposts` key on `Module.config`, each entry carrying `involves`, `duration` and an
**array** of opening paragraphs. The array is load-bearing: phase 0's default is
`[RECLAIM_WARM_OPEN, RECLAIM_PROCESS_OUTLINE]`, and the outline is already pinned character-identical
to a [[content-source]] blockquote by I11 hop 2. Concatenating the two would drop Rashmir's verbatim
outline out of the guarded set; as an array, hop 2 gains one line. Everything else in `opening` is
app-authored orientation copy, which `runs/signposts.ts` already says it is, so I2 binds it through
`product-voice.test.ts`.

**One I11 correction lands here.** `admin/content-diff.ts` renders every field as "matches the source
document" or "edited — differs from source". That sentence is a lie about app-authored fields, which
have no source document. `ContentField` gains `sourceKind: 'rashmir' | 'authored'` and the marker says
"matches the shipped wording" for the latter. Without it the screen quietly attributes our orientation
copy to Rashmir, which is the inverse of what I11 protects.

`buildCoachPhaseContext` must also quote the card back and say "do not restate it" — the agent's own
signposting instruction otherwise makes turn one duplicate the screen.

### Stage 4 — the server-triggered opening turn

**The constraint.** `streamChat` requires a non-empty `message` and persists it as a `role:'user'`
`AiMessage` **before** the LLM call. There is no greeting, opener or first-message concept anywhere in
Sunrise, Daybreak, or the `AiAgent` schema, and `AiMessage.metadata` is written only by the framework's
`persistMessage`. So a leaf cannot mark a turn as synthetic anywhere except in its text. Both halves
are filed as Daybreak asks; the sentinel is the workaround until one lands.

The stream route's body becomes a discriminated union on `kind`, `'leader' | 'opening'`. **The client
never sends the phase** — the route reads it from the journey and refuses a moment that does not belong
to it, so both halves of the scope stay server-derived and I6's stance carries through unchanged.

**The moment is claimed atomically, before generating**, with a conditional `updateMany` on a new
`ReclaimAuditRun.coachOpenings` scalar list. Two tabs, a StrictMode double-effect and a reload
mid-stream all collapse to one turn. Claim-first trades a rare silent failure — a failed generation
leaves the moment marked and the leader with no opener, though they can always speak first — for a
common expensive one. The route header must say so, or a future session will helpfully move the write
to the end.

The synthetic trigger reads as a stage direction rather than a magic token, because it stays in the
model's history for the rest of the run. It is filtered on rehydrate **and from
`admin/export.ts`** — a leader exporting their data would otherwise find a message attributed to them
that they never sent.

Wire exactly one moment here, `phase-5-action`: it needs no new context, so the stage proves the
mechanism without also proving a data flow.

### Stage 5 — the chart as a beat (I12)

Honours `:229` ("one of the most important moments"), `:231` ("do not proceed to Phase 2 until this
has been presented"), `:235` (name the gaps specifically, then pause, then one question) and `:237`.

**The reveal condition is wrong in both paths, identically** — `capturedCount > 0` in the
conversation, `anyHours` in the panel. A v1 bug the conversational path inherited, so the form path
gets the same fix. A new pure `chart/reveal.ts` gates on every visible bucket having hours, and on the
composite existing where the calendar was uploaded (I-composite: never plot raw calendar totals).

**I12 says "the component boundary enforces it". After this stage that is true in three ways:** the
chart component emits no prose and sits alone; the coach's reveal turn is given the figures and told
to stop at one question; and **the server refuses the transition out of phase 1 until the moment is
recorded** — `422 CHART_REVEAL_REQUIRED`, in the same shape as the reflection gate. That third one is
what turns `:231` into something checkable, and it is the argument I9 already won: a UI-only pause is
not a pause.

It is a new server refusal on an existing path, so it belongs on its own line in the PR body. Blast
radius is one extra click: a leader with no hours captured could not advance anyway.

### Stage 6 — the gap data flow and its opening turn

`:235` demands "you estimated about 15% on delivery and operations, your calendar shows closer to
30%", which is a data flow and not a prompt — the same class of requirement as I13. The phase-4 block
gains per-bucket current-versus-ideal deltas, the weekly total against its hour band, and which buckets
sit over or under benchmark, all computed from the already-loaded `readRunAnswers`. Then the
`phase-4-gap` moment is wired.

The test that matters is **run-scoped**: a second run with different answers gets different figures and
the first run's slot heads do not leak. That is the bug stage 2 was written to prevent.

### Stage 7a — the I6 amendment, real enforcement, `fill_slot`

Three changes at the capability layer, no UI. It changes an invariant, so it is reviewed alone.

**Narrow the calendar refusal** to a named slug exception: `reclaim_calendar_completeness` and
`reclaim_calendar_period` become writable, because they are the answers to two questions the source
tells the tool to **ask** (`:144`, `:148`) before any file exists, and `:146` says the completeness
answer modulates all downstream framing. The other four self-reports stay refused: they are asked on
the review screen after the upload, where they belong, and opening them now would give the coach four
questions with no beat to ask them in.

**Make the second layer real.** `CapabilityContext.customConfig` is already surfaced by the dispatcher
and documented as readable inside `execute()`. `record-answers.ts` parses it with `exposureConfigSchema`,
fails closed on malformed, and ANDs `facetAllows` with `checkSlotWrite`. The two layers then say
complementary things: the grant is the operator-tunable outer bound (which groups at all), the code is
the product rule (which slugs within them, and the typed-value rule). Because `facetSchema` is strict
on `{ groups, scopes }`, the slug exception cannot be expressed as data — so I6 must say it lives in
code alone until that ask lands.

**Remove `fill_slot`.** `record_answers` covers `reclaim_profile` and is strictly safer, since its run
comes from the server. Keep the `contextKey` reasoning in `agent.ts` as the historical note that
justifies `record_answers`' shape. And **a seed unit must revoke the existing grant row**: `002` seeds
create-only and `003` applies prose, so without a `004` reconciling grants to the authored list the
removal ships as a no-op on every installed database — the same class of failure `003`'s own header
describes.

### Stage 7b — the calendar hand-off, and the route nobody can reach

Honours the offer after all buckets (`:136-138`), the two framing questions (`:144`, `:148`), what
completeness modulates (`:146`), export help by service (`:152-179`), the hand-off line (`:181`), and
`:370` — the calendar is an optional branch within Phase 1 whose absence does not diminish the audit.

Every gate is **data**, not model judgement: the offer appears once `chartRevealReady()` is true, which
is the same predicate as "after completing the discursive exploration of all buckets"; the export steps
appear once completeness is captured.

**No deep link.** `CalendarEntry` already resolves the leader's own run from `/runs/current` — the
server deciding — and a run id in a URL is a parameter someone will eventually trust. So the hand-off
is a plain link out and a plain link back.

**No new mechanism is needed for the return.** Remounting re-reads the run's answers, and
`buildCoachPhaseContext` calls `readRunAnswers` every turn. What is new is that the phase-1 block must
**say** it, in I-composite's stance: where the estimate and the calendar differ, that difference is
information about what the calendar does not capture, not evidence the leader was wrong. Without that
sentence the coach reads a difference as a correction, which is the exact judgement the tool must not
make.

Before any offer text reaches `content.ts`, verify it exists as a blockquote in [[content-source]] —
the nine-altered-blockquotes audit specifically found calendar export steps present in no source
document. Never paraphrase from a source doc straight into code; the extract is the middle hop for a
reason.

### Stage 8a — Phase 6, the takeaway as a question

`:35` asks "what are you taking away from this?" **before** producing the summary. Today that question
lands in `ReclaimFeedback.text` and **only if the leader chooses to share** — so the product asks it of
a subset, after the artifact, into a table about sharing.

A new `reclaim_reflection_p6` slot in the `reclaim_reflection` group, which is coach-refused (I6) and
leader-saved — exactly right for a reflection, and needing no I6 change. The coach asks and may offer
words back; the leader saves; saving reveals the summary, the same beat shape and the same reason as
the chart.

**The shell routing is untouched** — `CoachChat` is embedded inside `Phase6Panel` as bounded beats. A
third mode fights the two-mode model for no gain. And `reflectionSlugForLeaving` is deliberately **not**
extended: gating run completion on this would be a new refusal on the finish button that nobody asked
for.

### Stage 8b — the close

`:359` branches the close by client tier and says the consultation offer appears **once only**, and
`:361` says the affirmation varies each time. The tier is a server fact, so it belongs in the phase-6
context block. "Once only" is a per-user fact where `coachOpenings` is per run, so it is answered by
querying the leader's earlier runs rather than by adding a column for one boolean. And the coach must
be told to vary the affirmation **and not repeat the one `Phase6Panel` already renders**, or the leader
reads the same sentence twice on one screen.

One collision to resolve rather than ship: `:35`'s "what are you taking away from this?" (everyone,
before the summary) and Brief §3's "In a sentence: what did you take from this?" (sharers only, after)
read as a repeat if both are asked verbatim. The share step should reference the saved takeaway instead
of re-asking it.

### Stage 9 — proving it

**Stages 3 to 8 are built on an untested assumption about how a real model behaves with these
instructions**, because everything to date is unit-tested against mocks. Proving last is the owner's
call, taken deliberately; the cost of a bad answer here is rework in 5, 6 and 8.

`scripts/smoke/reclaim-coach.ts` uses the `smoke:reclaim` pattern — real Postgres, stubbed LLM — so it
needs no provider key and **can join CI**, unlike `smoke:reclaim-calendar`. It walks the opening turn's
idempotence, the synthetic message's absence from both the transcript and the export, and the
chart-reveal gate.

The eval fixture uses the framework's own evaluation infrastructure (`AiDataset`, the code-side grader
registry, `processPendingEvaluationRuns()`), following `scripts/verify-eval-run.ts`. It targets the
beats no unit test can see: does the reveal turn name a gap specifically and then **stop**; does the
phase-4 turn read the delivery flag as identity rather than efficiency (I-frame); does any turn use an
em dash or a banned term, which I2 checks on the authored prose and on nothing the model emits. It is
the only guard that can reach I-frame, I13, I16 and I17, which [[invariants]] currently lists as
specification rather than guard.

**What shipped is the smoke, and not the eval fixture.** `smoke:reclaim-coach` calls no model, so it
runs in CI like the other three: it asserts the parts mocks cannot reach, and the sharpest of those is
that five concurrent claims on one moment produce exactly one winner. A conditional `updateMany` that
silently matches nothing looks identical to one that worked, right up until two tabs open the same
beat.

The **eval fixture was not built**, and that is a decision rather than an omission. It would need a
real provider key, so it could only ever be a second manual gate beside `smoke:reclaim-calendar` —
and the thing it would measure is how a model behaves under these instructions, which is worth
measuring against a real conversation rather than against fixtures written by the same person who
wrote the prompt. The honest next step is a leader using it. That strengthens
[[planning/post-v1|post-v1]] P16's nightly-workflow option rather than settling it.

---

## Where the source was not followed literally

The source prompt was written for a Claude Project, where a conversation was the only surface there
was. Several of its beats exist for that reason rather than because a conversation is the best place
for them, and the Brief says as much: the hybrid design "solves problems the chat version could not".
Three places where the app deliberately does something else:

- **The calendar export walkthroughs are a screen, not a recital.** The source has the coach read out
  six steps for Google, six for Outlook, five for Apple. Those are a list you scan while tabbing to
  another window. They are also the exact content the transcription audit found had been **invented**
  at some point, with Outlook menu items appearing in no source document — and a model asked to recall
  menu steps is how that happens again. [[content-source]] had already reached the same conclusion
  ("shown at the upload step"), so this is the extract's reading rather than a departure from it.
- **The takeaway is asked once.** `Prompt_Text.md:35` asks "what are you taking away from this?"
  before the summary; Brief §3 asks sharers "in a sentence, what did you take from this?" afterwards.
  Both verbatim reads as a repeat. Everyone is asked once, before the summary, and the sharing step
  carries what they wrote and asks only for permission to quote it.
- **The phase openings are scripted where they are not data-dependent.** A signpost is the same
  sentence every time, so a model turn buys nothing and costs a leader's per-minute budget. The four
  beats that need figures in front of them get a real turn. The takeaway question is on the card for
  the same reason; the close after it is a turn, because it branches on tier, on history, and on what
  the leader just said.

## Decisions taken for stages 3 to 9

- **The opening is hybrid: a scripted card always, a model turn only where data must be presented.**
  The signpost is orientation, not coaching judgement, and the source scripts it — so it costs nothing,
  burns no rate limit, and stays editable by Rashmir. The model opens only the Phase 1 reveal, the gap,
  the action options and the takeaway, which are the four moments that need figures.
- **The calendar hand-off carries no run id.** The server already resolves the leader's run; a run id
  in a URL is a parameter someone will eventually trust.
- **Phase 6 is embedded, not routed.** The takeaway becomes a conversation inside the existing panel;
  the summary, consent and referral do not move, because consent is not something a coach may record.
- **The opening moment is claimed before the turn is generated,** not after.
- **I6's two-layer claim is corrected rather than quietly satisfied.** The second layer is built
  because the invariant should describe what runs; a rule documented as enforced twice and enforced
  once is worse than a rule enforced once and known to be.
- **The calendar group's refusal is narrowed by slug, not opened by group.** The grant permits
  `reclaim_calendar` so the two pre-upload questions can be recorded; the code keeps every computed
  lane shut. The two layers are deliberately not identical, because a facet cannot express a
  slug-level rule at all.
- **"Once only" for the consultation offer is derived, never stored.** A leader who has completed an
  audit before has already been offered it, so `hasCompletedAudit` answers the question from data
  that is already correct for other reasons. No flag, no ledger entry, nothing new to keep true.

---

## References

- [[invariants]] I6 (the run comes from the server), I9 (the reflection gate), I11 (content is loaded,
  not authored), I12 (chart and interpretation are separate beats), I13 (the refer-back), I-composite
  (never plot raw calendar totals), I19 (the run owns its conversation)
- [[content-source]] §4b (the ten questions), §5d (pacing), §7 (guardrails)
- [[daybreak-asks]] — five rows land with stages 4 and 7a: no seam for a server-composed opening turn,
  `AiMessage.metadata` unreachable from a leaf, no slug-level facet on `facetAllows`, no leaf-reachable
  writer for per-phase run progress, and module capabilities not inheriting exposure enforcement
- `.context/app/coverage-audit.md` §Phase 0 **G20** — where the pacing instruction was retired, and why
  that one line best explains the drift
- PR #50 — stage 0 · PR #51 — stages 1 and 2

**Invariant amendments land with the code that changes behaviour, not here.** I12 is rewritten in
stage 5 (the three enforcement mechanisms and the `422 CHART_REVEAL_REQUIRED` gate), I6 in stage 7a
(the `fill_slot` removal, the calendar slug exception, and the corrected enforcement claim), I11 in
stage 3 (`sourceKind`, and the signpost config joining the editable-without-a-deploy set), I9 in stage
8a (the phase-6 takeaway is leader-saved and does not gate completion).
