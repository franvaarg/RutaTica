import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, originName, originLat, originLon, destName, destLat, destLon } = body;

    if (!originName || !originLat || !originLon || !destName || !destLat || !destLon) {
      return NextResponse.json(
        { error: 'All fields are required: userId, originName, originLat, originLon, destName, destLat, destLon' },
        { status: 400 }
      );
    }

    const history = await db.searchHistory.create({
      data: {
        userId: userId || 'anonymous',
        originName,
        originLat,
        originLon,
        destName,
        destLat,
        destLon,
      },
    });

    return NextResponse.json({ history }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error creating history entry';
    console.error('Error creating history:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId') || 'anonymous';
    const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '20'), 100);

    const history = await db.searchHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return NextResponse.json({ history });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error fetching history';
    console.error('Error fetching history:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}