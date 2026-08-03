/**
 * Drive an existing test account into a state (F19). Admin only.
 *
 * POST /api/v1/app/reclaim/admin/preview/:userId/fast-forward  → `{ to, toPhase? }`
 *
 * The work is `fastForwardPreviewAccount`, which drives the same run service a leader's own routes
 * call and refuses outright for an account that is not in the registry. This route adds validation, the
 * admin guard, and one thing worth naming: a refusal from the engine is surfaced as a **400 with the
 * engine's own sentence**, not swallowed into a generic failure. If a facilitation-policy change starts
 * refusing a transition, the operator should read which phase and why, because that is a real finding
 * about the product rather than a broken button.
 */

import { z } from 'zod';
import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse, errorResponse } from '@/lib/api/responses';
import { ErrorCodes } from '@/lib/api/errors';
import { validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import { RECLAIM_PHASE_KEYS } from '@/lib/app/programme/runs/phases';
import { fastForwardPreviewAccount } from '@/app/api/v1/app/reclaim/admin/preview/_lib/fabricate';

const fastForwardSchema = z.object({
  to: z.enum(['mid-audit', 'summary']),
  /** Only meaningful for `mid-audit`. Validated against the map's own phase keys. */
  toPhase: z
    .string()
    .refine((key) => RECLAIM_PHASE_KEYS.includes(key), 'Not a phase of the audit')
    .optional(),
  quarter: z.string().trim().max(40).optional(),
});

export const POST = withAdminAuth<{ userId: string }>(async (request, session, { params }) => {
  const log = await getRouteLogger(request);
  const { userId } = await params;
  const body = await validateRequestBody(request, fastForwardSchema);

  try {
    const result = await fastForwardPreviewAccount(userId, body.to, {
      ...(body.toPhase === undefined ? {} : { toPhase: body.toPhase }),
      ...(body.quarter === undefined ? {} : { quarter: body.quarter }),
    });

    log.info('Reclaim preview account fast-forwarded', {
      userId,
      to: body.to,
      runId: result.runId,
      adminId: session.user.id,
    });

    return successResponse({
      ...result,
      message: result.atSummary
        ? 'That test account now has an audit filled in and waiting at the summary, with the report and the sharing choices. Signing in as it opens there; finishing it is yours to press.'
        : `That test account is now sitting at ${result.reachedPhaseKey}.`,
    });
  } catch (error) {
    // The engine's own words. A "something went wrong" here would hide the one thing this endpoint
    // is good at telling you: that the product refused a step it used to allow.
    const message = error instanceof Error ? error.message : 'That account could not be advanced.';
    log.warn('Reclaim preview fast-forward refused', { userId, adminId: session.user.id, message });

    return errorResponse(message, { code: ErrorCodes.VALIDATION_ERROR, status: 400 });
  }
});
