/**
 * Reclaim group invite links — list + mint (F11). Admin only.
 *
 * GET  /api/v1/app/reclaim/invite-links   → every link, with its seat count and status
 * POST /api/v1/app/reclaim/invite-links   → mint a capped, dated link
 *
 * Auth is `withAdminAuth`; the inherited 100/min section cap applies via `proxy.ts`. No per-flow
 * sub-cap here — minting sends no email and does no expensive work, so the section cap is the whole
 * of it. (The *public* claim route is the one that needs its own limiter; see `join/[token]`.)
 *
 * The tier is not accepted from the body. A group link is `standard` by construction — see
 * `JOIN_LINK_TIER` — and taking it as input would make the paid client tier one request-body edit
 * away from being mintable as a shareable URL.
 */

import { z } from 'zod';
import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse, errorResponse } from '@/lib/api/responses';
import { ErrorCodes } from '@/lib/api/errors';
import { validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import {
  mintInviteLink,
  listInviteLinks,
  InviteLinkInvalid,
} from '@/lib/app/programme/access/invite-links';
import { readReclaimJoinConfig } from '@/lib/app/programme/config';

const mintLinkSchema = z.object({
  label: z.string().trim().min(1).max(120),
  maxClaims: z.number().int().min(1).max(500),
  expiryDays: z.number().int().min(1).max(90),
});

/** The form needs the defaults and the ceiling to prefill and to explain itself, so send both. */
export const GET = withAdminAuth(async () => {
  const [links, config] = await Promise.all([listInviteLinks(), readReclaimJoinConfig()]);
  return successResponse({ links, config });
});

export const POST = withAdminAuth(async (request, session) => {
  const log = await getRouteLogger(request);
  const body = await validateRequestBody(request, mintLinkSchema);

  try {
    const { link, token } = await mintInviteLink({
      label: body.label,
      maxClaims: body.maxClaims,
      expiryDays: body.expiryDays,
      createdByUserId: session.user.id,
    });

    log.info('Reclaim invite link minted', {
      linkId: link.id,
      maxClaims: link.maxClaims,
      adminId: session.user.id,
    });

    return successResponse(
      {
        link: {
          id: link.id,
          token,
          label: link.label,
          tier: link.tier,
          maxClaims: link.maxClaims,
          claimCount: link.claimCount,
          status: 'live' as const,
          expiresAt: link.expiresAt.toISOString(),
          createdAt: link.createdAt.toISOString(),
        },
        message: 'Link created.',
      },
      undefined,
      { status: 201 }
    );
  } catch (error) {
    // The ceiling refusals carry a sentence written for Rashmir; pass it through rather than
    // flattening it into a generic 400.
    if (error instanceof InviteLinkInvalid) {
      return errorResponse(error.message, { code: ErrorCodes.VALIDATION_ERROR, status: 400 });
    }
    throw error;
  }
});
