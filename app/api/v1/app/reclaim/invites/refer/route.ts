/**
 * Refer someone in (F8 t-3). Authenticated leaders, not admins.
 *
 * POST /api/v1/app/reclaim/invites/refer
 *
 * Issues a `referral`-tier invitation carrying `invitedByUserId`, which is the only link back to the
 * referrer whose second audit unlocks when this person **completes** their first (Brief §8).
 *
 * Two protections, and both are load-bearing rather than ceremonial:
 *   - a **per-flow rate-limit sub-cap**, because this is a user-triggered email send — exactly the
 *     expensive sub-flow `CLAUDE.md` carves out of the inherited 100/min section cap. A referral
 *     endpoint without one is a spam relay wearing the product's return address;
 *   - a ceiling on **outstanding** invitations per leader, so an account cannot quietly become a
 *     mailing list. Redeemed ones do not count against it.
 */

import { z } from 'zod';
import { withAuth } from '@/lib/auth/guards';
import { successResponse, errorResponse } from '@/lib/api/responses';
import { ErrorCodes } from '@/lib/api/errors';
import { validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import { prisma } from '@/lib/db/client';
import { inviteLimiter, createRateLimitResponse } from '@/lib/security/rate-limit';
import { getClientIP } from '@/lib/security/ip';
import { issueInvite } from '@/lib/app/programme/access/invites';
import { countPendingReferrals, MAX_PENDING_REFERRALS } from '@/lib/app/programme/access/referrals';

const referSchema = z.object({
  email: z.string().email().max(320),
  name: z.string().trim().min(1).max(120),
});

export const POST = withAuth(async (request, session) => {
  const log = await getRouteLogger(request);

  const rateLimit = inviteLimiter.check(getClientIP(request));
  if (!rateLimit.success) {
    log.warn('Reclaim referral rate limit exceeded', { userId: session.user.id });
    return createRateLimitResponse(rateLimit);
  }

  const body = await validateRequestBody(request, referSchema);
  const email = body.email.trim().toLowerCase();

  if (email === session.user.email.toLowerCase()) {
    return errorResponse('That is your own address', {
      code: ErrorCodes.VALIDATION_ERROR,
      status: 400,
    });
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser !== null) {
    // Deliberately not "that person already has an account" — the caller does not get to probe who is
    // registered. The refusal is true and says nothing about the address.
    return errorResponse('That invitation could not be sent', {
      code: ErrorCodes.VALIDATION_ERROR,
      status: 400,
    });
  }

  if ((await countPendingReferrals(session.user.id)) >= MAX_PENDING_REFERRALS) {
    return errorResponse(
      `You have ${MAX_PENDING_REFERRALS} invitations still outstanding. Once some of those are taken up, you can send more.`,
      { code: ErrorCodes.VALIDATION_ERROR, status: 400 }
    );
  }

  const result = await issueInvite({
    email,
    tier: 'referral',
    inviteeName: body.name,
    inviterName: session.user.name ?? 'A colleague',
    invitedByUserId: session.user.id,
  });

  log.info('Reclaim referral issued', {
    inviteId: result.invite.id,
    referrerUserId: session.user.id,
    emailStatus: result.emailStatus,
  });

  return successResponse(
    {
      emailStatus: result.emailStatus,
      message:
        result.emailStatus === 'pending'
          ? 'An invitation is already on its way to that address.'
          : 'Your invitation is on its way.',
    },
    undefined,
    { status: 201 }
  );
});
