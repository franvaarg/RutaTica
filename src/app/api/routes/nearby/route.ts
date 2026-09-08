import { NextRequest, NextResponse } from 'next/server';
import { findNearestStops } from '@/lib/spatial';
import { db } from '@/lib/db';
import { invalidQuery, badQuery } from '@/lib/api-validation';
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  if (invalidQuery(p) || !p.has('lat') || !p.has('lon')) return badQuery();
  try {
    const stops = await findNearestStops(Number(p.get('lat')), Number(p.get('lon')), Number(p.get('radius') || 2), 50);
    const routes = await db.gtfsRoute.findMany({ where: { stopRoutes: { some: { stopId: { in: stops.map(s => s.stop.stop_id) } } } }, take: 100, orderBy: { route_id: 'asc' } });
    return NextResponse.json({ success: true, routes, count: routes.length });
  } catch {
    console.error('[routes/nearby] database query failed');
    return NextResponse.json({ error: 'No se pudieron consultar rutas cercanas' }, { status: 503 });
  }
}
