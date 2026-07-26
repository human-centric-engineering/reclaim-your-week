'use client';

/**
 * Fetch the coach-editable UI config the phase screens read (F7) — whether Phase 4 offers the
 * strategy mirror (open item 10).
 *
 * Best-effort: off on any failure. The mirror is an optional reflective question that gates nothing,
 * so a config fetch that fails should cost the leader a prompt, never their progress.
 */

import { z } from 'zod';
import { parseEnvelope } from '@/components/app/reclaim/calendar/types';

const uiConfigSchema = z.object({
  strategyMirror: z.boolean(),
});

export type UiConfig = z.infer<typeof uiConfigSchema>;

export async function fetchUiConfig(): Promise<UiConfig> {
  try {
    const res = await fetch('/api/v1/app/reclaim/config');
    if (!res.ok) return { strategyMirror: false };
    return parseEnvelope(await res.json(), uiConfigSchema);
  } catch {
    return { strategyMirror: false };
  }
}
