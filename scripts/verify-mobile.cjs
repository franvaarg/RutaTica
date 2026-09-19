/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS runner supports an external Playwright installation. */
/* Optional browser verification: install Playwright separately and set PLAYWRIGHT_MODULE if needed. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const results=[];
 // Browser HTTP coverage uses actual imported data from all seven provinces.
 const api=await browser.newContext();
 for(const province of ['San José','Alajuela','Cartago','Heredia','Guanacaste','Puntarenas','Limón']) {
   const response=await api.request.get(`${process.env.APP_URL || 'http://127.0.0.1:3100'}/api/stops?source=CTP&province=${encodeURIComponent(province)}&limit=2`);
   assert.equal(response.status(),200);const body=await response.json();
   assert.equal(body.stops.length,2);assert.ok(body.stops.every(s=>s.source==='CTP'&&!s.hasRouteData));
 }
 await api.close();
 try {
 for(const width of [320,360,390,430,768]){
  const context=await browser.newContext({viewport:{width,height:844},geolocation:{latitude:10.3275,longitude:-84.4372},permissions:['geolocation']});
  const page=await context.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',msg=>{if(msg.type()==='error'&&/hydration|did not match|React error/i.test(msg.text()))errors.push(msg.text())});
  // External outages are deliberate; all application/SQLite APIs remain real.
  await page.route('https://**/*',route=>route.abort());
  await page.goto(process.env.APP_URL || 'http://127.0.0.1:3100',{waitUntil:'networkidle',timeout:120000});
  await page.getByRole('button',{name:'Abrir menú'}).click();
  const input=page.getByRole('combobox',{name:'Escribe el destino...'});
  await input.fill('Ciudad Quesada');
  await page.getByRole('option').first().waitFor();
  await input.press('Escape');assert.equal(await input.getAttribute('aria-expanded'),'false');
  await input.press('ArrowDown');await input.press('Enter');
  await page.getByRole('button',{name:'Buscar Ruta',exact:true}).click();
  await page.getByText('Hay paradas oficiales registradas', {exact:false}).waitFor({timeout:45000});
  assert.equal(await page.getByText('Ruta OTP',{exact:true}).count(),0);
  await page.getByRole('button',{name:'Ver mapa / cerrar resultados'}).click();
  await page.getByRole('button',{name:'Acercar',exact:true}).click();
  await page.getByRole('button',{name:'Alejar',exact:true}).click();
  await page.getByRole('button',{name:'Ver resultados',exact:true}).click();
  await page.getByText('Hay paradas oficiales registradas', {exact:false}).waitFor();
  const dimensions=await page.evaluate(()=>({width:innerWidth,body:document.body.scrollWidth}));
  assert.ok(dimensions.body<=width,`Overflow at ${width}`);assert.deepEqual(errors,[]);
  // A short viewport approximates the reduced space when the soft keyboard opens.
  await page.setViewportSize({width,height:480});
  assert.ok(await page.getByRole('button',{name:'Ver mapa / cerrar resultados'}).isVisible());
  results.push({width,dimensions,errors,ctpOnly:true,keyboardSelection:true,closeReopen:true,shortViewport:true});
  await context.close();
 }
 console.log(JSON.stringify(results,null,2));
 if(process.env.BROWSER_REPORT)fs.writeFileSync(process.env.BROWSER_REPORT,JSON.stringify(results,null,2));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
