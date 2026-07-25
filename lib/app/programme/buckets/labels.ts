/**
 * User bucket relabelling (F6 t-4, Brief §3). A leader may give a bucket their own display label
 * ("within limits") — but the canonical `bucketSlug` is **never** changed (I7), so a relabelled audit
 * still aggregates on the canonical slug by construction. Labels are per-user (carry across audits),
 * stored in `ReclaimBucketLabel` (`@@unique([userId, bucketSlug])`).
 */

import { prisma } from '@/lib/db/client';
import { ValidationError } from '@/lib/api/errors';
import { RECLAIM_BUCKETS, bucketToken } from '@/lib/app/programme/content';

/** The nine canonical bucket slugs — the only keys a label may attach to (I7). */
const CANONICAL_SLUGS = new Set(RECLAIM_BUCKETS.map((b) => b.slug));

/** "Within limits" (Brief §3): a display label caps at this length; relabelling never adds a bucket. */
export const LABEL_MAX_LENGTH = 40;

/** Read a user's bucket labels, keyed by **slot token** (the form the chart/cards use). */
export async function readBucketLabels(userId: string): Promise<Record<string, string>> {
  const rows = await prisma.reclaimBucketLabel.findMany({ where: { userId } });
  const out: Record<string, string> = {};
  for (const row of rows) out[bucketToken(row.bucketSlug)] = row.label;
  return out;
}

/**
 * Set (or clear) a user's label for one canonical bucket. An empty label resets to the default. The
 * canonical `bucketSlug` is validated against the fixed nine and stored unchanged (I7).
 */
export async function setBucketLabel(
  userId: string,
  bucketSlug: string,
  label: string
): Promise<void> {
  if (!CANONICAL_SLUGS.has(bucketSlug)) {
    throw new ValidationError('Unknown bucket', { bucketSlug: ['Not one of the nine areas'] });
  }
  const trimmed = label.trim();
  if (trimmed.length > LABEL_MAX_LENGTH) {
    throw new ValidationError('That label is a little long', {
      label: [`Keep it to ${LABEL_MAX_LENGTH} characters or fewer.`],
    });
  }

  if (trimmed.length === 0) {
    await prisma.reclaimBucketLabel.deleteMany({ where: { userId, bucketSlug } });
    return;
  }

  await prisma.reclaimBucketLabel.upsert({
    where: { userId_bucketSlug: { userId, bucketSlug } },
    create: { userId, bucketSlug, label: trimmed },
    update: { label: trimmed },
  });
}
