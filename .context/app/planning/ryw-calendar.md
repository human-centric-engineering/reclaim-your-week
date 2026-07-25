---
name: ryw-calendar
feature: F5 · ryw-calendar
epic: RYW v1
status: in flight
owner: John
depends_on: F4 · ryw-shell (shipped #27–#30/#32)
spec: ../invariants.md (I4, I-composite, I5, I8, I12, I17) · ../content-source.md §8 · ../slot-spec.md (reclaim_calendar 21 · reclaim_composite 10) · lib/orchestration/llm/structured-completion.ts · lib/app/programme/slots/write.ts (the seams)
parent: plan.md
opened: 2026-07-25
---

# ryw-calendar — the optional `.ics` branch

> Feature-level build plan for **F5 `ryw-calendar`**, the optional reality-check that compares a
> leader's self-reported estimates against their actual calendar. Parent:
> [[plan#F5 · `ryw-calendar` — the optional branch|plan.md]].
> Binding _how_: [[invariants]] (**I4** calendar never persists per-event data, **I-composite** the
> chart shows the composite not raw calendar, I5 no `special_category`, I8 hours not percentages, I12
> chart≠interpretation, I17 possibility not failure) and [[content-source]] §8. Sizing follows the
> parent: **task = one PR**; commits sit below that resolution.

## Intent

F4 made the audit hold a real run. F5 adds the **optional** step where a leader uploads their calendar
export and the tool reconciles what they _estimated_ (F6's Phase 1, self-reported) against what their
calendar _shows_. It is optional and **loudly so** (Brief §3): the privacy promise is the product's
trust story, not a checkbox — several testers were anxious about this step, and Rashmir asked that the
promise be unmissable.

The whole feature turns on one invariant. **I4 — the calendar never persists per-event data.** The
`.ics` never touches disk; it is read in memory, categorised in a **single `runStructuredCompletion`**
call (never `streamChat`, which would persist meeting titles as `AiMessage` rows), and only **per-bucket
totals** are stored. No event titles, attendees, or descriptions anywhere, ever. This is the feature
where that promise is made structural.

Two things this feature owns that the parent is explicit about:

- **The composite is computed here, not in F6** (I-composite). After an upload, the Phase 1 chart must
  show calendar data **plus** the off-calendar work the "what the calendar misses" questions surface —
  not raw calendar totals (which would discard the self-report and invert the tool's stance that the
  calendar is _evidence, not verdict_). F5 t-3 writes `reclaim_composite_hours__*` and
  `reclaim_composite_variance_note`; **F6 t-3 only plots them.**
- **The [X]/[Y]/[Z] framing is arithmetic, not copy** ([[content-source]] §8). X =
  `reclaim_calendar_total_hours`, Y = `reclaim_setup_weekly_hours`, Z = Y − X. A placeholder rendered
  literally, or a negative Z when the calendar exceeds the self-report, both read as a broken tool at
  the audit's most delicate moment. Handle **Z ≤ 0** explicitly.

## Reconciliation against the live repo

Verified during planning, 2026-07-25. Every seam F5 consumes shipped with F2/F4; confirmed shape and
found **four things that shape the tasks** (one a likely [[daybreak-asks]] candidate).

- **`runStructuredCompletion` exists and does _not_ persist a conversation** — the exact property I4
  needs. `runStructuredCompletion(opts)` (`lib/orchestration/llm/structured-completion.ts:112`) takes
  `{ provider, messages, responseSchema?, responseSchemaName?, model, … }` and returns a validated
  `StructuredCompletionResult<T>`; it calls `provider.chat(...)` directly with a `json_schema` response
  format and writes **no `AiMessage`/`AiConversation`** (it is the evaluations/extract path, not the
  chat path). So categorisation via this call leaves nothing in the DB — meeting titles enter memory,
  produce per-bucket numbers, and are discarded. **The categorisation prompt is the one place raw
  titles exist; they must never be echoed into a slot value or a log.**

- **The provider must be resolved before the call — `runStructuredCompletion` does not do it.** Providers
  come from `getProvider(slug)` / `getProviderWithFallbacks(...)` (`lib/orchestration/llm/provider-manager.ts`).
  **Decision for John:** categorise with the module's configured provider (server-side model selection,
  Claude-only per Brief §3) — reuse the coach agent's provider/model, or name a dedicated cheaper model
  for the deterministic categorisation? Recommend: resolve the module's bound provider and use a single
  capable model; a second "categorisation model" config knob is F10-content-editing scope, not F5.

- **`saveAnswer` already carries a typed `valueJson`** (`lib/app/programme/slots/write.ts`) — the write
  path for the numeric per-bucket totals (`value` = the plain reading, `valueJson` = the `number`) and
  the `reclaim_calendar_ambiguous_items` (`json`). It is the **only** slot writer (I3), keys masking on
  the registered definition, and stamps `provenance.runId`. All 21 `reclaim_calendar_*` and 10
  `reclaim_composite_*` slugs are **already registered** (F2 t-2, verified in `lib/app/programme/slots.ts`),
  so F5 writes to existing definitions — no new slot declarations.

- **No calendar table to add, and that is the point (I4).** F4's schema (`app-reclaim.prisma`) has no
  calendar/event table by design; calendar data lives **only** as slot values. F5 adds **no** Prisma
  model. The one place a `git diff` on `prisma/` would be a red flag.

- **In-memory multipart is an established pattern** — `app/api/v1/users/me/avatar/route.ts`,
  `.../chat/transcribe/route.ts`, `.../knowledge/documents/route.ts` all read `request.formData()` →
  the file, in memory. F5's upload route mirrors that but **never** writes the file anywhere: `formData()`
  → `.text()` → parse → categorise → totals, then the buffer falls out of scope. `uploadLimiter`
  (`lib/security/rate-limit.ts`) exists for the per-flow sub-cap the LLM-over-uploaded-file sub-flow
  needs (the expensive sub-flow `CLAUDE.md` carves out of the inherited 100/min section cap).

- **`ical.js` is not yet a dependency** — F5 t-1 adds it. RRULE expansion (recurring events counted per
  instance, [[content-source]] §8) is the reason for a real iCalendar library rather than a hand parser;
  `ical.js` handles VEVENT + RRULE + VTIMEZONE. Pure parse module, no DB/network.

## Invariants this feature touches

| Invariant                            | How F5 honours it                                                                                                                                                                                                                    | Guard                                                                                                                                                                                                                                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **I4** (no per-event data)           | `.ics` read in memory (`formData()`→`text()`, never to disk); categorise via **one** `runStructuredCompletion` (never `streamChat`); persist **per-bucket totals only**                                                              | `tests/unit/invariants/calendar-privacy.test.ts` — grep the calendar path (`lib/app/programme/calendar/**` + the upload route) asserts **no** `streamChat` import; wired into `leaf:checks`. `smoke:reclaim-calendar` uploads a real `.ics` and asserts **no meeting title anywhere in the DB** |
| **I-composite** (composite, not raw) | t-3 computes `reclaim_composite_hours__*` = calendar per-bucket **+** the off-calendar work the "what the calendar misses" questions surface, with `reclaim_composite_variance_note` recording where estimate diverged from calendar | unit test on the composite computation: given calendar totals + off-calendar answers, the composite ≥ calendar and the variance note names the diverging buckets; **F6 t-3 plots it**                                                                                                           |
| **I5** (no `special_category`)       | the two `sensitive` calendar slots (`reclaim_calendar_reactive_time`, `_offcal_work`, `_messaging_load`) route through `slotMaskingPolicy` via `saveAnswer` like every write                                                         | covered by the existing `slot-sensitivity` invariant test (no `reclaim_*` is `special_category`)                                                                                                                                                                                                |
| **I8** (hours, never %)              | totals and the composite are **hours**; any percentage in the review UI is a derived _display_ value, never stored                                                                                                                   | the per-bucket slots are `number` hours (`reclaim_calendar_hours__*`); reviewed in the diff                                                                                                                                                                                                     |
| **I12** (chart ≠ interpretation)     | the perception-vs-reality chart (F6) and the "what stands out to you?" pause stay separate beats; F5 surfaces the numbers, not the verdict                                                                                           | code review of the review UI; the chart itself is F6                                                                                                                                                                                                                                            |
| **I17** (possibility, not failure)   | a gap is framed as "the calendar does not capture all your work", **not** "your estimate was wrong" — modulated by `reclaim_calendar_completeness` (captured before upload)                                                          | copy review of the review-UI framing against §8                                                                                                                                                                                                                                                 |

## Test strategy

vitest runs on `happy-dom` with **no live DB** ([[building-a-feature]] §1.2). So:

- **Parser (t-1)** — pure, fixture-driven. Four `.ics` fixtures — a recurring weekly event, an all-day
  event, a timezoned event, a multi-calendar file — assert instance expansion, duration totals, and
  all-day handling. No DB, no LLM.
- **Categorise + persist (t-2)** — unit test mocking the provider (`runStructuredCompletion`'s
  `provider.chat`) and `saveAnswer`: assert the categorised totals are written per bucket, personal
  events excluded, ambiguous items captured as `json`, and — the load-bearing one — **no meeting title
  reaches any `saveAnswer` value** (assert the written values are numbers/derived text, never a raw
  summary). Plus the **I4 grep test** (no `streamChat` import in the calendar path), in `leaf:checks`.
- **Composite (t-3)** — pure unit test on the reconciliation function: calendar totals + off-calendar
  answers → composite hours + variance note; Z ≤ 0 handled.
- **Real-DB fidelity (t-4)** — `smoke:reclaim-calendar` (new script, mirrors `reclaim-run.ts` /
  `reclaim-erasure.ts`): a real Google `.ics` fixture through the actual upload path against real
  Postgres, then **scan every text column of `app_reclaim_*` and `framework_slot_value` for any meeting
  title from the fixture** — assert zero. This is the machine proof of I4.

## Promoted tasks

| id  | Intent                                                                                                                | Files likely to touch                                                                                                                                                                 | Deps | Status | PR  |
| --- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------ | --- |
| t-1 | Add `ical.js`; pure in-memory `.ics` parser with RRULE expansion                                                      | `package.json`, `lib/app/programme/calendar/parse.ts`, `tests/unit/lib/app/programme/calendar/parse.test.ts`, `tests/fixtures/calendar/*.ics`                                         | F4   | todo   | —   |
| t-2 | Upload route: in-memory, one `runStructuredCompletion`, per-bucket totals via `saveAnswer` (I4)                       | `app/api/v1/app/reclaim/runs/[runId]/calendar/route.ts`, `lib/app/programme/calendar/categorise.ts`, `tests/unit/invariants/calendar-privacy.test.ts`, `package.json` (`leaf:checks`) | t-1  | todo   | —   |
| t-3 | Review UI (by-bucket + ambiguous confirm gate) + the [X]/[Y]/[Z] & task-switching questions + composite (I-composite) | `app/(protected)/programme/**`, `components/app/reclaim/calendar/**`, `lib/app/programme/calendar/composite.ts`                                                                       | t-2  | todo   | —   |
| t-4 | Both privacy messages at the upload step; `smoke:reclaim-calendar` proving no title in DB                             | `components/app/reclaim/calendar/**`, `scripts/smoke/reclaim-calendar.ts`, `package.json` (`smoke:reclaim-calendar`)                                                                  | t-3  | todo   | —   |

> **Sizing note.** Four tasks, one PR each. t-1 (parser) and t-3 (review UI + composite) are the two
> heavy ones; t-2 is the privacy-critical core; t-4 is the message surfacing + the machine proof. The
> parser is deliberately split from the upload path (t-1 vs t-2) because it is pure and fixture-testable
> in isolation, and because the privacy boundary (t-2) is where review attention concentrates — keeping
> it a focused diff is worth a PR. **Watch:** if the categorisation prompt + schema in t-2 grows past a
> reviewable size alongside the route, split the prompt/schema into its own commit within t-2, not a new
> task.

### t-1 — `ical.js` + the pure parser

- Add `ical.js`. `lib/app/programme/calendar/parse.ts`: `text` → normalised events
  `{ start, end, durationMinutes, isAllDay, summary, description, calendarName }`, **RRULE expanded to
  one entry per instance** within the analysed window (recurring events count per instance, §8). Pure —
  no DB, no network, no `saveAnswer`. `summary`/`description` exist **only** in this in-memory shape and
  are consumed by t-2's categoriser; they are never persisted.
- Fixtures + tests: recurring weekly, all-day, timezoned (VTIMEZONE), multi-calendar. Assert instance
  counts, duration sums, all-day handling, and that a longer window expands more instances.

_Done when:_ the four fixture shapes parse correctly; RRULE expands per instance; type-check + `leaf:checks`
green. _Gates:_ `commit → /pre-pr → /security-review → format → push → open PR → /code-review`.

### t-2 — upload route + categorise (the privacy core, I4)

- `POST /api/v1/app/reclaim/runs/[runId]/calendar` under `withAuth`, run-owned (mirror t-3's
  `loadOwnedRun`; `runId` is the server-owned key, never an LLM arg — I6). Read `request.formData()` →
  the file → `.text()` **in memory**; the raw file is never written to disk or a slot.
- Categorise via **one** `runStructuredCompletion` (resolved provider, `responseSchema` = per-bucket
  hours + ambiguous items + the structural metrics): filter to the agreed period; categorise by
  title/duration/description informed by the Phase 0 context; **personal events excluded automatically**
  (borderline → flagged to ask); **ambiguous generic titles flagged individually with best guess +
  reasoning**; multiple calendars → note primary; file too large → honest error asking for a shorter
  period ([[content-source]] §8). **Never `streamChat`.**
- Persist via `saveAnswer` **only** the per-bucket totals (`reclaim_calendar_hours__*`),
  `reclaim_calendar_total_hours`, the task-switching metrics (`_events_per_day`, `_back_to_back`,
  `_longest_block`, `_switch_frequency`), `reclaim_calendar_uploaded = true`, and the ambiguous items as
  `json`. **No title, attendee, or description in any value.**
- Per-flow rate-limit sub-cap inside the handler (the LLM-over-uploaded-file expensive sub-flow,
  `CLAUDE.md` rule). I4 grep test (no `streamChat` in the calendar path) wired into `leaf:checks`.

_Done when:_ an upload writes only totals + metrics + ambiguous json via `saveAnswer`; no `streamChat`
import in the path (test); the categorise unit test proves no raw title reaches a value; rate-limit
sub-cap present. _Gates:_ full loop — **`/security-review` earns its keep here** (I4 is the trust story;
pay special attention per [[building-a-feature]] §2).

### t-3 — review UI + the questions + the composite (I-composite)

- Review UI (consumer surface): categorisation **by bucket** (events, hours, % as _derived display_ —
  I8), **ambiguous items listed individually to confirm**, and **do not proceed until the leader
  confirms or corrects** — a gate. A correction reassigns hours between buckets; it does **not** re-run
  the LLM (deterministic, cheap, and keeps the raw file out of a second call).
- The **[X]/[Y]/[Z] arithmetic** (X `reclaim_calendar_total_hours`, Y `reclaim_setup_weekly_hours`,
  Z = Y − X) with **Z ≤ 0 handled explicitly** (calendar meets/exceeds the self-report → a different,
  non-alarming framing, not a negative "unaccounted" number). Then the "what typically fills that time?",
  messaging-load, and off-calendar-commitments questions, and the task-switching follow-ups
  (`_switch_frequency`, `reactive_time`) — §8.
- **The composite (I-composite), computed here:** `lib/app/programme/calendar/composite.ts` writes
  `reclaim_composite_hours__*` = calendar per-bucket **+** the off-calendar work attributed by the
  "what the calendar misses" answers, and `reclaim_composite_variance_note` recording where the Phase 1
  estimate diverged significantly from calendar reality. **Decision for John:** how off-calendar hours
  (Z) attribute to buckets — by the leader's own answer to "what fills that time?" (recommend), with any
  unattributed remainder held in the variance note rather than silently spread. F6 t-3 plots this; F5
  computes it.
- Analyse the **full** uploaded period but compare on the **overlap** with the Phase 0 period; surface
  seasonal patterns from a longer window separately, so they don't distort the like-for-like comparison
  (§8).

_Done when:_ review renders by bucket; ambiguous confirmation is a real gate; [X]/[Y]/[Z] correct incl.
Z ≤ 0; composite written to `reclaim_composite_*` with a variance note; unit test on the composite.
_Gates:_ full loop (**`/code-review`** — UI-over-backend + the composite data model, per [[planning-retro]] §B).

### t-4 — privacy messages + the machine proof

- Both privacy messages surfaced **at** the upload step (optional; details never stored) — unmissable,
  in the reassurance register (I4 is the trust story). Not buried in a tooltip.
- `smoke:reclaim-calendar` (new script): a real Google `.ics` fixture through the actual upload path
  against real Postgres, then scan every text/json column of `app_reclaim_*` and `framework_slot_value`
  for any meeting title from the fixture — assert **zero**. Add the `smoke:reclaim-calendar` script.

_Done when:_ both messages visible at upload; the smoke uploads a real `.ics` and proves no title in the
DB. _Gates:_ full loop; `/security-review` again for the surfaced-file path.

## Notes / deferrals

- **F5 gates nothing.** It hangs off F4 and **enriches** F6/F7 (the composite plot, the perception-vs-
  reality chart) without gating them — F6 can proceed in parallel and simply shows the self-reported
  picture when the branch was not taken (`reclaim_calendar_uploaded = false` → composite group stays
  empty → chart falls back to `reclaim_current_hours__*`).
- **No calendar table, no file on disk, no `streamChat`** — the three structural facts that make I4
  real. Any PR that adds a `prisma/` model, writes the upload to storage, or imports `streamChat` in the
  calendar path has broken the feature's reason to exist.
- **Live calendar connection (OAuth) is parked** (Brief §3 defers it; the privacy surface is larger) —
  v1 is `.ics` upload only.
- **Possible [[daybreak-asks]] shape:** if the categorisation needs a "structured completion that is
  guaranteed never to persist" as an explicit framework contract (rather than relying on
  `runStructuredCompletion` happening not to write), that guarantee is a generic privacy-sensitive need
  worth a framework seam. Note it if t-2 finds the non-persistence is incidental rather than contractual.
