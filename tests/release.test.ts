import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { serviceDateTime, activeServices } from '../src/lib/service-date';
import { timeToMinutes, minutesToTime, getNextDepartureTime } from '../src/lib/time-utils';
import { slicePathBetween, pathDistanceKm } from '../src/lib/spatial';
import { invalidQuery } from '../src/lib/api-validation';
import { GET as download } from '../src/app/api/download/route';
import { planWithOtp } from '../src/lib/otp-client';

test('service date remains Costa Rican across UTC midnight', () => {
  assert.deepEqual(serviceDateTime(new Date('2026-09-08T02:30:00Z')), { date: '2026-09-07', compactDate: '20260907', time: '20:30:00', weekday: 'monday' });
});
test('exceptions add and remove services including calendar-free additions', () => {
  const calendars = [{ service_id: 'base', start_date: '20260101', end_date: '20261231', monday: true }, { service_id: 'expired', start_date: '20240101', end_date: '20241231', monday: true }];
  assert.deepEqual(activeServices(calendars, [ { service_id: 'base', date: '20260907', exception_type: 2 }, { service_id: 'special', date: '20260907', exception_type: 1 } ], new Date('2026-09-08T02:30:00Z')), ['special']);
});
test('GTFS times support midnight rollover and reject malformed times', () => {
  assert.equal(timeToMinutes('25:30:00'), 1530);
  assert.equal(timeToMinutes('9:05:00'), 545);
  assert.ok(Number.isNaN(timeToMinutes('12:99:00')));
  assert.equal(minutesToTime(59.999), '01:00:00');
  assert.equal(getNextDepartureTime([{ departure_time: '08:00:00' }], '09:00:00'), null);
});
test('shape clipping excludes unrelated route endpoints', () => {
  const points = [0,1,2,3,4].map(n => ({ lat: 10, lon: -84 + n * 0.01 }));
  assert.deepEqual(slicePathBetween(points, points[1], points[3]), points.slice(1,4));
  assert.ok(pathDistanceKm(points.slice(1,4)) < pathDistanceKm(points));
});
test('query validation rejects abuse and preserves valid zero coordinates', () => {
  for (const q of ['lat=NaN&lon=0', 'lat=91&lon=0', 'lat=1junk&lon=0', 'limit=-1', 'offset=1.5', 'radius=Infinity', 'limit=1&limit=2', 'lat=1']) assert.equal(invalidQuery(new URLSearchParams(q)), true, q);
  assert.equal(invalidQuery(new URLSearchParams('lat=0&lon=0&limit=20')), false);
});
test('download allowlist rejects traversal, absolute paths and prototype keys', async () => {
  for (const file of ['../.env', '/etc/passwd', '..\\.env', '%2e%2e%2f.env', 'constructor', '__proto__']) {
    const result = await download(new NextRequest(`http://localhost/api/download?file=${encodeURIComponent(file)}`));
    assert.equal(result.status, 400, file);
  }
});
test('OTP unavailable, malformed and empty responses never throw', async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.OPEN_TRIP_PLANNER_URL;
  process.env.OPEN_TRIP_PLANNER_URL = 'https://otp.example/otp/gtfs/v1';
  try {
    globalThis.fetch = async () => { throw new Error('network failure'); };
    assert.equal(await planWithOtp({lat:10,lon:-84}, {lat:11,lon:-84}, new Date()), null);
    for (const payload of [{}, {data:{plan:{itineraries:[{legs:[]}]}}}]) {
      globalThis.fetch = async () => Response.json(payload);
      assert.equal(await planWithOtp({lat:10,lon:-84}, {lat:11,lon:-84}, new Date()), null);
    }
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(init!.body as string);
      assert.equal(body.variables.date, '2026-09-07');
      assert.equal(body.variables.time, '20:30:00');
      return Response.json({data:{plan:{itineraries:[]}}});
    };
    assert.deepEqual(await planWithOtp({lat:10,lon:-84}, {lat:11,lon:-84}, new Date('2026-09-08T02:30:00Z')), []);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.OPEN_TRIP_PLANNER_URL;
    else process.env.OPEN_TRIP_PLANNER_URL = originalUrl;
  }
});

test('malformed OTP polylines are rejected', async () => {
  const { decodePolyline } = await import('../src/lib/otp-client');
  assert.throws(() => decodePolyline('_'));
  assert.throws(() => decodePolyline('????????\u0001'));
  assert.deepEqual(decodePolyline('??'), [{lat:0,lon:0}]);
});

test('SQLite URLs resolve relative to the schema without a development machine path', async () => {
  const { databaseUrl } = await import('../src/lib/environment');
  assert.equal(databaseUrl('file:../db/custom.db', '/app'), 'file:/app/db/custom.db');
  assert.throws(() => databaseUrl('postgresql://example'));
  assert.throws(() => databaseUrl('file:'));
});

test('shape distances clip loops and interpolate endpoints regardless of feed units', async () => {
  const { slicePathByDistance } = await import('../src/lib/spatial');
  const points = [{lat:10,lon:-84,distance:0},{lat:10,lon:-83,distance:1000},{lat:10,lon:-84,distance:2000}];
  assert.deepEqual(slicePathByDistance(points, 500, 1500), [{lat:10,lon:-83.5},{lat:10,lon:-83},{lat:10,lon:-83.5}]);
  assert.equal(slicePathByDistance(points, 1500, 500), null);
  assert.equal(slicePathByDistance([{...points[0],distance:null},points[1]], 0, 1000), null);
});
