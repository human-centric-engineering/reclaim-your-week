/**
 * Lifecycle events for the follow-up sequence (F8 t-4) — the seam, not the sequence.
 *
 * Brief §2 describes a follow-up sequence "for those who register for the tool". No sequence ships in
 * v1; what ships is **one place** an ESP gets wired in later, so that wiring is a change to this file
 * rather than an archaeology expedition through the run service.
 *
 * **Why this is not `emitHookEvent`.** Sunrise already has event-hook machinery — webhook delivery,
 * filters, retries, a delivery audit trail — and the plan said to use it. It cannot be used:
 * `HOOK_EVENT_TYPES` (`lib/orchestration/hooks/types.ts`) is a closed `as const` union and
 * `emitHookEvent(eventType: HookEventType, …)` rejects `reclaim.audit_completed` at compile time. The
 * storage is string-keyed (`Hook.eventType` is `VarChar(100)`) and so is the dispatcher, so the gap is
 * purely the type — filed as **sunrise#465**. Daybreak hit the same wall and runs its own local
 * mechanism for map-publish events (`lib/framework/facilitation/map/publish-hooks.ts`, decision C);
 * this is the third such island, which is the argument the issue makes.
 *
 * When sunrise#465 lands, delete this module and emit through `emitHookEvent` instead — the call sites
 * stay where they are.
 */

import { logger } from '@/lib/logging';

/** The two moments Brief §2's follow-up sequence would key on. */
export type ReclaimAccessEvent = 'reclaim.access_granted' | 'reclaim.audit_completed';

/**
 * Record a lifecycle event. Today: a structured log line, which is genuinely useful (it is how the
 * first cohort's funnel gets read before any ESP exists). Tomorrow: the single call site an integration
 * replaces. Never throws — a follow-up-sequence concern must not fail a leader's audit.
 */
export function emitReclaimAccessEvent(
  event: ReclaimAccessEvent,
  data: Record<string, unknown>
): void {
  try {
    logger.info(`Reclaim lifecycle: ${event}`, { event, ...data });
  } catch {
    // Deliberately swallowed: nothing about telemetry is worth failing a run for.
  }
}
