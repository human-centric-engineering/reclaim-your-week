-- Reclaim Your Week — F18 t-2: one message a coach wrote to a leader who stopped.
--
-- One new table, nothing existing changes shape. Hand-written for the reason every leaf migration is:
-- the `user` FKs carry no Prisma `@relation` (they are plain scalars, so `migrate dev` computes a
-- desired state WITHOUT them and would emit DROPs). Both FKs below are registered as drift probes in
-- `lib/app/leaf-db-drift.ts`, which is what makes CI the reviewer of their ON DELETE policy.

CREATE TABLE "app_reclaim_reach_out" (
  "id"           TEXT NOT NULL,
  "userId"       TEXT NOT NULL,
  "auditRunId"   TEXT,
  "sentByUserId" TEXT,
  "subject"      TEXT NOT NULL,
  "body"         TEXT NOT NULL,
  "status"       TEXT NOT NULL DEFAULT 'sent',
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "app_reclaim_reach_out_pkey" PRIMARY KEY ("id")
);

-- Read per leader on their record, and per run to answer "has anyone already written about this
-- audit" — the question that stops a second operator sending a second message.
CREATE INDEX "app_reclaim_reach_out_userId_idx" ON "app_reclaim_reach_out"("userId");
CREATE INDEX "app_reclaim_reach_out_auditRunId_idx" ON "app_reclaim_reach_out"("auditRunId");

-- The leader: personal data → CASCADE. Their email address and words written about their week die
-- with the account, and `smoke:reclaim-erasure` asserts it.
ALTER TABLE "app_reclaim_reach_out"
  ADD CONSTRAINT "app_reclaim_reach_out_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE;

-- The sender: retained record → SET NULL. An admin account is erasable too, and erasing the coach
-- must de-attribute her outbox rather than delete the record that a leader was contacted.
ALTER TABLE "app_reclaim_reach_out"
  ADD CONSTRAINT "app_reclaim_reach_out_sentByUserId_fkey"
  FOREIGN KEY ("sentByUserId") REFERENCES "user"("id") ON DELETE SET NULL;

-- No FK on `auditRunId`, matching `app_reclaim_nudge.lastNudgedForRunId`: one-way provenance between
-- rows with different retention lifecycles. The run cascades on the same user anyway.
