---
name: Reclaim Your Week — upstream sync
description: The ordered procedure for pulling Daybreak (and Sunrise through it), and what to check against the asks ledger when you do.
parent: README.md
---

# Pulling upstream

> [[daybreak-asks]] carries a **delegate-when-it-lands** action per row. What it has never carried is
> a single ordered procedure for a sync — which is the thing you want at exactly the moment you least
> want to reconstruct it from eighteen table cells ([[planning/post-v1|post-v1]] P11).
>
> **The one fact that makes this urgent rather than tidy:** four of the open rows mean we are carrying
> **modified copies of upstream files**. Those are not workarounds beside core; they are edits inside
> it, and every one is a merge conflict waiting for this procedure.

## Before you start

```bash
git fetch upstream
git log --oneline "$(git merge-base HEAD upstream/main)"..upstream/main | wc -l   # how much is coming
```

Record the commit you are moving **from** — `git merge-base HEAD upstream/main` — in
[[README|.context/app/README.md]]'s sync log, because Daybreak has no version file and that hash is
the only way to answer "which Daybreak are we on".

Sync on a branch, never on `main`. Expect it to take a working session, not ten minutes: the four
carried files below will conflict by design.

## The files we have modified inside upstream's tree

These are the conflicts you will get, and each one has a decision attached. **Do not resolve any of
them by reflex** — for each, the question is _has upstream now done this properly?_

| File                                                           | Why ours differs                                        | Ask          | If upstream has landed it                                                                        |
| -------------------------------------------------------------- | ------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------ |
| `lib/framework/data-slots/values.ts`                           | F1 added `runId?` on provenance + `getSlotHistory()`    | daybreak#156 | **Delete our copy**, reconcile the signature, keep the leaf callers (`saveAnswer`, F9's trends)  |
| `lib/framework/modules/registry.ts`                            | `globalThis`-backed Map — registry lost at request time | daybreak#160 | Restore the plain `Map`, then **verify a coach turn still has its tools**                        |
| `lib/orchestration/chat/context-builder.ts`                    | `globalThis`-backed contributor map                     | sunrise#462  | Restore, then verify the module `LOCKED CONTEXT` block still appears                             |
| `lib/orchestration/capabilities/dispatcher.ts`                 | `globalThis`-backed dispatcher singleton                | sunrise#462  | Restore, then verify `get_state` / `fill_slot` still resolve                                     |
| `components/layouts/protected-nav.tsx`                         | One `??` read of `lib/app/protected-nav.ts`             | sunrise#473  | **Delete our shim**, take upstream's seam, move our five items into it (keep "Your audit" first) |
| `components/forms/login-form.tsx`                              | `appAuthLandingRoute` as the callback fallback          | sunrise#473  | Take upstream's seam; delete `lib/app/auth-landing.ts` and set the platform scaffold instead     |
| `components/forms/oauth-button.tsx`                            | same fallback                                           | sunrise#473  | As above                                                                                         |
| `components/forms/signup-form.tsx`                             | Push + OAuth `callbackUrl` use the landing route        | sunrise#473  | As above                                                                                         |
| `components/forms/accept-invite-form.tsx`                      | Push + OAuth `callbackUrl` use the landing route        | sunrise#473  | As above                                                                                         |
| `app/(auth)/verify-email/callback/verify-callback-content.tsx` | Landing-route replace + destination-agnostic copy       | sunrise#473  | As above; keep the copy neutral — "Redirecting to dashboard…" names a route the app may not use  |
| `proxy.ts`                                                     | Signed-in-on-auth-page redirect uses the landing route  | sunrise#473  | As above. Note `appProtectedRoutes` is a **seam**, not a patch — that line is not a conflict     |

The sunrise#473 rows are the _cheap_ ones — each is a single identifier swapped for a literal, and taking upstream's version wholesale is safe: the app simply reverts to landing on `/dashboard` with no link to the programme. That is the failure this whole cluster was written to stop, and it is silent, so re-apply them deliberately rather than accepting theirs and moving on. `tests/unit/components/layouts/protected-nav.test.tsx` and `tests/unit/lib/app/protected-routes.test.ts` both fail if you don't, which is the point of their existing.

The two `globalThis` pairs are the dangerous ones to resolve carelessly: if upstream has **not** fixed
them and you take their version, the coach silently loses its tools and its module context. Nothing
crashes. `smoke:reclaim` is what catches it, which is why it is on the checklist below.

## The procedure

```bash
git checkout -b chore/upstream-sync-$(date +%Y-%m-%d)   # a date you type; scripts here avoid clocks
git merge upstream/main
```

1. **Resolve the four files above** using the table, not by picking "theirs" or "ours" wholesale.
2. **Resolve everything else by keeping ours and adding a follow-up** rather than rewriting a platform
   file to match — a one-line "keep mine" is a cheap merge; a rewritten platform file is not
   (`CLAUDE.md` banner).
3. **Walk the ledger.** For every **open** row in [[daybreak-asks]], check whether upstream has landed
   it. If it has: do the delegate action, delete our workaround, and close the row. This is the step
   that stops the ledger growing forever, and it is the one most easily skipped.
4. **Migrations:**
   ```bash
   npm run db:migrate:status     # newly merged migrations appear as pending
   npm run db:migrate:dev        # apply them
   ```
5. **Gates, in this order** — cheap and deterministic first:
   ```bash
   npm run validate              # type-check + lint + format
   npm run framework:boundary    # the tier line
   npm run leaf:checks           # content chain + the eight invariant guards
   npm run db:drift-check        # the hand-written FKs and partial indexes
   npm run test
   ```
6. **The smokes, including the two CI cannot run** (see [[operations]]):
   ```bash
   npm run smoke:reclaim-run  &&  npm run smoke:reclaim-erasure  &&  npm run smoke:reclaim-access
   npm run smoke:reclaim            # ← the one that catches a bad globalThis resolution
   npm run smoke:reclaim-calendar   # ← I4 end-to-end
   ```
7. **Update the sync log** in [[README|.context/app/README.md]] with the new merge-base, and note any
   row you closed.

## What to be suspicious of

Ranked by how quietly it fails.

- **A coach that answers but has no tools.** The `globalThis` fixes above. No error, no log line; the
  agent simply stops being able to read state. `smoke:reclaim` is the only thing that notices.
- **A `prisma migrate dev` that emits a `DROP`.** The leaf's `user` FKs are plain scalars with no
  Prisma `@relation`, so Prisma computes a desired state without them. `db:drift-check` exists for
  exactly this and runs in CI, but on a sync it is worth running **before** you commit the migration.
- **A changed `getSlotHeads` / `getSlotHistory` signature.** F9's trends and `readRunAnswers` both read
  slot history directly; a signature change type-checks loudly, but a **semantic** change (say, heads
  filtered differently) would not. Re-read daybreak#162's row if that module moved at all.
- **New `EmailKind`s or hook event types.** If sunrise#465 or #468 landed, our local emitter and our
  direct `sendEmail` call become the duplicated shadow infrastructure those rows exist to remove.
- **A signup-mode config appearing.** sunrise#463 — set it to `invite_only` and keep the run-creation
  gate regardless. Note the row's own correction: there is no leaf `public-nav.ts` tidy to delete.

## The ledger, at a glance

**18 rows, all open, all filed. 8 Daybreak · 10 Sunrise.** Four carry upstream code (above); the rest
are leaf-side workarounds or documented exclusions with nothing to unwind but a comment.

Three of them are the same finding wearing different hats — `HOOK_EVENT_TYPES` (sunrise#465), the
module-config descriptor walker (daybreak#161) and `EmailPropsMap` (sunrise#468) are each a generic
mechanism behind a closed type, and each cost this app a parallel implementation. If a sync lands any
one of them, it is worth reading the other two: the fix shape tends to generalise.
