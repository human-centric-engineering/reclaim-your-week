/**
 * Reclaim audit runs — the leader's own summary (F7 t-4).
 *
 * GET /api/v1/app/reclaim/runs/:runId/summary  → the AuditSummary for this run.
 *
 * The in-app Phase 6 view (before any sharing). Ownership-scoped (`loadOwnedRun`); the public,
 * token-gated view is `/api/v1/app/reclaim/shared/:token`.
 */

import { withAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { ValidationError } from '@/lib/api/errors';
import { cuidSchema } from '@/lib/validations/common';
import { ensureReportReading, loadOwnedRun } from '@/app/api/v1/app/reclaim/runs/service';
import { buildSummary } from '@/lib/app/programme/summary';

export const GET = withAuth<{ runId: string }>(async (_request, session, { params }) => {
  const parsed = cuidSchema.safeParse((await params).runId);
  if (!parsed.success)
    throw new ValidationError('Invalid run id', { runId: ['Must be a valid id'] });
  const runId = parsed.data;

  await loadOwnedRun(runId, session.user.id);

  // F14's lazy path, and the only place it belongs.
  //
  // `completeRun` generates the report agent's reading, so the common case has one before anyone reads
  // the summary. This covers the two it cannot: audits finished before F14 shipped, and generations
  // that failed. Write-once and best-effort inside, so a second tab cannot produce a second reading
  // and a model failure cannot break the page.
  //
  // **Deliberately not on the public share route or the PDF route.** Both reach `buildSummary` too,
  // and neither should be the thing that first spends money — a token-holder who is not the leader
  // must never trigger a billed call, and a twenty-second model call inside a download is a broken
  // download. Those surfaces render whatever is stored, including nothing.
  await ensureReportReading(session.user.id, runId);

  return successResponse(await buildSummary(session.user.id, runId));
});
