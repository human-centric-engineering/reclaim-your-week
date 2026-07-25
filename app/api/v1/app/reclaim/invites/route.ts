/**
 * Reclaim invites — list + issue (F8 t-1). Admin only.
 *
 * GET  /api/v1/app/reclaim/invites   → every invite, enriched (one query, no per-row fetches)
 * POST /api/v1/app/reclaim/invites   → issue (or re-issue with `?resend=true`) a tiered invite
 *
 * A leaf surface **beside** Sunrise's generic `/api/v1/users/invite`, not a replacement for it: this
 * one carries the access **tier**, which is what the entitlement gate reads (I14). Core's route keeps
 * working untouched for ordinary user administration (I10).
 *
 * Auth is `withAdminAuth`; the inherited 100/min section cap applies via `proxy.ts`, and an explicit
 * per-flow sub-cap is added here because issuing an invite **sends email** — the expensive sub-flow
 * `CLAUDE.md` carves out of the section cap.
 */

import { z } from 'zod';
import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse, errorResponse } from '@/lib/api/responses';
import { ErrorCodes } from '@/lib/api/errors';
import { validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import { prisma } from '@/lib/db/client';
import { inviteLimiter, createRateLimitResponse } from '@/lib/security/rate-limit';
import { getClientIP } from '@/lib/security/ip';
import { issueInvite, listInvites } from '@/lib/app/programme/access/invites';
import { RECLAIM_INVITE_TIERS } from '@/lib/app/programme/access/tiers';

const issueInviteSchema = z.object({
  email: z.string().email().max(320),
  name: z.string().trim().min(1).max(120),
  tier: z.enum(RECLAIM_INVITE_TIERS),
});

export const GET = withAdminAuth(async () => {
  return successResponse({ invites: await listInvites() });
});

export const POST = withAdminAuth(async (request, session) => {
  const log = await getRouteLogger(request);

  const rateLimit = inviteLimiter.check(getClientIP(request));
  if (!rateLimit.success) {
    log.warn('Reclaim invite rate limit exceeded', { adminId: session.user.id });
    return createRateLimitResponse(rateLimit);
  }

  const body = await validateRequestBody(request, issueInviteSchema);
  const email = body.email.trim().toLowerCase();

  // An account already exists — an invite would create nothing. Say so rather than issuing a token
  // that `/accept-invite` will refuse (the same 409 core's route returns, for the same reason).
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser !== null) {
    return errorResponse('An account already exists for this email', {
      code: ErrorCodes.EMAIL_TAKEN,
      status: 409,
    });
  }

  const resend = new URL(request.url).searchParams.get('resend') === 'true';

  const result = await issueInvite({
    email,
    tier: body.tier,
    inviteeName: body.name,
    inviterName: session.user.name ?? 'Reclaim Your Week',
    resend,
  });

  log.info('Reclaim invite issued', {
    inviteId: result.invite.id,
    tier: result.invite.tier,
    emailStatus: result.emailStatus,
    adminId: session.user.id,
  });

  return successResponse(
    {
      invite: {
        id: result.invite.id,
        email: result.invite.email,
        tier: result.invite.tier,
        createdAt: result.invite.createdAt.toISOString(),
        expiresAt: result.expiresAt.toISOString(),
      },
      emailStatus: result.emailStatus,
      message:
        result.emailStatus === 'pending'
          ? 'An invitation is already pending for this address. Re-send it to issue a new link.'
          : result.emailStatus === 'sent'
            ? 'Invitation sent.'
            : 'Invitation created, but the email could not be sent.',
    },
    undefined,
    { status: result.emailStatus === 'pending' ? 200 : 201 }
  );
});
