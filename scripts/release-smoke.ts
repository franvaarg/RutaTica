/** Run only against an explicitly selected disposable or reviewed read-only snapshot. */
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { db } from '../src/lib/db';
import { GET as stops } from '../src/app/api/stops/route';
import { GET as nearest } from '../src/app/api/nearest-stop/route';
import { GET as routes } from '../src/app/api/routes/route';
import { GET as search } from '../src/app/api/routes/search/route';
import { GET as nearby } from '../src/app/api/routes/nearby/route';
import { GET as planner } from '../src/app/api/best-route/route';
import { GET as companies } from '../src/app/api/companies/route';
import { GET as download } from '../src/app/api/download/route';
import { GET as trip } from '../src/app/api/trip/[tripId]/route';
import { GET as shape } from '../src/app/api/shape/[shapeId]/route';
import { GET as fare } from '../src/app/api/fare/[routeId]/route';
async function main() {
  assert.ok(process.env.DATABASE_URL,'Explicit DATABASE_URL required');
  delete process.env.OPEN_TRIP_PLANNER_URL;
  for(const [handler,url] of [[stops,'stops?limit=2'],[nearest,'nearest-stop?lat=9.9281&lon=-84.0907'],[routes,'routes?limit=2'],[search,'routes/search?q=San'],[nearby,'routes/nearby?lat=9.9281&lon=-84.0907'],[companies,'companies']] as const){
    const start=performance.now();const r=await handler(new NextRequest(`http://localhost/api/${url}`));assert.equal(r.status,200,url);
    console.log(JSON.stringify({url,status:r.status,ms:Math.round(performance.now()-start),bytes:(await r.text()).length}));
  }
  for(const [handler,key,id] of [[trip,'tripId','T101A_WD'],[shape,'shapeId','SH101A'],[fare,'routeId','R101']] as const){
    const response=await (handler as typeof trip)(new NextRequest('http://localhost/api/probe'),{params:Promise.resolve({[key]:id})} as never);assert.equal(response.status,200);
    console.log(JSON.stringify({endpoint:key,status:response.status}));
  }
  for(const url of ['stops?lat=NaN&lon=0','stops?limit=1000','stops?bbox=10,-85,9,-84'])assert.equal((await stops(new NextRequest(`http://localhost/api/${url}`))).status,400);
  assert.equal((await download(new NextRequest('http://localhost/api/download?file=../.env'))).status,400);
  const forward=await planner(new NextRequest('http://localhost/api/best-route?originLat=9.9281&originLon=-84.0907&destLat=10.0163&destLon=-84.2119&departAfter=04:00:00'));
  const data=await forward.json();assert.equal(forward.status,200);assert.ok(data.routes.length>0,'Representative GTFS route');
  assert.equal(data.routingSource,'gtfs-local');assert.ok(data.routes.every((r:any)=>Number.isFinite(r.totalTimeMinutes)&&r.totalTimeMinutes>0));
  console.log(JSON.stringify({representativeRouteCount:data.routes.length,source:data.routingSource}));
  const reverse=await planner(new NextRequest('http://localhost/api/best-route?originLat=10.0163&originLon=-84.2119&destLat=9.9281&destLon=-84.0907&departAfter=04:00:00'));
  const reversed=await reverse.json();assert.ok(reversed.routes.length>0,'Reverse GTFS trip must not use route-level sequence');
  console.log(JSON.stringify({reverseRouteCount:reversed.routes.length}));
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>db.$disconnect());
