import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { haversineDistance } from '@/lib/spatial';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search') || '';
    const latStr = searchParams.get('lat');
    const lonStr = searchParams.get('lon');
    const radius = parseFloat(searchParams.get('radius') || '5');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');

    const hasCoords = latStr && lonStr && !isNaN(parseFloat(latStr)) && !isNaN(parseFloat(lonStr));
    const lat = hasCoords ? parseFloat(latStr!) : 0;
    const lon = hasCoords ? parseFloat(lonStr!) : 0;

    const where: Record<string, unknown> = { location_type: 0 };

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { code: { contains: search } },
        { desc: { contains: search } },
      ];
    }

    let stops = await db.gtfsStop.findMany({
      where,
      select: {
        stop_id: true,
        code: true,
        name: true,
        desc: true,
        lat: true,
        lon: true,
        zone_id: true,
        location_type: true,
        parent_station: true,
        wheelchair_boarding: true,
        _count: {
          select: { stopRoutes: true },
        },
      },
      orderBy: { stop_id: 'asc' },
      take: hasCoords ? 500 : limit,
      skip: hasCoords ? 0 : offset,
    });

    if (hasCoords) {
      stops = stops
        .map((stop) => ({
          ...stop,
          distanceKm: haversineDistance(lat, lon, stop.lat, stop.lon),
        }))
        .filter((stop) => stop.distanceKm <= radius)
        .sort((a, b) => a.distanceKm - b.distanceKm)
        .slice(offset, offset + limit);

      return NextResponse.json({
        stops: stops.map((s) => ({
          stopId: s.stop_id,
          code: s.code,
          name: s.name,
          desc: s.desc,
          lat: s.lat,
          lon: s.lon,
          zoneId: s.zone_id,
          wheelchairBoarding: s.wheelchair_boarding,
          routeCount: s._count.stopRoutes,
          distanceKm: Math.round(s.distanceKm * 1000) / 1000,
        })),
        total: stops.length,
      });
    }

    const total = await db.gtfsStop.count({ where });

    return NextResponse.json({
      stops: stops.map((s) => ({
        stopId: s.stop_id,
        code: s.code,
        name: s.name,
        desc: s.desc,
        lat: s.lat,
        lon: s.lon,
        zoneId: s.zone_id,
        wheelchairBoarding: s.wheelchair_boarding,
        routeCount: s._count.stopRoutes,
      })),
      total,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error fetching stops';
    console.error('Error fetching stops:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}