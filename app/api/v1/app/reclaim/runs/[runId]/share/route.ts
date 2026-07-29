/**
 * Reclaim audit runs — the Phase 6 share (F7 t-4).
 *
 * POST /api/v1/app/reclaim/runs/:runId/share
 *   body: { publicLink?, withCoach?, ageBand?, takeaway?, quotable? }
 *
 * Sharing is invited, never required — this only runs when the leader opts in. Saves the optional
 * `reclaim_share_*` capture (run record, I3) and mints the token + coach-share + retained feedback
 * (`createShare`). Quote consent is its own field, not implied by sharing (Brief §3).
 */

import { z } from 'zod';
import { withAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import { ValidationError } from '@/lib/api/errors';
import { cuidSchema } from '@/lib/validations/common';
import { loadOwnedRun } from '@/app/api/v1/app/reclaim/runs/service';
import { saveRunAnswers, type RunAnswerInput } from '@/app/api/v1/app/reclaim/runs/service';
import { createShare } from '@/lib/app/programme/share';

const prose = z.string().trim().max(2000);
const shareSchema = z.object({
  publicLink: z.boolean().optional(),
  withCoach: z.boolean().optional(),
  /** F17. Its own question, and only meaningful alongside `withCoach`. */
  shareTranscript: z.boolean().optional(),
  ageBand: prose.optional(),
  takeaway: prose.optional(),
  quotable: z.boolean().optional(),
});

export const POST = withAuth<{ runId: string }>(async (request, session, { params }) => {
  const log = await getRouteLogger(request);
  const parsed = cuidSchema.safeParse((await params).runId);
  if (!parsed.success)
    throw new ValidationError('Invalid run id', { runId: ['Must be a valid id'] });
  const runId = parsed.data;
  const userId = session.user.id;

  await loadOwnedRun(runId, userId); // ownership; the run may be complete by now (share is post-summary)

  const body = await validateRequestBody(request, shareSchema);

  // The optional per-run record (only the fields the leader chose to give).
  const slots: RunAnswerInput[] = [];
  const flag = (slug: string, v: boolean | undefined) => {
    if (v !== undefined) slots.push({ slotSlug: slug, value: v ? 'Yes' : 'No', valueJson: v });
  };
  const text = (slug: string, v: string | undefined) => {
    if (v && v.trim()) slots.push({ slotSlug: slug, value: v.trim() });
  };
  flag('reclaim_share_with_coach', body.withCoach);
  text('reclaim_share_age_band', body.ageBand);
  text('reclaim_share_takeaway', body.takeaway);
  flag('reclaim_share_quotable', body.quotable);
  if (slots.length > 0) await saveRunAnswers(userId, runId, slots);

  const result = await createShare(userId, runId, {
    publicLink: body.publicLink,
    withCoach: body.withCoach,
    shareTranscript: body.shareTranscript,
    takeaway: body.takeaway,
    quotable: body.quotable,
  });

  log.info('Reclaim summary shared', {
    runId,
    publicLink: !!result.token,
    withCoach: !!body.withCoach,
    // Whether a leader let their conversation be read is worth being able to answer later, and the
    // flag is the fact — never any of its contents.
    transcript: body.withCoach === true && body.shareTranscript === true,
  });
  return successResponse(result);
});
