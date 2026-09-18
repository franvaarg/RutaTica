/** Read-only release probe. Explicit target required; never migrates/imports. */
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { db } from '../src/lib/db';
import { queryPhysicalStops } from '../src/lib/physical-stops';
import { GET as stopsApi } from '../src/app/api/stops/route';
import { GET as nearestApi } from '../src/app/api/nearest-stop/route';
import { GET as locationsApi } from '../src/app/api/locations/search/route';
import { GET as planner } from '../src/app/api/best-route/route';
import { CTP_ROUTING_NOTICE } from '../src/lib/stop-display';

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('Explicit DATABASE_URL required');
  // Local planner verification must not accidentally query an external OTP server.
  delete process.env.OPEN_TRIP_PLANNER_URL;
  const probe = async (handler: (request: NextRequest) => Promise<Response>, query: string) => {
    const started = performance.now();
    const response = await handler(new NextRequest(`http://localhost${query}`));
    assert.equal(response.status,200);
    const text = await response.text();
    return { body: JSON.parse(text), ms: Math.round((performance.now() - started) * 100) / 100, bytes: Buffer.byteLength(text) };
  };
  const radii: { radiusKm: number; ctp: number; gtfs: number; combined: number; responseStops: number; ms: number; bytes: number }[] = [];
  for (const radius of [1,5,10,25]) {
    const ctp = await queryPhysicalStops({source:'CTP',lat:10.3275,lon:-84.4372,radius,limit:100});
    const gtfs = await queryPhysicalStops({source:'GTFS',lat:10.3275,lon:-84.4372,radius,limit:100});
    const combined = await probe(stopsApi,`/api/stops?lat=10.3275&lon=-84.4372&radius=${radius}&limit=100`);
    assert.equal(combined.body.total,ctp.total+gtfs.total);
    assert.ok(combined.body.stops.every((s: {source:string;hasRouteData:boolean}) => s.source === 'CTP' && !s.hasRouteData));
    radii.push({ radiusKm:radius,ctp:ctp.total,gtfs:gtfs.total,combined:combined.body.total,responseStops:combined.body.stops.length,ms:combined.ms,bytes:combined.bytes });
  }
  assert.ok(radii[0].ctp > 0,'Ciudad Quesada must have actual queryable CTP coverage');
  const bbox = await probe(stopsApi,'/api/stops?bbox=10.32,-84.45,10.34,-84.42&limit=100');
  assert.ok(bbox.body.stops.length > 0);
  assert.ok(bbox.body.stops.every((s: {lat:number;lon:number}) => s.lat >= 10.32 && s.lat <= 10.34 && s.lon >= -84.45 && s.lon <= -84.42));
  const nearest = await probe(nearestApi,'/api/nearest-stop?lat=10.3275&lon=-84.4372&limit=1');
  const search = await probe(locationsApi,'/api/locations/search?type=stop&q=San%20Carlos');
  assert.ok(search.body.locations.some((s: {source:string}) => s.source === 'CTP'));
  const routes = await probe(planner,'/api/best-route?originLat=10.3275&originLon=-84.4372&destLat=10.34&destLon=-84.44');
  assert.deepEqual(routes.body.routes,[]); assert.equal(routes.body.message,CTP_ROUTING_NOTICE);
  const integrity = await db.$queryRawUnsafe('PRAGMA integrity_check');
  assert.deepEqual(integrity,[{integrity_check:'ok'}]);
  const foreignKeys = await db.$queryRawUnsafe<unknown[]>('PRAGMA foreign_key_check'); assert.equal(foreignKeys.length,0);
  const report = { database:process.env.DATABASE_URL,radii,bbox:{total:bbox.body.total,returned:bbox.body.stops.length,ms:bbox.ms,bytes:bbox.bytes},nearest:nearest.body.stops[0],autocomplete:{count:search.body.locations.length,ms:search.ms},ctpOnlyRouting:routes.body,integrity,foreignKeys,
    counts:{ctp:await db.ctpStop.count(),gtfs:await db.gtfsStop.count()},
    queryPlan:await db.$queryRawUnsafe('EXPLAIN QUERY PLAN SELECT identityKey FROM ctp_stops WHERE lat BETWEEN 10.32 AND 10.34 AND lon BETWEEN -84.45 AND -84.42') };
  console.log(JSON.stringify(report, (_key,value) => typeof value === 'bigint' ? Number(value) : value, 2));
}
main().catch(error => { console.error(error); process.exitCode=1; }).finally(() => db.$disconnect());
