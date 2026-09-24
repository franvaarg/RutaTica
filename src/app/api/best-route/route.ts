import { selectTripSegment } from '@/lib/trip-segments';
import { routeMembership } from '@/lib/routing-membership';
import { queryPhysicalStops } from '@/lib/physical-stops';
import { CTP_ROUTING_NOTICE } from '@/lib/stop-display';
import { invalidQuery, badQuery } from '@/lib/api-validation';
import { serviceDateTime } from '@/lib/service-date';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { findNearestStops, pathDistanceKm, slicePathBetween, slicePathByDistance, walkingTimeMinutes } from '@/lib/spatial';
import { timeToMinutes, minutesToTime, getActiveServiceIdsToday } from '@/lib/time-utils';
import { loadScoringConfig, scoreAndSortRoutes, RouteOption } from '@/lib/route-scoring';
import { planWithOtp } from '@/lib/otp-client';

interface RouteResult {
  _boardDistance?: number | null;
  _alightDistance?: number | null;
  score: number;
  totalTimeMinutes: number;
  walkingDistanceKm: number;
  distanceKm: number;
  transitDistanceKm: number;
  distanceSource: 'otp' | 'gtfs_shape_dist_traveled' | 'gtfs_shape_geometry' | 'stop_geometry';
  durationSource: 'otp' | 'gtfs_schedule';
  transfers: number;
  costCRC: number | null;
  boardingStop: { name: string; lat: number; lon: number; distanceKm: number };
  alightingStop: { name: string; lat: number; lon: number; distanceKm: number };
  route: { routeId: string; shortName: string; longName: string; color: string; company: string };
  departTime: string;
  arriveTime: string;
  stops: { name: string; lat: number; lon: number; time: string }[];
  shapePoints: { lat: number; lon: number }[];
  transferInfo?: { transferStop: string; waitMinutes: number; secondRoute: string };
}

interface BestRouteResponse {
  origin: { lat: number; lon: number };
  destination: { lat: number; lon: number };
  routes: RouteResult[];
  routingSource?: 'otp' | 'gtfs-local';
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    if (invalidQuery(searchParams)) return badQuery();
    const originLatStr = searchParams.get('originLat');
    const originLonStr = searchParams.get('originLon');
    const destLatStr = searchParams.get('destLat');
    const destLonStr = searchParams.get('destLon');
    const departAfter = searchParams.get('departAfter') || serviceDateTime().time;

    if (!originLatStr || !originLonStr || !destLatStr || !destLonStr) {
      return NextResponse.json(
        { error: 'originLat, originLon, destLat, and destLon are required' },
        { status: 400 }
      );
    }

    const originLat = Number(originLatStr);
    const originLon = Number(originLonStr);
    const destLat = Number(destLatStr);
    const destLon = Number(destLonStr);

    if (
      [originLat, originLon, destLat, destLon].some((v) => !Number.isFinite(v)) || Math.abs(originLat) > 90 || Math.abs(destLat) > 90 || Math.abs(originLon) > 180 || Math.abs(destLon) > 180 || !/^[0-2]\d:[0-5]\d:[0-5]\d$/.test(departAfter) || Number(departAfter.slice(0, 2)) > 23
    ) {
      return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 });
    }

    const departAfterMinutes = timeToMinutes(departAfter);


    // OTP 2 GTFS GraphQL is preferred when configured. A failed or empty OTP
    // response falls through to the existing local GTFS planner.
    const departure = new Date(`${serviceDateTime().date}T${departAfter}-06:00`);
    const otpRoutes = await planWithOtp(
      { lat: originLat, lon: originLon },
      { lat: destLat, lon: destLon },
      departure
    );
    if (otpRoutes?.length) {
      const routes: RouteResult[] = otpRoutes.map((itinerary) => {
        const transitLegs = itinerary.legs.filter((leg) => leg.transitLeg);
        const firstTransit = transitLegs[0] || itinerary.legs[0];
        const lastTransit = transitLegs.at(-1) || itinerary.legs.at(-1)!;
        const transitDistanceKm = transitLegs.reduce((sum, leg) => sum + leg.distanceKm, 0);
        return {
          score: 0,
          totalTimeMinutes: Math.round(itinerary.durationMin * 10) / 10,
          walkingDistanceKm: Math.round(itinerary.walkingDistanceKm * 1000) / 1000,
          distanceKm: Math.round(itinerary.distanceKm * 1000) / 1000,
          transitDistanceKm: Math.round(transitDistanceKm * 1000) / 1000,
          distanceSource: 'otp',
          durationSource: 'otp',
          transfers: itinerary.transfers,
          costCRC: null,
          boardingStop: { ...firstTransit.from, distanceKm: itinerary.legs[0]?.mode === 'WALK' ? itinerary.legs[0].distanceKm : 0 },
          alightingStop: { ...lastTransit.to, distanceKm: itinerary.legs.at(-1)?.mode === 'WALK' ? itinerary.legs.at(-1)!.distanceKm : 0 },
          route: {
            routeId: firstTransit.route?.gtfsId || 'OTP',
            shortName: firstTransit.route?.shortName || '',
            longName: firstTransit.route?.longName || '',
            color: '#16a34a',
            company: firstTransit.agency || '',
          },
          departTime: '',
          arriveTime: '',
          stops: itinerary.legs.flatMap((leg) => [
            { name: leg.from.name, lat: leg.from.lat, lon: leg.from.lon, time: '' },
            { name: leg.to.name, lat: leg.to.lat, lon: leg.to.lon, time: '' },
          ]),
          // Do not connect disconnected transit legs with an invented bus segment.
          shapePoints: transitLegs.length === 1 ? transitLegs[0].geometry : [],
        };
      });
      return NextResponse.json({
        origin: { lat: originLat, lon: originLon },
        destination: { lat: destLat, lon: destLon },
        routes,
        routingSource: 'otp',
      });
    }

    console.info('[routing] GTFS fallback activated', { reason: otpRoutes === null ? 'otp_unavailable_or_unconfigured' : 'otp_no_transit' });
    const serviceIds = await getActiveServiceIdsToday(departure);

    // Step 1: Find nearest origin stops (within 1km)
    const originStops = await findNearestStops(originLat, originLon, 1, 10);
    if (originStops.length === 0) {
      return NextResponse.json({
        origin: { lat: originLat, lon: originLon },
        destination: { lat: destLat, lon: destLon },
        routes: [],
        message: await noRouteMessage(originLat, originLon),
      });
    }

    // Step 2: Find nearest destination stops (within 1km)
    const destStops = await findNearestStops(destLat, destLon, 1, 10);
    if (destStops.length === 0) {
      return NextResponse.json({
        origin: { lat: originLat, lon: originLon },
        destination: { lat: destLat, lon: destLon },
        routes: [],
        message: await noRouteMessage(destLat, destLon),
      });
    }

    // Build a map of route IDs that serve each origin/dest stop
    const originStopIds = originStops.map((s) => s.stop.stop_id);
    const destStopIds = destStops.map((s) => s.stop.stop_id);

    // Get all StopRoute entries for origin and dest stops
    const originStopRoutes = await routeMembership(db, { stopIds: originStopIds });

    const destStopRoutes = await routeMembership(db, { stopIds: destStopIds });

    // Build route-to-stop mappings
    const originRoutesByStop = new Map<string, string[]>();
    for (const sr of originStopRoutes) {
      if (!originRoutesByStop.has(sr.stopId)) {
        originRoutesByStop.set(sr.stopId, []);
      }
      originRoutesByStop.get(sr.stopId)!.push(sr.routeId);
    }

    const destRoutesByStop = new Map<string, string[]>();
    for (const sr of destStopRoutes) {
      if (!destRoutesByStop.has(sr.stopId)) {
        destRoutesByStop.set(sr.stopId, []);
      }
      destRoutesByStop.get(sr.stopId)!.push(sr.routeId);
    }

    // Step 3: Find direct routes (routes serving both origin and destination stops)
    const directRouteCandidates: {
      routeId: string;
      originStopId: string;
      destStopId: string;
    }[] = [];

    for (const [originStopId, originRouteIds] of originRoutesByStop) {
      for (const [destStopId, destRouteIds] of destRoutesByStop) {
        const common = originRouteIds.filter((r) => destRouteIds.includes(r));
        for (const routeId of common) {
          directRouteCandidates.push({ routeId, originStopId, destStopId });
        }
      }
    }

    // Step 4: Evaluate each direct route
    const routeOptions: RouteResult[] = [];

    // Pre-fetch route details and fares for all candidate routes
    const candidateRouteIds = [
      ...new Set(directRouteCandidates.map((c) => c.routeId)),
    ];

    const routeDetails = new Map<
      string,
      {
        routeId: string;
        shortName: string;
        longName: string;
        color: string;
        textColor: string;
        agencyName: string;
        shapeId: string | null;
      }
    >();

    if (candidateRouteIds.length > 0) {
      const routes = await db.gtfsRoute.findMany({
        where: { route_id: { in: candidateRouteIds } },
        include: {
          agency: { select: { name: true } },
          routeColor: { select: { color: true, textColor: true } },
        },
      });

      for (const r of routes) {
        routeDetails.set(r.route_id, {
          routeId: r.route_id,
          shortName: r.short_name || '',
          longName: r.long_name || '',
          color: r.routeColor?.color || r.color || '#6B7280',
          textColor: r.routeColor?.textColor || r.text_color || '#FFFFFF',
          agencyName: r.agency.name,
          shapeId: null,
        });
      }
    }

    // Pre-fetch fares for all candidate routes
    const fareMap = new Map<string, number>();
    if (candidateRouteIds.length > 0) {
      const fareRules = await db.gtfsFareRule.findMany({
        where: { route_id: { in: candidateRouteIds } },
        include: { fare: true },
      });

      for (const fr of fareRules) {
        if (!fr.route_id) continue;
        const existing = fareMap.get(fr.route_id);
        if (existing === undefined || fr.fare.price < existing) {
          fareMap.set(fr.route_id, fr.fare.price);
        }
      }
    }

    // Fetch each active schedule once, rather than once per origin/destination pair.
    const directTrips = await db.gtfsTrip.findMany({
      where: { route_id: { in: candidateRouteIds }, service_id: { in: serviceIds } },
      orderBy: { trip_id: 'asc' },
      include: { stopTimes: { orderBy: { stop_sequence: 'asc' }, include: { stop: { select: { name: true, lat: true, lon: true } } } } },
    });
    // For each direct route candidate, find the next trip and calculate details
    for (const candidate of directRouteCandidates) {
      const { routeId, originStopId, destStopId } = candidate;

      // Direction and stop order belong to each trip, never the route-level index.
      // Get active trip for today's service
      const trips = directTrips.filter(trip => trip.route_id === routeId);

      if (trips.length === 0) continue;

      // For each trip, get stop times for origin and dest stops
      let bestOption: {
        tripId: string;
        shapeId: string | null;
        boardTime: string;
        alightTime: string;
        intermediateStops: { name: string; lat: number; lon: number; time: string }[];
        boardShapeDistance: number | null;
        alightShapeDistance: number | null;
      } | null = null;

      for (const trip of trips) {
        // Get stop times for this trip
        const stopTimes = trip.stopTimes.filter(st => st.stop_id === originStopId || st.stop_id === destStopId);

        if (stopTimes.length < 2) continue;

        const segment = selectTripSegment(stopTimes, originStopId, destStopId, departAfterMinutes + walkingTimeMinutes(originStops.find(s => s.stop.stop_id === originStopId)!.distanceKm));
        const boardSt = segment?.board;
        const alightSt = segment?.alight;

        if (!boardSt || !alightSt || boardSt.stop_sequence >= alightSt.stop_sequence || boardSt.pickup_type !== 0 || alightSt.drop_off_type !== 0) continue;

        const boardMinutes = timeToMinutes(boardSt.departure_time);
        const alightMinutes = timeToMinutes(alightSt.arrival_time);

        // Board time must be after departAfter and alight after board
        if (!Number.isFinite(boardMinutes) || !Number.isFinite(alightMinutes) || boardMinutes < departAfterMinutes + walkingTimeMinutes(originStops.find(s => s.stop.stop_id === originStopId)!.distanceKm) || alightMinutes <= boardMinutes) continue;

        if (
          !bestOption ||
          boardMinutes < timeToMinutes(bestOption.boardTime)
        ) {
          // Get intermediate stops for this trip
          const allTripStopTimes = trip.stopTimes.filter(st => st.stop_sequence >= boardSt.stop_sequence && st.stop_sequence <= alightSt.stop_sequence);

          const intermediateStops = allTripStopTimes.map((st) => ({
            name: st.stop.name,
            lat: st.stop.lat,
            lon: st.stop.lon,
            time: st.arrival_time,
          }));

          bestOption = {
            tripId: trip.trip_id,
            shapeId: trip.shape_id,
            boardTime: boardSt.departure_time,
            alightTime: alightSt.arrival_time,
            intermediateStops,
            boardShapeDistance: boardSt.shape_dist_traveled,
            alightShapeDistance: alightSt.shape_dist_traveled,
          };
        }
      }

      if (!bestOption) continue;

      // Get origin and dest stop details
      const originStop = originStops.find((s) => s.stop.stop_id === originStopId);
      const destStop = destStops.find((s) => s.stop.stop_id === destStopId);
      if (!originStop || !destStop) continue;

      // Get shape points
      let shapePoints: { lat: number; lon: number }[] = [];
      if (bestOption.shapeId) {
        // Store shape ID for later batch fetch
        routeDetails.get(routeId)!.shapeId = bestOption.shapeId;
      }

      const walkDistOrigin = originStop.distanceKm;
      const walkDistDest = destStop.distanceKm;
      const totalWalkingKm = walkDistOrigin + walkDistDest;

      const walkTimeOrigin = walkingTimeMinutes(walkDistOrigin);
      const walkTimeDest = walkingTimeMinutes(walkDistDest);
      const travelTime =
        timeToMinutes(bestOption.alightTime) - timeToMinutes(bestOption.boardTime);
      const totalTime = walkTimeOrigin + travelTime + walkTimeDest;
      // GTFS does not prescribe distance units. Measure geometry in km instead.
      const stopGeometryDistance = pathDistanceKm(
        bestOption.intermediateStops.map((stop) => ({ lat: stop.lat, lon: stop.lon }))
      );
      const transitDistanceKm = stopGeometryDistance;

      const cost = fareMap.get(routeId) ?? null;
      const rd = routeDetails.get(routeId);

      routeOptions.push({
        score: 0,
        totalTimeMinutes: Math.round(totalTime * 10) / 10,
        walkingDistanceKm: Math.round(totalWalkingKm * 1000) / 1000,
        distanceKm: Math.round((totalWalkingKm + transitDistanceKm) * 1000) / 1000,
        transitDistanceKm: Math.round(transitDistanceKm * 1000) / 1000,
        distanceSource: 'stop_geometry',
        durationSource: 'gtfs_schedule',
        transfers: 0,
        costCRC: cost,
        boardingStop: {
          name: originStop.stop.name,
          lat: originStop.stop.lat,
          lon: originStop.stop.lon,
          distanceKm: Math.round(walkDistOrigin * 1000) / 1000,
        },
        alightingStop: {
          name: destStop.stop.name,
          lat: destStop.stop.lat,
          lon: destStop.stop.lon,
          distanceKm: Math.round(walkDistDest * 1000) / 1000,
        },
        route: {
          routeId: routeId,
          shortName: rd?.shortName || '',
          longName: rd?.longName || '',
          color: rd?.color || '#6B7280',
          company: rd?.agencyName || '',
        },
        departTime: bestOption.boardTime,
        arriveTime: bestOption.alightTime,
        stops: bestOption.intermediateStops,
        shapePoints,
        _shapeId: bestOption.shapeId,
        _boardDistance: bestOption.boardShapeDistance,
        _alightDistance: bestOption.alightShapeDistance,
      } as RouteResult & { _shapeId?: string });
    }

    // Step 5: Transfer routes (if no direct routes found or to complement)
    if (routeOptions.length < 3) {
      const transferOptions = await findTransferRoutes(
        originStops,
        destStops,
        originStopIds,
        destStopIds,
        originRoutesByStop,
        destRoutesByStop,
        serviceIds,
        departAfterMinutes,
        routeDetails,
        fareMap,
        originLat,
        originLon,
        destLat,
        destLon
      );
      routeOptions.push(...transferOptions);
    }

    // Fetch shape points for all unique shape IDs
    const shapeIdsToFetch = [
      ...new Set(
        routeOptions
          .filter((r) => (r as unknown as { _shapeId?: string })._shapeId)
          .map((r) => (r as unknown as { _shapeId: string })._shapeId)
      ),
    ];

    if (shapeIdsToFetch.length > 0) {
      const allShapes = await db.gtfsShape.findMany({
        where: { shape_id: { in: shapeIdsToFetch } },
        orderBy: { shape_pt_sequence: 'asc' },
        select: { shape_id: true, shape_pt_lat: true, shape_pt_lon: true, shape_pt_sequence: true, shape_dist_traveled: true },
      });

      const shapesByRoute = new Map<string, { lat: number; lon: number; distance: number | null }[]>();
      for (const sp of allShapes) {
        if (!shapesByRoute.has(sp.shape_id)) {
          shapesByRoute.set(sp.shape_id, []);
        }
        shapesByRoute.get(sp.shape_id)!.push({ lat: sp.shape_pt_lat, lon: sp.shape_pt_lon, distance: sp.shape_dist_traveled });
      }

      for (const option of routeOptions) {
        const opt = option as unknown as { _shapeId?: string };
        if (opt._shapeId) {
          const completeShape = shapesByRoute.get(opt._shapeId) || [];
          option.shapePoints = slicePathByDistance(completeShape, option._boardDistance ?? null, option._alightDistance ?? null) ?? slicePathBetween(
            completeShape,
            { lat: option.boardingStop.lat, lon: option.boardingStop.lon },
            { lat: option.alightingStop.lat, lon: option.alightingStop.lon }
          );
          if (option.distanceSource === 'stop_geometry' && option.shapePoints.length > 1) {
            option.transitDistanceKm = pathDistanceKm(option.shapePoints);
            option.distanceKm = option.walkingDistanceKm + option.transitDistanceKm;
            option.distanceSource = 'gtfs_shape_geometry';
          }
          delete opt._shapeId;
        }
      }
    }

    // Clean up any remaining _shapeId
    for (const option of routeOptions) {
      delete option._boardDistance;
      delete option._alightDistance;
      delete (option as unknown as Record<string, unknown>)._shapeId;
    }

    // Step 6: Score and sort
    const scoreConfig = await loadScoringConfig();
    const scoredRoutes = scoreAndSortRoutes(routeOptions, scoreConfig);

    // Step 7: Return top 5
    const topRoutes = scoredRoutes.slice(0, 5);

    const response: BestRouteResponse = {
      origin: { lat: originLat, lon: originLon },
      destination: { lat: destLat, lon: destLon },
      routes: topRoutes,
      routingSource: 'gtfs-local',
    };

    return NextResponse.json({ ...response, ...(topRoutes.length === 0 ? { message: await noRouteMessage(originLat, originLon, destLat, destLon) } : {}) });
  } catch (error: unknown) {
    const message = 'Error finding best route';
    console.error('Error finding best route:', { type: error instanceof Error ? error.name : 'UnknownError' });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Find routes requiring one transfer between origin and destination.
 */
async function findTransferRoutes(
  originStops: { stop: { stop_id: string; name: string; lat: number; lon: number }; distanceKm: number }[],
  destStops: { stop: { stop_id: string; name: string; lat: number; lon: number }; distanceKm: number }[],
  originStopIds: string[],
  destStopIds: string[],
  originRoutesByStop: Map<string, string[]>,
  destRoutesByStop: Map<string, string[]>,
  serviceIds: string[],
  departAfterMinutes: number,
  routeDetails: Map<string, { routeId: string; shortName: string; longName: string; color: string; textColor: string; agencyName: string; shapeId: string | null }>,
  fareMap: Map<string, number>,
  originLat: number,
  originLon: number,
  destLat: number,
  destLon: number
): Promise<RouteResult[]> {
  const options: RouteResult[] = [];
  const TRANSFER_WAIT = 5;
  const MAX_OPTIONS = 5;

  // Get all route IDs that serve origin stops
  const firstLegRouteIds = new Set<string>();
  for (const routeIds of originRoutesByStop.values()) {
    for (const rid of routeIds) firstLegRouteIds.add(rid);
  }

  // Get all route IDs that serve dest stops
  const secondLegRouteIds = new Set<string>();
  for (const routeIds of destRoutesByStop.values()) {
    for (const rid of routeIds) secondLegRouteIds.add(rid);
  }

  // Find transfer stops: stops that are served by both a first-leg and second-leg route
  // Get all stops for first-leg routes
  const firstLegStops = await routeMembership(db, { routeIds: [...firstLegRouteIds] });

  // Get all stops for second-leg routes
  const secondLegStops = await routeMembership(db, { routeIds: [...secondLegRouteIds] });

  // Build stop-to-routes maps
  const stopToFirstRoutes = new Map<string, Set<string>>();
  for (const sr of firstLegStops) {
    if (!stopToFirstRoutes.has(sr.stopId)) stopToFirstRoutes.set(sr.stopId, new Set());
    stopToFirstRoutes.get(sr.stopId)!.add(sr.routeId);
  }

  const stopToSecondRoutes = new Map<string, Set<string>>();
  for (const sr of secondLegStops) {
    if (!stopToSecondRoutes.has(sr.stopId)) stopToSecondRoutes.set(sr.stopId, new Set());
    stopToSecondRoutes.get(sr.stopId)!.add(sr.routeId);
  }

  // Find transfer stop candidates (served by at least one first-leg and one second-leg route)
  const transferCandidates: {
    transferStopId: string;
    firstRouteId: string;
    secondRouteId: string;
    originStopId: string;
    destStopId: string;
  }[] = [];

  for (const [transferStopId, firstRoutes] of stopToFirstRoutes) {
    const secondRoutes = stopToSecondRoutes.get(transferStopId);
    if (!secondRoutes) continue;

    // Don't use origin or destination stops as transfer points
    if (originStopIds.includes(transferStopId) || destStopIds.includes(transferStopId)) continue;

    for (const firstRouteId of firstRoutes) {
      for (const secondRouteId of secondRoutes) {
        if (firstRouteId === secondRouteId) continue;

        // Find which origin stop has this first route
        for (const [origStopId, origRoutes] of originRoutesByStop) {
          if (origRoutes.includes(firstRouteId)) {
            // Find which dest stop has this second route
            for (const [dStopId, dRoutes] of destRoutesByStop) {
              if (dRoutes.includes(secondRouteId)) {
                transferCandidates.push({
                  transferStopId,
                  firstRouteId,
                  secondRouteId,
                  originStopId: origStopId,
                  destStopId: dStopId,
                });
              }
            }
          }
        }
      }
    }
  }

  // Limit candidates to prevent excessive queries
  const limitedCandidates = transferCandidates.slice(0, 20);

  // Fetch missing route details
  const missingRouteIds = limitedCandidates
    .flatMap((c) => [c.firstRouteId, c.secondRouteId])
    .filter((id) => !routeDetails.has(id));

  if (missingRouteIds.length > 0) {
    const routes = await db.gtfsRoute.findMany({
      where: { route_id: { in: missingRouteIds } },
      include: {
        agency: { select: { name: true } },
        routeColor: { select: { color: true, textColor: true } },
      },
    });
    for (const r of routes) {
      routeDetails.set(r.route_id, {
        routeId: r.route_id,
        shortName: r.short_name || '',
        longName: r.long_name || '',
        color: r.routeColor?.color || r.color || '#6B7280',
        textColor: r.routeColor?.textColor || r.text_color || '#FFFFFF',
        agencyName: r.agency.name,
        shapeId: null,
      });
    }
  }

  // Fetch missing fares
  const missingFareIds = limitedCandidates
    .flatMap((c) => [c.firstRouteId, c.secondRouteId])
    .filter((id) => !fareMap.has(id));

  if (missingFareIds.length > 0) {
    const fareRules = await db.gtfsFareRule.findMany({
      where: { route_id: { in: missingFareIds } },
      include: { fare: true },
    });
    for (const fr of fareRules) {
      if (!fr.route_id) continue;
      const existing = fareMap.get(fr.route_id);
      if (existing === undefined || fr.fare.price < existing) {
        fareMap.set(fr.route_id, fr.fare.price);
      }
    }
  }

  for (const candidate of limitedCandidates) {
    if (options.length >= MAX_OPTIONS) break;

    const { transferStopId, firstRouteId, secondRouteId, originStopId, destStopId } = candidate;

    // Find next trip for first leg
    const firstTrips = await db.gtfsTrip.findMany({
      where: { route_id: firstRouteId, service_id: { in: serviceIds } },
      orderBy: { trip_id: 'asc' },
      select: { trip_id: true, shape_id: true },
    });

    let bestFirstLeg: {
      tripId: string;
      shapeId: string | null;
      departTime: string;
      arriveTime: string;
      stops: { name: string; lat: number; lon: number; time: string }[];
    } | null = null;

    for (const trip of firstTrips) {
      const stForLeg = await db.gtfsStopTime.findMany({
        where: {
          trip_id: trip.trip_id,
          stop_id: { in: [originStopId, transferStopId] },
        },
        orderBy: { stop_sequence: 'asc' },
        select: { stop_id: true, stop_sequence: true, arrival_time: true, departure_time: true, pickup_type: true, drop_off_type: true },
      });

      if (stForLeg.length < 2) continue;

      const segment = selectTripSegment(stForLeg, originStopId, transferStopId, departAfterMinutes + walkingTimeMinutes(originStops.find(s => s.stop.stop_id === originStopId)!.distanceKm));
      const boardSt = segment?.board;
      const alightSt = segment?.alight;
      if (!boardSt || !alightSt || boardSt.stop_sequence >= alightSt.stop_sequence || boardSt.pickup_type !== 0 || alightSt.drop_off_type !== 0) continue;

      const boardMin = timeToMinutes(boardSt.departure_time);
      const alightMin = timeToMinutes(alightSt.arrival_time);

      if (!Number.isFinite(boardMin) || !Number.isFinite(alightMin) || boardMin < departAfterMinutes + walkingTimeMinutes(originStops.find(s => s.stop.stop_id === originStopId)!.distanceKm) || alightMin <= boardMin) continue;

      if (!bestFirstLeg || boardMin < timeToMinutes(bestFirstLeg.departTime)) {
        const allSt = await db.gtfsStopTime.findMany({
          where: {
            trip_id: trip.trip_id,
            stop_sequence: { gte: boardSt.stop_sequence, lte: alightSt.stop_sequence },
          },
          orderBy: { stop_sequence: 'asc' },
          include: { stop: { select: { name: true, lat: true, lon: true } } },
        });

        bestFirstLeg = {
          tripId: trip.trip_id,
          shapeId: trip.shape_id,
          departTime: boardSt.departure_time,
          arriveTime: alightSt.arrival_time,
          stops: allSt.map((st) => ({
            name: st.stop.name,
            lat: st.stop.lat,
            lon: st.stop.lon,
            time: st.arrival_time,
          })),
        };
      }
    }

    if (!bestFirstLeg) continue;

    // Find next trip for second leg (depart after first leg arrival + transfer wait)
    const secondLegAfter = minutesToTime(
      timeToMinutes(bestFirstLeg.arriveTime) + TRANSFER_WAIT
    );

    const secondTrips = await db.gtfsTrip.findMany({
      where: { route_id: secondRouteId, service_id: { in: serviceIds } },
      orderBy: { trip_id: 'asc' },
      select: { trip_id: true, shape_id: true },
    });

    let bestSecondLeg: {
      tripId: string;
      shapeId: string | null;
      departTime: string;
      arriveTime: string;
      stops: { name: string; lat: number; lon: number; time: string }[];
    } | null = null;

    for (const trip of secondTrips) {
      const stForLeg = await db.gtfsStopTime.findMany({
        where: {
          trip_id: trip.trip_id,
          stop_id: { in: [transferStopId, destStopId] },
        },
        orderBy: { stop_sequence: 'asc' },
        select: { stop_id: true, stop_sequence: true, arrival_time: true, departure_time: true, pickup_type: true, drop_off_type: true },
      });

      if (stForLeg.length < 2) continue;

      const segment = selectTripSegment(stForLeg, transferStopId, destStopId, timeToMinutes(secondLegAfter));
      const boardSt = segment?.board;
      const alightSt = segment?.alight;
      if (!boardSt || !alightSt || boardSt.stop_sequence >= alightSt.stop_sequence || boardSt.pickup_type !== 0 || alightSt.drop_off_type !== 0) continue;

      const boardMin = timeToMinutes(boardSt.departure_time);
      const alightMin = timeToMinutes(alightSt.arrival_time);
      const requiredMin = timeToMinutes(secondLegAfter);

      if (!Number.isFinite(boardMin) || !Number.isFinite(alightMin) || boardMin < requiredMin || alightMin <= boardMin) continue;

      if (!bestSecondLeg || boardMin < timeToMinutes(bestSecondLeg.departTime)) {
        const allSt = await db.gtfsStopTime.findMany({
          where: {
            trip_id: trip.trip_id,
            stop_sequence: { gte: boardSt.stop_sequence, lte: alightSt.stop_sequence },
          },
          orderBy: { stop_sequence: 'asc' },
          include: { stop: { select: { name: true, lat: true, lon: true } } },
        });

        bestSecondLeg = {
          tripId: trip.trip_id,
          shapeId: trip.shape_id,
          departTime: boardSt.departure_time,
          arriveTime: alightSt.arrival_time,
          stops: allSt.map((st) => ({
            name: st.stop.name,
            lat: st.stop.lat,
            lon: st.stop.lon,
            time: st.arrival_time,
          })),
        };
      }
    }

    if (!bestSecondLeg) continue;

    const originStop = originStops.find((s) => s.stop.stop_id === originStopId);
    const destStop = destStops.find((s) => s.stop.stop_id === destStopId);
    const transferStop = await db.gtfsStop.findUnique({
      where: { stop_id: transferStopId },
      select: { name: true, lat: true, lon: true },
    });

    if (!originStop || !destStop || !transferStop) continue;

    const walkDistOrigin = originStop.distanceKm;
    const walkDistDest = destStop.distanceKm;

    const firstTravelTime = timeToMinutes(bestFirstLeg.arriveTime) - timeToMinutes(bestFirstLeg.departTime);
    const transferWait = timeToMinutes(bestSecondLeg.departTime) - timeToMinutes(bestFirstLeg.arriveTime);
    const secondTravelTime = timeToMinutes(bestSecondLeg.arriveTime) - timeToMinutes(bestSecondLeg.departTime);

    const totalTime =
      walkingTimeMinutes(walkDistOrigin) +
      firstTravelTime +
      Math.max(transferWait, 0) +
      secondTravelTime +
      walkingTimeMinutes(walkDistDest);

    const cost = fareMap.has(firstRouteId) && fareMap.has(secondRouteId) ? fareMap.get(firstRouteId)! + fareMap.get(secondRouteId)! : null;

    const firstRd = routeDetails.get(firstRouteId);

    const allStops = [
      ...bestFirstLeg.stops,
      { name: transferStop.name, lat: transferStop.lat, lon: transferStop.lon, time: bestSecondLeg.departTime },
      ...bestSecondLeg.stops.slice(1),
    ];
    const transitDistanceKm = pathDistanceKm(allStops.map((stop) => ({ lat: stop.lat, lon: stop.lon })));
    const walkingDistanceKm = walkDistOrigin + walkDistDest;

    options.push({
      score: 0,
      totalTimeMinutes: Math.round(totalTime * 10) / 10,
      walkingDistanceKm: Math.round(walkingDistanceKm * 1000) / 1000,
      distanceKm: Math.round((walkingDistanceKm + transitDistanceKm) * 1000) / 1000,
      transitDistanceKm: Math.round(transitDistanceKm * 1000) / 1000,
      distanceSource: 'stop_geometry',
      durationSource: 'gtfs_schedule',
      transfers: 1,
      costCRC: cost,
      boardingStop: {
        name: originStop.stop.name,
        lat: originStop.stop.lat,
        lon: originStop.stop.lon,
        distanceKm: Math.round(walkDistOrigin * 1000) / 1000,
      },
      alightingStop: {
        name: destStop.stop.name,
        lat: destStop.stop.lat,
        lon: destStop.stop.lon,
        distanceKm: Math.round(walkDistDest * 1000) / 1000,
      },
      route: {
        routeId: firstRouteId,
        shortName: firstRd?.shortName || '',
        longName: firstRd?.longName || '',
        color: firstRd?.color || '#6B7280',
        company: firstRd?.agencyName || '',
      },
      departTime: bestFirstLeg.departTime,
      arriveTime: bestSecondLeg.arriveTime,
      stops: allStops,
      shapePoints: [],
      transferInfo: {
        transferStop: transferStop.name,
        waitMinutes: Math.max(transferWait, 0),
        secondRoute: secondRouteId,
      },
    });
  }

  return options;
}

// Infrastructure presence changes only the explanation, never the route results.
async function noRouteMessage(lat: number, lon: number, destLat?: number, destLon?: number) {
  try {
    const origin = await queryPhysicalStops({ source: 'CTP', lat, lon, radius: 1, limit: 1 });
    if (origin.total > 0) return CTP_ROUTING_NOTICE;
    if (destLat !== undefined && destLon !== undefined) {
      const destination = await queryPhysicalStops({ source: 'CTP', lat: destLat, lon: destLon, radius: 1, limit: 1 });
      if (destination.total > 0) return CTP_ROUTING_NOTICE;
    }
  } catch { console.warn('[ctp] optional coverage query failed'); }
  return 'No se encontraron rutas de autobús con los datos disponibles para este trayecto.';
}
