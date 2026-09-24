/** Explicit PostgreSQL staging only. check/verify/pre-migrate issue no database writes. */
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import type { PrismaClient } from '@prisma/client';
import { postgresqlStagingUrl } from '../src/lib/environment';
import { assertStagingMigrationTarget, verifyStagingCatalog, StagingDiagnosticError, STAGING_MIGRATION, type Catalog } from '../src/lib/postgresql-diagnostics';

async function main() {
  const [mode, ...extra] = process.argv.slice(2);
  if (extra.length || !['check', 'verify', 'pre-migrate'].includes(mode)) {
    throw new StagingDiagnosticError('Usage: postgresql-staging.ts check|verify|pre-migrate');
  }
  let datasourceUrl: string;
  try { datasourceUrl = postgresqlStagingUrl(process.env.DATABASE_URL); }
  catch { throw new StagingDiagnosticError('Export a valid PostgreSQL DATABASE_URL targeting public; Neon requires sslmode=require or verify-full.'); }
  const require = createRequire(import.meta.url);
  let Client: typeof PrismaClient;
  try { ({ PrismaClient: Client } = require('../node_modules/.prisma/postgresql-staging')); }
  catch { throw new StagingDiagnosticError('Generate the isolated client first: npm run db:postgresql:generate'); }
  const client = new Client({ datasourceUrl, log: [] });
  try {
    const result = await client.$transaction(async tx => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '10s'");
      const connection = await tx.$queryRawUnsafe<{ version: string; schema: string; read_only: string }[]>(
        `SELECT current_setting('server_version_num') AS version, current_schema()::text AS schema,
         current_setting('transaction_read_only') AS read_only`);
      if (connection[0]?.schema !== 'public' || connection[0]?.read_only !== 'on') {
        throw new StagingDiagnosticError('Expected a read-only transaction in public');
      }
      if (mode === 'check') return { connected: true, ...connection[0] };
      const relations = await tx.$queryRawUnsafe<Catalog['relations']>(
        `SELECT c.relname::text AS name FROM pg_catalog.pg_class c
         JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S','f') ORDER BY c.relname`);
      const tables = await tx.$queryRawUnsafe<Catalog['tables']>(
        `SELECT tablename::text AS name FROM pg_catalog.pg_tables WHERE schemaname='public' ORDER BY tablename`);
      const constraints = await tx.$queryRawUnsafe<Catalog['constraints']>(
        `SELECT t.relname::text AS table_name, c.conname::text AS name, c.contype::text AS kind,
                c.convalidated AS validated, pg_get_constraintdef(c.oid) AS definition
         FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_class t ON t.oid=c.conrelid
         JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace
         WHERE n.nspname='public' ORDER BY t.relname,c.conname`);
      const indexes = await tx.$queryRawUnsafe<Catalog['indexes']>(
        `SELECT c.relname::text AS name, i.indisvalid AS valid, i.indisunique AS "unique", pg_get_indexdef(i.indexrelid) AS definition
         FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid=i.indexrelid
         JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='public' ORDER BY c.relname`);
      // Inspect existence first: a failed statement would abort the PostgreSQL transaction.
      const migrations = tables.some(t => t.name === '_prisma_migrations')
        ? await tx.$queryRawUnsafe<Catalog['migrations']>(
          `SELECT migration_name AS name, checksum, finished_at IS NOT NULL AS finished,
                  rolled_back_at IS NOT NULL AS rolled_back FROM public."_prisma_migrations" ORDER BY started_at`)
        : [];
      const catalog = { tables, relations, constraints, indexes, migrations };
      const sql = await readFile(new URL(`../prisma/postgresql/migrations/${STAGING_MIGRATION}/migration.sql`, import.meta.url), 'utf8');
      if (mode === 'pre-migrate') {
        assertStagingMigrationTarget(catalog, sql);
        return { migrationTargetAccepted: true, existingTables: tables.length };
      }
      return { verified: verifyStagingCatalog(catalog, sql), tables, constraints, indexes };
    }, { isolationLevel: 'Serializable', timeout: 30000, maxWait: 10000 });
    console.log(JSON.stringify(result, null, 2));
  } finally { await client.$disconnect(); }
}

main().catch(error => {
  // Prisma/network errors can embed credentials/URLs; never print their message, stack, or meta.
  if (error instanceof StagingDiagnosticError) console.error(error.message);
  else {
    const code = error && typeof error === 'object' && 'code' in error && /^P\d{4}$/.test(String(error.code)) ? ` (${error.code})` : '';
    console.error(`PostgreSQL staging diagnostic failed${code}. Check credentials, TLS, reachability, privileges, and the generated staging client.`);
  }
  process.exitCode = 1;
});
