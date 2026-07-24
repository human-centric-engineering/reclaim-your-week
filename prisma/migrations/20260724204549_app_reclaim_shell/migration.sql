-- Reclaim Your Week leaf schema (F4 t-1): the eight app_reclaim_* tables.
--
-- NOTE (the `migrate dev` footgun — .context/database/prisma-unmodelled-objects.md):
-- `prisma migrate dev --create-only` also emitted a block of `DropForeignKey` / `DropIndex`
-- statements for the framework's HAND-WRITTEN FKs (framework_user_journey_userId_fkey,
-- framework_slot_value_userId_fkey, …) and its unmodelled indexes (the HNSW embedding indexes,
-- the ai_knowledge_chunk tsvector GIN index) plus an `ALTER … DROP DEFAULT` on that tsvector
-- column. Those objects are Prisma-UNMODELLED (created by raw SQL in earlier migrations, drift-
-- probed), so Prisma — which computes desired state from a schema that can't represent them —
-- reads them as drift and tries to drop them. **All of those DROP statements were deleted by hand.**
-- Applying them would break framework cascades and vector search. This migration adds only new
-- objects.

-- CreateTable
CREATE TABLE "app_reclaim_audit_run" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "quarter" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_reclaim_audit_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_reclaim_consent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "policyVersion" TEXT NOT NULL,
    "marketingOptIn" BOOLEAN NOT NULL DEFAULT false,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_reclaim_consent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_reclaim_grant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tier" TEXT NOT NULL DEFAULT 'free',
    "auditsGranted" INTEGER NOT NULL DEFAULT 1,
    "auditsUsed" INTEGER NOT NULL DEFAULT 0,
    "windowStartsAt" TIMESTAMP(3),
    "mustStartBy" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_reclaim_grant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_reclaim_invite" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "tier" TEXT NOT NULL DEFAULT 'standard',
    "redeemedByUserId" TEXT,
    "redeemedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_reclaim_invite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_reclaim_bucket_label" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bucketSlug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_reclaim_bucket_label_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_reclaim_share" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "auditRunId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_reclaim_share_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_reclaim_report_share" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "auditRunId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_reclaim_report_share_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_reclaim_feedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "auditRunId" TEXT,
    "text" TEXT NOT NULL,
    "quoteConsent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_reclaim_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "app_reclaim_audit_run_userId_idx" ON "app_reclaim_audit_run"("userId");

-- CreateIndex
CREATE INDEX "app_reclaim_consent_userId_idx" ON "app_reclaim_consent"("userId");

-- CreateIndex
CREATE INDEX "app_reclaim_grant_userId_idx" ON "app_reclaim_grant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "app_reclaim_invite_token_key" ON "app_reclaim_invite"("token");

-- CreateIndex
CREATE INDEX "app_reclaim_invite_redeemedByUserId_idx" ON "app_reclaim_invite"("redeemedByUserId");

-- CreateIndex
CREATE INDEX "app_reclaim_bucket_label_userId_idx" ON "app_reclaim_bucket_label"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "app_reclaim_bucket_label_userId_bucketSlug_key" ON "app_reclaim_bucket_label"("userId", "bucketSlug");

-- CreateIndex
CREATE UNIQUE INDEX "app_reclaim_share_token_key" ON "app_reclaim_share"("token");

-- CreateIndex
CREATE INDEX "app_reclaim_share_userId_idx" ON "app_reclaim_share"("userId");

-- CreateIndex
CREATE INDEX "app_reclaim_report_share_userId_idx" ON "app_reclaim_report_share"("userId");

-- CreateIndex
CREATE INDEX "app_reclaim_feedback_userId_idx" ON "app_reclaim_feedback"("userId");

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Hand-written objects Prisma can't model from this schema (no `@relation`; a partial unique index).
-- Each is registered as a drift probe in lib/app/leaf-db-drift.ts so a future `migrate dev` that
-- tries to drop it is caught by `npm run db:drift-check` (CI + /pre-pr), and so the ON DELETE policy
-- — which lives only here — is reviewed. The core `User` table is mapped to lowercase "user".

-- One active run per user: partial unique index (Prisma cannot express a WHERE-filtered unique).
CREATE UNIQUE INDEX "app_reclaim_audit_run_active_user_key"
  ON "app_reclaim_audit_run" ("userId")
  WHERE "status" = 'in_progress';

-- FK constraints + ON DELETE policy. CASCADE = personal data (erased with the user);
-- SET NULL = retained config/audit (the row survives, de-attributed).

-- Personal data → CASCADE
ALTER TABLE "app_reclaim_audit_run"
  ADD CONSTRAINT "app_reclaim_audit_run_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE;

ALTER TABLE "app_reclaim_grant"
  ADD CONSTRAINT "app_reclaim_grant_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE;

ALTER TABLE "app_reclaim_bucket_label"
  ADD CONSTRAINT "app_reclaim_bucket_label_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE;

ALTER TABLE "app_reclaim_share"
  ADD CONSTRAINT "app_reclaim_share_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE;

ALTER TABLE "app_reclaim_report_share"
  ADD CONSTRAINT "app_reclaim_report_share_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE;

ALTER TABLE "app_reclaim_feedback"
  ADD CONSTRAINT "app_reclaim_feedback_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE;

-- Retained config/audit → SET NULL (nullable FK column)
ALTER TABLE "app_reclaim_consent"
  ADD CONSTRAINT "app_reclaim_consent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL;

ALTER TABLE "app_reclaim_invite"
  ADD CONSTRAINT "app_reclaim_invite_redeemedByUserId_fkey"
  FOREIGN KEY ("redeemedByUserId") REFERENCES "user"("id") ON DELETE SET NULL;
