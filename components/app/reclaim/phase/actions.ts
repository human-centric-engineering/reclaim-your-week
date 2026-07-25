'use client';

/**
 * Client actions shared by the phase panels (F6) — batch-save answers, read the run's answers, and
 * advance a phase. Thin `fetch` wrappers over the run routes; every write still lands through the
 * server's single write path (I3) and the reflection gate stays server-owned (I9).
 */

import { z } from 'zod';
import { parseEnvelope, errorMessageFrom } from '@/components/app/reclaim/calendar/types';
import { auditSummarySchema, type AuditSummary } from '@/components/app/reclaim/summary/types';

export interface AnswerInput {
  slotSlug: string;
  value: string;
  valueJson?: unknown;
}

const answersEnvelope = z.object({
  answers: z.record(z.string(), z.object({ value: z.string(), valueJson: z.unknown() })),
});
const labelsEnvelope = z.object({ labels: z.record(z.string(), z.string()) });

export type RunAnswers = z.infer<typeof answersEnvelope>['answers'];

/** Save many answers for the run. Throws with the server message on failure. */
export async function saveBatch(runId: string, answers: AnswerInput[]): Promise<void> {
  const res = await fetch(`/api/v1/app/reclaim/runs/${runId}/answers/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers }),
  });
  if (!res.ok) {
    const json: unknown = await res.json().catch(() => null);
    throw new Error(errorMessageFrom(json) ?? 'We could not save your answers just now.');
  }
}

/** Read the run's answers for the given slugs (all if omitted), keyed by slug. */
export async function readAnswers(runId: string, slugs?: string[]): Promise<RunAnswers> {
  const query = slugs && slugs.length > 0 ? `?slugs=${encodeURIComponent(slugs.join(','))}` : '';
  const res = await fetch(`/api/v1/app/reclaim/runs/${runId}/answers${query}`);
  const json: unknown = await res.json();
  if (!res.ok) throw new Error(errorMessageFrom(json) ?? 'We could not load your answers.');
  return parseEnvelope(json, answersEnvelope).answers;
}

/** Read the user's bucket display labels, keyed by slot token. Best-effort: `{}` on any failure. */
export async function readLabels(): Promise<Record<string, string>> {
  try {
    const res = await fetch('/api/v1/app/reclaim/labels');
    if (!res.ok) return {};
    return parseEnvelope(await res.json(), labelsEnvelope).labels;
  } catch {
    return {};
  }
}

/** Set (or clear) a bucket label. Fire-and-forget from the UI; the server enforces the cap + slug. */
export async function saveLabel(bucketSlug: string, label: string): Promise<void> {
  await fetch('/api/v1/app/reclaim/labels', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bucketSlug, label }),
  }).catch(() => undefined);
}

export interface AdvanceResult {
  ok: boolean;
  /** Set when the server refused because a reflection is still required (I9). */
  reflectionRequired?: boolean;
  message?: string;
}

/** Fetch the leader's own summary for a run (Phase 6). Throws on failure. */
export async function fetchSummary(runId: string): Promise<AuditSummary> {
  const res = await fetch(`/api/v1/app/reclaim/runs/${runId}/summary`);
  const json: unknown = await res.json();
  if (!res.ok) throw new Error(errorMessageFrom(json) ?? 'We could not load your summary.');
  return parseEnvelope(json, auditSummarySchema);
}

export interface ShareInput {
  publicLink?: boolean;
  withCoach?: boolean;
  ageBand?: string;
  takeaway?: string;
  quotable?: boolean;
}

/** Apply the leader's Phase 6 share choices; returns the public token (or null). */
export async function shareSummary(runId: string, input: ShareInput): Promise<string | null> {
  const res = await fetch(`/api/v1/app/reclaim/runs/${runId}/share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json: unknown = await res.json();
  if (!res.ok)
    throw new Error(errorMessageFrom(json) ?? 'We could not save your choices just now.');
  const parsed = parseEnvelope(json, z.object({ token: z.string().nullable() }));
  return parsed.token;
}

/** Complete the run (Phase 6 finish) — closes the conversation (I15) and consumes the grant (I14). */
export async function completeAudit(runId: string): Promise<void> {
  const res = await fetch(`/api/v1/app/reclaim/runs/${runId}/complete`, { method: 'POST' });
  if (!res.ok) {
    const json: unknown = await res.json().catch(() => null);
    throw new Error(errorMessageFrom(json) ?? 'We could not finish your audit just now.');
  }
}

/** Advance from `fromPhase` to the next. Surfaces the server's 422 REFLECTION_REQUIRED distinctly. */
export async function advancePhase(runId: string, fromPhase: string): Promise<AdvanceResult> {
  const res = await fetch(`/api/v1/app/reclaim/runs/${runId}/transition`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fromPhase }),
  });
  if (res.ok) return { ok: true };
  const json: unknown = await res.json().catch(() => null);
  const code = z.object({ error: z.object({ code: z.string() }) }).safeParse(json);
  if (res.status === 422 && code.success && code.data.error.code === 'REFLECTION_REQUIRED') {
    return { ok: false, reflectionRequired: true, message: errorMessageFrom(json) ?? undefined };
  }
  return { ok: false, message: errorMessageFrom(json) ?? 'We could not move on just now.' };
}
