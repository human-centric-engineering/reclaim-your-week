/**
 * Group invite links (F11) — one URL a room can claim from.
 *
 * **This sits in front of the invite flow; it does not replace any of it.** Sunrise's invitation
 * token is bound to one email, stored as a hash, and deleted on acceptance, so it cannot be the thing
 * on the slide — the first scan would kill it for everyone else. A link's whole job is to prove
 * "Rashmir authorised this person at this tier", after which `issueInvite()` runs exactly as it does
 * for an address she typed by hand. The grant ledger, the anti-escalation check in `grants.ts`, the
 * entitlement gate and the invitations table are all untouched, and none of them knows links exist.
 *
 * **The security model is a bounded bearer capability.** Whoever holds the URL can claim one
 * standard-tier invitation, so the defence is not secrecy (it is printed on a wall) but the two
 * bounds every link carries: a seat count and an expiry. Both are required at mint, both are
 * enforced here on every claim, and the seat count is enforced by a conditional UPDATE rather than a
 * read-then-write — see `reserveSeat`.
 *
 * **What a link deliberately cannot do:** carry a tier other than `standard` (the paid client tier
 * must not be mintable from a forwarded screenshot), or grant anything to an account that already
 * exists (topping someone up stays an admin decision through `grantAnotherAudit`).
 */

import { prisma } from '@/lib/db/client';
import { logger } from '@/lib/logging';
import { env } from '@/lib/env';
import { issueInvite } from '@/lib/app/programme/access/invites';
import { readReclaimJoinConfig } from '@/lib/app/programme/config';

type ReclaimInviteLink = Awaited<ReturnType<typeof prisma.reclaimInviteLink.findFirstOrThrow>>;

/** The only tier a group link may carry in v1. Stored on the row, never inferred at read time. */
export const JOIN_LINK_TIER = 'standard';

/** How the claim token is shaped, and therefore what a route may accept without touching the DB. */
export const JOIN_TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 16 random bytes, base64url — 22 characters, ~128 bits.
 *
 * Deliberately shorter than the 64-hex share token. This one goes into a URL that becomes a QR code
 * on a printed handout or a slide read from the back of a room, and QR density scales with payload
 * length: a long token makes a code that scans badly in exactly the setting the feature exists for.
 * 128 bits of randomness is not the weak link in a capability whose seat count is ten.
 *
 * Uses the Web Crypto global rather than `node:crypto` so this module stays edge-safe, matching
 * `share.ts`.
 */
function mintToken(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * The URL that goes on the slide. Resolved from configured app URL rather than the request, because
 * the QR is generated server-side and a code encoding `localhost` printed onto a handout is a wasted
 * print run. Mirrors how `issueInvite` builds the `/accept-invite` link.
 */
export function buildJoinUrl(token: string): string {
  const appUrl = env.NEXT_PUBLIC_APP_URL ?? process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';
  return `${appUrl}/join/${token}`;
}

/** Why a link would not accept a claim. Each maps to its own sentence on the join page. */
export type LinkRefusal = 'unknown' | 'revoked' | 'expired' | 'full';

/**
 * What a claim did.
 *
 * `already_registered` is a refusal that costs no seat — see `claimInviteLink`.
 *
 * `invited_email_failed` is a **success** that the person must still be told about: they are properly
 * invited (the row is the entitlement) and their invitation is not going to arrive. Telling them to
 * check an inbox that will stay empty is the one outcome here that wastes somebody's afternoon.
 */
export type ClaimOutcome =
  'invited' | 'invited_email_failed' | 'already_claimed' | 'already_registered';

export interface ClaimResult {
  outcome: ClaimOutcome;
}

/** Raised when a link cannot accept a claim. The reason is safe to show; it never names the link. */
export class InviteLinkRefused extends Error {
  readonly reason: LinkRefusal;
  constructor(reason: LinkRefusal) {
    super(reason);
    this.name = 'InviteLinkRefused';
    this.reason = reason;
  }
}

/** Raised when a mint request exceeds what the config permits. Refused, never clamped. */
export class InviteLinkInvalid extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InviteLinkInvalid';
  }
}

export interface MintInviteLinkInput {
  label: string;
  maxClaims: number;
  expiryDays: number;
  createdByUserId: string;
}

/**
 * Mint a link. Both bounds are validated against `Module.config` and **refused** rather than clamped:
 * a cap silently reduced from thirty to ten is a room where twenty people cannot get in and nobody
 * is told why.
 */
export async function mintInviteLink(
  input: MintInviteLinkInput
): Promise<{ link: ReclaimInviteLink; token: string }> {
  const config = await readReclaimJoinConfig();
  const label = input.label.trim();

  if (label === '')
    throw new InviteLinkInvalid('Give the link a name so you can recognise it later.');
  if (!Number.isInteger(input.maxClaims) || input.maxClaims < 1) {
    throw new InviteLinkInvalid('A link needs to be for at least one person.');
  }
  if (input.maxClaims > config.joinLinkMaxClaims) {
    throw new InviteLinkInvalid(
      `A link can be for at most ${config.joinLinkMaxClaims} people. Issue a second link if you need more.`
    );
  }
  if (!Number.isInteger(input.expiryDays) || input.expiryDays < 1 || input.expiryDays > 90) {
    throw new InviteLinkInvalid('A link can stay open for between one and ninety days.');
  }

  const token = mintToken();
  const link = await prisma.reclaimInviteLink.create({
    data: {
      token,
      label,
      tier: JOIN_LINK_TIER,
      maxClaims: input.maxClaims,
      expiresAt: new Date(Date.now() + input.expiryDays * DAY_MS),
      createdByUserId: input.createdByUserId,
    },
  });

  logger.info('Reclaim: invite link minted', {
    linkId: link.id,
    maxClaims: link.maxClaims,
    tier: link.tier,
  });
  return { link, token };
}

/** Withdraw a link. Already-claimed invitations are untouched — those people accepted in good faith. */
export async function revokeInviteLink(linkId: string): Promise<ReclaimInviteLink | null> {
  const link = await prisma.reclaimInviteLink.findUnique({ where: { id: linkId } });
  if (link === null || link.revokedAt !== null) return null;

  const revoked = await prisma.reclaimInviteLink.update({
    where: { id: linkId },
    data: { revokedAt: new Date() },
  });

  logger.info('Reclaim: invite link revoked', { linkId, claimCount: revoked.claimCount });
  return revoked;
}

/** One row of the admin table. Enriched server-side — no per-row fetches from the client (repo rule). */
export interface InviteLinkListItem {
  id: string;
  token: string;
  label: string;
  tier: string;
  maxClaims: number;
  claimCount: number;
  status: 'live' | 'full' | 'expired' | 'revoked';
  expiresAt: string;
  createdAt: string;
}

/** How a link reads right now. Revoked outranks the rest: it is the state she chose deliberately. */
export function linkStatus(link: ReclaimInviteLink, now: Date): InviteLinkListItem['status'] {
  if (link.revokedAt !== null) return 'revoked';
  if (link.claimCount >= link.maxClaims) return 'full';
  if (now > link.expiresAt) return 'expired';
  return 'live';
}

/** Every link, newest first. */
export async function listInviteLinks(): Promise<InviteLinkListItem[]> {
  const links = await prisma.reclaimInviteLink.findMany({ orderBy: { createdAt: 'desc' } });
  const now = new Date();

  return links.map((link) => ({
    id: link.id,
    token: link.token,
    label: link.label,
    tier: link.tier,
    maxClaims: link.maxClaims,
    claimCount: link.claimCount,
    status: linkStatus(link, now),
    expiresAt: link.expiresAt.toISOString(),
    createdAt: link.createdAt.toISOString(),
  }));
}

/** Resolve a link by its token, or throw the reason it will not serve a claim. */
export async function resolveInviteLink(token: string): Promise<ReclaimInviteLink> {
  const link = await prisma.reclaimInviteLink.findUnique({ where: { token } });
  if (link === null) throw new InviteLinkRefused('unknown');

  const status = linkStatus(link, new Date());
  if (status !== 'live') throw new InviteLinkRefused(status);
  return link;
}

/**
 * Take one seat, atomically, or throw.
 *
 * **The whole condition lives in the WHERE clause.** Reading the row, checking `claimCount <
 * maxClaims` in JavaScript and then writing is a TOCTOU: two people scanning the QR at the same
 * moment both read nine-of-ten and both write ten, and the link issues eleven invitations.
 * `planning-retro.md` §B names that shape as one this codebase has stopped accepting, and
 * `redeemInviteForUser` already solves its own version of it the same way.
 *
 * Re-checking `revokedAt` and `expiresAt` here as well as in `resolveInviteLink` is not redundant:
 * they can change between the read and this write, and the point of a conditional update is that the
 * database decides, not the caller's stale copy.
 */
async function reserveSeat(linkId: string, now: Date): Promise<void> {
  const reserved = await prisma.reclaimInviteLink.updateMany({
    where: {
      id: linkId,
      revokedAt: null,
      expiresAt: { gt: now },
      claimCount: { lt: prisma.reclaimInviteLink.fields.maxClaims },
    },
    data: { claimCount: { increment: 1 } },
  });

  // Nothing matched: someone took the last seat, or it was withdrawn, between resolve and here.
  if (reserved.count === 0) throw new InviteLinkRefused('full');
}

/** Hand a reserved seat back when the work it was reserved for could not be completed. */
async function releaseSeat(linkId: string): Promise<void> {
  try {
    await prisma.reclaimInviteLink.update({
      where: { id: linkId },
      data: { claimCount: { decrement: 1 } },
    });
  } catch (error) {
    // Best-effort. A seat stranded by a failed release costs one invitation, and throwing here would
    // replace the caller's real error with a bookkeeping one.
    logger.warn('Reclaim: could not release an invite-link seat', { linkId, error: String(error) });
  }
}

export interface ClaimInviteLinkInput {
  token: string;
  name: string;
  email: string;
  /** Shown in the invitation email as the sender. The link's creator, resolved by the caller. */
  inviterName: string;
}

/**
 * Claim a seat on a link: validate, reserve, then issue an ordinary tiered invite.
 *
 * **The order of the checks is the design.** Both short-circuits below run BEFORE a seat is reserved,
 * because both describe people who should cost the room nothing:
 *
 *  1. **An account already exists** for this address. A link cannot help them — `/accept-invite`
 *     refuses an address that is already registered, and redemption rightly refuses an account that
 *     predates the invite. They are told to sign in, and if they have used their audit, topping it up
 *     stays Rashmir's decision (`grantAnotherAudit`). Costing them a seat would let the room's
 *     capacity be spent by people who cannot use it.
 *  2. **They already claimed this link.** A second tap on a phone, a back button, a re-scan. The
 *     invitation is already in their inbox, so say the same thing again and take nothing.
 *
 * Only then is a seat reserved, and only then is an invite issued. If issuing throws, the seat is
 * handed back. A failed *email* is not a failed claim: `issueInvite` treats the row as the
 * entitlement and the email as its delivery, so the person is invited either way and can be re-sent.
 */
export async function claimInviteLink(input: ClaimInviteLinkInput): Promise<ClaimResult> {
  const email = input.email.trim().toLowerCase();
  const link = await resolveInviteLink(input.token);

  const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existingUser !== null) {
    logger.info('Reclaim: invite link claimed by an existing account', { linkId: link.id });
    return { outcome: 'already_registered' };
  }

  const alreadyClaimed = await prisma.reclaimInvite.findFirst({
    where: {
      email: { equals: email, mode: 'insensitive' },
      viaLinkId: link.id,
      revokedAt: null,
    },
  });
  if (alreadyClaimed !== null) {
    // Same honesty as a first claim. Somebody re-scanning because nothing arrived is the most likely
    // person to hit this branch, and "check your email" is exactly the wrong thing to tell them when
    // the recorded reason nothing arrived is that the send failed.
    //
    // `!= null` rather than `!== null`, for the reason `grantExpiresAt` gives: a row selected without
    // this column yields `undefined`, and absent and null both mean "not recorded" — which is not the
    // same as failed. Rows issued before the column existed must not be reported as broken.
    const delivered = alreadyClaimed.emailStatus == null || alreadyClaimed.emailStatus === 'sent';
    return { outcome: delivered ? 'already_claimed' : 'invited_email_failed' };
  }

  await reserveSeat(link.id, new Date());

  try {
    const result = await issueInvite({
      email,
      tier: JOIN_LINK_TIER,
      inviteeName: input.name.trim(),
      inviterName: input.inviterName,
      // Written with the row, not after it. A follow-up update is a second thing that can fail, and
      // an invite that exists with no link attribution is one the repeat-claim check cannot find —
      // so the same person claiming again would spend a second seat.
      viaLinkId: link.id,
    });

    logger.info('Reclaim: invite link claimed', {
      linkId: link.id,
      inviteId: result.invite.id,
      emailStatus: result.emailStatus,
    });

    // The seat is spent and the invitation stands either way. What changes is what we say: a send
    // that failed or was never configured means no link is coming, and the person needs to know that
    // now rather than after an hour of watching an inbox.
    const delivered = result.emailStatus === 'sent' || result.emailStatus === 'pending';
    return { outcome: delivered ? 'invited' : 'invited_email_failed' };
  } catch (error) {
    await releaseSeat(link.id);
    throw error;
  }
}
