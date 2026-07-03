import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, stopName, routeNumber, destination } = body;

    if (!userId || !stopName || !routeNumber) {
      return NextResponse.json(
        { error: 'userId, stopName, and routeNumber are required' },
        { status: 400 }
      );
    }

    const favorite = await db.favorite.create({
      data: {
        userId: userId || 'anonymous',
        stopName,
        routeNumber,
        destination: destination || '',
      },
    });

    return NextResponse.json({ favorite }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error creating favorite';
    console.error('Error creating favorite:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId') || 'anonymous';

    const favorites = await db.favorite.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ favorites });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error fetching favorites';
    console.error('Error fetching favorites:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}