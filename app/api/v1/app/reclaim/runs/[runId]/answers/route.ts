/**
 * Reclaim audit runs — save an answer, or read the run's answers.
 *
 * POST /api/v1/app/reclaim/runs/:runId/answers        body: { slotSlug, value, valueJson? }
 * GET  /api/v1/app/reclaim/runs/:runId/answers?slugs=a,b   → { answers: { slug: { value, valueJson } } }
 *
 * POST persists one captured answer through `saveRunAnswer` → `saveAnswer` (I3), stamped with this
 * run's id (F1) and masked (I5). GET returns the run-scoped answers the phase UIs resume from and the
 * chart reads (via `readRunAnswers`, which filters by `provenance.runId`). The run is server-verified
 * from the path — the client never supplies the run key as an LLM arg (I6).
 */

import { z } from 'zod';
import { withAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { validateRequestBody } from '@/lib/api/validation';
import { getRouteLogger } from '@/lib/api/context';
import { ValidationError } from '@/lib/api/errors';
import { cuidSchema } from '@/lib/validations/common';
import { saveRunAnswer } from '@/app/api/v1/app/reclaim/runs/service';
import { readRunAnswers } from '@/lib/app/programme/runs/answers';

const answerSchema = z.object({
  slotSlug: z.string().trim().min(1).max(120),
  value: z.string().min(1),
  valueJson: z.unknown().optional(),
});

function parseRunId(raw: string): string {
  const parsed = cuidSchema.safeParse(raw);
  if (!parsed.success)
    throw new ValidationError('Invalid run id', { runId: ['Must be a valid id'] });
  return parsed.data;
}

export const POST = withAuth<{ runId: string }>(async (request, session, { params }) => {
  const log = await getRouteLogger(request);
  const runId = parseRunId((await params).runId);
  const body = await validateRequestBody(request, answerSchema);
  await saveRunAnswer(session.user.id, runId, body);
  log.info('Reclaim audit answer saved', { runId, slotSlug: body.slotSlug });
  return successResponse({ saved: true });
});

export const GET = withAuth<{ runId: string }>(async (request, session, { params }) => {
  const runId = parseRunId((await params).runId);
  const slugsParam = new URL(request.url).searchParams.get('slugs');
  const slugs = slugsParam
    ? slugsParam
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    : undefined;
  const answers = await readRunAnswers(session.user.id, runId, slugs);
  return successResponse({ answers });
});
