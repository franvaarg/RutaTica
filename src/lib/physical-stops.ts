import type { PrismaClient, Prisma } from '@prisma/client';
import { db } from './db';
import { getBoundingBox, haversineDistance } from './spatial';
import type { PublicStop } from './stop-display';
export type StopQuery = { search?: string; source?: 'CTP' | 'GTFS'; lat?: number; lon?: number; radius?: number; bbox?: [number, number, number, number]; limit?: number; offset?: number; province?: string; canton?: string };

export function parseStopQuery(p: URLSearchParams): StopQuery {
  const source = p.get('source');
  if (source && source !== 'CTP' && source !== 'GTFS') throw new Error('Invalid source');
  let bbox: StopQuery['bbox'];
  if (p.has('bbox')) {
    const parts = p.get('bbox')!.split(',');
    const n = parts.map(Number);
    if (parts.length !== 4 || parts.some(s => !s.trim()) || n.some(v => !Number.isFinite(v)) || n[0] < -90 || n[2] > 90 || n[1] < -180 || n[3] > 180 || n[0] >= n[2] || n[1] >= n[3] || n[2] - n[0] > 1 || n[3] - n[1] > 1 || p.has('lat')) throw new Error('Invalid or oversized bbox');
    bbox = n as StopQuery['bbox'];
  }
  return { source: source as StopQuery['source'] || undefined, search: p.get('search') || undefined,
    lat: p.has('lat') ? Number(p.get('lat')) : undefined, lon: p.has('lon') ? Number(p.get('lon')) : undefined,
    radius: Number(p.get('radius') || 5), limit: Number(p.get('limit') || 20), offset: Number(p.get('offset') || 0),
    province: p.get('province') || undefined, canton: p.get('canton') || undefined, bbox };
}
export function missingCtpTable(error: unknown): boolean {
  return !!error && typeof error === 'object' && 'code' in error && error.code === 'P2021' && 'meta' in error && JSON.stringify(error.meta).includes('ctp_stops');
}
/** Display/search infrastructure only. Routing must keep using findNearestStops (GTFS). */
export async function queryPhysicalStops(q: StopQuery, client: PrismaClient = db) {
  const limit = Math.max(1, Math.min(q.limit ?? 20, 100)), offset = q.offset ?? 0;
  const radial = q.lat !== undefined && q.lon !== undefined;
  const bounds = q.bbox || (radial ? getBoundingBox(q.lat!, q.lon!, q.radius ?? 5) : undefined);
  const geo = bounds ? { lat: { gte: bounds[0], lte: bounds[2] }, lon: { gte: bounds[1], lte: bounds[3] } } : {};
  const gw: Prisma.GtfsStopWhereInput = { ...geo, location_type: 0,
    ...(q.search ? { OR: [{ name: { contains: q.search } }, { code: { contains: q.search } }, { desc: { contains: q.search } }] } : {}) };
  const cw: Prisma.CtpStopWhereInput = { ...geo, ...(q.province ? { province: q.province } : {}), ...(q.canton ? { canton: q.canton } : {}),
    ...(q.search ? { OR: [{ name: { contains: q.search } }, { sourceStopId: { contains: q.search } }, { province: { contains: q.search } }, { canton: { contains: q.search } }, { district: { contains: q.search } }] } : {}) };
  const useGtfs = q.source !== 'CTP' && !q.province && !q.canton;
  const useCtp = q.source !== 'GTFS';
  // Radial queries must rank ALL bounding-box candidates before limiting. No national scan.
  const take = radial ? undefined : offset + limit;
  const [gtfs, ctpResult, gtfsTotal, ctpTotal] = await Promise.all([
    useGtfs ? client.gtfsStop.findMany({ where: gw, take, orderBy: { stop_id: 'asc' }, select: {
      stop_id: true, name: true, lat: true, lon: true, code: true, desc: true, zone_id: true, wheelchair_boarding: true,
      _count: { select: { stopRoutes: true, stopTimes: true } },
    } }) : [],
    useCtp ? client.ctpStop.findMany({ where: cw, take, orderBy: { identityKey: 'asc' }, select: {
      identityKey: true, name: true, lat: true, lon: true, province: true, canton: true, district: true,
    } }).then(rows => ({ rows, available: true })).catch(error => { if (missingCtpTable(error)) return { rows: [], available: false }; throw error; }) : { rows: [], available: true },
    useGtfs && !radial ? client.gtfsStop.count({ where: gw }) : 0,
    useCtp && !radial ? client.ctpStop.count({ where: cw }).catch(error => { if (missingCtpTable(error)) return 0; throw error; }) : 0,
  ]);
  let stops: PublicStop[] = [
    ...gtfs.map(s => ({ id: `GTFS:${s.stop_id}`, stopId: s.stop_id, name: s.name, lat: s.lat, lon: s.lon, source: 'GTFS' as const,
      hasRouteData: s._count.stopRoutes > 0 || s._count.stopTimes > 0, routeCount: s._count.stopRoutes,
      province: null, canton: null, district: null, code: s.code, desc: s.desc, zoneId: s.zone_id, wheelchairBoarding: s.wheelchair_boarding })),
    ...ctpResult.rows.map(s => ({ id: `CTP:${s.identityKey}`, stopId: `CTP:${s.identityKey}`, name: s.name, lat: s.lat, lon: s.lon, source: 'CTP' as const,
      hasRouteData: false, routeCount: 0, province: s.province, canton: s.canton, district: s.district, code: null, desc: null, zoneId: null, wheelchairBoarding: null })),
  ];
  if (radial) stops = stops.map(s => ({ ...s, distanceKm: haversineDistance(q.lat!, q.lon!, s.lat, s.lon) }))
    .filter(s => s.distanceKm! <= (q.radius ?? 5)).sort((a,b) => a.distanceKm! - b.distanceKm! || a.id.localeCompare(b.id));
  // Stable GTFS-first ordering preserves existing no-coordinate pagination.
  const total = radial ? stops.length : gtfsTotal + ctpTotal;
  return { stops: stops.slice(offset, offset + limit), total, hasMore: offset + limit < total, ctpAvailable: ctpResult.available };
}
