import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ routeId: string }> }
) {
  try {
    const { routeId } = await params;

    const fareRules = await db.gtfsFareRule.findMany({
      where: { route_id: routeId },
      include: {
        fare: true,
      },
    });

    if (fareRules.length === 0) {
      return NextResponse.json({
        fare: null,
        price: 0,
        currency: 'CRC',
        message: 'No fare information found for this route',
      });
    }

    const cheapest = fareRules.reduce((min, fr) =>
      fr.fare.price < min.fare.price ? fr : min
    );

    return NextResponse.json({
      fare: {
        fareId: cheapest.fare.fare_id,
        price: cheapest.fare.price,
        currencyType: cheapest.fare.currency_type,
        paymentMethod: cheapest.fare.payment_method,
        transfers: cheapest.fare.transfers,
        transferDuration: cheapest.fare.transfer_duration,
      },
      price: cheapest.fare.price,
      currency: cheapest.fare.currency_type,
      allFares: fareRules.map((fr) => ({
        fareId: fr.fare.fare_id,
        price: fr.fare.price,
        currency: fr.fare.currency_type,
        originId: fr.origin_id,
        destinationId: fr.destination_id,
        containsId: fr.contains_id,
      })),
    });
  } catch (error: unknown) {
    const message = 'Error fetching fare';
    console.error('Error fetching fare:', { type: error instanceof Error ? error.name : 'UnknownError' });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}