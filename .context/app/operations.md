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

Four of the five leaf smokes run in CI. **One cannot** — `smoke:reclaim-calendar` makes a real model
call and CI holds no provider key ([[planning/post-v1|post-v1]] P16 is the decision about changing
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

## Environment worth knowing about

Beyond `.env.example`:

| Variable                 | Why it matters here                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_APP_NAME`   | Set to `Reclaim Your Week`. Drives the brand mark, email subjects and page titles.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `NEXT_PUBLIC_LEGAL_NAME` | **Set it to `Nsansa Ltd`.** It names the data controller in the privacy notice and the counterparty in the terms. Left unset it falls back to the product name, which puts a product rather than a legal person in the controller field. The entity comes from the copyright line carried in the source content — "© Rashmir Balasubramaniam / Nsansa Ltd" — so it is Rashmir's own company, not a third-party operator. **Worth one confirmation from her**: a copyright holder and a data controller are usually but not always the same entity, and the trading name may differ from the registered one (companies-house spelling, "Limited" vs "Ltd"). |
| `ANTHROPIC_API_KEY`      | Without a configured provider the coach cannot stream and the calendar categorise cannot run. The audit's forms still work, which makes this fail quietly rather than loudly.                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Email provider           | With no provider configured `sendEmail` returns `disabled` rather than throwing, so invitations and nudges silently do not arrive. Worth checking on first deploy.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

## Before launch

A short list, all of it outside the codebase:

1. **Set `NEXT_PUBLIC_LEGAL_NAME=Nsansa Ltd`** in the deployment environment — see above. It is a `NEXT_PUBLIC_` variable, so it is **baked in at build time**: changing it needs a rebuild, not just a restart.
2. **Schedule the nudge** (above). Without it, F9 t-3 never runs.
3. **Confirm the email provider sends**, by issuing one real invitation to yourself.
4. **Replace the draft legal wording** and bump `policyVersion` in `Module.config`, which re-asks
   everyone for consent — the mechanism working as intended (plan open item 7).
5. **Run the two manual smokes** (above).
6. **Issue the v1 invite list** (plan open item 6).
