import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pointToPolylineKm, corridorBounds } from '../src/lib/route-corridor';
import { mapPlannedRoutes } from '../src/lib/planned-route';

test('corridor uses distance to segment, including endpoints and separate paths', () => {
  const path = [{lat:10,lon:-84},{lat:10,lon:-83.9}];
  assert.ok(pointToPolylineKm({lat:10.001,lon:-83.95},path) < .15);
  assert.ok(pointToPolylineKm({lat:10.002,lon:-83.95},path) > .15);
  assert.ok(pointToPolylineKm({lat:10,lon:-83.89},path) > 1);
  assert.equal(pointToPolylineKm(path[0],[path[0],path[0]]),0);
  const bounds=corridorBounds([path],.15);
  assert.ok(bounds[0]<10&&bounds[2]>10&&bounds[1]<-84&&bounds[3]>-83.9);
  assert.equal(pointToPolylineKm(path[0],[]),Infinity);
});

test('adapter preserves actual GTFS calls with loops, trip sequence and transfer roles', () => {
  const stops=[
    {name:'A',lat:10,lon:-84,tripId:'one',stopId:'A',stopSequence:4,role:'boarding',departureTime:'25:00:00',source:'GTFS'},
    {name:'A',lat:10,lon:-84,tripId:'one',stopId:'A',stopSequence:8,role:'intermediate',arrivalTime:'25:10:00',source:'GTFS'},
    {name:'X',lat:10.1,lon:-84,tripId:'one',stopSequence:9,role:'alighting',source:'GTFS'},
    {name:'X',lat:10.1,lon:-84,tripId:'two',stopSequence:1,role:'boarding',source:'GTFS'},
    {name:'B',lat:10.2,lon:-84,tripId:'two',stopSequence:3,role:'alighting',source:'GTFS'},
  ];
  const [route]=mapPlannedRoutes([{stops}], 'gtfs-local');
  assert.deepEqual(route._stops,stops);
  assert.equal(route.price,null);
  assert.equal(route.geometryAvailable,false);
});

import { getAresepRoutes, getCorridorStops } from '../src/lib/aresep';
import type { PrismaClient } from '../src/lib/db';
import { GET as discover } from '../src/app/api/aresep/route';
import { NextRequest } from 'next/server';

test('ARESEP preserves separate paths and rejects source coordinates without WGS84 conversion', async t => {
  const feature={attributes:{OBJECTID_1:7,CODCTP2019:'7',OPERADOR:'Official operator',RUTACTP2019:'Official ramal'},geometry:{paths:[[[-84,10],[-83.99,10]],[[-83.97,10],[-83.96,10]]]}};
  t.mock.method(globalThis,'fetch',async (url:string)=>{
    const parsed=new URL(url);
    assert.equal(parsed.searchParams.get('outSR'),'4326');
    assert.equal(parsed.searchParams.get('objectIds'),'7');
    return Response.json({features:[feature]});
  });
  const {routes}=await getAresepRoutes(undefined,'7');
  assert.equal(routes[0].paths.length,2);
  assert.equal(routes[0].description,'Official ramal');
  const client = { ctpStop: { findMany: async (query:any)=>{
    assert.ok(query.where.lat.gte<10&&query.where.lat.lte>10);
    assert.ok(query.where.lon.gte<-84&&query.where.lon.lte>-83.96);
    // No premature limit before precise filtering; the gap is not part of either path.
    assert.equal(query.take,undefined);
    return [
      {identityKey:'near',name:'Physical',lat:10.0005,lon:-83.995,province:null,canton:null,district:null},
      {identityKey:'gap',name:'Gap',lat:10,lon:-83.98,province:null,canton:null,district:null},
      {identityKey:'far',name:'Far',lat:10.002,lon:-83.995,province:null,canton:null,district:null},
    ];
  } } } as unknown as PrismaClient;
  const result=await getCorridorStops(routes[0],client);
  assert.equal(result.total,1);assert.equal(result.stops[0].id,'CTP:near');
  assert.equal(result.stops[0].relationship,'Cercana al recorrido ARESEP');
  assert.equal('stopSequence' in result.stops[0],false);
  feature.geometry.paths=[[[500000,1100000],[500001,1100001]]];
  await assert.rejects(getAresepRoutes(undefined,'7'),/Invalid WGS84/);
});

test('discovery requires a bounded viewport or validated official object ID',async()=>{
  for(const query of ['', '?bbox=8,-86,12,-82','?id=1%20OR%201=1','?bbox=10,-84,9,-83']) {
    assert.equal((await discover(new NextRequest(`http://localhost/api/aresep${query}`))).status,400);
  }
});

import { usableTripShape } from '../src/lib/spatial';
test('obvious shape coordinate jumps use honest stop-sequence fallback',()=>{
 const stops=[{lat:10,lon:-84},{lat:10.01,lon:-84.1}];
 assert.equal(usableTripShape(stops,stops),true);
 assert.equal(usableTripShape([stops[0],{lat:9,lon:-84.05},stops[1]],stops),false);
});
