import { createHash } from 'node:crypto';

export const STAGING_MIGRATION = '20260924000000_initial_transport';

export class StagingDiagnosticError extends Error {}

export type Catalog = {
  tables: { name: string }[];
  relations: { name: string }[];
  constraints: { table_name: string; name: string; kind: string; validated: boolean; definition: string }[];
  indexes: { name: string; valid: boolean; unique: boolean; definition: string }[];
  migrations: { name: string; checksum: string; finished: boolean; rolled_back: boolean }[];
};

/** Expected catalog objects come from the actual migration, including hand-written CHECKs. */
export function stagingManifest(sql: string) {
  const tables = [...sql.matchAll(/CREATE TABLE "([^"]+)" \(([\s\S]*?)\n\);/g)];
  if (!tables.length) throw new StagingDiagnosticError('Staging migration contains no tables');
  return {
    tables: tables.map(m => m[1]),
    checks: tables.map(m => ({ table: m[1], count: [...m[2].matchAll(/\bCHECK \(/g)].length })),
    constraints: [...sql.matchAll(/CONSTRAINT "([^"]+)" (PRIMARY KEY|FOREIGN KEY)/g)]
      .map(m => ({ name: m[1], kind: m[2] === 'PRIMARY KEY' ? 'p' : 'f' })),
    indexes: [...sql.matchAll(/CREATE (UNIQUE )?INDEX "([^"]+)"/g)].map(m => ({ name: m[2], unique: !!m[1] })),
    checksum: createHash('sha256').update(sql).digest('hex'),
  };
}

export function verifyStagingCatalog(catalog: Catalog, sql: string) {
  const expected = stagingManifest(sql);
  const failures: string[] = [];
  for (const table of expected.tables) if (!catalog.tables.some(t => t.name === table)) failures.push(`Missing table: ${table}`);
  for (const constraint of expected.constraints) {
    if (!catalog.constraints.some(c => c.name === constraint.name && c.kind === constraint.kind && c.validated)) {
      failures.push(`Missing/unvalidated constraint: ${constraint.name}`);
    }
  }
  for (const { table, count } of expected.checks) {
    if (catalog.constraints.filter(c => c.table_name === table && c.kind === 'c' && c.validated).length !== count) {
      failures.push(`CHECK constraint count differs: ${table}`);
    }
  }
  for (const { name, unique } of expected.indexes) {
    if (!catalog.indexes.some(i => i.name === name && i.valid && i.unique === unique)) failures.push(`Missing/invalid index: ${name}`);
  }
  const live = catalog.migrations.filter(m => !m.rolled_back);
  if (live.length !== 1 || live[0].name !== STAGING_MIGRATION || !live[0].finished || live[0].checksum !== expected.checksum) {
    failures.push('PostgreSQL migration history is missing, failed, foreign, or has a different checksum');
  }
  if (failures.length) throw new StagingDiagnosticError(failures.join('\n'));
  return { tables: expected.tables.length, constraints: expected.constraints.length,
    checks: expected.checks.reduce((n, c) => n + c.count, 0), indexes: expected.indexes.length, migration: STAGING_MIGRATION };
}

/** Initial migration only: refuse an occupied database without our successfully applied baseline. */
export function assertStagingMigrationTarget(catalog: Catalog, sql: string) {
  if (catalog.relations.every(r => r.name === '_prisma_migrations') && !catalog.migrations.length) return;
  verifyStagingCatalog(catalog, sql);
}
