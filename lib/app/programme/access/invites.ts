/**
 * Tiered invites (F8 t-1) — the leaf's ledger beside Sunrise's invitation flow.
 *
 * **Consume, don't extend (I10).** Account creation stays entirely Sunrise's: `generateInvitationToken`
 * stores a hashed, 7-day, single-use token in `verification`, the email points at `/accept-invite`, and
 * `POST /api/auth/accept-invite` creates the user. None of those files is ours to edit. What Sunrise
 * has no concept of is a **tier**, so this module records one in `app_reclaim_invite` alongside — and
 * stores the token's **SHA-256 hash**, never the plaintext, so the leaf row is matchable to an issued
 * invite without undoing the platform's "only ever store the hash" posture.
 *
 * (`tier` deliberately does not ride in Sunrise's invitation `metadata`: `invitationMetadataSchema` is a
 * plain `z.object`, so an extra key survives the write and is silently **stripped** on read. A leaf
 * field belongs in a leaf table.)
 *
 * **Redemption is not here.** There is no leaf hook at account creation (sunrise#464), so the invite is
 * resolved lazily at the entitlement gate — the one door to the product (I14). See
 * `lib/app/programme/access/grants.ts`.
 */

import { createHash } from 'crypto';
import { prisma } from '@/lib/db/client';
import { logger } from '@/lib/logging';
import { BRAND } from '@/lib/brand';
import { env } from '@/lib/env';
import { sendEmail } from '@/lib/email/send';
import { resolveEmailTemplate } from '@/lib/email/registry';
import {
  generateInvitationToken,
  updateInvitationToken,
  getValidInvitation,
  deleteInvitationToken,
} from '@/lib/utils/invitation-token';
import type { ReclaimInviteTier } from '@/lib/app/programme/access/tiers';

/** Sunrise's invitation tokens expire after 7 days (`TOKEN_EXPIRY_DAYS`); mirrored for the email copy. */
const INVITE_EXPIRY_DAYS = 7;

type ReclaimInvite = Awaited<ReturnType<typeof prisma.reclaimInvite.findFirstOrThrow>>;

/**
 * The same hash Sunrise stores in `verification.value` (`sha256(token)`, hex). Recomputed rather than
 * imported because `hashToken` is private to that module — matching its algorithm is the contract we
 * depend on, and the pairing is asserted in `tests/unit/lib/app/programme/access/invites.test.ts`.
 */
export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** A live invite: issued, not redeemed, not revoked. What the entitlement gate is allowed to resolve. */
export function inviteIsLive(invite: ReclaimInvite): boolean {
  return invite.redeemedAt === null && invite.revokedAt === null;
}

/**
 * Find the invite an account should redeem: the **earliest** live invite for that email.
 *
 * Earliest, not latest, because the first invite is the one whose promise was made first — and because
 * a referral (which owes someone an unlock, F8 t-3) is typically what arrives first. Email match is
 * case-insensitive: better-auth lowercases on signup, and Rashmir types invitations by hand.
 */
export async function findLiveInviteForEmail(email: string): Promise<ReclaimInvite | null> {
  return prisma.reclaimInvite.findFirst({
    where: {
      email: { equals: email, mode: 'insensitive' },
      redeemedAt: null,
      revokedAt: null,
    },
    orderBy: { createdAt: 'asc' },
  });
}

export interface IssueInviteInput {
  email: string;
  tier: ReclaimInviteTier;
  /** Display name for the invitation email. */
  inviteeName: string;
  /** Who to attribute it to in the email copy. */
  inviterName: string;
  /** The referrer, for a `referral` invite. Null/omitted for an admin-issued one (F8 t-3). */
  invitedByUserId?: string | null;
  /**
   * The group link this was claimed through (F11). Set at creation rather than by the caller
   * afterwards: a second write is a second thing that can fail, and when it does the invite exists
   * with its provenance lost — which is exactly the row nobody can explain later.
   */
  viaLinkId?: string | null;
  /** Rotate the token and resend when an invitation is already pending for this email. */
  resend?: boolean;
}

export interface IssueInviteResult {
  invite: ReclaimInvite;
  /** `sent | failed | disabled` from `sendEmail`, or `pending` when an invite already stood. */
  emailStatus: 'sent' | 'failed' | 'disabled' | 'pending';
  expiresAt: Date;
}

/**
 * Issue (or re-issue) a tiered invite: Sunrise's token + our tier row + the invitation email.
 *
 * Idempotent-ish by design, mirroring Sunrise's own route: an invitation already pending for this email
 * is **not** silently duplicated — without `resend` the existing one is returned untouched (there is no
 * way to recover the plaintext token, so no link can be produced), and with `resend` the token is
 * rotated in place on the same row, preserving `invitedByUserId` and therefore any referral debt.
 */
export async function issueInvite(input: IssueInviteInput): Promise<IssueInviteResult> {
  const email = input.email.trim().toLowerCase();
  const existingToken = await getValidInvitation(email);
  const existingInvite = await findLiveInviteForEmail(email);

  if (existingToken !== null && existingInvite !== null && input.resend !== true) {
    return { invite: existingInvite, emailStatus: 'pending', expiresAt: existingToken.expiresAt };
  }

  const token =
    existingToken !== null
      ? await updateInvitationToken(email, {
          name: input.inviteeName,
          role: 'USER',
          invitedBy: input.invitedByUserId ?? 'system',
          invitedAt: new Date().toISOString(),
        })
      : await generateInvitationToken(email, {
          name: input.inviteeName,
          role: 'USER',
          invitedBy: input.invitedByUserId ?? 'system',
          invitedAt: new Date().toISOString(),
        });

  const tokenHash = hashInviteToken(token);

  // Rotate the hash on the standing row rather than adding a second one — two live invites for one
  // email would make `findLiveInviteForEmail` order-dependent and could strand a referral's attribution.
  const invite =
    existingInvite !== null
      ? await prisma.reclaimInvite.update({
          where: { id: existingInvite.id },
          data: { token: tokenHash, tier: input.tier },
        })
      : await prisma.reclaimInvite.create({
          data: {
            email,
            token: tokenHash,
            tier: input.tier,
            invitedByUserId: input.invitedByUserId ?? null,
            viaLinkId: input.viaLinkId ?? null,
          },
        });

  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  const appUrl = env.NEXT_PUBLIC_APP_URL ?? process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';
  const invitationUrl = `${appUrl}/accept-invite?token=${token}&email=${encodeURIComponent(email)}`;

  const emailResult = await sendEmail({
    to: email,
    subject: `An invitation to ${BRAND.name}`,
    react: resolveEmailTemplate('invitation', {
      inviterName: input.inviterName,
      inviteeName: input.inviteeName,
      inviteeEmail: email,
      invitationUrl,
      expiresAt,
    }),
  });

  if (!emailResult.success) {
    // The invite still stands — the row is the entitlement, the email is only its delivery.
    logger.warn('Reclaim: invitation email failed to send', {
      inviteId: invite.id,
      status: emailResult.status,
    });
  }

  // Record the outcome on the row, so a send that failed is a fact on the admin screen rather than a
  // line in a log nobody is watching. Written after the send for the obvious reason, and separately
  // from the row above because the status is not known until the provider has answered.
  const recorded = await prisma.reclaimInvite.update({
    where: { id: invite.id },
    data: { emailStatus: emailResult.status },
  });

  logger.info('Reclaim: invite issued', {
    inviteId: invite.id,
    tier: invite.tier,
    resend: existingInvite !== null,
    referred: invite.invitedByUserId !== null,
    emailStatus: emailResult.status,
  });

  return { invite: recorded, emailStatus: emailResult.status, expiresAt };
}

/**
 * Withdraw an unredeemed invite: the row is retained (audit) and the gate stops resolving it. Sunrise's
 * token is deleted too, so the `/accept-invite` link dies with it rather than still creating an account
 * the product would then refuse. Redeemed invites are not revocable — that entitlement already exists.
 */
export async function revokeInvite(inviteId: string): Promise<ReclaimInvite | null> {
  const invite = await prisma.reclaimInvite.findUnique({ where: { id: inviteId } });
  if (invite === null || invite.redeemedAt !== null) return null;

  await deleteInvitationToken(invite.email);
  const revoked = await prisma.reclaimInvite.update({
    where: { id: inviteId },
    data: { revokedAt: new Date() },
  });

  logger.info('Reclaim: invite revoked', { inviteId, tier: revoked.tier });
  return revoked;
}

/** One row of the admin list. Enriched server-side — no per-row fetches from the client (repo rule). */
export interface InviteListItem {
  id: string;
  email: string;
  tier: string;
  status: 'pending' | 'redeemed' | 'revoked';
  invitedByName: string | null;
  redeemedByName: string | null;
  /** The group link this was claimed through (F11), or null when Rashmir typed the address. */
  viaLinkLabel: string | null;
  /** What happened to the invitation email: `sent | failed | disabled`, or null if not recorded. */
  emailStatus: string | null;
  redeemedAt: string | null;
  createdAt: string;
}

/**
 * Every invite, newest first, with both user names and any group-link label resolved in **two** extra
 * queries (repo rule: a list endpoint returns everything the table renders; never a fetch per row).
 *
 * Two rather than one because they are unrelated lookups against different tables — still constant in
 * the number of invites, which is the property the rule is actually about.
 */
export async function listInvites(): Promise<InviteListItem[]> {
  const invites = await prisma.reclaimInvite.findMany({ orderBy: { createdAt: 'desc' } });

  const userIds = [
    ...new Set(
      invites.flatMap((i) =>
        [i.invitedByUserId, i.redeemedByUserId].filter((id): id is string => id !== null)
      )
    ),
  ];
  const linkIds = [
    ...new Set(invites.map((i) => i.viaLinkId).filter((id): id is string => id !== null)),
  ];

  const [users, links] = await Promise.all([
    userIds.length === 0
      ? []
      : prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true },
        }),
    linkIds.length === 0
      ? []
      : prisma.reclaimInviteLink.findMany({
          where: { id: { in: linkIds } },
          select: { id: true, label: true },
        }),
  ]);
  const nameById = new Map(users.map((u) => [u.id, u.name]));
  const labelById = new Map(links.map((l) => [l.id, l.label]));

  return invites.map((invite) => ({
    id: invite.id,
    email: invite.email,
    tier: invite.tier,
    status:
      invite.redeemedAt !== null ? 'redeemed' : invite.revokedAt !== null ? 'revoked' : 'pending',
    invitedByName:
      invite.invitedByUserId === null ? null : (nameById.get(invite.invitedByUserId) ?? null),
    redeemedByName:
      invite.redeemedByUserId === null ? null : (nameById.get(invite.redeemedByUserId) ?? null),
    viaLinkLabel: invite.viaLinkId === null ? null : (labelById.get(invite.viaLinkId) ?? null),
    emailStatus: invite.emailStatus,
    redeemedAt: invite.redeemedAt?.toISOString() ?? null,
    createdAt: invite.createdAt.toISOString(),
  }));
}
