/**
 * Client-side shapes for the calendar branch (F5 t-3), with Zod schemas so the UI validates the upload
 * and confirm responses instead of casting `unknown` (mirrors the server types in
 * `lib/app/programme/calendar/**`). Same boundary-validation stance as the programme shell.
 */

import { z } from 'zod';

export const reviewBucketSchema = z.object({
  bucketSlug: z.string(),
  token: z.string(),
  title: z.string(),
  hours: z.number(),
});

export const ambiguousItemSchema = z.object({
  bucketSlug: z.string(),
  reasoning: z.string(),
  hours: z.number(),
});

export const metricsSchema = z.object({
  eventsPerDay: z.number(),
  backToBack: z.number(),
  longestBlockMinutes: z.number(),
});

export const bucketRefSchema = z.object({ token: z.string(), title: z.string() });

export const calendarReviewSchema = z.object({
  buckets: z.array(reviewBucketSchema),
  allBuckets: z.array(bucketRefSchema),
  totalHours: z.number(),
  selfReportedWeeklyHours: z.number().nullable(),
  unaccountedHours: z.number().nullable(),
  calendarMeetsOrExceeds: z.boolean(),
  metrics: metricsSchema,
  ambiguous: z.array(ambiguousItemSchema),
  calendarNames: z.array(z.string()),
  truncated: z.boolean(),
  excludedPersonalCount: z.number(),
});

export const varianceEntrySchema = z.object({
  token: z.string(),
  estimate: z.number(),
  composite: z.number(),
  delta: z.number(),
});

export const compositeResultSchema = z.object({
  compositeHours: z.record(z.string(), z.number()),
  variance: z.array(varianceEntrySchema),
});

/**
 * The export walkthroughs the upload screen shows, from `GET /api/v1/app/reclaim/config`.
 *
 * Declared here rather than imported from the server config so the client carries no dependency on
 * a module that reaches for Prisma, and validated like every other boundary read.
 */
export const calendarExportsSchema = z.object({
  calendarExportSteps: z
    .array(z.object({ service: z.string(), steps: z.array(z.string()) }))
    .default([]),
});

export type CalendarExportView = z.infer<
  typeof calendarExportsSchema
>['calendarExportSteps'][number];

export type CalendarReview = z.infer<typeof calendarReviewSchema>;
export type ReviewBucket = z.infer<typeof reviewBucketSchema>;
export type AmbiguousItem = z.infer<typeof ambiguousItemSchema>;
export type CompositeResult = z.infer<typeof compositeResultSchema>;

/** Unwrap the `{ success, data }` envelope and validate `data` against `schema`, or throw. */
export function parseEnvelope<T>(json: unknown, schema: z.ZodType<T>): T {
  const data = json !== null && typeof json === 'object' && 'data' in json ? json.data : null;
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new Error('Unexpected response from the server.');
  return parsed.data;
}

const errorEnvelopeSchema = z.object({ error: z.object({ message: z.string() }) });

/** Read the `{ error: { message } }` envelope's message without casting external data, or `null`. */
export function errorMessageFrom(json: unknown): string | null {
  const parsed = errorEnvelopeSchema.safeParse(json);
  return parsed.success ? parsed.data.error.message : null;
}
