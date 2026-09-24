# PostgreSQL / Neon staging connection

Connection preparation only. The Next.js application, default Prisma client, local
commands, and `prisma/migrations/` remain SQLite. These staging commands do not
import transport data or switch the application provider.

## Environment and isolated client

Use the repository root and the pinned Prisma **6.19.3**. The only required variable
is **DATABASE_URL**, exported explicitly in a separate shell. Keep the existing
SQLite `.env` unchanged. Do not use `NEXT_PUBLIC_` for database credentials.

Use the connection string for the intended **staging** database from Neon,
including `sslmode=require` (or `verify-full`). The migration targets `public`;
other `schema` values are rejected. URL-encode special characters in credentials.

`DIRECT_URL` is not required or read here. The supported Neon pooler works with
the pinned Prisma version, including migrations. If a direct connection is needed
for troubleshooting, export that staging connection as `DATABASE_URL` in this
same isolated workflow. Do not copy Prisma 7/8 setup into this Prisma 6 project.
See [Neon's Prisma pooling explanation](https://neon.com/blog/better-postgres-with-prisma-experience).

Open a dedicated Bash subshell, then paste the connection string at the hidden
prompt. This avoids putting the credential in shell history or changing `.env`:

```bash
bash
read -r -s -p 'Neon staging DATABASE_URL: ' DATABASE_URL
export DATABASE_URL
npm run db:postgresql:validate
npm run db:postgresql:generate
npm run db:postgresql:check
```

Generation writes only `node_modules/.prisma/postgresql-staging`; it does not
replace the SQLite client at `@prisma/client` or connect to a database. `check`
then connects using that separate client and checks the server/schema in a
read-only transaction. It works before any application tables exist. Diagnostics
use a one-connection pool, ten-second connection/pool/statement limits and a
thirty-second transaction limit. They do not print the URL, credentials, row data,
or raw Prisma errors. Commands require an exported URL; they do not load `.env`.

## Apply the empty schema — explicit database write

Only after `check` succeeds and the selected target is the intended empty staging
database, run:

```bash
npm run db:postgresql:migrate
npm run db:postgresql:verify
```

The migration command first checks the target read-only. It accepts an empty
`public` schema (no tables/views/sequences/foreign tables), or this exact completed
baseline for a no-op rerun. It refuses occupied, failed, or unrelated migration
histories. Use one migration operator; this preflight is not a distributed lock.
This initial-only guard must be deliberately extended when future migrations are
added. Do not use it as a general production migration runner.

The only mutating step is:

```bash
prisma migrate deploy --schema prisma/postgresql/schema.prisma
```

Prefer the npm wrapper above, which includes the target check and uses the local
Prisma executable. Despite the Prisma subcommand name, this applies database DDL;
it does not deploy the application. It neither seeds nor imports GTFS/CTP.

The independent PostgreSQL history is
`prisma/postgresql/migrations/`, with its own `provider = "postgresql"` lock.
The initial migration contains the reviewed draft's tables, indexes, foreign keys,
and CHECK constraints inside `BEGIN`/`COMMIT`. `initial-draft.sql` is now only a
pointer to this authoritative migration. Never execute SQLite migrations, use the
root `db:migrate`/`db:reset`/`db:push` commands against PostgreSQL, or generate the
schema with `db push` (which would omit hand-written CHECKs).

`verify` checks all 37 expected tables, named PK/FK constraints, validated CHECK
counts per table, index validity/uniqueness, and the completed migration checksum.
It prints catalog constraint/index definitions for review. This is catalog
verification, not a complete column/constraint-definition drift comparison or a
substitute for PostgreSQL import/rollback tests. No transport rows are queried.
Both `check` and `verify` are safe to rerun without changing schema or data.

After finishing, leave the dedicated shell:

```bash
unset DATABASE_URL
exit
```

The original shell and SQLite `.env` are unchanged. Continue local development
normally with `npm run dev`. Do not start the SQLite application from the staging
shell: PostgreSQL URLs intentionally fail its provider guard.

## Local preparation validation

Use non-routable example URLs for offline schema validation; validation never
opens a database connection:

```bash
DATABASE_URL='file:../db/custom.db' npx prisma validate --schema prisma/schema.prisma
DATABASE_URL='postgresql://localhost:1/offline' npm run db:postgresql:validate
npm run typecheck
npm run lint
npm run test:database-config
git diff --check
```

No live Neon connection or migration was performed during preparation. Remaining
work after connecting is actual schema application/catalog verification. Data
imports, application PostgreSQL cutover, search parity, publication concurrency,
pool/load tests, PostGIS, and deployment are separate later tasks.
