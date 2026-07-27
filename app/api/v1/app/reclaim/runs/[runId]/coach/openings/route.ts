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
 * So this is the fact on its own. Same claim, same run-ownership check, **same phase check**, no
 * model call and no cost.
 *
 * The phase check is not optional here just because nothing is generated. It was missing on the
 * first cut of this route and `/security-review` caught it: without it a leader could claim
 * `phase-1-chart-reveal` while still on phase 0 and then leave phase 1 without ever seeing the
 * picture. That harms nobody but themselves, which is why it is a correctness bug rather than a
 * vulnerability — but it would leave I12's gate held by the client, which is precisely what I9 and
 * I12 were written to prevent.
 *
 * Not rate-limited by a chat limiter, deliberately: it makes no model call, so the section cap
 * `proxy.ts` already applies to `/api/v1/**` is the right ceiling. Spending a leader's ten-per-minute
 * chat budget on a button that costs nothing would make the conversational path poorer for no reason.
 */

import { z } from 'zod';
import { withAuth } from '@/lib/auth/guards';
import { successResponse, errorResponse } from '@/lib/api/responses';
import { validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import { ValidationError } from '@/lib/api/errors';
import { cuidSchema } from '@/lib/validations/common';
import { COACH_OPENING_MOMENTS, openingBelongsToPhase } from '@/lib/app/programme/coach/opening';
import { claimCoachOpening, loadCoachTurnTarget } from '@/app/api/v1/app/reclaim/runs/service';

const openingSchema = z.object({ moment: z.enum(COACH_OPENING_MOMENTS) });

export const POST = withAuth<{ runId: string }>(async (request, session, { params }) => {
  const log = await getRouteLogger(request);
  const parsed = cuidSchema.safeParse((await params).runId);
  if (!parsed.success) {
    throw new ValidationError('Invalid run id', { runId: ['Must be a valid id'] });
  }
  const runId = parsed.data;
  const { moment } = await validateRequestBody(request, openingSchema);

  // The moment must belong to the phase the leader is actually on, exactly as the stream route
  // requires. Without this the I12 transition gate is bypassable by its own leader: claim
  // `phase-1-chart-reveal` while still on phase 0, and phase 1 can then be left without the picture
  // ever having been shown. That costs nobody but them, and it would still make a gate this app
  // documents as server-held effectively client-held, which is the thing I9 and I12 both exist to
  // rule out. `loadCoachTurnTarget` also asserts ownership and in-progress, so the claim below is
  // now guarded twice over.
  const target = await loadCoachTurnTarget(session.user.id, runId);
  if (!openingBelongsToPhase(moment, target.phaseKey)) {
    log.info('Reclaim coach opening refused — wrong phase', {
      runId,
      moment,
      phaseKey: target.phaseKey,
    });
    return errorResponse('That moment does not belong to this phase.', {
      code: 'OPENING_WRONG_PHASE',
      status: 422,
      details: { moment, phaseKey: target.phaseKey },
    });
  }

  // Ownership and in-progress live inside the claim's `where` too, so they cannot be forgotten and
  // the write stays one statement. A run that is not the caller's simply claims nothing.
  const opened = await claimCoachOpening(session.user.id, runId, moment);

  log.info('Reclaim coach opening claimed', { runId, moment, opened });
  return successResponse({ opened });
});
