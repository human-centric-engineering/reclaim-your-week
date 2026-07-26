-- Reclaim Your Week — record what happened to each invitation email.
--
-- Additive and nullable: every invite issued before this column reads as NULL, which the admin table
-- renders as "not recorded" rather than inventing a status for it. No backfill, because we genuinely
-- do not know what happened to those sends.
--
-- Why a column at all: the invite row is the entitlement and the email is only its delivery, so a
-- failed send deliberately does not fail the invite. The cost of that (correct) design is a ledger
-- full of people who are properly invited and never heard, with the failure visible only in the logs.

-- No index. `listInvites` reads the whole table for the admin screen and filters in memory, so an
-- index would earn nothing today — and a partial index cannot be expressed in the Prisma schema, so
-- it would read as drift and need a probe to defend it. Add one with the query that needs it.
ALTER TABLE "app_reclaim_invite" ADD COLUMN "emailStatus" TEXT;
