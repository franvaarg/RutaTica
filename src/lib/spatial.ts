import { db } from '@/lib/db';

/**
 * Haversine formula to calculate distance between two coordinates in kilometers.
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export type Coordinate = { lat: number; lon: number };

/** Distance along an ordered path, rather than the straight line between endpoints. */
export function pathDistanceKm(points: Coordinate[]): number {
  let distance = 0;
  for (let index = 1; index < points.length; index += 1) {
    distance += haversineDistance(
      points[index - 1].lat,
      points[index - 1].lon,
      points[index].lat,
      points[index].lon
    );
  }
  return distance;
}

/**
 * Extract the part of a GTFS shape between two stops. GTFS shapes are ordered,
 * but the schema does not link an individual point to a stop, so the closest
 * ordered points are used when shape_dist_traveled is unavailable.
 */
export function slicePathBetween(
  points: Coordinate[],
  from: Coordinate,
  to: Coordinate
): Coordinate[] {
  if (points.length < 2) return points;

  let fromIndex = 0;
  let fromDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < points.length; index += 1) {
    const distance = haversineDistance(from.lat, from.lon, points[index].lat, points[index].lon);
    if (distance < fromDistance) {
      fromDistance = distance;
      fromIndex = index;
    }
  }

  let toIndex = fromIndex;
  let toDistance = Number.POSITIVE_INFINITY;
  for (let index = fromIndex; index < points.length; index += 1) {
    const distance = haversineDistance(to.lat, to.lon, points[index].lat, points[index].lon);
    if (distance < toDistance) {
      toDistance = distance;
      toIndex = index;
    }
  }

  return points.slice(fromIndex, Math.max(fromIndex + 2, toIndex + 1));
}

/**
 * Calculate the bounding box for a given center point and radius in km.
 * Returns [minLat, minLon, maxLat, maxLon].
 */
function getBoundingBox(
  lat: number,
  lon: number,
  radiusKm: number
): [number, number, number, number] {
  const latDelta = (radiusKm / 6371) * (180 / Math.PI);
  const lonDelta =
    (radiusKm / 6371) * (180 / Math.PI) / Math.cos((lat * Math.PI) / 180);
  return [
    lat - latDelta,
    lon - lonDelta,
    lat + latDelta,
    lon + lonDelta,
  ];
}

/**
 * Find the nearest stops to a given coordinate using bounding box + haversine.
 */
export async function findNearestStops(
  lat: number,
  lon: number,
  maxDistanceKm: number = 5,
  limit: number = 20
): Promise<
  {
    stop: {
      stop_id: string;
      code: string | null;
      name: string;
      desc: string | null;
      lat: number;
      lon: number;
      zone_id: string | null;
      location_type: number;
      parent_station: string | null;
      wheelchair_boarding: number;
    };
    distanceKm: number;
  }[]
> {
  const [minLat, minLon, maxLat, maxLon] = getBoundingBox(lat, lon, maxDistanceKm);

  const candidateStops = await db.gtfsStop.findMany({
    where: {
      lat: { gte: minLat, lte: maxLat },
      lon: { gte: minLon, lte: maxLon },
      location_type: 0,
    },
    select: {
      stop_id: true,
      code: true,
      name: true,
      desc: true,
      lat: true,
      lon: true,
      zone_id: true,
      location_type: true,
      parent_station: true,
      wheelchair_boarding: true,
    },
  });

  const stopsWithDistance = candidateStops
    .map((stop) => ({
      stop,
      distanceKm: haversineDistance(lat, lon, stop.lat, stop.lon),
    }))
    .filter((s) => s.distanceKm <= maxDistanceKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);

  return stopsWithDistance;
}

/**
 * Calculate the initial bearing (in degrees) from point 1 to point 2.
 */
export function bearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const la1 = (lat1 * Math.PI) / 180;
  const la2 = (lat2 * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(la2);
  const x =
    Math.cos(la1) * Math.sin(la2) -
    Math.sin(la1) * Math.cos(la2) * Math.cos(dLon);
  const brng = Math.atan2(y, x);
  return ((brng * 180) / Math.PI + 360) % 360;
}

/**
 * Calculate the midpoint between two coordinates.
 */
export function midpoint(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): [number, number] {
  const la1 = (lat1 * Math.PI) / 180;
  const la2 = (lat2 * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const bx = Math.cos(la2) * Math.cos(dLon);
  const by = Math.cos(la2) * Math.sin(dLon);

  const latMid =
    Math.atan2(
      Math.sin(la1) + Math.sin(la2),
      Math.sqrt((Math.cos(la1) + bx) * (Math.cos(la1) + bx) + by * by)
    ) *
    (180 / Math.PI);
  const lonMid =
    ((lon1 * Math.PI) / 180 +
      Math.atan2(by, Math.cos(la1) + bx)) *
    (180 / Math.PI);

  return [latMid, lonMid];
}

/**
 * Approximate walking time in minutes for a given distance in km.
 * Assumes average walking speed of 5 km/h.
 */
export function walkingTimeMinutes(distanceKm: number): number {
  return (distanceKm / 5) * 60;
}
