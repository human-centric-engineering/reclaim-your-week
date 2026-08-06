/**
 * The leader's own conversation, as a plain text file.
 *
 * GET /api/v1/app/reclaim/runs/:runId/transcript.txt → text/plain (attachment)
 *
 * The audit is the conversation, so the conversation is a thing a leader should be able to keep. Two
 * formats are offered beside the report and this is the one that will still open in thirty years:
 * the PDF next door matches the report's typography, and text matches nothing and needs nothing.
 *
 * **Signed in, and their own run**, like the report. `readOwnTranscript` scopes on `userId` in the
 * query rather than filtering after, and a run that is not theirs 404s exactly as one that does not
 * exist — a download endpoint must not confirm somebody else's audit is there.
 *
 * No extra rate limiter beyond the automatic 100/min on `/api/v1/**`: this is two indexed reads and
 * a string join, with no model call anywhere near it.
 */

import { withAuth } from '@/lib/auth/guards';
import { errorResponse } from '@/lib/api/responses';
import { ValidationError } from '@/lib/api/errors';
import { getRouteLogger } from '@/lib/api/context';
import { cuidSchema } from '@/lib/validations/common';
import {
  readOwnTranscript,
  transcriptFilename,
  transcriptToText,
} from '@/lib/app/programme/runs/transcript';

export const GET = withAuth<{ runId: string }>(async (request, session, { params }) => {
  const parsed = cuidSchema.safeParse((await params).runId);
  if (!parsed.success) {
    throw new ValidationError('Invalid run id', { runId: ['Must be a valid id'] });
  }

  const transcript = await readOwnTranscript(session.user.id, parsed.data);
  if (transcript === null) {
    return errorResponse('That conversation is not available', { code: 'NOT_FOUND', status: 404 });
  }

  const log = await getRouteLogger(request);
  // The count, never a word of the content.
  log.info('Reclaim transcript downloaded', {
    runId: transcript.runId,
    format: 'txt',
    turns: transcript.turns.length,
  });

  return new Response(transcriptToText(transcript), {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${transcriptFilename(transcript, 'txt')}"`,
      'Cache-Control': 'no-store',
    },
  });
});
