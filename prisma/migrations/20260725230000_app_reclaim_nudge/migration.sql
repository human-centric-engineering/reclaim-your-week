-- Reclaim Your Week — F9 `ryw-repeat` (t-3): the quarterly nudge.
--
-- Hand-written for the same reason every leaf migration is: the leaf's `user` FKs are plain scalars
-- with no Prisma `@relation`, so `migrate dev` computes a desired state without them and would emit
-- DROPs. The FK and its ON DELETE are registered as a drift probe in `lib/app/leaf-db-drift.ts`,
-- which is what makes CI the reviewer of the erasure policy.

CREATE TABLE "app_reclaim_nudge" (
  "id"                 TEXT NOT NULL,
  "userId"             TEXT NOT NULL,
  "optedOutAt"         TIMESTAMP(3),
  "lastNudgedForRunId" TEXT,
  "lastNudgedAt"       TIMESTAMP(3),
  "token"              TEXT NOT NULL,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,

  CONSTRAINT "app_reclaim_nudge_pkey" PRIMARY KEY ("id")
);

-- One row per leader: the nudge state is a fact about a person, not an event log.
CREATE UNIQUE INDEX "app_reclaim_nudge_userId_key" ON "app_reclaim_nudge"("userId");

-- The unsubscribe token is looked up on its own, by an unauthenticated route, so it must be unique
-- and indexed. It is 244 bits of randomness — the same shape as the F7 share token.
CREATE UNIQUE INDEX "app_reclaim_nudge_token_key" ON "app_reclaim_nudge"("token");

-- CASCADE, not SET NULL. This is personal programme state — a preference about being emailed — and
-- an erased leader must not leave behind a row that could be matched back to them by token. Contrast
-- `app_reclaim_consent`, which is retained precisely because it is the evidence that processing was
-- lawful; a nudge preference evidences nothing once the person is gone.
ALTER TABLE "app_reclaim_nudge"
  ADD CONSTRAINT "app_reclaim_nudge_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
