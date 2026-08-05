/**
 * The leader's own conversation, as a PDF.
 *
 * GET /api/v1/app/reclaim/runs/:runId/transcript.pdf → application/pdf (attachment)
 *
 * The same read as `transcript.txt` next door, rendered to match the report. Both are offered
 * because they answer different questions: the text file is the one that will still open in thirty
 * years, and this is the one that looks like the thing it came from.
 *
 * **Signed in, and their own run.** `readOwnTranscript` scopes on `userId` in the query, and a run
 * that is not theirs 404s exactly as one that does not exist.
 *
 * `runtime = 'nodejs'`: `@react-pdf/renderer` renders to a Node Buffer.
 */

import { withAuth } from '@/lib/auth/guards';
import { errorResponse } from '@/lib/api/responses';
import { ValidationError } from '@/lib/api/errors';
import { getRouteLogger } from '@/lib/api/context';
import { cuidSchema } from '@/lib/validations/common';
import { readOwnTranscript, transcriptFilename } from '@/lib/app/programme/runs/transcript';
import { renderTranscriptPdf } from '@/app/api/v1/app/reclaim/runs/[runId]/_lib/render-transcript-pdf';

export const runtime = 'nodejs';

export const GET = withAuth<{ runId: string }>(async (request, session, { params }) => {
  const parsed = cuidSchema.safeParse((await params).runId);
  if (!parsed.success) {
    throw new ValidationError('Invalid run id', { runId: ['Must be a valid id'] });
  }

  const transcript = await readOwnTranscript(session.user.id, parsed.data);
  if (transcript === null) {
    return errorResponse('That conversation is not available', { code: 'NOT_FOUND', status: 404 });
  }

  const pdf = await renderTranscriptPdf(transcript);

  const log = await getRouteLogger(request);
  // Counts and bytes, never a word of the content.
  log.info('Reclaim transcript downloaded', {
    runId: transcript.runId,
    format: 'pdf',
    turns: transcript.turns.length,
    bytes: pdf.length,
  });

  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${transcriptFilename(transcript, 'pdf')}"`,
      'Cache-Control': 'no-store',
    },
  });
});
