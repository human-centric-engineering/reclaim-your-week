# `ryw-conversational` — the audit as a coaching conversation

**Owner:** John · **Status:** stages 0–2 shipped, stages 3+ not yet specified · **Depends on:** F1–F10
(all shipped)

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

| Stage | What                                                                                            | State                     |
| ----- | ----------------------------------------------------------------------------------------------- | ------------------------- |
| 0     | `record_answers` — a conversation produces the same data a form does                            | **shipped** (#50)         |
| 1     | The run-scoped conversation: the leaf stream route, and the run's conversation as a foreign key | **shipped** (this branch) |
| 2     | The conversational phase surface: phase context, the captured panel, the coach re-authored      | **shipped** (this branch) |
| 3+    | Not specified. The candidates the first two stages surfaced are listed under [Open](#open)      | —                         |

**Stages 3 to 5 were never written down.** They existed in a working conversation that is gone. Rather
than reconstruct a plan nobody can check, the open questions the built stages actually raised are
listed below; the next stage should be planned from those.

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

## Open

What the built stages raise, for whoever plans the next one:

1. **The opening turn.** A leader currently has to speak first. A conversation whose method is "ask
   before you tell" arguably should open itself when a phase begins, which means a turn with no leader
   message and a decision about what triggers it.
2. **The chart as a beat, not a sidebar.** I12 says the picture and the interpretation are separate
   beats. In the conversational surface the chart renders below the exchange as soon as anything is
   captured, which is a weaker reading of I12 than the form path's deliberate reveal.
3. **The calendar branch.** F5's upload is a form flow reached from Phase 1. Nothing connects it to
   the conversation yet, so a leader who mentions their calendar in conversation is not offered it.
4. **A conversational Phase 6.** The summary is a document, but "what are you taking away" is a
   question, and the source asks it in conversation.
5. **Cost.** Every phase done conversationally is turns against the per-agent budget. F10's
   cost-per-audit view now has an accurate conversation link (I19) and should be read once real audits
   have run through this path.
6. **`fill_slot` and the profile group.** The coach still holds it, scoped to `reclaim_profile`, from
   before `record_answers` existed. The two overlap now, and the narrower one may be redundant.

---

## References

- [[invariants]] I6 (the run comes from the server), I9 (the reflection gate), I13 (the refer-back),
  I19 (the run owns its conversation)
- [[content-source]] §5d (pacing), §7 (guardrails)
- `.context/app/coverage-audit.md:127` — where the pacing instruction was retired
- PR #50 — stage 0
