import type { PrismaClient } from '@prisma/client';
import { selectTripSegment, type TimedStop } from './trip-segments';

/** Ignore the departure date/time only to explain an empty result, never to offer a trip. */
export function hasTransitConnection(trips: TimedStop[][], origins: string[], destinations: string[]): boolean {
  const reachable = new Set<string>();
  for (const stops of trips) {
    for (const origin of origins) {
      for (const stop of stops) {
        if (selectTripSegment(stops, origin, stop.stop_id, 0)) reachable.add(stop.stop_id);
      }
    }
  }
  if (destinations.some(stop => reachable.has(stop))) return true;
  // The planner supports one transfer. A connection requires ordered usable stop times on both legs.
  for (const stops of trips) {
    for (const stop of stops) {
      if (!reachable.has(stop.stop_id)) continue;
      if (destinations.some(dest => selectTripSegment(stops, stop.stop_id, dest, 0))) return true;
    }
  }
  return false;
}

export async function hasStoredTransitConnection(client: PrismaClient, origins: string[], destinations: string[]) {
  const endpoints = [...origins, ...destinations];
  const trips = await client.gtfsTrip.findMany({
    where: { stopTimes: { some: { stop_id: { in: endpoints } } } },
    select: { stopTimes: { orderBy: { stop_sequence: 'asc' }, select: {
      stop_id: true, stop_sequence: true, arrival_time: true, departure_time: true, pickup_type: true, drop_off_type: true,
    } } },
  });
  return hasTransitConnection(trips.map(trip => trip.stopTimes), origins, destinations);
}
