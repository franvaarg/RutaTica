import { NextRequest, NextResponse } from 'next/server';
import { GET as routes } from '../route';
import { invalidQuery, badQuery } from '@/lib/api-validation';
export async function GET(request: NextRequest) {
  if (invalidQuery(request.nextUrl.searchParams) || !request.nextUrl.searchParams.get('q')?.trim()) return badQuery();
  const url = request.nextUrl.clone();
  url.searchParams.set('search', url.searchParams.get('q')!);
  const response = await routes(new NextRequest(url));
  const data = await response.json();
  if (!response.ok) return NextResponse.json(data, { status: response.status });
  return NextResponse.json({ success: true, query: url.searchParams.get('q'), count: data.routes.length,
    routes: data.routes.map((r: any) => ({ ...r, id: r.routeId, route: r.shortName })) });
}
