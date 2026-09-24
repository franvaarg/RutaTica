import type { PrismaClient } from '@prisma/client';
/** Query authoritative trips/stop_times; the old StopRoute cache cannot hide valid trips. */
export async function routeMembership(client:PrismaClient,filter:{stopIds?:string[];routeIds?:string[]}) {
  const times=await client.gtfsStopTime.findMany({where:{...(filter.stopIds?{stop_id:{in:filter.stopIds}}:{}),...(filter.routeIds?{trip:{route_id:{in:filter.routeIds}}}:{})},select:{stop_id:true,trip:{select:{route_id:true,route:{select:{agency_id:true}}}}}});
  return [...new Map(times.map(t=>[JSON.stringify([t.stop_id,t.trip.route_id]),{stopId:t.stop_id,routeId:t.trip.route_id,company:t.trip.route.agency_id}])).values()];
}
