/* eslint-disable @typescript-eslint/no-require-imports -- Optional runner, same setup as verify-mobile.cjs. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const base = process.env.APP_URL || 'http://127.0.0.1:3100';
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const api = await browser.newContext();
    const get = async path => {
      const response = await api.request.get(base + path, { timeout: 120000 });
      assert.equal(response.status(), 200, path);
      return response.json();
    };
    const gtfs = await get('/api/stops?source=GTFS&limit=20');
    const ctp = await get('/api/stops?source=CTP&limit=20');
    assert.equal(gtfs.total, 88); assert.equal(ctp.total, 38657); assert.equal(ctp.ctpAvailable, true);
    assert.ok(ctp.stops.every(s => s.source === 'CTP' && s.hasRouteData === false && s.routeCount === 0));
    const second = await get('/api/stops?source=CTP&offset=20&limit=20');
    assert.ok(second.stops.every(s => !ctp.stops.some(first => first.id === s.id)));
    assert.equal(second.hasMore, true);
    for (const query of ['Pital', 'San Carlos', 'Ciudad Quesada']) {
      const data = await get(`/api/stops?source=CTP&search=${encodeURIComponent(query)}&limit=20`);
      if (query === 'Pital') { assert.equal(data.stops[0].district, 'Pital'); assert.equal(data.stops[0].canton, 'San Carlos'); }
      if (query === 'San Carlos') assert.equal(data.stops[0].canton, 'San Carlos');
      assert.ok(data.total > 0, query); assert.ok(data.stops.length <= 20);
      assert.ok(data.stops.every(s => [s.name,s.province,s.canton,s.district].some(label => label?.toLowerCase().includes(query.toLowerCase()))));
      console.log(JSON.stringify({ search: query, total: data.total, example: data.stops[0].name }));
    }
    for (const [lat,lon] of [[9.9281,-84.0907],[10.002,-84.117],[10.3275,-84.4372],[10.6324,-85.4363]]) {
      for (const query of [`lat=${lat}&lon=${lon}&radius=5`, `bbox=${lat-0.02},${lon-0.02},${lat+0.02},${lon+0.02}`]) {
        const data = await get(`/api/stops?${query}&limit=100`);
        assert.equal(data.ctpAvailable, true); assert.ok(data.stops.some(s => s.source === 'CTP')); assert.ok(data.stops.length <= 100);
      }
    }
    const pair = '/api/best-route?originLat=9.9281&originLon=-84.0907&destLat=10.0163&destLon=-84.2119';
    const covered = await get(pair + '&departAfter=04:00:00');
    assert.ok(covered.routes.length > 0); assert.equal(covered.routingSource, 'gtfs-local');
    assert.ok(covered.routes.every(r => r.durationSource === 'gtfs_schedule' && r.departTime && r.arriveTime && r.stops.length > 1));
    const late = await get(pair + '&departAfter=23:59:00');
    assert.deepEqual(late.routes, []); assert.equal(late.reason, 'no_scheduled_trip');
    const uncovered = await get('/api/best-route?originLat=10.3275&originLon=-84.4372&destLat=10.452&destLon=-84.273');
    assert.deepEqual(uncovered.routes, []); assert.equal(uncovered.reason, 'no_coverage'); assert.match(uncovered.message, /paradas registradas/);
    console.log(JSON.stringify({ base, gtfs: gtfs.total, ctp: ctp.total, coveredRoutes: covered.routes.length, coveredDeparture: covered.routes[0].departTime, noScheduledTrip: late.reason, noCoverage: uncovered.message }));
    await api.close();

  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
