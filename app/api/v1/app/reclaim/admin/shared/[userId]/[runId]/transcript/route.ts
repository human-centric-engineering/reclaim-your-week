/**
 * One leader's conversation, where they consented to it being read (F17 t-2). Admin only.
 *
 * GET /api/v1/app/reclaim/admin/shared/:userId/:runId/transcript
 *
 * **The gate is `readSharedTranscript`, not this route.** It returns `null` for every refusal — no
 * share, results shared without the conversation, somebody else's run, a run that never opened one —
 * and this answers 404 for all of them alike. Distinguishing "they said no" from "there is nothing
 * there" would tell an operator something about a leader's choices that the leader did not offer.
 *
 * Logged with the subject and the run, never a word of the content: reading somebody's conversation
 * is the most intrusive thing this admin surface can do, and it should leave a trace that it
 * happened.
 */

import { withAdminAuth } from '@/lib/auth/guards';
import { successResponse, errorResponse } from '@/lib/api/responses';
import { getRouteLogger } from '@/lib/api/context';
import { ValidationError } from '@/lib/api/errors';
import { cuidSchema } from '@/lib/validations/common';
import { readSharedTranscript } from '@/lib/app/programme/admin/transcript';

export const GET = withAdminAuth<{ userId: string; runId: string }>(
  async (request, session, { params }) => {
    const { userId, runId } = await params;
    const subject = cuidSchema.safeParse(userId);
    const run = cuidSchema.safeParse(runId);
    if (!subject.success || !run.success) {
      throw new ValidationError('Invalid id', { params: ['Must be valid ids'] });
    }

    const transcript = await readSharedTranscript(session.user.id, subject.data, run.data);
    if (transcript === null) {
      return errorResponse('That conversation is not available', {
        code: 'NOT_FOUND',
        status: 404,
      });
    }

    const log = await getRouteLogger(request);
    log.info('Reclaim admin: shared transcript read', {
      adminId: session.user.id,
      subjectUserId: subject.data,
      runId: run.data,
      turns: transcript.turns.length,
    });

    return successResponse(transcript);
  }
);
