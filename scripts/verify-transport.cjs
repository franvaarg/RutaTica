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
    assert.deepEqual(uncovered.routes, []); assert.equal(uncovered.reason, 'no_coverage'); assert.match(uncovered.message, /paradas oficiales registradas/);
    console.log(JSON.stringify({ base, gtfs: gtfs.total, ctp: ctp.total, coveredRoutes: covered.routes.length, coveredDeparture: covered.routes[0].departTime, noScheduledTrip: late.reason, noCoverage: uncovered.message }));
    await api.close();
    for (const touch of [false,true]) {
      const context = await browser.newContext({ viewport: { width: touch ? 390 : 1280, height: 844 }, hasTouch: touch, isMobile: touch,
        geolocation: { latitude: 9.9281, longitude: -84.0907 }, permissions: ['geolocation'] });
      const page = await context.newPage(); const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const choose = locator => touch ? locator.tap() : locator.click();
      await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await page.locator('.leaflet-marker-icon[title^="GTFS:"]').first().waitFor({ timeout: 60000 });
      await page.locator('.leaflet-marker-icon[title^="CTP:"]').first().waitFor({ timeout: 60000 });
      const gamGtfsMarkers = await page.locator('.leaflet-marker-icon[title^="GTFS:"]').count();
      await choose(page.getByRole('button', { name: 'Abrir menú' }));
      const coveredInput = page.getByRole('combobox', { name: 'Escribe el destino...' });
      await coveredInput.fill('Alajuela');
      const coveredSuggestion = page.getByRole('option').filter({ hasText: 'Alajuela - Alajuela' }).first();
      await coveredSuggestion.waitFor({ timeout: 60000 });
      await choose(coveredSuggestion);
      const currentScheduleResponse = page.waitForResponse(r => r.url().includes('/api/best-route?'), { timeout: 60000 });
      await choose(page.getByRole('button', { name: 'Buscar Ruta', exact: true }));
      const currentResponse = await currentScheduleResponse;
      assert.equal(currentResponse.status(), 200);
      const currentResult = await currentResponse.json();
      if (currentResult.routes.length === 0) {
        assert.equal(currentResult.reason, 'no_scheduled_trip');
        await page.getByText('Sin viajes programados a esta hora', { exact: true }).waitFor();
      }
      await context.setGeolocation({ latitude: 10.3275, longitude: -84.4372 });
      await page.reload({ waitUntil: 'domcontentloaded' });
      const markers = page.locator('.leaflet-marker-icon[title^="CTP:"]');
      await markers.first().waitFor({ timeout: 60000 });
      assert.ok(await markers.count() <= 100);
      await choose(markers.first());
      await page.getByText('Parada oficial registrada por CTP.', { exact: false }).waitFor();
      await choose(page.getByRole('button', { name: 'Abrir menú' }));
      const input = page.getByRole('combobox', { name: 'Escribe el destino...' });
      await input.fill('Pital');
      const suggestion = page.getByRole('option').filter({ hasText: 'CTP · sin ruta/horario disponible' }).first();
      await suggestion.waitFor({ timeout: 60000 });
      await choose(suggestion);
      await page.waitForFunction(() => document.querySelector('.custom-destination-marker'));
      const routeResponse = page.waitForResponse(r => r.url().includes('/api/best-route?'), { timeout: 60000 });
      await choose(page.getByRole('button', { name: 'Buscar Ruta', exact: true }));
      const response = await routeResponse; assert.equal(response.status(), 200);
      const result = await response.json(); assert.deepEqual(result.routes, []); assert.equal(result.reason, 'no_coverage');
      const params = new URL(response.url()).searchParams;
      assert.equal(params.get('originLat'), '10.3275'); assert.equal(params.get('originLon'), '-84.4372');
      await page.getByText(result.message, { exact: false }).waitFor({ timeout: 30000 });
      assert.equal(await page.getByText('Error al buscar rutas. Por favor intenta de nuevo.', { exact: true }).count(), 0);
      await choose(page.getByRole('button', { name: 'Ver mapa / cerrar resultados' }));
      await choose(page.getByRole('button', { name: 'Acercar', exact: true }));
      await choose(page.getByRole('button', { name: 'Acercar', exact: true }));
      // Selection moved the viewport to Pital; these are new area-bounded results.
      await markers.first().waitFor({ timeout: 60000 });
      assert.deepEqual(errors, []);
      console.log(JSON.stringify({ base, touch, gamGtfsMarkers, ctpMarkers: await markers.count(), pitalSelection: 'pass', noCoverageUi: 'pass', destination: { lat: params.get('destLat'), lon: params.get('destLon') } }));
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
