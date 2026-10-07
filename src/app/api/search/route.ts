import { NextRequest, NextResponse } from 'next/server'
import { invalidQuery, badQuery } from '@/lib/api-validation'
import { COSTA_RICA_LOCATIONS, searchResultRank, type LocationSuggestion } from '@/lib/search-localities'
import { foldSearch, searchNormalizedStops } from '@/lib/normalized-transit'
import { GET as searchPlaces } from '../locations/search/route'

export async function GET(request: NextRequest) {
  if (invalidQuery(request.nextUrl.searchParams)) return badQuery()
  const q = request.nextUrl.searchParams.get('q')?.trim() || ''
  if (q.length < 2) return NextResponse.json({ results: [], places: [], stops: [] })
  const folded = foldSearch(q)
  const localities = COSTA_RICA_LOCATIONS.filter(p => foldSearch(p.name+' '+p.displayName).includes(folded)).map(p => ({ ...p, resultType: 'PLACE' as const }))
  const [stops, external] = await Promise.all([
    searchNormalizedStops(q),
    request.nextUrl.searchParams.get('places') === '1' ? searchPlaces(request).then(r => r.json()).then(d => (d.locations || []).map((p: LocationSuggestion) => ({ ...p, resultType: 'PLACE' as const }))).catch(() => []) : [],
  ])
  const places: LocationSuggestion[] = [...localities, ...external]
  const unique = new Map<string, LocationSuggestion>()
  for (const p of [...places,...stops].sort((a,b) => searchResultRank(a,q)-searchResultRank(b,q))) {
    const key = `${p.resultType}:${foldSearch(p.name)}:${p.lat.toFixed(5)}:${p.lon.toFixed(5)}`
    if (!unique.has(key)) unique.set(key,p)
  }
  const results = [...unique.values()].slice(0,12)
  return NextResponse.json({ results, places: results.filter(p => p.resultType === 'PLACE'), stops: results.filter(p => p.resultType === 'STOP') })
}
