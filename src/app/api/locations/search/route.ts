import { queryPhysicalStops } from '@/lib/physical-stops';
import { stopNotice } from '@/lib/stop-display';
import { invalidQuery, badQuery } from '@/lib/api-validation';
import { NextRequest, NextResponse } from 'next/server'

// Cache simple en memoria para reducir solicitudes a Nominatim
const searchCache = new Map<string, any>()
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutos en milisegundos

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    if (invalidQuery(searchParams)) return badQuery();
    const query = searchParams.get('q')

    if (!query || query.trim().length < 2) {
      return NextResponse.json({
        success: true,
        locations: [],
      })
    }

    // Explicit stop autocomplete avoids conflating physical infrastructure with settlements.
    if (searchParams.get('type') === 'stop') {
      const result = await queryPhysicalStops({ search: query, limit: 6 });
      return NextResponse.json({ success: true, ctpAvailable: result.ctpAvailable, locations: result.stops.map(s => ({
        ...s, type: 'lugar', displayName: `${s.name} — ${s.source}`, fullAddress: stopNotice(s),
        locationData: { provincia: s.province || '', canton: s.canton || '', localidad: s.district || '', barrio: '' },
      })) });
    }

    // Verificar cache
    const cacheKey = query.toLowerCase().trim()
    const cached = searchCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return NextResponse.json({
        success: true,
        locations: cached.data,
      })
    }

    // Usar la API de búsqueda de Nominatim para encontrar lugares en Costa Rica
    // Agregamos límites específicos para Costa Rica
    let data
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=8&countrycodes=CR&featuretype=settlement,neighbourhood&accept-language=es`,
        {
          signal: AbortSignal.timeout(8000),
        headers: {
            'User-Agent': 'BusApp/1.0 (https://busapp.example.com)',
            'Accept-Language': 'es',
          },
        }
      )

      if (!response.ok) {
        throw new Error(`Nominatim API error: ${response.status}`)
      }

      const text = await response.text()
      
      // Verificar si la respuesta es HTML (error de límite)
      if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
        throw new Error('Nominatim rate limit exceeded')
      }

      data = JSON.parse(text)
    } catch (error: any) {
      console.error('Error fetching from Nominatim:', { type: error instanceof Error ? error.name : 'UnknownError' })
      
      // Si es error de límite, devolver datos del cache si existen
      if (error.message?.includes('rate limit') || error.message?.includes('SyntaxError')) {
        console.log('Using cached data due to API limit')
      }
      
      // Intentar devolver datos en cache aunque estén expirados
      if (cached && cached.data) {
        return NextResponse.json({
          success: true,
          locations: cached.data,
          fromCache: true,
        })
      }

      return NextResponse.json({
        success: false,
        error: 'Servicio de búsqueda temporalmente no disponible. Intenta en unos minutos.',
        locations: [],
      }, { status: 503 })
    }

    // Filtrar y formatear los resultados
    const locations = (data || [])
      .filter((item: any) => {
        // Solo incluir barrios, localidades, ciudades
        const validTypes = ['neighbourhood', 'suburb', 'village', 'town', 'city', 'hamlet']
        return validTypes.includes(item.type) || item.class === 'place'
      })
      .map((item: any) => {
        // Determinar el tipo para mostrar icono
        let type = 'lugar'
        if (item.type === 'neighbourhood' || item.type === 'suburb') {
          type = 'barrio'
        } else if (item.type === 'village' || item.type === 'hamlet') {
          type = 'localidad'
        } else if (item.type === 'town' || item.type === 'city') {
          type = 'ciudad'
        }

        // Extraer barrio, localidad, cantón y provincia
        let barrio = ''
        let localidad = ''
        let canton = ''
        let provincia = ''

        if (item.address) {
          // Barrio (neighbourhood o suburb)
          if (item.type === 'neighbourhood' || item.type === 'suburb') {
            barrio = item.name
          } else if (item.address.neighbourhood || item.address.suburb) {
            barrio = item.address.neighbourhood || item.address.suburb
          }

          // Localidad (village o hamlet)
          if (item.type === 'village' || item.type === 'hamlet') {
            localidad = item.name
          } else if (item.address.village || item.address.hamlet) {
            localidad = item.address.village || item.address.hamlet
          }

          // Cantón (county)
          if (item.address.county) {
            canton = item.address.county
          }

          // Provincia (state)
          provincia = item.address.state || ''
        }

        // Construir nombre de visualización: barrio - localidad - cantón - provincia
        const displayParts: string[] = []
        if (barrio) displayParts.push(barrio)
        if (localidad) displayParts.push(localidad)
        if (canton) displayParts.push(canton)
        if (provincia) displayParts.push(provincia)

        return {
          id: item.place_id || item.osm_id,
          name: item.name,
          displayName: displayParts.join(' - '),
          type: type,
          lat: parseFloat(item.lat),
          lon: parseFloat(item.lon),
          fullAddress: item.display_name,
          locationData: {
            barrio,
            localidad,
            canton,
            provincia
          }
        }
      })
      .slice(0, 6) // Limitar a 6 resultados

    // Guardar en cache
    if (searchCache.size >= 200) searchCache.delete(searchCache.keys().next().value!);
    searchCache.set(cacheKey, {
      data: locations,
      timestamp: Date.now(),
    })

    // Limpiar cache antiguo (más de 5 minutos)
    const now = Date.now()
    for (const [key, value] of searchCache.entries()) {
      if (now - value.timestamp > CACHE_DURATION) {
        searchCache.delete(key)
      }
    }

    return NextResponse.json({
      success: true,
      locations,
    })
  } catch (error: any) {
    console.error('Error al buscar ubicaciones:', { type: error instanceof Error ? error.name : 'UnknownError' })
    return NextResponse.json(
      {
        success: false,
        error: 'Error al buscar ubicaciones',
        locations: [],
      },
      { status: 500 }
    )
  }
}
