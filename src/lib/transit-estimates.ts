/** Shared defaults; estimates never represent an operating timetable. */
export const TRANSIT_ESTIMATES = {
  averageBusSpeedKmh: 22,
  walkingSpeedKmh: 5,
  dwellMinutesPerStop: 0.4,
  maximumWalkingKm: 1,
  stopAssociationRadiusKm: 0.05,
} as const

export function estimateBusMinutes(distanceKm: number, stops: number, speedKmh: number = TRANSIT_ESTIMATES.averageBusSpeedKmh) {
  if (!Number.isFinite(distanceKm) || distanceKm < 0 || !Number.isFinite(speedKmh) || speedKmh <= 0) throw new Error('Invalid estimate input')
  return Math.max(1, Math.ceil(distanceKm / speedKmh * 60 + Math.max(0, stops - 1) * TRANSIT_ESTIMATES.dwellMinutesPerStop))
}
