import { NextResponse } from 'next/server';

export function invalidQuery(params: URLSearchParams): boolean {
  for (const [key, value] of params) {
    if (value.length > 256 || params.getAll(key).length > 1) return true;
    if (['lat', 'originLat', 'destLat', 'lon', 'originLon', 'destLon', 'radius', 'limit', 'offset'].includes(key)) {
      const n = Number(value);
      if (!value.trim() || !Number.isFinite(n)) return true;
      if (key.toLowerCase().endsWith('lat') && Math.abs(n) > 90) return true;
      if (key.toLowerCase().endsWith('lon') && Math.abs(n) > 180) return true;
      if (key === 'radius' && (n <= 0 || n > 50)) return true;
      if (key === 'limit' && (!Number.isInteger(n) || n < 1 || n > 100)) return true;
      if (key === 'offset' && (!Number.isInteger(n) || n < 0 || n > 10000)) return true;
    }
  }
  return params.has('lat') !== params.has('lon');
}
export function badQuery() {
  return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 });
}
