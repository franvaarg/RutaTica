type OtpPoint = { lat: number; lon: number };

export interface OtpRouteResult {
  distanceKm: number;
  durationMin: number;
  walkingDistanceKm: number;
  transfers: number;
  geometry: OtpPoint[];
  legs: Array<{
    mode: string;
    distanceKm: number;
    durationMin: number;
    geometry: OtpPoint[];
    from: { name: string; lat: number; lon: number };
    to: { name: string; lat: number; lon: number };
    route?: { gtfsId?: string; shortName?: string; longName?: string };
    agency?: string;
  }>;
}

const OTP_QUERY = `query RutaTicaPlan($from: InputCoordinates!, $to: InputCoordinates!, $date: String!, $time: String!) {
  plan(from: $from, to: $to, date: $date, time: $time, numItineraries: 5, transportModes: [WALK, TRANSIT]) {
    itineraries {
      duration
      walkDistance
      numberOfTransfers
      legs {
        mode
        distance
        duration
        transitLeg
        legGeometry { points }
        from { name lat lon }
        to { name lat lon }
        route { gtfsId shortName longName }
        agency { name }
      }
    }
  }
}`;

function decodePolyline(encoded: string): OtpPoint[] {
  const points: OtpPoint[] = [];
  let index = 0;
  let lat = 0;
  let lon = 0;
  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    lon += result & 1 ? ~(result >> 1) : result >> 1;
    points.push({ lat: lat / 1e5, lon: lon / 1e5 });
  }
  return points;
}

export async function planWithOtp(
  origin: OtpPoint,
  destination: OtpPoint,
  departure: Date
): Promise<OtpRouteResult[] | null> {
  const endpoint = process.env.OPEN_TRIP_PLANNER_URL?.trim();
  if (!endpoint) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        operationName: 'RutaTicaPlan',
        query: OTP_QUERY,
        variables: {
          from: origin,
          to: destination,
          date: departure.toISOString().slice(0, 10),
          time: departure.toTimeString().slice(0, 8),
        },
      }),
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`OTP HTTP ${response.status}`);
    const payload = await response.json();
    if (payload.errors?.length) throw new Error(payload.errors[0]?.message || 'OTP GraphQL error');

    const itineraries = payload.data?.plan?.itineraries;
    if (!Array.isArray(itineraries)) return [];
    return itineraries.map((itinerary: any) => {
      const legs = (itinerary.legs || []).map((leg: any) => ({
        mode: leg.mode,
        distanceKm: Number(leg.distance || 0) / 1000,
        durationMin: Number(leg.duration || 0) / 60,
        geometry: leg.legGeometry?.points ? decodePolyline(leg.legGeometry.points) : [],
        from: leg.from,
        to: leg.to,
        route: leg.route || undefined,
        agency: leg.agency?.name,
      }));
      return {
        distanceKm: legs.reduce((sum: number, leg: any) => sum + leg.distanceKm, 0),
        durationMin: Number(itinerary.duration || 0) / 60,
        walkingDistanceKm: Number(itinerary.walkDistance || 0) / 1000,
        transfers: Number(itinerary.numberOfTransfers || 0),
        geometry: legs.flatMap((leg: any) => leg.geometry),
        legs,
      };
    });
  } catch (error) {
    console.warn('OpenTripPlanner no disponible; se usará GTFS local:', error instanceof Error ? error.message : error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
