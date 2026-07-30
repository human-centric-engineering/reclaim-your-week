---
name: ryw-analyst
feature: F14 · ryw-analyst
epic: RYW post-v1
status: shipped
owner: John
depends_on: F13 t-1 (readCalendarReading, for the brief's "what is confirmed")
spec: ../content-source.md §10 (the summary's eight items) · ../sources/Time_Audit_Tool_Prompt_Text.md:344-353 · ../invariants.md (I6, I12, I16, I-frame, I17)
parent: post-v1.md
opened: 2026-07-29
---

# ryw-analyst — the two §10 bullets that were never built

> §10 asks the summary artifact to carry eight things. `buildSummary` produces six of them, and it
> is fully deterministic. The two it has never produced are **"The key gaps identified"** and **"The
> phased pathway forward"** — the only two that are a reading rather than a read-out. Parent:
> [[post-v1]]. Binding _how_: **I16** (it reflects, it does not decide), **I12** (the pause is not
> shortened), **I6** (the coach's write gate is not widened), **I17** (possibility, not failure).

## Intent

The owner asked whether the specification names a summary agent. **It does not** — the sources were
written for a single Claude Project, so every act of interpretation is assumed to be the one
conversational model producing prose in the chat. But §10 is explicit about what the artifact must
contain (`content-source.md:742-751`), and two of its eight items have never existed in code:

| §10 asks for               | `buildSummary` today                                              |
| -------------------------- | ----------------------------------------------------------------- |
| The key gaps identified    | **absent** — there is no gaps field                               |
| The phased pathway forward | **absent** — `grep -rn "pathway"` returns nothing in product code |

And a third thing is already captured and read by nobody: **`reclaim_action_options`**
(`slots.ts:452`, "The three entry points offered"). Phase 5 asks the coach to offer three ways in,
each with a note on likely impact, and to record all three. It does, and the summary shows only
`reclaim_action_chosen`. The two the leader did not take are on the table for a reason — §10's own
framing is that the artifact is what they take away — and they vanish at the moment it is produced.

So the instinct is right and the gap is **spec-mandated rather than new scope**.

## The line this feature must not cross

I16 is the reason this is a careful feature rather than a small one:

> The tool exists to return people to their own discernment, agency, and wisdom. It offers a mirror
> and some options. **The decisions stay with them.** It reflects; it does not decide.

A "summary agent" is the single easiest place in this product to build an advice engine by accident.
Everything below is arranged so that it cannot become one — and the arrangement is **structural**,
not a matter of prompt discipline, because P23 already established the rule this codebase runs on: a
side effect asked of a model is a hit rate, and this product does not build on hit rates.

## Decisions

| Decision                                      | Choice                                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A seeded agent, or borrow the coach's binding | **Its own `AiAgent` row.** `agent.ts:63-87` argues at length that an empty binding is wrong because the binding is a _decision_ — gpt-4o is pinned for strong tool use mid-conversation. The analyst makes no tool calls. Borrowing means an operator repointing the coach silently repoints the analyst, and neither screen says so. |
| How it is dispatched                          | **`runStructuredCompletion`**, on `capture-sweep.ts`'s precedent. No `streamChat`: nothing here is a conversation, and a persisted `AiMessage` from a non-conversational pass would appear in the leader's transcript.                                                                                                                |
| Where the prose lives                         | **In code** (`analyst/agent.ts`), composed per call. The seeded row exists for the binding, the cost identity and admin visibility. `voice.test.ts` can then guard the analyst's voice, and a mis-seeded database cannot change what it says.                                                                                         |
| Capability grants                             | **Zero**, and `visibility: 'internal'`. A public agent with no grants is still a chat surface a leader could open.                                                                                                                                                                                                                    |
| What it writes                                | **One column, `ReclaimAuditRun.analystReading`.** Not slots: a slot value is what the _leader_ said, and writing the tool's own prose there makes every consumer that treats a slot as testimony wrong. One column also makes the screen, the PDF, the email and the public share render identical text.                              |
| When it runs                                  | **On completion, best-effort**, plus a lazy path on the summary read for runs completed before this shipped and for generations that failed. The PDF route must never trigger it — an export must not be the thing that first spends money.                                                                                           |
| On failure                                    | `analyst: null`, and every surface renders **nothing**. Never an error panel: telling a leader their artifact is defective when it satisfies §10's other six bullets is worse than silence.                                                                                                                                           |

### Four structural guards against becoming an advice engine

1. **The schema cannot hold a verdict.** `gaps: [{token, observation}]` and
   `pathway: [{horizon, step, difference}]`. There is deliberately no `recommendation`, `priority`,
   `score`, `severity` or `risk` field. A model cannot return a ranking because there is nowhere to
   put one. Same move `offer_choices` makes: the model names the reading, the product owns the answer.
2. **Every gap is anchored to a token the brief supplied.** A finding about an area the audit never
   measured is refused, so the analyst cannot introduce a subject.
3. **`parseAnalystReading` refuses in code.** Banned lexicon, an em dash, a second-person imperative
   opener, an unknown token, wrong cardinality, over-cap strings. **A refusal discards the whole
   reading and returns `null`** — never a partial, because half a reading is a reading with the
   inconvenient half removed.
4. **I12 is honoured by placement.** The output renders only in the Phase 6 artifact — after the
   phase-1 reveal, after the phase-4 gap beat, after `reclaim_reflection_p6` exists. It never reaches
   `buildCoachPhaseContext`, so it cannot arrive beside a chart the leader has not asked to see.

### The public-share hazard, stated plainly

`summary.ts`'s header promises `AuditSummary` is safe behind a public token, `summary.test.ts`
asserts it, and `/summary/[token]` serves it **with no session**. The moment model prose joins that
object, that promise depends on a model.

So `analyst/brief.ts` is its own module whose slug list is asserted **disjoint from every slot
definition marked `sensitive`**, and that assertion ships in the same task as the field it guards. It
never reads `reclaim_setup_keeping_me_up`, `reclaim_setup_why_now`, or any `reclaim_gap_*` prose.

## Tasks

| t-N | What                                                                          | Files                                                                                                | Status | PR  |
| --- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------ | --- |
| t-1 | The authored agent and its seed unit.                                         | `lib/app/programme/analyst/agent.ts`, `prisma/seeds/app-reclaim/005-reclaim-analyst.ts`              | done   | —   |
| t-2 | The brief, the call, the refusals, the column.                                | `analyst/brief.ts`, `analyst/reading.ts`, migration, `tests/unit/invariants/analyst-reading.test.ts` | done   | —   |
| t-3 | Into the summary: three fields, the completion hook, the lazy path, the view. | `summary.ts`, `runs/service.ts`, `summary/summary-view.tsx`, `summary/types.ts`                      | done   | —   |

**t-3 must merge before F15 t-1**, or the PDF is laid out against a seven-field `AuditSummary` and
re-laid out against a ten-field one.

## Invariants this feature touches

- **I16** — the four structural guards above. Tested by constructing verdict-shaped output and
  asserting the parser returns `null`.
- **I12** — placement. The reading never enters the coach's phase context; asserted by a scan.
- **I6** — untouched and re-asserted. The analyst holds no capabilities, has no server-issued scope
  and cannot write a slot. `agent-caps.test.ts` gains its empty grant set.
- **I1 / I2** — `voice.test.ts` extends to the analyst's authored prose.
- **I-frame / I17** — the authored instructions carry the governing frame from `Module.config`
  (loaded, never restated — I11) and require every gap to read as possibility.

## The seed's create-only/re-author split

Mirrors 002/003 exactly, and getting it backwards breaks quietly in one of two ways:

- **provider and model: create-only**, so an operator repointing the analyst in admin survives a
  re-seed (`agent.ts:83`'s reasoning).
- **the four prose fields: re-authored from code** with `hashInputs`, so shipping a voice fix
  actually changes what the analyst says (003's reason for existing).

Backwards means either the model reverts on every deploy, or a voice fix ships as a no-op.

## What the first live run found

`smoke:reclaim-analyst` failed the first time it was run, and it failed for the exact reason it was
written. A real gpt-4o call produced a reading, and `parseAnalystReading` discarded the whole thing
because a step opened with **"Begin "**.

**The parser refused ten imperative openers and the guardrails prose named five.** The model was
punished for a rule it had never been given. And the failure mode is silent: `null` renders as two
absent sections, with no error anywhere, so this would have shipped as "the analyst never produces
anything" and the only symptom would have been a summary that looked exactly like the pre-F14 one.

Fixed by making it one list — `ANALYST_IMPERATIVE_OPENERS`, exported from `analyst/agent.ts`,
interpolated into the guardrails and read by the parser. Same discipline as `composite.ts`'s variance
thresholds one feature earlier, and the same reasoning: two copies of a rule drift, and here the
drift falls entirely on the model.

Two invariant assertions now hold the pair together, in both directions: every opener the parser
refuses is named in the prose, and every opener the prose names is refused by the parser.

**This is the whole argument for P16's second script**, made on its first execution. Nothing without
a real key could have found it: the parser's refusals were unit-tested and correct, the prose was
plausible, and every test passed.

## Notes / deferrals

- **`reclaim_action_options` may be absent.** The capture sweep skips `json` slots
  (`capture-sweep.ts:320`), so it is written by the coach's `record_answers` or not at all. The
  pathway must degrade to `reclaim_action_chosen` and the schema must not require the options.
- **P16's denominator moves to two.** `parseAnalystReading`'s refusals are unit-tested against stubs,
  which proves the parser rejects what it should and **nothing about whether a real model ever
  returns something it accepts**. An analyst refused on every live call would pass the whole suite and
  produce two empty sections for ever. So `smoke:reclaim-analyst` is manual and key-needing, for the
  same reason `smoke:reclaim-calendar` is.
- **`runStructuredCompletion` writes no `AiCostLog`.** The capture sweep already has this hole; the
  analyst inherits it. Its own agent row does not fix it but makes it nameable — log `costUsd` with
  the run id and the agent slug, and file the missing seam upstream.
