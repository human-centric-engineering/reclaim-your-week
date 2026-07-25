/**
 * Reclaim — a shared summary, by public token (F7 t-4).
 *
 * GET /api/v1/app/reclaim/shared/:token  → the shareable-safe summary, or 404.
 *
 * **Public — the unguessable token is the authorisation** (no session). It returns only the
 * shareable-safe `AuditSummary` (§10 fields — never the sensitive prose), which `buildSummary` carries
 * by construction. An unknown token 404s.
 *
 * **There is no revoke yet, and this file used to imply there was.** `share.ts` mints and resolves;
 * it has no delete, no rotate and no expiry column, so once a leader shares a link the only way to
 * kill it is erasing their account. That gap was masked until now by a bug: run-scoped reads returned
 * only slot *heads*, so starting a second audit quietly emptied the link — an accidental kill switch
 * that fired on the wrong trigger and told nobody. Fixing the read (the correct outcome: a shared
 * summary keeps showing what was shared) removes the accident and leaves the gap visible.
 *
 * Recorded rather than fixed here, because "how does a leader take a shared link back" is a product
 * decision about where that control lives, not a line of code — and this branch is a bug fix.
 * Follow-up in `planning/ryw-repeat.md`.
 */

import { successResponse, errorResponse } from '@/lib/api/responses';
import { resolveShareToken } from '@/lib/app/programme/share';
import { buildSummary } from '@/lib/app/programme/summary';

export const GET = async (
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
): Promise<Response> => {
  const { token } = await params;
  if (!/^[a-f0-9]{16,96}$/.test(token)) {
    return errorResponse('Not found', { code: 'NOT_FOUND', status: 404 });
  }

  const resolved = await resolveShareToken(token);
  if (resolved === null) {
    return errorResponse('This shared summary is no longer available', {
      code: 'NOT_FOUND',
      status: 404,
    });
  }

  const summary = await buildSummary(resolved.userId, resolved.runId);
  return successResponse(summary);
};
