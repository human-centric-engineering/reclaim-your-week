/**
 * Claim a coach-opening moment without generating a turn.
 *
 * POST /api/v1/app/reclaim/runs/:runId/coach/openings   body: { moment }   → { opened }
 *
 * **Why this exists beside the stream route.** A moment is two things that usually travel together:
 * a fact about the run ("this leader has now seen the picture of their week") and a coach turn about
 * it. On the conversational path the stream route does both. On the **form** path there is no
 * conversation to speak into, and the fact still has to be recorded — otherwise a leader who chose
 * the form surface could never satisfy the I12 transition gate and would be stuck in phase 1.
 *
 * So this is the fact on its own. Same claim, same run-ownership check, no model call and no cost.
 *
 * Not rate-limited by a chat limiter, deliberately: it makes no model call, so the section cap
 * `proxy.ts` already applies to `/api/v1/**` is the right ceiling. Spending a leader's ten-per-minute
 * chat budget on a button that costs nothing would make the conversational path poorer for no reason.
 */

import { z } from 'zod';
import { withAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import { ValidationError } from '@/lib/api/errors';
import { cuidSchema } from '@/lib/validations/common';
import { COACH_OPENING_MOMENTS } from '@/lib/app/programme/coach/opening';
import { claimCoachOpening } from '@/app/api/v1/app/reclaim/runs/service';

const openingSchema = z.object({ moment: z.enum(COACH_OPENING_MOMENTS) });

export const POST = withAuth<{ runId: string }>(async (request, session, { params }) => {
  const log = await getRouteLogger(request);
  const parsed = cuidSchema.safeParse((await params).runId);
  if (!parsed.success) {
    throw new ValidationError('Invalid run id', { runId: ['Must be a valid id'] });
  }
  const runId = parsed.data;
  const { moment } = await validateRequestBody(request, openingSchema);

  // Ownership and in-progress live inside the claim's `where`, so they cannot be forgotten and the
  // whole thing stays one statement. A run that is not the caller's simply claims nothing.
  const opened = await claimCoachOpening(session.user.id, runId, moment);

  log.info('Reclaim coach opening claimed', { runId, moment, opened });
  return successResponse({ opened });
});
