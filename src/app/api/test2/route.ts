import { NextResponse } from 'next/server';

// Retired diagnostic endpoint: never expose database internals.
export function GET() {
  return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
}
