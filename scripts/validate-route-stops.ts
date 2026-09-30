import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { db } from '../src/lib/db';
import { pointToPolylineKm } from '../src/lib/route-corridor';
const base=process.env.APP_URL || 'http://127.0.0.1:3100';
const samples=[
 ['San José',9.9281,-84.0907],['Heredia',10.002,-84.117],['Alajuela',10.0163,-84.2119],
 ['Ciudad Quesada',10.3275,-84.4372],['Pital',10.4535,-84.2749],['Liberia',10.6324,-85.4363],
 ['Puntarenas',9.9763,-84.8384],['Limón',9.991,-83.036],['Cartago',9.8644,-83.9194],
] as const;
async function get(path:string) { const r=await fetch(base+path,{signal:AbortSignal.timeout(120000)});assert.equal(r.status,200,path);return r.json(); }
async function main() {
 const report: Array<{ location: string; physicalStops: number; gtfsStopsReturned: number; aresepRoutesReturned: number; aresepHasMore: boolean; corridorCount: number | null }> = [];
 for(const [location,lat,lon] of samples) {
  const bbox=[lat-.02,lon-.02,lat+.02,lon+.02].join(',');
  const physical=await get(`/api/stops?bbox=${bbox}&limit=100`);
  assert.ok(physical.stops.length<=100); assert.ok(physical.stops.some((s:any)=>s.source==='CTP'));
  const discovery=await get(`/api/aresep?bbox=${bbox}`);
  assert.ok(discovery.routes.length<=8);
  let corridorCount:number|null=null;
  if(discovery.routes.length) {
   const selected=await get(`/api/aresep?id=${discovery.routes[0].id}`);
   assert.ok(selected.stops.length<=500);
   assert.equal(selected.total,discovery.routes[0].nearbyStopCount);
   for(const stop of selected.stops) {
    assert.equal(stop.source,'CTP');assert.equal(stop.relationship,'Cercana al recorrido ARESEP');
    assert.ok(selected.route.paths.some((path:any)=>pointToPolylineKm(stop,path)<=selected.radiusKm));
    assert.equal(stop.stopSequence,undefined);assert.equal(stop.departureTime,undefined);
   }
   corridorCount=selected.total;
  }
  const row={location,physicalStops:physical.total,gtfsStopsReturned:physical.stops.filter((s:any)=>s.source==='GTFS').length,aresepRoutesReturned:discovery.routes.length,aresepHasMore:discovery.hasMore,corridorCount};
  report.push(row);console.log(JSON.stringify(row));
 }
 for(const reverse of [false,true]) {
  const a=reverse?[10.0163,-84.2119]:[9.9281,-84.0907],b=reverse?[9.9281,-84.0907]:[10.0163,-84.2119];
  const data=await get(`/api/best-route?originLat=${a[0]}&originLon=${a[1]}&destLat=${b[0]}&destLon=${b[1]}&departAfter=04:00:00`);
  assert.ok(data.routes.length);
  for(const route of data.routes) {
   const trips=[...new Set<string>(route.stops.map((s:any)=>s.tripId))];
   for(const tripId of trips) {
    const calls=route.stops.filter((s:any)=>s.tripId===tripId);
    const actual=await db.gtfsStopTime.findMany({where:{trip_id:tripId,stop_sequence:{gte:calls[0].stopSequence,lte:calls.at(-1).stopSequence}},orderBy:{stop_sequence:'asc'}});
    assert.deepEqual(calls.map((s:any)=>s.stopId),actual.map(s=>s.stop_id));
    assert.deepEqual(calls.map((s:any)=>s.stopSequence),actual.map(s=>s.stop_sequence));
    assert.equal(calls[0].role,'boarding');assert.equal(calls.at(-1).role,'alighting');
   }
  }
  console.log(JSON.stringify({reverse,verifiedItineraries:data.routes.length}));
 }
 await writeFile('/tmp/rutatica-route-stops-nationwide.json',JSON.stringify(report,null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>db.$disconnect());
