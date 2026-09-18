-- CreateTable
CREATE TABLE "GtfsAgency" (
    "agency_id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "phone" TEXT,
    "lang" TEXT,
    "email" TEXT
);

-- CreateTable
CREATE TABLE "GtfsCalendar" (
    "service_id" TEXT NOT NULL PRIMARY KEY,
    "monday" BOOLEAN NOT NULL DEFAULT false,
    "tuesday" BOOLEAN NOT NULL DEFAULT false,
    "wednesday" BOOLEAN NOT NULL DEFAULT false,
    "thursday" BOOLEAN NOT NULL DEFAULT false,
    "friday" BOOLEAN NOT NULL DEFAULT false,
    "saturday" BOOLEAN NOT NULL DEFAULT false,
    "sunday" BOOLEAN NOT NULL DEFAULT false,
    "start_date" TEXT NOT NULL,
    "end_date" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "GtfsCalendarDate" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "service_id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "exception_type" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "GtfsRoute" (
    "route_id" TEXT NOT NULL PRIMARY KEY,
    "agency_id" TEXT NOT NULL,
    "short_name" TEXT,
    "long_name" TEXT,
    "type" INTEGER NOT NULL DEFAULT 3,
    "color" TEXT,
    "text_color" TEXT,
    "sort_order" INTEGER,
    CONSTRAINT "GtfsRoute_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "GtfsAgency" ("agency_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GtfsStop" (
    "stop_id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "desc" TEXT,
    "lat" REAL NOT NULL,
    "lon" REAL NOT NULL,
    "zone_id" TEXT,
    "location_type" INTEGER NOT NULL DEFAULT 0,
    "parent_station" TEXT,
    "wheelchair_boarding" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "GtfsTrip" (
    "trip_id" TEXT NOT NULL PRIMARY KEY,
    "route_id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "headsign" TEXT,
    "short_name" TEXT,
    "direction_id" INTEGER,
    "block_id" TEXT,
    "shape_id" TEXT,
    "wheelchair_accessible" INTEGER NOT NULL DEFAULT 0,
    "bikes_allowed" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "GtfsTrip_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "GtfsRoute" ("route_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GtfsTrip_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "GtfsCalendar" ("service_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GtfsStopTime" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "trip_id" TEXT NOT NULL,
    "stop_id" TEXT NOT NULL,
    "arrival_time" TEXT NOT NULL,
    "departure_time" TEXT NOT NULL,
    "stop_sequence" INTEGER NOT NULL,
    "stop_headsign" TEXT,
    "pickup_type" INTEGER NOT NULL DEFAULT 0,
    "drop_off_type" INTEGER NOT NULL DEFAULT 0,
    "shape_dist_traveled" REAL,
    "timepoint" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "GtfsStopTime_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "GtfsTrip" ("trip_id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GtfsStopTime_stop_id_fkey" FOREIGN KEY ("stop_id") REFERENCES "GtfsStop" ("stop_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GtfsShape" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shape_id" TEXT NOT NULL,
    "shape_pt_lat" REAL NOT NULL,
    "shape_pt_lon" REAL NOT NULL,
    "shape_pt_sequence" INTEGER NOT NULL,
    "shape_dist_traveled" REAL
);

-- CreateTable
CREATE TABLE "GtfsFareAttribute" (
    "fare_id" TEXT NOT NULL PRIMARY KEY,
    "price" REAL NOT NULL,
    "currency_type" TEXT NOT NULL,
    "payment_method" INTEGER NOT NULL DEFAULT 0,
    "transfers" INTEGER NOT NULL DEFAULT 0,
    "transfer_duration" INTEGER
);

-- CreateTable
CREATE TABLE "GtfsFareRule" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "fare_id" TEXT NOT NULL,
    "route_id" TEXT,
    "origin_id" TEXT,
    "destination_id" TEXT,
    "contains_id" TEXT,
    CONSTRAINT "GtfsFareRule_fare_id_fkey" FOREIGN KEY ("fare_id") REFERENCES "GtfsFareAttribute" ("fare_id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GtfsFareRule_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "GtfsRoute" ("route_id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "logoUrl" TEXT,
    "description" TEXT,
    "primaryColor" TEXT,
    "secondaryColor" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "StopRoute" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stopId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "company" TEXT,
    "sequence" INTEGER NOT NULL,
    CONSTRAINT "StopRoute_stopId_fkey" FOREIGN KEY ("stopId") REFERENCES "GtfsStop" ("stop_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StopRoute_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "GtfsRoute" ("route_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Favorite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "stopName" TEXT NOT NULL,
    "routeNumber" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SearchHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "originName" TEXT NOT NULL,
    "originLat" REAL NOT NULL,
    "originLon" REAL NOT NULL,
    "destName" TEXT NOT NULL,
    "destLat" REAL NOT NULL,
    "destLon" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RouteConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT
);

-- CreateTable
CREATE TABLE "RouteColor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "routeId" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "textColor" TEXT NOT NULL,
    CONSTRAINT "RouteColor_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "GtfsRoute" ("route_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RouteLogo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "routeId" TEXT NOT NULL,
    "logoUrl" TEXT NOT NULL,
    "description" TEXT,
    CONSTRAINT "RouteLogo_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "GtfsRoute" ("route_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ImportLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filename" TEXT NOT NULL,
    "recordsProcessed" INTEGER,
    "recordsCreated" INTEGER,
    "recordsUpdated" INTEGER,
    "errors" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME
);

-- CreateIndex
CREATE INDEX "GtfsRoute_agency_id_idx" ON "GtfsRoute"("agency_id");

-- CreateIndex
CREATE INDEX "GtfsStop_lat_lon_idx" ON "GtfsStop"("lat", "lon");

-- CreateIndex
CREATE INDEX "GtfsTrip_route_id_idx" ON "GtfsTrip"("route_id");

-- CreateIndex
CREATE INDEX "GtfsTrip_service_id_idx" ON "GtfsTrip"("service_id");

-- CreateIndex
CREATE INDEX "GtfsTrip_shape_id_idx" ON "GtfsTrip"("shape_id");

-- CreateIndex
CREATE INDEX "GtfsStopTime_trip_id_idx" ON "GtfsStopTime"("trip_id");

-- CreateIndex
CREATE INDEX "GtfsStopTime_stop_id_idx" ON "GtfsStopTime"("stop_id");

-- CreateIndex
CREATE INDEX "GtfsStopTime_arrival_time_idx" ON "GtfsStopTime"("arrival_time");

-- CreateIndex
CREATE INDEX "GtfsShape_shape_id_idx" ON "GtfsShape"("shape_id");

-- CreateIndex
CREATE INDEX "StopRoute_stopId_routeId_idx" ON "StopRoute"("stopId", "routeId");

-- CreateIndex
CREATE UNIQUE INDEX "RouteConfig_key_key" ON "RouteConfig"("key");

-- CreateIndex
CREATE UNIQUE INDEX "RouteColor_routeId_key" ON "RouteColor"("routeId");

-- CreateIndex
CREATE UNIQUE INDEX "RouteLogo_routeId_key" ON "RouteLogo"("routeId");
