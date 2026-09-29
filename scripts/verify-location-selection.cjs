/* eslint-disable @typescript-eslint/no-require-imports -- Matches the optional browser runner. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const base = process.env.APP_URL || 'http://127.0.0.1:3100';
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    for (const touch of [false, true]) {
      const context = await browser.newContext({
        viewport: { width: touch ? 390 : 1280, height: 844 },
        hasTouch: touch, isMobile: touch,
        geolocation: { latitude: 9.9281, longitude: -84.0907 }, permissions: ['geolocation'],
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const choose = async locator => touch ? locator.tap() : locator.click();
      await page.goto(base, { waitUntil: 'domcontentloaded' });
      if (process.env.REQUIRE_DEPLOYED_FIX) {
        const sources = await page.locator('script[src]').evaluateAll(nodes => nodes.map(node => node.src));
        const bundles = await Promise.all(sources.map(async source => (await context.request.get(source)).text()));
        assert.ok(bundles.some(text => text.includes('Error al procesar la ubicación de origen')), 'deployment must contain the selection fix');
      }
      await choose(page.getByRole('button', { name: 'Abrir menú' }));
      const input = page.getByRole('combobox', { name: 'Escribe el destino...' });
      const search = page.getByRole('button', { name: 'Buscar Ruta', exact: true });
      await input.fill('Cartago');
      await page.getByRole('option').first().waitFor({ timeout: 30000 });
      assert.equal(await search.count(), 0, 'typing must not select a destination');
      await choose(page.getByRole('option').filter({ hasText: 'Cartago - Cartago' }).first());
      await search.waitFor();
      await page.waitForFunction(() => document.querySelectorAll('.custom-destination-marker').length > 0);
      assert.equal(await input.inputValue(), 'Cartago');
      assert.equal(await search.isEnabled(), true);
      await page.waitForTimeout(800);
      assert.equal(await page.getByRole('option').count(), 0, 'selection must close and suppress suggestions');
      await input.fill('Heredia');
      assert.equal(await search.count(), 0, 'editing must invalidate selection');
      await page.waitForFunction(() => document.querySelectorAll('.custom-destination-marker').length === 0);
      await page.getByRole('option').filter({ hasText: 'Heredia - Heredia' }).first().waitFor();
      await choose(page.getByRole('option').filter({ hasText: 'Heredia - Heredia' }).first());
      await search.waitFor();
      await choose(page.getByRole('button', { name: 'Borrar ubicación' }));
      assert.equal(await input.inputValue(), '');
      assert.equal(await search.count(), 0, 'clearing must invalidate selection');
      await input.fill('Heredia');
      await page.getByRole('option').filter({ hasText: 'Heredia - Heredia' }).first().waitFor();
      await input.press('ArrowDown');
      await input.press('Enter');
      await search.waitFor();
      await page.waitForFunction(() => document.querySelectorAll('.custom-destination-marker').length > 0);
      await choose(page.getByRole('switch', { name: 'Mi ubicación' }));
      const origin = page.getByRole('combobox', { name: 'Escribe el lugar de origen...' });
      await origin.fill('San Pedro');
      const originOption = page.getByRole('option').filter({ hasText: 'San Pedro - Montes de Oca' }).first();
      await originOption.waitFor();
      await choose(originOption);
      assert.equal(await origin.inputValue(), 'San Pedro');
      await page.waitForTimeout(800);
      assert.equal(await page.getByRole('option').count(), 0, 'origin selection must keep dropdown closed');
      await origin.fill('San Pedr');
      await page.getByRole('option').first().waitFor();
      await origin.press('Escape');
      await choose(search);
      await page.getByText('Por favor selecciona un origen de la lista', { exact: true }).waitFor();
      await choose(page.getByRole('switch', { name: 'Mi ubicación' }));
      // The real request is observed without intercepting the production API.
      const request = page.waitForRequest(r => r.url().includes('/api/best-route?'), { timeout: 30000 });
      await choose(search);
      const params = new URL((await request).url()).searchParams;
      assert.equal(params.get('destLat'), '10.002');
      assert.equal(params.get('destLon'), '-84.117');
      assert.equal(params.get('originLat'), '9.9281');
      assert.equal(params.get('originLon'), '-84.0907');
      assert.deepEqual(errors, []);
      console.log(JSON.stringify({ base, touch, selection: 'pass', marker: 'pass', button: 'pass', routeRequest: 'pass', coordinates: Object.fromEntries(params) }));
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
