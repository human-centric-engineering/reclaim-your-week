/**
 * Reclaim audit runs — the optional calendar upload (F5 t-2).
 *
 * POST /api/v1/app/reclaim/runs/:runId/calendar   multipart: file (.ics), windowStart?, windowEnd?, period?
 *
 * Reads the calendar export **in memory** (`formData()` → `text()`), categorises it in one LLM call,
 * and persists **only per-bucket totals + structural metrics + ambiguous flags** via the single write
 * path (I4 — no meeting titles, ever). Returns the review payload the shell renders (F5 t-3). The run
 * is server-verified from the path; the client never supplies the run key as an LLM arg (I6).
 *
 * AUDIT INVARIANT (I4): this handler MUST NOT persist the raw file or any event title/attendee/
 * description. The `.ics` text lives only in the local `icsText` variable and is discarded when the
 * request ends. Enforced by tests/unit/invariants/calendar-privacy.test.ts (no `streamChat` import in
 * the calendar path) and smoke:reclaim-calendar (no meeting title anywhere in the DB).
 */

import { z } from 'zod';
import { withAuth } from '@/lib/auth/guards';
import { successResponse, errorResponse } from '@/lib/api/responses';
import { getRouteLogger } from '@/lib/api/context';
import { ValidationError } from '@/lib/api/errors';
import { cuidSchema } from '@/lib/validations/common';
import { uploadLimiter, createRateLimitResponse } from '@/lib/security/rate-limit';
import { loadOwnedRun, RUN_STATUS } from '@/app/api/v1/app/reclaim/runs/service';
import { analyseCalendarUpload } from '@/lib/app/programme/calendar/analyse';
import { CalendarProviderUnavailableError } from '@/lib/app/programme/calendar/categorise';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** ~4 MB of iCalendar text — comfortably a year of a busy calendar, but bounds the LLM payload (§8). */
const MAX_ICS_CHARS = 4_000_000;

const optionalDate = z
  .string()
  .datetime()
  .optional()
  .transform((v) => (v ? new Date(v) : undefined));

export const POST = withAuth<{ runId: string }>(async (request, session, { params }) => {
  const log = await getRouteLogger(request);
  const userId = session.user.id;

  // Per-flow sub-cap: an LLM call over an uploaded file is the expensive sub-flow CLAUDE.md carves out
  // of the inherited 100/min section cap.
  const limit = uploadLimiter.check(`reclaim-calendar:user:${userId}`);
  if (!limit.success) return createRateLimitResponse(limit);

  const { runId: rawRunId } = await params;
  const runIdParsed = cuidSchema.safeParse(rawRunId);
  if (!runIdParsed.success)
    throw new ValidationError('Invalid run id', { runId: ['Must be a valid id'] });
  const runId = runIdParsed.data;

  // Ownership + active-run check (404 if not the caller's run).
  const run = await loadOwnedRun(runId, userId);
  if (run.status !== RUN_STATUS.inProgress) {
    throw new ValidationError('This audit is not in progress', {
      run: ['A calendar can only be added to an active run.'],
    });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse('Expected multipart/form-data body', {
      code: 'INVALID_BODY',
      status: 400,
    });
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    throw new ValidationError('A calendar file is required', { file: ['Upload a .ics export'] });
  }

  const icsText = await file.text();
  if (icsText.length > MAX_ICS_CHARS) {
    throw new ValidationError('That calendar file is quite large', {
      file: ['Please export a shorter period (a few weeks) and try again.'],
    });
  }
  if (!icsText.includes('BEGIN:VCALENDAR')) {
    throw new ValidationError('That does not look like a calendar export', {
      file: ['Export your calendar as an .ics file and upload that.'],
    });
  }

  const windowStart = optionalDate.parse(formData.get('windowStart') ?? undefined);
  const windowEnd = optionalDate.parse(formData.get('windowEnd') ?? undefined);
  const periodRaw = formData.get('period');
  const periodLabel =
    typeof periodRaw === 'string' && periodRaw.trim().length > 0 ? periodRaw.trim() : undefined;

  try {
    const review = await analyseCalendarUpload(userId, runId, icsText, {
      windowStart,
      windowEnd,
      periodLabel,
    });
    log.info('Reclaim calendar analysed', {
      runId,
      bucketCount: review.buckets.length,
      ambiguousCount: review.ambiguous.length,
      truncated: review.truncated,
    });
    return successResponse(review);
  } catch (error) {
    if (error instanceof CalendarProviderUnavailableError) {
      return errorResponse('Calendar analysis is temporarily unavailable', {
        code: 'CALENDAR_PROVIDER_UNAVAILABLE',
        status: 503,
      });
    }
    throw error;
  }
});
