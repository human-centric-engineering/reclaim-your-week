---
name: ryw-preview
feature: F19 · ryw-preview
epic: RYW post-v1
status: shipped
owner: John
depends_on: F8 (the invitation flow this halves) · F11 (the group-link card whose plaintext-URL precedent this follows)
spec: ../invariants.md (I10 leaf-only, I14 entitlement at run creation, I2 coach-voiced copy, D4 cross-user reads) · lib/auth/account.ts (the PR #279 miscount, and why a predicate needs a guard)
parent: post-v1.md
opened: 2026-07-30
shipped: 2026-07-30
---

# ryw-preview — seeing the product without an inbox, and without moving the figures

> The only way to see what a leader sees was to issue an invitation and wait for an email — and
> locally that was impossible, because the link was never recoverable. Parent: [[post-v1]]. Binding
> _how_: **I10** (leaf-only), **I14** (entitlement stays the one door), **I2** (coach-voiced copy),
> **D4** (cross-user reads declared).

## Intent

**The link existed for the length of one function call.** `issueInvite` built the `/accept-invite`
URL, handed it to the email template, and dropped it; only the token's SHA-256 was stored. So on any
install with no mail provider — every developer machine, where `sendEmail` reports `disabled` and
nothing is sent — an invitation was a perfectly good row that nobody could reach. The Access screen
had been showing that failure in its "Email" column since F8 t-1 and offering nothing to do about it.

**And the screens behind the front door need a whole audit done.** History, the summary, the PDF and
sharing are all a long way in, so looking at any of them meant answering every phase by hand, every
time.

The two are different problems and they wanted different answers, which is the shape of this feature.

## Decisions

| Decision                                   | Choice                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| How the front door is reached              | **`issueInvite` returns the link it already built.** Shown once on issue or re-send, with a copy button. `null` on the `pending` path is not a shortcut: nothing is minted there and only a hash is stored, so no link exists to hand back. Same class of secret F11's group-link card already shows.                                                             |
| Whether the referral route returns it too  | **No, and it gets its own schema to keep that true.** `refer` is callable by any participant; a link is a token for creating an account at a given address, and handing one to whoever typed the address would let a leader stake a claim on somebody else's email.                                                                                               |
| How a test account is marked               | **A leaf table, because there is no column to use.** `User.accountType` cannot carry it (`SERVICE` is non-login) and `auth.prisma` is Sunrise's under I10. So the predicate is an **async id-set read**, not a spreadable `where` fragment like `humanWhere`.                                                                                                     |
| Who excludes and who badges                | **Counting, publishing and emailing exclude; the operator's own screens show them, labelled.** Hiding a test account from Clients would leave her unable to find the ones she made. The cost is that the row count there includes them, which is safe precisely because each is badged.                                                                           |
| What holds the exclusion in place          | **A completeness invariant, not five unit tests.** Three lists whose union must equal the cohort readers on disk. The failure mode is a **sixth** counting query added in good faith next quarter — the PR #279 shape — and only a list-versus-disk assertion catches that.                                                                                       |
| Why the preview page does not send invites | **It cannot mark the resulting account.** Account creation is Sunrise's with no leaf hook (sunrise#464), so an account made through `/accept-invite` is a client from its first minute. Hence **adopt**: walk the real door from Access, then mark it. The two screens split by what each is good at.                                                             |
| What a fabricated audit is built from      | **The real service layer, every step.** `createRun` → `saveRunAnswers` → `transitionRun`. A fabricator of raw writes is a second definition of what an audit is, and it drifts silently — hiding exactly the regressions a preview account exists to catch.                                                                                                       |
| Where the walk stops                       | **At the last phase, run still in progress** (t-4). The summary, the report and every sharing choice live in the phase-6 panel _before_ "finish my audit"; completing moves the summary into the history read-back and takes sharing away entirely. See "what the build found".                                                                                   |
| What happens when the engine refuses       | **Rethrown, naming the phase.** `smoke:reclaim-analyst` swallows its transitions with `.catch(() => undefined)`; copying that would produce an account the API calls "mid-audit" whose journey never left phase 0, and nothing on any screen would say so.                                                                                                        |
| How the summary avoids calling the analyst | **The reading is written by the fabricator.** `ensureAnalystReading` is write-once and returns early, which `smoke:reclaim-report` has relied on since F7. So neither opening the summary nor finishing afterwards costs a call. The content is **derived** from the hours actually written, because `parseAnalystReading` refuses a token the run does not have. |
| Whether to fabricate a conversation        | **No.** `AiCostLog` carries no `userId` and survives erasure de-attributed, an empty conversation buys nothing, and inventing `AiMessage` rows would put words in the coach's mouth that no model said. A leader who used the forms and never opened the coach is a real state.                                                                                   |
| What address a test account gets           | **A plus-subaddress of the acting admin.** Every email the product would send lands in her own inbox, which is the closest a test account gets to the real thing, and nothing bounces. A made-up domain delivers nowhere _and_ costs sending reputation in production.                                                                                            |
| Which tier                                 | **`standard`, pinned.** A `client` grant is bounded by a window rather than a count, so a preview account on that tier could run unlimited audits for twelve months.                                                                                                                                                                                              |
| How one is removed                         | **`eraseUser()`, and a 404 for anything outside the registry.** That check is what stops a leaf route with a leaf rate limit becoming a general-purpose "erase any user" endpoint.                                                                                                                                                                                |

## Tasks

| t-N | What                                                                                        | Files                                                                                                                                              | Status | PR  |
| --- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --- |
| t-1 | The invitation link, handed back once and copyable. Folds a third copy of the origin chain. | `access/invites.ts`, `invites/route.ts`, `reclaim/access/actions.ts`, `admin/access/invite-manager.tsx`, tests                                     | done   | —   |
| t-2 | The registry, and the exclusion that keeps test accounts out of the published figures.      | migration, `app-reclaim.prisma`, `leaf-db-drift.ts`, `preview/accounts.ts`, `admin/{aggregate,measures,inbox,clients,export}.ts`, `nudges/tick.ts` | done   | —   |
| t-3 | Fabrication, the routes, and the screen.                                                    | `preview/_lib/fabricate.ts`, `preview/fixtures.ts`, `admin/preview-list.ts`, four routes, `admin/preview/*`, `leaf-admin-nav.ts`, `rate-limit.ts`  | done   | —   |
| t-4 | Stop at the summary instead of finishing, and stop leaving a spare audit behind.            | `preview/_lib/fabricate.ts`, both preview routes, `admin/actions.ts`, `admin/preview/preview-manager.tsx`, `smoke/reclaim-preview.ts`, tests       | done   | —   |

## Invariants this feature touches

- **I10** — leaf-only throughout. Nothing in Sunrise's or Daybreak's surface is edited: no better-auth
  plugin, no change to `auth.prisma`, no new entry in `CREDENTIAL_AUTH_PATTERN`. The one platform
  behaviour consumed rather than extended is `auth.api.signUpEmail`, called exactly as
  `accept-invite/route.ts` calls it.
- **I14** — `createRun` runs `assertEntitled`, so a fabricated audit goes through the one door rather
  than around it. A fabrication for an account with no grant fails the way a leader would.
- **I2 / product voice** — `preview/fixtures.ts` is prose a tester reads in the summary and the PDF,
  in the analyst's own section, so it joins `COACH_VOICED` in `product-voice.test.ts`. Nothing forces
  that: the completeness sweep there covers `components/` only, which is why it is a deliberate act.
- **D4** — `admin/preview-list.ts` joins `user` and the runs, so it joins `CROSS_USER_MODULES`. Its
  sibling `preview/accounts.ts` is deliberately **not** there and must never be: it reads only the
  registry table, which is what lets `nudges/tick.ts` — a job with no `withAdminAuth` — import the
  exclusion predicate. The split exists to keep that list honest.
- **Erasure** — `app_reclaim_preview_account` CASCADEs on the account and SET NULLs on the operator,
  both probed in `leaf-db-drift.ts`. The CASCADE is load-bearing rather than tidy: the exclusion
  queries read this table for user ids, so a row outliving its user would put a dead id into every
  cohort filter, and a recycled id would inherit somebody else's preview flag. The table joins
  `EXPORTED_SOURCES` — an admin is a data subject too, and "which test accounts did I make" is a fact
  about her.

## What the build found

**The exclusion guard caught two files while it was being written.** `content-config.ts` (a cohort
reader that turns out to read config, not people) and `preview-list.ts` (added an hour later, and
unclassified the moment it existed). Neither would have been noticed by a reviewer reading a diff.
That is the argument for the completeness assertion in one paragraph.

**`measures.ts` had a fifth pollution point nobody listed.** The referral-conversion query filters on
`invitedByUserId`, not `userId`, so a test account exercising the referral form would have inflated
word of mouth — the one measure on that screen that is about other people's enthusiasm.

**The framework's own admin surfaces cannot be filtered, and this is now an ask.**
`/admin/framework/maps/reclaim-audit/heat` and the module-engagement page count preview journeys, and
both are linked from the programme overview. They are Daybreak-owned with no exclusion seam. Recorded
in [[../daybreak-asks]]; the preview screen says so on the page rather than leaving an operator to
find the discrepancy herself.

**A completed test account is exhausted, and that is worth keeping.** `completeRun` consumes the
single standard audit, so the account then meets the real `exhausted` refusal copy — which is a state
worth being able to look at. The fast-forward endpoint tops the account up itself, so the second use
of the button on the same account is not refused.

## What t-4 found, a walkthrough later (2026-08-03)

**"Completed audit" drove past every screen it promised.** An operator picked it, signed in, and
landed on the invitation to begin. Nothing had failed: the run was complete, the reading was there,
the summary was intact. But `loadCurrentRunState` looks for an **in-progress** run, and a finished one
is not it — so the programme shell had nothing to resume and rendered `BeginAudit`. The finished audit
was two clicks away under History, and the field help said this state was "the only way to reach the
summary, the report and sharing" while being the one state that showed none of them.

The three screens are all in the phase-6 panel, and two of them only exist there. The history
read-back carries the summary and `DownloadReport`; **sharing has no read-back at all**, so a test
account driven past "finish my audit" could never show it. The fabricator was overshooting its target
by exactly one button.

So `completed` became **`summary`**: walk all six transitions, write the takeaway (the panel holds the
summary back until that question is answered, which is the beat the source asks for), write the
reading, and stop — run in progress, on the last phase. Signing in opens there. Finishing is left to
the operator, which is the honest place for it: it sends a real email, and pressing it is the only way
to see what completion does. `smoke:reclaim-preview` presses it, through `completeRun`, so every
claim the script made about a completed run still holds.

**And the top-up was leaving a spare audit on every first fabrication.** `grantAnotherAudit` ran
unconditionally, but a freshly provisioned account already has its one standard audit — so the regrant
row sat there unused, and the "exhausted" state the paragraph above calls worth keeping was never
actually reachable from this screen. The operator who reported the landing bug pressed **Begin** on
that entry screen and got a second audit, which a real leader in the same position would have been
refused. Now the top-up is behind `hasAuditInHand`, which asks `grantIsLive` the same question the
entitlement gate asks.
