import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const lat = searchParams.get('lat')
    const lon = searchParams.get('lon')
    const radius = searchParams.get('radius') || '50' // Radio en kilómetros, por defecto 50km

    if (!lat || !lon) {
      return NextResponse.json(
        { error: 'Se requieren las coordenadas (lat y lon)' },
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

    // En una implementación completa, aquí se usaría una consulta geoespacial
    // Por ahora, retornamos todas las rutas activas como ejemplo
    // En el futuro, se podría integrar con una API de mapas (Google Maps, Mapbox, etc.)
    // para calcular distancias reales basadas en coordenadas

    const routes = await db.busRoute.findMany({
      where: {
        isActive: true,
      },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            website: true,
          },
        },
        prices: {
          where: {
            isActive: true,
            validFrom: {
              lte: new Date(),
            },
            OR: [
              {
                validTo: null,
              },
              {
                validTo: {
                  gte: new Date(),
                },
              },
            ],
          },
          orderBy: {
            price: 'asc',
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    // Transformar los resultados al formato esperado
    const formattedRoutes = routes.map((route) => {
      const lowestPrice = route.prices.length > 0 ? route.prices[0] : null

      return {
        id: route.id,
        company: route.company.name,
        companyId: route.company.id,
        companyPhone: route.company.phone,
        companyEmail: route.company.email,
        companyWebsite: route.company.website,
        route: route.routeNumber,
        origin: route.origin,
        destination: route.destination,
        distance: route.distanceKm ? `${route.distanceKm} km` : null,
        duration: route.durationMin ? formatDuration(route.durationMin) : null,
        price: lowestPrice?.price || 0,
        currency: lowestPrice?.currency || 'CRC',
        seatTypes: route.prices.map((p) => ({
          type: p.seatType,
          price: p.price,
          currency: p.currency,
        })),
        // En una implementación completa, aquí se calcularía la distancia real
        // desde la ubicación del usuario hasta las paradas de la ruta
        distanceFromUser: null,
      }
    })

    return NextResponse.json({
      success: true,
      location: {
        latitude,
        longitude,
        radiusKm: parseInt(radius),
      },
      count: formattedRoutes.length,
      routes: formattedRoutes,
    })
  } catch (error) {
    console.error('Error al buscar rutas cercanas:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Error al buscar rutas cercanas. Por favor intenta de nuevo.',
      },
      { status: 500 }
    )
  }
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60

  if (hours === 0) {
    return `${mins}m`
  }

  if (mins === 0) {
    return `${hours}h`
  }

  return `${hours}h ${mins}m`
}
