import { GET as bestRoute } from '../../best-route/route';
import { invalidQuery, badQuery } from '@/lib/api-validation';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    if (invalidQuery(searchParams)) return badQuery();
    const lat = searchParams.get('lat');
    const lon = searchParams.get('lon');
    const destination = searchParams.get('destination');

    if (lat && lon && destination) {
      // Try Nominatim lookup for the destination to get coordinates
      let destLat: string | null = null;
      let destLon: string | null = null;

      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(destination + ', Costa Rica')}&limit=1&countrycodes=CR`,
          {
            signal: AbortSignal.timeout(8000),
            headers: {
              'User-Agent': 'RutaTica/2.0 (https://rutatica.app)',
            },
          }
        );
        if (response.ok) {
          const data = await response.json();
          if (data.length > 0) {
            destLat = data[0].lat;
            destLon = data[0].lon;
          }
        }
      } catch {
        console.warn('[routes/plan] destination lookup unavailable');
        return NextResponse.json({ success: false, error: 'Búsqueda de destino no disponible', routes: [] }, { status: 503 });
      }

      if (destLat && destLon) {
        // Redirect to the new best-route endpoint
        const url = request.nextUrl.clone();
        url.search = new URLSearchParams({ originLat: lat, originLon: lon, destLat, destLon }).toString();
        const departAfter = searchParams.get('departAfter');
        if (departAfter) url.searchParams.set('departAfter', departAfter);
        const bestRouteResponse = await bestRoute(new NextRequest(url));
        if (!bestRouteResponse.ok) return bestRouteResponse;
        if (bestRouteResponse.ok) {
          const data = await bestRouteResponse.json();
          return NextResponse.json({
            success: true,
            location: { latitude: parseFloat(lat), longitude: parseFloat(lon) },
            destination,
            ...data,
          });
        }
      }
    }

    // Fallback: return empty results with the old format
    return NextResponse.json({
      success: true,
      location: lat && lon ? { latitude: parseFloat(lat), longitude: parseFloat(lon) } : null,
      destination: destination || null,
      routes: [],
      message: lat && lon && destination
        ? 'Could not resolve destination coordinates. Try using the /api/best-route endpoint directly with lat/lon coordinates.'
        : 'This endpoint now delegates to /api/best-route. Please provide lat, lon, and destination query parameters.',
    });
  } catch (error: unknown) {
    const message = 'Error planning route';
    console.error('Error planning route:', { type: error instanceof Error ? error.name : 'UnknownError' });
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}