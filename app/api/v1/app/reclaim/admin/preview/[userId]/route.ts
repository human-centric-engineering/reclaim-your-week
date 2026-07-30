/**
 * Remove a test account (F19). Admin only.
 *
 * DELETE /api/v1/app/reclaim/admin/preview/:userId
 *
 * ## This is a real erasure, not a row delete
 *
 * It routes through `eraseUser()`, like every other account deletion in the app. A bespoke cleanup
 * would have to know about the runs, slots, grants, consent, shares, feedback and nudge rows a test
 * account accumulates, and would be wrong the first time somebody added a table — which is precisely
 * the repo rule that says never call `prisma.user.delete()`.
 *
 * ## The registry check is the guard, and it is doing real work
 *
 * The 404 for an account that is not in the registry is what keeps this from being a general-purpose
 * "delete any user" endpoint sitting under a leaf path with a looser rate limit than the platform's
 * own. The only accounts reachable here are ones an operator deliberately marked as test accounts.
 * The self and admin refusals below mirror `app/api/v1/users/[id]/route.ts` for the same reasons it
 * has them.
 *
 * ## What survives, and why the operator is told
 *
 * `ReclaimConsent.userId` is set to null rather than cascaded — the lawful-basis proof has to outlive
 * the person it is about — and any `ReclaimInvite` the account redeemed stays in the Access ledger
 * with its `redeemedByUserId` nulled. So after removing a test account that came in through an
 * invitation, that screen shows a redeemed invitation with a dash where a name was. That is correct
 * and it looks like a bug, so the response says so.
 */

import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse, errorResponse } from '@/lib/api/responses';
import { ErrorCodes } from '@/lib/api/errors';
import { getRouteLogger } from '@/lib/api/context';
import { prisma } from '@/lib/db/client';
import { eraseUser } from '@/lib/privacy/erase-user';
import { isPreviewAccount } from '@/lib/app/programme/preview/accounts';

export const DELETE = withAdminAuth<{ userId: string }>(async (request, session, { params }) => {
  const log = await getRouteLogger(request);
  const { userId } = await params;

  // First, and deliberately: this is the check that stops the route being a general user-delete.
  if (!(await isPreviewAccount(userId))) {
    return errorResponse('That is not a test account', {
      code: ErrorCodes.NOT_FOUND,
      status: 404,
    });
  }

  if (session.user.id === userId) {
    return errorResponse('You cannot remove your own account here', {
      code: ErrorCodes.VALIDATION_ERROR,
      status: 400,
    });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, role: true },
  });
  if (user === null) {
    return errorResponse('That account no longer exists', {
      code: ErrorCodes.NOT_FOUND,
      status: 404,
    });
  }

  // Belt and braces against a registry row pointing at an admin — `adopt` refuses to create one, so
  // reaching this means something went wrong, and erasing an admin account is not the way to find out.
  if (user.role === 'ADMIN') {
    return errorResponse('That account is an admin account and was not removed', {
      code: ErrorCodes.VALIDATION_ERROR,
      status: 400,
    });
  }

  await eraseUser({
    userId,
    userEmail: user.email,
    actorUserId: session.user.id,
    reason: 'admin_action',
  });

  log.info('Reclaim preview account removed', { userId, adminId: session.user.id });

  return successResponse({
    userId,
    deleted: true,
    message:
      'Test account removed. Its audits, answers and entitlement are gone. The terms it accepted are kept without a name, as the law requires, and any invitation it used stays on the Access screen with no one against it.',
  });
});
