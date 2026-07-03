import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const companies = await db.company.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        website: true,
        logoUrl: true,
        description: true,
        primaryColor: true,
        secondaryColor: true,
      },
      orderBy: { name: 'asc' },
    });

    const companiesWithCounts = await Promise.all(
      companies.map(async (company) => {
        const agencies = await db.gtfsAgency.findMany({
          where: { name: company.name },
          select: { agency_id: true },
        });

        const agencyIds = agencies.map((a) => a.agency_id);
        let routeCount = 0;

        if (agencyIds.length > 0) {
          routeCount = await db.gtfsRoute.count({
            where: { agency_id: { in: agencyIds } },
          });
        }

        return {
          ...company,
          routeCount,
        };
      })
    );

    return NextResponse.json({ companies: companiesWithCounts });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error fetching companies';
    console.error('Error fetching companies:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}