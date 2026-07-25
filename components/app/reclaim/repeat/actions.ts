'use client';

/**
 * Client actions for the repeat-audit surfaces (F9): trends, the comparative open, the shortcut.
 *
 * Consumes the shared `parseEnvelope` / `errorMessageFrom` like every other actions module here —
 * the F4 t-4 lesson ([[planning-retro]] §B) is that a hand-rolled wire parser drifts and drops things
 * silently, so the leaf keeps one shape.
 */

import { z } from 'zod';
import { parseEnvelope, errorMessageFrom } from '@/components/app/reclaim/calendar/types';

const trendRunSchema = z.object({
  runId: z.string(),
  quarter: z.string().nullable(),
  completedAt: z.string(),
});

const trendViewSchema = z.object({
  runs: z.array(trendRunSchema),
  buckets: z.array(
    z.object({
      bucketSlug: z.string(),
      title: z.string(),
      hours: z.array(z.number().nullable()),
    })
  ),
  enoughData: z.boolean(),
});

const comparisonSchema = z.object({
  previous: trendRunSchema.nullable(),
  buckets: z.array(
    z.object({
      bucketSlug: z.string(),
      title: z.string(),
      previousHours: z.number().nullable(),
      currentHours: z.number().nullable(),
      differenceHours: z.number().nullable(),
    })
  ),
});

const shortcutSchema = z.object({
  previous: trendRunSchema.nullable(),
  confirmLine: z.string().nullable(),
  answers: z.record(z.string(), z.string()),
});

export type TrendView = z.infer<typeof trendViewSchema>;
export type ComparisonView = z.infer<typeof comparisonSchema>;
export type ShortcutView = z.infer<typeof shortcutSchema>;

async function failureMessage(res: Response, fallback: string): Promise<string> {
  const json: unknown = await res.json().catch(() => null);
  return errorMessageFrom(json) ?? fallback;
}

async function getJson<T>(url: string, schema: z.ZodType<T>, fallback: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(await failureMessage(res, fallback));
  return parseEnvelope(await res.json(), schema);
}

/** Per-bucket hours across the leader's completed audits, oldest first. */
export function readTrends(): Promise<TrendView> {
  return getJson('/api/v1/app/reclaim/trends', trendViewSchema, 'We could not load your history.');
}

/** The previous audit beside this one. `previous: null` on a first audit. */
export function readComparison(runId: string): Promise<ComparisonView> {
  return getJson(
    `/api/v1/app/reclaim/runs/${encodeURIComponent(runId)}/compare`,
    comparisonSchema,
    'We could not load your last audit.'
  );
}

/** The recent-audit shortcut, or `previous: null` when Phase 0 should ask in full. */
export function readShortcut(): Promise<ShortcutView> {
  return getJson(
    '/api/v1/app/reclaim/shortcut',
    shortcutSchema,
    'We could not load your last audit.'
  );
}
