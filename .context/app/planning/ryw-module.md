---
name: ryw-module
feature: F2 · ryw-module
epic: RYW v1
status: shipped
owner: John
shipped: 2026-07-24 (t-1 #19 · t-2/t-3 #20 · t-4 #21)
depends_on: F1 · ryw-provenance (shipped #17)
spec: ../content-source.md (the nine buckets, bands, footnote, voice rules) · ../slot-spec.md (105 slots) · ../sources/ (the authority) · ../invariants.md (I1 third person, I2 lexicon, I5 sensitivity, I6 exposure, I7 canonical slugs, I11 content loaded not authored)
parent: plan.md
written: 2026-07-26 — retrospectively, see the note below
---

# ryw-module — the module, the slots, the content, the voice

> **This plan was written after the fact.** F2 was the only feature of the ten built without a
> `ryw-*.md`, which the v1 close-out audit flagged ([[post-v1]] P7) — and it was the wrong one to
> skip: F2 is where Rashmir's IP enters the codebase, and [[plan]] itself calls it the "highest risk
> for silent drift, because paraphrase looks like success". The feature shipped correctly and is
> guarded; what was missing was the record of _how_ and _why_, which every other feature has.
>
> So this is a reconstruction from the code, the guards, the commits and [[plan]]'s work log — not a
> pretend contemporaneous plan. Where a decision's reasoning is inferred rather than recorded, it says
> so. The value is not archaeology: it is that the next person to touch the content chain, the slot
> registry or the agent's voice can read why it is shaped this way before they change it.

## Intent

F2 registers the module and puts Rashmir's material inside it. Four things, in the order they had to
happen:

1. A registered `reclaim-audit` **module** with a coach-editable `configSchema`, so every value she
   might reword is changeable without a deploy.
2. All **105 slot definitions** from [[slot-spec]], with exact slugs and the right sensitivity.
3. Her **content, verbatim**, as the config defaults — and a guard proving it is verbatim.
4. The **coach agent**: her method, not her voice.

**The governing rule is I11: content is loaded, not authored.** Nothing in this feature writes prose.
Where the product needs words, they come from [[content-source]], which is itself a checked extract of
[[../sources/README|sources/]]. Paraphrase is the failure mode, and it is a quiet one — a tightened
sentence reads better and is a different product.

## Reconciliation against the repo, as built

### D1 — the module's config is the entire coach-editable surface

`reclaimConfigSchema` (`lib/app/programme/module.ts`) is not a settings object with content bolted on;
it **is** the content: the governing frame, the nine buckets with their descriptions and benchmark
notes, the deep-work note, the three hour bands, the footnote, the consultation email. Operator
toggles (the F7 open items, F8's access policy, F9's nudge window, F10's stall rule) were added later
alongside them.

That choice is what made F10 t-4's content editor possible at all, and it is also what made it
harder than expected — see D4.

### D2 — 105 slots, and the count moved during planning

The spec said 95 until 2026-07-23, when reading [[slot-spec]] against [[invariants]] found that
**I-composite had no slot to write to**: `reclaim_current_*` holds the leader's estimate,
`reclaim_calendar_*` holds what the calendar said, and the composite of the two — the thing F6 actually
plots — had nowhere to live. A new `reclaim_composite` group (nine per-bucket slots plus a variance
note) took it to 105.

Worth keeping visible because it is [[planning-retro]] §A's lesson in miniature: the invariant and the
slot spec were each internally coherent, and the gap was between them.

### D3 — the two-hop content guard, and why one hop is worthless

`npm run leaf:content-diff` (which predates F2) proves every blockquote in [[content-source]] appears
verbatim in [[../sources/README|sources/]], and that the sources still match their checksums. F2 t-3
added the second hop: `tests/unit/app/programme/content.test.ts` asserts the config defaults are
**character-identical** to the extract.

**Neither substitutes for the other**, and the reason is historical rather than theoretical. Until
2026-07-23 only the second hop was planned and the sources lived outside the repo — so the guard
compared a transcription against itself. The first machine run against the real originals found **nine
altered blockquotes out of seventy**, three of them material, including calendar export steps that
appear in no source document. Every one would have passed a config-only guard.

F10 t-4 later added a **third** hop that nobody predicted: once Rashmir edits content in the admin UI,
what users read lives in `Module.config` in the database, where neither guard reaches. Answered by
I11's "third hop" paragraph plus per-field matches-source markers.

### D4 — the config schema's shape is content-shaped, and generic tooling struggles with that

Not visible in F2, but caused by it. `buckets` and `hourBands` are `z.array(...)` of objects, and
Daybreak's generic module-config form renders arrays as a raw JSON textarea — so the framework's
"edit config without a deploy" did not reach the one thing this app most needed edited
(daybreak#161, F10 t-4). A flatter schema would have avoided it and would have been a worse model of
the content.

### D5 — the agent is authored; the method is loaded

The coach's persona, guardrails and brand voice are **written for this product** (`programme/agent.ts`)
— that is not an I11 violation, because the framework's voice around the material is ours to write. The
material itself is loaded.

The line I1 draws: the _method_ is preserved in full (asking before telling, no verdicts, insight
handed back), the _persona_ is not. Every first-person line in the source system prompt is re-pointed
to third person. `tests/unit/invariants/voice.test.ts` guards it, together with I2's banned lexicon,
no em dashes and no conversational bullets.

### D6 — capabilities are read-only, with one narrow write

The agent holds `get_journey_state`, `get_next_steps` and `get_state` — reads — plus `fill_slot`
scoped by an exposure allowlist to `reclaim_profile_*` only (I6). It cannot write hours, reflections
or anything a phase gate depends on, so no conversational turn can satisfy a reflection requirement or
alter the picture the charts draw.

`tests/unit/invariants/agent-caps.test.ts` guards it. The consequence surfaced much later: because
`fill_slot`'s provenance carries no `runId`, an agent-captured profile correction belongs to no audit
(daybreak#167, documented in `runs/answers.ts`).

### D7 — nothing is `special_category`, deliberately

Two slots are `sensitive` — `reclaim_setup_keeping_me_up` and `reclaim_setup_why_now` — and none is
`special_category` (I5), which would trigger redaction and make the refer-back (F7 t-2, I13)
impossible. `tests/unit/invariants/slot-sensitivity.test.ts` asserts it on every PR.

## Tasks, as shipped

| id  | Intent                                                                               | Status | PR  |
| --- | ------------------------------------------------------------------------------------ | ------ | --- |
| t-1 | `registerModule('reclaim-audit')` from `initLeafApp()`; the `configSchema` shape     | done   | #19 |
| t-2 | All 105 slot definitions from [[slot-spec]], exact slugs, sensitivity as specified   | done   | #20 |
| t-3 | The verbatim content as config defaults, plus the I11 hop-2 character-identity test  | done   | #20 |
| t-4 | The third-person coach agent, and the three invariant tests wired into `leaf:checks` | done   | #21 |

_Done when (as stated in [[plan]]):_ all 105 slugs match the spec; bucket descriptions and the
footnote character-identical to source; three invariant tests pass; boundary green. **All met.**

## What F2 got right, in hindsight

Four features later this is worth recording, because it is the reason nothing downstream had to
re-litigate the content:

- **The guards went in with the content, not after it.** t-4 wired `voice`, `slot-sensitivity` and
  `agent-caps` into `leaf:checks` in the same PR that created what they guard. Every feature since has
  inherited them for free.
- **Canonical slugs never moved** (I7). Nine features of UI, a relabelling feature, an admin
  aggregate and a trend line all group by the same strings F2 declared.
- **The config-as-content choice paid off twice** — F7's open-item toggles and F10's content editor
  both exist because the shape was already right.

## Notes / deferrals

- **This plan is retrospective** and should not be read as evidence the plan-first discipline was
  followed here. It was not, and [[post-v1]] P7 is the record of that.
- **The lesson worth carrying** ([[planning-retro]] §B has it): the feature with the highest stated
  drift risk was the one built without a written plan. Nothing went wrong — the guards caught what
  they were built to catch — but the absence was not noticed for ten features, and it was noticed by
  an audit rather than by anyone needing the document.
