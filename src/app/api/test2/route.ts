import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    // Verificar si db.stop existe
    const hasStop = typeof db.stop !== 'undefined'
    const hasRouteStop = typeof db.routeStop !== 'undefined'

    let stops = []
    let routeStops = []

    if (hasStop) {
      stops = await db.stop.findMany({ take: 3 })
    }

    if (hasRouteStop) {
      routeStops = await db.routeStop.findMany({ take: 3 })
    }

    return NextResponse.json({
      success: true,
      hasStop,
      hasRouteStop,
      stopsCount: stops.length,
      routeStopsCount: routeStops.length,
      dbKeys: Object.keys(db).filter(k => !k.startsWith('_') && k !== 'constructor'),
    })
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
      dbKeys: Object.keys(db).filter(k => !k.startsWith('_') && k !== 'constructor'),
    })
  }
}
