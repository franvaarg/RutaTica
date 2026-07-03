---
Task ID: 2
Agent: Z.ai Code (API & Algorithm Agent)
Task: Create complete API endpoints and the Best Route search algorithm

Work Log:

## Utility Files Created

### /home/z/my-project/src/lib/spatial.ts
- `haversineDistance(lat1, lon1, lat2, lon2)` - returns distance in km using Haversine formula
- `findNearestStops(lat, lon, maxDistanceKm, limit)` - bounding box + haversine query against GtfsStop
- `bearing(lat1, lon1, lat2, lon2)` - initial bearing in degrees (0-360)
- `midpoint(lat1, lon1, lat2, lon2)` - geographic midpoint
- `walkingTimeMinutes(distanceKm)` - estimates walking time at 5 km/h

### /home/z/my-project/src/lib/route-scoring.ts
- `RouteScoreConfig` interface with weights: time 0.4, walking 0.25, transfers 0.2, cost 0.15
- `loadScoringConfig()` - reads from RouteConfig table, falls back to defaults
- `calculateRouteScore(route, allRoutes, config)` - normalizes each factor 0-1, applies weights
- `scoreAndSortRoutes(routes, config)` - scores and sorts ascending (best first)

### /home/z/my-project/src/lib/time-utils.ts
- `timeToMinutes("HH:MM:SS")` - handles times > 24:00:00 for next-day service
- `minutesToTime(minutes)` - converts back to "HH:MM:SS"
- `getCurrentServiceId()` - returns "weekday", "saturday", or "sunday"
- `getNextDepartureTime(stopTimes, afterTimeStr)` - finds next departure after given time
- `getActiveServiceIdsToday()` - considers calendar + exceptions
- `getServiceException(serviceId, dateStr)` - checks calendar_dates for added/removed service

## API Endpoints Created/Updated

### GET /api/routes (NEW - replaces old search)
- Query: ?search=&company=&limit=20&offset=0
- Returns all GTFS routes with agency name, company, colors, trip/stop counts
- Response: { routes: Route[], total: number }

### GET /api/stops (REPLACED - was using old schema)
- Query: ?search=&lat=&lon=&radius=5&limit=20
- If lat/lon: bounding box filter, sort by haversine distance, include distanceKm
- If search: filter by name/code/desc
- Response: { stops: Stop[], total: number }

### GET /api/companies (NEW)
- Returns all active companies with route count (matched via agency name)
- Response: { companies: Company[] }

### GET /api/nearest-stop (NEW)
- Query: ?lat=&lon=&radius=2 (lat/lon required)
- Uses findNearestStops() with bounding box + haversine
- Response: { stops: { stop, distanceKm }[] }

### GET /api/trip/[tripId] (NEW)
- Returns full trip: route info, stops with times, shape points
- Response: { trip, route, stops: StopTimeWithStop[], shape: Point[] }

### GET /api/fare/[routeId] (NEW)
- Returns cheapest fare for a route, plus all fares
- Response: { fare, price, currency, allFares }

### POST /api/favorites (NEW)
- Body: { userId, stopName, routeNumber, destination }
- Response: { favorite } (201)

### GET /api/favorites (NEW)
- Query: ?userId=anonymous
- Response: { favorites: Favorite[] }

### DELETE /api/favorites/[id] (NEW)
- Response: { success: true }

### POST /api/history (NEW)
- Body: { userId, originName, originLat, originLon, destName, destLat, destLon }
- Response: { history } (201)

### GET /api/history (NEW)
- Query: ?userId=anonymous&limit=20
- Response: { history: SearchHistory[] }

### GET /api/settings (NEW)
- Query: ?userId=anonymous
- Response: { settings: AppSetting[] }

### POST /api/settings (NEW)
- Body: { userId, key, value }
- Upserts setting by userId+key
- Response: { setting }

### GET /api/shape/[shapeId] (NEW)
- Returns ordered shape coordinates
- Response: { points: { lat, lon, sequence, distanceTraveled }[] }

### GET /api/best-route (NEW - CORE ALGORITHM)
- Query: ?originLat=&originLon=&destLat=&destLon=&departAfter=HH:MM:SS
- Algorithm:
  1. Find nearest origin stops within 1km (bounding box + haversine)
  2. Find nearest destination stops within 1km
  3. Query StopRoute for routes serving both origin and destination stops
  4. For each direct route: find next trip after departAfter, calculate travel time, walking distances, fare
  5. If <3 direct routes: search for 1-transfer routes via common stops
  6. Score all options using normalized weighted scoring (time 0.4, walk 0.25, transfers 0.2, cost 0.15)
  7. Return top 5 sorted by score ascending

### GET /api/routes/plan (UPDATED)
- Now delegates to /api/best-route when lat/lon/destination provided
- Uses Nominatim to geocode destination name to coordinates
- Falls back gracefully if geocoding fails

### Preserved Existing Routes
- /api/routes/search - kept as-is (uses old schema, for backward compat)
- /api/routes/nearby - kept as-is
- /api/locations/search - kept as-is (Nominatim geocoding)

## Files Modified
- /home/z/my-project/src/app/api/routes/route.ts (created)
- /home/z/my-project/src/app/api/stops/route.ts (replaced)
- /home/z/my-project/src/app/api/routes/plan/route.ts (updated)
- /home/z/my-project/src/app/api/companies/route.ts (created)
- /home/z/my-project/src/app/api/nearest-stop/route.ts (created)
- /home/z/my-project/src/app/api/trip/[tripId]/route.ts (created)
- /home/z/my-project/src/app/api/fare/[routeId]/route.ts (created)
- /home/z/my-project/src/app/api/favorites/route.ts (created)
- /home/z/my-project/src/app/api/favorites/[id]/route.ts (created)
- /home/z/my-project/src/app/api/history/route.ts (created)
- /home/z/my-project/src/app/api/settings/route.ts (created)
- /home/z/my-project/src/app/api/shape/[shapeId]/route.ts (created)
- /home/z/my-project/src/app/api/best-route/route.ts (created)
- /home/z/my-project/src/lib/spatial.ts (created)
- /home/z/my-project/src/lib/route-scoring.ts (created)
- /home/z/my-project/src/lib/time-utils.ts (created)