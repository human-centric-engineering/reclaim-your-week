/**
 * Reclaim group invite links — the claim (F11). **Public.**
 *
 * POST /api/v1/app/reclaim/join/:token   → issue this person a standard-tier invitation
 *
 * **The token is the authorisation, and there is no session.** Same shape as the leaf's other public
 * token route (`app/api/v1/app/reclaim/shared/[token]/route.ts`): validate the token's form before
 * touching the database, and 404 on anything that does not resolve.
 *
 * **What this endpoint deliberately cannot do.** It creates no account, sets no password, and returns
 * no token. All it does is put a row in the invite ledger and send the ordinary invitation email — so
 * the worst a malicious claimer achieves is spending one of the link's seats and emailing an
 * invitation to an address they control. Account creation still runs through Sunrise's
 * `/accept-invite`, which proves the address, and the entitlement gate still applies its
 * anti-escalation checks on first run.
 *
 * **Why the responses are deliberately flat.** Every refusal returns the same 404-ish shape rather
 * than distinguishing "no such link" from "wrong tier" — a claim endpoint that reports precisely why
 * it said no is an oracle for probing tokens. The four *link-state* refusals (revoked, expired, full,
 * unknown) do differ, because a person standing in a room needs to know whether to ask for a new link
 * or wait, and none of them is information an attacker cannot get by claiming a seat anyway.
 */

import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/api/responses';
import { ErrorCodes, handleAPIError } from '@/lib/api/errors';
import { validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import { prisma } from '@/lib/db/client';
import {
  claimInviteLink,
  InviteLinkRefused,
  JOIN_TOKEN_PATTERN,
  type LinkRefusal,
} from '@/lib/app/programme/access/invite-links';

/**
 * `website` is the honeypot: hidden from real users, filled by bots. Same field name as Sunrise's
 * contact form.
 *
 * **It deliberately does NOT carry `.max(0)` the way the contact schema does.** A schema that rejects
 * a filled honeypot answers a bot with a 400 naming the field, which tells whoever wrote it exactly
 * which input to leave alone next time. Accepting any string here and checking it in the handler lets
 * the refusal look identical to a success, which is the only version of this trick that keeps
 * working. The bound is generous but present, so the field cannot be used to post a payload.
 */
const claimSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().email().max(320),
  website: z.string().max(500).optional(),
});

/**
 * What a person is told when a link will not serve them. Written for someone holding a phone in a
 * room, not for a log: each says what has happened and what to do about it, and none suggests they
 * did something wrong (I17).
 */
const REFUSAL_MESSAGE: Record<LinkRefusal, string> = {
  unknown:
    'This link is not one we recognise. Check with whoever shared it that it is the current one.',
  revoked: 'This link has been closed. Whoever shared it can send you a new one.',
  expired: 'This link has expired. Whoever shared it can send you a new one.',
  full: 'This link has reached the number of people it was opened for. Whoever shared it can open another.',
};

export const POST = async (
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
): Promise<Response> => {
  const log = await getRouteLogger(request);
  const { token } = await params;

  // Shape-check before any query: an unbounded string reaching a unique lookup is needless work, and
  // the pattern is the same one `mintToken` produces.
  if (!JOIN_TOKEN_PATTERN.test(token)) {
    return errorResponse(REFUSAL_MESSAGE.unknown, { code: ErrorCodes.NOT_FOUND, status: 404 });
  }

  try {
    const body = await validateRequestBody(request, claimSchema);

    // Honeypot: answer exactly as a success would, so a bot learns nothing from the difference, and
    // do no work.
    if (body.website !== undefined && body.website !== '') {
      log.warn('Reclaim join honeypot triggered');
      return successResponse({ outcome: 'invited', message: CONFIRMATION });
    }

    // The invitation email says who it is from. A group link's sender is whoever minted it, which is
    // resolved here rather than in the domain module so that module stays free of user lookups.
    const link = await prisma.reclaimInviteLink.findUnique({
      where: { token },
      select: { createdByUserId: true },
    });
    const creator =
      link?.createdByUserId == null
        ? null
        : await prisma.user.findUnique({
            where: { id: link.createdByUserId },
            select: { name: true },
          });

    const result = await claimInviteLink({
      token,
      name: body.name,
      email: body.email,
      inviterName: creator?.name ?? 'Reclaim Your Week',
    });

    log.info('Reclaim join claim handled', { outcome: result.outcome });

    return successResponse({
      outcome: result.outcome,
      message: result.outcome === 'already_registered' ? ALREADY_REGISTERED : CONFIRMATION,
    });
  } catch (error) {
    if (error instanceof InviteLinkRefused) {
      log.info('Reclaim join claim refused', { reason: error.reason });
      return errorResponse(REFUSAL_MESSAGE[error.reason], {
        code: ErrorCodes.NOT_FOUND,
        status: error.reason === 'unknown' ? 404 : 409,
      });
    }
    // Public route, so there is no guard wrapper to fall back on: an unhandled throw here is a 500
    // shown to someone standing in a room. `handleAPIError` turns a validation failure (a mistyped
    // address) into the 400 it should always have been.
    return handleAPIError(error);
  }
};

/**
 * The same sentence for a first claim and a repeat one. A second tap should read as reassurance
 * rather than as an error, and the person's inbox is in the same state either way.
 */
const CONFIRMATION =
  'Check your email. There is an invitation waiting, and the link in it will set up your account.';

const ALREADY_REGISTERED =
  'You already have an account with this address, so there is nothing to claim here. Sign in and you are all set.';
