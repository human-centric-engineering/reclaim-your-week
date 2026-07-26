/**
 * Reclaim group invite links — revoke (F11). Admin only.
 *
 * DELETE /api/v1/app/reclaim/invite-links/:id
 *
 * Withdraws the link so no further claims resolve. The row is retained (it records that access was
 * offered, and to how many), and the invitations **already claimed through it are untouched** — those
 * people accepted in good faith, and taking their invitation back because the link was later closed
 * would punish them for someone else's timing.
 */

import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse, errorResponse } from '@/lib/api/responses';
import { ErrorCodes, ValidationError } from '@/lib/api/errors';
import { getRouteLogger } from '@/lib/api/context';
import { cuidSchema } from '@/lib/validations/common';
import { revokeInviteLink } from '@/lib/app/programme/access/invite-links';

export const DELETE = withAdminAuth<{ id: string }>(async (request, session, { params }) => {
  const log = await getRouteLogger(request);
  const { id: rawId } = await params;
  const parsed = cuidSchema.safeParse(rawId);
  if (!parsed.success) throw new ValidationError('Invalid link id', { id: ['Must be a valid id'] });

  const revoked = await revokeInviteLink(parsed.data);
  if (revoked === null) {
    return errorResponse(
      'That link cannot be withdrawn — it does not exist or is already withdrawn',
      {
        code: ErrorCodes.NOT_FOUND,
        status: 404,
      }
    );
  }

  log.info('Reclaim invite link revoked', { linkId: revoked.id, adminId: session.user.id });
  return successResponse({ id: revoked.id, revokedAt: revoked.revokedAt?.toISOString() ?? null });
});
