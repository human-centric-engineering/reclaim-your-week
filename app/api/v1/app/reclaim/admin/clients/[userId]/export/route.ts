/**
 * One leader's complete record as JSON (F10 t-5). Admin only.
 *
 * GET /api/v1/app/reclaim/admin/clients/:userId/export
 *
 * The operator half of a subject-access request: everything the product holds about one person,
 * including their `sensitive` answers, because that is exactly what a data subject is entitled to.
 * A route that emits somebody's entire personal record in one response deserves the log line it gets.
 *
 * **A self-service export is deliberately not built here.** The Brief does not ask for one, and a
 * user-facing SAR flow (identity re-verification, rate limits, a download that expires) is its own
 * feature rather than a second export button.
 */

import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { getRouteLogger } from '@/lib/api/context';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { cuidSchema } from '@/lib/validations/common';
import { buildClientExport } from '@/lib/app/programme/admin/export';

export const GET = withAdminAuth<{ userId: string }>(async (request, session, { params }) => {
  const log = await getRouteLogger(request);

  const parsed = cuidSchema.safeParse((await params).userId);
  if (!parsed.success) {
    throw new ValidationError('Invalid user id', { userId: ['Must be a valid id'] });
  }

  const record = await buildClientExport(parsed.data);
  if (record === null) throw new NotFoundError('No such account');

  log.info('Reclaim admin: client record exported', {
    adminId: session.user.id,
    subjectUserId: parsed.data,
    answers: record.answers.length,
    runs: record.runs.length,
  });
  return successResponse(record);
});
