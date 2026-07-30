-- Reclaim Your Week — F19: the preview-account registry.
--
-- One new table, nothing existing changes shape. Hand-written for the reason every leaf migration is:
-- the `user` FKs carry no Prisma `@relation` (they are plain scalars, so `migrate dev` computes a
-- desired state WITHOUT them and would emit DROPs). Both FKs below are registered as drift probes in
-- `lib/app/leaf-db-drift.ts`, which is what makes CI the reviewer of their ON DELETE policy.

CREATE TABLE "app_reclaim_preview_account" (
  "id"              TEXT NOT NULL,
  "userId"          TEXT NOT NULL,
  "label"           TEXT NOT NULL,
  "createdByUserId" TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "app_reclaim_preview_account_pkey" PRIMARY KEY ("id")
);

-- One row per account. The row is the whole fact, so a second one would say nothing new and would
-- only pad the id set every exclusion query reads.
CREATE UNIQUE INDEX "app_reclaim_preview_account_userId_key"
  ON "app_reclaim_preview_account"("userId");

-- Read when listing the accounts one operator made.
CREATE INDEX "app_reclaim_preview_account_createdByUserId_idx"
  ON "app_reclaim_preview_account"("createdByUserId");

-- The test account itself: personal data → CASCADE. It also keeps the registry honest — erasing the
-- account takes its row, so the exclusion list can never name a user id that no longer exists, and
-- a recycled id could never inherit someone else's preview flag.
ALTER TABLE "app_reclaim_preview_account"
  ADD CONSTRAINT "app_reclaim_preview_account_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE;

-- The operator: retained record → SET NULL, matching `app_reclaim_invite_link_createdByUserId_fkey`.
-- An admin account is erasable too, and erasing her must de-attribute the row rather than delete a
-- test account that is still in use.
ALTER TABLE "app_reclaim_preview_account"
  ADD CONSTRAINT "app_reclaim_preview_account_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "user"("id") ON DELETE SET NULL;
