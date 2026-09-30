export type CorridorPoint = { lat: number; lon: number };
/** Local tangent-plane distance to segments in km; geometry remains in WGS84. */
export function pointToPolylineKm(point: CorridorPoint, path: CorridorPoint[]): number {
  const sx = 111.195 * Math.cos(point.lat * Math.PI / 180), sy = 111.195;
  let best = Infinity;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const ax = (a.lon - point.lon) * sx, ay = (a.lat - point.lat) * sy;
    const dx = (b.lon - a.lon) * sx, dy = (b.lat - a.lat) * sy;
    const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}
export function corridorBounds(paths: CorridorPoint[][], radiusKm: number): [number, number, number, number] {
  const points = paths.flat();
  const minLat = Math.min(...points.map(p => p.lat)), maxLat = Math.max(...points.map(p => p.lat));
  const paddingLat = radiusKm / 111.195;
  const paddingLon = paddingLat / Math.cos(Math.max(Math.abs(minLat), Math.abs(maxLat)) * Math.PI / 180);
  return [minLat - paddingLat, Math.min(...points.map(p => p.lon)) - paddingLon, maxLat + paddingLat, Math.max(...points.map(p => p.lon)) + paddingLon];
}
