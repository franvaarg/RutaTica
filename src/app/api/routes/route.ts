import { invalidQuery, badQuery } from '@/lib/api-validation';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    if (invalidQuery(searchParams)) return badQuery();
    const search = searchParams.get('search') || '';
    const company = searchParams.get('company') || '';
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');

    const where: Record<string, unknown> = {};
    if (company) where.agency = { name: { contains: company } };

    if (search) {
      where.OR = [
        { short_name: { contains: search } },
        { long_name: { contains: search } },
        { route_id: { contains: search } },
      ];
    }

    const routes = await db.gtfsRoute.findMany({
      where,
      include: {
        agency: {
          select: { agency_id: true, name: true },
        },
        routeColor: {
          select: { color: true, textColor: true },
        },
        routeLogo: {
          select: { logoUrl: true, description: true },
        },
        _count: {
          select: { trips: true, stopRoutes: true },
        },
      },
      orderBy: { route_id: 'asc' },
      take: limit,
      skip: offset,
    });

    const total = await db.gtfsRoute.count({ where });

    const formattedRoutes = routes.map((route) => {
      let companyName = '';
      if (company && route.agency.name.toLowerCase().includes(company.toLowerCase())) {
        companyName = route.agency.name;
      } else {
        companyName = route.agency.name;
      }

      return {
        routeId: route.route_id,
        shortName: route.short_name,
        longName: route.long_name,
        type: route.type,
        color: route.routeColor?.color || route.color || '#6B7280',
        textColor: route.routeColor?.textColor || route.text_color || '#FFFFFF',
        agency: {
          id: route.agency.agency_id,
          name: route.agency.name,
        },
        company: companyName,
        logo: route.routeLogo?.logoUrl || null,
        tripCount: route._count.trips,
        stopCount: route._count.stopRoutes,
      };
    });

    return NextResponse.json({ routes: formattedRoutes, total });
  } catch (error: unknown) {
    const message = 'Error fetching routes';
    console.error('Error fetching routes:', { type: error instanceof Error ? error.name : 'UnknownError' });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}