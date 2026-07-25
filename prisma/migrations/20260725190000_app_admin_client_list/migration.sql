-- Reclaim Your Week — F10 `ryw-admin` (t-1).
--
-- Additive only: one nullable column and two unique constraints. Hand-written for the same reason
-- every leaf migration is (see `20260725170000_app_reclaim_access`): the leaf's `user` FKs are plain
-- scalars with no Prisma `@relation`, so `migrate dev` computes a desired state without them and
-- would emit DROPs.

-- Which module-surface conversation this run's coaching happened in (plan D2).
--
-- `ai_cost_log` records cost per CONVERSATION and never per run, and the module surface opens one
-- conversation per (user, agent, module) which stays live until the run completes (I15) — so each run
-- has exactly one and nothing wrote it down. Attributing by timestamp overlap instead would be
-- quietly wrong for precisely the run Brief §8 cares about (the tester who spent four hours in one
-- audit, or a run left open for weeks).
--
-- Deliberately NOT a foreign key: the conversation is core's (`ai_conversation`), erased on its own
-- schedule, and a hard reference from a leaf table into an orchestration row would couple two
-- unrelated lifecycles. NULL means "not recorded", never "cost nothing" — the admin surface renders
-- the two distinctly, and every run created before this migration reads NULL.
ALTER TABLE "app_reclaim_audit_run" ADD COLUMN "conversationId" TEXT;

-- One share link and one coach-share per run (plan D8).
--
-- `createShare` (F7 t-4) does findFirst → create on both tables. That was already the fix for an
-- observed duplicate, but a read-then-write on a table with no constraint is a TOCTOU, which
-- `planning-retro.md` §B records as the shape to stop accepting. It stops being cosmetic at F10 t-3,
-- where the inbox COUNTS these rows: a duplicate report-share would double-count a leader who shared
-- once. The constraint is what makes the invariant true in the database; t-3 switches the writes to
-- `upsert` so the guarantee is enforced rather than raced for.
-- Dedupe FIRST. `CREATE UNIQUE INDEX` aborts on a table that already contains duplicates, and the
-- whole reason these constraints exist is that F7's find-then-create raced and **an actual duplicate
-- was observed** before it was patched. Any environment that predates that patch may still hold one,
-- and there the bare CREATE would fail the migration — leaving `conversationId` unapplied too, which
-- every admin route then reads. Keeping the OLDEST row of each pair matters for `app_reclaim_share`
-- specifically: its token may already have been sent to someone, and deleting the row a leader shared
-- would break a live link.
DELETE FROM "app_reclaim_share"
  WHERE "id" NOT IN (
    SELECT DISTINCT ON ("userId", "auditRunId") "id"
    FROM "app_reclaim_share"
    ORDER BY "userId", "auditRunId", "createdAt" ASC, "id" ASC
  );

DELETE FROM "app_reclaim_report_share"
  WHERE "id" NOT IN (
    SELECT DISTINCT ON ("userId", "auditRunId") "id"
    FROM "app_reclaim_report_share"
    ORDER BY "userId", "auditRunId", "createdAt" ASC, "id" ASC
  );

CREATE UNIQUE INDEX "app_reclaim_share_userId_auditRunId_key"
  ON "app_reclaim_share"("userId", "auditRunId");

CREATE UNIQUE INDEX "app_reclaim_report_share_userId_auditRunId_key"
  ON "app_reclaim_report_share"("userId", "auditRunId");
