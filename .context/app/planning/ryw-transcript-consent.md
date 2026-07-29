---
name: ryw-transcript-consent
feature: F17 · ryw-transcript-consent
epic: RYW post-v1
status: shipped
owner: John
depends_on: F12 (the board and its gate)
spec: ../invariants.md (I10, D4 admin-support) · ../../privacy/data-erasure.md · Brief §3 (sharing is invited, never required)
parent: post-v1.md
opened: 2026-07-30
---

# ryw-transcript-consent — the conversation is shared only if the leader says so

> The audit **is** the conversation now. Rashmir can see a leader's figures, their setup prose and
> their phase, and cannot see the exchange that produced any of it — except that she can, through a
> door nobody designed. Parent: [[post-v1]]. Binding _how_: **I10** (leaf-only), **D4** (one
> constructor for cross-user reads), Brief §3 (sharing is invited, never required).

## Intent

Two separate facts, and the second is why this is a feature rather than a nicety.

**There is no consented way to share a transcript.** `ReclaimReportShare` records that a leader chose
to send Rashmir their _results_. Nothing records a choice about the conversation, so a leader who
says "the coach misheard me" has nothing to point at, and Rashmir has no legitimate way to look.

**And there is an unconsented way.** `buildClientExport` selects whole `ReclaimAuditRun` rows with no
`select` (`admin/export.ts:92`), so **`conversationId` travels in the export** — and core ships
`/admin/orchestration/conversations/[id]`, which renders any conversation to an `ADMIN`. So the
product's promise and its actual access boundary are already out of step, and the leaf is what hands
over the key.

## Decisions

| Decision                      | Choice                                                                                                                                                                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A column, not a table         | **`transcriptConsent` on `ReclaimReportShare`.** A new leaf model joins five places (schema, hand-written FK SQL, `leaf-db-drift.ts`, `EXPORTED_SOURCES`, the erasure smoke); a column on an existing CASCADE row joins none of them. |
| Its default                   | **`NOT NULL DEFAULT false`**, never nullable. Absent consent must read as "not given", and a nullable column invites a `?? true` somewhere downstream. Every existing row correctly becomes "shared results, not the conversation".   |
| Where it is asked             | **Underneath "share my results with Rashmir"**, as its own question. Sharing a result is not sharing the exchange that produced it, and Brief §3 already makes the same distinction for quote consent.                                |
| Withdrawal                    | **Unticking either box withdraws it.** Consent that cannot be taken back is not consent. Unticking the parent withdraws the child too: sharing the conversation but not the results is a state nobody asked for.                      |
| The export's `conversationId` | **Redacted.** The leaf stops supplying the key. This does not close core's console, which is role-gated and audit-logged — it stops this app being the thing that points at it.                                                       |
| The admin surface             | **Read-only, and gated on the flag at the point of read**, not by hiding a link. A guard that a URL can walk round is not a guard.                                                                                                    |

## Tasks

| t-N | What                                                         | Files                                                                                          | Status | PR  |
| --- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ------ | --- |
| t-1 | The column, the consent question, and withdrawal.            | migration, `app-reclaim.prisma`, `share.ts`, `runs/[runId]/share/route.ts`, `phase6-panel.tsx` | done   | —   |
| t-2 | The gated read, the admin surface, and the export redaction. | `admin/transcript.ts`, `admin/export.ts`, `app/admin/programme/shared/`, invariant test        | done   | —   |

## Invariants this feature touches

- **D4** — the cross-user read goes through `supportViewer`, the one constructor
  `admin-support.test.ts` allows. A second way to read another leader's rows is exactly what that
  guard exists to prevent.
- **I10** — leaf-only. No core file edited; the export redaction is a `select` in leaf code.
- **Erasure** — `ReclaimReportShare` already CASCADEs, so the consent dies with the account and the
  erasure smoke needs no new table. It does gain an assertion that the flag went with it.

## What the build changed about this plan

**The D4 note was wrong, and correcting it is the more accurate rule.** The plan said the cross-user
read "goes through `supportViewer`". It does not: `supportViewer` builds a framework `JourneyViewer`
for journey reads, and a transcript is `aiMessage` rows reached through Prisma directly. What
actually applies is the _other_ half of that guard — `CROSS_USER_MODULES`, the explicit list of
modules permitted to read another leader's data at all, which the file's own comment says "adding a
file here should be a deliberate act". `admin/transcript.ts` is on it, and it is the most sensitive
entry there.

**The inbox needed the flag too.** Without it an operator would have to open each shared result to
discover whether the conversation was included, and the ones that refused would read as broken
rather than as a choice somebody made. Each row now says which of the two it is.

## Notes / deferrals

- **This does not close core's orchestration console.** An `ADMIN` who knows a conversation id can
  still open it there, and that is core's surface to gate. What changes is that this app no longer
  hands the id over in an export, and that the leaf's own transcript view refuses without consent.
  Filed as an ask rather than worked around.
- **No per-message redaction.** A consented transcript is shown whole. Partial disclosure would mean
  deciding on a leader's behalf which of their sentences Rashmir may read, which is worse than the
  binary choice they actually made.
