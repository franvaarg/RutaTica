import { invalidQuery, badQuery } from '@/lib/api-validation';
import { NextRequest, NextResponse } from 'next/server';
import { parseStopQuery, queryPhysicalStops } from '@/lib/physical-stops';
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  if (invalidQuery(p) || !p.has('lat') || p.has('bbox')) return badQuery();
  let query;
  try { query = parseStopQuery(p); } catch { return badQuery(); }
  try {
    const result = await queryPhysicalStops({ ...query, radius: Number(p.get('radius') || 2), limit: Number(p.get('limit') || 50) });
    return NextResponse.json({ ...result, stops: result.stops.map(({ distanceKm, ...stop }) => ({ stop, distanceKm })) });
  } catch (error) {
    console.error('Error finding nearest stop:', { type: error instanceof Error ? error.name : 'UnknownError' });
    return NextResponse.json({ error: 'Error finding nearest stop' }, { status: 500 });
  }
}
