'use client';

/**
 * Client actions for the programme admin surfaces (F10).
 *
 * The admin sibling of `components/app/reclaim/access/actions.ts`, and it exists for the same reason:
 * every screen here needs the same three moves (call a route, read the `{ data }` envelope, surface
 * the server's message on failure), and hand-rolling that per component is how a leaf drifts. F8's
 * gate round consolidated four hand-rolled parsers into one module for exactly this; starting the
 * admin surfaces with the shared shape is cheaper than converging on it later.
 *
 * Every schema here is a Zod parse, never a cast — the repo's "never `as` on external data" rule
 * applies to our own API responses too.
 */

import { z } from 'zod';
import { parseEnvelope, errorMessageFrom } from '@/components/app/reclaim/calendar/types';

const clientRowSchema = z.object({
  userId: z.string(),
  name: z.string().nullable(),
  email: z.string(),
  joinedAt: z.string(),
  tier: z.string().nullable(),
  auditsGranted: z.number().nullable(),
  auditsUsed: z.number().nullable(),
  windowEndsAt: z.string().nullable(),
  policyVersion: z.string().nullable(),
  marketingOptIn: z.boolean(),
  referredByName: z.string().nullable(),
  inviteTier: z.string().nullable(),
  status: z.enum(['never_started', 'in_progress', 'stalled', 'complete']),
  currentPhaseLabel: z.string().nullable(),
  completedRuns: z.number(),
  lastActivityAt: z.string().nullable(),
  chatCostUsd: z.number().nullable(),
  qualification: z.record(z.string(), z.string()),
});

const clientListSchema = z.object({
  clients: z.array(clientRowSchema),
  abandonedAfterDays: z.number(),
});

const clientDetailSchema = z.object({
  client: clientRowSchema,
  context: z.array(z.object({ slug: z.string(), label: z.string(), value: z.string() })),
  runs: z.array(
    z.object({
      id: z.string(),
      status: z.string(),
      quarter: z.string().nullable(),
      startedAt: z.string(),
      completedAt: z.string().nullable(),
      currentPhaseLabel: z.string().nullable(),
      chatCostUsd: z.number().nullable(),
    })
  ),
  journeyHref: z.string(),
});

const measuresSchema = z.object({
  returnRate: z.object({
    completedAtLeastOne: z.number(),
    completedTwoOrMore: z.number(),
    rate: z.number().nullable(),
  }),
  referral: z.object({
    sent: z.number(),
    accepted: z.number(),
    completed: z.number(),
    acceptanceRate: z.number().nullable(),
    completionRate: z.number().nullable(),
  }),
  totals: z.object({ clients: z.number(), runsCompleted: z.number() }),
});

const sharedResultSchema = z.object({
  userId: z.string(),
  name: z.string().nullable(),
  email: z.string(),
  auditRunId: z.string(),
  sharedAt: z.string(),
  quarter: z.string().nullable(),
  feedback: z.object({ text: z.string(), quoteConsent: z.boolean() }).nullable(),
});

const aggregateSchema = z.object({
  cohort: z.number(),
  minimumCohort: z.number(),
  suppressed: z.boolean(),
  buckets: z.array(
    z.object({
      bucketSlug: z.string(),
      title: z.string(),
      leaders: z.number().nullable(),
      medianHours: z.number().nullable(),
      suppressed: z.boolean(),
    })
  ),
  mostOftenEmpty: z.array(
    z.object({ bucketSlug: z.string(), title: z.string(), leaders: z.number() })
  ),
});

const inboxSchema = z.object({
  shared: z.array(sharedResultSchema),
  aggregate: aggregateSchema,
});

const contentFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  value: z.string(),
  matchesSource: z.boolean(),
});

const contentBucketSchema = z.object({
  bucketSlug: z.string(),
  title: contentFieldSchema,
  description: contentFieldSchema,
  benchmarkNote: contentFieldSchema,
});

const contentViewSchema = z.object({
  buckets: z.array(contentBucketSchema),
  bands: z.array(z.object({ id: z.string(), label: contentFieldSchema })),
  prose: z.array(contentFieldSchema),
  rules: z.array(contentFieldSchema.extend({ min: z.number(), max: z.number() })),
  editedCount: z.number(),
  /** The config version this view was built from — echoed back on save (optimistic concurrency). */
  baseVersion: z.number().nullable(),
});

export type ClientRow = z.infer<typeof clientRowSchema>;
export type ClientListView = z.infer<typeof clientListSchema>;
export type ClientDetailView = z.infer<typeof clientDetailSchema>;
export type MeasuresView = z.infer<typeof measuresSchema>;
export type InboxView = z.infer<typeof inboxSchema>;
export type ContentView = z.infer<typeof contentViewSchema>;
export type ContentField = z.infer<typeof contentFieldSchema>;

/** Read the server's message from a failed response, or a fallback. Never throws. */
async function failureMessage(res: Response, fallback: string): Promise<string> {
  const json: unknown = await res.json().catch(() => null);
  return errorMessageFrom(json) ?? fallback;
}

async function getJson<T>(url: string, schema: z.ZodType<T>, fallback: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(await failureMessage(res, fallback));
  return parseEnvelope(await res.json(), schema);
}

/** Every leader with a programme footprint, enriched by the server in one request. */
export function listClients(): Promise<ClientListView> {
  return getJson(
    '/api/v1/app/reclaim/admin/clients',
    clientListSchema,
    'We could not load the client list.'
  );
}

/** One leader's record, including the sensitive context the list withholds. */
export function getClient(userId: string): Promise<ClientDetailView> {
  return getJson(
    `/api/v1/app/reclaim/admin/clients/${encodeURIComponent(userId)}`,
    clientDetailSchema,
    'We could not load that record.'
  );
}

/** The two success measures (F10 t-2). */
export function readMeasures(): Promise<MeasuresView> {
  return getJson(
    '/api/v1/app/reclaim/admin/measures',
    measuresSchema,
    'We could not load the measures.'
  );
}

/** Shared results + the anonymised aggregate (F10 t-3). */
export function readInbox(): Promise<InboxView> {
  return getJson(
    '/api/v1/app/reclaim/admin/shared',
    inboxSchema,
    'We could not load the shared results.'
  );
}

/** The editable content, each field marked against the source document (F10 t-4). */
export function readContent(): Promise<ContentView> {
  return getJson(
    '/api/v1/app/reclaim/admin/content',
    contentViewSchema,
    'We could not load the content.'
  );
}

/**
 * Save edited content. Posts through the leaf route, which forwards to the **framework's** module
 * config endpoint — so validation, the `ModuleVersion` snapshot and the admin audit entry all stay
 * where they already work (plan D6).
 */
export async function saveContent(input: {
  values: Record<string, string>;
  changeSummary: string;
  /** The version the edit was composed against, so a concurrent save is refused rather than lost. */
  baseVersion: number | null;
}): Promise<void> {
  const res = await fetch('/api/v1/app/reclaim/admin/content', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await failureMessage(res, 'Those changes could not be saved.'));
}
