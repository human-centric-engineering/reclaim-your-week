/**
 * The coach's run scope — what the server tells a capability about *where* it is running.
 *
 * `CapabilityContext.scope` is a free-form `Record<string, string>` that the chat handler threads
 * verbatim from `ChatRequest.scope` into every dispatch. The route builds it; the model never sees
 * it and cannot influence it. That property is the whole reason the coach can be trusted to write
 * audit answers at all.
 *
 * The framework owns two keys in that map (`moduleSlug`, `nodeKey`, in
 * `lib/framework/shared/scope.ts`) and ignores any others, so the leaf adds a third for the one
 * thing the framework has no concept of: which audit run this conversation belongs to.
 *
 * **Why this matters (I6).** The original lockdown barred the coach from writing any run-carrying
 * slot, for one stated reason: the framework's `fill_slot` selects its run from `contextKey`, an
 * argument the model supplies, so a hallucinated value could write one leader's run into another's.
 * Taking the run id from the server-issued scope removes that hazard by construction rather than by
 * prohibition. There is no argument for the model to get wrong.
 */

/** The scope key carrying the audit run id. Leaf-owned; the framework ignores unknown keys. */
export const RECLAIM_RUN_SCOPE_KEY = 'reclaimRunId';

/** What the coach capabilities need to know about their dispatch, read out of the scope carrier. */
export interface ReclaimCoachScope {
  /** The run whose answers this turn may write, from `ReclaimAuditRun.id`. */
  runId: string;
  /** The phase the leader is on, so a write can be provenance-stamped with where it happened. */
  nodeKey?: string;
}

/**
 * Read the run scope out of a dispatch context. Returns `null` when there is no run id, which is the
 * only safe reading: a capability that cannot tell which run it is in must refuse rather than guess.
 */
export function readCoachScope(
  scope: Record<string, string> | undefined
): ReclaimCoachScope | null {
  const runId = scope?.[RECLAIM_RUN_SCOPE_KEY];
  if (runId === undefined || runId.length === 0) return null;
  const nodeKey = scope?.nodeKey;
  return nodeKey !== undefined && nodeKey.length > 0 ? { runId, nodeKey } : { runId };
}
