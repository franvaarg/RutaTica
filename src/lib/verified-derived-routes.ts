import { getAresepRoutes, getCorridorStops } from './aresep'
import { normalizeDerivedRoute, planDerivedJourney } from './derived-transit'
import type { Coordinate } from './spatial'

/** Populate only from reviewed operator evidence, never from geographic proximity. */
export const VERIFIED_DERIVED_MEMBERSHIPS: Record<string, { stopIds: string[]; directionConfirmed: boolean }> = {}

export async function findVerifiedDerivedJourneys(origin: Coordinate, destination: Coordinate) {
  const result = await Promise.all(Object.entries(VERIFIED_DERIVED_MEMBERSHIPS).map(async ([id, evidence]) => {
    try {
      const { routes } = await getAresepRoutes(undefined, id)
      const route = routes[0]
      if (!route) return []
      const physical = await getCorridorStops(route)
      if (physical.hasMore) return []
      return normalizeDerivedRoute(route, physical.stops, evidence)
        .map(feed => planDerivedJourney(feed, origin, destination)).filter(option => option !== null)
    } catch { return [] }
  }))
  return result.flat().sort((a, b) => a.totalTimeMinutes - b.totalTimeMinutes).slice(0, 5)
}
