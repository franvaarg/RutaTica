import { invalidQuery, badQuery } from '@/lib/api-validation';
import { NextRequest, NextResponse } from 'next/server';
import { findNearestStops } from '@/lib/spatial';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    if (invalidQuery(searchParams)) return badQuery();
    const latStr = searchParams.get('lat');
    const lonStr = searchParams.get('lon');
    const radius = parseFloat(searchParams.get('radius') || '2');

    if (!latStr || !lonStr) {
      return NextResponse.json(
        { error: 'lat and lon query parameters are required' },
        { status: 400 }
      );
    }

    const lat = parseFloat(latStr);
    const lon = parseFloat(lonStr);

    if (isNaN(lat) || isNaN(lon)) {
      return NextResponse.json(
        { error: 'Invalid coordinates' },
        { status: 400 }
      );
    }

    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return NextResponse.json(
        { error: 'Coordinates out of range' },
        { status: 400 }
      );
    }

    const results = await findNearestStops(lat, lon, radius, 50);

    const stops = results.map((r) => ({
      stop: {
        stopId: r.stop.stop_id,
        code: r.stop.code,
        name: r.stop.name,
        desc: r.stop.desc,
        lat: r.stop.lat,
        lon: r.stop.lon,
        zoneId: r.stop.zone_id,
        wheelchairBoarding: r.stop.wheelchair_boarding,
      },
      distanceKm: Math.round(r.distanceKm * 1000) / 1000,
    }));

    return NextResponse.json({ stops });
  } catch (error: unknown) {
    const message = 'Error finding nearest stop';
    console.error('Error finding nearest stop:', { type: error instanceof Error ? error.name : 'UnknownError' });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}