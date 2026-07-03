import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
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
        // Nominatim unavailable, continue without coordinates
      }

      if (destLat && destLon) {
        // Redirect to the new best-route endpoint
        const baseUrl = request.nextUrl.origin;
        const departAfter = searchParams.get('departAfter') || '00:00:00';
        const bestRouteUrl = `${baseUrl}/api/best-route?originLat=${lat}&originLon=${lon}&destLat=${destLat}&destLon=${destLon}&departAfter=${departAfter}`;

        const bestRouteResponse = await fetch(bestRouteUrl);
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
    const message = error instanceof Error ? error.message : 'Error planning route';
    console.error('Error planning route:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}