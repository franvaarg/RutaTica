import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get('q')

    if (!query || query.trim().length === 0) {
      return NextResponse.json(
        { error: 'Se requiere un término de búsqueda' },
        { status: 400 }
      )
    }

    const searchTerm = query.toLowerCase().trim()

    // Buscar rutas que coincidan con origen, destino o número de ruta
    const routes = await db.busRoute.findMany({
      where: {
        isActive: true,
        OR: [
          {
            origin: {
              contains: searchTerm,
              mode: 'insensitive',
            },
          },
          {
            destination: {
              contains: searchTerm,
              mode: 'insensitive',
            },
          },
          {
            routeNumber: {
              contains: searchTerm,
              mode: 'insensitive',
            },
          },
        ],
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
      }
    })

    return NextResponse.json({
      success: true,
      query,
      count: formattedRoutes.length,
      routes: formattedRoutes,
    })
  } catch (error) {
    console.error('Error al buscar rutas:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Error al buscar rutas. Por favor intenta de nuevo.',
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
