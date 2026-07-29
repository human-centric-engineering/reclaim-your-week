---
name: ryw-audit-lifecycle
feature: F16 · ryw-audit-lifecycle
epic: RYW post-v1
status: in flight
owner: John
depends_on: F12 (the board and its gate)
spec: ../invariants.md (I9, I14, I15, I16, I17) · ./post-v1.md (the 2026-07-29 execution-path audit)
parent: post-v1.md
opened: 2026-07-29
---

# ryw-audit-lifecycle — an audit can be left, retried and closed without a dead end

> Three places where the product finishes a thought and then has nowhere to put it. A status that is
> declared and never written, an error that says "you can try again" beside nothing to press, and the
> last textarea in a tool that was rebuilt as a conversation. Parent: [[post-v1]]. Binding _how_:
> **I9** (the reflection gate stays server-side), **I14** (entitlement is decided at creation),
> **I15** (a repeat audit opens a fresh transcript), **I16 / I17** (no pressure, no shame).

## Intent

**This is the feature the execution-path audit was really about.** All three items are the same
shape: a mechanism that exists, is documented, and has no way in.

### 1. `abandoned` is declared and written nowhere

`RUN_STATUS.abandoned` is defined at `runs/service.ts:37`. `grep` across `app/`, `lib/`,
`components/` and `scripts/` finds **one** occurrence: that definition. No route sets it, no UI
offers it, no job writes it.

Meanwhile `createRun` refuses a second run with:

> An audit is already in progress. Complete or abandon the current audit before starting another.

Advice the product cannot take. And the dev database has **two rows** with `status: 'abandoned'`,
set by hand in psql — which is the finding, not a curiosity. Someone hit this and reached for a
database client.

Combined with I14 (the free tier is one _complete_ audit), a leader who starts an audit for the
wrong period, or in the wrong frame of mind, is locked into it permanently.

### 2. A failed turn cannot be retried

`coach-chat.tsx`'s `send()` clears the draft before opening the stream, and the error line reads
"…You can try again" beside no control. `streamChat` has already persisted the leader's message, so
retrying means retyping it and posting it twice.

### 3. Phase 6 is the only phase still a form

The audit was rebuilt as a conversation and phase 6 asks its question with a textarea. The machinery
to do otherwise already exists: `reflectionSlugForPhase('phase-6-summary')` returns
`reclaim_reflection_p6` and `writable-slots.ts` permits the coach to write it. Only the UI does not
use it — and `opening.ts:98-101` still explains phase 6's absence with the I6 reasoning that P19
**reversed** on 2026-07-27.

## Decisions

| Decision                   | Choice                                                                                                                                                                                                                                                                                             |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The verb                   | **`POST /runs/:runId/abandon`.** Not `DELETE` — nothing is deleted and a `DELETE` on a resource that survives is a lie the API tells. Not `PATCH {status}` — that invites a client to set `complete`, and `RUN_STATUS` transitions are the server's.                                               |
| The body                   | **None, not even an optional reason.** Asking why someone is leaving is a retention survey, which I16 and Brief §2 rule out. If Rashmir wants the signal later it is a separate decision with its own consent question.                                                                            |
| The column                 | **A new `abandonedAt`**, never `completedAt`. Three readers treat that as "this audit finished": `listRuns`, `nudges/tick.ts:100` (`completedAt ?? startedAt`), and P9's quarterly timeline in `admin/measures.ts`. Reusing it silently corrupts all three.                                        |
| The conversation           | **Closed, exactly as `completeRun` does.** See the trap below.                                                                                                                                                                                                                                     |
| The entitlement            | **Untouched, and it is already correct.** `consumeAudit` fires in `completeRun`, so an abandoned run has consumed nothing. Abandoning must neither consume nor refund, and a test asserts the grant is byte-identical either side.                                                                 |
| The journey rows           | **Left alone.** `UserJourney` is keyed on `contextKey = runId`, so the abandoned run's journey is already distinct from the next one's. `JourneyEvent` is an audit trail. The correct state is "this journey stopped where it stopped".                                                            |
| Kept or soft-deleted       | **Kept.** `/programme/history` already lists every run regardless of status, so an abandoned audit has somewhere to be and its phases and transcript are still the leader's. Erasure reaches it either way. And `admin/measures.ts` needs the row to answer "how many started and did not finish". |
| What the control is called | **"Start again from the beginning"**, never "Abandon", "Delete" or "Give up". The leader's intent is almost never destruction; it is a fresh start. Naming the control after the thing they want, with the consequence stated plainly beneath, is I17 applied to a lifecycle verb.                 |

### The trap: abandoning must close the conversation, or I15 re-opens by a new door

`completeRun` sets `isActive: false` on the module-surface conversation so audit 2 does not resume
audit 1's transcript. **`abandonRun` must do the same**, and it is the easiest thing in this feature
to miss: without it, the next audit opens with the coach having read the abandoned one's phase 4.

Nothing guards this today. I15 is proved only by `smoke:reclaim-run`, end to end, for the completion
path. So t-1 adds `tests/unit/invariants/conversation-close.test.ts`, which asserts **both** paths
deactivate — the first unit-level guard I15 has ever had.

### Where the control goes (I16, I17)

**Never beside the composer.** A "give up" control next to the question a leader is answering is
pressure in the other direction, and it puts an irreversible act one mis-click from their work.

It belongs where the dead end actually is, and **the build corrected this plan about where that
is.** The plan named `begin-audit.tsx` first. That is wrong: `ProgrammeShell` only renders
`BeginAudit` when `state.run === null`, so a leader who _has_ an open run never sees it — they land
straight back in the audit. The refusal copy it was written against is unreachable from the UI.

So there is one placement, and it is the right one: **the open-audit card on `/programme/history`**.
That is the only screen where a leader can look at the audit they are stuck with and decide.

One confirmation, stating what is kept ("what you have said stays in your history") and what is not
("you will start section 0 again"). No countdown, no typing a word, no second "are you sure".

## Tasks

| t-N | What                                                                                          | Files                                                                                                                         | Status  | PR  |
| --- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------- | --- |
| t-1 | Abandon: the column, the service, the route, the control, the I15 guard.                      | migration, `runs/service.ts`, `runs/[runId]/abandon/route.ts`, `begin-audit.tsx`, `history/audit-history.tsx`, invariant test | ready ▲ | —   |
| t-2 | A failed turn can be retried once, without posting twice.                                     | `coach-chat.tsx`                                                                                                              | ready ▲ | —   |
| t-3 | Phase 6 asks its question in the conversation, and `opening.ts`'s stale comment is corrected. | `coach/opening.ts`, `phase/phase6-panel.tsx`, `programme-shell.tsx`                                                           | ready ▲ | —   |

## Invariants this feature touches

- **I15** — abandoning closes the conversation. New unit guard covering both paths.
- **I14** — entitlement untouched by abandoning; asserted.
- **I9** — unchanged. The reflection gate stays server-side; t-3 changes who asks the question, never
  who may write the answer or what the transition route checks.
- **I16 / I17** — the placement and the wording of the abandon control, and the absence of a reason
  field.
- **I2 / product voice** — new leader-facing copy in two components already classified
  `COACH_VOICED`, so the voice assertions apply without a new classification.

## Notes / deferrals

- **P24 becomes answerable once this ships.** The question to Rashmir changes from "should a stalled
  leader be emailed" to the narrower "given they can always resume and can now let go, is a single
  gentle message still wanted". Ask then, not before.
- **F18 t-2 waits on this**, so that "stalled" on the admin screen has a verb behind it.
- **No admin-side abandon.** Rashmir cannot abandon a leader's run on their behalf, and should not:
  the run is theirs, and an operator closing someone's unfinished work without asking is the opposite
  of what I16 protects.
