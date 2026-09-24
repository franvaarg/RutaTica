import { publicationTransaction } from './publication-transaction';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaClient, Prisma } from '@prisma/client';
import type { prepareImport } from './ctp-import';
import { reconcileStops } from './stop-reconciliation';
type Prepared = Awaited<ReturnType<typeof prepareImport>>;
const chunks = <T>(rows:T[], size=100) => Array.from({length:Math.ceil(rows.length/size)},(_,i)=>rows.slice(i*size,(i+1)*size));
/** No coordinate-based identity. Every observation survives; moved/absent stops fail closed. */
export async function publishCtp(client: PrismaClient, prepared: Prepared, options: {
  sourceKey?:string; checksum?:string; checkpoint?:(phase:string)=>void;
} = {}) {
  const source=await client.dataSource.upsert({where:{key:options.sourceKey||'ctp-official'},create:{key:options.sourceKey||'ctp-official',kind:'CTP',name:'Consejo de Transporte Público',endpoint:'https://visortp.ctp.go.cr/Visor/service/ctp'},update:{}});
  if(source.kind!=='CTP') throw new Error('Source kind mismatch');
  const checksum=options.checksum||createHash('sha256').update(JSON.stringify({accepted:prepared.accepted,audit:prepared.audit})).digest('hex');
  const retrievedAt=prepared.accepted.length?new Date(Math.min(...prepared.accepted.map(r=>Date.parse(JSON.parse(r.sourceMetadata).retrieved_at)))):new Date();
  const dataset=await client.datasetVersion.upsert({where:{sourceId_checksum:{sourceId:source.id,checksum}},create:{sourceId:source.id,checksum,retrievedAt,manifest:JSON.stringify({total:prepared.totalRowsRead,sourceCompleteness:'review_required'})},update:{}});
  if(['active','superseded'].includes(dataset.status))return {datasetVersionId:dataset.id,unchanged:true};
  const run=await client.importRun.create({data:{datasetVersionId:dataset.id,status:'validating',rowCounts:JSON.stringify({accepted:prepared.accepted.length,rejected:prepared.skipped}),validation:JSON.stringify({invalid:prepared.invalid,conflicts:prepared.conflicts})}});
  try {
    // Preserve rejection evidence even if the subsequent publication rolls back.
    for(const batch of chunks(prepared.audit)) await client.importRejection.createMany({data:batch.map(a=>({importRunId:run.id,sourceFile:a.file,rowNumber:a.row,reason:a.reason,payload:JSON.stringify(a.data)}))});
    if(!prepared.accepted.length) throw new Error('Refusing empty CTP publication');
    await client.importRun.update({where:{id:run.id},data:{status:'importing'}});
    const result=await publicationTransaction(client,async tx=>{
      const fresh=await tx.datasetVersion.findUniqueOrThrow({where:{id:dataset.id}});
      if(['active','superseded'].includes(fresh.status))throw new Error('Dataset published concurrently');
      const other=await tx.datasetVersion.findFirst({where:{activeSlot:{not:null},source:{kind:'CTP'},sourceId:{not:source.id}}});
      if(other)throw new Error('Display projection supports one CTP source');
      const existing=await tx.ctpStopIdentity.findMany({where:{sourceId:source.id},include:{current:true}});
      const byExternal=new Map(existing.map(s=>[s.externalId,s]));
      if(!existing.length) {
        const legacy=await tx.ctpStop.findMany();
        const incomingById=new Map(prepared.accepted.map(r=>[r.sourceStopId,r]));
        if(legacy.some(old=>{const row=incomingById.get(old.sourceStopId);return !row||row.lat!==old.lat||row.lon!==old.lon||row.name!==old.name;})) throw new Error('Unversioned CTP projection differs from incoming snapshot; archive/bootstrap its observations before replacement');
      }
      const incoming=new Set(prepared.accepted.map(r=>r.sourceStopId));
      const ids=new Map(prepared.accepted.map(r=>[r.sourceStopId,byExternal.get(r.sourceStopId)?.id||randomUUID()]));
      for(const batch of chunks(prepared.accepted.filter(r=>!byExternal.has(r.sourceStopId)))) await tx.ctpStopIdentity.createMany({data:batch.map(r=>({id:ids.get(r.sourceStopId)!,sourceId:source.id,externalId:r.sourceStopId,active:false}))});
      const observations=prepared.accepted.map(r=>{
        const meta=JSON.parse(r.sourceMetadata); const prior=byExternal.get(r.sourceStopId);
        const moved=prior?.current && (prior.current.lat!==r.lat||prior.current.lon!==r.lon);
        const unresolved=prior && (!prior.active || ['moved_pending_review','missing_from_snapshot'].includes(prior.reviewStatus));
        return {id:randomUUID(),stopId:ids.get(r.sourceStopId)!,datasetVersionId:dataset.id,sourceStopId:r.sourceStopId,name:r.name,lat:r.lat,lon:r.lon,province:r.province,canton:r.canton,district:r.district,provinceCode:meta.province_code||null,cantonCode:meta.canton_code||null,coordX:r.coordX,coordY:r.coordY,sourceCrs:meta.source_crs,outputCrs:meta.output_crs,retrievedAt:new Date(meta.retrieved_at),reviewStatus:moved||unresolved?'moved_pending_review':meta.wfs_ambiguous==='True'?'ambiguous_district':'unreviewed',provenance:r.sourceMetadata};
      });
      for(const batch of chunks(observations)) await tx.ctpStopObservation.createMany({data:batch});
      options.checkpoint?.('observations');
      // SQL below uses portable correlated subqueries, parameterized values and quoted names.
      await tx.$executeRaw(Prisma.sql`UPDATE "CtpStopIdentity" SET
        "currentObservationId"=(SELECT o."id" FROM "CtpStopObservation" o WHERE o."stopId"="CtpStopIdentity"."id" AND o."datasetVersionId"=${dataset.id}),
        "reviewStatus"=(SELECT o."reviewStatus" FROM "CtpStopObservation" o WHERE o."stopId"="CtpStopIdentity"."id" AND o."datasetVersionId"=${dataset.id}),
        "active"=CASE WHEN (SELECT o."reviewStatus" FROM "CtpStopObservation" o WHERE o."stopId"="CtpStopIdentity"."id" AND o."datasetVersionId"=${dataset.id})='moved_pending_review' THEN false ELSE true END
        WHERE "sourceId"=${source.id} AND EXISTS (SELECT 1 FROM "CtpStopObservation" o WHERE o."stopId"="CtpStopIdentity"."id" AND o."datasetVersionId"=${dataset.id})`);
      const absent=existing.filter(s=>!incoming.has(s.externalId)).map(s=>s.id);
      for(const batch of chunks(absent)) await tx.ctpStopIdentity.updateMany({where:{id:{in:batch}},data:{active:false,reviewStatus:'missing_from_snapshot'}});
      // Display only current usable observations. History is never deleted.
      await tx.ctpStop.deleteMany();
      const usable=new Set(observations.filter(o=>o.reviewStatus!=='moved_pending_review').map(o=>o.sourceStopId));
      for(const batch of chunks(prepared.accepted.filter(r=>usable.has(r.sourceStopId)))) await tx.ctpStop.createMany({data:batch.map(r=>({...r,id:ids.get(r.sourceStopId)!,identityKey:ids.get(r.sourceStopId)!}))});
      await tx.importRun.update({where:{id:run.id},data:{status:'validating'}});
      if(await tx.ctpStopObservation.count({where:{datasetVersionId:dataset.id}})!==prepared.accepted.length) throw new Error('CTP observation count mismatch');
      await tx.datasetVersion.updateMany({where:{sourceId:source.id,activeSlot:source.id},data:{status:'superseded',activeSlot:null}});
      await tx.datasetVersion.update({where:{id:dataset.id},data:{status:'active',activeSlot:source.id,publishedAt:new Date()}});
      await tx.importRun.update({where:{id:run.id},data:{status:'succeeded',completedAt:new Date()}});
      options.checkpoint?.('activation');
      return {observations:observations.length,usable:usable.size,movedPendingReview:observations.length-usable.size,missing:absent.length,quarantined:prepared.skipped};
    });
    return {datasetVersionId:dataset.id,importRunId:run.id,unchanged:false,...result};
  }catch(error){
    await client.importRun.update({where:{id:run.id},data:{status:'failed',completedAt:new Date(),errorSummary:error instanceof Error?error.message:String(error)}});
    await client.datasetVersion.updateMany({where:{id:dataset.id,activeSlot:null,status:{not:'superseded'}},data:{status:'failed'}});throw error;
  }
}
export async function recordReconciliation(client:PrismaClient) {
  const gtfs=await client.gtfsStopVersion.findMany({where:{dataset:{status:'active'},lat:{not:null},lon:{not:null},locationType:0}});
  const ctp=await client.ctpStopIdentity.findMany({where:{active:true},include:{current:true}});
  const matches=reconcileStops(ctp.flatMap(s=>s.current?[{id:s.current.id,lat:s.current.lat,lon:s.current.lon}]:[]),gtfs.map(s=>({id:s.id,lat:s.lat!,lon:s.lon!})));
  for(const [status,pairs] of [['candidate',matches.likelyOverlaps],['ambiguous',matches.ambiguousMatches]] as const) for(const p of pairs) {
    const key={gtfsStopId:p.gtfsId,ctpObservationId:p.ctpId,algorithmVersion:'haversine-grid-v1-50m'};
    await client.stopReconciliation.upsert({where:{gtfsStopId_ctpObservationId_algorithmVersion:key},create:{...key,status,distanceMeters:p.distanceKm*1000,method:'proximity'},update:{}});
  }
  return {candidates:matches.likelyOverlaps.length,ambiguous:matches.ambiguousMatches.length};
}
export async function reviewReconciliation(client:PrismaClient,id:string,status:'accepted'|'rejected',reviewer:string,evidence:string) {
  if(!reviewer.trim()||!evidence.trim())throw new Error('Reviewer and evidence required');
  return client.stopReconciliation.update({where:{id},data:{status,reviewer,evidence,reviewedAt:new Date()}});
}
