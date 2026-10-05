import { PrismaClient, Prisma } from '@prisma/client'
import path from 'node:path'
import { inflateSync } from 'node:zlib'
import { db } from './db'
import { isPassengerStop } from './passenger-stops'
import { planDerivedJourney, type DerivedRoute } from './derived-transit'
import type { Coordinate } from './spatial'
import type { LocationSuggestion } from './search-localities'

const globalSnapshot = globalThis as unknown as { normalizedTransit?: PrismaClient }
export const normalizedTransit = globalSnapshot.normalizedTransit ?? new PrismaClient({ datasourceUrl: `file:${path.join(process.cwd(), 'db/normalized.db')}` })
globalSnapshot.normalizedTransit = normalizedTransit
const decodeFeed = (payload: Uint8Array | string) => JSON.parse(inflateSync(typeof payload === 'string' ? Buffer.from(payload, 'base64') : payload).toString())
export const foldSearch = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()
type StopRow = { stop_id: string; stop_name: string; stop_lat: number; stop_lon: number; locality: string; district: string; canton: string; province: string }
export async function searchNormalizedStops(query: string): Promise<LocationSuggestion[]> {
  const tokens = foldSearch(query).match(/[\p{L}\p{N}]+/gu)?.filter(t => t.length >= 2) || []
  if (!tokens.length) return []
  const rows = await normalizedTransit.$queryRaw<StopRow[]>(Prisma.sql`
    SELECT s.* FROM NormalizedStop s WHERE ${Prisma.join(tokens.map(t => Prisma.sql`s.stop_id IN (SELECT stop_id FROM StopToken WHERE token>=${t} AND token<${t+'\uffff'})`), ' AND ')}
    ORDER BY CASE WHEN search_text LIKE ${foldSearch(query)+'%'} THEN 0 ELSE 1 END, stop_name LIMIT 8`)
  const official = await db.gtfsStop.findMany({ where: { location_type: 0 }, select: { stop_id: true, name: true, lat: true, lon: true, desc: true } })
  const gtfs = official.filter(s => isPassengerStop(s.name, s.desc || '') && tokens.every(t => foldSearch(s.name+' '+(s.desc || '')).includes(t)))
    .slice(0, 6).map(s => ({ id: `official:${s.stop_id}`, stopId: s.stop_id, stopName: s.name, name: s.name, displayName: s.name, fullAddress: '', lat: s.lat, lon: s.lon, type: 'parada' as const, resultType: 'STOP' as const }))
  return [...gtfs, ...rows.map(s => ({ id: s.stop_id, stopId: s.stop_id, stopName: s.stop_name, name: s.stop_name, displayName: s.stop_name,
    fullAddress: [...new Set([s.district, s.canton, s.province].filter(Boolean))].join(', '), lat: s.stop_lat, lon: s.stop_lon,
    type: 'parada' as const, resultType: 'STOP' as const, locality: s.locality, district: s.district, canton: s.canton, province: s.province,
    locationData: { localidad: s.locality, canton: s.canton, provincia: s.province } }))].slice(0, 8)
}
export async function findNormalizedJourneys(origin: Coordinate, destination: Coordinate, originStopId?: string, destinationStopId?: string) {
  const rows = await normalizedTransit.$queryRaw<Array<{ payload: Uint8Array }>>(Prisma.sql`
    SELECT payload FROM RouteFeed WHERE south<=${Math.min(origin.lat,destination.lat)+.01} AND north>=${Math.max(origin.lat,destination.lat)-.01}
    AND west<=${Math.min(origin.lon,destination.lon)+.01} AND east>=${Math.max(origin.lon,destination.lon)-.01}
    ${originStopId ? Prisma.sql`AND route_id IN (SELECT route_id FROM RouteStop WHERE stop_id=${originStopId})` : Prisma.empty}
    ${destinationStopId ? Prisma.sql`AND route_id IN (SELECT route_id FROM RouteStop WHERE stop_id=${destinationStopId})` : Prisma.empty}`)
  return rows.map(row => planDerivedJourney(decodeFeed(row.payload) as DerivedRoute, origin, destination, { allowInferred: true, originStopId, destinationStopId }))
    .filter(route => route !== null).sort((a,b) => a.totalTimeMinutes-b.totalTimeMinutes).slice(0,5)
}
export async function normalizationReport() {
  const rows = await normalizedTransit.$queryRaw<Array<{ payload: string }>>`SELECT payload FROM NormalizationReport WHERE id=1`
  const [stops, routes, associations, sampleStop, sampleRoute, validStops, servedRoutes] = await Promise.all([
    normalizedTransit.$queryRaw<Array<{ count: bigint }>>`SELECT count(*) count FROM NormalizedStop`,
    normalizedTransit.$queryRaw<Array<{ count: bigint }>>`SELECT count(*) count FROM RouteFeed`,
    normalizedTransit.$queryRaw<Array<{ count: bigint }>>`SELECT count(*) count FROM RouteStop`,
    normalizedTransit.$queryRaw<StopRow[]>`SELECT * FROM NormalizedStop LIMIT 1`,
    normalizedTransit.$queryRaw<Array<{ payload: Uint8Array }>>`SELECT payload FROM RouteFeed WHERE route_id IN (SELECT route_id FROM RouteStop GROUP BY route_id HAVING count(*)>=2) LIMIT 1`,
    normalizedTransit.$queryRaw<Array<{ ids: bigint; names: bigint; coordinates: bigint }>>`SELECT
      sum(CASE WHEN length(stop_id)>0 THEN 1 ELSE 0 END) ids,
      sum(CASE WHEN length(trim(stop_name))>0 THEN 1 ELSE 0 END) names,
      sum(CASE WHEN stop_lat BETWEEN 8 AND 12 AND stop_lon BETWEEN -86 AND -82 THEN 1 ELSE 0 END) coordinates FROM NormalizedStop`,
    normalizedTransit.$queryRaw<Array<{ associated: bigint; ordered: bigint }>>`SELECT count(*) associated, sum(CASE WHEN calls>=2 THEN 1 ELSE 0 END) ordered FROM (SELECT route_id,count(*) calls FROM RouteStop GROUP BY route_id)`,
  ])
  const feed = sampleRoute[0] ? decodeFeed(sampleRoute[0].payload) : null
  return { ...JSON.parse(rows[0].payload), validStopIds: Number(validStops[0].ids), validStopNames: Number(validStops[0].names), validStopCoordinates: Number(validStops[0].coordinates),
    routesWithAssociatedStops: Number(servedRoutes[0].associated), routesWithOrderedSequence: Number(servedRoutes[0].ordered),
    runtimeCounts: { stops: Number(stops[0].count), routes: Number(routes[0].count), associations: Number(associations[0].count) },
    sampleStop: sampleStop[0], sampleRoute: feed?.route, sampleShape: feed?.shapes[0], sampleTrip: feed?.trip, sampleStopTimes: feed?.stop_times.slice(0,2) }
}
