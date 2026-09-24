import { importPrepared } from '../src/lib/storage/legacy-ctp-projection';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, symlink, truncate } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';
import { identity, prepareImport, readCsv, resolveCtpInput, validateRow, type CsvRow } from '../src/lib/ctp-import';
import { queryPhysicalStops, parseStopQuery } from '../src/lib/physical-stops';
import { reconcileStops, ciudadQuesadaCoverage } from '../src/lib/stop-reconciliation';
import { CTP_STOP_NOTICE, CTP_ROUTING_NOTICE, stopNotice } from '../src/lib/stop-display';

const sample: CsvRow = {
  source_stop_identifier: 'fixture-ctp', identificador_parada: 'fixture-ctp', candidate_id: 'a'.repeat(64),
  descripcion: 'Parada, "oficial"\nQuesada', latitude: '10.328979888894139', longitude: '-84.43678051906224',
  coord_x: '451234.100', coord_y: '1145678.200', province: 'Alajuela', canton: 'San Carlos', district: 'Quesada',
  source_crs: 'EPSG:5367', output_crs: 'EPSG:4326', coordinate_status: 'valid', geometry_conflict: 'False', outside_cr_screen: 'False',
  source_endpoint: 'https://visortp.ctp.go.cr/Visor/service/ctp', retrieved_at: '2026-09-12T00:00:00Z',
  original_payload: '{}', wfs_numeric_ids: '[]', wfs_feature_ids: '[]', district_candidates: '["Quesada"]', source_records: '[]', selection_provenance: '[]', wfs_ambiguous: 'False',
};
function csv(rows: CsvRow[], fields = Object.keys(sample)) {
  const quote = (s: string) => `"${s.replaceAll('"', '""')}"`;
  return '\uFEFF' + fields.map(quote).join(',') + '\r\n' + rows.map(r => fields.map(k => quote(r[k] || '')).join(',')).join('\r\n') + '\r\n';
}
async function fixtures(fn: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(path.join(tmpdir(), 'rutatica-ctp-test-'));
  try { await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}
async function prepare(dir: string, rows: CsvRow[], conflicts: CsvRow[] = []) {
  const a = path.join(dir, 'stops.csv'), b = path.join(dir, 'conflicts.csv');
  await writeFile(a, csv(rows));
  await writeFile(b, csv(conflicts, [...Object.keys(sample), 'conflict_type']));
  return prepareImport(a,b);
}
test('CSV handles BOM, commas, escaped quotes, embedded newline; fails closed on malformed/header abuse', async () => fixtures(async dir => {
  const prepared = await prepare(dir, [sample]);
  assert.equal(prepared.accepted[0].name, sample.descripcion);
  const file = path.join(dir, 'bad.csv');
  for (const text of ['id,id\n1,2', 'id\n"unterminated', 'id\n1,2', '__proto__\nx']) {
    await writeFile(file,text); await assert.rejects(readCsv(file,['id']));
  }
}));
test('input allowlist, symlink containment and oversized files fail before parsing', async () => fixtures(async dir => {
  for (const name of ['../.env', '/etc/passwd', 'constructor']) await assert.rejects(resolveCtpInput(dir,name));
  await symlink('/etc/passwd',path.join(dir,'ctp_all_stops.csv'));
  await assert.rejects(resolveCtpInput(dir,'ctp_all_stops.csv'));
  const large = path.join(dir,'large.csv'); await writeFile(large,''); await truncate(large,101*1024*1024);
  await assert.rejects(readCsv(large,[]));
}));
test('reject empty/impossible/nonfinite coordinates, missing names/IDs and invalid provenance', () => {
  assert.equal(validateRow(sample),null);
  assert.equal(identity(sample),identity({...sample,coord_x:'451234.1'}));
  assert.notEqual(identity(sample),identity({...sample,coord_x:'451234.10000000000001'}));
  const patches: CsvRow[] = [{ latitude:'' },{ longitude:'NaN' },{ latitude:'91' },{ longitude:'Infinity' },{ longitude:'0' },{ coord_x:'' },{ descripcion:'' },{ source_stop_identifier:'' },{ output_crs:'EPSG:5367' },{ source_endpoint:'https://example.com' },{ original_payload:'invalid' }];
  for (const patch of patches) assert.ok(validateRow({...sample,...patch}));
});
test('duplicate report is audited and mislabeled/conflicting rows are quarantined', async () => fixtures(async dir => {
  const exact = await prepare(dir,[sample,sample],[{...sample,conflict_type:'exact_duplicate'}]);
  assert.equal(exact.accepted.length,1); assert.equal(exact.duplicates,1); assert.equal(exact.sourceDuplicateOccurrences,1);
  assert.equal(exact.audit.length,2);
  for (const variant of [{...sample,conflict_type:'geometry_conflict'}, {...sample,descripcion:'changed',conflict_type:'exact_duplicate'}]) {
    const p = await prepare(dir,[sample],[variant]); assert.equal(p.accepted.length,0); assert.equal(p.conflicts,1);
  }
  const variant = await prepare(dir,[sample,{...sample,coord_x:'451235.1'}]);
  assert.equal(variant.conflicts,2); assert.equal(variant.accepted.length,0);
  const ambiguous = await prepare(dir,[{...sample,wfs_ambiguous:'True'}]);
  assert.equal(ambiguous.accepted[0].district,null);
  assert.equal(JSON.parse(ambiguous.accepted[0].sourceMetadata).district,'Quesada');
}));
test('bbox/source parser rejects inverted, oversized, duplicate-coordinate contexts and invalid source', () => {
  for (const q of ['bbox=10,-85,9,-84','bbox=0,0,90,180','bbox=NaN,1,2,3','bbox=10,-85,10.1,-84.9&lat=10','source=OTP']) assert.throws(() => parseStopQuery(new URLSearchParams(q)));
  assert.deepEqual(parseStopQuery(new URLSearchParams('bbox=10,-85,10.1,-84.9')).bbox,[10,-85,10.1,-84.9]);
});
test('reconciliation preserves both IDs and identifies ambiguity in both directions', () => {
  const c = [{ id:'ctp-1',lat:10,lon:-84 },{ id:'ctp-2',lat:10,lon:-84.00001 },{id:'unmatched',lat:11,lon:-84}];
  const g = [{id:'gtfs',lat:10,lon:-84},{id:'other',lat:9,lon:-84}];
  const r = reconcileStops(c,g);
  assert.equal(r.likelyOverlaps.length,0); assert.equal(r.ambiguousMatches.length,2);
  assert.deepEqual(r.unmatchedCtp,['unmatched']); assert.deepEqual(r.unmatchedGtfs,['other']);
  assert.equal(reconcileStops(c.slice(0,1),g).likelyOverlaps.length,1);
});
test('SQLite migration, dry-run, atomic idempotent import, GTFS coexistence, API labels and routing isolation', async () => fixtures(async dir => {
  const client = new PrismaClient({datasourceUrl:`file:${path.join(dir,'fixture.db')}`});
  try {
    // Disposable synthetic data only; never load the national dataset in this test.
    for (const name of ['20260917000000_baseline', '20260918000000_ctp_stops']) {
      const migration = await readFile(`prisma/migrations/${name}/migration.sql`, 'utf8');
      for (const sql of migration.split(';').filter(s => s.trim())) await client.$executeRawUnsafe(sql);
    }
    await client.gtfsStop.create({data:{stop_id:'fixture-ctp',name:'GTFS remains',lat:10.33,lon:-84.44}});
    await client.gtfsAgency.create({data:{agency_id:'fixture',name:'Fixture',url:'https://example.com',timezone:'America/Costa_Rica'}});
    await client.gtfsRoute.create({data:{route_id:'fixture',agency_id:'fixture'}});
    await client.stopRoute.create({data:{stopId:'fixture-ctp',routeId:'fixture',sequence:1}});
    let p = await prepare(dir,[sample]);
    const dry = await importPrepared(client,p); assert.equal(dry.imported,1); assert.equal(await client.ctpStop.count(),0);
    const first = await importPrepared(client,p,true); assert.equal(first.imported,1);
    const second = await importPrepared(client,p,true); assert.equal(second.unchanged,1); assert.equal(second.imported,0);
    p = await prepare(dir,[{...sample,descripcion:'New description'}]);
    assert.equal((await importPrepared(client,p,true)).updated,1);
    assert.equal(await client.ctpStop.count(),1); assert.equal((await client.gtfsStop.findFirst())!.name,'GTFS remains');
    const stored = (await client.ctpStop.findFirst())!;
    assert.equal(stored.source,'CTP'); assert.equal(stored.sourceStopId,sample.source_stop_identifier); assert.equal(stored.coordX,sample.coord_x);
    const results = await queryPhysicalStops({lat:10.3275,lon:-84.4372,radius:1},client);
    assert.equal(results.total,2); assert.equal(results.stops[0].source,'CTP'); assert.equal(results.stops[0].hasRouteData,false);
    assert.equal(stopNotice(results.stops[0]),CTP_STOP_NOTICE);
    assert.equal(results.stops.find(s => s.source === 'GTFS')!.stopId,'fixture-ctp');
    assert.equal(results.stops.find(s => s.source === 'GTFS')!.hasRouteData,true);
    assert.equal((await queryPhysicalStops({bbox:[10.328,-84.437,10.329,-84.436]},client)).total,1);
    assert.equal((await queryPhysicalStops({bbox:[9,-85,9.1,-84.9]},client)).total,0);
    assert.equal((await queryPhysicalStops({search:'New description'},client)).stops[0].source,'CTP');
    assert.equal((await queryPhysicalStops({limit:1,offset:1},client)).stops.length,1);
    const coverage = ciudadQuesadaCoverage([{id:stored.id,lat:stored.lat,lon:stored.lon}],[]);
    assert.deepEqual(coverage.radii.map(r => r.ctp),[1,1,1,1]);
    // Exercise actual API handlers with the disposable client through the shared singleton.
    const { db } = await import('../src/lib/db');
    const originals = { ctpStop: db.ctpStop, gtfsStop: db.gtfsStop, gtfsCalendar: db.gtfsCalendar, gtfsCalendarDate: db.gtfsCalendarDate };
    Object.assign(db,{ctpStop:client.ctpStop,gtfsStop:client.gtfsStop,gtfsCalendar:{findMany:async()=>[]},gtfsCalendarDate:{findMany:async()=>[]}});
    const oldOtp = process.env.OPEN_TRIP_PLANNER_URL;
    delete process.env.OPEN_TRIP_PLANNER_URL;
    try {
      const { GET: stopsApi } = await import('../src/app/api/stops/route');
      const { GET: nearestApi } = await import('../src/app/api/nearest-stop/route');
      const { GET: planner } = await import('../src/app/api/best-route/route');
      const response = await stopsApi(new NextRequest('http://localhost/api/stops?source=CTP&lat=10.3275&lon=-84.4372&radius=1'));
      assert.equal(response.status,200); assert.equal((await response.json()).stops[0].source,'CTP');
      const nearest = await nearestApi(new NextRequest('http://localhost/api/nearest-stop?lat=10.3275&lon=-84.4372'));
      assert.equal((await nearest.json()).stops[0].stop.hasRouteData,false);
      assert.equal((await stopsApi(new NextRequest('http://localhost/api/stops?bbox=../.env'))).status,400);
      await client.gtfsStop.updateMany({data:{lat:9.9,lon:-84}});
      const planned = await planner(new NextRequest('http://localhost/api/best-route?originLat=10.3275&originLon=-84.4372&destLat=10.34&destLon=-84.44'));
      assert.equal(planned.status,200);
      const body = await planned.json(); assert.deepEqual(body.routes,[]); assert.equal(body.message,CTP_ROUTING_NOTICE);
    } finally { Object.assign(db,originals); if (oldOtp === undefined) delete process.env.OPEN_TRIP_PLANNER_URL; else process.env.OPEN_TRIP_PLANNER_URL=oldOtp; }
    // A second invalid write rolls back the first write in the transaction.
    const broken = { ...p, accepted:[{...p.accepted[0],identityKey:'new'}, {...p.accepted[0],identityKey:'bad',lat:999}] };
    await assert.rejects(importPrepared(client,broken,true)); assert.equal(await client.ctpStop.count(),1);
    assert.deepEqual(await client.$queryRawUnsafe('PRAGMA integrity_check'),[{integrity_check:'ok'}]);
    await client.$executeRawUnsafe('DROP TABLE ctp_stops');
    const fallback = await queryPhysicalStops({},client);
    assert.equal(fallback.ctpAvailable,false); assert.equal(fallback.stops[0].source,'GTFS');
  } finally { await client.$disconnect(); }
}));

test('CTP writes 101 accepted stops in three SQL batches and zero batches on repeat', async () => fixtures(async dir => {
  const writes: string[] = [];
  const client = new PrismaClient({datasourceUrl:`file:${path.join(dir,'batch.db')}`,log:[{emit:'event',level:'query'}]});
  client.$on('query',event=>{ if (event.query.startsWith('INSERT INTO "ctp_stops"')) writes.push(event.query); });
  try {
    const migration=await readFile('prisma/migrations/20260918000000_ctp_stops/migration.sql','utf8');
    for(const sql of migration.split(';').filter(s=>s.trim())) await client.$executeRawUnsafe(sql);
    const rows=Array.from({length:101},(_,i)=>({...sample,source_stop_identifier:`fixture-${i}`,identificador_parada:`fixture-${i}`}));
    const prepared=await prepare(dir,rows);
    assert.equal((await importPrepared(client,prepared,true)).imported,101);
    assert.equal(writes.length,3);
    const before=await client.ctpStop.findMany({orderBy:{identityKey:'asc'}});
    assert.equal((await importPrepared(client,prepared,true)).unchanged,101);
    assert.equal(writes.length,3);
    assert.deepEqual(await client.ctpStop.findMany({orderBy:{identityKey:'asc'}}),before);
    // Failure after a successful first batch must roll back the whole import.
    const broken={...prepared,accepted:prepared.accepted.slice(0,51).map((row,index)=>({...row,identityKey:`rollback-${index}`,lat:index===50?999:row.lat}))};
    await assert.rejects(importPrepared(client,broken,true));
    assert.deepEqual(await client.ctpStop.findMany({orderBy:{identityKey:'asc'}}),before);
  } finally {await client.$disconnect();}
}));
