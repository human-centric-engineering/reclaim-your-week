---
name: ryw-report
feature: F15 · ryw-report
epic: RYW post-v1
status: shipped
owner: John
depends_on: F14 t-3 (AuditSummary's three new fields — the PDF must be laid out against the final shape)
spec: ../sources/Time_Audit_App_Notes.md:46-47 ("Summary Report. Downloadable, shareable") · ../content-source.md §10 · ../invariants.md (I8, I12, I16, I17)
parent: post-v1.md
opened: 2026-07-29
---

# ryw-report — the artifact leaves the building

> The audit produces a summary and the summary lives behind a login. "Downloadable" was interpreted
> as `window.print()`, and nothing arrives in a leader's inbox when they finish. Parent: [[post-v1]].
> Binding _how_: **I8** (hours, never percentages, as the axis), **I12** (numbers, not a verdict),
> **I16** (no pressure on next steps, anywhere), **I17** (possibility, not failure).

## Intent

Two things the owner asked for, and one the source has asked for since the beginning.

`sources/Time_Audit_App_Notes.md:46-47` lists among the deliverables:

> **Summary Report.** Downloadable, shareable.

`plan.md` F7 t-4 carried that forward as "**downloadable** as well as shareable", and what shipped is
`window.print()` — the browser's own dialogue, from which a leader may choose "Save as PDF" if they
know to. There is no print stylesheet anywhere in the repository, so what comes out carries whatever
the screen had: no page breaks, no colour-adjust (which bar charts need), and the app chrome unless a
`print:hidden` happened to catch it.

And **nothing arrives in the inbox.** Three email kinds exist — invitation, welcome, quarterly nudge.
A leader finishes the one thing the product is for and hears nothing.

## Decisions

| Decision                       | Choice                                                                                                                                                                                                                                                                                                                     |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The PDF engine                 | **`@react-pdf/renderer`**, mirroring `~/code/conquest`, which is on **identical** `next@16.2.10` and `react@19.2.7` and already renders bar charts of exactly this shape. Pure Node, no browser binary, works on any host.                                                                                                 |
| The cost of that choice, named | A **second** rendering of the summary that can drift from `SummaryView`. Mitigated by driving both from the same `buildSummary` output, never from a second read — so the two can differ in layout and never in content.                                                                                                   |
| Headless Chrome instead        | **No.** It renders the real page, so there is exactly one source of truth, and it costs a ~300MB binary, a slow cold start and a serverless problem. The drift risk is cheaper to manage than the deployment one.                                                                                                          |
| Who may download               | **The leader, signed in.** `withAuth` + `loadOwnedRun`. The report carries their role, their hours and what they said their priorities were.                                                                                                                                                                               |
| The email's link               | **To the app, login-gated** — `/programme/history/<runId>`, not a bearer token and not an attachment. A sign-in is the correct friction for personal data; a `ReclaimShare`-style token has no expiry and no revoke, which is acceptable for a summary a leader chose to publish and not for one the system mails unasked. |
| The email kind                 | **Not registered.** `EmailPropsMap` is a closed interface of four auth kinds (sunrise#468). `quarterly-nudge` already established the workaround: import the component, call `sendEmail`.                                                                                                                                  |
| When the email sends           | **After the report agent attempt**, inside `completeRun`, wrapped so it cannot fail the completion. Sending first would link to a summary missing the two sections F14 just added — the one ordering a leader would actually notice.                                                                                       |
| The public share and the PDF   | **Neither triggers generation.** Both reach `buildSummary`; F14's lazy path lives only on the leader's own summary route. An export must never be the thing that first spends money.                                                                                                                                       |

## This is not P13

P13 parks **the follow-up email sequence** (Brief §2), and F8 t-4 shipped its seam
(`emitReclaimAccessEvent('reclaim.audit_completed')`). One transactional message about the artifact a
leader has just made is not that sequence: it carries no next step, no cadence, and nothing to
respond to. Recorded here so the next reader does not read F15 as P13 unparked without a decision.

The same reasoning gives the email its shape. **I16 rules out everything a completion email usually
does** — no "here's what to do next", no booking link, no prompt to share, no second audit offered.
It says the audit is finished, here is where it lives, and stops.

## Tasks

| t-N | What                                                                                                                                                                                                         | Files                                                                                                                                                                                                       | Status | PR  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --- |
| t-1 | The document and the render helper.                                                                                                                                                                          | `components/app/reclaim/report/summary-pdf-document.tsx`, `runs/[runId]/_lib/{render-summary-pdf.tsx,pdf-response.ts}`, render test                                                                         | done   | —   |
| t-2 | The route and the two download controls.                                                                                                                                                                     | `runs/[runId]/report.pdf/route.ts`, `phase/phase6-panel.tsx`, `history/run-review.tsx`                                                                                                                      | done   | —   |
| t-3 | The completion email.                                                                                                                                                                                        | `components/app/emails/audit-complete.tsx`, `runs/service.ts`                                                                                                                                               | done   | —   |
| t-4 | The transcript twin (PDF + plain text) and the three-identical-pills redesign — one sentence per control instead of unexplained buttons, and finishing split out from the things a leader merely takes away. | `runs/[runId]/{transcript.pdf,transcript.txt}/route.ts`, `runs/[runId]/_lib/render-transcript-pdf.tsx`, `report/{report-actions,download-button,finish-audit,share-with-coach,transcript-pdf-document}.tsx` | done   | —   |

## Invariants this feature touches

- **I8** — the PDF's bars are hours, with the percentage as a derived note, exactly as `ReclaimChart`
  does it. A PDF is where a percentage axis would be most tempting and least correct.
- **I12** — the document renders the figures and the report agent's sections, and adds no reading of its
  own. No "your biggest problem is", no highlighted worst bar, no summary sentence the screen does
  not also carry.
- **I16 / I17** — the email, and the absence of everything it does not say.
- **I2 / product voice** — the email and the document are coach-voiced copy the app authors, so both
  must be classified in `product-voice.test.ts`. The suite fails until they are, which is that
  guard's completeness assertion working.

## What the build changed about this plan

**One shared URL helper, not two.** The nudge resolved the app's origin with a private `appUrl()` in
`nudges/tick.ts`. F15's email needed the same rule, and a second copy would mean an install that set
`NEXT_PUBLIC_APP_URL` but not `BETTER_AUTH_URL` could have working nudge links and broken completion
links with nothing to say why. `lib/app/programme/urls.ts` now holds it, and the nudge uses it too.
Third time this pattern has come up in three features, after `composite.ts`'s thresholds and the
report agent's imperative openers.

**`product-voice.test.ts` earned its keep twice.** It caught all three new files as unclassified,
which is its completeness assertion doing its job. Classifying the PDF document then failed a second
time on a real defect: it used `—` as the "no figure" placeholder in the ideal column. That is
precisely what `NO_VALUE` exists for, and it is why the em-dash ban can stay zero-tolerance with no
allowlist.

## Notes / deferrals

- **`smoke:reclaim-report`** renders from a hand-written reading and **never calls the report agent**, so
  it needs no provider key and gates in CI from the day it lands. The expensive proof and the cheap
  one deliberately do not share a script.
- **The chart is redrawn, not screenshotted.** `ReclaimChart` is hand-rolled divs rather than a chart
  library, which is what makes a react-pdf redraw a faithful copy instead of an approximation.
- **No print stylesheet is added.** `window.print()` stays for anyone who wants it, and the PDF is
  the answer to "downloadable". Adding both would be two artifacts to keep in step.
