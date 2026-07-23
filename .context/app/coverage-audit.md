# Reclaim Your Week — source coverage audit

> **Status (2026-07-23): all 19 gaps resolved.** The fixes listed at the end of this document have
> been folded into `content-source.md` (§0, §4a, §8 expansions, §11, §12, the checkpoint decision),
> `slot-spec.md` (four new slots, 91 → 95), and `invariants.md` (I16, I-frame, I17, I18). This file
> is retained as the audit trail — it shows _what_ each source instruction became and _why_, which
> is the reasoning a feature plan needs when it decides how to honour a given instruction. Read it
> when planning a feature that touches the calendar branch (F5), the perception-vs-reality moment or
> priority-gap (F6), or the refer-back (F7), where the "carries / becomes UI / retired" calls matter
> most.

Every instruction in the four source documents, checked against the build plan. Each carries a
disposition:

| Mark           | Meaning                                                                               |
| -------------- | ------------------------------------------------------------------------------------- |
| **CARRIES**    | Must survive into the app, verbatim or near-verbatim. Belongs in `content-source.md`. |
| **BECOMES UI** | The intent survives; the chat mechanism is replaced by structure.                     |
| **RETIRED**    | Exists only because the tool ran inside a Claude Project. Dies with the migration.    |
| **GAP**        | Should be in the plan and is not. Fix listed.                                         |

---

## Summary

**19 gaps found.** Six of them are material — they change what gets built, not just how it is
described. Those are marked **★**.

| #    | Gap                                                                                 | Severity |
| ---- | ----------------------------------------------------------------------------------- | -------- |
| G1 ★ | "This is not a productivity exercise" — the framing that governs the whole tool     | Material |
| G2 ★ | Priority-gap flag: flagging a stated priority with no time against it               | Material |
| G3 ★ | Calendar parsing rules (personal / recurring / ambiguous / multi-calendar / size)   | Material |
| G4 ★ | Perception-vs-reality: do not proceed until presented; gap may be off-calendar work | Material |
| G5 ★ | Emotional-response handling: slow down, refer to Rashmir                            | Material |
| G6 ★ | Composite picture: calendar plus discursive, not raw calendar                       | Material |
| G7   | Phase 0 process outline (the "here is what we will cover" script)                   | Moderate |
| G8   | Three calendar export walkthroughs                                                  | Moderate |
| G9   | Calendar-period framing question and the overlap rule                               | Moderate |
| G10  | Signposting: phase, what it involves, how long                                      | Moderate |
| G11  | Vague answers are fine; work with estimates and say so                              | Moderate |
| G12  | Never make the client feel judged; possibility not failure                          | Moderate |
| G13  | Categorisation review: by bucket, wait for confirmation                             | Moderate |
| G14  | Task-switching questions (the two follow-ups)                                       | Minor    |
| G15  | Strategy mirror ("if a stranger read your calendar")                                | Minor    |
| G16  | Recent-audit shortcut (audit within the last month)                                 | Minor    |
| G17  | Checkpoint summaries — retired too fast, without a decision                         | Minor    |
| G18  | Charts at Phase 1, 3 and 6 specifically                                             | Minor    |
| G19  | Setup Guide reassurance register                                                    | Minor    |

---

# Part 1 — System prompt

## §Your Role

| Instruction                                                                                                                                                                                                                                                                                                                     | Disposition                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| "warm, direct, and insightful leadership coach"                                                                                                                                                                                                                                                                                 | **CARRIES** — captured in F2.4                                                       |
| "designed by Rashmir Balasubramaniam, a regenerative strategy advisor and leadership coach who works at the intersection of inner development, leadership development, organisational development, philanthropic strategy, and systemic impact"                                                                                 | **CARRIES, re-pointed** — her positioning is captured; the third-person change is I1 |
| Guide them to "lead with more ease, more impact, and less force"                                                                                                                                                                                                                                                                | **CARRIES** — ✗ **G1**                                                               |
| **"This is not a productivity exercise. It is an invitation for the leader to step into their next level of leadership. That may require some letting go, e.g. of doing too much, of being indispensable, of an identity built around individual achievement, effort and output. Hold that possibility with care throughout."** | **CARRIES** — ✗ **G1 ★**                                                             |
| How to paste into a Claude Project                                                                                                                                                                                                                                                                                              | **RETIRED**                                                                          |

**G1 ★ — the missing frame.** This paragraph is the tool's thesis. Everything downstream reads
differently in its light: the delivery-and-operations flag is about identity, not efficiency; the
under-delegation invitation is about letting go, not delegation mechanics. Without it an agent
optimises a calendar. Add to content source §0 and to the F2.4 persona block, ahead of tone.

## §Your Tone and Approach

All seven tone bullets, the banned lexicon, em dashes, filler phrases, no bullets in conversation:
**CARRIES** — captured in content source §5a/§5b, tested in F2 t-4.

## §Signposting

| Instruction                                                                 | Disposition                                     |
| --------------------------------------------------------------------------- | ----------------------------------------------- |
| Orient at each phase start: which phase, what it involves, roughly how long | **CARRIES** — ✗ **G10**                         |
| Example: "We are now moving into phase two…"                                | **CARRIES** — ✗ **G10**                         |
| "prevents the process from feeling open-ended"                              | **BECOMES UI** — progress bar does part of this |

**G10.** The progress bar shows position, not duration or content. Rashmir's reason is engagement.
Each phase needs its own signpost line. Add to content source, wire into F6/F7.

## §Coaching approach

Captured — content source §5e. The "what are you taking away from this?" before Phase 6 is in F7.4.

## §The Framework

Nine buckets, deep work note, hour bands: **CARRIES** — content source §1–§3. Complete.

## §The Flow — preamble

| Instruction                                                      | Disposition                             |
| ---------------------------------------------------------------- | --------------------------------------- |
| "Work through the following phases in order. Do not rush."       | **BECOMES UI** — captured               |
| **"This should feel like a coaching conversation, not a form."** | **CARRIES** — partially at risk         |
| "Carry context forward explicitly throughout"                    | **CARRIES** — I13 covers the refer-back |

**Note, not a gap.** "Not a form" is in tension with the hybrid design Rashmir endorsed. She
resolved it: forms for numbers, conversation for coaching. But F6.1 builds a form for Phase 0 and
that is the phase the source most wants to feel like a welcome. Worth a line in F6.1 that the form
is warmly framed rather than bare fields.

## §Phase 0

| Instruction                                                                     | Disposition                           |
| ------------------------------------------------------------------------------- | ------------------------------------- |
| Open warmly, explain what the audit is and what they walk away with             | **CARRIES** — ✗ **G7**                |
| **The full "Before we begin, here is what we will cover together…" script**     | **CARRIES** — ✗ **G7**                |
| Ten questions                                                                   | **BECOMES UI** — F6.1, all ten mapped |
| "one or two at a time. Do not list all nine at once"                            | **RETIRED** — form solves pacing      |
| Fundraising follow-up changes the benchmark                                     | **CARRIES** — captured, slot exists   |
| Time period: quarter default, year has recency bias                             | **CARRIES** — content source §4       |
| Recent-audit shortcut: audit within the last month → confirm rather than re-ask | **BECOMES UI** — ✗ **G16**            |
| Reflect context back before moving on                                           | **BECOMES UI** — ✗ (form review step) |

**G7.** The process outline is the first thing a user reads and it sets expectation for the whole
session. It should open the run, before the setup form. Add verbatim to content source §4.

**G16.** F9.2 opens repeat audits comparatively but has no "within a month" shortcut that skips
re-asking stable context. Add to F9.2.

## §Phase 1

| Instruction                                               | Disposition                                       |
| --------------------------------------------------------- | ------------------------------------------------- |
| **Show all nine buckets first so they hold the full map** | **BECOMES UI** — ✗ (overview screen before cards) |
| Deep work is cross-cutting, a quality of attention        | **CARRIES** — content source §2                   |
| Per bucket: hours, and what it looks like in practice     | **CARRIES** — F6.2                                |
| Deep work's three extra questions                         | **CARRIES** — F6.2                                |
| Delivery above 15% → name gently, not criticism           | **CARRIES** — F6.2                                |
| Oversight 20%+ may be appropriate; intentional vs default | **CARRIES** — F6.2                                |

The "show all nine first" instruction is small but real: an overview before the cards, not straight
into bucket one.

## §The calendar branch point

| Instruction                                                             | Disposition                     |
| ----------------------------------------------------------------------- | ------------------------------- |
| The branch offer, verbatim                                              | **CARRIES** — content source §8 |
| **Calendar-completeness question ("live and die by their calendar…")**  | **CARRIES** — captured          |
| High confidence vs partial → lighter or heavier "what's missing"        | **CARRIES** — ✗ **G9**          |
| **"The composite picture is the real picture, not the calendar alone"** | **CARRIES** — ✗ **G6 ★**        |
| **Calendar-period question and the overlap rule**                       | **CARRIES** — ✗ **G9**          |
| **Three export walkthroughs (Google, Outlook, Apple)**                  | **CARRIES** — ✗ **G8**          |
| "Take your time. When you have the file, upload it here"                | **BECOMES UI**                  |

**G6 ★.** The composite rule determines what the Phase 1 chart shows after an upload: calendar data
_plus_ discursive additions, not raw calendar. Without it F6.3 will plot calendar totals and quietly
discard the self-reported picture, which inverts the tool's stance that the calendar is evidence,
not verdict.

**G8.** Users need these at the upload step. The Setup Guide has Google; the system prompt has all
three. Add verbatim.

**G9.** Two related rules: how completeness modulates the later questions, and that a longer window
is analysed in full but the comparison focuses on the overlap, with seasonal patterns surfaced
separately.

## §Parsing the calendar file — **G3 ★**

Currently one compressed clause in the F5 prompt. All of this is missing:

| Rule                | Detail                                                                                                                                    |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Filter              | To the agreed period from Phase 0                                                                                                         |
| Categorise          | Using title, duration, description, informed by Phase 0 context                                                                           |
| **Personal events** | Dentist, school pickup, gym → noted and excluded automatically. Borderline → ask: recovery, or exclude?                                   |
| **Recurring**       | Count each instance for the quantitative view. Surface the pattern narratively: "a weekly 90-minute leadership team meeting every Monday" |
| **Ambiguous**       | Generic titles ("Meeting", "Call", "Catch up") → flag individually, state best guess **with reasoning**, ask to confirm                   |
| **Multi-calendar**  | Ask which is the primary work calendar; note personal data separately                                                                     |
| **File size**       | Too large → say so honestly, ask for a shorter period                                                                                     |

These are behavioural requirements for the categorisation step regardless of interface. Add as a
full subsection to content source §8 and expand F5.2.

## §Categorisation review — **G13**

By bucket, not event-by-event: events, hours, percentage per bucket. Ambiguous items listed
individually. Ask "Does this look right? Anything you would move?" **Wait for confirmation before
proceeding.** F5.3 has the shape but not the wait-for-confirmation gate.

## §What the calendar misses

Three questions captured. ✗ The framing sentence "Your calendar accounts for roughly [X] hours out
of the [Y]… That leaves around [Z] unaccounted" needs the arithmetic wired to real slot values.

## §Task switching analysis

| Instruction                  | Disposition                                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------------------------- |
| Five structural metrics      | **CARRIES** — F5.2 has four; missing "how frequently they switch between bucket types in a day" |
| Present a brief profile      | **CARRIES** — captured                                                                          |
| **Two follow-up questions**  | **CARRIES** — ✗ **G14**                                                                         |
| Fragmentation cost paragraph | **CARRIES** — captured                                                                          |

**G14.** "On a typical day, how often do you switch between fundamentally different types of work?
And when you have unscheduled time, does it stay protected or does it get consumed by reactive
work?"

## §The perception vs reality comparison — **G4 ★**

| Instruction                                                                                               | Disposition                               |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| **"This is one of the most important moments in the audit"**                                              | **CARRIES** — ✗                           |
| **"Do not proceed to Phase 2 until this has been presented"**                                             | **CARRIES** — ✗ (a gate, like reflection) |
| Grouped bar chart, same colour coding                                                                     | **CARRIES** — F6.3                        |
| **Note that the gap may reflect off-calendar work rather than error, based on their completeness answer** | **CARRIES** — ✗                           |
| Include: gap summary, seasonal patterns, emerging habits                                                  | **CARRIES** — ✗ partially                 |
| Name gaps specifically, with the worked example                                                           | **CARRIES** — ✗                           |
| Then pause. "What stands out to you here?"                                                                | **CARRIES** — I12 covers                  |
| After they respond, add what they missed                                                                  | **CARRIES** — captured                    |

The off-calendar note is the difference between "your estimate was wrong" and "your calendar does
not capture all your work". The first judges; the second informs. That distinction is the tool's
whole stance.

## §Phase 1 visual output

| Instruction                                                                                                                           | Disposition              |
| ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Composite picture when the branch was taken                                                                                           | **CARRIES** — ✗ **G6 ★** |
| Small note where estimates differed significantly                                                                                     | **CARRIES** — ✗          |
| Nine colours                                                                                                                          | **CARRIES** — captured   |
| Horizontal bars, benchmark markers, hours + %, total, over/under flags                                                                | **CARRIES** — F6.3       |
| **Which buckets advance which stated priorities, and flag any priority with no time against it — "often the most important insight"** | **CARRIES** — ✗ **G2 ★** |

**G2 ★.** Entirely absent from the plan. It needs the Phase 0 priorities mapped against bucket
allocation and rendered as a distinct element. Rashmir names it the most important insight in the
chart; it is not currently being built.

## §Checkpoint instruction — **G17**

Plan says "retired, replaced by auto-save". Half right. Auto-save replaces _resumption_. It does
not replace the per-phase recap, which consolidates and gives a sense of progress. **Decision needed
from Rashmir**, not an assumption. Recommend: keep a lightweight end-of-phase recap on screen, drop
the copy-paste instruction.

## §Phase 2

Two questions captured. ✗ Missing: "Where useful, brainstorm with them how to make that work given
their team distribution/working hours" — connects to `reclaim_profile_distributed_impact`.
✗ Missing: the note that a dedicated coaching conversation can go further here (one of the few
in-flow places Rashmir sanctions signalling coaching).

## §Phase 3

Four questions, the "suspiciously similar" challenge, side-by-side chart: **CARRIES** — captured.
✗ "Frame this as a realistic target, not a fantasy" is missing.

## §Phase 4

| Instruction                                                                                        | Disposition                                 |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Four gap questions                                                                                 | **CARRIES** — mostly captured               |
| Under-delegation invitation, verbatim                                                              | **CARRIES** — captured                      |
| "This is an invitation, not a diagnosis"                                                           | **CARRIES** — captured                      |
| Calendar-specific evidence, with the worked example                                                | **CARRIES** — captured                      |
| 55+ hours: reclaim sustainable hours, "sometimes the most strategic thing a leader can do is stop" | **CARRIES** — ✗ the closing line is missing |

## §Phase 5

Three options, specificity example, three commitment questions, journey framing, forward-leaning
close: **CARRIES** — captured.

## §Phase 6

Eight summary contents, footnote, consultation-once rule, email handling, closing affirmation:
**CARRIES** — captured. ✗ "For clients already working with Rashmir, invite them to share ahead of
their next session" — a distinct path for existing clients, which F8's client tier could drive.

## §Important Notes

| Instruction                                                                                                  | Disposition                      |
| ------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| Carry context forward; connect the dots                                                                      | **CARRIES** — I13                |
| Checkpoint per phase                                                                                         | **G17**                          |
| **Visuals at end of Phase 1, 3 and 6**                                                                       | **CARRIES** — ✗ **G18**          |
| HTML/CSS rendered inline                                                                                     | **RETIRED** — components replace |
| **Vague answers fine; work with estimates and name that you are doing so**                                   | **CARRIES** — ✗ **G11**          |
| **Emotional or reflective → slow down. "This is the work." Refer to Rashmir where deeper support is needed** | **CARRIES** — ✗ **G5 ★**         |
| Calendar is a branch, not a mode; absence does not diminish value                                            | **CARRIES** — captured           |
| Returning-audit protocol                                                                                     | **BECOMES UI** — F9.2            |
| **Never make the client feel judged. Possibility, not failure**                                              | **CARRIES** — ✗ **G12**          |
| Never attribute to Claude or Anthropic                                                                       | **CARRIES** — I1                 |

**G5 ★.** The one place the source tells the tool to stop the process and respond to the person.
Rashmir put it in the system prompt deliberately. It interacts with Brief §6 (never presents as
therapy) and needs a named referral path to her. Currently nowhere in the plan.

**G11.** Affects UI: hours fields must accept approximations without demanding precision, and say so.

**G12.** The register rule for every flag, empty state, and over-benchmark indicator. Belongs in
I2 or its own invariant.

---

# Part 2 — Brief

Checked section by section. **Well covered**, with three exceptions.

| Section                                              | Coverage                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §1 Intent (three purposes, discernment principle)    | ✗ The **discernment principle** — "this tool exists to return people to their own discernment, agency, and wisdom… It offers a mirror and some options. The decisions stay with them" — is stated to "shape every design choice". Not in the plan. Belongs as an invariant. |
| §2 Access, patterns, offers, knowledge base, repeats | ✅ Captured                                                                                                                                                                                                                                                                 |
| §3 Defaults and amendments                           | ✅ Captured                                                                                                                                                                                                                                                                 |
| §4 Voice                                             | ✅ I1, thoroughly                                                                                                                                                                                                                                                           |
| §5 Coaching craft (six marks)                        | ✅ Five captured; strategy mirror is **G15**                                                                                                                                                                                                                                |
| §6 Guardrails                                        | ✅ Captured. ✗ Minor: the work-life-vs-personal-life boundary, allowed "within limits"                                                                                                                                                                                      |
| §7 Brand and register                                | ✅ Captured. ✗ The **reassurance register** — "it is okay if you are not using your time optimally yet… no one is judging you" — is listed as copy Rashmir owes, but it is a design constraint on the whole product                                                         |
| §8 Access tiers                                      | ✅ Captured                                                                                                                                                                                                                                                                 |
| §9 V2 horizon                                        | ✅ Out of scope, seams noted                                                                                                                                                                                                                                                |
| §10 Costs and platform                               | ✅ Claude-only captured                                                                                                                                                                                                                                                     |

---

# Part 3 — App Notes (John's proposal)

Superseded by the Brief where they differ. Everything Rashmir endorsed is captured: hybrid design,
hours not percentages, required reflections, calendar handling, auto-save, voice reuse, GDPR,
admin pages, repeat audits.

✗ One item: **"who's abandoned at which phase"** is in F10.1, but nothing tracks abandonment. Needs
a phase-progress read at the run level. Small, worth naming.

---

# Part 4 — Setup Guide and User Prompts

Almost entirely **RETIRED** — Pro account, project creation, system prompt pasting, model
selection, the three copy-paste prompts, checkpoint pasting, Files upload, troubleshooting.

Two things **CARRY**:

**G19 — the reassurance register.** "The audit is only as useful as the honesty you bring to it.
Claude will not judge you. What you see in the data is there to help you, not to assess you." Plus
the encouragement to ask questions, engage, and challenge. This is the Brief §7 register in
Rashmir's own words. It belongs on the landing page and in the run's opening.

**The privacy note.** "If you choose to share your results, they may be used in line with Rashmir's
privacy and data policy… Your individual data will always remain confidential." Real wording for
the F7.4 share step, not a placeholder.

---

# Fixes, in order

**To `RYW_Content_Source.md`:**

1. New §0 — the "not a productivity exercise" frame (G1 ★)
2. §4 — the Phase 0 process outline, verbatim (G7)
3. §8 — three export walkthroughs (G8)
4. §8 — full calendar parsing rules as a subsection (G3 ★)
5. §8 — categorisation review, including wait-for-confirmation (G13)
6. §8 — calendar-period question and overlap rule (G9)
7. §8 — perception-vs-reality in full: the gate, the off-calendar note, the worked example (G4 ★)
8. §8 — composite-picture rule (G6 ★)
9. §8 — two task-switching follow-ups (G14)
10. §5 — signposting pattern per phase (G10)
11. New §11 — response register: never judged, estimates fine, emotional handling (G5 ★, G11, G12)
12. New §12 — the reassurance register from the Setup Guide (G19)
13. §10 — share privacy wording

**To `RYW_Invariants.md`:**

14. **I16 — the discernment principle.** The tool returns people to their own discernment, agency
    and wisdom. It offers a mirror and options; decisions stay with them. Brief §1 says it shapes
    every design choice.
15. **I17 — never judged.** Every flag, empty state and over-benchmark indicator reads as
    possibility, not failure.
16. **I18 — slow down on emotion.** When someone becomes reflective or emotional, especially around
    overwork or letting go, the tool does not push forward. Deeper support routes to Rashmir.

**To `RYW_Build_Plan.md`:**

17. **F6.3** — add the priority-gap element (G2 ★). Needs Phase 0 priorities mapped to buckets.
18. **F6.3** — composite picture, not raw calendar, after an upload (G6 ★)
19. **F5.2** — full parsing rules (G3 ★)
20. **F5.3** — confirmation gate before proceeding (G13)
21. **F5/F6** — perception-vs-reality as a hard gate before Phase 2 (G4 ★)
22. **F6.1** — show all nine buckets before the cards; warm framing on the form
23. **F7.1** — Phase 2 brainstorm on team distribution; coaching-conversation signal
24. **F7.2** — strategy mirror (G15); the "sometimes the most strategic thing is to stop" line
25. **F7.4** — distinct close for existing clients
26. **F9.2** — recent-audit shortcut (G16)
27. **F10.1** — abandonment tracking needs a phase-progress read
28. **All phases** — signpost line (G10); charts at 1, 3, 6 (G18)
29. **Decision for Rashmir** — checkpoint summaries: keep as on-screen recap, or retire? (G17)

**New slots needed:**

- `reclaim_calendar_ambiguous_items` (json) — items flagged for confirmation
- `reclaim_calendar_switch_frequency` (text) — the fifth structural metric
- `reclaim_calendar_reactive_time` (text) — whether unscheduled time stays protected
- `reclaim_gap_strategy_mirror` (text) — the stranger-reading-your-calendar answer

Slot count moves from 91 to **95**.
