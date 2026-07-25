-- Reclaim Your Week — F8 `ryw-access` (t-1).
--
-- Additive only: three new columns, three indexes, one unique constraint, one FK. F4 t-1 front-loaded
-- these tables for their cascades and left the columns beyond core identity to "the owning feature"
-- (see the header of `prisma/schema/app-reclaim.prisma`) — F8 is that feature for invite/grant/consent.
--
-- Hand-written rather than generated: the leaf's `user` FKs carry no Prisma `@relation` (they are plain
-- scalars, so `migrate dev` computes a desired state WITHOUT them and would emit DROPs). Every object
-- added here is registered as a drift probe in `lib/app/leaf-db-drift.ts`, which is what makes CI the
-- reviewer of the `ON DELETE` policy.

-- Referral attribution (F8 t-3). The invite record is RETAINED and only *references* the inviter, so
-- SET NULL — same policy as `redeemedByUserId`, for the same reason.
ALTER TABLE "app_reclaim_invite" ADD COLUMN "invitedByUserId" TEXT;

-- Rashmir withdraws an unredeemed invite. The row survives (audit); the gate refuses it.
ALTER TABLE "app_reclaim_invite" ADD COLUMN "revokedAt" TIMESTAMP(3);

-- Which invite minted a grant (provenance only — one-way, no FK: the invite is retained on erasure
-- and the grant is not, so a cascade in either direction would be wrong).
ALTER TABLE "app_reclaim_grant" ADD COLUMN "sourceInviteId" TEXT;

CREATE INDEX "app_reclaim_invite_invitedByUserId_idx" ON "app_reclaim_invite"("invitedByUserId");
CREATE INDEX "app_reclaim_invite_email_idx" ON "app_reclaim_invite"("email");
CREATE INDEX "app_reclaim_grant_sourceInviteId_idx" ON "app_reclaim_grant"("sourceInviteId");

-- One acceptance per user per policy version, so a double-submit updates instead of writing a second
-- consent row. Postgres treats NULLs as distinct, so rows de-attributed by erasure never collide.
CREATE UNIQUE INDEX "app_reclaim_consent_userId_policyVersion_key"
  ON "app_reclaim_consent"("userId", "policyVersion");

ALTER TABLE "app_reclaim_invite"
  ADD CONSTRAINT "app_reclaim_invite_invitedByUserId_fkey"
  FOREIGN KEY ("invitedByUserId") REFERENCES "user"("id") ON DELETE SET NULL;
