/** Historical SQLite projection adapter, retained only for regression tests.
 * New feeds MUST use publishCtp; this cannot preserve observation history. */
import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { prepareImport } from '../ctp-import';
export async function importPrepared(client: PrismaClient, prepared: Awaited<ReturnType<typeof prepareImport>>, apply = false) {
  const exists = await client.$queryRawUnsafe<{ name: string }[]>("SELECT name FROM sqlite_master WHERE type='table' AND name='ctp_stops'");
  if (apply && !exists.length) throw new Error('Apply the reviewed CTP migration before importing');
  const existing = exists.length ? await client.ctpStop.findMany({ select: { identityKey: true, contentHash: true } }) : [];
  const hashes = new Map(existing.map(r => [r.identityKey, r.contentHash]));
  let imported = 0, updated = 0, unchanged = 0;
  const changes = prepared.accepted.filter(r => {
    const old = hashes.get(r.identityKey);
    if (old === r.contentHash) { unchanged++; return false; }
    if (old) updated++; else imported++;
    return true;
  });
  if (apply) {
    // One transaction: interruption or a constraint failure rolls back every CTP write.
    await client.$transaction(async tx => {
      const now = new Date();
      // 50 * 17 parameters stays below even SQLite's older 999-variable limit.
      for (let start = 0; start < changes.length; start += 50) {
        const values = changes.slice(start, start + 50).map(d => Prisma.sql`(
          ${randomUUID()}, ${d.identityKey}, ${d.source}, ${d.sourceStopId}, ${d.candidateId},
          ${d.name}, ${d.lat}, ${d.lon}, ${d.coordX}, ${d.coordY}, ${d.province}, ${d.canton},
          ${d.district}, ${d.sourceMetadata}, ${d.contentHash}, ${now}, ${now})`);
        await tx.$executeRaw(Prisma.sql`INSERT INTO "ctp_stops"
          ("id","identityKey","source","sourceStopId","candidateId","name","lat","lon","coordX","coordY",
           "province","canton","district","sourceMetadata","contentHash","createdAt","updatedAt")
          VALUES ${Prisma.join(values)} ON CONFLICT("identityKey") DO UPDATE SET
          "source"=excluded."source", "sourceStopId"=excluded."sourceStopId", "candidateId"=excluded."candidateId",
          "name"=excluded."name", "lat"=excluded."lat", "lon"=excluded."lon", "coordX"=excluded."coordX", "coordY"=excluded."coordY",
          "province"=excluded."province", "canton"=excluded."canton", "district"=excluded."district",
          "sourceMetadata"=excluded."sourceMetadata", "contentHash"=excluded."contentHash", "updatedAt"=excluded."updatedAt"`);
      }
    }, { timeout: 300000, maxWait: 10000 });
  }
  const { accepted: _accepted, audit: _audit, ...counts } = prepared;
  return { mode: apply ? 'apply' : 'dry-run', ...counts, imported, updated, unchanged,
    countsAreProjected: !apply, ctpTableExists: !!exists.length };
}
