import { NextResponse } from 'next/server'
import { normalizationReport } from '@/lib/normalized-transit'
import { db } from '@/lib/db'
/** Read-only runtime evidence, without credentials or administrative write access. */
export async function GET() {
  const [normalization, officialStops, officialRoutes, officialTrips, officialStopTimes] = await Promise.all([
    normalizationReport(), db.gtfsStop.count(), db.gtfsRoute.count(), db.gtfsTrip.count(), db.gtfsStopTime.count(),
  ])
  return NextResponse.json({ normalization, official: { stops: officialStops, routes: officialRoutes, trips: officialTrips, stopTimes: officialStopTimes } })
}
