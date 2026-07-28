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

import {
  appendSlotValue,
  type AppendSlotValueInput,
  type SlotValueProvenance,
} from '@/lib/framework/data-slots';
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

/**
 * This app's provenance, which is Daybreak's plus one field of our own.
 *
 * `SlotValueProvenance` is a closed interface owned by the tier below (`lib/framework/data-slots`),
 * and the golden rule is that we extend through the seams rather than editing it. Declaring the wider
 * shape here and passing it as a **variable** is the seam: TypeScript's excess-property check only
 * fires on fresh object literals, so a typed value carrying an extra field is assignable to the
 * narrower parameter, and `appendSlotValue` stores the blob whole. No cast, no framework edit, and
 * nothing to re-resolve on the next upstream merge.
 *
 * The ask to make this unnecessary — a `custom` bag on the framework's own provenance — is filed in
 * [[daybreak-asks]]. Until it lands, the one risk to watch is Daybreak adding a `verbatim` of its own
 * with different semantics, which a merge would surface here rather than silently.
 */
interface ReclaimProvenance extends SlotValueProvenance {
  /** The leader's own sentence, masked exactly as the prose value is. See `SaveAnswerInput.verbatim`. */
  verbatim?: string;
}

export interface SaveAnswerInput {
  userId: string;
  /** The run's journey `contextKey` — stamped as `provenance.runId` (server-owned, never an LLM arg). */
  runId: string;
  /** Must be a registered `reclaim_*` definition; masking keys on its sensitivity/dataType. */
  slotSlug: string;
  /** Plain-language reading — canonical for conversation. May be the coach's rendering of what the
   *  leader said rather than the sentence itself; see `verbatim`. */
  value: string;
  /**
   * The leader's own sentence, quoted exactly, when the caller has it.
   *
   * `value` is documented to the coach as "close to the leader's own words", which makes it a
   * paraphrase — good for a reading, wrong for a quote. Two beats need the real sentence: the Phase 4
   * refer-back, which instructs the coach to return their words "verbatim, do not paraphrase" (I13),
   * and the summary, where a quoted line is the leader's and not the tool's. Storing only the
   * paraphrase left both quoting something nobody said.
   *
   * Stored on `provenance`, not in a column: `SlotValue` is Daybreak-owned
   * (`prisma/schema/framework-data-slots.prisma`) and the golden rule is that we extend through the
   * seams rather than editing the tiers below. `provenance` is a Json blob this leaf already builds,
   * so this needs no migration and no framework change.
   *
   * Omitted, or identical to `value`, and nothing is stored — `presentAnswer` falls back to `value`,
   * which is what every form-path and historic row will do forever.
   */
  verbatim?: string;
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

  // The verbatim goes through the *same* policy, and that is the whole reason it is masked here
  // rather than passed straight into provenance. `slotMaskingPolicy` only knows about `value` and
  // `valueJson`, so a later reclassification of a slug to `special_category` would redact the
  // paraphrase and leave the leader's actual sentence sitting in the provenance blob — a strictly
  // worse leak than the one I5 exists to prevent, hidden behind a rule that looked like it held.
  // Masking it as a prose value of the same slot gives it the same fate, whatever that fate becomes.
  // `dataType` is deliberately not passed through: the verbatim is always prose, even on a `number`
  // slot ("about eight, on a good week"), so it must never qualify for the keep-typed branch.
  const verbatim =
    input.verbatim === undefined || input.verbatim === input.value
      ? undefined
      : slotMaskingPolicy(sensitivity, SLOT_DATA_TYPE.text, {
          value: input.verbatim,
          valueJson: null,
        }).value;

  const provenance: ReclaimProvenance = {
    runId: input.runId,
    moduleSlug: RECLAIM_MODULE_SLUG,
    conversationId: input.conversationId,
    nodeKey: input.nodeKey,
    verbatim,
  };

  return appendSlotValue({
    userId: input.userId,
    slotSlug: input.slotSlug,
    value: stored.value,
    valueJson: stored.valueJson ?? undefined,
    confidence: input.confidence ?? 10,
    sourceType: input.sourceType ?? SLOT_SOURCE_TYPE.direct,
    reasoningNote: input.reasoningNote ?? 'Captured from the reclaim audit.',
    provenance,
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
