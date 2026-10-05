/* eslint-disable @typescript-eslint/no-require-imports -- Optional browser runner. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const base = process.env.APP_URL || 'http://127.0.0.1:3100';
(async () => {
 const browser = await chromium.launch({headless:true,args:['--no-sandbox']});
 try {
  for (const mobile of [false,true]) {
   const context = await browser.newContext({viewport:{width:mobile?390:1280,height:900},isMobile:mobile,hasTouch:mobile,geolocation:{latitude:9.9281,longitude:-84.0907},permissions:['geolocation']});
   const page = await context.newPage(), errors=[];
   page.setDefaultTimeout(60000);
   page.on('pageerror',e=>errors.push(e.message));
   // Shift only departure time: the deployed API still selects all trips and stops.
   // The bundled calendar has morning departures; the test can run at any hour.
   let data;
   await page.route('**/api/best-route?**',async request=>{
    const url=new URL(request.request().url());url.searchParams.set('departAfter','04:00:00');
    const response=await request.fetch({url:url.toString(),timeout:120000});assert.equal(response.status(),200);
    data=await response.json();assert.ok(data.routes.length);await request.fulfill({response,json:data});
   });
   await page.goto(base,{waitUntil:'domcontentloaded',timeout:120000});
   await page.locator('.leaflet-container').waitFor({timeout:120000});
   await page.waitForTimeout(2000);
   assert.equal(await page.locator('.leaflet-marker-icon[title^="CTP:"],.leaflet-marker-icon[title^="GTFS:"],.custom-stop-marker').count(),0,'initial map clean');
   await page.getByRole('button',{name:'Abrir menú'}).click();
   await page.getByRole('switch',{name:'Mi ubicación'}).click();
   await page.getByRole('combobox',{name:'Escribe el lugar de origen...'}).fill('San José');
   await page.getByRole('option').filter({hasText:'San José - San José'}).first().click();
   await page.getByRole('combobox',{name:'Escribe el destino...'}).fill('Alajuela');
   await page.getByRole('option').filter({hasText:'Alajuela - Alajuela'}).first().click();
   await page.getByRole('button',{name:'Guardar localidad',exact:true}).click();
   await page.reload({waitUntil:'domcontentloaded'});
   await page.locator('.leaflet-container').waitFor({timeout:120000});
   await page.getByRole('button',{name:'Abrir menú'}).click();
   await page.getByRole('button',{name:'Ir a Alajuela',exact:true}).click();
   assert.equal(await page.getByRole('combobox',{name:'Escribe el destino...'}).inputValue(),'Alajuela');
   // Reload also validates current-location origin rather than a persisted test origin.
   await page.getByRole('button',{name:'Buscar Ruta',exact:true}).click();
   await page.locator('.leaflet-marker-icon[title^="Sube aquí:"]').first().waitFor({timeout:120000});
   const route=data.routes[0];
   assert.ok(route.alightingStop.name.includes('Alajuela'));
   assert.ok(!/plantel|dep[oó]sito/i.test(route.boardingStop.name+' '+route.alightingStop.name));
   assert.ok(route.totalTimeMinutes>0 && route.durationSource==='gtfs_schedule');
   assert.ok(route.stops.some(stop=>stop.role==='intermediate'));
   assert.equal(await page.locator('.leaflet-marker-icon[title^="CTP:"],.leaflet-marker-icon[title^="GTFS:"]').count(),0);
   assert.equal(await page.locator('.leaflet-marker-icon[title^="Sube aquí:"],.leaflet-marker-icon[title^="Baja aquí:"],.leaflet-marker-icon[title^="Parada GTFS:"]').count(),new Set(route.stops.map(s=>`${s.lat},${s.lon}`)).size);
   await page.locator('path.leaflet-interactive[stroke="#2563EB"]').first().waitFor();
   await page.getByText(/Ver paradas ·/).first().click();
   await page.getByText(/Secuencia/).first().waitFor();
   await page.getByRole('button',{name:'Iniciar Viaje',exact:true}).click();
   await page.getByRole('button',{name:'Iniciar ahora',exact:true}).click();
   await page.getByText('Viaje en curso',{exact:true}).last().waitFor();
   const progress=page.getByRole('status').filter({hasText:'Próxima parada:'}).last();
   await progress.waitFor();
   assert.match(await progress.innerText(),/Tiempo restante estimado: \d+ min/);
   assert.match(await progress.innerText(),/Destino: Alajuela/);
   const first=route.stops[0];
   await context.setGeolocation({latitude:first.lat,longitude:first.lon});
   await page.waitForFunction(name=>[...document.querySelectorAll('[role="status"]')].some(node=>node.textContent.includes('Próxima parada: '+name)),route.stops[1].name);
   const second=route.stops[1];
   await context.setGeolocation({latitude:second.lat,longitude:second.lon});
   await page.waitForFunction(name=>[...document.querySelectorAll('[role="status"]')].some(node=>node.textContent.includes('Próxima parada: '+name)),route.stops[2].name);
   assert.match(await progress.innerText(),new RegExp('Paradas restantes: '+(route.stops.length-2)));
   assert.ok(await page.locator('.custom-destination-marker').count()>0);
   await page.screenshot({path:`/tmp/rutatica-active-${mobile?'mobile':'desktop'}.png`});
   assert.deepEqual(errors,[]);
   console.log(JSON.stringify({base,mobile,initialMap:'clean',localities:'pass',origin:'current and locality',saved:'persisted',destination:'Alajuela',route:route.route.shortName,stops:route.stops.length,duration:route.totalTimeMinutes,blue:'pass',progress:await progress.innerText(),errors}));
   await context.close();
  }
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
