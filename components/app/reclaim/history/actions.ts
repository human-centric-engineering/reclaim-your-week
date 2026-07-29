'use client';

/**
 * Client actions for the audit history: the list of a leader's audits, and one of them read back.
 *
 * Consumes the shared `parseEnvelope` / `errorMessageFrom` like every other actions module here, so
 * there is one wire parser rather than a hand-rolled one per surface ([[planning-retro]] §B).
 */

import { z } from 'zod';
import { parseEnvelope, errorMessageFrom } from '@/components/app/reclaim/calendar/types';
import { phaseViewSchema } from '@/components/app/reclaim/types';

/** Dates arrive as ISO strings: `Date` does not survive JSON, and the surface formats them anyway. */
const runListItemSchema = z.object({
  id: z.string(),
  quarter: z.string().nullable(),
  status: z.string(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  // F16. Nullable and defaulted, so a response cached from a build predating the column parses.
  abandonedAt: z.string().nullable().default(null),
  hasConversation: z.boolean(),
  progress: z
    .object({ phaseKey: z.string(), phaseLabel: z.string(), phaseIndex: z.number() })
    .nullable(),
});

const runListSchema = z.object({ runs: z.array(runListItemSchema) });

const runStateSchema = z.object({
  run: z.object({
    id: z.string(),
    quarter: z.string().nullable(),
    status: z.string(),
    startedAt: z.string(),
    completedAt: z.string().nullable(),
    conversationId: z.string().nullable(),
    coachOpenings: z.array(z.string()).default([]),
    phaseMarks: z.record(z.string(), z.string()).default({}),
  }),
  phases: z.array(phaseViewSchema),
  currentPhaseKey: z.string(),
});

export type RunListItem = z.infer<typeof runListItemSchema>;
export type RunState = z.infer<typeof runStateSchema>;

/** The status a finished audit carries. Mirrors `RUN_STATUS.complete` on the server. */
export const RUN_COMPLETE = 'complete';

/**
 * The status the *one* resumable audit carries. Mirrors `RUN_STATUS.inProgress`.
 *
 * **Tested for positively, never as "not complete"** (F16). Until abandoning existed there were only
 * two statuses, so `status !== RUN_COMPLETE` was a correct way to say "still open". It stopped being
 * one the moment a third arrived: an abandoned run is not complete, so the old test would have kept
 * showing it as the audit in progress, offering to resume a run the server now refuses.
 */
export const RUN_IN_PROGRESS = 'in_progress';

/** The status a leader's set-aside audit carries. Mirrors `RUN_STATUS.abandoned`. */
export const RUN_ABANDONED = 'abandoned';

async function getJson<T>(url: string, schema: z.ZodType<T>, fallback: string): Promise<T> {
  const res = await fetch(url);
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new Error(errorMessageFrom(json) ?? fallback);
  return parseEnvelope(json, schema);
}

/** Every audit this leader has run, newest first. */
export async function readRuns(): Promise<RunListItem[]> {
  const { runs } = await getJson(
    '/api/v1/app/reclaim/runs',
    runListSchema,
    'We could not load your audits.'
  );
  return runs;
}

/** One audit, with every phase's status, for reading back. */
export function readRun(runId: string): Promise<RunState> {
  return getJson(
    `/api/v1/app/reclaim/runs/${encodeURIComponent(runId)}`,
    runStateSchema,
    'We could not load that audit.'
  );
}

/** The period a leader gave this audit, else the month it belongs to. */
export function auditPeriod(run: { quarter: string | null; startedAt: string }): string {
  if (run.quarter !== null && run.quarter.trim() !== '') return run.quarter;
  return new Date(run.startedAt).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

/** A full date, for the line that says when something happened. */
export function auditDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Let an open audit go, so a new one can begin (F16 t-1).
 *
 * Nothing is deleted: the run keeps its phases, its transcript and its place in this list. What
 * changes is that it stops being the audit in progress, which is what releases the partial unique
 * index `createRun` refuses on.
 */
export async function abandonRun(runId: string): Promise<void> {
  const res = await fetch(`/api/v1/app/reclaim/runs/${encodeURIComponent(runId)}/abandon`, {
    method: 'POST',
  });
  if (!res.ok) {
    const json: unknown = await res.json().catch(() => null);
    throw new Error(errorMessageFrom(json) ?? 'We could not do that just now.');
  }
}
