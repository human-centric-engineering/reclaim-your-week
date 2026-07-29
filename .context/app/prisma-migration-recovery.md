# Recovering after `prisma migrate dev` has dropped the unmodelled objects

**Prevention lives upstream, in
[`.context/database/prisma-unmodelled-objects.md`](../database/prisma-unmodelled-objects.md).** Read
that first: it explains which objects Prisma cannot represent, and why every migration touching these
tables is authored with `--create-only`. This page is the other half — what to do once the drops have
already been applied, which that document does not cover and which this app has now needed twice.

It lives here rather than beside the prevention guidance because `.context/database/` is Sunrise's,
and the golden rule is that this leaf extends through the seams rather than editing the tiers below
(see [`../../CLAUDE.md`](../../CLAUDE.md)). The ask to fold it upstream, where it belongs, is recorded
in [`daybreak-asks.md`](./daybreak-asks.md).

## What the failure looks like

Running plain `prisma migrate dev` against this schema emits ~25 `DropForeignKey` + 4 `DropIndex`
statements and then **fails** on
`ALTER TABLE "ai_knowledge_chunk" ALTER COLUMN "searchVector" DROP DEFAULT` (`42601` — it is a
generated column).

The failure is not a rollback. Postgres applied every statement before it, so the foreign keys and
indexes are gone and the migration is recorded as failed.

`npm run db:drift-check` is what tells you the extent — it fails loudly with one line per lost object.

## The recovery, in order

1. **Clear the failed state** so migrations can run again:
   `npx prisma migrate resolve --rolled-back <migration_name>`
2. **Replay the lost DDL out of the migration history.** Every dropped object was created by an
   earlier migration, so its exact definition is already in the tree — nothing needs to be
   reinvented, and no new migration is needed. Collect the `ADD CONSTRAINT` / `CREATE INDEX`
   statements for the names the generated SQL dropped (they are listed in the failed migration file,
   which is the record of what to restore) and apply them in one transaction with
   `psql -v ON_ERROR_STOP=1 -1 -f`. The statements span several lines, so extract them to the
   terminating `;` rather than line-by-line.
3. **Verify with `npm run db:drift-check`** — all probes must pass. It checks the `ON DELETE` rule on
   each foreign key as well as its existence, so it catches a constraint restored with the wrong
   cascade.
4. **Rewrite the migration by hand** to contain only the statements you meant, then
   `npx prisma migrate deploy`.

## Do not reach for `prisma migrate reset`

It is the reflex, it is destructive, and step 2 is both safe and complete: the objects are recoverable
from the tree because they were created there.
