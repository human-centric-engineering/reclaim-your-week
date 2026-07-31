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
  // F18 t-2. Defaulted so a response cached from a build predating the column still parses, and
  // reads as "nobody has written" rather than failing the whole list.
  lastReachedOutAt: z.string().nullable().default(null),
  qualification: z.record(z.string(), z.string()),
  // F19. Defaulted `false` for the same reason as the field above, and because the safe reading of a
  // missing flag is "this is a real client" — a test account wrongly shown as real is a badge an
  // operator can double-check, while a client wrongly badged as a test account invites deletion.
  isPreview: z.boolean().default(false),
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
  timeline: z.array(
    z.object({
      period: z.string(),
      completions: z.number(),
      returns: z.number(),
      referralsSent: z.number(),
    })
  ),
});

const sharedResultSchema = z.object({
  userId: z.string(),
  name: z.string().nullable(),
  email: z.string(),
  auditRunId: z.string(),
  sharedAt: z.string(),
  quarter: z.string().nullable(),
  feedback: z.object({ text: z.string(), quoteConsent: z.boolean() }).nullable(),
  // F17. Defaulted so a response cached from a build predating the column still parses.
  transcriptConsent: z.boolean().default(false),
  // F19. Defaulted `false` — see the note on `clientRowSchema.isPreview`.
  isPreview: z.boolean().default(false),
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
  /**
   * Who wrote the field originally, which decides what "edited" claims. `rashmir` compares against a
   * source document; `authored` compares against the shipped wording, because this app wrote it and
   * there is no source document to differ from.
   */
  sourceKind: z.enum(['rashmir', 'authored']),
});

const contentSignpostSchema = z.object({
  phaseKey: z.string(),
  involves: contentFieldSchema,
  duration: contentFieldSchema,
  opening: z.array(contentFieldSchema),
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
  signposts: z.array(contentSignpostSchema),
  rules: z.array(contentFieldSchema.extend({ min: z.number(), max: z.number() })),
  editedCount: z.number(),
  /** The config version this view was built from — echoed back on save (optimistic concurrency). */
  baseVersion: z.number().nullable(),
});

/** One field's wording either side of the version that moved it. */
const contentFieldChangeSchema = z.object({
  label: z.string(),
  from: z.string().nullable(),
  to: z.string(),
});

/** One saved version of the content, as the editor's history lists it. Version 0 is the original. */
const contentVersionSchema = z.object({
  version: z.number(),
  isBaseline: z.boolean(),
  changeSummary: z.string().nullable(),
  savedAt: z.string().nullable(),
  savedByName: z.string().nullable(),
  isCurrent: z.boolean(),
  changes: z.array(contentFieldChangeSchema),
  moreChanged: z.number(),
  changedElsewhere: z.boolean(),
  unreadable: z.boolean(),
});

const contentHistorySchema = z.object({ versions: z.array(contentVersionSchema) });

const reachOutRecordSchema = z.object({
  id: z.string(),
  auditRunId: z.string().nullable(),
  subject: z.string(),
  body: z.string(),
  status: z.string(),
  sentAt: z.string(),
  sentByName: z.string().nullable(),
});

const reachOutViewSchema = z.object({
  draft: z.object({
    subject: z.string(),
    body: z.string(),
    auditRunId: z.string().nullable(),
    phaseLabel: z.string().nullable(),
    alreadyWrittenForThisRun: z.boolean(),
    optedOutOfNudges: z.boolean(),
  }),
  sent: z.array(reachOutRecordSchema),
});

/** F19: one test account, as the preview screen lists it. */
const previewAccountSchema = z.object({
  userId: z.string(),
  name: z.string().nullable(),
  email: z.string(),
  label: z.string(),
  createdAt: z.string(),
  createdByName: z.string().nullable(),
  state: z.enum(['none', 'in_progress', 'complete', 'abandoned']),
  latestRunId: z.string().nullable(),
});

const previewListSchema = z.object({ accounts: z.array(previewAccountSchema) });

/**
 * What creating one returns. `password` is the only field in this file that carries a live credential,
 * and it exists for exactly one render: the caller shows it once and never stores it.
 */
const previewCreatedSchema = z.object({
  account: z.object({ userId: z.string(), email: z.string(), label: z.string() }),
  password: z.string(),
  signInUrl: z.string(),
  message: z.string(),
});

const previewMessageSchema = z.object({ message: z.string() });

const reachOutSentSchema = z.object({
  record: reachOutRecordSchema,
  delivered: z.boolean(),
});

export type ClientRow = z.infer<typeof clientRowSchema>;
export type ClientListView = z.infer<typeof clientListSchema>;
export type ClientDetailView = z.infer<typeof clientDetailSchema>;
export type MeasuresView = z.infer<typeof measuresSchema>;
export type InboxView = z.infer<typeof inboxSchema>;
export type ContentView = z.infer<typeof contentViewSchema>;
export type ContentField = z.infer<typeof contentFieldSchema>;
export type ContentVersion = z.infer<typeof contentVersionSchema>;
export type ContentFieldChange = z.infer<typeof contentFieldChangeSchema>;
export type ReachOutView = z.infer<typeof reachOutViewSchema>;
export type ReachOutRecord = z.infer<typeof reachOutRecordSchema>;
export type PreviewAccountRow = z.infer<typeof previewAccountSchema>;
export type PreviewCreated = z.infer<typeof previewCreatedSchema>;

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

/**
 * The opening draft for a message to one leader, plus what has already been sent.
 *
 * The draft is built on the server so the phase it names is the client list's own reading of where
 * they stopped rather than a second computation of it.
 */
export function readReachOut(userId: string): Promise<ReachOutView> {
  return getJson(
    `/api/v1/app/reclaim/admin/clients/${encodeURIComponent(userId)}/reach-out`,
    reachOutViewSchema,
    'We could not prepare a message for that leader.'
  );
}

/** Send it. The text posted is whatever the operator actually typed — nothing is templated here. */
export async function sendReachOut(
  userId: string,
  input: { subject: string; body: string; auditRunId: string | null }
): Promise<z.infer<typeof reachOutSentSchema>> {
  const res = await fetch(
    `/api/v1/app/reclaim/admin/clients/${encodeURIComponent(userId)}/reach-out`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }
  );
  if (!res.ok) throw new Error(await failureMessage(res, 'That message could not be sent.'));
  return parseEnvelope(await res.json(), reachOutSentSchema);
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

/** Every saved version of the content, newest first. */
export function listContentVersions(): Promise<ContentVersion[]> {
  return getJson(
    '/api/v1/app/reclaim/admin/content/versions',
    contentHistorySchema,
    'We could not load the version history.'
  ).then((v) => v.versions);
}

/**
 * Put a previous version's wording back. Returns the version number it was saved as — a restore
 * writes forward rather than rewinding, so the answer is always a new number.
 */
export async function restoreContentVersion(version: number): Promise<number> {
  const res = await fetch(
    `/api/v1/app/reclaim/admin/content/versions/${encodeURIComponent(String(version))}/restore`,
    { method: 'POST' }
  );
  if (!res.ok) throw new Error(await failureMessage(res, 'That version could not be restored.'));
  return parseEnvelope(await res.json(), z.object({ version: z.number() })).version;
}

/** Every test account (F19), enriched by the server in one request. */
export function listPreviewAccounts(): Promise<PreviewAccountRow[]> {
  return getJson(
    '/api/v1/app/reclaim/admin/preview',
    previewListSchema,
    'We could not load the test accounts.'
  ).then((v) => v.accounts);
}

/**
 * Create a test account, optionally already driven into a state.
 *
 * Returns the generated password. It is not stored anywhere, so the caller has one chance to show it
 * and must say so — this is the only response in this file that carries a live credential.
 */
export async function createPreviewAccount(input: {
  label: string;
  email?: string;
  name?: string;
  state: 'fresh' | 'mid-audit' | 'completed';
}): Promise<PreviewCreated> {
  const res = await fetch('/api/v1/app/reclaim/admin/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok)
    throw new Error(await failureMessage(res, 'That test account could not be created.'));
  return parseEnvelope(await res.json(), previewCreatedSchema);
}

/**
 * Mark an account that already exists as a test account.
 *
 * The other half of walking the real front door: an account created through `/accept-invite` cannot be
 * registered at the moment it appears, because account creation belongs to the platform. This is how
 * one stops counting as a client afterwards.
 */
export async function adoptPreviewAccount(input: {
  email: string;
  label: string;
}): Promise<string> {
  const res = await fetch('/api/v1/app/reclaim/admin/preview/adopt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await failureMessage(res, 'That account could not be marked.'));
  return parseEnvelope(await res.json(), previewMessageSchema).message;
}

/** Drive a test account into a state. Returns the server's own sentence, refusal included. */
export async function fastForwardPreviewAccount(
  userId: string,
  input: { to: 'mid-audit' | 'completed'; toPhase?: string }
): Promise<string> {
  const res = await fetch(
    `/api/v1/app/reclaim/admin/preview/${encodeURIComponent(userId)}/fast-forward`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }
  );
  // The engine's refusal is product information, not a generic failure: it says the audit stopped
  // allowing a step it used to allow. Passed through verbatim.
  if (!res.ok) throw new Error(await failureMessage(res, 'That account could not be advanced.'));
  return parseEnvelope(await res.json(), previewMessageSchema).message;
}

/** Erase a test account and everything it accumulated. */
export async function removePreviewAccount(userId: string): Promise<string> {
  const res = await fetch(`/api/v1/app/reclaim/admin/preview/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  });
  if (!res.ok)
    throw new Error(await failureMessage(res, 'That test account could not be removed.'));
  return parseEnvelope(await res.json(), previewMessageSchema).message;
}
