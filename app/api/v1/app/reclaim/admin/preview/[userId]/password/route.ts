/**
 * Give a test account a new password (F19). Admin only.
 *
 * POST /api/v1/app/reclaim/admin/preview/:userId/password  → `{ email, password, signInUrl }`
 *
 * ## Why this endpoint exists
 *
 * The password from `POST /preview` is shown once and stored nowhere, which is right — see
 * `resetPreviewAccountPassword` for why keeping it would be worse — but it left an operator who
 * closed the panel with no way back into an account that still held the audit they wanted to look at.
 * Removing and remaking the account recovered the login by throwing away the thing it was for.
 *
 * ## Why it is not a general password-reset route
 *
 * `resetPreviewAccountPassword` refuses any account that is not in the preview registry, and this
 * route 404s on the same check first, so the only accounts reachable here are ones an operator
 * deliberately marked as test accounts. That is the same guard `DELETE /preview/:userId` leans on,
 * for the same reason: a leaf path must not quietly become a way to act on arbitrary users.
 *
 * The admin's own account is refused explicitly. It cannot be in the registry — `adopt` will not put
 * an admin there — so reaching that branch means something is wrong, and locking yourself out of the
 * screen you are standing on is not how you should find out.
 */

import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse, errorResponse } from '@/lib/api/responses';
import { ErrorCodes } from '@/lib/api/errors';
import { getRouteLogger } from '@/lib/api/context';
import { prisma } from '@/lib/db/client';
import { appUrl } from '@/lib/app/programme/urls';
import { isPreviewAccount } from '@/lib/app/programme/preview/accounts';
import { resetPreviewAccountPassword } from '@/app/api/v1/app/reclaim/admin/preview/_lib/fabricate';

export const POST = withAdminAuth<{ userId: string }>(async (request, session, { params }) => {
  const log = await getRouteLogger(request);
  const { userId } = await params;

  if (!(await isPreviewAccount(userId))) {
    return errorResponse('That is not a test account', {
      code: ErrorCodes.NOT_FOUND,
      status: 404,
    });
  }

  if (session.user.id === userId) {
    return errorResponse('You cannot reset your own password here', {
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
  if (user.role === 'ADMIN') {
    return errorResponse('That account is an admin account and was not changed', {
      code: ErrorCodes.VALIDATION_ERROR,
      status: 400,
    });
  }

  const password = await resetPreviewAccountPassword(userId);

  // No password in the log line. It exists in the response body once, like the one at creation.
  log.info('Reclaim preview account password reset', { userId, adminId: session.user.id });

  return successResponse({
    account: { userId, email: user.email },
    password,
    signInUrl: `${appUrl()}/login`,
    message:
      'New password below, shown once. The old one no longer works, so anywhere still signed in as this account will need it again.',
  });
});
