/**
 * The preview-account list an operator manages test accounts from (F19).
 *
 * **Deliberately separate from `lib/app/programme/preview/accounts.ts`, and this split is the point.**
 * That module is the predicate — it reads the registry table and nothing else, which is what makes it
 * safe to import from `nudges/tick.ts`, a job with no `withAdminAuth` anywhere near it. This module
 * joins `user` and `app_reclaim_audit_run` to say who each test account is and what state it is in.
 * That is a genuine cross-user read, so it lives here, under `admin/`, and is declared in
 * `CROSS_USER_MODULES` in `tests/unit/invariants/admin-support.test.ts` — which then holds every
 * importer of it to being a `withAdminAuth` route.
 *
 * One enriched read, no per-row fetches (repo rule).
 */

import { prisma } from '@/lib/db/client';
import { phaseNumber } from '@/lib/app/programme/runs/phases';
import {
  currentPhaseByRun,
  phaseLabelForKey,
  supportViewer,
} from '@/lib/app/programme/admin/clients';

export interface PreviewAccountRow {
  userId: string;
  /** Null when the account has been erased but the row has not yet been read again. */
  name: string | null;
  email: string;
  label: string;
  createdAt: string;
  /** Who made it, or null once that admin's own account has been erased. */
  createdByName: string | null;
  /** `none` until somebody fast-forwards it, then what the audit actually is. */
  state: 'none' | 'in_progress' | 'complete' | 'abandoned';
  /** The most recent run, for a link straight to it. */
  latestRunId: string | null;
  /**
   * Where that run is sitting, and its 0–6 number. Null for an account with no audit at all, and for
   * one whose audit is over — a finished run is not "at" a phase, it is done.
   *
   * Read rather than remembered, for the reason the state is: this is the answer to "how was this set
   * up", and it stays the right answer after somebody signs in as the account and carries on by hand.
   */
  phaseKey: string | null;
  phaseLabel: string | null;
  phaseNumber: number | null;
}

/**
 * Every test account, newest first, with the state of its most recent audit and where that audit is.
 *
 * The state is read from the run rather than remembered on the registry row, because the registry
 * records a decision an operator made and the run records what the product did. Storing the second on
 * the first would create a copy that goes stale the moment somebody signs in as the account and
 * carries on by hand, which is exactly the thing these accounts exist to let them do.
 *
 * `adminUserId` is here because the phase read is a journey read, and the framework's cross-user
 * widening is an explicit input rather than a role lookup — see `supportViewer` in `clients.ts`. The
 * route hands over the authenticated admin's own id, so the override is attributable to a person.
 */
export async function listPreviewAccounts(adminUserId: string): Promise<PreviewAccountRow[]> {
  const rows = await prisma.reclaimPreviewAccount.findMany({ orderBy: { createdAt: 'desc' } });
  if (rows.length === 0) return [];

  const userIds = rows.map((r) => r.userId);
  const creatorIds = [
    ...new Set(rows.map((r) => r.createdByUserId).filter((id): id is string => id !== null)),
  ];

  const [users, creators, runs] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true },
    }),
    creatorIds.length === 0
      ? []
      : prisma.user.findMany({
          where: { id: { in: creatorIds } },
          select: { id: true, name: true },
        }),
    prisma.reclaimAuditRun.findMany({
      where: { userId: { in: userIds } },
      orderBy: { startedAt: 'desc' },
      select: { id: true, userId: true, status: true },
    }),
  ]);

  const userById = new Map(users.map((u) => [u.id, u]));
  const creatorName = new Map(creators.map((u) => [u.id, u.name]));
  // Newest-first already, so the first run seen per user is the latest.
  const latestRun = new Map<string, { id: string; status: string }>();
  for (const run of runs) {
    if (!latestRun.has(run.userId)) latestRun.set(run.userId, { id: run.id, status: run.status });
  }

  // Two batched queries for the whole list, in-progress runs only — a finished audit is not sitting
  // at a phase, and asking for one would widen the journey read for an answer nothing renders.
  const phaseByRun = await currentPhaseByRun(
    supportViewer(adminUserId),
    [...latestRun.values()].filter((run) => run.status === 'in_progress').map((run) => run.id)
  );

  return rows.flatMap((row) => {
    const user = userById.get(row.userId);
    // The registry row cascades with the account, so a missing user here is not expected. Dropping it
    // rather than rendering "unknown test account" keeps the list to things an operator can act on.
    if (user === undefined) return [];

    const run = latestRun.get(row.userId);
    const phaseKey = run === undefined ? undefined : phaseByRun.get(run.id);
    return [
      {
        userId: row.userId,
        name: user.name,
        email: user.email,
        label: row.label,
        createdAt: row.createdAt.toISOString(),
        createdByName:
          row.createdByUserId === null ? null : (creatorName.get(row.createdByUserId) ?? null),
        state: run === undefined ? ('none' as const) : (run.status as PreviewAccountRow['state']),
        latestRunId: run?.id ?? null,
        phaseKey: phaseKey ?? null,
        phaseLabel: phaseLabelForKey(phaseKey),
        phaseNumber: phaseKey === undefined ? null : phaseNumber(phaseKey),
      } satisfies PreviewAccountRow,
    ];
  });
}
