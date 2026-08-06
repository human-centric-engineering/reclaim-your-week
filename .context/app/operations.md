---
name: Reclaim Your Week — operations
description: What has to be running for the product to work, beyond the app itself. Scheduled jobs, the manual gates, and the environment that is not obvious from .env.example.
parent: README.md
---

# Operating Reclaim Your Week

> Everything here is a thing that is **not** a code change and **not** in CI, which is exactly why it
> is easy to lose. The quarterly nudge shipped in F9 t-3 with a route designed to be called by a
> scheduler, and then had no scheduler for as long as it took someone to audit the project — the
> mechanism was complete and never fired once. This file exists so that class of gap has somewhere
> to live.

## Scheduled jobs

### The quarterly nudge — **required for F9 t-3 to do anything**

A leader who completes an audit gets one gentle note about a quarter later saying the door is open.
It is the mechanism Brief §1's success measure ultimately depends on, since a leader who never hears
from us is unlikely to come back on their own.

```bash
npm run nudges:tick
```

**Run it daily.** The nudge falls due ninety days after a completed audit, so a day is the resolution
that matters; an hourly cron would just do ninety-nine per cent nothing. Pick a civil hour — these
land in someone's inbox.

```cron
# every day at 09:15 UTC
15 9 * * *  cd /srv/reclaim && npm run nudges:tick >> /var/log/reclaim-nudges.log 2>&1
```

**It is safe to run twice.** Each send is claimed against the specific audit it is about, with a
conditional write, so a second run in the same day sends nothing and two overlapping runs cannot both
send. Re-running after a failure is the right instinct.

**It exits non-zero when any leader's claim could not be written**, so a scheduler surfaces a partial
run as a failed job rather than a silent success. The rest of the cohort is still processed — one
leader's database blip does not abandon the others.

#### On a host that can only call URLs

Serverless platforms generally schedule an HTTP request rather than a process. The same work is behind
`POST /api/v1/app/reclaim/nudges/tick`, which is **admin-guarded** — so the caller needs a session or
an admin-scoped API key, and a scheduler that can only issue an unauthenticated `GET` cannot reach it.
That is deliberate: adding a second authentication scheme, or a mutating `GET` on a path that sends
mail, would both be worse trades than requiring a credential.

If that is the deployment, the options in preference order are:

1. Run the command in a container/worker alongside the app (a Railway or Fly scheduled job, a
   Kubernetes `CronJob`, a GitHub Actions `schedule` with database access).
2. Have the scheduler call the route with an admin API key in the `Authorization` header.

### Nothing else is scheduled

The platform's own workflow scheduler (`POST /api/v1/admin/orchestration/schedules/tick`) is only
needed if orchestration workflows are given cron schedules. This app does not use any, so it can stay
unscheduled until it does.

## Manual gates

Every leaf smoke runs in CI except the ones needing a provider key (do not restate the count here —
it has said "four of the five" through three additions). **`smoke:reclaim-calendar` cannot** — it
makes a real model call and CI holds no provider key ([[planning/post-v1|post-v1]] P16 is the decision about changing
that). Until then it is a release checklist item rather than a gate, which means someone has to
actually run it:

```bash
npm run smoke:reclaim-calendar   # I4 end-to-end: a real .ics, and no meeting title anywhere after
```

**Run it before any release that touches the calendar path.** It is the one that matters most and the
one that has already rotted unnoticed: it sat red on `main` for two features after F8 put a consent
gate in front of `createRun`.

> **`smoke:reclaim` was on this list until 2026-07-26 and should never have been.** It stubs the LLM
> with a fake provider, exactly as `smoke:chat` does, and needs no key — its own header says so. It
> was assumed to need one because it streams a turn. It now runs in CI, which matters more than the
> tidiness: it is the only thing that catches a coach that answers but has no tools, the silent
> failure a careless `globalThis` merge produces (see [[upstream-sync]]).

The structural half of I4 — that nothing in the calendar path can reach a write — is covered by
`tests/unit/invariants/calendar-privacy.test.ts`, which does run on every PR. What these two add is
proof against a real model and a real database.

## Seeing the product yourself

Two screens, and they do different jobs. Both are admin-only.

**The front door — `/admin/programme/access`.** Issue an invitation to yourself at a plus-address
(`you+t1@yourdomain`) and the screen shows the `/accept-invite` link. Open it in a private window and
you walk exactly what a leader walks: setting a password, the consent gate, starting an audit. The
link is shown **once** and cannot be recovered, because only its hash is stored — re-send to get
another. This works on an install with no mail provider at all, which is what it is for.

Then go to Preview and **mark that account as a test account**. Until you do, it counts as a client:
it is in the client list, the published measures, and the anonymised aggregate cohort, and it will be
sent a quarterly reminder ninety days after it finishes an audit.

**The states behind the door — `/admin/programme/preview`.** Create a test account, optionally driven
straight to mid-audit or **to the summary**, which is how you reach the summary, the PDF and sharing
without answering every phase by hand. The password is shown once and is not stored. Leave the email
blank and it uses a variation on your own address, so every message the product would send a leader
arrives in your inbox.

**Lost the password?** **Sign-in details** on the account's row mints a **new** one and shows it. It
is a new password rather than the old one because nothing keeps the old one — putting a live password
on the registry row so a screen could re-show it would be a plaintext credential in the database and
in every backup of it. The old password stops working; the audit on the account is untouched.

**Each row says where the account actually is**, under the state badge — "nothing filled in", or the
phase an open audit is sitting at. That is read from the run, so it stays right after you sign in as
the account and carry on by hand. **Fill in** is the command that changes it: it starts on no phase
at all and confirms before it writes, because filling an account in spends one of its audits and
cannot be undone. (The row used to default that control to the last phase, which read as a _state_:
an account set up ready-to-begin appeared to announce "At the summary".)

**"At the summary" stops before "finish my audit", on purpose.** All three of the summary, the report
and the sharing choices are on that last screen; finishing moves the summary into the History
read-back and takes sharing away altogether, and leaves the account back at the invitation to begin.
So the audit is filled in and waiting there, and signing in opens on it. Press finish yourself when
you want to see what finishing does — including the completion email it sends to the address in the
first column.

The fabricated answers are made up, but every one of them is written through the same service the
audit itself uses, so what you see is what a leader would see. Finishing spends the audit the account
came with, so a finished test account then shows you the real "no audits left" refusal; ask for
another state on the same account and it is given a fresh one only if it has none left.

**Removing one erases it**, through the same `eraseUser()` path a leader's own account deletion uses.
Two things survive by design and both look like bugs: the terms it accepted are kept without a name
(the lawful-basis record has to outlive the person), and any invitation it used stays on the Access
screen with a dash where the name was.

**One thing test accounts still affect.** The framework's own pages under Framework — the map heat
view and module engagement — count their journeys, and there is no seam to exclude them from. Filed in
[[daybreak-asks]].

## Environment worth knowing about

Beyond `.env.example`:

| Variable                                                          | Why it matters here                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_APP_NAME`                                            | Set to `Reclaim Your Week`. Drives the brand mark, email subjects and page titles.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `NEXT_PUBLIC_LEGAL_NAME`                                          | **Set it to `Nsansa Ltd`.** It names the data controller in the privacy notice and the counterparty in the terms. Left unset it falls back to the product name, which puts a product rather than a legal person in the controller field. The entity comes from the copyright line carried in the source content — "© Rashmir Balasubramaniam / Nsansa Ltd" — so it is Rashmir's own company, not a third-party operator. **Worth one confirmation from her**: a copyright holder and a data controller are usually but not always the same entity, and the trading name may differ from the registered one (companies-house spelling, "Limited" vs "Ltd"). |
| `OPENAI_API_KEY` **(testing)** / `ANTHROPIC_API_KEY` **(launch)** | Without a configured provider the coach cannot stream and the calendar categorise cannot run. The audit's forms still work, which makes this fail quietly rather than loudly. **The testing phase runs on OpenAI; Brief §3 requires Anthropic at launch** — see [[planning/post-v1#D-P17]]. The coach agent resolves its provider dynamically, so switching is an environment change with no code diff, and therefore nothing to notice if it is forgotten.                                                                                                                                                                                                |
| Email provider                                                    | With no provider configured `sendEmail` returns `disabled` rather than throwing, so invitations and nudges silently do not arrive. Worth checking on first deploy. It no longer blocks anyone from reaching `/accept-invite`: since F19 the Access screen shows the invitation link itself, which is how the product is walked on an install with no mail at all.                                                                                                                                                                                                                                                                                          |

## Before launch

A short list, all of it outside the codebase:

1. **Set `NEXT_PUBLIC_LEGAL_NAME=Nsansa Ltd`** in the deployment environment — see above. It is a `NEXT_PUBLIC_` variable, so it is **baked in at build time**: changing it needs a rebuild, not just a restart.
2. **Schedule the nudge** (above). Without it, F9 t-3 never runs.
3. **Confirm the email provider sends**, by issuing one real invitation to yourself.
4. **Switch the AI layer back to Anthropic** and change `MODEL_VENDOR` in
   `app/(public)/privacy/page.tsx` to match. Brief §3 makes Claude a client constraint; the testing
   phase runs on OpenAI ([[planning/post-v1#D-P17]]). Two changes, neither of which anything will
   remind you about.
5. **Replace the draft legal wording** and bump `policyVersion` in `Module.config`, which re-asks
   everyone for consent — the mechanism working as intended (plan open item 7).
6. **Run the manual smoke** (above).
7. **Issue the v1 invite list** (plan open item 6).
