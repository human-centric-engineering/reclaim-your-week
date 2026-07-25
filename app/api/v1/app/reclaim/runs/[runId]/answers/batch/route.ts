/**
 * Reclaim audit runs — save several answers at once (F6).
 *
 * POST /api/v1/app/reclaim/runs/:runId/answers/batch   body: { answers: [{ slotSlug, value, valueJson? }] }
 *
 * The Phase 0 setup form and the Phase 1 cards each write many slots in one submit. Delegates to
 * `saveRunAnswers` → `saveAnswer` (I3, the single write path); ownership + active-run are checked
 * server-side; the run key is taken from the path, never an LLM arg (I6).
 */

import { z } from 'zod';
import { withAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import { ValidationError } from '@/lib/api/errors';
import { cuidSchema } from '@/lib/validations/common';
import { saveRunAnswers } from '@/app/api/v1/app/reclaim/runs/service';

const answerSchema = z.object({
  slotSlug: z.string().trim().min(1).max(120),
  value: z.string().min(1),
  valueJson: z.unknown().optional(),
});

const batchSchema = z.object({
  answers: z.array(answerSchema).min(1).max(60),
});

export const POST = withAuth<{ runId: string }>(async (request, session, { params }) => {
  const log = await getRouteLogger(request);
  const { runId: rawRunId } = await params;
  const parsed = cuidSchema.safeParse(rawRunId);
  if (!parsed.success)
    throw new ValidationError('Invalid run id', { runId: ['Must be a valid id'] });
  const runId = parsed.data;

  const body = await validateRequestBody(request, batchSchema);
  await saveRunAnswers(session.user.id, runId, body.answers);

  log.info('Reclaim audit answers saved', { runId, count: body.answers.length });
  return successResponse({ saved: body.answers.length });
});
