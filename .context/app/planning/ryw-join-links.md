---
name: ryw-join-links
feature: F11 · ryw-join-links
epic: RYW post-v1
status: shipped
owner: John
depends_on: F8 · ryw-access (the invite ledger and grant flow it layers on, shipped #41)
spec: ../sources/Reclaim_Your_Week_Brief_for_John.md §1 (list growth) · §2 (invite-gated, doors opened deliberately) · §8 (access tiers) · ../invariants.md (I10 tier boundary, I14 gate at run creation, I17 never judged)
parent: plan.md
opened: 2026-07-26
shipped: 2026-07-26
---

# ryw-join-links — one URL a room can claim from

> A shareable link, backed by a QR code, that presets a **standard**-tier invitation. Rashmir puts it
> on a slide or a handout at a workshop; each person adds their own name and email and receives the
> ordinary invitation email. Parent: [[plan]]. Binding _how_: **I10** (leaf-only), **I14**
> (entitlement still decided at run creation), **I17** (a closed link is not the visitor's fault).

## Intent

F8 made access deliberate: an account with no invitation cannot start an audit. It also made
inviting a **one-at-a-time** act — Rashmir types a name and an email, and `issueInvite()` sends a
link. That is the right shape for a named prospect and the wrong shape for a room.

The case this feature serves is a live one: a workshop or a leadership offsite, thirty people, a
slide with a code on it. Doing that with F8 alone means collecting thirty addresses on paper and
typing them in afterwards, which loses the moment the Brief §1 cares about most — people signing up
while they are still interested.

## The structural blocker, and the shape that gets round it

**Sunrise's invitation token cannot be the thing on the slide.** `generateInvitationToken`
(`lib/utils/invitation-token.ts`) binds a token to one email address, stores only its SHA-256 hash,
and `/api/auth/accept-invite` **deletes it on acceptance**. The first person to scan would consume
it for everybody. It is single-use by construction, and it is core code we do not edit (I10).

So a join link is a **new leaf-owned bearer capability that sits in front of the existing flow**. Its
only job is to prove "Rashmir authorised this person at this tier", after which `issueInvite()` runs
exactly as it does for an address she typed. The grant ledger, the `accountArrivedThroughInvite`
anti-escalation check (`access/grants.ts`), the entitlement gate and the invitations table are all
untouched, and none of them knows links exist.

Consequently the security model is a **bounded bearer capability**, not a secret. The URL is printed
on a wall; the defence is the two bounds every link carries.

## Decisions

| Decision                            | Choice                                                                                                                                                                                                                                                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tier a link may carry               | **`standard` only.** `client` is the paid twelve-month entitlement and must not be mintable from a forwarded screenshot; `referral` is meaningless (its unlock is owed to a specific referrer). Stored on the row rather than inferred, so widening it later is a data change and not a code one. |
| Cap and expiry                      | **Both required at mint.** Defaults 10 seats / 7 days, ceiling 50 seats / 90 days. A link with neither bound is `openSignup` with extra steps, which already exists and is more honest.                                                                                                           |
| Where the defaults and ceiling live | **`Module.config`** (`joinLinkDefaultMaxClaims`, `joinLinkDefaultDays`, `joinLinkMaxClaims`), beside `clientWindowMonths`. How big a room is, is not an engineering decision.                                                                                                                     |
| Over-ceiling caps                   | **Refused, never clamped.** A cap silently reduced from thirty to ten is a room where twenty people cannot get in and nobody is told why.                                                                                                                                                         |
| Someone who already has an account  | **Told to sign in, no entitlement, and no seat taken.** A link cannot help them (`/accept-invite` refuses a registered address, and redemption refuses an account that predates the invite). Topping someone up stays admin-only via `grantAnotherAudit`.                                         |
| Token storage                       | **Plaintext**, unlike `ReclaimInvite.token`. Rashmir must be able to reopen the page next month and reprint the _same_ QR, which a hash makes impossible. `ReclaimShare` sets the precedent.                                                                                                      |
| Token length                        | 16 bytes base64url (22 chars), not the 64-hex of a share token. QR density scales with payload, and a dense code scans badly from the back of a room — which is the setting this exists for.                                                                                                      |

## The two orderings that carry the feature

**1. The seat cap is taken by a conditional UPDATE.** `reserveSeat` puts every bound in the `WHERE`
clause (`claimCount < maxClaims`, plus `revokedAt` and `expiresAt` re-checked), so the database
decides. Reading the row and checking in JavaScript is a TOCTOU: two people scanning at the same
moment both read nine-of-ten and both write ten. [[planning-retro]] §B names that shape as one this
codebase has stopped accepting, and `redeemInviteForUser` already solves its own version the same
way. Proved against real Postgres by `smoke:reclaim-join`, which was checked by reverting the guard:
the read-then-write version issues **ten** invitations on a five-seat link.

**2. Both short-circuits run before a seat is taken.** An existing account, and a repeat claim from
the same address on the same link, each return without touching `claimCount`. Otherwise a room of
thirty where ten already have accounts loses a third of its capacity to people it cannot help, and a
double-tap on a phone costs a seat.

A failed **email** is deliberately not a failed claim: `issueInvite` treats the row as the
entitlement and the email as its delivery, so the person is invited either way and can be re-sent.
A failed **issue** hands the seat back.

## Invariants this feature touches

- **I10** — leaf-only. `lib/app/programme/access/invite-links.ts`, `app/api/v1/app/reclaim/**`,
  `app/(public)/join/**`, `components/app/**`, one `app_*` migration, the `lib/app/rate-limit.ts`
  seam. No core or framework file edited.
- **I14** — unchanged. A link produces an _invitation_, never a grant; entitlement is still decided
  at run creation.
- **I17** — the four link-state refusals (unknown, withdrawn, expired, full) each say what happened
  and what to do next, and none suggests the visitor did something wrong.
- **I2 / product voice** — `join-form.tsx` is classified `COACH_VOICED` in
  `tests/unit/invariants/product-voice.test.ts`. It is the first thing a leader ever reads.

## Two things worth knowing before changing this

**The rate limit is sized for a room, not for a credential form.** The obvious move is to reuse the
`auth` tier's OWASP 5/min. It would break the feature on first use: thirty people scanning in an
office or hotel are behind one NAT and arrive as a single IP, so the sixth person onward is refused
in exactly the scenario the link exists for. `reclaim-join` is 40/hour per IP. The real bound on
abuse is `maxClaims`, which holds no matter how many IPs are used; the limiter only stops the
endpoint being used as a mailer.

**Withdrawing a link does not withdraw the invitations claimed through it.** Those people accepted in
good faith, and closing the door behind them is not the same as taking back what they were given.

## Notes / deferrals

- **`client`-tier links** — revisit after watching one real session. The blast radius of a forwarded
  paid-tier link is the reason it is not in v1.
- **Per-participant referral links** — the referral debt is per-referrer, so this is a different
  feature, not a wider `tier` enum.
- **Retention for unclaimed invites.** An invite row whose email never becomes an account holds a
  personal email address outside `eraseUser()`'s reach. This already existed for typed invites; group
  links raise the volume. Worth a scheduled sweep, filed rather than solved here.
- **The QR is generated in-process** (`qrcode`, SVG by default). No hosted QR service: every one of
  them takes the payload as a query string, which would post a live bearer token to a third party on
  every render of the admin page.
