---
name: ryw-calendar-reading
feature: F13 · ryw-calendar-reading
epic: RYW post-v1
status: in flight
owner: John
depends_on: F12 · ryw-hygiene (the board rows and the board gate)
spec: ../sources/Time_Audit_Tool_Prompt_Text.md:229-237 (the perception-versus-reality summary) · :314 (specific calendar evidence in the gap) · ../invariants.md (I4, I-composite, I12, I17)
parent: post-v1.md
opened: 2026-07-29
---

# ryw-calendar-reading — the calendar reaches the coach as framed arithmetic

> The optional calendar branch computes a per-bucket comparison between what a leader estimated and
> what their calendar shows, stores it, and then tells the coach almost none of it. This feature
> closes that gap without a second model call. Parent: [[post-v1]]. Binding _how_: **I4** (the
> boundary does not move), **I-composite** (the composite is the picture), **I12** (the pause is not
> shortened), **I17** (evidence, never a verdict).

## Intent

The source is specific about what should happen after an upload
(`sources/Time_Audit_Tool_Prompt_Text.md:233`):

> a summary of the key perception vs reality gaps (what is higher than expected, what is lower, what
> is confirmed)

and about the register that summary must take (`:314`):

> Not just "you are spending too much time on delivery" but "you have 14 hours per week of
> delivery-related meetings, 8 of which are recurring"

**The coach cannot do either today, and the reason is structural rather than a missing instruction.**
`buildChartData` picks the composite **or** the estimate and never both (`chart/series.ts:82`), so
the figures in front of the model are one column. There is no arithmetic anywhere in its context that
could produce "higher than you thought". `phase-context.ts` references the calendar at exactly four
lines: a boolean gate and the `reclaim_calendar_completeness` quote. Every other calendar fact the
branch computes — the per-bucket variance, the rhythm metrics, the leader's own answers about what a
calendar cannot see — reaches the model only through the framework's generic slot-head dump, which is
**unframed, cross-run, and drops `valueJson`** — so the one artefact that holds the actual deltas,
`reclaim_composite_variance_note`, arrives as the sentence "2 bucket(s) diverged from the estimate"
and nothing else.

So a leader does the one effortful optional step in the whole audit, and the coach is told a count.

## The decision that shapes it: arithmetic in code, not a second model

**No second LLM call.** `coach/ideal-week.ts` already settled this pattern for the same class of
problem, and its header says why:

> a coach asked to notice that from memory ... will either miss it or invent a difference that is not
> there. So the arithmetic happens here and the model is given the result.

A model asked to compare two columns of nine numbers will occasionally get one wrong, and a wrong
number in this beat is not a rough edge: it is the tool telling a leader their week is something it
is not, at the exact moment the source says to slow down and ask before telling. The deltas are
already computed and already stored. Handing them over is cheaper, exact, and adds no I4 surface.

**The existing LLM step is untouched.** `calendar/categorise.ts` remains the only model call in the
branch and the only door raw event text goes through. This feature reads slots and writes prose into
a prompt; it does not go near the parser, the categoriser or the persistence boundary.

## Decisions

| Decision                                    | Choice                                                                                                                                                                                                                                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Where `higher` / `lower` come from          | **`reclaim_composite_variance_note.valueJson`**, which is already `VarianceEntry[]`. Recomputing them would let the block disagree with what was persisted and shown.                                                                                                          |
| Where `confirmed` comes from                | **Recomputed**, because `persistComposite` records only _significant_ divergences, so the third of the source's three categories has never existed in the data. The two thresholds are exported from `composite.ts` rather than restated, so one definition governs both.      |
| A second model call for the narrative       | **No** — see above. `ideal-week.ts`'s precedent, and a wrong figure here is worse than a plain one.                                                                                                                                                                            |
| Where the framed block sits                 | In `momentForPhase`'s `CHART_REVEAL_PHASE` branch, in the `uploaded` arm, **after** the completeness quote and **before** the reveal block. The source puts the perception summary in the same beat as the picture; after the reveal block, the coach could not name it there. |
| The unframed head-dump leak                 | **Closed by classifying the derived lanes `visibility: 'hidden'`** — no framework edit, no migration. See below.                                                                                                                                                               |
| Whether the leader's own answers are hidden | **No.** `completeness`, `period`, `switch_frequency`, `reactive_time`, `offcal_work` and `messaging_load` are things the leader typed. `hidden` means system-only; marking leader-authored text hidden to tidy a prompt would be a misclassification for a side effect.        |
| The return-from-calendar beat               | A **data** moment, not an arrival — `COACH_OPENING_TRIGGER`, absent from `ARRIVAL_MOMENTS`. Phase 1 already carries two moments.                                                                                                                                               |

### Closing the head-dump leak is a classification, not a workaround

`loadModuleContext` injects every populated slot head whose `visibility !== 'hidden'`
(`lib/framework/modules/context.ts:49`). **No `reclaim_*` slot sets `visibility` at all**, so all 105
default to `open` and every calendar figure lands in the prompt as a bare `slug: value` line, with no
framing, no I4 context, and no indication of which run it belongs to.

`SLOT_VISIBILITY`'s own vocabulary says `open` means the user sees and edits it and `hidden` means
system-only. A leader edits `reclaim_current_hours__deep_work`. They never edit
`reclaim_calendar_hours__deep_work` — it is derived from a file they uploaded. **So the correct
marker and the leak fix are the same change**, which is what makes this a classification rather than
a prompt tidy.

**The 25 derived lanes:** the nine `reclaim_calendar_hours__*`, the nine `reclaim_composite_hours__*`,
`reclaim_composite_variance_note`, `reclaim_calendar_uploaded`, `reclaim_calendar_total_hours`,
`reclaim_calendar_ambiguous_items`, `reclaim_calendar_events_per_day`,
`reclaim_calendar_back_to_back`, `reclaim_calendar_longest_block`.

> The first draft of this plan said 22. It is 25 — recounted against `slots.ts` rather than carried
> from the sketch, which is the habit [[ryw-hygiene]] exists to enforce.

`syncRegisteredSlotDefinitions` diffs every resolved key, so existing `framework_slot_definition`
rows update at boot. No migration: that table is the framework's.

## Tasks

| t-N | What                                                                                                                   | Files                                                                                                                     | Status  | PR  |
| --- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------- | --- |
| t-1 | The pure reading: `readCalendarReading()` + `calendarReadingLines()`; export the two thresholds from `composite.ts`.   | `lib/app/programme/calendar/reading.ts`, `calendar/composite.ts`, `tests/unit/lib/app/programme/calendar/reading.test.ts` | done    | —   |
| t-2 | The framed block **and** the `visibility: 'hidden'` classification, in one PR.                                         | `coach/phase-context.ts`, `lib/app/programme/slots.ts`, `tests/unit/invariants/calendar-privacy.test.ts`                  | ready ▲ | —   |
| t-3 | The return beat: a `phase-1-calendar-return` data moment, fired when the leader comes back from `/programme/calendar`. | `coach/opening.ts`, `components/app/reclaim/coach/phase-conversation.tsx`, `tests/unit/invariants/chart-beat.test.ts`     | ready ▲ | —   |

**t-2 must be one PR.** Splitting the framed block from the classification opens a window in which
the coach knows **less** about the calendar than it does today, because the leak is currently the
only route by which any calendar figure reaches it.

## Invariants this feature touches

- **I4** — untouched, and the boundary is re-asserted. Nothing new is persisted, no new model call, no
  file read. `reading.ts` is pure over slot answers that already exist. `calendar-privacy.test.ts`
  gains an assertion that every derived lane is `hidden`, which belongs in that file because
  unframed calendar figures crossing runs into a prompt is the same exposure family as titles, one
  step down.
- **I-composite** — honoured by reading `reclaim_composite_hours__*`, never the raw calendar totals.
  The block states in words that the composite is the picture and the calendar alone is not.
- **I12** — the pause is not shortened. The block adds figures, exactly as the chart's own figures are
  already added, and the three-state reveal branch below it is untouched. `chart-beat.test.ts` gains
  a check that the calendar block carries no interpretation ahead of the reveal.
- **I17** — the framing sentence is load-bearing, not decoration: a difference between estimate and
  calendar is **information about what a calendar captures**, never evidence the leader was wrong.
  I-composite's own note makes the same distinction, and it is the difference between a mirror and a
  verdict.
- **I2 / product voice** — no leader-facing copy; the block is prompt material. `voice.test.ts`
  already covers banned lexicon in authored prompt text.

## Two things worth knowing before changing this

**`confirmed` is a complement, and complements rot.** It is every area present in both columns that
the variance list did _not_ record. If `composite.ts`'s thresholds ever change, `confirmed` changes
with them for free — but only because the thresholds are imported rather than restated. Do not inline
them.

**An estimate of zero makes the ratio test meaningless**, so the hours test alone applies there. That
matches `composite.ts:64`'s own `estimate > 0` guard, and it is why the two files must keep sharing
one definition rather than each having a sensible-looking one.

## Notes / deferrals

- **The four qualitative answers still arrive twice** — once framed by this block, once as a bare
  head line — because they are the leader's own words and hiding them would be a misclassification.
  Harmless, and the honest trade. If prompt length ever becomes the constraint, the fix is upstream:
  a framework seam to suppress a head a contributor has already presented.
- **`reclaim_calendar_ambiguous_items`** carries structural fields only; its LLM-authored `reasoning`
  is deliberately dropped at the persistence boundary (`analyse.ts:159-166`). The reading does not
  surface it, and should not start.
