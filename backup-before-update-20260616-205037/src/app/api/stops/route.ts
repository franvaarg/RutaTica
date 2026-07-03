import { NextResponse } from 'next/server'

// Importar Prisma de forma dinámica para evitar problemas de caché
let db: any = null

async function getDb() {
  if (!db) {
    const { PrismaClient } = await import('@prisma/client')
    db = new PrismaClient()
  }
  return db
}

export async function GET(request: Request) {
  try {
    const db = await getDb()

    const { searchParams } = new URL(request.url)
    const lat = searchParams.get('lat')
    const lon = searchParams.get('lon')
    const radius = searchParams.get('radius') || '20' // Radio en km, por defecto 20km

    // Obtener todas las paradas activas
    let stops = await db.stop.findMany({
      where: {
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        latitude: true,
        longitude: true,
        city: true,
      },
    })

    // Si se proporcionan coordenadas, filtrar por radio
    if (lat && lon) {
      const userLat = parseFloat(lat)
      const userLon = parseFloat(lon)
      const radiusKm = parseFloat(radius)

      if (!isNaN(userLat) && !isNaN(userLon)) {
        // Calcular distancia usando fórmula de Haversine
        const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
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

        // Filtrar paradas dentro del radio
        stops = stops
          .map((stop: any) => ({
            ...stop,
            distance: calculateDistance(userLat, userLon, stop.latitude, stop.longitude),
          }))
          .filter((stop: any) => stop.distance <= radiusKm)
          .sort((a: any, b: any) => a.distance - b.distance)
      }
    }

    return NextResponse.json({
      success: true,
      stops: stops,
      total: stops.length,
    })
  } catch (error) {
    console.error('Error al obtener paradas:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Error al obtener las paradas de buses',
      },
      { status: 500 }
    )
  }
}