---
name: ryw-admin-care
feature: F18 · ryw-admin-care
epic: RYW post-v1
status: shipped
owner: John
depends_on: F16 t-1 (abandon, so "stalled" has a verb behind it) · F12 (the board and its gate)
spec: ../invariants.md (I11 the third hop, I16 the tool does not decide, I2 coach-voiced copy, I10 leaf-only, D4 cross-user reads) · Brief §2 (confidentiality, gentle rather than frequent) · post-v1.md P24
parent: post-v1.md
opened: 2026-07-30
shipped: 2026-07-30 (both tasks on the epic branch)
---

# ryw-admin-care — she can see what her words become, and reach the person who stopped

> The last feature of the F12–F18 epic, and the only one entirely about the operator. Rashmir can
> edit every word a leader reads and cannot see any of it in place; the client list flags a leader as
> stalled and offers nothing to do about it. Parent: [[post-v1]]. Binding _how_: **I11** (the third
> hop — she revises herself, visibly), **I16** (a human decides, not a scheduler), **I2** (coach-voiced
> copy), **I10** (leaf-only).

## Intent

Two halves of the same complaint: the admin surface reports and does not act.

**She writes into a form and cannot see what she wrote.** `/admin/programme/content` is a column of
text inputs over Rashmir's own IP. Every field is marked against its source document, every save is
versioned, and nothing on the screen shows her the sentence in the place a leader meets it. The
signpost that opens a phase, the footnote under the summary, the nine area descriptions: all of them
are edited as bare strings and reviewed live, on a leader.

**The list says "Stalled" and stops there.** F16 t-1 gave the leader a way to let go of an audit and
F16 t-3 gave the coach the last question. What the operator has is a badge. **P24 is explicit that the
answer is not an email the product decides to send** — `nudges/select.ts` refuses to nudge anyone
mid-audit on Brief §2 and I16 grounds, and an automated "you left an audit open" is what that rule
forbids. What is missing is the version I16 is comfortable with: **a way for Rashmir to write to that
person herself**, once, having looked at their record and decided.

## Decisions

| Decision                                | Choice                                                                                                                                                                                                                                                                             |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What the preview is built from          | **The editor's own field list, not the config.** `buildContentPreview(view, drafts)` reads the flattened `ContentView` the form already renders, so a field the editor does not expose cannot appear in the preview, and an unsaved draft previews without a write.                |
| The preview tells the truth about reach | **Each field says where it actually lands** — read verbatim on a leader's screen, or given to the coach as briefing it must not quote. Some of Rashmir's fields are only ever the second, and a preview that implied otherwise would be a nicer lie than no preview.               |
| The gap that exposed                    | **Recorded, not fixed here.** Bucket wording reaches the coach's context and **no leader-facing surface** (see below). That is a feature, not a task, and it goes on the board as **P25** rather than being smuggled into a preview.                                               |
| Whose voice the leader surfaces use     | **The real components where they exist.** The signpost preview is the leader's own `<Signpost>` with draft copy passed in, and the panel is pinned to the consumer surface, so a preview cannot drift from the screen it claims to show.                                           |
| Who sends the reach-out                 | **Rashmir, as herself.** The draft is a starting point in her first person, plainly labelled as ours to be rewritten, and the email is framed as a message from her coach rather than from the tool. I1 governs the _tool's_ voice; this message has a human behind it.            |
| What the record is                      | **A row per message (`ReclaimReachOut`), not a column.** F17 chose a column to avoid a five-place join; this is a log with a history — several audits, several messages, and "what did I already say" is the question the screen has to answer. The five places are one line each. |
| Whether a second message is refused     | **Warned, never blocked.** The screen says a message already went about this audit and when. Refusing would make the product overrule a coach who looked at a record and decided, which is I16 pointed at the wrong person.                                                        |
| Opt-out and marketing consent           | **Surfaced, not enforced.** A service message about a leader's own open audit is not marketing, so `marketingOptIn` is not the gate. `ReclaimNudge.optedOutAt` is about the automated nudge, so it is shown as a fact next to the composer and Rashmir decides what it means.      |
| What the nudge scheduler learns         | **Nothing new, deliberately.** `decideNudges` already refuses anyone with a run in progress, which is every leader who can be "stalled", so no selection rule changes. The record exists for the operator and for the second operator, not for the tick.                           |

## Tasks

| t-N | What                                                                                  | Files                                                                                                                                                        | Status | PR  |
| --- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | --- |
| t-1 | The content preview, beside the fields, from the draft — and what it found.           | `admin/content-preview.ts`, `components/app/admin/content/{content-preview,content-editor}.tsx`, `app/brand-theme.css`, unit test                            | done   | —   |
| t-2 | One message to a leader who stopped, written by Rashmir, recorded, and never doubled. | migration, `app-reclaim.prisma`, `leaf-db-drift.ts`, `admin/reach-out.ts`, `admin/{clients,export}.ts`, `clients/[userId]/reach-out/route.ts`, emails, smoke | done   | —   |

## Invariants this feature touches

- **I11 (the third hop)** — the preview is the missing half of "she rewords without a deploy": the
  editor already proves _what_ changed, and this proves _what it becomes_. It reads the stored config
  and the draft, never the code defaults, so hop 2 is untouched.
- **I2 / product voice** — the draft reach-out and the email template are copy a leader reads. No em
  dashes, no banned lexicon, an invitation rather than a reminder. The email component is classified
  in `product-voice.test.ts`'s list.
- **I16** — the whole shape of t-2. A human decides; the product supplies a draft, a record, and the
  facts that should give her pause. It never sends on its own and never refuses her judgement.
- **I10** — leaf-only. `app/brand-theme.css` is app identity (the fork owns it) and the descendant
  dark selector it gains is the documented form for a pinned surface, constraint 4 of
  [[../ui/surface-theming|surface-theming]].
- **D4** — `reach-out.ts` reads another leader's rows, so it joins `CROSS_USER_MODULES` in
  `admin-support.test.ts`. That list's own comment asks for the addition to be a deliberate act.
- **Erasure** — `app_reclaim_reach_out` CASCADEs on the leader (their message, their data) and SET
  NULLs on the sender (an admin account outlives its own outbox). Both probed in `leaf-db-drift.ts`,
  both asserted in `smoke:reclaim-erasure`, and the table joins `EXPORTED_SOURCES` — where the
  existing test fails the build for a table added without an export line.

## What the build found

**Rashmir's bucket wording reaches the coach and no leader-facing surface.** `config.buckets` has
exactly one reader: `readReclaimCoachContent` (`config.ts:145`), which briefs the model. Every surface
a leader actually reads — both phase-1 panels, the chart series, the summary rows, the trends, the
calendar analysis, the analyst's brief — imports the `RECLAIM_BUCKETS` **code constants**. So an
edited area title changes what the coach is told and changes nothing on screen, and F10 t-4's own
done-when ("a bucket description is edited in the admin UI and the change is visible to a user with no
deploy") is true only of the conversation.

Two things make this worth a board row rather than a quiet fix. It is not a bug in the editor: the
descriptions are confidential by instruction (`phase-context.ts:131` tells the coach never to quote
them at a leader), so "the coach is briefed with them" is the correct destination for that field and
the wrong one for a **title**, which a leader reads on every chart and in the summary. And threading
the stored config through eight leader-facing modules is a feature with its own I7 questions about how
an operator's title interacts with a leader's own relabelling. Filed as **P25**.

**The editor said one of these fields was shown to a leader, and it is not.** The benchmark-range
help read "The range in your own words, shown to the leader". Nothing renders `benchmark.note` on any
leader surface; the coach is given it. Corrected in the same task, because a false statement on the
screen this feature exists to make honest is the one thing t-1 must not ship.

**A pinned surface needed a selector nobody had needed yet.** The preview is themed as the leader's
surface rather than the admin one, which is [[../ui/surface-theming|surface-theming]] constraint 3 —
and constraint 4 says a pinned surface needs the **descendant** dark selector, because `.dark` sits on
`<html>` above the pin. `brand-theme.css` carried only the compound form, so in dark mode the panel
would have taken the light tokens and rendered white on white inside a dark page. Added as a second
selector on the existing block rather than a duplicated palette, so there is still one place the dark
values live. The doc had predicted this failure exactly; it had simply never been exercised.

**The composer's draft read the sensitive prose, and did not need it.** The first version of the GET
called `getClientDetail`, which fetches `reclaim_setup_keeping_me_up` and `reclaim_setup_why_now`. It
returned neither, so nothing leaked, and it was still wrong: D5's whole design is that opening a
leader's most personal answers is a **deliberate act**, and "an operator opened a compose box" is not
one. It now reads `listClients` narrowed to the one leader, which is the query that withholds them at
the API level.

**The subject line is the one field on this route that becomes a mail header**, so it refuses a
newline at the schema. Providers are expected to defend themselves against header injection and this
one is ours to not hand over.

## Notes / deferrals

- **No leader-facing walkthrough.** The preview shows fields in place, not the audit re-rendered
  against an unsaved config. A second renderer for the leader's surfaces would be a second thing to
  keep true, and the thing she needs is to read her own sentence where it lands.
- **No admin-side abandon**, still, for the reason [[ryw-audit-lifecycle]] gives: the run is the
  leader's, and an operator closing someone's unfinished work without asking is what I16 refuses.
- **P24 stays with Rashmir.** t-2 does not answer it; it makes the question narrower again, because
  she now has a way to write to one person without a scheduler deciding for the cohort.
- **The reach-out is not P13.** One message a human wrote about one open audit is not a follow-up
  sequence, and the seam P13 parks is untouched.
