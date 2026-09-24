import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { auditGtfs } from '../src/lib/gtfs-audit';
import { mapPlannedRoutes } from '../src/lib/planned-route';
import { planWithOtp } from '../src/lib/otp-client';
import { invalidQuery, invalidIdentifier } from '../src/lib/api-validation';
import { calculateRouteScore } from '../src/lib/route-scoring';

test('GTFS audit reports missing shapes without rewriting data and fails before importing malformed schedules', async () => {
  const dir = await mkdtemp(path.join(tmpdir(),'rutatica-feed-'));
  try {
    await cp('gtfs-data',dir,{recursive:true});
    const baseline = auditGtfs(dir);
    assert.deepEqual(baseline.errors,[]);
    assert.equal(baseline.missingShapes.length,0);
    await writeFile(path.join(dir,'stop_times.txt'),'trip_id,stop_id,arrival_time,departure_time,stop_sequence\nT101A_WD,SJO001,,,1\nT101A_WD,SJO001,09:00:00,08:00:00,1\n');
    const result=auditGtfs(dir);
    assert.ok(result.errors.some(e=>e.includes('duplicate')));
    assert.ok(result.errors.some(e=>e.includes('requires times')));
    assert.ok(result.errors.some(e=>e.includes('decreasing time')));
    await writeFile(path.join(dir,'frequencies.txt'),'trip_id,start_time,end_time,headway_secs\nT101A_WD,08:00:00,09:00:00,600\n');
    assert.ok(auditGtfs(dir).unsupported.some(e=>e.includes('frequencies')));
  } finally { await rm(dir,{recursive:true,force:true}); }
});
test('route adapter preserves source, stable identity and unknown fare without inventing geometry', () => {
  const routes=[{route:{routeId:'real'},stops:[{lat:10,lon:-84},{lat:10.1,lon:-84}],costCRC:null}];
  const [r]=mapPlannedRoutes(routes,'gtfs-local');
  assert.equal(r.price,null); assert.equal(r.routingSource,'gtfs-local'); assert.deepEqual(r._shapePoints,[]);
  assert.equal(r.id,mapPlannedRoutes(routes,'gtfs-local')[0].id);
  assert.equal(mapPlannedRoutes([{costCRC:0}],'otp')[0].price,0);
});
test('unknown fares are not scored as free fares', () => {
  const a={costCRC:null,totalTimeMinutes:10,walkingDistanceKm:0,transfers:0};
  const b={...a,costCRC:100};
  assert.ok(calculateRouteScore(a,[a,b]) >= calculateRouteScore(b,[a,b]));
});
test('API rejects excessive query keys and invalid dynamic identifiers', () => {
  assert.ok(invalidIdentifier('x'.repeat(257))); assert.ok(invalidIdentifier('\0'));
  assert.equal(invalidIdentifier('CTP:abc'),false);
  assert.ok(invalidQuery(new URLSearchParams(Array.from({length:25},(_,i)=>['k'+i,'x']))));
});
test('OTP query uses TransportMode inputs and only verified transit legs become routes', async () => {
  const originalFetch=globalThis.fetch, originalUrl=process.env.OPEN_TRIP_PLANNER_URL;
  process.env.OPEN_TRIP_PLANNER_URL='https://otp.example/otp/gtfs/v1';
  const leg={mode:'WALK',transitLeg:false,distance:100,duration:100,from:{name:'A',lat:10,lon:-84},to:{name:'B',lat:10.1,lon:-84}};
  const itinerary={duration:100,walkDistance:100,numberOfTransfers:0,legs:[leg]};
  try {
    globalThis.fetch=async (_url,init) => {
      assert.match(JSON.parse(init!.body as string).query,/transportModes: \[\{mode: WALK\}, \{mode: TRANSIT\}\]/);
      return Response.json({data:{plan:{itineraries:[itinerary]}}});
    };
    assert.deepEqual(await planWithOtp(leg.from,leg.to,new Date()),[]);
    itinerary.legs=[{...leg,mode:'BUS',transitLeg:true,route:{gtfsId:'feed:route'}} as typeof leg];
    const result=await planWithOtp(leg.from,leg.to,new Date());
    assert.equal(result?.length,1); assert.equal(result?.[0].legs[0].transitLeg,true);
    itinerary.legs=[{...leg,mode:'BUS',transitLeg:true}];
    assert.equal(await planWithOtp(leg.from,leg.to,new Date()),null);
    globalThis.fetch=async()=>new Response('not json');
    assert.equal(await planWithOtp(leg.from,leg.to,new Date()),null);
  } finally {globalThis.fetch=originalFetch;if(originalUrl===undefined)delete process.env.OPEN_TRIP_PLANNER_URL;else process.env.OPEN_TRIP_PLANNER_URL=originalUrl;}
});

test('OTP bounds response bytes and falls back on oversized upstream data', async () => {
  const fetchBefore=globalThis.fetch, endpointBefore=process.env.OPEN_TRIP_PLANNER_URL;
  process.env.OPEN_TRIP_PLANNER_URL='http://localhost/otp';
  globalThis.fetch=async()=>new Response(' '.repeat(2*1024*1024+1));
  try { assert.equal(await planWithOtp({lat:10,lon:-84},{lat:10.1,lon:-84},new Date()),null); }
  finally {globalThis.fetch=fetchBefore;if(endpointBefore===undefined)delete process.env.OPEN_TRIP_PLANNER_URL;else process.env.OPEN_TRIP_PLANNER_URL=endpointBefore;}
});
