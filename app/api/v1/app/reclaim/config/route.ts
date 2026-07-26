/**
 * Reclaim — the coach-editable UI config the phase screens read (F7).
 *
 * GET /api/v1/app/reclaim/config   → { strategyMirror }
 *
 * Whether Phase 4 offers the strategy mirror (plan.md open item 10). The stored setting is a
 * three-way mode; this resolves it to a yes/no for the signed-in leader, so the browser never has to
 * know that `repeat_only` exists.
 *
 * **`no-store` is required, not hygiene.** Since open item 10 was decided the answer varies by user
 * *and changes for one user over time*: under `repeat_only` a leader is `false` throughout their
 * first audit and `true` from their second onwards. A cached `false` would suppress the mirror in
 * precisely the case that mode exists to serve, and the leader would never know it was missing.
 */

import { withAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { readReclaimUiConfig } from '@/lib/app/programme/config';

export const GET = withAuth(async (_request, session) => {
  return successResponse(await readReclaimUiConfig(session.user.id), undefined, {
    headers: { 'Cache-Control': 'private, no-store' },
  });
});
