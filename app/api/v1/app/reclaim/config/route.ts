/**
 * Reclaim — the coach-editable UI config toggles (F7).
 *
 * GET /api/v1/app/reclaim/config   → { phase2CoachingSignal, strategyMirror }
 *
 * The two open-item toggles the phase UIs read to decide whether to render the Phase 2 coaching signal
 * and the strategy mirror (plan.md open items 10 & 11) — default off until Rashmir rules.
 */

import { withAuth } from '@/lib/auth/guards';
import { successResponse } from '@/lib/api/responses';
import { readReclaimUiConfig } from '@/lib/app/programme/config';

export const GET = withAuth(async () => {
  return successResponse(await readReclaimUiConfig());
});
