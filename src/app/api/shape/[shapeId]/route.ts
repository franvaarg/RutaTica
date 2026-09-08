import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ shapeId: string }> }
) {
  try {
    const { shapeId } = await params;

    const shapePoints = await db.gtfsShape.findMany({
      where: { shape_id: shapeId },
      orderBy: { shape_pt_sequence: 'asc' },
      select: {
        shape_pt_lat: true,
        shape_pt_lon: true,
        shape_pt_sequence: true,
        shape_dist_traveled: true,
      },
    });

    if (shapePoints.length === 0) {
      return NextResponse.json({ error: 'Shape not found' }, { status: 404 });
    }

    const points = shapePoints.map((p) => ({
      lat: p.shape_pt_lat,
      lon: p.shape_pt_lon,
      sequence: p.shape_pt_sequence,
      distanceTraveled: p.shape_dist_traveled,
    }));

    return NextResponse.json({ points });
  } catch (error: unknown) {
    const message = 'Error fetching shape';
    console.error('Error fetching shape:', { type: error instanceof Error ? error.name : 'UnknownError' });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}