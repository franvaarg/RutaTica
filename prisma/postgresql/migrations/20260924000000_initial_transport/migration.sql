-- PostgreSQL staging baseline. Never replay the SQLite migration history.
BEGIN;
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "GtfsAgency" (
    "agency_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "phone" TEXT,
    "lang" TEXT,
    "email" TEXT,

    CONSTRAINT "GtfsAgency_pkey" PRIMARY KEY ("agency_id")
);

-- CreateTable
CREATE TABLE "GtfsCalendar" (
    "service_id" TEXT NOT NULL,
    "monday" BOOLEAN NOT NULL DEFAULT false,
    "tuesday" BOOLEAN NOT NULL DEFAULT false,
    "wednesday" BOOLEAN NOT NULL DEFAULT false,
    "thursday" BOOLEAN NOT NULL DEFAULT false,
    "friday" BOOLEAN NOT NULL DEFAULT false,
    "saturday" BOOLEAN NOT NULL DEFAULT false,
    "sunday" BOOLEAN NOT NULL DEFAULT false,
    "start_date" TEXT NOT NULL,
    "end_date" TEXT NOT NULL,

    CONSTRAINT "GtfsCalendar_pkey" PRIMARY KEY ("service_id")
);

-- CreateTable
CREATE TABLE "GtfsCalendarDate" (
    "id" SERIAL NOT NULL,
    "service_id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "exception_type" INTEGER NOT NULL,

    CONSTRAINT "GtfsCalendarDate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GtfsRoute" (
    "route_id" TEXT NOT NULL,
    "agency_id" TEXT NOT NULL,
    "short_name" TEXT,
    "long_name" TEXT,
    "type" INTEGER NOT NULL DEFAULT 3,
    "color" TEXT,
    "text_color" TEXT,
    "sort_order" INTEGER,

    CONSTRAINT "GtfsRoute_pkey" PRIMARY KEY ("route_id")
);

-- CreateTable
CREATE TABLE "GtfsStop" (
    "stop_id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "desc" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,
    "zone_id" TEXT,
    "location_type" INTEGER NOT NULL DEFAULT 0,
    "parent_station" TEXT,
    "wheelchair_boarding" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GtfsStop_pkey" PRIMARY KEY ("stop_id")
);

-- CreateTable
CREATE TABLE "GtfsTrip" (
    "trip_id" TEXT NOT NULL,
    "route_id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "headsign" TEXT,
    "short_name" TEXT,
    "direction_id" INTEGER,
    "block_id" TEXT,
    "shape_id" TEXT,
    "wheelchair_accessible" INTEGER NOT NULL DEFAULT 0,
    "bikes_allowed" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GtfsTrip_pkey" PRIMARY KEY ("trip_id")
);

-- CreateTable
CREATE TABLE "GtfsStopTime" (
    "id" SERIAL NOT NULL,
    "trip_id" TEXT NOT NULL,
    "stop_id" TEXT NOT NULL,
    "arrival_time" TEXT NOT NULL,
    "departure_time" TEXT NOT NULL,
    "stop_sequence" INTEGER NOT NULL,
    "stop_headsign" TEXT,
    "pickup_type" INTEGER NOT NULL DEFAULT 0,
    "drop_off_type" INTEGER NOT NULL DEFAULT 0,
    "shape_dist_traveled" DOUBLE PRECISION,
    "timepoint" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "GtfsStopTime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GtfsShape" (
    "id" SERIAL NOT NULL,
    "shape_id" TEXT NOT NULL,
    "shape_pt_lat" DOUBLE PRECISION NOT NULL,
    "shape_pt_lon" DOUBLE PRECISION NOT NULL,
    "shape_pt_sequence" INTEGER NOT NULL,
    "shape_dist_traveled" DOUBLE PRECISION,

    CONSTRAINT "GtfsShape_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GtfsFareAttribute" (
    "fare_id" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "currency_type" TEXT NOT NULL,
    "payment_method" INTEGER NOT NULL DEFAULT 0,
    "transfers" INTEGER NOT NULL DEFAULT 0,
    "transfer_duration" INTEGER,

    CONSTRAINT "GtfsFareAttribute_pkey" PRIMARY KEY ("fare_id")
);

-- CreateTable
CREATE TABLE "GtfsFareRule" (
    "id" SERIAL NOT NULL,
    "fare_id" TEXT NOT NULL,
    "route_id" TEXT,
    "origin_id" TEXT,
    "destination_id" TEXT,
    "contains_id" TEXT,

    CONSTRAINT "GtfsFareRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "logoUrl" TEXT,
    "description" TEXT,
    "primaryColor" TEXT,
    "secondaryColor" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StopRoute" (
    "id" TEXT NOT NULL,
    "stopId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "company" TEXT,
    "sequence" INTEGER NOT NULL,

    CONSTRAINT "StopRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Favorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stopName" TEXT NOT NULL,
    "routeNumber" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "originName" TEXT NOT NULL,
    "originLat" DOUBLE PRECISION NOT NULL,
    "originLon" DOUBLE PRECISION NOT NULL,
    "destName" TEXT NOT NULL,
    "destLat" DOUBLE PRECISION NOT NULL,
    "destLon" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RouteConfig" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "RouteConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RouteColor" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "textColor" TEXT NOT NULL,

    CONSTRAINT "RouteColor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RouteLogo" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "logoUrl" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "RouteLogo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportLog" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "recordsProcessed" INTEGER,
    "recordsCreated" INTEGER,
    "recordsUpdated" INTEGER,
    "errors" TEXT,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ImportLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ctp_stops" (
    "id" TEXT NOT NULL,
    "identityKey" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'CTP',
    "sourceStopId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,
    "coordX" TEXT NOT NULL,
    "coordY" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "canton" TEXT NOT NULL,
    "district" TEXT,
    "sourceMetadata" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ctp_stops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataSource" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "endpoint" TEXT,

    CONSTRAINT "DataSource_pkey" PRIMARY KEY ("id"),
    CHECK ("kind" IN ('GTFS','CTP'))
);

-- CreateTable
CREATE TABLE "DatasetVersion" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "manifest" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "activeSlot" TEXT,
    "retrievedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMPTZ(3),

    CONSTRAINT "DatasetVersion_pkey" PRIMARY KEY ("id"),
    CHECK ("status" IN ('pending','active','superseded','failed')),
    CHECK (("activeSlot" IS NULL AND "status" <> 'active') OR ("activeSlot" IS NOT NULL AND "activeSlot" = "sourceId" AND "status" = 'active'))
);

-- CreateTable
CREATE TABLE "ImportRun" (
    "id" TEXT NOT NULL,
    "datasetVersionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),
    "rowCounts" TEXT NOT NULL DEFAULT '{}',
    "validation" TEXT NOT NULL DEFAULT '{}',
    "errorSummary" TEXT,

    CONSTRAINT "ImportRun_pkey" PRIMARY KEY ("id"),
    CHECK ("status" IN ('pending','importing','validating','succeeded','failed'))
);

-- CreateTable
CREATE TABLE "ImportRejection" (
    "id" TEXT NOT NULL,
    "importRunId" TEXT NOT NULL,
    "sourceFile" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "payload" TEXT NOT NULL,

    CONSTRAINT "ImportRejection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GtfsAgencyVersion" (
    "id" TEXT NOT NULL,
    "datasetVersionId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "payload" TEXT NOT NULL,

    CONSTRAINT "GtfsAgencyVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GtfsStopVersion" (
    "id" TEXT NOT NULL,
    "datasetVersionId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT,
    "lat" DOUBLE PRECISION,
    "lon" DOUBLE PRECISION,
    "locationType" INTEGER NOT NULL DEFAULT 0,
    "parentId" TEXT,
    "payload" TEXT NOT NULL,

    CONSTRAINT "GtfsStopVersion_pkey" PRIMARY KEY ("id"),
    CHECK ("lat" IS NULL OR "lat" BETWEEN -90 AND 90),
    CHECK ("lon" IS NULL OR "lon" BETWEEN -180 AND 180),
    CHECK ("locationType" BETWEEN 0 AND 4)
);

-- CreateTable
CREATE TABLE "GtfsRouteVersion" (
    "id" TEXT NOT NULL,
    "datasetVersionId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "agencyId" TEXT,
    "shortName" TEXT,
    "longName" TEXT,
    "routeType" INTEGER NOT NULL,
    "payload" TEXT NOT NULL,

    CONSTRAINT "GtfsRouteVersion_pkey" PRIMARY KEY ("id"),
    CHECK ("routeType" IN (0,1,2,3,4,5,6,7,11,12))
);

-- CreateTable
CREATE TABLE "GtfsService" (
    "id" TEXT NOT NULL,
    "datasetVersionId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,

    CONSTRAINT "GtfsService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GtfsCalendarVersion" (
    "serviceId" TEXT NOT NULL,
    "monday" BOOLEAN NOT NULL,
    "tuesday" BOOLEAN NOT NULL,
    "wednesday" BOOLEAN NOT NULL,
    "thursday" BOOLEAN NOT NULL,
    "friday" BOOLEAN NOT NULL,
    "saturday" BOOLEAN NOT NULL,
    "sunday" BOOLEAN NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,

    CONSTRAINT "GtfsCalendarVersion_pkey" PRIMARY KEY ("serviceId"),
    CHECK ("startDate" <= "endDate")
);

-- CreateTable
CREATE TABLE "GtfsCalendarDateVersion" (
    "serviceId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "exceptionType" INTEGER NOT NULL,

    CONSTRAINT "GtfsCalendarDateVersion_pkey" PRIMARY KEY ("serviceId","date"),
    CHECK ("exceptionType" IN (1,2))
);

-- CreateTable
CREATE TABLE "GtfsShapeVersion" (
    "id" TEXT NOT NULL,
    "datasetVersionId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,

    CONSTRAINT "GtfsShapeVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GtfsShapePoint" (
    "shapeId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,
    "distance" DOUBLE PRECISION,

    CONSTRAINT "GtfsShapePoint_pkey" PRIMARY KEY ("shapeId","sequence"),
    CHECK ("sequence" >= 0),
    CHECK ("lat" BETWEEN -90 AND 90),
    CHECK ("lon" BETWEEN -180 AND 180),
    CHECK ("distance" IS NULL OR "distance" >= 0)
);

-- CreateTable
CREATE TABLE "GtfsTripVersion" (
    "id" TEXT NOT NULL,
    "datasetVersionId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "shapeId" TEXT,
    "payload" TEXT NOT NULL,

    CONSTRAINT "GtfsTripVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GtfsStopTimeVersion" (
    "datasetVersionId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "stopId" TEXT NOT NULL,
    "arrivalSeconds" INTEGER,
    "departureSeconds" INTEGER,
    "payload" TEXT NOT NULL,

    CONSTRAINT "GtfsStopTimeVersion_pkey" PRIMARY KEY ("tripId","sequence"),
    CHECK ("sequence" >= 0),
    CHECK ("arrivalSeconds" IS NULL OR "arrivalSeconds" >= 0),
    CHECK ("departureSeconds" IS NULL OR "departureSeconds" >= "arrivalSeconds")
);

-- CreateTable
CREATE TABLE "CtpStopIdentity" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "reviewStatus" TEXT NOT NULL DEFAULT 'unreviewed',
    "currentObservationId" TEXT,

    CONSTRAINT "CtpStopIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CtpStopObservation" (
    "id" TEXT NOT NULL,
    "stopId" TEXT NOT NULL,
    "datasetVersionId" TEXT NOT NULL,
    "sourceStopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,
    "province" TEXT NOT NULL,
    "canton" TEXT NOT NULL,
    "district" TEXT,
    "provinceCode" TEXT,
    "cantonCode" TEXT,
    "coordX" TEXT,
    "coordY" TEXT,
    "sourceCrs" TEXT NOT NULL,
    "outputCrs" TEXT NOT NULL,
    "retrievedAt" TIMESTAMPTZ(3) NOT NULL,
    "reviewStatus" TEXT NOT NULL,
    "provenance" TEXT NOT NULL,

    CONSTRAINT "CtpStopObservation_pkey" PRIMARY KEY ("id"),
    CHECK (length(trim("name")) > 0),
    CHECK ("lat" BETWEEN -90 AND 90),
    CHECK ("lon" BETWEEN -180 AND 180),
    CHECK ("outputCrs" = 'EPSG:4326')
);

-- CreateTable
CREATE TABLE "StopReconciliation" (
    "id" TEXT NOT NULL,
    "gtfsStopId" TEXT NOT NULL,
    "ctpObservationId" TEXT NOT NULL,
    "distanceMeters" DOUBLE PRECISION NOT NULL,
    "method" TEXT NOT NULL,
    "algorithmVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'candidate',
    "reviewer" TEXT,
    "evidence" TEXT,
    "reviewedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StopReconciliation_pkey" PRIMARY KEY ("id"),
    CHECK ("distanceMeters" >= 0),
    CHECK ("status" IN ('candidate','ambiguous','accepted','rejected')),
    CHECK ("status" NOT IN ('accepted','rejected') OR ("reviewer" IS NOT NULL AND length(trim("reviewer")) > 0 AND "evidence" IS NOT NULL AND length(trim("evidence")) > 0 AND "reviewedAt" IS NOT NULL))
);

-- CreateIndex
CREATE INDEX "GtfsCalendarDate_date_service_id_idx" ON "GtfsCalendarDate"("date", "service_id");

-- CreateIndex
CREATE UNIQUE INDEX "GtfsCalendarDate_service_id_date_key" ON "GtfsCalendarDate"("service_id", "date");

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
CREATE UNIQUE INDEX "GtfsStopTime_trip_id_stop_sequence_key" ON "GtfsStopTime"("trip_id", "stop_sequence");

-- CreateIndex
CREATE UNIQUE INDEX "GtfsShape_shape_id_shape_pt_sequence_key" ON "GtfsShape"("shape_id", "shape_pt_sequence");

-- CreateIndex
CREATE INDEX "StopRoute_routeId_sequence_idx" ON "StopRoute"("routeId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "StopRoute_stopId_routeId_key" ON "StopRoute"("stopId", "routeId");

-- CreateIndex
CREATE UNIQUE INDEX "RouteConfig_key_key" ON "RouteConfig"("key");

-- CreateIndex
CREATE UNIQUE INDEX "RouteColor_routeId_key" ON "RouteColor"("routeId");

-- CreateIndex
CREATE UNIQUE INDEX "RouteLogo_routeId_key" ON "RouteLogo"("routeId");

-- CreateIndex
CREATE UNIQUE INDEX "ctp_stops_identityKey_key" ON "ctp_stops"("identityKey");

-- CreateIndex
CREATE INDEX "ctp_stops_lat_lon_idx" ON "ctp_stops"("lat", "lon");

-- CreateIndex
CREATE INDEX "ctp_stops_lon_lat_idx" ON "ctp_stops"("lon", "lat");

-- CreateIndex
CREATE INDEX "ctp_stops_province_idx" ON "ctp_stops"("province");

-- CreateIndex
CREATE INDEX "ctp_stops_canton_idx" ON "ctp_stops"("canton");

-- CreateIndex
CREATE INDEX "ctp_stops_sourceStopId_idx" ON "ctp_stops"("sourceStopId");

-- CreateIndex
CREATE UNIQUE INDEX "DataSource_key_key" ON "DataSource"("key");

-- CreateIndex
CREATE UNIQUE INDEX "DatasetVersion_activeSlot_key" ON "DatasetVersion"("activeSlot");

-- CreateIndex
CREATE UNIQUE INDEX "DatasetVersion_sourceId_checksum_key" ON "DatasetVersion"("sourceId", "checksum");

-- CreateIndex
CREATE INDEX "ImportRun_datasetVersionId_status_idx" ON "ImportRun"("datasetVersionId", "status");

-- CreateIndex
CREATE INDEX "ImportRejection_importRunId_idx" ON "ImportRejection"("importRunId");

-- CreateIndex
CREATE UNIQUE INDEX "GtfsAgencyVersion_datasetVersionId_externalId_key" ON "GtfsAgencyVersion"("datasetVersionId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "GtfsAgencyVersion_datasetVersionId_id_key" ON "GtfsAgencyVersion"("datasetVersionId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "GtfsStopVersion_datasetVersionId_externalId_key" ON "GtfsStopVersion"("datasetVersionId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "GtfsStopVersion_datasetVersionId_id_key" ON "GtfsStopVersion"("datasetVersionId", "id");

-- CreateIndex
CREATE INDEX "GtfsRouteVersion_agencyId_idx" ON "GtfsRouteVersion"("agencyId");

-- CreateIndex
CREATE UNIQUE INDEX "GtfsRouteVersion_datasetVersionId_externalId_key" ON "GtfsRouteVersion"("datasetVersionId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "GtfsRouteVersion_datasetVersionId_id_key" ON "GtfsRouteVersion"("datasetVersionId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "GtfsService_datasetVersionId_externalId_key" ON "GtfsService"("datasetVersionId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "GtfsService_datasetVersionId_id_key" ON "GtfsService"("datasetVersionId", "id");

-- CreateIndex
CREATE INDEX "GtfsCalendarDateVersion_date_serviceId_idx" ON "GtfsCalendarDateVersion"("date", "serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "GtfsShapeVersion_datasetVersionId_externalId_key" ON "GtfsShapeVersion"("datasetVersionId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "GtfsShapeVersion_datasetVersionId_id_key" ON "GtfsShapeVersion"("datasetVersionId", "id");

-- CreateIndex
CREATE INDEX "GtfsTripVersion_routeId_idx" ON "GtfsTripVersion"("routeId");

-- CreateIndex
CREATE INDEX "GtfsTripVersion_serviceId_idx" ON "GtfsTripVersion"("serviceId");

-- CreateIndex
CREATE INDEX "GtfsTripVersion_shapeId_idx" ON "GtfsTripVersion"("shapeId");

-- CreateIndex
CREATE UNIQUE INDEX "GtfsTripVersion_datasetVersionId_externalId_key" ON "GtfsTripVersion"("datasetVersionId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "GtfsTripVersion_datasetVersionId_id_key" ON "GtfsTripVersion"("datasetVersionId", "id");

-- CreateIndex
CREATE INDEX "GtfsStopTimeVersion_stopId_idx" ON "GtfsStopTimeVersion"("stopId");

-- CreateIndex
CREATE UNIQUE INDEX "CtpStopIdentity_currentObservationId_key" ON "CtpStopIdentity"("currentObservationId");

-- CreateIndex
CREATE UNIQUE INDEX "CtpStopIdentity_sourceId_externalId_key" ON "CtpStopIdentity"("sourceId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "CtpStopIdentity_id_currentObservationId_key" ON "CtpStopIdentity"("id", "currentObservationId");

-- CreateIndex
CREATE INDEX "CtpStopObservation_provinceCode_cantonCode_idx" ON "CtpStopObservation"("provinceCode", "cantonCode");

-- CreateIndex
CREATE INDEX "CtpStopObservation_sourceStopId_idx" ON "CtpStopObservation"("sourceStopId");

-- CreateIndex
CREATE INDEX "CtpStopObservation_datasetVersionId_idx" ON "CtpStopObservation"("datasetVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "CtpStopObservation_stopId_datasetVersionId_key" ON "CtpStopObservation"("stopId", "datasetVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "CtpStopObservation_stopId_id_key" ON "CtpStopObservation"("stopId", "id");

-- CreateIndex
CREATE INDEX "StopReconciliation_ctpObservationId_status_idx" ON "StopReconciliation"("ctpObservationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StopReconciliation_gtfsStopId_ctpObservationId_algorithmVer_key" ON "StopReconciliation"("gtfsStopId", "ctpObservationId", "algorithmVersion");

-- AddForeignKey
ALTER TABLE "GtfsRoute" ADD CONSTRAINT "GtfsRoute_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "GtfsAgency"("agency_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GtfsTrip" ADD CONSTRAINT "GtfsTrip_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "GtfsRoute"("route_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GtfsStopTime" ADD CONSTRAINT "GtfsStopTime_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "GtfsTrip"("trip_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GtfsStopTime" ADD CONSTRAINT "GtfsStopTime_stop_id_fkey" FOREIGN KEY ("stop_id") REFERENCES "GtfsStop"("stop_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GtfsFareRule" ADD CONSTRAINT "GtfsFareRule_fare_id_fkey" FOREIGN KEY ("fare_id") REFERENCES "GtfsFareAttribute"("fare_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GtfsFareRule" ADD CONSTRAINT "GtfsFareRule_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "GtfsRoute"("route_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StopRoute" ADD CONSTRAINT "StopRoute_stopId_fkey" FOREIGN KEY ("stopId") REFERENCES "GtfsStop"("stop_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StopRoute" ADD CONSTRAINT "StopRoute_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "GtfsRoute"("route_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteColor" ADD CONSTRAINT "RouteColor_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "GtfsRoute"("route_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteLogo" ADD CONSTRAINT "RouteLogo_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "GtfsRoute"("route_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatasetVersion" ADD CONSTRAINT "DatasetVersion_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "DataSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRun" ADD CONSTRAINT "ImportRun_datasetVersionId_fkey" FOREIGN KEY ("datasetVersionId") REFERENCES "DatasetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRejection" ADD CONSTRAINT "ImportRejection_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "ImportRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GtfsAgencyVersion" ADD CONSTRAINT "GtfsAgencyVersion_datasetVersionId_fkey" FOREIGN KEY ("datasetVersionId") REFERENCES "DatasetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GtfsStopVersion" ADD CONSTRAINT "GtfsStopVersion_datasetVersionId_fkey" FOREIGN KEY ("datasetVersionId") REFERENCES "DatasetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GtfsStopVersion" ADD CONSTRAINT "GtfsStopVersion_datasetVersionId_parentId_fkey" FOREIGN KEY ("datasetVersionId", "parentId") REFERENCES "GtfsStopVersion"("datasetVersionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GtfsRouteVersion" ADD CONSTRAINT "GtfsRouteVersion_datasetVersionId_fkey" FOREIGN KEY ("datasetVersionId") REFERENCES "DatasetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GtfsRouteVersion" ADD CONSTRAINT "GtfsRouteVersion_datasetVersionId_agencyId_fkey" FOREIGN KEY ("datasetVersionId", "agencyId") REFERENCES "GtfsAgencyVersion"("datasetVersionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GtfsService" ADD CONSTRAINT "GtfsService_datasetVersionId_fkey" FOREIGN KEY ("datasetVersionId") REFERENCES "DatasetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GtfsCalendarVersion" ADD CONSTRAINT "GtfsCalendarVersion_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "GtfsService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GtfsCalendarDateVersion" ADD CONSTRAINT "GtfsCalendarDateVersion_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "GtfsService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GtfsShapeVersion" ADD CONSTRAINT "GtfsShapeVersion_datasetVersionId_fkey" FOREIGN KEY ("datasetVersionId") REFERENCES "DatasetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GtfsShapePoint" ADD CONSTRAINT "GtfsShapePoint_shapeId_fkey" FOREIGN KEY ("shapeId") REFERENCES "GtfsShapeVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GtfsTripVersion" ADD CONSTRAINT "GtfsTripVersion_datasetVersionId_fkey" FOREIGN KEY ("datasetVersionId") REFERENCES "DatasetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GtfsTripVersion" ADD CONSTRAINT "GtfsTripVersion_datasetVersionId_routeId_fkey" FOREIGN KEY ("datasetVersionId", "routeId") REFERENCES "GtfsRouteVersion"("datasetVersionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GtfsTripVersion" ADD CONSTRAINT "GtfsTripVersion_datasetVersionId_serviceId_fkey" FOREIGN KEY ("datasetVersionId", "serviceId") REFERENCES "GtfsService"("datasetVersionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GtfsTripVersion" ADD CONSTRAINT "GtfsTripVersion_datasetVersionId_shapeId_fkey" FOREIGN KEY ("datasetVersionId", "shapeId") REFERENCES "GtfsShapeVersion"("datasetVersionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GtfsStopTimeVersion" ADD CONSTRAINT "GtfsStopTimeVersion_datasetVersionId_tripId_fkey" FOREIGN KEY ("datasetVersionId", "tripId") REFERENCES "GtfsTripVersion"("datasetVersionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GtfsStopTimeVersion" ADD CONSTRAINT "GtfsStopTimeVersion_datasetVersionId_stopId_fkey" FOREIGN KEY ("datasetVersionId", "stopId") REFERENCES "GtfsStopVersion"("datasetVersionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CtpStopIdentity" ADD CONSTRAINT "CtpStopIdentity_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "DataSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CtpStopIdentity" ADD CONSTRAINT "CtpStopIdentity_id_currentObservationId_fkey" FOREIGN KEY ("id", "currentObservationId") REFERENCES "CtpStopObservation"("stopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CtpStopObservation" ADD CONSTRAINT "CtpStopObservation_stopId_fkey" FOREIGN KEY ("stopId") REFERENCES "CtpStopIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CtpStopObservation" ADD CONSTRAINT "CtpStopObservation_datasetVersionId_fkey" FOREIGN KEY ("datasetVersionId") REFERENCES "DatasetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StopReconciliation" ADD CONSTRAINT "StopReconciliation_gtfsStopId_fkey" FOREIGN KEY ("gtfsStopId") REFERENCES "GtfsStopVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StopReconciliation" ADD CONSTRAINT "StopReconciliation_ctpObservationId_fkey" FOREIGN KEY ("ctpObservationId") REFERENCES "CtpStopObservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


COMMIT;
