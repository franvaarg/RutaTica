import { serviceDateTime } from './service-date';
type OtpPoint = { lat: number; lon: number };

export interface OtpRouteResult {
  distanceKm: number;
  durationMin: number;
  walkingDistanceKm: number;
  transfers: number;
  geometry: OtpPoint[];
  legs: Array<{
    mode: string;
    transitLeg: boolean;
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
  plan(from: $from, to: $to, date: $date, time: $time, numItineraries: 5, transportModes: [{mode: WALK}, {mode: TRANSIT}]) {
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

export function decodePolyline(encoded: string): OtpPoint[] {
  if (typeof encoded !== 'string' || encoded.length > 1_000_000) throw new Error('Invalid polyline');
  let index = 0, lat = 0, lon = 0;
  const points: OtpPoint[] = [];
  function delta() {
    let result = 0, shift = 0;
    while (true) {
      if (index >= encoded.length || shift > 30) throw new Error('Invalid polyline');
      const byte = encoded.charCodeAt(index++) - 63;
      if (byte < 0 || byte > 63) throw new Error('Invalid polyline');
      result |= (byte & 31) << shift;
      if (byte < 32) return result & 1 ? ~(result >>> 1) : result >>> 1;
      shift += 5;
    }
  }
  while (index < encoded.length) {
    lat += delta(); lon += delta();
    if (Math.abs(lat / 1e5) > 90 || Math.abs(lon / 1e5) > 180) throw new Error('Invalid polyline coordinates');
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
    const url = new URL(endpoint);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid OTP URL');
    const localDeparture = serviceDateTime(departure);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        operationName: 'RutaTicaPlan',
        query: OTP_QUERY,
        variables: {
          from: origin,
          to: destination,
          date: localDeparture.date,
          time: localDeparture.time,
        },
      }),
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`OTP HTTP ${response.status}`);
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Empty OTP response');
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 2 * 1024 * 1024) throw new Error('Oversized OTP response');
        chunks.push(value);
      }
    } finally { await reader.cancel(); }
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (payload.errors?.length) throw new Error(payload.errors[0]?.message || 'OTP GraphQL error');

    const itineraries = payload.data?.plan?.itineraries;
    if (!Array.isArray(itineraries)) throw new Error('Invalid OTP contract');
    return itineraries.slice(0, 5).map((itinerary: any) => {
      const nonnegative = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0;
      if (!nonnegative(itinerary.duration) || !nonnegative(itinerary.walkDistance) || !nonnegative(itinerary.numberOfTransfers) || !Number.isInteger(itinerary.numberOfTransfers) || !Array.isArray(itinerary.legs) || !itinerary.legs.length || itinerary.legs.some((l: any) => !nonnegative(l.distance) || !nonnegative(l.duration) || typeof l.mode !== 'string' || typeof l.transitLeg !== 'boolean' || (l.transitLeg && typeof l.route?.gtfsId !== 'string') || ['shortName','longName'].some(k => l.route?.[k] != null && typeof l.route[k] !== 'string') || (l.agency?.name != null && typeof l.agency.name !== 'string') || [l.from, l.to].some(p => !p || typeof p.name !== 'string' || !Number.isFinite(p.lat) || !Number.isFinite(p.lon) || Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180))) throw new Error('Invalid OTP itinerary');
      const legs = itinerary.legs.map((leg: any) => ({
        mode: leg.mode,
        transitLeg: leg.transitLeg,
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
    }).filter(itinerary => itinerary.legs.some((leg: OtpRouteResult['legs'][number]) => leg.transitLeg));
  } catch (error) {
    console.warn('[routing] OTP unavailable or invalid; using GTFS local', { reason: controller.signal.aborted ? 'timeout' : 'upstream_failure' });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
