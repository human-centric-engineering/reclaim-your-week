---
name: ryw-chat-ux
description: The conversational surface, redesigned as a chat surface — a frame that owns the viewport, a narrated turn, speech-paced text, and the reflection asked in the conversation rather than under it.
parent: post-v1.md
---

# `ryw-chat-ux` — the conversation, as a conversation looks

**Owner:** John · **Status:** **shipped** — #56 (2026-07-27), #57 (2026-07-28), #58 (2026-07-29) ·
**Depends on:** [[ryw-conversational]] (all stages shipped)

> Planned as one branch and delivered as three. Each merge put the surface in front of a real leader,
> and each time the next thing wrong with it only became visible once the previous one was fixed —
> the frame (`app/(programme)/`) was not in the original plan at all. Recorded because the plan-first
> bar in [[post-v1]] assumes a branch is scoped before it starts, and this one genuinely was not.

---

## Why

[[ryw-conversational]] made the audit a conversation. It closed the gap the v1 close-out found: the
coach was authored, seeded, bound and streaming, and rendered nowhere. The behaviour landed — the
phase opens itself, the chart lands as a beat, the close asks before it tells.

**The surface did not.** Used as a leader, on `/programme` phase 1, four things were wrong, and they
are the four this branch fixes:

1. **You had to scroll down to type.** Every turn pushed the composer further below the fold, with the
   reflection box and the continue button further below that. Talking to the coach meant scrolling
   past what you had already said to find the box you say the next thing in.
2. **Nothing said the coach was working.** Between Send and the first token — which for this agent
   includes a `record_answers` round trip — a leader got an empty paragraph and a lone pulsing bar.
3. **The reply arrived in lumps**, in whatever chunk sizes the provider sent.
4. **"What stands out to you here?" was a form field bolted under a conversation** — the one question
   the coaching method is built around, asked by a textarea.

The first three are one problem wearing three hats: the conversation was laid out as a document. The
fourth is a decision, and it is the interesting one.

---

## The layout could never have worked, and that is worth writing down

`coach-chat.tsx` had `min-h-[26rem] flex flex-col` around a `flex-1 overflow-y-auto` transcript —
textbook. But **no ancestor bounded the height**: the shell was `max-w-5xl … py-10`, the phase
conversation was `space-y-10`, and core's `app/(protected)/layout.tsx` is
`container mx-auto … py-8` inside `min-h-screen`. A `flex-1` child of an unbounded column grows to
its content, so `overflow-y-auto` never engaged, the page scrolled instead, and the
`scrollRef.current?.scrollTo(...)` call in the autoscroll effect was a **no-op that had never once
run against an overflowing element**.

So the fix could not be a class on the chat. It had to be a frame, and the layout in the way is
Sunrise-owned.

---

## Decisions taken

**D1 — The audit moved to its own route group, `app/(programme)/`.** Not a fork of core's protected
layout, not an edit to it: a route group does not appear in the URL, so `/programme` and
`/programme/calendar` are unchanged — and so is everything keyed on the URL. The signed-out redirect
comes from `appProtectedRoutes` in `lib/app/protected-routes.ts` (prefix-matched on `/programme`), the
per-route authorisation from `withAuth` on every `/api/v1/app/reclaim/**` route, and the teal/cream
palette from `classifySurface()`, which returns `consumer` for everything outside `/admin`. None of
them cares which folder the file sits in. The layout there is `h-[100dvh] flex-col overflow-hidden`,
which is the line everything else depends on.

What is given up is the platform header and footer. A full-screen conversation should not carry them,
but the way out mattered, so the leaf's own bar (`programme-chrome.tsx`) carries "Leave the audit".

**D2 — Full width, one scroll region.** The frame is a fixed bar, a rail column (`lg`+), the phase,
and a captured-panel column (`xl`+). Only the middle scrolls. The transcript keeps a `max-w-3xl`
measure inside its column so the lines stay readable on a wide monitor — full width for the frame,
not for the prose. Below `lg` the rail becomes a one-line progress strip; below `xl` the panel becomes
a drawer behind a "3 of 19 noted" button.

**D3 — Real deltas, released evenly.** No fabricated typing and no delay after the answer is
complete. The SSE deltas feed `useTypingAnimation` (`lib/hooks/use-typing-animation.ts` — already in
the repo, rAF-driven, written to survive React 19 + bursty SSE), so the words appear at a steady rate
instead of in provider-sized bursts.

**D4 — The `status` frames were already on the wire.** `streaming-handler.ts` emits them and the leaf
stream route pipes every frame through verbatim; the client dropped them. They now drive the
platform's `ThinkingIndicator` — **translated first**, because the raw frame reads
`Executing reclaim_audit__record_answers`, which puts an internal slug in front of a leader and breaks
I1/I2. `components/app/reclaim/coach/status.ts` maps the whole vocabulary, and anything unrecognised
falls back to "Thinking…" rather than passing through.

**D5 — The beats moved into the transcript.** The chart-reveal invitation, the chart, and the calendar
branch render at the tail of the message flow; the move onward sits directly above the composer with a
sentence saying what it is waiting for when it is not offered. Nothing stacks below the conversation
any more. I12 is unchanged: the reveal is still an event, still server-gated by
`422 CHART_REVEAL_REQUIRED`.

**D6 — The coach records the reflection.** Owner decision, and it reverses a documented invariant, so
it is filed as a decision rather than a fix. See below.

**D7 — The form path is untouched.** `<Reflection>` still ships and every form panel still uses it.
It was removed from the conversational path only. Both paths still write through `saveAnswer` (I3).

**Not in scope:** Markdown rendering of coach text, voice input, message editing or regeneration, and
any change to phase 6's panel.

---

## The reflection, and what replaced the refusal

I6 refused `reclaim_reflection` on this reasoning: the reflection slots are the phase gate, so a coach
that can write one can open its own gate. The mechanism is real. The conclusion cost the product the
thing it is for — **helping a leader articulate themselves** — and left the audit's central question
being asked by a textarea in a tool whose source says "not a form".

So the group is permitted, and three narrower guards stand in place of the blanket refusal:

| Guard                       | Holds because                                                                                                                                                                                                                                                                     |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **This phase only**         | The phase comes from the dispatch scope the route builds from the journey. Phase 2 cannot write phase 4's reflection.                                                                                                                                                             |
| **Never `inferred`**        | Refused for a reflection — but the model picks the value, so this disciplines the honest path, it does not enforce it.                                                                                                                                                            |
| **Visible and correctable** | It renders in the captured panel as "In your words". The panel itself carries no box — a leader changes it by saying so, or by taking "I would rather fill this in myself" and using the phase panel's reflection field, which writes over the top through the leader's own path. |

**I9 did not change.** The transition route still returns `422 REFLECTION_REQUIRED` when the slot is
absent for this run. The gate was never "the leader typed into a box"; it was "nobody leaves a phase
until they have been asked what they noticed and have answered". A conversation satisfies that reading
better than the textarea did.

`reclaim_reflection_p6` — the takeaway — is permitted on the same terms, because the close is the one
place the coach was already asking the question and then pointing at a field.

---

## What was built

| Area              | Files                                                                                                                                                    |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The frame         | `app/(programme)/programme/{layout,page,loading}.tsx` + `calendar/page.tsx` (moved from `(protected)`), `components/app/reclaim/programme-chrome.tsx`    |
| The shell         | `programme-shell.tsx` (frame, three regions), `phase-rail.tsx` (`compact` variant)                                                                       |
| The chat          | `coach-chat.tsx` (bounded column, thinking, typing, auto-grow composer, near-bottom autoscroll, `intro`/`beats`/`footer` slots), `coach/status.ts` (new) |
| The phase         | `coach/phase-conversation.tsx` (beats inline, reflection field removed, drawer for narrow screens)                                                       |
| The panel         | `coach/captured-panel.tsx` ("In your words")                                                                                                             |
| The write rule    | `coach/writable-slots.ts`, `coach/capabilities/record-answers.ts`, `runs/phases.ts` (`reflectionSlugForPhase`)                                           |
| The coach's words | `agent.ts` (system instructions + description), `coach/phase-context.ts` (the closing beat, the close)                                                   |
| Paths             | `lib/app/eslint.config.mjs`, `tests/unit/invariants/reachability.test.ts`, `tests/unit/lib/app/defaults.test.ts`                                         |

No schema change, no migration. The grant's group list derives from `COACH_WRITABLE_GROUPS`, so
`npm run db:seed` propagates the new permission (seed `002` upserts `customConfig`; `004`'s
`hashInputs` folds in `agent.ts`).

---

## Tests

Written against behaviour, not mocks, and none of the existing assertions was weakened to fit:

- `tests/unit/invariants/agent-caps.test.ts` — the reflection's four cases (records this phase's;
  refuses another phase's; refuses a turn with no phase; refuses `inferred`), against the real
  `facetAllows` and the real slot definitions.
- `tests/unit/lib/app/programme/coach/record-answers.test.ts` — the same four end-to-end through the
  capability, with the store asserted empty on each refusal.
- `tests/unit/lib/app/programme/coach/phase-context.test.ts` — the closing beat is instructed, a
  recorded reflection stops being asked for, the close records the takeaway and nothing else.
- `tests/unit/components/app/reclaim/coach-chat.test.tsx` — "Thinking…" before the first word, and
  "Making a note…" for a capture with the tool slug asserted absent.
- `tests/unit/components/app/reclaim/coach/status.test.ts` (new) — the mapping is total.
- `tests/unit/components/app/reclaim/coach/phase-conversation.test.tsx` — no move onward until the run
  holds a reflection, the move does not rewrite it, and **the textarea is gone** (asserted).
- `tests/unit/components/app/reclaim/coach/captured-panel.test.tsx` — the reflection shows, edits
  through the leader path, and is never offered back as a reading to verify.
- `tests/unit/invariants/product-voice.test.ts` — the two new files classified; the completeness
  assertion is what forced it.
- `tests/unit/invariants/reachability.test.ts` — repointed at the new tree, which its own
  "an empty sweep cannot pass silently" assertion caught immediately.

---

## Verification

```bash
npm run validate && npm run test && npm run leaf:checks
npm run db:seed          # propagates the grant's group list
npm run smoke:reclaim-coach && npm run smoke:reclaim
```

By hand, at `/programme`: the page fills the viewport with no page scroll; a turn shows "Thinking…"
immediately and types out evenly; the composer has not moved ten turns later; the reveal and the chart
appear in the conversation; the coach asks what stands out and the answer lands in the panel as "In
your words" with no textarea anywhere on the phase; Continue moves on, and a run with no reflection is
still refused by the server.
