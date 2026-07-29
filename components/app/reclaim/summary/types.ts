/**
 * Client-side shapes for the Phase 6 summary artifact (F7 t-4), with a Zod schema so the in-app and
 * public views validate the response instead of casting `unknown` (mirrors `lib/app/programme/summary.ts`).
 */

import { z } from 'zod';

const chartBucketSchema = z.object({
  token: z.string(),
  slug: z.string(),
  title: z.string(),
  hours: z.number(),
  percent: z.number(),
  lowPercent: z.number().nullable(),
  highPercent: z.number().nullable(),
  status: z.enum(['under', 'in', 'over', 'none']),
});

export const chartDataSchema = z.object({
  source: z.enum(['composite', 'current']),
  buckets: z.array(chartBucketSchema),
  totalHours: z.number(),
  unallocated: z.array(z.string()),
});

export const auditSummarySchema = z.object({
  firstName: z.string().nullable(),
  role: z.string().nullable(),
  orgType: z.string().nullable(),
  period: z.string().nullable(),
  priorities: z.string().nullable(),
  current: chartDataSchema,
  rows: z.array(
    z.object({
      token: z.string(),
      title: z.string(),
      current: z.number(),
      ideal: z.number().nullable(),
    })
  ),
  action: z.object({
    chosen: z.string().nullable(),
    when: z.string().nullable(),
    howKnown: z.string().nullable(),
  }),
  /**
   * §10's key gaps and phased pathway (F14).
   *
   * Nullable, and every view renders nothing for `null` — the analyst may not have run, may have
   * been refused, or may have failed, and the artifact was complete without these two sections for
   * the whole of v1. `.nullable().default(null)` rather than `.optional()`: an older cached response
   * that predates the field parses as absent, and absent must read as "no reading" rather than
   * failing the whole summary and blanking a leader's screen.
   */
  analyst: z
    .object({
      gaps: z.array(z.object({ token: z.string(), observation: z.string() })),
      pathway: z.array(
        z.object({
          horizon: z.enum(['now', 'next', 'later']),
          step: z.string(),
          difference: z.string(),
        })
      ),
    })
    .nullable()
    .default(null),
  footnote: z.string(),
});

export type AuditSummary = z.infer<typeof auditSummarySchema>;
export type ChartData = z.infer<typeof chartDataSchema>;
