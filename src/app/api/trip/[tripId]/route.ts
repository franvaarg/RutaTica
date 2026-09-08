import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  try {
    const { tripId } = await params;

    const trip = await db.gtfsTrip.findUnique({
      where: { trip_id: tripId },
      include: {
        route: {
          include: {
            agency: { select: { agency_id: true, name: true } },
            routeColor: { select: { color: true, textColor: true } },
          },
        },
        stopTimes: {
          orderBy: { stop_sequence: 'asc' },
          include: {
            stop: {
              select: {
                stop_id: true,
                code: true,
                name: true,
                desc: true,
                lat: true,
                lon: true,
                zone_id: true,
                wheelchair_boarding: true,
              },
            },
          },
        },
      },
    });

    if (!trip) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
    }

    let shape: { lat: number; lon: number }[] = [];
    if (trip.shape_id) {
      const shapePoints = await db.gtfsShape.findMany({
        where: { shape_id: trip.shape_id },
        orderBy: { shape_pt_sequence: 'asc' },
      });
      shape = shapePoints.map((p) => ({
        lat: p.shape_pt_lat,
        lon: p.shape_pt_lon,
      }));
    }

    const stops = trip.stopTimes.map((st) => ({
      stopId: st.stop.stop_id,
      name: st.stop.name,
      code: st.stop.code,
      lat: st.stop.lat,
      lon: st.stop.lon,
      arrivalTime: st.arrival_time,
      departureTime: st.departure_time,
      stopSequence: st.stop_sequence,
      pickupType: st.pickup_type,
      dropOffType: st.drop_off_type,
    }));

    return NextResponse.json({
      trip: {
        tripId: trip.trip_id,
        headsign: trip.headsign,
        shortName: trip.short_name,
        directionId: trip.direction_id,
        serviceId: trip.service_id,
        shapeId: trip.shape_id,
        wheelchairAccessible: trip.wheelchair_accessible,
      },
      route: {
        routeId: trip.route.route_id,
        shortName: trip.route.short_name,
        longName: trip.route.long_name,
        color: trip.route.routeColor?.color || trip.route.color || '#6B7280',
        textColor: trip.route.routeColor?.textColor || trip.route.text_color || '#FFFFFF',
        agency: trip.route.agency,
      },
      stops,
      shape,
    });
  } catch (error: unknown) {
    const message = 'Error fetching trip';
    console.error('Error fetching trip:', { type: error instanceof Error ? error.name : 'UnknownError' });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}