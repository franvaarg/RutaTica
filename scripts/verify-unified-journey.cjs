/* eslint-disable @typescript-eslint/no-require-imports -- Optional browser runner. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const base = process.env.APP_URL || 'http://127.0.0.1:3100';
(async () => {
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try {
  const api=await browser.newContext();
  const get=async path=>{const r=await api.request.get(base+path,{timeout:120000});assert.equal(r.status(),200,path);return r.json();};
  const evidence=await get('/api/transit-data');
  assert.equal(evidence.normalization.runtimeCounts.stops,evidence.normalization.derivedStops);
  assert.equal(evidence.normalization.runtimeCounts.routes,evidence.normalization.derivedRoutes);
  assert.equal(evidence.normalization.runtimeCounts.associations,evidence.normalization.routeStopAssociations);
  for(const q of ['san joaquin','San Joaquín']) {
   const s=await get('/api/search?q='+encodeURIComponent(q));
   assert.ok(s.places.some(p=>p.name==='San Joaquín'));assert.ok(s.stops.length);
   assert.ok(s.stops.every(p=>p.resultType==='STOP' && p.stopId && !/plantel|garaje|deposito|depósito|taller/i.test(p.name)));
  }
  const facilities=await get('/api/search?q=plantel');assert.equal(facilities.stops.length,0);
  const initial=await get('/api/best-route?originLat=9.9281&originLon=-84.0907&destLat=10.0031&destLon=-84.1546');
  assert.ok(initial.routes.length,'derived locality journey exists');
  const route=initial.routes.find(r=>r.dataKind==='DERIVED_GTFS' && r.stops.length>=3);assert.ok(route);
  const first=route.stops[0],last=route.stops.at(-1);
  for(const [fromStop,toStop] of [[false,false],[true,true],[true,false],[false,true]]) {
   const p=new URLSearchParams({originLat:String(first.lat),originLon:String(first.lon),destLat:String(last.lat),destLon:String(last.lon)});
   if(fromStop)p.set('originStopId',first.stopId);if(toStop)p.set('destinationStopId',last.stopId);
   const d=await get('/api/best-route?'+p);assert.ok(d.routes.length);
   for(const r of d.routes) {
    if(fromStop)assert.equal(r.stops[0].stopId,first.stopId);if(toStop)assert.equal(r.stops.at(-1).stopId,last.stopId);
    assert.ok(r.stops[0].stopSequence<r.stops.at(-1).stopSequence);assert.ok(r.totalTimeMinutes>0);
   }
   console.log('MODE',fromStop?'STOP':'PLACE','→',toStop?'STOP':'PLACE','PASS');
  }
  const stopContext=await browser.newContext({viewport:{width:1280,height:900}}),stopPage=await stopContext.newPage();
  stopPage.setDefaultTimeout(60000);
  await stopPage.goto(base,{waitUntil:'domcontentloaded'});await stopPage.locator('.leaflet-container').waitFor();
  await stopPage.getByRole('button',{name:'Abrir menú'}).click();
   if (await stopPage.getByRole('button',{name:'Planificar ruta',exact:true}).count()) await stopPage.getByRole('button',{name:'Planificar ruta',exact:true}).click();await stopPage.getByRole('switch',{name:'Mi ubicación'}).click();
  await stopPage.getByRole('combobox',{name:'Escribe el lugar de origen...'}).fill(first.name);
  await stopPage.getByRole('option').filter({hasText:first.name}).first().click();
  await stopPage.getByRole('combobox',{name:'Escribe el destino...'}).fill(last.name);
  await stopPage.getByRole('option').filter({hasText:last.name}).first().click();
  const stopResponse=stopPage.waitForResponse(r=>r.url().includes('/api/best-route?'));
  await stopPage.getByRole('button',{name:'Buscar Ruta',exact:true}).click();
  const result=await stopResponse,stopUrl=new URL(result.url());assert.equal(result.status(),200);
  assert.equal(stopUrl.searchParams.get('originStopId'),first.stopId);assert.equal(stopUrl.searchParams.get('destinationStopId'),last.stopId);
  const stopData=await result.json();assert.ok(stopData.routes.length);await stopPage.getByRole('button',{name:'Iniciar viaje',exact:true}).waitFor();
  assert.equal(stopData.routes[0].stops[0].stopId,first.stopId);assert.equal(stopData.routes[0].stops.at(-1).stopId,last.stopId);
  console.log('STOP selection in actual UI PASS');await stopContext.close();
  for(const width of [320,360,390,430,768,1280]) {
   const mobile=width<768;
   const context=await browser.newContext({viewport:{width,height:900},isMobile:mobile,hasTouch:mobile,geolocation:{latitude:9.9281,longitude:-84.0907},permissions:['geolocation']});
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(60000);
   await page.goto(base,{waitUntil:'domcontentloaded',timeout:120000});await page.locator('.leaflet-container').waitFor();
   assert.equal(await page.locator('.custom-stop-marker').count(),0);
   await page.getByRole('button',{name:'Abrir menú'}).click();
   if (await page.getByRole('button',{name:'Planificar ruta',exact:true}).count()) await page.getByRole('button',{name:'Planificar ruta',exact:true}).click();
   await page.getByRole('switch',{name:'Mi ubicación'}).click();
   const origin=page.getByRole('combobox',{name:'Escribe el lugar de origen...'});
   await origin.fill('San José');await page.getByRole('option').filter({hasText:'San José - San José'}).first().click();
   const destination=page.getByRole('combobox',{name:'Escribe el destino...'});
   await destination.fill('san joaquin');
   await page.getByRole('option').filter({hasText:'Parada de bus'}).first().waitFor();
   await page.getByRole('option').filter({hasText:'San Joaquín - Flores - Heredia'}).first().click();
   await page.getByRole('button',{name:'Buscar Ruta',exact:true}).click();
   await page.getByRole('button',{name:'Iniciar viaje',exact:true}).waitFor({timeout:120000});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'planned journey has no horizontal overflow at '+width);
   await page.screenshot({path:`/tmp/rutatica-planned-${width}.png`});
   await page.locator('path.leaflet-interactive[stroke="#2563EB"]').first().waitFor();
   await page.getByRole('button',{name:'Iniciar viaje',exact:true}).click();
   const panel=page.getByRole('status').filter({hasText:'Tiempo restante estimado:'}).last();await panel.waitFor();
   const before=await panel.innerText();await page.waitForTimeout(2200);assert.notEqual(await panel.innerText(),before,'countdown ticks');
   const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('rutatica.activeTrip')));assert.ok(saved.active);
   assert.equal(await page.locator('.leaflet-marker-icon[title^="Sube aquí:"],.leaflet-marker-icon[title^="Baja aquí:"],.leaflet-marker-icon[title^="Parada:"]').count(),new Set(saved.route._stops.map(s=>`${s.lat},${s.lon}`)).size);
   assert.equal(await page.getByText(/DERIVED_GTFS|ARESEP|CTP|sourceFeatureId/).count(),0);
   await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('status').filter({hasText:'Tiempo restante estimado:'}).last().waitFor();
   const restored=await page.evaluate(()=>JSON.parse(localStorage.getItem('rutatica.activeTrip')));assert.equal(restored.startedAt,saved.startedAt);
   const calls=saved.route._stops;
   await context.setGeolocation({latitude:calls[0].lat,longitude:calls[0].lon});
   await page.waitForFunction(name=>[...document.querySelectorAll('[role="status"]')].some(n=>n.textContent.includes('Próxima parada: '+name)),calls[1].name);
   const previous=calls.at(-2);await context.setGeolocation({latitude:previous.lat,longitude:previous.lon});
   await page.getByText('BAJA EN LA PRÓXIMA PARADA',{exact:true}).last().waitFor();
   const exit=calls.at(-1);await context.setGeolocation({latitude:exit.lat,longitude:exit.lon});
   await page.getByRole('heading',{name:'HAS LLEGADO',exact:true}).waitFor();
   await page.getByText('BAJA AQUÍ',{exact:true}).last().waitFor();
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'active journey has no horizontal overflow at '+width);
   await page.screenshot({path:`/tmp/rutatica-normalized-${width}.png`});
   assert.equal(errors.length,0,errors.join('\n'));
   console.log(width,'countdown, persistence, GPS, next stop, alighting, arrival PASS');
   await context.close();
  }
  // No GPS permission: the elapsed estimate must keep the active journey running.
  const context=await browser.newContext({viewport:{width:390,height:900}}),page=await context.newPage();
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.evaluate(({route,first,last})=>{
   localStorage.setItem('rutatica.activeTrip',JSON.stringify({active:true,route,startedAt:Date.now()-3000,destination:{name:last.name,lat:last.lat,lon:last.lon},origin:{name:first.name,lat:first.lat,lon:first.lon},path:{bus:route._shapePoints.map(p=>[p.lat,p.lon])},passedIndex:-1}));
  },{route:await api.request.get(base+'/api/best-route?originLat='+first.lat+'&originLon='+first.lon+'&destLat='+last.lat+'&destLon='+last.lon+'&originStopId='+encodeURIComponent(first.stopId)+'&destinationStopId='+encodeURIComponent(last.stopId)).then(r=>r.json()).then(d=>({id:'fallback',destination:last.name,origin:first.name,boardingStop:{name:first.name},destinationStop:{name:last.name},durationMin:d.routes[0].totalTimeMinutes,_stops:d.routes[0].stops,_shapePoints:d.routes[0].shapePoints})),first,last});
  await page.reload();const panel=page.getByRole('status').filter({hasText:'Tiempo restante estimado:'}).last();await panel.waitFor();const before=await panel.innerText();await page.waitForTimeout(2200);assert.notEqual(await panel.innerText(),before);console.log('NO GPS countdown PASS');await context.close();
  console.log(JSON.stringify(evidence));
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
