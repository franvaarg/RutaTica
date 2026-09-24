import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {PrismaClient} from '@prisma/client';
import {readFeed,auditTables} from '../src/lib/gtfs-audit';
import {publishGtfs,deriveStopRoutes} from '../src/lib/gtfs-publication';
import {publishCtp,recordReconciliation,reviewReconciliation} from '../src/lib/ctp-publication';
import {toCtpData,type prepareImport} from '../src/lib/ctp-import';
import {selectTripSegment} from '../src/lib/trip-segments';
import {routeMembership} from '../src/lib/routing-membership';
import {databaseUrl} from '../src/lib/environment';
async function database(fn:(db:PrismaClient)=>Promise<void>){
 const dir=await mkdtemp(path.join(tmpdir(),'rutatica-publication-'));const file=path.join(dir,'test.db');
 execFileSync('python3',['-c',`import sqlite3,pathlib,sys\nc=sqlite3.connect(sys.argv[1])\nfor p in sorted(pathlib.Path('prisma/migrations').glob('*/migration.sql')): c.executescript(p.read_text())\nc.close()`,file]);
 const db=new PrismaClient({datasourceUrl:`file:${file}`});try{await fn(db);}finally{await db.$disconnect();await rm(dir,{recursive:true,force:true});}
}
const feed=()=>readFeed('gtfs-data');
test('all source files validate; shape decisions preserve all trips and no invented geometry',async()=>{
 const f=feed();assert.deepEqual(auditTables(f.tables,f.parseErrors).errors,[]);
 const report=JSON.parse(await readFile('docs/GTFS_SHAPE_RESOLUTION.json','utf8'));assert.equal(report.shapes.length,26);assert.equal(report.affected_trips,50);assert.equal(f.tables.trips.length,72);
 const broken=structuredClone(f.tables);broken.trips[0].shape_id='missing';assert.ok(auditTables(broken).errors.some(e=>e.includes('missing shape')));
 broken.trips[0].shape_id='';assert.deepEqual(auditTables(broken).errors,[]);
});
test('validation rejects agency, route, coordinate, identifiers, sequences and orphan relationships',()=>{
 for(const mutate of [
  (t:ReturnType<typeof feed>['tables'])=>t.agency[0].agency_name='',
  (t:ReturnType<typeof feed>['tables'])=>t.routes[0].agency_id='missing',
  (t:ReturnType<typeof feed>['tables'])=>t.routes[0].route_type='999',
  (t:ReturnType<typeof feed>['tables'])=>t.stops[0].stop_lat='NaN',
  (t:ReturnType<typeof feed>['tables'])=>t.trips[0].trip_id=' bad ',
  (t:ReturnType<typeof feed>['tables'])=>t.stop_times[0].stop_sequence='1.5',
  (t:ReturnType<typeof feed>['tables'])=>t.stop_times[0].stop_id='missing',
  (t:ReturnType<typeof feed>['tables'])=>t.calendar_dates.push({...t.calendar_dates[0],exception_type:'1'}),
 ]){const t=feed().tables;mutate(t);assert.ok(auditTables(t).errors.length);}
});
test('publication scopes reused IDs, enforces same-version FKs, derives all membership and rolls back every failure phase',async()=>database(async db=>{
 const f=feed();const first=await publishGtfs(db,f,{sourceKey:'fixture'});
 assert.equal(await db.gtfsTrip.count(),72);assert.equal(await db.stopRoute.count(),122);
 assert.ok((await routeMembership(db,{stopIds:['INT009']})).some(r=>r.routeId==='R101'));
 assert.equal(deriveStopRoutes(f.tables).length,122);
 const projection=await db.gtfsStopTime.findMany({orderBy:{id:'asc'}});
 for(const phase of ['canonical','projection','activation']){
  await assert.rejects(publishGtfs(db,{...f,checksum:'failure-'+phase},{sourceKey:'fixture',checkpoint:p=>{if(p===phase)throw Error('injected failure');}}));
  assert.deepEqual(await db.gtfsStopTime.findMany({orderBy:{id:'asc'}}),projection);
  assert.equal((await db.datasetVersion.findFirstOrThrow({where:{activeSlot:{not:null}}})).id,first.datasetVersionId);
  assert.equal(await db.gtfsTripVersion.count(),72);
 }
 assert.equal(await db.importRun.count({where:{status:'failed'}}),3);
 const invalid=structuredClone(f);invalid.checksum='invalid';invalid.tables.trips[0].shape_id='absent';await assert.rejects(publishGtfs(db,invalid,{sourceKey:'fixture'}));
 assert.equal(await db.importRun.count({where:{status:'failed'}}),4);
 const second=await publishGtfs(db,{...f,checksum:'second'},{sourceKey:'fixture'});
 assert.equal(await db.gtfsTripVersion.count(),144);
 assert.equal(await db.datasetVersion.count({where:{status:'active'}}),1);
 assert.equal((await publishGtfs(db,{...f,checksum:'second'},{sourceKey:'fixture'})).unchanged,true);
 const oldRoute=await db.gtfsRouteVersion.findFirstOrThrow({where:{datasetVersionId:first.datasetVersionId}});
 const newTrip=await db.gtfsTripVersion.findFirstOrThrow({where:{datasetVersionId:second.datasetVersionId}});
 await assert.rejects(db.gtfsTripVersion.update({where:{id:newTrip.id},data:{routeId:oldRoute.id}}));
 const oldStop=await db.gtfsStopVersion.findFirstOrThrow({where:{datasetVersionId:first.datasetVersionId}});
 await assert.rejects(db.gtfsStopTimeVersion.create({data:{datasetVersionId:second.datasetVersionId,tripId:newTrip.id,stopId:oldStop.id,sequence:999,payload:'{}'}}));
 await assert.rejects(db.datasetVersion.update({where:{id:second.datasetVersionId},data:{activeSlot:null}}));
 const currentStop=await db.gtfsStopVersion.findFirstOrThrow({where:{datasetVersionId:second.datasetVersionId}});
 await assert.rejects(db.gtfsStopVersion.create({data:{...currentStop,id:'duplicate-external-id'}}));
 const st=await db.gtfsStopTimeVersion.findFirstOrThrow();await assert.rejects(db.gtfsStopTimeVersion.create({data:st}));
 assert.deepEqual(await db.$queryRawUnsafe('PRAGMA foreign_key_check'),[]);
 assert.deepEqual(await db.$queryRawUnsafe('PRAGMA integrity_check'),[{integrity_check:'ok'}]);
}));
test('calendar-dates-only service publishes without invented weekly calendar; times beyond 24 survive',async()=>database(async db=>{
 const f=feed();f.checksum='exception-only';f.tables.calendar=[];
 f.tables.calendar_dates=[...new Set(f.tables.trips.map(r=>r.service_id))].map(service_id=>({service_id,date:'20260923',exception_type:'1'}));
 for(const r of f.tables.stop_times){for(const k of ['arrival_time','departure_time']){const [h,...rest]=r[k].split(':');r[k]=[String(Number(h)+24),...rest].join(':');}}
 assert.deepEqual(auditTables(f.tables).errors,[]);await publishGtfs(db,f,{sourceKey:'special'});
 assert.equal(await db.gtfsCalendar.count(),0);assert.equal(await db.gtfsService.count(),3);
 assert.ok((await db.gtfsStopTimeVersion.findFirstOrThrow()).arrivalSeconds!>=86400);
}));
test('repeated stops select valid sequence after requested time and permit later return',()=>{
 const stop=(id:string,seq:number,h:string)=>({stop_id:id,stop_sequence:seq,arrival_time:h,departure_time:h,pickup_type:0,drop_off_type:0});
 const stops=[stop('A',1,'08:00:00'),stop('B',2,'08:15:00'),stop('A',3,'08:30:00'),stop('B',4,'08:45:00')];
 assert.equal(selectTripSegment(stops,'A','B',8*60+20)?.board.stop_sequence,3);
 assert.equal(selectTripSegment(stops,'B','A',0)?.alight.stop_sequence,3);
 assert.equal(selectTripSegment(stops,'A','A',0)?.alight.stop_sequence,3);
 assert.equal(selectTripSegment(stops,'A','B',9*60),null);
});
function prepared(moved=false):Awaited<ReturnType<typeof prepareImport>> {
 const meta={source_stop_identifier:'official-1',candidate_id:'a'.repeat(64),descripcion:'Official stop',latitude:moved?'10':'9.9281',longitude:'-84.0907',coord_x:'1',coord_y:'2',province:'San José',canton:'San José',district:'evidence only',wfs_ambiguous:'True',source_crs:'EPSG:5367',output_crs:'EPSG:4326',retrieved_at:'2026-09-12T00:00:00Z'};
 return {accepted:[toCtpData(meta),toCtpData({...meta,source_stop_identifier:'official-2'})],audit:[{file:'stops',row:3,reason:'missing_required_value',data:{...meta,descripcion:''}}],totalRowsRead:3,invalid:1,conflicts:0,conflictSourceIds:0,duplicates:0,sourceDuplicateOccurrences:0,sourceDuplicateGroups:0,sourceDuplicateExtraRows:0,sourceConflictingRows:0,sourceConflictReportRows:0,skipped:1};
}
test('CTP identities survive movement; history, quarantine, null ambiguous districts and reviewable reconciliation persist',async()=>database(async db=>{
 await publishGtfs(db,feed(),{sourceKey:'fixture'});
 await publishCtp(db,prepared(),{checksum:'ctp-first'});
 assert.equal(await db.ctpStopIdentity.count(),2);assert.equal(await db.ctpStop.count(),2);
 assert.equal(await db.ctpStopObservation.count({where:{district:null}}),2);assert.equal(await db.importRejection.count(),1);
 const identities=await db.ctpStopIdentity.findMany({orderBy:{externalId:'asc'}});
 await recordReconciliation(db);assert.ok(await db.stopReconciliation.count()>0);assert.equal(await db.stopReconciliation.count({where:{status:'accepted'}}),0);
 const match=await db.stopReconciliation.findFirstOrThrow();await assert.rejects(reviewReconciliation(db,match.id,'accepted','',''));
 await reviewReconciliation(db,match.id,'accepted','test reviewer','synthetic test evidence');await recordReconciliation(db);
 assert.equal((await db.stopReconciliation.findUniqueOrThrow({where:{id:match.id}})).status,'accepted');
 await assert.rejects(publishCtp(db,prepared(true),{checksum:'ctp-failed',checkpoint:()=>{throw Error('injected');}}));
 assert.equal(await db.ctpStopObservation.count(),2);assert.equal(await db.ctpStop.count(),2);
 await publishCtp(db,prepared(true),{checksum:'ctp-moved'});
 assert.deepEqual((await db.ctpStopIdentity.findMany({orderBy:{externalId:'asc'}})).map(s=>s.id),identities.map(s=>s.id));
 assert.equal(await db.ctpStopObservation.count(),4);assert.equal(await db.ctpStop.count(),0);assert.equal(await db.ctpStopIdentity.count({where:{active:true}}),0);
 await publishCtp(db,prepared(true),{checksum:'ctp-repeat-content-new-version'});
 assert.equal(await db.ctpStop.count(),0,'movement must not auto-accept on next import');
 assert.equal(await db.ctpStopObservation.count(),6);
 const partial=prepared(true);partial.accepted=partial.accepted.slice(0,1);
 await publishCtp(db,partial,{checksum:'ctp-missing'});
 assert.equal(await db.ctpStopIdentity.count({where:{reviewStatus:'missing_from_snapshot'}}),1);
 assert.equal(await db.ctpStopObservation.count(),7);
 assert.deepEqual(await db.$queryRawUnsafe('PRAGMA foreign_key_check'),[]);
}));
test('database provider handling is explicit and never silently changes generated client',()=>{
 assert.throws(()=>databaseUrl('postgresql://localhost/test'));
 assert.equal(databaseUrl('postgresql://localhost/test',undefined,'postgresql'),'postgresql://localhost/test');
});
