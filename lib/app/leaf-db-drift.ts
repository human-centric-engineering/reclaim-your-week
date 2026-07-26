/**
 * Leaf-app database drift-probe registration — Reclaim Your Week (F4 t-1).
 *
 * Registers the Prisma-*unmodelled* Postgres objects the leaf schema adds
 * (`prisma/schema/app-reclaim.prisma`), so `npm run db:drift-check` (CI + `/pre-pr`) probes them and
 * catches a future `migrate dev` that silently drops one — the exact footgun the F4 t-1 migration hit
 * (Prisma computes desired state from a schema with no `@relation` for these FKs and no way to express
 * a partial unique index, so it reads them as drift). Called by `lib/app/db-drift.ts`'s
 * `registerAppDriftProbes()` after the framework probes, per the reserved-seam contract.
 *
 * Two kinds of object:
 *   - the **eight hand-written `user` FKs** — each probed with its `ON DELETE` action, so the GDPR
 *     policy (which lives only in the migration SQL, invisible to the schema-level `onDelete` lint
 *     guard for a plain-scalar FK) is what CI actually reviews. CASCADE = personal data;
 *     SET NULL = retained config/audit (`consent`, `invite`);
 *   - the **partial unique index** enforcing one `in_progress` run per user.
 */

import { registerAppDriftProbe, constraintExists, indexExists } from '@/lib/db/drift-probes';

/** One `app_reclaim_*` → `user` FK: its constraint name, table, and expected ON DELETE action. */
const RECLAIM_USER_FKS: ReadonlyArray<{ table: string; constraint: string; onDelete: string }> = [
  {
    table: 'app_reclaim_audit_run',
    constraint: 'app_reclaim_audit_run_userId_fkey',
    onDelete: 'CASCADE',
  },
  { table: 'app_reclaim_grant', constraint: 'app_reclaim_grant_userId_fkey', onDelete: 'CASCADE' },
  {
    table: 'app_reclaim_bucket_label',
    constraint: 'app_reclaim_bucket_label_userId_fkey',
    onDelete: 'CASCADE',
  },
  { table: 'app_reclaim_share', constraint: 'app_reclaim_share_userId_fkey', onDelete: 'CASCADE' },
  {
    table: 'app_reclaim_report_share',
    constraint: 'app_reclaim_report_share_userId_fkey',
    onDelete: 'CASCADE',
  },
  {
    table: 'app_reclaim_feedback',
    constraint: 'app_reclaim_feedback_userId_fkey',
    onDelete: 'CASCADE',
  },
  // Retained on erasure → SET NULL (the row outlives the user, de-attributed).
  {
    table: 'app_reclaim_consent',
    constraint: 'app_reclaim_consent_userId_fkey',
    onDelete: 'SET NULL',
  },
  {
    table: 'app_reclaim_invite',
    constraint: 'app_reclaim_invite_redeemedByUserId_fkey',
    onDelete: 'SET NULL',
  },
  // F8 t-1: the referrer. Retained like the rest of the invite row — an invite outlives both the
  // person who sent it and the person who redeemed it.
  {
    table: 'app_reclaim_invite',
    constraint: 'app_reclaim_invite_invitedByUserId_fkey',
    onDelete: 'SET NULL',
  },
  // F9 t-3: the nudge preference. CASCADE — a preference about being emailed evidences nothing once
  // the person is gone, and a retained row keyed by an unsubscribe token could be matched back.
  { table: 'app_reclaim_nudge', constraint: 'app_reclaim_nudge_userId_fkey', onDelete: 'CASCADE' },
];

export function registerLeafDriftProbes(): void {
  for (const fk of RECLAIM_USER_FKS) {
    registerAppDriftProbe({
      name: `reclaim: ${fk.constraint} (ON DELETE ${fk.onDelete})`,
      kind: 'FK constraint',
      table: fk.table,
      // `predicateContains` asserts the constraint def carries the ON DELETE action, so a migration
      // that recreated the FK with the wrong policy (a silent GDPR bug) fails the check.
      probe: constraintExists(fk.constraint, `ON DELETE ${fk.onDelete}`),
    });
  }

  registerAppDriftProbe({
    name: 'reclaim: app_reclaim_audit_run_active_user_key (partial unique — one in_progress run)',
    kind: 'partial unique index',
    table: 'app_reclaim_audit_run',
    probe: indexExists('app_reclaim_audit_run_active_user_key'),
  });
}
