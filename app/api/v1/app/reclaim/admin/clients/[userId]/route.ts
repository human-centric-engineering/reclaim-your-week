/**
 * One leader's full record (F10 t-1). Admin only.
 *
 * GET /api/v1/app/reclaim/admin/clients/:userId
 *
 * This is the route that serves the two **`sensitive`** setup slots the list deliberately withholds
 * (plan D5) — `reclaim_setup_keeping_me_up` and `reclaim_setup_why_now`. Rashmir is entitled to read
 * them; the design decision is that opening a person's context should be a deliberate act rather than
 * a column you scroll past. Keeping them on their own endpoint is what makes that true of the data
 * and not merely of the CSS.
 *
 * 404 when the user has no programme footprint, rather than an empty record — an admin surface that
 * renders a blank profile for a stranger's id is a confusing way to leak that the id exists.
 */

import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { getRouteLogger } from '@/lib/api/context';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { cuidSchema } from '@/lib/validations/common';
import { getClientDetail } from '@/lib/app/programme/admin/clients';

export const GET = withAdminAuth<{ userId: string }>(async (request, session, { params }) => {
  const log = await getRouteLogger(request);

  const parsed = cuidSchema.safeParse((await params).userId);
  if (!parsed.success) {
    throw new ValidationError('Invalid user id', { userId: ['Must be a valid id'] });
  }

  const detail = await getClientDetail(session.user.id, parsed.data);
  if (detail === null) throw new NotFoundError('No programme record for that account');

  // Reading someone's sensitive context is worth a log line naming who read it — the audit trail an
  // access decision like D5 is only half of.
  log.info('Reclaim admin: client detail read', {
    adminId: session.user.id,
    subjectUserId: parsed.data,
    sensitiveFields: detail.context.length,
  });
  return successResponse(detail);
});
