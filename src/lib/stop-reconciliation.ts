import { haversineDistance } from './spatial';
export type PhysicalStop = { id: string; lat: number; lon: number };
/** Proximity candidates only: no service assignment, identifier replacement or merging. */
export function reconcileStops(ctp: PhysicalStop[], gtfs: PhysicalStop[], thresholdKm = 0.05) {
  if (!Number.isFinite(thresholdKm) || thresholdKm <= 0 || thresholdKm > 1) throw new Error('Invalid match threshold');
  const cells = new Map<string, PhysicalStop[]>();
  for (const g of gtfs) {
    const key = `${Math.floor(g.lat * 100)}:${Math.floor(g.lon * 100)}`;
    cells.set(key, [...(cells.get(key) || []), g]);
  }
  const pairs: { ctpId: string; gtfsId: string; distanceKm: number }[] = [];
  for (const c of ctp) {
    const dy = Math.ceil(thresholdKm / 110 * 100) + 1;
    const dx = Math.ceil(thresholdKm / (110 * Math.max(0.01, Math.cos(c.lat * Math.PI / 180))) * 100) + 1;
    for (let y = -dy; y <= dy; y++) for (let x = -dx; x <= dx; x++) {
      for (const g of cells.get(`${Math.floor(c.lat * 100) + y}:${Math.floor(c.lon * 100) + x}`) || []) {
        const distanceKm = haversineDistance(c.lat, c.lon, g.lat, g.lon);
        if (distanceKm <= thresholdKm) pairs.push({ ctpId: c.id, gtfsId: g.id, distanceKm });
      }
    }
  }
  const cCounts = new Map<string, number>(), gCounts = new Map<string, number>();
  for (const p of pairs) { cCounts.set(p.ctpId, (cCounts.get(p.ctpId) || 0) + 1); gCounts.set(p.gtfsId, (gCounts.get(p.gtfsId) || 0) + 1); }
  return { thresholdKm, likelyOverlaps: pairs.filter(p => cCounts.get(p.ctpId) === 1 && gCounts.get(p.gtfsId) === 1),
    ambiguousMatches: pairs.filter(p => cCounts.get(p.ctpId)! > 1 || gCounts.get(p.gtfsId)! > 1),
    unmatchedCtp: ctp.filter(c => !cCounts.has(c.id)).map(c => c.id),
    unmatchedGtfs: gtfs.filter(g => !gCounts.has(g.id)).map(g => g.id) };
}
export function ciudadQuesadaCoverage(ctp: PhysicalStop[], gtfs: PhysicalStop[]) {
  const distances = (stops: PhysicalStop[]) => stops.map(s => ({ ...s, distanceKm: haversineDistance(10.3275, -84.4372, s.lat, s.lon) })).sort((a,b) => a.distanceKm - b.distanceKm);
  const c = distances(ctp), g = distances(gtfs);
  return { center: { lat: 10.3275, lon: -84.4372 }, radii: [1,5,10,25].map(radiusKm => {
    const ctp = c.filter(s => s.distanceKm <= radiusKm).length, gtfs = g.filter(s => s.distanceKm <= radiusKm).length;
    return { radiusKm, ctp, gtfs, combined: ctp + gtfs };
  }), nearestCtp: c[0] || null, nearestGtfs: g[0] || null };
}
