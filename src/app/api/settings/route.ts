import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId') || 'anonymous';

    const settings = await db.appSetting.findMany({
      where: { userId },
    });

    return NextResponse.json({ settings });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error fetching settings';
    console.error('Error fetching settings:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, key, value } = body;

    if (!key || value === undefined) {
      return NextResponse.json(
        { error: 'key and value are required' },
        { status: 400 }
      );
    }

    const uid = userId || 'anonymous';

    const existing = await db.appSetting.findFirst({
      where: { userId: uid, key },
    });

    let setting;
    if (existing) {
      setting = await db.appSetting.update({
        where: { id: existing.id },
        data: { value: String(value) },
      });
    } else {
      setting = await db.appSetting.create({
        data: {
          userId: uid,
          key,
          value: String(value),
        },
      });
    }

    return NextResponse.json({ setting });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error saving setting';
    console.error('Error saving setting:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}