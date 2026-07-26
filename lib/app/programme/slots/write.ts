/**
 * `saveAnswer()` — the single write-path to slots (F4 t-2, I3).
 *
 * **The only place in the whole app that calls `appendSlotValue`.** Every route, component, and
 * capability that persists an audit answer goes through here — no direct `appendSlotValue` calls
 * anywhere else (`tests/unit/invariants/write-path.test.ts`, in `leaf:checks`, greps for exactly
 * that). Routing through one function is what makes two guarantees hold by construction rather than
 * by discipline:
 *
 *   - **Masking (I5).** Every write passes through `slotMaskingPolicy` keyed on the slot's declared
 *     sensitivity + dataType. It is a no-op for `standard`/`sensitive` — which is every `reclaim_*`
 *     slot today (nothing is `special_category`, I5) — but a *later* reclassification of a slug to
 *     `special_category` then redacts automatically, with no caller left to update. A direct
 *     `appendSlotValue` call would bypass it.
 *   - **Run scoping (F1).** Every write stamps `provenance.runId` with the run's journey `contextKey`,
 *     so a repeat audit appends a fresh version under a new run instead of overwriting run 1's
 *     picture, and `getSlotHistory` can group a slug's versions by run (F9). The run id is
 *     server-owned — never an LLM-supplied arg (I6); callers pass the run they created (F4 t-3).
 *
 * Sensitivity + dataType are read from the module's own `reclaimSlotDefinitions` (the code source of
 * truth, already synced to `framework_slot_definition`), so masking needs no DB read.
 */

import { appendSlotValue, type AppendSlotValueInput } from '@/lib/framework/data-slots';
import { slotMaskingPolicy } from '@/lib/framework/data-slots/capabilities/masking';
import {
  SLOT_DATA_TYPE,
  SLOT_SENSITIVITY,
  SLOT_SOURCE_TYPE,
  type SlotSourceType,
} from '@/lib/framework/data-slots/vocabulary';
import { RECLAIM_MODULE_SLUG } from '@/lib/app/programme/identity';
import { reclaimSlotDefinitions } from '@/lib/app/programme/slots';

/** Slug → its declared sensitivity + dataType, for the masking lookup. Built once at module load. */
const DEFINITION_BY_SLUG = new Map(reclaimSlotDefinitions.map((d) => [d.slug, d]));

export interface SaveAnswerInput {
  userId: string;
  /** The run's journey `contextKey` — stamped as `provenance.runId` (server-owned, never an LLM arg). */
  runId: string;
  /** Must be a registered `reclaim_*` definition; masking keys on its sensitivity/dataType. */
  slotSlug: string;
  /** Plain-language reading — canonical for conversation. */
  value: string;
  /** Optional typed form per the definition's dataType. Omitted ⇒ the column stays NULL. */
  valueJson?: AppendSlotValueInput['valueJson'];
  /** 1–10. Defaults to 10 — a direct answer from the leader is a certain reading. */
  confidence?: number;
  /** How the reading was made. Defaults to `direct` (the leader stated it). */
  sourceType?: SlotSourceType;
  /** One sentence: how this reading was made. */
  reasoningNote?: string;
  /** Links the reading back to the surface conversation archive (a join, not new storage). */
  conversationId?: string;
  /** The map node the reading was captured at, for provenance. */
  nodeKey?: string;
}

/**
 * Persist one audit answer as a new slot-value version. Not async itself — the masking is a pure
 * transform and the only await is `appendSlotValue`, whose promise is returned directly.
 */
export function saveAnswer(input: SaveAnswerInput): ReturnType<typeof appendSlotValue> {
  const definition = DEFINITION_BY_SLUG.get(input.slotSlug);
  if (definition === undefined) {
    throw new Error(
      `saveAnswer: "${input.slotSlug}" is not a registered reclaim slot definition — refusing to write an unknown slug.`
    );
  }

  const sensitivity = definition.sensitivity ?? SLOT_SENSITIVITY.standard;
  const dataType = definition.dataType ?? SLOT_DATA_TYPE.text;

  // Route through the masking policy unconditionally (I5): a no-op today, the guard tomorrow.
  const stored = slotMaskingPolicy(sensitivity, dataType, {
    value: input.value,
    valueJson: input.valueJson ?? null,
  });

  return appendSlotValue({
    userId: input.userId,
    slotSlug: input.slotSlug,
    value: stored.value,
    valueJson: stored.valueJson ?? undefined,
    confidence: input.confidence ?? 10,
    sourceType: input.sourceType ?? SLOT_SOURCE_TYPE.direct,
    reasoningNote: input.reasoningNote ?? 'Captured from the reclaim audit.',
    provenance: {
      runId: input.runId,
      moduleSlug: RECLAIM_MODULE_SLUG,
      conversationId: input.conversationId,
      nodeKey: input.nodeKey,
    },
  });
}

/**
 * Whether an error is a unique-constraint violation, recognised by shape rather than by class.
 *
 * `lib/app/**` may not import Prisma at runtime — the extension surface stays storage-agnostic — so
 * an `instanceof PrismaClientKnownRequestError` check is not available here. Reading the `code`
 * property off an unknown error is the storage-agnostic equivalent, and P2002 is a stable published
 * identifier rather than an internal detail.
 */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'P2002'
  );
}

/**
 * `saveAnswer`, retrying once on a concurrent-append collision.
 *
 * `appendSlotValue` computes the next version by reading the current head and inserting
 * `head.version + 1`; two writers racing on one slug both compute the same number and the loser
 * violates `@@unique([userId, slotSlug, version])` (P2002). The engine deliberately does not retry —
 * its own note says a caller expecting concurrent same-slug writes should catch and re-run — and
 * until now this app had only one writer per slug at a time, so `saveAnswer` did not need to.
 *
 * Conversational capture ends that. The coach can record a slug in the same moment the leader saves
 * the form panel in hybrid mode, or a second tab is open, and the loser surfaced as a 500 in the
 * middle of an audit. The re-run reads the now-committed head and takes the next version, so the
 * later write lands as a normal new version rather than failing.
 *
 * One retry only. A second collision on the same slug means sustained contention on a single
 * leader's single answer, which is not a race worth papering over, so it propagates.
 */
export async function saveAnswerWithRetry(
  input: SaveAnswerInput
): ReturnType<typeof appendSlotValue> {
  try {
    return await saveAnswer(input);
  } catch (err) {
    if (isUniqueViolation(err)) return saveAnswer(input);
    throw err;
  }
}
