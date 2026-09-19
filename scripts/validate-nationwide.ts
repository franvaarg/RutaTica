/** Read-only national coverage and bounded API audit. Run against the imported disposable snapshot. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { parse } from 'csv-parse/sync';
import { NextRequest } from 'next/server';
import { db } from '../src/lib/db';
import { GET as stopsApi } from '../src/app/api/stops/route';
import { GET as searchApi } from '../src/app/api/locations/search/route';
import { haversineDistance } from '../src/lib/spatial';
import { reconcileStops } from '../src/lib/stop-reconciliation';

async function main() {
  assert.ok(process.env.DATABASE_URL, 'Explicit snapshot DATABASE_URL required');
  const ctp = await db.ctpStop.findMany();
  const gtfs = await db.gtfsStop.findMany();
  const source = parse(await readFile('data/ctp_exports/ctp_validation_summary.csv','utf8'),{columns:true}) as Record<string,string>[];
  const cantons = source.filter(r=>r.scope==='canton').map(r=>({code:r.code,province:r.province,canton:r.name,ctp:ctp.filter(s=>s.province===r.province&&s.canton===r.name).length,gtfsInferred:0,sourceStatus:r.coverage_status}));
  const classifications = gtfs.map(g=>{
    // Nearby CTP labels are evidence of proximity only, never an administrative boundary or route link.
    const near=ctp.filter(c=>Math.abs(c.lat-g.lat)<0.001&&Math.abs(c.lon-g.lon)<0.001&&haversineDistance(c.lat,c.lon,g.lat,g.lon)<=0.05);
    const labels=[...new Set(near.map(c=>`${c.province}|${c.canton}`))];
    const match=labels.length===1?cantons.find(c=>`${c.province}|${c.canton}`===labels[0]):undefined;
    if(match)match.gtfsInferred++;
    return {stopId:g.stop_id,province:match?.province??null,canton:match?.canton??null,method:match?'unambiguous CTP proximity within 50 m (inferred)':'unclassified'};
  });
  const status=(c:number,g:number)=>c?(g?'both (GTFS inferred)':'CTP; no classified GTFS'):(g?'GTFS inferred only':'no classified usable stops');
  const provinces=[...new Set(cantons.map(c=>c.province))].map(province=>({province,ctp:ctp.filter(c=>c.province===province).length,gtfsInferred:classifications.filter(g=>g.province===province).length}));
  assert.equal(provinces.length,7); assert.equal(cantons.reduce((n,c)=>n+c.ctp,0),ctp.length);
  const benchmarks: {province:string;canton:string;lat:number;lon:number;url:string;ms:number;bytes:number;returned:number}[]=[];
  for(const p of provinces){
    const candidates=ctp.filter(c=>c.province===p.province).sort((a,b)=>a.lat-b.lat);
    assert.ok(candidates.length);
    // Extremes and midpoint exercise national edges and interiors without invented transport records.
    const regionalSamples=['San José','San Carlos','Los Chiles','La Cruz','Talamanca','Corredores','Pérez Zeledón','Liberia','Puntarenas','Limón'].flatMap(canton=>{
      const rows=candidates.filter(c=>c.canton===canton);return rows.length?[rows[Math.floor(rows.length/2)]]:[];
    });
    const samples=[...new Map([candidates[0],candidates[Math.floor(candidates.length/2)],candidates[candidates.length-1],...regionalSamples].map(c=>[c.identityKey,c])).values()];
    for(const c of samples){
      for(const url of [`/api/stops?source=CTP&bbox=${c.lat-0.01},${c.lon-0.01},${c.lat+0.01},${c.lon+0.01}&limit=20`,`/api/stops?source=CTP&lat=${c.lat}&lon=${c.lon}&radius=5&limit=20`,`/api/locations/search?type=stop&q=${encodeURIComponent(c.canton)}`]){
        const start=performance.now();const response=await (url.includes('/locations/')?searchApi:stopsApi)(new NextRequest(`http://localhost${url}`));
        const text=await response.text(); assert.equal(response.status,200); const body=JSON.parse(text);const rows=body.stops??body.locations;
        assert.ok(rows.length>0&&rows.length<=20);assert.ok(rows.some((s:{source:string})=>s.source==='CTP'));
        assert.ok(rows.filter((s:{source:string})=>s.source==='CTP').every((s:{hasRouteData:boolean})=>s.hasRouteData===false));
        benchmarks.push({province:p.province,canton:c.canton,lat:c.lat,lon:c.lon,url,ms:Math.round((performance.now()-start)*100)/100,bytes:Buffer.byteLength(text),returned:rows.length});
      }
    }
  }
  const invalidCoordinates=[...ctp.map(c=>({id:c.identityKey,lat:c.lat,lon:c.lon})),...gtfs.map(g=>({id:g.stop_id,lat:g.lat,lon:g.lon}))].filter(s=>!Number.isFinite(s.lat)||!Number.isFinite(s.lon)||s.lat<8||s.lat>11.3||s.lon< -86||s.lon> -82.5);
  assert.equal(invalidCoordinates.length,0);
  const overlap=reconcileStops(ctp.map(c=>({id:c.sourceStopId,lat:c.lat,lon:c.lon})),gtfs.map(g=>({id:g.stop_id,lat:g.lat,lon:g.lon})));
  const report={counts:{ctp:ctp.length,gtfs:gtfs.length,unclassifiedGtfs:classifications.filter(g=>!g.province).length},bbox:{minLat:Math.min(...ctp.map(c=>c.lat)),maxLat:Math.max(...ctp.map(c=>c.lat)),minLon:Math.min(...ctp.map(c=>c.lon)),maxLon:Math.max(...ctp.map(c=>c.lon))},invalidCoordinates,coordinateMethod:'Conservative mainland envelope; exact border containment is unverified without boundary polygons.',classificationMethod:'CTP source labels; GTFS unique CTP canton within 50 m is explicitly inferred. Unclassified does not mean absent. Selector rectangles are not boundaries.',provinces:provinces.map(p=>({...p,status:status(p.ctp,p.gtfsInferred)})),cantons:cantons.map(c=>({...c,status:status(c.ctp,c.gtfsInferred)})),classifications,sourceNational:source.find(r=>r.scope==='national'),overlap,benchmarks};
  await mkdir('data/ctp_reports',{recursive:true});await writeFile('data/ctp_reports/nationwide.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify({...report,overlap:{likely:overlap.likelyOverlaps.length,ambiguous:overlap.ambiguousMatches.length},classifications:undefined,benchmarks:{queries:benchmarks.length,maxMs:Math.max(...benchmarks.map(b=>b.ms)),maxBytes:Math.max(...benchmarks.map(b=>b.bytes))}},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>db.$disconnect());
