import { publicationTransaction } from './publication-transaction';
import { randomUUID } from 'node:crypto';
import { PrismaClient, Prisma } from '@prisma/client';
import { auditTables, serviceSeconds, type Feed, type Row } from './gtfs-audit';
type Tx = Prisma.TransactionClient;
const json = (value: unknown) => JSON.stringify(value);
const int = (v: string | undefined, fallback = 0) => v ? Number(v) : fallback;
const optionalNumber = (v: string | undefined) => v ? Number(v) : null;
export function deriveStopRoutes(tables: Feed) {
  const trips = new Map(tables.trips.map(r => [r.trip_id,r]));
  const routes = new Map(tables.routes.map(r => [r.route_id,r]));
  const result = new Map<string,{stopId:string;routeId:string;company:string|null;sequence:number}>();
  for (const st of tables.stop_times) {
    const trip=trips.get(st.trip_id); if(!trip) throw new Error(`Orphan trip ${st.trip_id}`);
    const route=routes.get(trip.route_id);if(!route) throw new Error(`Orphan route ${trip.route_id}`);
    const key=json([st.stop_id,trip.route_id]); const previous=result.get(key);
    result.set(key,{stopId:st.stop_id,routeId:trip.route_id,company:route.agency_id||null,
      // Compatibility only. Direction/order MUST come from the chosen trip.
      sequence:Math.min(previous?.sequence??Infinity,Number(st.stop_sequence))});
  }
  return [...result.values()];
}
/** Versioned canonical data with same-dataset composite foreign keys. */
async function canonical(tx: Tx, datasetVersionId: string, t: Feed) {
  const ids = (rows: Row[], field: string) => new Map(rows.map(r=>[r[field]||'',randomUUID()]));
  const agency=ids(t.agency,'agency_id'),stop=ids(t.stops,'stop_id'),route=ids(t.routes,'route_id'),trip=ids(t.trips,'trip_id');
  const service=new Map([...new Set([...t.calendar,...t.calendar_dates].map(r=>r.service_id))].map(k=>[k,randomUUID()]));
  const shape=new Map([...new Set(t.shapes.map(r=>r.shape_id))].map(k=>[k,randomUUID()]));
  for(const r of t.agency) await tx.gtfsAgencyVersion.create({data:{id:agency.get(r.agency_id||'')!,datasetVersionId,externalId:r.agency_id||'',name:r.agency_name,url:r.agency_url,timezone:r.agency_timezone,payload:json(r)}});
  for(const r of t.stops) await tx.gtfsStopVersion.create({data:{id:stop.get(r.stop_id)!,datasetVersionId,externalId:r.stop_id,name:r.stop_name||null,lat:optionalNumber(r.stop_lat),lon:optionalNumber(r.stop_lon),locationType:int(r.location_type),payload:json(r)}});
  for(const r of t.stops.filter(r=>r.parent_station)) await tx.gtfsStopVersion.update({where:{id:stop.get(r.stop_id)!},data:{parentId:stop.get(r.parent_station)!}});
  for(const [externalId,id] of service) await tx.gtfsService.create({data:{id,datasetVersionId,externalId}});
  for(const r of t.calendar) await tx.gtfsCalendarVersion.create({data:{serviceId:service.get(r.service_id)!,startDate:r.start_date,endDate:r.end_date,monday:r.monday==='1',tuesday:r.tuesday==='1',wednesday:r.wednesday==='1',thursday:r.thursday==='1',friday:r.friday==='1',saturday:r.saturday==='1',sunday:r.sunday==='1'}});
  for(const r of t.calendar_dates) await tx.gtfsCalendarDateVersion.create({data:{serviceId:service.get(r.service_id)!,date:r.date,exceptionType:Number(r.exception_type)}});
  for(const [externalId,id] of shape) await tx.gtfsShapeVersion.create({data:{id,datasetVersionId,externalId}});
  for(const r of t.shapes) await tx.gtfsShapePoint.create({data:{shapeId:shape.get(r.shape_id)!,sequence:Number(r.shape_pt_sequence),lat:Number(r.shape_pt_lat),lon:Number(r.shape_pt_lon),distance:optionalNumber(r.shape_dist_traveled)}});
  for(const r of t.routes) await tx.gtfsRouteVersion.create({data:{id:route.get(r.route_id)!,datasetVersionId,externalId:r.route_id,agencyId:agency.get(r.agency_id||'')||null,shortName:r.route_short_name||null,longName:r.route_long_name||null,routeType:Number(r.route_type),payload:json(r)}});
  for(const r of t.trips) await tx.gtfsTripVersion.create({data:{id:trip.get(r.trip_id)!,datasetVersionId,externalId:r.trip_id,routeId:route.get(r.route_id)!,serviceId:service.get(r.service_id)!,shapeId:r.shape_id?shape.get(r.shape_id)!:null,payload:json(r)}});
  for(const r of t.stop_times) await tx.gtfsStopTimeVersion.create({data:{datasetVersionId,tripId:trip.get(r.trip_id)!,stopId:stop.get(r.stop_id)!,sequence:Number(r.stop_sequence),arrivalSeconds:serviceSeconds(r.arrival_time),departureSeconds:serviceSeconds(r.departure_time),payload:json(r)}});
}
/** All deletes and inserts below share canonical publication's transaction. */
async function project(tx: Tx,t: Feed) {
  // This projection supports a single source; canonical history supports many.
  const logos=await tx.routeLogo.findMany();
  await tx.gtfsFareRule.deleteMany();await tx.routeColor.deleteMany();await tx.routeLogo.deleteMany();
  await tx.stopRoute.deleteMany();await tx.gtfsStopTime.deleteMany();await tx.gtfsTrip.deleteMany();
  await tx.gtfsShape.deleteMany();await tx.gtfsStop.deleteMany();await tx.gtfsRoute.deleteMany();
  await tx.gtfsAgency.deleteMany();await tx.gtfsCalendarDate.deleteMany();await tx.gtfsCalendar.deleteMany();await tx.gtfsFareAttribute.deleteMany();
  for(const r of t.agency) await tx.gtfsAgency.create({data:{agency_id:r.agency_id||'__single_agency__',name:r.agency_name,url:r.agency_url,timezone:r.agency_timezone,phone:r.agency_phone||null,lang:r.agency_lang||null,email:r.agency_email||null}});
  for(const r of t.calendar) await tx.gtfsCalendar.create({data:{service_id:r.service_id,start_date:r.start_date,end_date:r.end_date,monday:r.monday==='1',tuesday:r.tuesday==='1',wednesday:r.wednesday==='1',thursday:r.thursday==='1',friday:r.friday==='1',saturday:r.saturday==='1',sunday:r.sunday==='1'}});
  for(const r of t.calendar_dates) await tx.gtfsCalendarDate.create({data:{service_id:r.service_id,date:r.date,exception_type:Number(r.exception_type)}});
  for(const r of t.stops) {
    // The compatibility schema cannot represent coordinate-free nodes. They are
    // retained canonically; publication must reject unsupported projection shapes.
    await tx.gtfsStop.create({data:{stop_id:r.stop_id,name:r.stop_name||'',lat:Number(r.stop_lat),lon:Number(r.stop_lon),code:r.stop_code||null,desc:r.stop_desc||null,zone_id:r.zone_id||null,location_type:int(r.location_type),parent_station:r.parent_station||null,wheelchair_boarding:int(r.wheelchair_boarding)}});
  }
  for(const r of t.routes) await tx.gtfsRoute.create({data:{route_id:r.route_id,agency_id:r.agency_id||t.agency[0].agency_id||'__single_agency__',short_name:r.route_short_name||null,long_name:r.route_long_name||null,type:Number(r.route_type),color:r.route_color||null,text_color:r.route_text_color||null,sort_order:optionalNumber(r.route_sort_order)}});
  for(const r of t.trips) await tx.gtfsTrip.create({data:{trip_id:r.trip_id,route_id:r.route_id,service_id:r.service_id,headsign:r.trip_headsign||null,short_name:r.trip_short_name||null,direction_id:optionalNumber(r.direction_id),block_id:r.block_id||null,shape_id:r.shape_id||null,wheelchair_accessible:int(r.wheelchair_accessible),bikes_allowed:int(r.bikes_allowed)}});
  for(const r of t.stop_times) await tx.gtfsStopTime.create({data:{trip_id:r.trip_id,stop_id:r.stop_id,arrival_time:r.arrival_time,departure_time:r.departure_time,stop_sequence:Number(r.stop_sequence),stop_headsign:r.stop_headsign||null,pickup_type:int(r.pickup_type),drop_off_type:int(r.drop_off_type),shape_dist_traveled:optionalNumber(r.shape_dist_traveled),timepoint:int(r.timepoint,1)}});
  for(const r of t.shapes) await tx.gtfsShape.create({data:{shape_id:r.shape_id,shape_pt_sequence:Number(r.shape_pt_sequence),shape_pt_lat:Number(r.shape_pt_lat),shape_pt_lon:Number(r.shape_pt_lon),shape_dist_traveled:optionalNumber(r.shape_dist_traveled)}});
  for(const data of deriveStopRoutes(t)) await tx.stopRoute.create({data});
  for(const r of t.fare_attributes||[]) await tx.gtfsFareAttribute.create({data:{fare_id:r.fare_id,price:Number(r.price),currency_type:r.currency_type,payment_method:int(r.payment_method),transfers:int(r.transfers),transfer_duration:optionalNumber(r.transfer_duration)}});
  for(const r of t.fare_rules||[]) await tx.gtfsFareRule.create({data:{fare_id:r.fare_id,route_id:r.route_id||null,origin_id:r.origin_id||null,destination_id:r.destination_id||null,contains_id:r.contains_id||null}});
  for(const logo of logos.filter(l=>t.routes.some(r=>r.route_id===l.routeId))) await tx.routeLogo.create({data:logo});
  for(const r of t.empresas||[]) {
    const existing=await tx.company.findFirst({where:{name:r.name}});
    const data={name:r.name,phone:r.phone||null,email:r.email||null,website:r.website||null,logoUrl:r.logo||null,description:r.description||null};
    if(existing) await tx.company.update({where:{id:existing.id},data});else await tx.company.create({data});
  }
  for(const r of t.routes.filter(r=>r.route_color)) await tx.routeColor.create({data:{routeId:r.route_id,color:r.route_color,textColor:r.route_text_color||'000000'}});
  for(const r of t.colores||[]) await tx.routeColor.upsert({where:{routeId:r.route_id},create:{routeId:r.route_id,color:r.color,textColor:r.text_color},update:{color:r.color,textColor:r.text_color}});
}
export async function publishGtfs(client: PrismaClient, feed: {tables:Feed;checksum:string;parseErrors?:string[]}, options: {
  sourceKey: string; retrievedAt?: Date; endpoint?: string;
  /** Test-only fault injection, never accepted from CLI. */ checkpoint?: (phase:string)=>void;
}) {
  const source=await client.dataSource.upsert({where:{key:options.sourceKey},create:{key:options.sourceKey,kind:'GTFS',name:options.sourceKey,endpoint:options.endpoint},update:{}});
  if(source.kind!=='GTFS') throw new Error('Source kind mismatch');
  const dataset=await client.datasetVersion.upsert({where:{sourceId_checksum:{sourceId:source.id,checksum:feed.checksum}},create:{sourceId:source.id,checksum:feed.checksum,retrievedAt:options.retrievedAt||new Date(),manifest:json(feed.tables)},update:{}});
  if(dataset.status==='active'||dataset.status==='superseded') return {datasetVersionId:dataset.id,unchanged:true};
  const run=await client.importRun.create({data:{datasetVersionId:dataset.id}});
  const audit=auditTables(feed.tables,feed.parseErrors);
  try {
    await client.importRun.update({where:{id:run.id},data:{status:'validating',validation:json(audit),rowCounts:json(audit.counts)}});
    if(audit.errors.length) throw new Error(audit.errors.join('\n'));
    if(audit.unsupported.length) throw new Error(`Valid/partially supported GTFS cannot be published to local planner: ${audit.unsupported.join('; ')}`);
    if(feed.tables.stops.some(r=>!r.stop_lat||!r.stop_lon)) throw new Error('Coordinate-free nodes require a future canonical reader; compatibility projection unsupported');
    await client.importRun.update({where:{id:run.id},data:{status:'importing'}});
    await publicationTransaction(client,async tx=>{
      const other=await tx.datasetVersion.findFirst({where:{activeSlot:{not:null},source:{kind:'GTFS'},sourceId:{not:source.id}}});
      if(other) throw new Error('Legacy projection supports one GTFS source; use canonical readers before activating additional sources');
      // Serial publication: no duplicate writer can replace an already published version.
      const fresh=await tx.datasetVersion.findUniqueOrThrow({where:{id:dataset.id}});
      if(['active','superseded'].includes(fresh.status)) throw new Error('Dataset was published concurrently');
      await canonical(tx,dataset.id,feed.tables);
      options.checkpoint?.('canonical');
      await project(tx,feed.tables);
      options.checkpoint?.('projection');
      await tx.importRun.update({where:{id:run.id},data:{status:'validating'}});
      if(await tx.gtfsTripVersion.count({where:{datasetVersionId:dataset.id}})!==feed.tables.trips.length || await tx.stopRoute.count()!==deriveStopRoutes(feed.tables).length) throw new Error('Publication integrity count mismatch');
      await tx.datasetVersion.updateMany({where:{sourceId:source.id,activeSlot:source.id},data:{activeSlot:null,status:'superseded'}});
      await tx.datasetVersion.update({where:{id:dataset.id},data:{activeSlot:source.id,status:'active',publishedAt:new Date()}});
      options.checkpoint?.('activation');
      await tx.importRun.update({where:{id:run.id},data:{status:'succeeded',completedAt:new Date()}});
    });
    return {datasetVersionId:dataset.id,importRunId:run.id,unchanged:false,audit};
  } catch(error) {
    const message=error instanceof Error?error.message:String(error);
    await client.importRun.update({where:{id:run.id},data:{status:'failed',errorSummary:message,completedAt:new Date()}});
    await client.datasetVersion.updateMany({where:{id:dataset.id,activeSlot:null,status:{not:'superseded'}},data:{status:'failed'}});
    throw error;
  }
}
