/**
 * Reclaim invites — revoke (F8 t-1). Admin only.
 *
 * DELETE /api/v1/app/reclaim/invites/:id
 *
 * Withdraws an **unredeemed** invite: the row is retained (it is a record that access was offered) and
 * Sunrise's `/accept-invite` token is deleted, so the link dies rather than still creating an account
 * the product would then refuse. A redeemed invite is not revocable — that entitlement already exists,
 * and taking it back is a grant question, not an invite one.
 */

import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse, errorResponse } from '@/lib/api/responses';
import { ErrorCodes, ValidationError } from '@/lib/api/errors';
import { getRouteLogger } from '@/lib/api/context';
import { cuidSchema } from '@/lib/validations/common';
import { revokeInvite } from '@/lib/app/programme/access/invites';

export const DELETE = withAdminAuth<{ id: string }>(async (request, session, { params }) => {
  const log = await getRouteLogger(request);
  const { id: rawId } = await params;
  const parsed = cuidSchema.safeParse(rawId);
  if (!parsed.success)
    throw new ValidationError('Invalid invite id', { id: ['Must be a valid id'] });

  const revoked = await revokeInvite(parsed.data);
  if (revoked === null) {
    return errorResponse('That invite cannot be revoked — it does not exist or has been redeemed', {
      code: ErrorCodes.NOT_FOUND,
      status: 404,
    });
  }

  log.info('Reclaim invite revoked', { inviteId: revoked.id, adminId: session.user.id });
  return successResponse({ id: revoked.id, revokedAt: revoked.revokedAt?.toISOString() ?? null });
});
