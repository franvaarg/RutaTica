/* eslint-disable @typescript-eslint/no-require-imports -- Optional CommonJS browser runner. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const base = process.env.APP_URL || 'http://127.0.0.1:3100';
(async () => {
 const browser = await chromium.launch({headless:true,args:['--no-sandbox']});
 try {
  for (const mobile of (process.env.MOBILE_ONLY ? [true] : [false,true])) {
   const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:900},hasTouch:mobile,geolocation:{latitude:9.9281,longitude:-84.0907},permissions:['geolocation']});
   const page=await context.newPage(), errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   const scheduled=await context.request.get(base+'/api/best-route?originLat=9.9281&originLon=-84.0907&destLat=10.0163&destLon=-84.2119&departAfter=04:00:00',{timeout:120000});
   assert.equal(scheduled.status(),200);
   let data=await scheduled.json();assert.ok(data.routes.length);
   // Use a real selected trip at a fixed valid departure time, independent of test wall clock.
   await page.route('**/api/best-route?**',async r=>{
     const url=new URL(r.request().url());url.searchParams.set('departAfter','04:00:00');
     const response=await r.fetch({url:url.toString(),timeout:120000});assert.equal(response.status(),200);
     data=await response.json();assert.ok(data.routes.length);await r.fulfill({response,json:data});
   });
   await page.goto(base,{waitUntil:'domcontentloaded',timeout:120000});
   await page.locator('.leaflet-marker-icon[title^="CTP:"]').first().waitFor({timeout:90000});
   await page.getByRole('button',{name:'Abrir menú'}).click();
   await page.waitForTimeout(700);
   await page.screenshot({path:`/tmp/rutatica-menu-${mobile?'mobile':'desktop'}.png`});
   await page.getByRole('switch',{name:'Mi ubicación'}).click();
   await page.getByRole('combobox',{name:'Escribe el lugar de origen...'}).fill('San José');
   await page.getByRole('option').filter({hasText:'San José - San José'}).first().click({timeout:60000});
   await page.getByRole('combobox',{name:'Escribe el destino...'}).fill('Alajuela');
   await page.getByRole('option').filter({hasText:'Alajuela - Alajuela'}).first().click({timeout:60000});
   await page.getByRole('button',{name:'Buscar Ruta',exact:true}).click();
   await page.locator('.leaflet-marker-icon[title^="Sube aquí:"]').first().waitFor({timeout:60000});
   await page.locator('[role="button"][aria-pressed="true"]').first().click();
   assert.equal(await page.locator('.leaflet-marker-icon[title^="CTP:"]').count(),0);
   assert.equal(await page.locator('.leaflet-marker-icon[title^="GTFS:"]').count(),0);
   const selected=page.locator('.leaflet-marker-icon[title^="Sube aquí:"],.leaflet-marker-icon[title^="Baja aquí:"],.leaflet-marker-icon[title^="Parada GTFS:"]');
   assert.equal(await selected.count(),new Set(data.routes[0].stops.map(s=>`${s.lat},${s.lon}`)).size);
   await page.getByText(/Ver paradas ·/).first().click();
   await page.getByText(/Secuencia/).first().waitFor();
   await page.getByRole('button',{name:'Ver mapa / cerrar resultados'}).click();
   await page.locator('path.leaflet-interactive[stroke="#2563EB"]').first().waitFor();
   assert.ok(await page.locator('.custom-destination-marker').count()>0);
   await page.getByRole('button',{name:'Acercar',exact:true}).click();
   await page.waitForTimeout(1200);
   const zoomed=await page.locator('.leaflet-map-pane').getAttribute('style');
   await page.waitForTimeout(1200);
   assert.equal(await page.locator('.leaflet-map-pane').getAttribute('style'),zoomed,'Map must not snap back');
   await page.getByRole('button',{name:'Alejar',exact:true}).click();
   await page.waitForTimeout(600);
   await page.screenshot({path:`/tmp/rutatica-gtfs-${mobile?'mobile':'desktop'}.png`});
   await selected.first().click();
   await page.locator('.leaflet-popup').getByText('Fuente: GTFS',{exact:true}).waitFor();
   assert.deepEqual(errors,[]);
   console.log(JSON.stringify({mobile,selectedStops:await selected.count(),gtfs:'pass'}));
   // Reload to clear itinerary and exercise live ARESEP discovery and corridor selection.
   // Replay a real bounded ARESEP response: source availability is tested separately nationwide.
   const discoveryResponse=await context.request.get(base+'/api/aresep?bbox=9.91,-84.12,9.95,-84.07',{timeout:120000});
   assert.equal(discoveryResponse.status(),200);
   const officialDiscovery=await discoveryResponse.json();
   await page.route('**/api/aresep?bbox=*',r=>r.fulfill({json:officialDiscovery}));
   await page.reload({waitUntil:'domcontentloaded'});
   await page.getByText(/Recorridos ARESEP en esta área/).click();
   const discovery=page.getByRole('button').filter({hasText:'Ruta / Ramal'}).first();
   await discovery.waitFor({timeout:90000});
   await discovery.click();
   await page.getByText(/Ruta \/ Ramal .* · información/).click();
   await page.getByText(/La cercanía no confirma servicio/).waitFor({timeout:90000});
   await page.getByText(/Ruta \/ Ramal .* · información/).click();
   await page.locator('path.leaflet-interactive[stroke="#2563EB"]').first().waitFor();
   assert.equal(await page.locator('.leaflet-marker-icon[title^="GTFS:"]').count(),0);
   const physical=page.locator('.leaflet-marker-icon[title^="CTP:"]');
   assert.ok(await physical.count()>0&&await physical.count()<=500);
   await physical.first().click();
   await page.locator('.leaflet-popup').getByText('Parada física cercana al recorrido',{exact:true}).waitFor();
   await page.locator('.leaflet-popup').getByText('Cercana al recorrido ARESEP',{exact:true}).waitFor();
   assert.deepEqual(errors,[]);
   await page.waitForTimeout(1000);
   await page.screenshot({path:`/tmp/rutatica-route-stops-${mobile?'mobile':'desktop'}.png`});
   console.log(JSON.stringify({mobile,corridorStops:await physical.count(),aresep:'pass'}));
   await context.close();
  }
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
