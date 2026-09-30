import { NextRequest, NextResponse } from 'next/server';
import { parseStopQuery } from '@/lib/physical-stops';
import { getAresepRoutes, getCorridorStops } from '@/lib/aresep';
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const id = p.get('id');
  let bbox;
  try {
    if (id) { if (!/^\d{1,10}$/.test(id)) throw new Error('Invalid ID'); }
    else { bbox = parseStopQuery(p).bbox; if (!bbox) throw new Error('Area required'); }
  } catch { return NextResponse.json({ error: 'Invalid area or route' }, { status: 400 }); }
  try {
    const result = await getAresepRoutes(bbox, id || undefined);
    if (id) {
      const route = result.routes[0];
      if (!route) return NextResponse.json({ error: 'Route not found' }, { status: 404 });
      return NextResponse.json({ route, ...await getCorridorStops(route) });
    }
    const routes = await Promise.all(result.routes.map(async route => {
      const { total, ctpAvailable } = await getCorridorStops(route);
      return { ...route, nearbyStopCount: total, ctpAvailable };
    }));
    return NextResponse.json({ routes, hasMore: result.hasMore, source: 'ARESEP' });
  } catch { return NextResponse.json({ error: 'Recorridos ARESEP temporalmente no disponibles.' }, { status: 503 }); }
}
