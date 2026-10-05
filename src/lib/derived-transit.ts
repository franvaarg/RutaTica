import type { AresepRoute, CorridorStop } from './aresep-types'
import { haversineDistance, slicePathByDistance, type Coordinate } from './spatial'
import { isPassengerStop } from './passenger-stops'
import { TRANSIT_ESTIMATES, estimateBusMinutes } from './transit-estimates'

/** Shape projection supplies a candidate order, not proof that a bus calls here. */
function projection(stop: Coordinate, path: Coordinate[]) {
  const sx = 111.195 * Math.cos(stop.lat * Math.PI / 180), sy = 111.195
  let distance = Infinity, along = 0, travelled = 0
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i]
    const ax = (a.lon - stop.lon) * sx, ay = (a.lat - stop.lat) * sy
    const dx = (b.lon - a.lon) * sx, dy = (b.lat - a.lat) * sy
    const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)))
    const length = haversineDistance(a.lat, a.lon, b.lat, b.lon)
    const d = Math.hypot(ax + t * dx, ay + t * dy)
    if (d < distance) { distance = d; along = travelled + t * length }
    travelled += length
  }
  return { distance, along }
}

export function normalizeDerivedRoute(route: AresepRoute, stops: CorridorStop[], verified?: { stopIds: string[]; directionConfirmed: boolean }) {
  const verifiedIds = new Set(verified?.stopIds || [])
  return route.paths.map((path, pathIndex) => {
    const route_id = `derived:${route.id}:${pathIndex}`
    const calls = stops.filter(stop => isPassengerStop(stop.name)).map(stop => ({ stop, ...projection(stop, path) }))
      .filter(call => call.distance <= TRANSIT_ESTIMATES.stopAssociationRadiusKm)
      .sort((a, b) => a.along - b.along || a.stop.id.localeCompare(b.stop.id))
    return {
      dataKind: 'DERIVED_GTFS' as const,
      route: { route_id, route_short_name: route.routeNumber, route_long_name: route.description || '', route_type: 3, route_color: '2563EB', operator: route.operator },
      shapes: path.map((point, index) => ({ shape_id: route_id, shape_pt_lat: point.lat, shape_pt_lon: point.lon, shape_pt_sequence: index + 1 })),
      stops: calls.map(({ stop }) => ({ stop_id: stop.id, stop_name: stop.name, stop_lat: stop.lat, stop_lon: stop.lon, location_type: 0 })),
      stop_times: calls.map((call, index) => ({ trip_id: `${route_id}:estimate`, stop_id: call.stop.id, stop_sequence: index + 1, shape_dist_traveled: call.along,
        estimated_minutes_from_start: index === 0 ? 0 : estimateBusMinutes(call.along, index + 1), association: verifiedIds.has(call.stop.id) ? 'VERIFIED' as const : 'INFERRED' as const })),
      durationSource: 'estimated' as const,
      directionConfirmed: verified?.directionConfirmed === true,
      provenance: { routeSource: 'ARESEP', stopSource: 'CTP', sourceRouteId: route.id, associationMethod: 'shape_projection', schedules: null },
    }
  })
}
export type DerivedRoute = ReturnType<typeof normalizeDerivedRoute>[number]

/** Only confirmed passenger membership/direction can become a usable itinerary. */
export function planDerivedJourney(feed: DerivedRoute, origin: Coordinate, destination: Coordinate) {
  if (!feed.directionConfirmed) return null
  const stops = feed.stops.map((stop, index) => ({ name: stop.stop_name, lat: stop.stop_lat, lon: stop.stop_lon, stopId: stop.stop_id, ...feed.stop_times[index] }))
    .filter(stop => stop.association === 'VERIFIED')
  let best: { board: number; exit: number; walking: number } | null = null
  for (let board = 0; board < stops.length; board++) {
    const start = stops[board], walkingA = haversineDistance(origin.lat, origin.lon, start.lat, start.lon)
    if (walkingA > TRANSIT_ESTIMATES.maximumWalkingKm) continue
    for (let exit = board + 1; exit < stops.length; exit++) {
      const end = stops[exit], walkingB = haversineDistance(destination.lat, destination.lon, end.lat, end.lon)
      if (walkingB > TRANSIT_ESTIMATES.maximumWalkingKm || end.shape_dist_traveled <= start.shape_dist_traveled) continue
      const walking = walkingA + walkingB
      if (!best || walking < best.walking) best = { board, exit, walking }
    }
  }
  if (!best) return null
  const calls = stops.slice(best.board, best.exit + 1), first = calls[0], last = calls.at(-1)!
  const distance = last.shape_dist_traveled - first.shape_dist_traveled
  const busMinutes = estimateBusMinutes(distance, calls.length)
  let shapeDistance = 0
  const points = feed.shapes.map((point, index) => {
    const previous = feed.shapes[index - 1]
    if (previous) shapeDistance += haversineDistance(previous.shape_pt_lat, previous.shape_pt_lon, point.shape_pt_lat, point.shape_pt_lon)
    return { lat: point.shape_pt_lat, lon: point.shape_pt_lon, distance: shapeDistance }
  })
  const shapePoints = slicePathByDistance(points, first.shape_dist_traveled, last.shape_dist_traveled)
  if (!shapePoints) return null
  return {
    dataKind: 'DERIVED_GTFS' as const, durationSource: 'estimated' as const, distanceSource: 'derived_shape',
    score: 0, transfers: 0, costCRC: null,
    totalTimeMinutes: Math.ceil(busMinutes + best.walking / TRANSIT_ESTIMATES.walkingSpeedKmh * 60),
    walkingDistanceKm: best.walking, transitDistanceKm: distance, distanceKm: distance + best.walking,
    boardingStop: { name: first.name, lat: first.lat, lon: first.lon, distanceKm: haversineDistance(origin.lat, origin.lon, first.lat, first.lon) },
    alightingStop: { name: last.name, lat: last.lat, lon: last.lon, distanceKm: haversineDistance(destination.lat, destination.lon, last.lat, last.lon) },
    route: { routeId: feed.route.route_id, shortName: feed.route.route_short_name, longName: feed.route.route_long_name, color: '#2563EB', company: feed.route.operator || '' },
    departTime: '', arriveTime: '',
    stops: calls.map((call, index) => ({ name: call.name, lat: call.lat, lon: call.lon, stopId: call.stopId, tripId: call.trip_id, stopSequence: call.stop_sequence,
      source: 'DERIVED_GTFS' as const, role: index === 0 ? 'boarding' as const : index === calls.length - 1 ? 'alighting' as const : 'intermediate' as const,
      estimatedMinutesFromStart: index === 0 ? 0 : estimateBusMinutes(call.shape_dist_traveled - first.shape_dist_traveled, index + 1) })),
    shapePoints,
    provenance: feed.provenance,
  }
}
