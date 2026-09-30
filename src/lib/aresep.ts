import { db, type PrismaClient } from './db';
import { corridorBounds, pointToPolylineKm } from './route-corridor';
import type { AresepRoute, CorridorStop } from './aresep-types';
import { missingCtpTable } from './physical-stops';
// Published by ARESEP: https://aresep.go.cr/datos-abiertos/rutas-autobuses/
const LAYER = 'https://mapas.aresep.go.cr/server/rest/services/I_Transporte_Externo_PII/I_Transporte_Externo_PII/MapServer/5/query';
export async function getAresepRoutes(bbox?: [number, number, number, number], id?: string) {
  const p = new URLSearchParams({ f: 'json', outSR: '4326', returnGeometry: 'true',
    outFields: 'OBJECTID_1,CODCTP2019,RUTACTP2019,OPERADOR,CANTONINICIO,CANTONFINAL',
    where: '1=1', resultRecordCount: '8', orderByFields: 'OBJECTID_1' });
  if (id) p.set('objectIds', id);
  else if (bbox) {
    p.set('geometry', JSON.stringify({ xmin: bbox[1], ymin: bbox[0], xmax: bbox[3], ymax: bbox[2], spatialReference: { wkid: 4326 } }));
    p.set('geometryType', 'esriGeometryEnvelope'); p.set('inSR', '4326'); p.set('spatialRel', 'esriSpatialRelIntersects');
  } else throw new Error('Area required');
  const response = await fetch(`${LAYER}?${p}`, { signal: AbortSignal.timeout(12000), next: { revalidate: 3600 } });
  if (!response.ok) throw new Error('ARESEP unavailable');
  const body = await response.json();
  if (body.error || !Array.isArray(body.features)) throw new Error('Invalid ARESEP response');
  const routes: AresepRoute[] = body.features.map((f: any) => {
    const a = f.attributes;
    if (!a || !Number.isInteger(a.OBJECTID_1) || !Array.isArray(f.geometry?.paths)) throw new Error('Invalid ARESEP feature');
    const paths = f.geometry.paths.map((path: any[]) => path.map((p: number[]) => {
      if (!Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1]) || p[0] < -86 || p[0] > -82 || p[1] < 8 || p[1] > 12) throw new Error('Invalid WGS84 geometry');
      return { lon: p[0], lat: p[1] };
    })).filter((path: any[]) => path.length > 1);
    return { id: String(a.OBJECTID_1), routeNumber: a.CODCTP2019 || a.RUTACTP2019 || '', operator: a.OPERADOR?.trim() || null,
      description: a.RUTACTP2019?.trim() || [a.CANTONINICIO, a.CANTONFINAL].filter(Boolean).join(' → ') || null, paths, source: 'ARESEP' as const };
  }).filter((r: AresepRoute) => r.paths.length);
  return { routes, hasMore: !!body.exceededTransferLimit };
}
export async function getCorridorStops(route: AresepRoute, client: PrismaClient = db) {
  const radiusKm = 0.1;
  const [south, west, north, east] = corridorBounds(route.paths, radiusKm);
  try {
    const candidates = await client.ctpStop.findMany({ where: { lat: { gte: south, lte: north }, lon: { gte: west, lte: east } },
      select: { identityKey: true, name: true, lat: true, lon: true, province: true, canton: true, district: true } });
    const matched = candidates.filter(stop => route.paths.some(path => pointToPolylineKm(stop, path) <= radiusKm));
    const stops: CorridorStop[] = matched.slice(0, 500).map(s => ({ id: `CTP:${s.identityKey}`, name: s.name, lat: s.lat, lon: s.lon,
      province: s.province, canton: s.canton, district: s.district, source: 'CTP', relationship: 'Cercana al recorrido ARESEP' }));
    return { stops, total: matched.length, hasMore: matched.length > stops.length, ctpAvailable: true, radiusKm };
  } catch (error) {
    if (missingCtpTable(error)) return { stops: [], total: 0, hasMore: false, ctpAvailable: false, radiusKm };
    throw error;
  }
}
