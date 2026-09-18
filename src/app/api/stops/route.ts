import { invalidQuery, badQuery } from '@/lib/api-validation';
import { NextRequest, NextResponse } from 'next/server';
import { parseStopQuery, queryPhysicalStops } from '@/lib/physical-stops';
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  if (invalidQuery(p)) return badQuery();
  let query;
  try { query = parseStopQuery(p); } catch { return badQuery(); }
  try { return NextResponse.json(await queryPhysicalStops(query)); }
  catch (error) {
    console.error('Error fetching stops:', { type: error instanceof Error ? error.name : 'UnknownError' });
    return NextResponse.json({ error: 'Error fetching stops' }, { status: 500 });
  }
}
