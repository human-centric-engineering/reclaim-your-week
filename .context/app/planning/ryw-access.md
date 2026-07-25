---
name: ryw-access
feature: F8 · ryw-access
epic: RYW v1
status: in flight
owner: John
depends_on: F4 · ryw-shell (shipped #27–#30/#32) · F6 · ryw-current (the gate it layers on, shipped #37)
spec: ../sources/Reclaim_Your_Week_Brief_for_John.md §1 (list growth, success measures) · §2 (invite-gated, referral, consent for aggregate use) · §8 (access tiers) · ../invariants.md (I14 gate at run creation, I10 tier boundary, I3 write path, I5) · plan.md reconciliation 1 + 7
parent: plan.md
opened: 2026-07-25
---

# ryw-access — invites, grants, referrals, consent

> Feature-level build plan for **F8 `ryw-access`**: the tiered invite → grant flow, the referral
> unlock, and the consent record. Parent:
> [[plan#F8 · `ryw-access` — invites, grants, referrals|plan.md]]. Binding _how_: the **Brief**
> (§1 list growth, §2 access + consent, §8 tiers) and [[invariants]] — **I14** entitlement is
> enforced at run creation, **I10** the tier boundary, **I3** the single slot write path.
> Sizing follows the parent: **task = one PR**.
>
> **Documents read whole while planning this** (per [[planning-retro]] §A — "a grep is not a read"):
> the Brief §1/§2/§3/§8, [[plan]], [[ryw-phases]], [[building-a-feature]], [[planning-retro]], the
> leaf schema `prisma/schema/app-reclaim.prisma`, `lib/app/programme/runs/entitlement.ts`,
> `lib/utils/invitation-token.ts`, `app/api/auth/accept-invite/route.ts`, and `app/api/v1/users/invite/route.ts`.

## Intent

F1–F7 built the audit. **F8 decides who gets to run it, on what terms, and on what lawful basis.**
It is the last feature before the product can be shown to a real invite list, and it carries three
things the Brief names as commercial rather than technical:

- **The door.** Brief §2: "For v1, invite-gated: current clients, selected prospects, and the
  existing testers." Tiered links (client / standard / referral), client status an **admin flag she
  controls**, not code (§8).
- **The word of mouth.** Brief §1 makes the success measure "whether people come back, and whether
  they tell others about it unprompted", and §8 funds exactly that: a **second audit earned by
  referral** — on the referred person's _first completed audit_, not their signup.
- **The lawful basis.** Brief §2: "everyone should be aware and agree to the terms and conditions and
  privacy policy, **which should allow for data to be used in aggregate**." F10 t-3's cross-client
  analysis has no basis without a recorded, versioned consent, and consent captured retroactively is
  not consent.

**And one thing the plan assumed was already true and is not.** The audit is **not gated today**:
Sunrise's self-signup is enabled (`emailAndPassword`, a live `/signup` page, no `disableSignUp`), and
F6's `assertEntitled` **bootstraps a free grant for any account that has none** — a deliberate,
documented "least-risky path until F8" that reads as scaffolding in the plan and as a **self-serve
free tier** in production. F8 t-2 is what makes the invite gate real. See [[planning-retro]] §B.

Two stances govern the build:

- **Consume the platform; do not extend it** (I10). Every seam this feature naturally reaches for —
  the invitation token store, the invitation email, the accept-invite route, the admin invite page —
  is **Sunrise-owned**. F8 imports them and adds leaf surfaces beside them. See D1 below.
- **The gate stays where it is** (I14, reconciliation 1). F6 put entitlement at run creation because
  that is the only door to the module surface. F8 adds tiers, invites, referral and consent **to that
  same function**; it does not add a second gate somewhere else.

## Reconciliation against the live repo

Verified during planning, 2026-07-25. Seven findings, four of which change the shape of the tasks.
**D2 and D3 were the two genuine forks in the road and John ruled on both at the plan review
(2026-07-25): the recommended option in each.** They are recorded below as decided, with the
alternatives kept so a later reader can see what was weighed rather than assumed.

### D1 — "extend `lib/utils/invitation-token.ts`" is a tier-boundary violation. Consume instead.

`plan.md` F8 t-1 says: _"**Extend** `lib/utils/invitation-token.ts` + `emails/invitation.tsx` +
`app/admin/users/invite/page.tsx` (don't rebuild)."_ Right instinct, wrong verb — **all three are
Sunrise-owned**, so editing them is the merge conflict I10 exists to prevent. Nothing is lost: the
work is the same size with a different verb.

| What the plan said                       | What F8 actually does                                                                                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| extend `lib/utils/invitation-token.ts`   | **import** `generateInvitationToken` / `updateInvitationToken` from a leaf route; keep Sunrise's hashed-token store as the single source of token truth            |
| extend `emails/invitation.tsx`           | **register an override** for the `invitation` kind in `lib/app/emails.ts` (the reserved seam), with the leaf template in `components/app/emails/`                  |
| extend `app/admin/users/invite/page.tsx` | **add** `app/admin/programme/access/` (leaf-owned) and register the nav section in `leaf-admin-nav.ts`; Sunrise's generic user-invite page keeps working untouched |
| add `tier` to `app_reclaim_invite`       | unchanged — the leaf table is ours, and it is where `tier` belongs                                                                                                 |

**Why not put `tier` in the Sunrise invitation metadata?** `invitationMetadataSchema`
(`lib/validations/admin.ts`) is a plain `z.object`, so an extra key survives in the Json column but is
**silently stripped** by `parseInvitationMetadata`. A leaf reading it would need its own parser over
someone else's record. `ReclaimInvite` is ours, typed, and already in the schema.

**Consequence for the token column.** `ReclaimInvite.token` is `@unique` and required. Storing
Sunrise's plaintext invitation token there would undo its deliberate "store only the SHA-256 hash"
property. **D6: store the hash**, so the leaf row is matchable to an issued invite without weakening
the platform's posture; a resend rotates both together.

### D2 ✅ ruled — redemption has no leaf seam. Resolve the invite lazily, at the gate we already own.

The account is created by `app/api/auth/accept-invite/route.ts` (Sunrise), and better-auth's
`databaseHooks` live in `lib/auth/config.ts` (Sunrise). **There is no leaf hook at account
creation** — so "wire redemption to grant creation" cannot be done at redemption without editing a
lower tier.

**Decided:** _lazy redemption at the leaf's own door._ `assertEntitled` already runs at run
creation, is already leaf-owned, and is already the single gate (I14). It becomes: no live grant →
look for an unredeemed `ReclaimInvite` matching the caller's email → mark it redeemed and mint the
**tiered** grant → otherwise refuse (unless open-signup is on, t-4). Nothing moves; the bootstrap
branch is replaced rather than added to.

_Rejected for now:_ asking Daybreak/Sunrise for a post-signup leaf hook. It is the tidier long-term
answer and t-2 should **file it as a [[daybreak-asks]] row** (the "friction is a finding" stance,
[[planning-retro]] §A) — but it blocks F8 on an upstream change for a gate we can enforce correctly
today.

### D3 ✅ ruled — consent has the same problem, and the answer is the programme door.

Same shape as D2: the signup form and the accept-invite form are Sunrise-owned, so "explicit
acceptance at account creation" cannot be captured without forking them.

**Decided:** a **leaf-owned consent gate at the programme door** — a first-visit step under
`app/(protected)/programme/` that records `ReclaimConsent` (`policyVersion`, `acceptedAt`, and a
**separate, unticked** `marketingOptIn`), **enforced server-side at run creation** alongside
entitlement. Consent is then recorded before any programme data is processed, which is what Brief
§2's aggregate-use basis actually requires, and it covers **both** doors (invite today, open signup
later) rather than only the one we forked.

Two things this must get right, because they are legal rather than cosmetic:

- **Marketing opt-in is a separate, unticked box** with its own wording (UK GDPR/PECR). Accepting
  terms must not be readable as joining Rashmir's list — reconciliation 7's whole point is that list
  membership is a **separate fact** from having an account.
- **The clauses are Rashmir's** (open item 7). Build against a **versioned policy record** — the
  version string is config, the text is hers. An unreleased policy version must not silently
  re-consent an existing user.

_Rejected for now:_ forking `components/forms/signup-form.tsx` + the accept-invite form. Two forked
core forms, both on better-auth's path, to move the capture point earlier by one screen.

### D4 — self-signup stays open at the platform; the run refuses. Plus a nav tidy.

We cannot disable Sunrise's `/signup` without editing `lib/auth/config.ts`. We do not need to: an
account with no invite and no consent simply **cannot start an audit** (t-2/t-4), which is the gate
that matters (I14, reconciliation 1). Two cheap extras: drop the signup link from the public nav via
the reserved `lib/app/public-nav.ts` seam (cosmetic, not a gate — say so in the code comment), and
file a [[daybreak-asks]] row for a platform-level `disableSignUp` seam.

### D5 — client tier: the 12-month window is the implemented shape.

Brief §8 offers two readings in consecutive sentences — "unlimited use while under contract", then
"it might make it easier if I give clients a 12 month usage option that automatically shuts off 12
months after initiation, and that initiation must happen within a month of being given access (or
something like that)". **Build the window** — it is the one she reasons toward, and it is already
modelled: `ReclaimGrant.windowStartsAt` + `mustStartBy`, with `grantIsLive()` (F6) already checking
both. Two adjustments in t-2:

- **Unlimited-within-the-window:** `grantIsLive` currently refuses when `auditsUsed >= auditsGranted`.
  For `tier: 'client'` the count is not the limit — the window is. (`consumeAudit` still increments,
  so F10 can report usage.)
- **"or something like that" is coach-editable, not hardcoded.** Window length and start-by deadline
  come from `Module.config` (the F2 config schema), so she changes policy without a deploy — the same
  treatment F7 gave open items 10 and 11, and **not** feature-flag machinery.

### D6 — the schema needs an additive migration, and that is expected here.

Unlike F7 (where a `prisma/` diff was a red flag), F8 is the owning feature for three of F4's
front-loaded tables, and F4's own header says so: _"Columns beyond the core identity are the owning
feature's to refine — a later `ALTER` is the accepted cost."_ Expected additions:

- `ReclaimInvite`: `invitedByUserId String?` (referral attribution — without it t-3 cannot know whom
  to reward, and F10 t-2's referral-conversion number cannot be computed), `revokedAt DateTime?`
  (Rashmir revokes an invite), and a **unique index that makes redemption idempotent**.
- `ReclaimConsent`: a unique index per `(userId, policyVersion)` so a double-submit cannot write two
  consent rows.
- `ReclaimGrant`: `sourceInviteId String?` for provenance (which invite minted this grant).

Every new `userId`-shaped FK needs a **hand-written `ON DELETE`** plus a **drift probe** in
`leaf-db-drift.ts` (F4's pattern — Prisma emits none for a plain scalar FK). `invitedByUserId` is
**`SET NULL`**: the invite record outlives the inviter, exactly like `redeemedByUserId`. Migration
name is `app_…`-prefixed (boundary CI keys on the prefix).

### D7 — the hook-dispatch seam named in the plan does not accept a leaf event.

`plan.md` F8 t-4 says to emit signup / first-completion "through Daybreak's hook dispatch". Checked:
`emitHookEvent(eventType: HookEventType, …)` takes a **closed** `HOOK_EVENT_TYPES` `as const` list in
`lib/orchestration/hooks/types.ts` (Sunrise-owned) with no leaf extension point — `reclaim.signup`
does not type-check. **So:** a small leaf-owned emitter
(`lib/app/programme/access/events.ts`) that logs the two events and is the single place an ESP is
wired in later, **plus a [[daybreak-asks]] row** asking for a leaf-extensible event registry. No ESP
in v1 (the Brief only asks that the seam exist).

## Invariants this feature touches

| Invariant                       | How F8 honours it                                                                                                                                    | Guard                                                                                                       |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **I14** (gate at run creation)  | tiers, invite redemption and the consent check all land **inside `assertEntitled`** / the run-create path — no second gate, no `isModuleLive` change | unit tests on refusal (no invite · exhausted · expired window · missing consent); `smoke:reclaim-access`    |
| **I10** (tier boundary)         | no edit to `lib/utils/**`, `emails/**`, `app/api/auth/**`, `lib/auth/**`; leaf surfaces + the reserved `lib/app/*` seams only (D1)                   | `npm run framework:boundary`; the PR diff reviewed against the ownership table                              |
| **I3** (single slot write path) | F8 writes **Prisma rows**, not slots. If a marketing/consent answer ever needs to be a slot, it goes through `saveAnswer`                            | the existing write-path grep test in `leaf:checks` stays green (one `appendSlotValue` caller)               |
| **I5** (no `special_category`)  | consent + demographics are rows, not slots; nothing here introduces a slot at all                                                                    | `slot-sensitivity` invariant test unchanged and still green                                                 |
| **I16 / I17** (discernment)     | the referral ask is an invitation, never a nag or a paywall interstitial; a refused run explains the tier plainly and does not shame                 | copy review against Brief §2 ("no pressure on next steps anywhere in the product")                          |
| **GDPR** (repo rule + F10 t-5)  | new FKs carry hand-written `ON DELETE` (+ drift probes); `ReclaimConsent` stays **retained** (`SET NULL`) — the proof processing was lawful          | `smoke:reclaim-erasure` extended to the new columns: grant cascades, consent + invite survive de-attributed |

## Test strategy

vitest runs on `happy-dom` with **no live DB** ([[building-a-feature]] §1.2) — unit tests mock
`@/lib/db/client`; real-DB fidelity comes from the `smoke:*` scripts.

- **Tier + expiry maths (t-2)** — pure unit tests over the extended `grantIsLive`: free exhausted
  after one completion; client live inside the window, dead after 12 months from `windowStartsAt`,
  dead if never started past `mustStartBy`; the client count **not** limiting.
- **Idempotency, deliberately (t-1/t-2/t-3)** — [[planning-retro]] §B names this feature by name
  ("watch for this shape in F8's grant/referral writes"). Every "read, decide, insert" gets a
  **deterministic primary key** and a test that simulates the concurrent second insert (P2002) and
  asserts one row: `redeem_<inviteId>` for redemption, `referral_<inviteId>` for the unlock. A
  read-then-create with no unique key is a TOCTOU and will not pass review.
- **Refusals (t-2/t-4)** — the run-create route returns the entitlement error when: no invite, invite
  revoked, grant exhausted, window expired, **consent absent**. One test per refusal, asserting the
  status and the code, not just "it threw".
- **Referral fires on completion, not signup (t-3)** — the referred user signing up grants nothing;
  their **first `completeRun`** mints the inviter's second audit; a second completion does not mint a
  third.
- **Consent versioning (t-4)** — a recorded acceptance of `v1` does not satisfy a required `v2`;
  `marketingOptIn` defaults false and is never set by accepting terms.
- **`smoke:reclaim-access` (t-2, new)** — against real Postgres: issue a client-tier invite → resolve
  it on first run → complete → a second run is permitted (client) / refused (free). This is where the
  new unique indexes and hand-written cascades are actually exercised.
- **`smoke:reclaim-erasure` (t-4, extended)** — erasing a user cascades the grant, de-attributes the
  consent and the invite, and leaves no orphan.

## Promoted tasks

| id  | Intent                                                                                                           | Files likely to touch                                                                                                                                                                                                                                 | Deps | Status | PR  |
| --- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------ | --- |
| t-1 | Tiered invites: leaf issue/revoke route + `ReclaimInvite` tier row, the invite email override, the admin surface | `app/api/v1/app/reclaim/invites/**`, `lib/app/programme/access/invites.ts`, `lib/app/emails.ts`, `components/app/emails/invitation.tsx`, `app/admin/programme/access/**`, `lib/app/leaf-admin-nav.ts`, `prisma/schema/app-reclaim.prisma` + migration | F4   | todo   | —   |
| t-2 | The grant ledger + **the gate becomes real**: lazy invite→grant resolution, client window, client flag           | `lib/app/programme/runs/entitlement.ts`, `lib/app/programme/access/grants.ts`, `app/api/v1/app/reclaim/runs/route.ts`, `lib/app/programme/config.ts`, `scripts/smoke/reclaim-access.ts`, `lib/app/public-nav.ts`                                      | t-1  | todo   | —   |
| t-3 | Referral unlock: the user-facing "invite someone" flow, attribution, second audit on their **first completion**  | `app/api/v1/app/reclaim/invites/refer/route.ts`, `lib/app/programme/access/referrals.ts`, `app/(protected)/programme/**`, `lib/app/programme/runs/**` (completion)                                                                                    | t-2  | todo   | —   |
| t-4 | Consent + open-signup readiness + the follow-up seam                                                             | `app/(protected)/programme/**` (consent gate), `lib/app/programme/access/consent.ts`, `lib/app/programme/access/events.ts`, `lib/app/programme/config.ts`, `scripts/smoke/reclaim-erasure.ts`, `.context/app/daybreak-asks.md`                        | t-2  | todo   | —   |

> **Sizing note.** Four tasks; t-2 is the heavy one (it carries the migration's consequences, the
> tier semantics, the smoke, and the moment the product actually closes). t-3 depends on t-2 only for
> the grant helper — if t-2 runs long, t-4 can go before t-3 without rework, since consent and
> referral touch different files. **Watch:** if t-1's admin surface grows past a reviewable diff
> (list + issue + revoke + client flag), split the **admin UI** from the **issue/revoke API** — the
> API is what t-2 needs, and the full client list is F10 t-1's job anyway.

### t-1 — Tiered invites (issue, revoke, email, admin)

- **Leaf issue route** `POST /api/v1/app/reclaim/invites` (admin-guarded): takes email + `tier`
  (`client | standard | referral`), calls Sunrise's `generateInvitationToken` so the **existing**
  accept-invite flow still creates the account, and writes the `ReclaimInvite` row carrying the tier
  and the token **hash** (D1/D6). Revoke sets `revokedAt`; a revoked invite resolves to nothing at
  t-2's gate. Idempotent per email (re-issue rotates rather than duplicating).
- **The invite email** — override the `invitation` kind through `lib/app/emails.ts` with a leaf
  template in `components/app/emails/`, in the Brief §7 reassurance register (this is the first thing
  an invited leader ever reads from the product). Voice rules apply (I1/I2): third person, no em
  dashes.
- **Admin surface** under `app/admin/programme/access/`, section registered in `leaf-admin-nav.ts`
  (never the `admin-nav.ts` bridge — I10): issue an invite with a tier, revoke, see pending. **One
  enriched list endpoint, no per-row fetches** (repo rule). `<FieldHelp>` on the tier field — "what
  client tier means" is exactly the non-obvious field the rule exists for.
- **The migration** (D6): `invitedByUserId` (`SET NULL`), `revokedAt`, `sourceInviteId`, the
  redemption unique index, the consent unique index — with drift probes in `leaf-db-drift.ts`.

_Done when:_ an admin issues a client-tier invite and the invited person can accept it through the
existing flow; the `ReclaimInvite` row carries the tier and never the plaintext token; revoke is
visible in the admin list; `framework:boundary` green and the diff touches **no** Sunrise file.
_Gates:_ full loop (`/code-review` — data model + admin UI is the shape it pays for; `/security-review`
— an admin-guarded route that mints credentials-by-email).

### t-2 — The grant ledger, and the gate becomes real

- **Lazy resolution in `assertEntitled`** (D2): no live grant → find an unredeemed, unrevoked
  `ReclaimInvite` for the caller's email → mark redeemed (deterministic PK, idempotent) → mint the
  tiered grant → else **refuse**. The F6 unconditional free bootstrap is **removed** — that removal
  is the feature.
- **Tier semantics** (D5): free = one complete audit; client = window-bounded, count not limiting,
  `windowStartsAt` on first use, `mustStartBy` from issue + the config deadline. Window length and
  deadline read from `Module.config`; **the client flag is Rashmir's**, set in the t-1 admin surface.
- **The refusal copy is product, not an error string** (I16/I17): it says what tier they are on and
  what happens next, without shame and without a pitch (Brief §2 — "no pressure on next steps
  anywhere in the product"). It is what an exhausted free-tier leader sees.
- **`smoke:reclaim-access`** (new) and the public-nav tidy (D4). File the D2/D4/D7 [[daybreak-asks]]
  rows here or in t-4 — whichever lands first.

_Done when:_ an account with no invite **cannot** start a run; a client-tier invite resolves to a
windowed grant on first use; an expired window and an exhausted free grant are each refused with a
test; the smoke passes against real Postgres; no read-then-create without a deterministic key.
_Gates:_ full loop. **Budget a `/code-review` fix round** — [[planning-retro]] §B predicts findings on
exactly this shape, and F6's TOCTOU was found by two reviewers independently in this same file.

### t-3 — Referral unlock

- **The user-facing ask** — from the Phase 6 close (F7's summary) and the programme home: "invite
  someone in", an **invitation, never a nag** (I16). Issues a `referral`-tier invite carrying
  `invitedByUserId`.
- **Rate-limit sub-cap inside the handler** — a user-triggered email send is precisely the expensive
  sub-flow `CLAUDE.md` carves out of the inherited 100/min section cap. A referral flow with no
  sub-cap is a spam relay.
- **The unlock fires on the referred user's first `completeRun`** (Brief §8), never on their signup:
  mint the inviter's second audit as its own grant with PK `referral_<inviteId>`, so a re-run of the
  completion path cannot mint two.
- Emit the first-completion event through t-4's leaf emitter (or leave the call site and land the
  emitter in t-4 — whichever task goes first).

_Done when:_ a referred signup grants nothing; their first completion grants the inviter exactly one
more audit; a second completion grants nothing further; the send route has its own sub-cap.
_Gates:_ full loop (`/security-review` — a user-triggered email path).

### t-4 — Consent, open-signup readiness, the follow-up seam

- **The consent gate** (D3): a leaf-owned first-visit step recording `ReclaimConsent`
  (`policyVersion` from config, `acceptedAt`, separate **unticked** `marketingOptIn`), **enforced at
  run creation** next to entitlement. Placeholder clause text until Rashmir supplies it (open item 7)
  — the **mechanism** is not blocked on the wording.
- **Open-signup readiness** (reconciliation 7): a `Module.config` value that, when turned on, mints a
  **standard-tier grant** for an account with no invite. v1 ships it **off** — the point is that
  opening the door is a config change she makes, not a refactor. Config, not feature-flag machinery.
- **The follow-up-sequence seam** (D7): `lib/app/programme/access/events.ts` — two named emissions
  (signup/first-run, first-completion) that log today and are the single wiring point for an ESP
  later. Plus the [[daybreak-asks]] row for a leaf-extensible hook-event registry. **No ESP in v1.**
- **Extend `smoke:reclaim-erasure`** to the new columns: the grant cascades, the consent and the
  invite survive de-attributed, no orphans.

_Done when:_ consent version recorded per user with a test; a run is refused without consent;
`marketingOptIn` is separate, unticked, and never set by accepting terms; flipping the open-signup
config value creates a valid standard-tier grant **with no code change**; the erasure smoke covers
the new columns. _Gates:_ full loop (`/security-review` — the consent record is the compliance
artifact).

## Notes / deferrals

- **What F8 unblocks:** F10 `ryw-admin` entirely (its client list reads the grant ledger + client
  flag; its referral-conversion success measure reads t-3's attribution; its aggregate analysis needs
  t-4's consent). F9 `ryw-repeat` is already `available` and does not wait on this.
- **Three [[daybreak-asks]] rows are expected**, all "friction is a finding" rather than defects:
  no leaf hook at account creation (D2), no platform seam to disable self-signup (D4), and a closed
  hook-event enum with no leaf extension point (D7). File them with repros; do not carry framework
  code for any of them.
- **What F8 does _not_ do:** payments (parked), the full admin client list (F10 t-1), the follow-up
  email sequence itself (seam only), and the qualification read-out from the setup form (F10 t-1 —
  F6 already captures the answers).
- **Two open items touch this feature and neither blocks it:** open item 6 (the v1 invite list — a
  data question, not a build one) and open item 7 (privacy/IP clauses — t-4 builds against a
  versioned placeholder).
