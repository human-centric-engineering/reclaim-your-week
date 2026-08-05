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
  /**
   * The report agent's reading (`lib/app/programme/report/reading.ts`).
   *
   * Nullable, and every view renders nothing for `null` — the agent may not have run, may have been
   * refused, or may have failed, and the report was complete without it for the whole of v1.
   * `.nullable().default(null)` rather than `.optional()`: an older cached response that predates the
   * field parses as absent, and absent must read as "no reading" rather than failing the whole
   * response and blanking a leader's screen. The same reasoning applies one level down, to `chapters`
   * and `closing`, which a reading stored before the arc existed does not carry.
   */
  report: z
    .object({
      chapters: z
        .array(
          z.object({
            section: z.enum([
              'why_now',
              'the_week',
              'energy',
              'the_week_you_want',
              'the_distance',
              'what_you_chose',
              'what_you_take',
            ]),
            paragraphs: z.array(z.string()),
          })
        )
        .default([]),
      gaps: z.array(z.object({ token: z.string(), observation: z.string() })),
      pathway: z.array(
        z.object({
          horizon: z.enum(['now', 'next', 'later']),
          step: z.string(),
          difference: z.string(),
        })
      ),
      closing: z.string().nullable().default(null),
    })
    .nullable()
    .default(null),
  /** When the audit happened, ISO. Formatted by each surface; see `AuditSummary.auditedOn`. */
  auditedOn: z.string(),
  /** Where to take this next, carried on the artifact rather than left on the screen. */
  contactEmail: z.string(),
  footnote: z.string(),
});

export type AuditSummary = z.infer<typeof auditSummarySchema>;
export type ChartData = z.infer<typeof chartDataSchema>;
