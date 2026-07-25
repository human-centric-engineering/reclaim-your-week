/**
 * Shared calendar persistence helpers (F5). One home for the rounding, the `saveAnswer` wrapper, and
 * the per-bucket read/write — so the totals stay consistent and I4's "inferred, no event detail" note
 * is stamped in one place.
 *
 * **Why write all nine buckets, always.** A sparse write (only the buckets present in a new upload or
 * a correction) would leave a previously-populated bucket's slot at its stale value, so the persisted
 * total and the composite (which reads every `reclaim_calendar_hours__*`) would silently disagree.
 * `writeAllBucketHours` writes 0 for any bucket not in the map, so a re-upload or a cleared field can
 * never resurrect an old figure.
 */

import { getSlotHeads } from '@/lib/framework/data-slots';
import { saveAnswer, type SaveAnswerInput } from '@/lib/app/programme/slots/write';
import { RECLAIM_BUCKETS } from '@/lib/app/programme/content';
import { bucketToken } from '@/lib/app/programme/calendar/categorise';

/** JSON value form `saveAnswer` stores. Centralised so callers pass plain data without their own cast. */
type SlotValueJson = SaveAnswerInput['valueJson'];

/** The nine canonical bucket tokens (I7) — the fixed set every per-bucket write covers. */
export const BUCKET_TOKENS = RECLAIM_BUCKETS.map((b) => bucketToken(b.slug));

/** Round to one decimal place — hours are approximate; false precision reads as a machine, not a mirror. */
export const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * Persist one calendar-derived answer through the single write path (I3), stamped as inferred (I4).
 * Accepts `unknown` for `valueJson` and narrows it here, so the three callers pass plain data (numbers,
 * booleans, small records) without each repeating the `Prisma.InputJsonValue` cast.
 */
export function writeCalendarAnswer(
  userId: string,
  runId: string,
  slotSlug: string,
  value: string,
  valueJson?: unknown,
  sourceType: SaveAnswerInput['sourceType'] = 'inferred',
  reasoningNote = 'Inferred from the uploaded calendar; no event detail stored (I4).'
): ReturnType<typeof saveAnswer> {
  return saveAnswer({
    userId,
    runId,
    slotSlug,
    value,
    valueJson: valueJson as SlotValueJson,
    sourceType,
    reasoningNote,
  });
}

/**
 * Write **all nine** per-bucket hour slots under `prefix` (0 for any bucket absent from `hoursByToken`),
 * and return the total. This is what makes a re-upload or a cleared correction overwrite stale values
 * rather than leave them behind.
 */
export async function writeAllBucketHours(
  userId: string,
  runId: string,
  prefix: string,
  hoursByToken: Record<string, number>,
  sourceType: SaveAnswerInput['sourceType']
): Promise<number> {
  let total = 0;
  for (const token of BUCKET_TOKENS) {
    const hours = round1(hoursByToken[token] ?? 0);
    await writeCalendarAnswer(userId, runId, `${prefix}${token}`, String(hours), hours, sourceType);
    total += hours;
  }
  return round1(total);
}

/** Read a set of number slots (token-suffixed) into a token→hours map. Absent/non-numeric are skipped. */
export async function readHourSlots(
  userId: string,
  prefix: string
): Promise<Record<string, number>> {
  const slugs = BUCKET_TOKENS.map((t) => `${prefix}${t}`);
  const heads = await getSlotHeads(userId, { slotSlugs: slugs });
  const out: Record<string, number> = {};
  for (const head of heads) {
    const token = head.slotSlug.slice(prefix.length);
    const n = Number(head.value);
    if (Number.isFinite(n)) out[token] = n;
  }
  return out;
}
