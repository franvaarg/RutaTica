/* eslint-disable @typescript-eslint/no-require-imports -- Optional browser runner. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const base = process.env.APP_URL || 'http://127.0.0.1:3100';
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    for (const mobile of [false, true]) {
      const context = await browser.newContext({ viewport: { width: mobile ? 390 : 1280, height: 900 }, isMobile: mobile, hasTouch: mobile });
      const page = await context.newPage();
      page.setDefaultTimeout(60000);
      const destination = page.getByRole('combobox', { name: 'Escribe el destino...' });
      const route = page.getByRole('button', { name: 'Buscar Ruta', exact: true });
      const save = page.getByRole('button', { name: 'Guardar ubicación', exact: true });
      const clean = async () => {
        assert.equal(await destination.count(), 0);
        assert.equal(await route.count(), 0);
        assert.equal(await save.count(), 0);
      };
      await page.goto(base, { waitUntil: 'domcontentloaded' });
      await page.locator('.leaflet-container').waitFor();
      await clean();
      await page.getByRole('button', { name: 'Abrir menú' }).click();
      await clean();
      await page.getByRole('button', { name: 'Planificar ruta', exact: true }).click();
      await destination.fill('Cartago');
      await page.getByRole('option').filter({ hasText: 'Cartago - Cartago' }).first().click();
      assert.equal(await route.count(), 0, 'destination with unavailable GPS cannot plan');
      await save.click();
      await page.waitForFunction(() => JSON.parse(localStorage.getItem('rutatica.localities') || '[]').length === 1);
      await page.getByRole('switch', { name: 'Mi ubicación' }).click();
      const origin = page.getByRole('combobox', { name: 'Escribe el lugar de origen...' });
      await origin.fill('San Pedro');
      await page.getByRole('option').filter({ hasText: 'San Pedro - Montes de Oca' }).first().click();
      assert.equal(await route.isEnabled(), true);
      await origin.fill('San Pedr');
      assert.equal(await route.count(), 0);
      await page.getByRole('option').first().waitFor();
      await origin.press('Escape');
      await page.getByRole('button', { name: 'Volver al mapa', exact: true }).click();
      await clean();
      await page.getByRole('button', { name: 'Abrir menú' }).click();
      await clean();
      await page.getByRole('button', { name: 'Ir a Cartago', exact: true }).click();
      assert.equal(await destination.inputValue(), 'Cartago', 'saved destination explicitly opens planning');
      assert.equal(await route.count(), 0, 'saved destination still requires an origin');
      await context.close();
      console.log(JSON.stringify({ base, mobile, defaultMap: 'pass', missingGPS: 'pass', validEndpoints: 'pass', savedPlace: 'pass', returnToMap: 'pass' }));
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
