import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { databaseUrl, postgresqlStagingUrl } from '../src/lib/environment';
import { stagingManifest, verifyStagingCatalog, assertStagingMigrationTarget, STAGING_MIGRATION, type Catalog } from '../src/lib/postgresql-diagnostics';

const sql = readFileSync(`prisma/postgresql/migrations/${STAGING_MIGRATION}/migration.sql`, 'utf8');
const manifest = stagingManifest(sql);
function catalog(): Catalog {
  return {
    tables: manifest.tables.map(name => ({ name })),
    relations: manifest.tables.map(name => ({ name })),
    constraints: [
      ...manifest.constraints.map(c => ({ ...c, table_name: '', validated: true, definition: 'fixture' })),
      ...manifest.checks.flatMap(c => Array.from({ length: c.count }, (_, i) => ({ table_name: c.table,
        name: `${c.table}_check_${i}`, kind: 'c', validated: true, definition: 'fixture' }))),
    ],
    indexes: manifest.indexes.map(i => ({ ...i, valid: true, definition: 'fixture' })),
    migrations: [{ name: STAGING_MIGRATION, checksum: manifest.checksum, finished: true, rolled_back: false }],
  };
}

test('SQLite remains the explicit application default; staging configuration does not switch it', () => {
  assert.equal(databaseUrl('file:../db/custom.db', '/app'), 'file:/app/db/custom.db');
  assert.equal(databaseUrl(undefined), undefined);
  assert.throws(() => databaseUrl('postgresql://localhost/staging'));
  assert.throws(() => postgresqlStagingUrl('file:../db/custom.db'));
  assert.throws(() => postgresqlStagingUrl(undefined));
  assert.throws(() => databaseUrl('secret-invalid-url', undefined, 'postgresql'), error => {
    assert.ok(error instanceof Error); assert.equal(error.message, 'Invalid PostgreSQL URL'); return true;
  });
});

test('PostgreSQL diagnostics require public schema, Neon TLS, and bound their own connection pool', () => {
  for (const value of ['https://example.test/staging', 'postgresql://localhost/',
    'postgresql://localhost/staging?schema=other', 'postgresql://localhost/staging#fragment',
    'postgresql://example.neon.tech/staging', 'postgresql://EXAMPLE.NEON.TECH/staging',
    'postgresql://example.neon.tech/staging?sslmode=disable',
    'postgresql://example.neon.tech/staging?sslmode=require&sslmode=disable',
    'postgresql://localhost/staging?schema=public&schema=other']) {
    assert.throws(() => postgresqlStagingUrl(value));
  }
  const url = new URL(postgresqlStagingUrl('postgresql://user:encoded%40password@example-pooler.neon.tech/staging?sslmode=require&channel_binding=require'));
  assert.equal(url.password, 'encoded%40password');
  assert.equal(url.searchParams.get('channel_binding'), 'require');
  assert.equal(url.searchParams.get('connection_limit'), '1');
  assert.equal(url.searchParams.get('connect_timeout'), '10');
  assert.equal(url.searchParams.get('pool_timeout'), '10');
  assert.equal(new URL(postgresqlStagingUrl('postgresql://localhost/staging')).hostname, 'localhost');
});

test('staging baseline retains transport constraints and a separate PostgreSQL history', () => {
  assert.match(readFileSync('prisma/migrations/migration_lock.toml', 'utf8'), /provider = "sqlite"/);
  assert.match(readFileSync('prisma/postgresql/migrations/migration_lock.toml', 'utf8'), /provider = "postgresql"/);
  assert.match(readFileSync('prisma/schema.prisma', 'utf8'), /provider = "sqlite"/);
  const schema = readFileSync('prisma/postgresql/schema.prisma', 'utf8');
  assert.match(schema, /env\("DATABASE_URL"\)/);
  assert.match(schema, /output = "\.\.\/\.\.\/node_modules\/\.prisma\/postgresql-staging"/);
  assert.doesNotMatch(schema, /directUrl|POSTGRESQL_DRAFT_URL/);
  assert.match(sql, /BEGIN;/); assert.match(sql, /COMMIT;\s*$/);
  assert.doesNotMatch(sql, /PRAGMA|sqlite_master|AUTOINCREMENT|INSERT INTO/i);
  assert.equal(manifest.tables.length, 37);
  assert.ok(manifest.checks.find(c => c.table === 'DatasetVersion')!.count >= 2);
  assert.ok(manifest.constraints.some(c => c.name === 'GtfsTripVersion_datasetVersionId_serviceId_fkey'));
  assert.ok(manifest.constraints.some(c => c.name === 'GtfsTripVersion_datasetVersionId_shapeId_fkey'));
  assert.ok(manifest.constraints.some(c => c.name === 'GtfsStopTimeVersion_pkey'));
  assert.ok(manifest.constraints.some(c => c.name === 'GtfsCalendarDateVersion_pkey'));
});

test('verification rejects missing tables, FKs, CHECKs, invalid/nonunique indexes and foreign/failed histories', () => {
  assert.equal(verifyStagingCatalog(catalog(), sql).tables, 37);
  for (const mutate of [
    (c: Catalog) => c.tables.pop(),
    (c: Catalog) => { c.constraints.find(x => x.kind === 'f')!.validated = false; },
    (c: Catalog) => { c.constraints = c.constraints.filter(x => x.table_name !== 'DatasetVersion'); },
    (c: Catalog) => { c.indexes[0].valid = false; },
    (c: Catalog) => { c.indexes.find(i => i.unique)!.unique = false; },
    (c: Catalog) => { c.migrations[0].name = 'sqlite_baseline'; },
    (c: Catalog) => { c.migrations[0].finished = false; },
    (c: Catalog) => { c.migrations[0].checksum = 'changed'; },
  ]) {
    const c = catalog(); mutate(c); assert.throws(() => verifyStagingCatalog(c, sql));
    assert.throws(() => assertStagingMigrationTarget(c, sql));
  }
});

test('migration preflight accepts empty schemas or our completed baseline, rejects occupied/failed targets', () => {
  const empty: Catalog = { tables: [], relations: [], constraints: [], indexes: [], migrations: [] };
  assert.doesNotThrow(() => assertStagingMigrationTarget(empty, sql));
  assert.doesNotThrow(() => assertStagingMigrationTarget(catalog(), sql));
  assert.throws(() => assertStagingMigrationTarget({ ...empty, relations: [{ name: 'unrelated_view' }] }, sql));
  assert.throws(() => assertStagingMigrationTarget({ ...empty, migrations: catalog().migrations.map(m => ({ ...m, finished: false })) }, sql));
});
