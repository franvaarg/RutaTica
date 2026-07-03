import { NextRequest, NextResponse } from 'next/server'

// Importar Prisma de forma dinámica para evitar problemas de caché
let db: any = null

async function getDb() {
  if (!db) {
    const { PrismaClient } = await import('@prisma/client')
    db = new PrismaClient()
  }
  return db
}

// Función para buscar coordenadas de un destino usando Nominatim
async function searchCoordinates(destination: string): Promise<{ lat: number; lon: number; displayName: string } | null> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(destination + ', Costa Rica')}&addressdetails=1&limit=1&countrycodes=CR`
    )

    if (!response.ok) {
      return null
    }

    const data = await response.json()

    if (data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon),
        displayName: data[0].display_name
      }
    }

    return null
  } catch (error) {
    console.error('Error al buscar coordenadas en Nominatim:', error)
    return null
  }
}

// Formatea una parada agregando un objeto `coordinates` anidado, que es la forma
// que espera el frontend (page.tsx / map.tsx). Antes esta función no existía y se
// devolvía el registro plano de la base de datos (con latitude/longitude sueltos),
// lo que hacía que `boardingStop.coordinates` y `destinationStop.coordinates`
// fueran siempre `undefined` en el cliente, rompiendo silenciosamente el trazado
// de las rutas a pie/bus y los marcadores correspondientes en el mapa.
function formatStop(stop: any) {
  if (!stop) return null
  return {
    ...stop,
    coordinates: {
      latitude: stop.latitude,
      longitude: stop.longitude,
    },
  }
}

// Calcular distancia entre dos coordenadas usando la fórmula de Haversine
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371 // Radio de la Tierra en km
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export async function GET(request: NextRequest) {
  try {
    const db = await getDb()

    const searchParams = request.nextUrl.searchParams
    const lat = searchParams.get('lat')
    const lon = searchParams.get('lon')
    const destination = searchParams.get('destination')

    if (!lat || !lon || !destination) {
      return NextResponse.json(
        { error: 'Se requieren latitud, longitud y destino' },
        { status: 400 }
      )
    }

    const latitude = parseFloat(lat)
    const longitude = parseFloat(lon)

    if (isNaN(latitude) || isNaN(longitude)) {
      return NextResponse.json(
        { error: 'Coordenadas inválidas' },
        { status: 400 }
      )
    }

    // Buscar todas las rutas activas
    const allRoutes = await db.busRoute.findMany({
      where: {
        isActive: true,
      },
      include: {
        company: {
          select: {
            id: true,
            name: true,
          },
        },
        prices: {
          where: {
            isActive: true,
            validFrom: {
              lte: new Date(),
            },
            OR: [
              { validTo: null },
              { validTo: { gte: new Date() } },
            ],
          },
          orderBy: { price: 'asc' },
        },
      },
    })

    // Filtrar en JavaScript para búsqueda case-insensitive
    const destinationRoutes = allRoutes.filter(
      (route) =>
        route.destination.toLowerCase().includes(destination.toLowerCase()) ||
        route.origin.toLowerCase().includes(destination.toLowerCase())
    )

    // Si no encontramos rutas por nombre, intentar buscar coordenadas del destino
    let destinationCoordinates: { lat: number; lon: number } | null = null

    if (destinationRoutes.length === 0) {
      // Buscar coordenadas del destino en Nominatim
      const coords = await searchCoordinates(destination)
      if (coords) {
        destinationCoordinates = { lat: coords.lat, lon: coords.lon }
      }
    }

    if (destinationRoutes.length === 0 && !destinationCoordinates) {
      return NextResponse.json({
        success: true,
        location: {
          latitude,
          longitude,
        },
        destination,
        routes: [],
        message: 'No se encontraron rutas hacia ese destino',
      })
    }

    // Buscar todas las paradas activas
    const allStops = await db.stop.findMany({
      where: { isActive: true },
    })

    // Buscar todas las relaciones ruta-parada
    const allRouteStops = await db.routeStop.findMany({
      where: { isActive: true },
    })

    // Encontrar la parada más cercana a la ubicación del usuario
    let nearestStop = null
    let minDistance = Infinity

    for (const stop of allStops) {
      const distance = calculateDistance(latitude, longitude, stop.latitude, stop.longitude)
      if (distance < minDistance) {
        minDistance = distance
        nearestStop = stop
      }
    }

    // Filtrar las rutas para encontrar las que pasan por paradas cercanas
    const availableRoutes = []

    for (const route of destinationRoutes) {
      const lowestPrice = route.prices.length > 0 ? route.prices[0] : null

      // Obtener las paradas de esta ruta
      const routeStops = allRouteStops
        .filter((rs) => rs.routeId === route.id)
        .sort((a, b) => a.sequence - b.sequence)

      // Obtener los detalles completos de las paradas
      const stopsDetails = routeStops.map((rs) => ({
        ...rs,
        stop: allStops.find((s) => s.id === rs.stopId),
      }))

      // Verificar si la ruta pasa por paradas cercanas
      const nearbyStops = stopsDetails.filter((rs) => {
        if (!rs.stop) return false
        const distance = calculateDistance(
          latitude,
          longitude,
          rs.stop.latitude,
          rs.stop.longitude
        )
        return distance <= 10 // Paradas dentro de 10km
      })

      // Obtener la parada de destino (si se encontró por nombre)
      const destinationStop = stopsDetails.find((rs) => {
        if (!rs.stop) return false
        return (
          rs.stop.name.toLowerCase().includes(destination.toLowerCase()) ||
          rs.stop.city?.toLowerCase().includes(destination.toLowerCase())
        )
      })

      if (nearbyStops.length > 0) {
        availableRoutes.push({
          id: route.id,
          company: route.company.name,
          routeNumber: route.routeNumber,
          origin: route.origin,
          destination: route.destination,
          price: lowestPrice?.price || 0,
          currency: lowestPrice?.currency || 'CRC',
          distanceKm: route.distanceKm,
          durationMin: route.durationMin,
          boardingStop: formatStop(nearbyStops[0].stop),
          destinationStop: formatStop(destinationStop?.stop || null),
          nearbyStops: nearbyStops
            .filter((ns) => ns.stop)
            .map((ns) => ({
              name: ns.stop.name,
              city: ns.stop.city,
              distance: calculateDistance(
                latitude,
                longitude,
                ns.stop.latitude,
                ns.stop.longitude
              ),
            })),
        })
      }
    }

    // Si tenemos coordenadas del destino, buscar rutas cercanas a esas coordenadas
    if (destinationCoordinates && availableRoutes.length === 0) {
      // Buscar todas las rutas que pasen cerca del destino (dentro de 5km)
      for (const route of allRoutes) {
        const lowestPrice = route.prices.length > 0 ? route.prices[0] : null

        // Obtener las paradas de esta ruta
        const routeStops = allRouteStops
          .filter((rs) => rs.routeId === route.id)
          .sort((a, b) => a.sequence - b.sequence)

        // Obtener los detalles completos de las paradas
        const stopsDetails = routeStops.map((rs) => ({
          ...rs,
          stop: allStops.find((s) => s.id === rs.stopId),
        }))

        // Verificar si la ruta pasa cerca del destino
        const destinationNearbyStops = stopsDetails.filter((rs) => {
          if (!rs.stop) return false
          const distance = calculateDistance(
            destinationCoordinates.lat,
            destinationCoordinates.lon,
            rs.stop.latitude,
            rs.stop.longitude
          )
          return distance <= 5 // Paradas dentro de 5km del destino
        })

        // Verificar si hay paradas cercanas al usuario
        const userNearbyStops = stopsDetails.filter((rs) => {
          if (!rs.stop) return false
          const distance = calculateDistance(
            latitude,
            longitude,
            rs.stop.latitude,
            rs.stop.longitude
          )
          return distance <= 10 // Paradas dentro de 10km del usuario
        })

        // Si la ruta tiene paradas cercanas al usuario y al destino
        if (userNearbyStops.length > 0 && destinationNearbyStops.length > 0) {
          availableRoutes.push({
            id: route.id,
            company: route.company.name,
            routeNumber: route.routeNumber,
            origin: route.origin,
            destination: route.destination,
            price: lowestPrice?.price || 0,
            currency: lowestPrice?.currency || 'CRC',
            distanceKm: route.distanceKm,
            durationMin: route.durationMin,
            boardingStop: formatStop(userNearbyStops[0].stop),
            destinationStop: formatStop(destinationNearbyStops[0].stop || null),
            nearbyStops: userNearbyStops
              .filter((ns) => ns.stop)
              .map((ns) => ({
                name: ns.stop.name,
                city: ns.stop.city,
                distance: calculateDistance(
                  latitude,
                  longitude,
                  ns.stop.latitude,
                  ns.stop.longitude
                ),
              })),
          })
        }
      }
    }

    // Ordenar por distancia de la parada de embarque
    availableRoutes.sort((a, b) => {
      return a.nearbyStops[0].distance - b.nearbyStops[0].distance
    })

    return NextResponse.json({
      success: true,
      location: {
        latitude,
        longitude,
      },
      nearestStop: nearestStop ? {
        name: nearestStop.name,
        city: nearestStop.city,
        distance: calculateDistance(
          latitude,
          longitude,
          nearestStop.latitude,
          nearestStop.longitude
        ),
        coordinates: {
          latitude: nearestStop.latitude,
          longitude: nearestStop.longitude,
        },
      } : null,
      destination,
      routes: availableRoutes,
    })
  } catch (error) {
    console.error('Error al planificar ruta:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Error al planificar la ruta. Por favor intenta de nuevo.',
      },
      { status: 500 }
    )
  }
}
