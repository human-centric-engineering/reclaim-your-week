/**
 * The audit summary as a downloadable PDF (F15 t-2).
 *
 * GET /api/v1/app/reclaim/runs/:runId/report.pdf → application/pdf (attachment)
 *
 * The leader's own takeaway. `sources/Time_Audit_App_Notes.md:46-47` asked for a "Summary Report.
 * Downloadable, shareable" and F7 shipped `window.print()`, which is the browser's dialogue rather
 * than a document: no page breaks, no print stylesheet, and the app chrome unless a `print:hidden`
 * happened to catch it.
 *
 * **Signed in, and their own run.** `withAuth` plus `loadOwnedRun`. The report carries their role,
 * their hours and what they said their priorities were, so unlike the tokenised share
 * (`/api/v1/app/reclaim/shared/:token`, which serves a summary a leader deliberately published) this
 * is not a bearer surface.
 *
 * **It never generates the analyst's reading**, and that is deliberate rather than an oversight.
 * `buildSummary` renders whatever is stored, including nothing. Generation lives on the leader's own
 * summary route (F14's lazy path) because an export must never be the thing that first spends money,
 * and a twenty-second model call inside a download is a broken download.
 *
 * No extra rate limiter beyond the automatic 100/min on `/api/v1/**`: rendering is the only cost and
 * it is bounded, unlike a model call.
 *
 * `runtime = 'nodejs'`: `@react-pdf/renderer` renders to a Node Buffer.
 */

import { withAuth } from '@/lib/auth/guards';
import { ValidationError } from '@/lib/api/errors';
import { getRouteLogger } from '@/lib/api/context';
import { cuidSchema } from '@/lib/validations/common';
import { loadOwnedRun } from '@/app/api/v1/app/reclaim/runs/service';
import { buildSummary } from '@/lib/app/programme/summary';
import { renderSummaryPdf } from '@/app/api/v1/app/reclaim/runs/[runId]/_lib/render-summary-pdf';
import { summaryPdfResponse } from '@/app/api/v1/app/reclaim/runs/[runId]/_lib/pdf-response';

export const runtime = 'nodejs';

export const GET = withAuth<{ runId: string }>(async (request, session, { params }) => {
  const parsed = cuidSchema.safeParse((await params).runId);
  if (!parsed.success) {
    throw new ValidationError('Invalid run id', { runId: ['Must be a valid id'] });
  }
  const runId = parsed.data;

  // 404s for another leader's run, which is the same answer as one that does not exist — a
  // download endpoint must not confirm that somebody else's audit is there.
  await loadOwnedRun(runId, session.user.id);

  const summary = await buildSummary(session.user.id, runId);
  const pdf = await renderSummaryPdf(summary);

  const log = await getRouteLogger(request);
  // Counts and flags, never content: this log line is not covered by erasure.
  log.info('Reclaim summary PDF generated', {
    runId,
    bytes: pdf.length,
    areas: summary.current.buckets.length,
    withAnalystReading: summary.analyst !== null,
  });

  return summaryPdfResponse(pdf, summary);
});
