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
  footnote: z.string(),
});

export type AuditSummary = z.infer<typeof auditSummarySchema>;
export type ChartData = z.infer<typeof chartDataSchema>;
