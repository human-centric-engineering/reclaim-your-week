/**
 * Preview accounts (F19) — the one place that answers "is this account a test account?"
 *
 * **Why a module and not an inline `where`.** `lib/auth/account.ts` exists for this exact reason, and
 * its header records what happened without it: the same predicate written out at each call site drifted,
 * and the admin screens miscounted (PR #279). The difference here is that its `humanWhere` can be a
 * static Prisma fragment because `accountType` is a **column on `User`**. There is no column for this —
 * `prisma/schema/auth.prisma` is Sunrise's under I10 — so the fact lives in a leaf table and the
 * predicate is an **async id-set read**. Same rule, different shape.
 *
 * **This module reads `app_reclaim_preview_account` and nothing else.** No `user`, no slots, no runs.
 * That restraint is load-bearing rather than tidiness: `nudges/tick.ts` imports it, and the tick is not
 * an admin route. Anything that read across leaders from here would make a cross-user read reachable
 * without `withAdminAuth`, which is what `tests/unit/invariants/admin-support.test.ts` exists to stop.
 * The enriched operator list lives separately, in `lib/app/programme/admin/preview-list.ts`, and is
 * declared there as the cross-user read it is.
 *
 * Who excludes and who badges is decided per call site and pinned by
 * `tests/unit/invariants/preview-exclusion.test.ts`. The short version: anything that **counts,
 * publishes or emails** excludes; the operator's own screens show them, badged, because she cannot
 * clean up accounts she cannot see.
 */

import { prisma } from '@/lib/db/client';
import { logger } from '@/lib/logging';
import { isUniqueViolation } from '@/lib/app/programme/access/grants';

/** Every preview account's user id. Empty on an install that has never made one. */
export async function previewUserIds(): Promise<string[]> {
  const rows = await prisma.reclaimPreviewAccount.findMany({ select: { userId: true } });
  return rows.map((r) => r.userId);
}

/**
 * The same ids as a set, for badging a list the caller is already assembling.
 *
 * A separate export rather than `new Set(await previewUserIds())` at each call site, so a screen that
 * badges and a query that excludes are visibly doing different things with the same fact.
 */
export async function previewUserIdSet(): Promise<Set<string>> {
  return new Set(await previewUserIds());
}

/**
 * A Prisma id filter that excludes these accounts — or `undefined` when there are none.
 *
 * `undefined` rather than `{ notIn: [] }` on purpose. Prisma treats an undefined field as absent, so an
 * install with no preview accounts emits exactly the SQL it emitted before this feature existed. That
 * matters for a filter being added to five hot cohort queries: the no-preview-accounts case is every
 * production install until someone makes one, and it should cost nothing and change nothing.
 */
export function excludeIds(ids: readonly string[]): { notIn: string[] } | undefined {
  return ids.length === 0 ? undefined : { notIn: [...ids] };
}

/**
 * Record an account as a test account. Idempotent on `userId`.
 *
 * Idempotent because the caller that provisions an account may retry after a failure further along, and
 * the second attempt must not be the thing that breaks: an account that is already registered is
 * already in the state this asks for. The unique index is what makes that safe under a race.
 */
export async function registerPreviewAccount(input: {
  userId: string;
  label: string;
  createdByUserId: string;
}): Promise<void> {
  try {
    await prisma.reclaimPreviewAccount.create({
      data: {
        userId: input.userId,
        label: input.label.trim(),
        createdByUserId: input.createdByUserId,
      },
    });
    logger.info('Reclaim: preview account registered', {
      userId: input.userId,
      createdByUserId: input.createdByUserId,
    });
  } catch (error) {
    if (isUniqueViolation(error)) return;
    throw error;
  }
}

/**
 * Is this a test account?
 *
 * The interlock the fabricators call first. Everything that writes a fabricated audit is gated on this,
 * so the fast-forward machinery is structurally incapable of reaching into a real leader's run — a
 * mistyped id fails the check rather than rewriting somebody's week.
 */
export async function isPreviewAccount(userId: string): Promise<boolean> {
  const row = await prisma.reclaimPreviewAccount.findUnique({
    where: { userId },
    select: { id: true },
  });
  return row !== null;
}

/** Drop the registry row without touching the account. Used when an operator adopts, then un-adopts. */
export async function unregisterPreviewAccount(userId: string): Promise<boolean> {
  const { count } = await prisma.reclaimPreviewAccount.deleteMany({ where: { userId } });
  if (count > 0) logger.info('Reclaim: preview account unregistered', { userId });
  return count > 0;
}
