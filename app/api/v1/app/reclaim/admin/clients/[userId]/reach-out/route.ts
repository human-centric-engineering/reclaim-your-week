/**
 * Writing to a leader who stopped (F18 t-2). Admin only.
 *
 * GET  → the opening draft, plus the two facts worth reading before sending, plus what was already sent
 * POST → send it, and record it whichever way the send goes
 *
 * **The draft is built server-side and the send takes the text from the body**, not from a draft id.
 * That is deliberate: the composer is fully editable, so what the leader receives has to be whatever
 * the operator actually typed. Nothing here is templated at send time.
 *
 * **A per-flow rate limit on top of the section cap.** `proxy.ts` already applies the admin cap; this
 * endpoint sends mail on a leader's address, which is the shape of sub-flow the repo asks to be capped
 * separately (`inviteLimiter`, the same one the invitation routes use).
 *
 * 404 for a user with no programme footprint, matching the client-detail route: an admin surface that
 * composes a message to a stranger's id is a confusing way to learn the id exists.
 */

import { z } from 'zod';
import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import { getClientIP } from '@/lib/security/ip';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { cuidSchema } from '@/lib/validations/common';
import { inviteLimiter, createRateLimitResponse } from '@/lib/security/rate-limit';
import { listClients } from '@/lib/app/programme/admin/clients';
import {
  buildReachOutDraft,
  listReachOuts,
  sendReachOut,
} from '@/lib/app/programme/admin/reach-out';

const sendSchema = z.object({
  /**
   * No line breaks. A subject reaches the provider as a mail header, and a header carrying a newline
   * is the classic injection: everything after it can be read as a header of its own (a second `Bcc`,
   * for instance). The provider is expected to defend itself and this is the one field on this route
   * that ends up in a header, so it is refused here rather than trusted there.
   */
  subject: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .refine((value) => !/[\r\n]/.test(value), {
      message: 'A subject cannot contain a line break',
    }),
  body: z.string().trim().min(1).max(5000),
  /** Which audit this is about, echoed from the draft. Recorded only — it selects nobody. */
  auditRunId: z.string().nullable().optional(),
});

/** The leader's id, or a 400. Never trusted from the path unparsed. */
async function subjectId(params: Promise<{ userId: string }>): Promise<string> {
  const parsed = cuidSchema.safeParse((await params).userId);
  if (!parsed.success) {
    throw new ValidationError('Invalid user id', { userId: ['Must be a valid id'] });
  }
  return parsed.data;
}

export const GET = withAdminAuth<{ userId: string }>(async (request, session, { params }) => {
  const log = await getRouteLogger(request);
  const userId = await subjectId(params);

  // The draft names where they stopped, and the phase label is the client list's own reading of that
  // rather than a second computation of it (the F10 lesson about derived numbers having one home).
  //
  // `listClients` narrowed to one leader, deliberately **not** `getClientDetail`: the detail read
  // fetches the two `sensitive` setup answers, and composing an email has no business reading what
  // somebody said keeps them up at night. D5 asks for that to be a deliberate act, and it is not one
  // here.
  const list = await listClients(session.user.id, [userId]);
  const client = list.clients.find((c) => c.userId === userId);
  if (client === undefined) throw new NotFoundError('No programme record for that account');

  const firstName =
    client.qualification['reclaim_profile_first_name'] ??
    client.name?.trim().split(/\s+/)[0] ??
    null;

  const [draft, sent] = await Promise.all([
    buildReachOutDraft(session.user.id, userId, {
      firstName,
      phaseLabel: client.currentPhaseLabel,
    }),
    listReachOuts(session.user.id, userId),
  ]);

  log.info('Reclaim admin: reach-out draft read', {
    adminId: session.user.id,
    subjectUserId: userId,
    alreadySent: sent.length,
  });
  return successResponse({ draft, sent });
});

export const POST = withAdminAuth<{ userId: string }>(async (request, session, { params }) => {
  const log = await getRouteLogger(request);
  const userId = await subjectId(params);

  const limit = inviteLimiter.check(getClientIP(request));
  if (!limit.success) return createRateLimitResponse(limit);

  const body = await validateRequestBody(request, sendSchema);

  const result = await sendReachOut({
    adminUserId: session.user.id,
    userId,
    subject: body.subject,
    body: body.body,
    auditRunId: body.auditRunId ?? null,
  });
  if (result === null) throw new NotFoundError('No account for that id');

  // Logged whichever way it went. "Who wrote to this leader, when" is the operator half of the record
  // the table keeps, and a failed send is the line most worth having.
  log.info('Reclaim admin: reach-out sent', {
    adminId: session.user.id,
    subjectUserId: userId,
    auditRunId: result.record.auditRunId,
    delivered: result.delivered,
  });
  return successResponse(result);
});
