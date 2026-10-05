import { TRANSIT_ESTIMATES } from './transit-estimates'
import type { PlanatedRoute } from './planned-route'

/** Remaining call order follows the selected trip, including transfer calls. */
export function tripProgress(route: PlanatedRoute | null, passedIndex: number, elapsedMinutes: number) {
  const stops = route?._stops || []
  const nextIndex = Math.min(stops.length, Math.max(0, passedIndex + 1))
  const seconds = (time?: string) => {
    if (!time || !/^\d{2,}:\d{2}:\d{2}$/.test(time)) return null
    const [h, m, s] = time.split(':').map(Number)
    return h * 3600 + m * 60 + s
  }
  const end = seconds(stops.at(-1)?.arrivalTime)
  const current = seconds(stops[Math.max(0, passedIndex)]?.departureTime)
  const finalWalking = Math.max(0, (route?._walkingDistanceKm || 0) - (route?._boardingStopDistanceKm || 0)) / TRANSIT_ESTIMATES.walkingSpeedKmh * 60
  const scheduled = end !== null && current !== null && end >= current ? (end - current) / 60 + finalWalking : null
  const estimatedEnd = stops.at(-1)?.estimatedMinutesFromStart
  const estimatedCurrent = stops[Math.max(0, passedIndex)]?.estimatedMinutesFromStart
  const remainingByStops = scheduled ?? (estimatedEnd !== undefined && estimatedCurrent !== undefined ? Math.max(0, estimatedEnd - estimatedCurrent) + finalWalking : null)
  const byElapsed = route?.durationMin ? Math.max(0, route.durationMin - elapsedMinutes) : null
  return {
    nextStop: stops[nextIndex] || null,
    remainingStops: stops.length - nextIndex,
    remainingMinutes: nextIndex === stops.length && stops.length ? Math.ceil(finalWalking) : passedIndex < 0 && byElapsed !== null ? Math.ceil(byElapsed) : remainingByStops !== null
      ? Math.ceil(byElapsed === null ? remainingByStops : Math.min(remainingByStops, byElapsed))
      : byElapsed === null ? null : Math.ceil(byElapsed),
  }
}
