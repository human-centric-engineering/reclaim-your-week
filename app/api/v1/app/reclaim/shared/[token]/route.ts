/**
 * Reclaim — a shared summary, by public token (F7 t-4).
 *
 * GET /api/v1/app/reclaim/shared/:token  → the shareable-safe summary, or 404.
 *
 * **Public — the unguessable token is the authorisation** (no session). It returns only the
 * shareable-safe `AuditSummary` (§10 fields — never the sensitive prose), which `buildSummary` carries
 * by construction. An unknown/revoked token 404s.
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
