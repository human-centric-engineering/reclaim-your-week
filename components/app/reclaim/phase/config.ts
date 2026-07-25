'use client';

/**
 * Fetch the coach-editable UI config toggles (F7) — the Phase 2 coaching signal and the strategy
 * mirror (open items 10 & 11, default off). Best-effort: both off on any failure.
 */

import { z } from 'zod';
import { parseEnvelope } from '@/components/app/reclaim/calendar/types';

const uiConfigSchema = z.object({
  phase2CoachingSignal: z.boolean(),
  strategyMirror: z.boolean(),
});

export type UiConfig = z.infer<typeof uiConfigSchema>;

export async function fetchUiConfig(): Promise<UiConfig> {
  try {
    const res = await fetch('/api/v1/app/reclaim/config');
    if (!res.ok) return { phase2CoachingSignal: false, strategyMirror: false };
    return parseEnvelope(await res.json(), uiConfigSchema);
  } catch {
    return { phase2CoachingSignal: false, strategyMirror: false };
  }
}
