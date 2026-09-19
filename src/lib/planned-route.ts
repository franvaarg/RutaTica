export interface PlanatedRoute {
  id: string
  company: string
  routeNumber: string
  origin: string
  destination: string
  price: number | null
  routingSource?: string
  geometryAvailable?: boolean
  currency: string
  distanceKm?: number | null
  durationMin?: number | null
  transitDistanceKm?: number | null
  boardingStop: {
    name: string
    city: string | null
    coordinates?: {
      latitude: number
      longitude: number
    }
  }
  destinationStop: {
    name: string
    city: string | null
    coordinates?: {
      latitude: number
      longitude: number
    } | null
  } | null
  nearbyStops: Array<{
    name: string
    city: string | null
    distance: number
  }>
  // GTFS-specific fields
  _stops?: Array<{ name: string; lat: number; lon: number }>
  _shapePoints?: Array<{ lat: number; lon: number }>
  _score?: number
  _departTime?: string
  _arriveTime?: string
  _transfers?: number
  _walkingDistanceKm?: number
  _boardingStopDistanceKm?: number
}


/** Shared adapter preserves provenance and never substitutes road geometry. */
export function mapPlannedRoutes(routes: unknown[], routingSource: string): PlanatedRoute[] {
  return routes.map((r: any, index: number) => ({
          id: `${r.route?.routeId || 'R'}-${r.boardingStop?.name || 'A'}-${r.alightingStop?.name || 'B'}-${index}`,
          company: r.route?.company || 'N/A',
          routeNumber: r.route?.shortName || 'N/A',
          origin: r.boardingStop?.name || 'Origen',
          destination: r.alightingStop?.name || 'Destino',
          price: r.costCRC ?? null,
          currency: 'CRC',
          routingSource,
          geometryAvailable: r.shapePoints?.length > 1,
          distanceKm: r.distanceKm ?? null,
          transitDistanceKm: r.transitDistanceKm ?? null,
          durationMin: r.totalTimeMinutes || null,
          boardingStop: {
            name: r.boardingStop?.name || '',
            city: null,
            coordinates: r.boardingStop ? { latitude: r.boardingStop.lat, longitude: r.boardingStop.lon } : undefined,
          },
          destinationStop: {
            name: r.alightingStop?.name || '',
            city: null,
            coordinates: r.alightingStop ? { latitude: r.alightingStop.lat, longitude: r.alightingStop.lon } : undefined,
          },
          nearbyStops: [],
          _stops: r.stops || [],
          _shapePoints: r.shapePoints || [],
          _score: r.score || 0,
          _departTime: r.departTime || '',
          _arriveTime: r.arriveTime || '',
          _transfers: r.transfers || 0,
          _walkingDistanceKm: r.walkingDistanceKm || 0,
          _boardingStopDistanceKm: r.boardingStop?.distanceKm || 0,
        }))
}
