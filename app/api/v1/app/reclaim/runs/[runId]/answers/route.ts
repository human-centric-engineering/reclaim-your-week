/**
 * Reclaim audit runs — save an answer.
 *
 * POST /api/v1/app/reclaim/runs/:runId/answers   body: { slotSlug, value, nodeKey? }
 *
 * Persists one captured answer. Delegates to `saveRunAnswer` → `saveAnswer` (I3, the single write
 * path), which routes through masking (I5) and stamps this run's id as `provenance.runId` (F1). The
 * run is server-verified from the path — the client never supplies the run key as an LLM arg (I6).
 */

import { z } from 'zod';
import { withAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import { ValidationError } from '@/lib/api/errors';
import { cuidSchema } from '@/lib/validations/common';
import { saveRunAnswer } from '@/app/api/v1/app/reclaim/runs/service';

const answerSchema = z.object({
  slotSlug: z.string().trim().min(1).max(120),
  value: z.string().min(1),
});

export const POST = withAuth<{ runId: string }>(async (request, session, { params }) => {
  const log = await getRouteLogger(request);
  const { runId: rawRunId } = await params;
  const parsed = cuidSchema.safeParse(rawRunId);
  if (!parsed.success)
    throw new ValidationError('Invalid run id', { runId: ['Must be a valid id'] });
  const runId = parsed.data;

  const body = await validateRequestBody(request, answerSchema);
  await saveRunAnswer(session.user.id, runId, body);

  log.info('Reclaim audit answer saved', { runId, slotSlug: body.slotSlug });
  return successResponse({ saved: true });
});
