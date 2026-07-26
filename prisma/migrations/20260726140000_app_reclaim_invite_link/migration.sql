-- Reclaim Your Week — F11 group invite links.
--
-- One new table plus one column on `app_reclaim_invite`. Additive: nothing existing changes shape,
-- and `viaLinkId` is nullable, so every invite issued before this migration reads correctly as
-- "typed by hand".
--
-- Hand-written rather than generated, for the reason the F8 migration gives: the leaf's `user` FKs
-- carry no Prisma `@relation` (they are plain scalars, so `migrate dev` computes a desired state
-- WITHOUT them and would emit DROPs). The FK added here is registered as a drift probe in
-- `lib/app/leaf-db-drift.ts`, which is what makes CI the reviewer of its ON DELETE policy.

-- The link itself. `maxClaims` and `expiresAt` are NOT NULL with no default: a link is required to
-- be bounded, and a default would quietly make an unbounded one representable.
CREATE TABLE "app_reclaim_invite_link" (
  "id"              TEXT NOT NULL,
  "token"           TEXT NOT NULL,
  "label"           TEXT NOT NULL,
  "tier"            TEXT NOT NULL DEFAULT 'standard',
  "maxClaims"       INTEGER NOT NULL,
  "claimCount"      INTEGER NOT NULL DEFAULT 0,
  "expiresAt"       TIMESTAMP(3) NOT NULL,
  "revokedAt"       TIMESTAMP(3),
  "createdByUserId" TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "app_reclaim_invite_link_pkey" PRIMARY KEY ("id")
);

-- The token is how a claim resolves the link, on every scan. Unique because it is the identity.
CREATE UNIQUE INDEX "app_reclaim_invite_link_token_key"
  ON "app_reclaim_invite_link"("token");

CREATE INDEX "app_reclaim_invite_link_createdByUserId_idx"
  ON "app_reclaim_invite_link"("createdByUserId");

-- Retained config → SET NULL. The link (and the invitations claimed through it) must outlive the
-- account that minted it; erasing Rashmir's admin account should de-attribute the link, not delete
-- the record of who was invited.
ALTER TABLE "app_reclaim_invite_link"
  ADD CONSTRAINT "app_reclaim_invite_link_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "user"("id") ON DELETE SET NULL;

-- Which link an invite was claimed through. No FK, matching `app_reclaim_grant.sourceInviteId`: the
-- reference is one-way provenance between two rows with different retention lifecycles.
ALTER TABLE "app_reclaim_invite" ADD COLUMN "viaLinkId" TEXT;

-- Indexed because the claim path queries it on every submission (to recognise a repeat claim from
-- the same address), not only for the admin table's "Via" column.
CREATE INDEX "app_reclaim_invite_viaLinkId_idx" ON "app_reclaim_invite"("viaLinkId");
