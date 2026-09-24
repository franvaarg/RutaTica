-- DropIndex
DROP INDEX "GtfsStopTime_trip_id_stop_sequence_idx";

-- DropIndex
DROP INDEX "GtfsShape_shape_id_shape_pt_sequence_idx";

-- DropIndex
DROP INDEX "StopRoute_stopId_routeId_idx";

-- CreateTable
CREATE TABLE "DataSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "endpoint" TEXT,
    CHECK ("kind" IN ('GTFS','CTP'))
);

-- CreateTable
CREATE TABLE "DatasetVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceId" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "manifest" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "activeSlot" TEXT,
    "retrievedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" DATETIME,
    CONSTRAINT "DatasetVersion_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "DataSource" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK ("status" IN ('pending','active','superseded','failed')),
    CHECK (("activeSlot" IS NULL AND "status" <> 'active') OR ("activeSlot" IS NOT NULL AND "activeSlot" = "sourceId" AND "status" = 'active'))
);

-- CreateTable
CREATE TABLE "ImportRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "datasetVersionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "rowCounts" TEXT NOT NULL DEFAULT '{}',
    "validation" TEXT NOT NULL DEFAULT '{}',
    "errorSummary" TEXT,
    CONSTRAINT "ImportRun_datasetVersionId_fkey" FOREIGN KEY ("datasetVersionId") REFERENCES "DatasetVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK ("status" IN ('pending','importing','validating','succeeded','failed'))
);

-- CreateTable
CREATE TABLE "ImportRejection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "importRunId" TEXT NOT NULL,
    "sourceFile" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    CONSTRAINT "ImportRejection_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "ImportRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GtfsAgencyVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "datasetVersionId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    CONSTRAINT "GtfsAgencyVersion_datasetVersionId_fkey" FOREIGN KEY ("datasetVersionId") REFERENCES "DatasetVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GtfsStopVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "datasetVersionId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT,
    "lat" REAL,
    "lon" REAL,
    "locationType" INTEGER NOT NULL DEFAULT 0,
    "parentId" TEXT,
    "payload" TEXT NOT NULL,
    CONSTRAINT "GtfsStopVersion_datasetVersionId_fkey" FOREIGN KEY ("datasetVersionId") REFERENCES "DatasetVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GtfsStopVersion_datasetVersionId_parentId_fkey" FOREIGN KEY ("datasetVersionId", "parentId") REFERENCES "GtfsStopVersion" ("datasetVersionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK ("lat" IS NULL OR "lat" BETWEEN -90 AND 90),
    CHECK ("lon" IS NULL OR "lon" BETWEEN -180 AND 180),
    CHECK ("locationType" BETWEEN 0 AND 4)
);

-- CreateTable
CREATE TABLE "GtfsRouteVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "datasetVersionId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "agencyId" TEXT,
    "shortName" TEXT,
    "longName" TEXT,
    "routeType" INTEGER NOT NULL,
    "payload" TEXT NOT NULL,
    CONSTRAINT "GtfsRouteVersion_datasetVersionId_fkey" FOREIGN KEY ("datasetVersionId") REFERENCES "DatasetVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GtfsRouteVersion_datasetVersionId_agencyId_fkey" FOREIGN KEY ("datasetVersionId", "agencyId") REFERENCES "GtfsAgencyVersion" ("datasetVersionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK ("routeType" IN (0,1,2,3,4,5,6,7,11,12))
);

-- CreateTable
CREATE TABLE "GtfsService" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "datasetVersionId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    CONSTRAINT "GtfsService_datasetVersionId_fkey" FOREIGN KEY ("datasetVersionId") REFERENCES "DatasetVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GtfsCalendarVersion" (
    "serviceId" TEXT NOT NULL PRIMARY KEY,
    "monday" BOOLEAN NOT NULL,
    "tuesday" BOOLEAN NOT NULL,
    "wednesday" BOOLEAN NOT NULL,
    "thursday" BOOLEAN NOT NULL,
    "friday" BOOLEAN NOT NULL,
    "saturday" BOOLEAN NOT NULL,
    "sunday" BOOLEAN NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    CONSTRAINT "GtfsCalendarVersion_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "GtfsService" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK ("startDate" <= "endDate")
);

-- CreateTable
CREATE TABLE "GtfsCalendarDateVersion" (
    "serviceId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "exceptionType" INTEGER NOT NULL,

    PRIMARY KEY ("serviceId", "date"),
    CONSTRAINT "GtfsCalendarDateVersion_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "GtfsService" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK ("exceptionType" IN (1,2))
);

-- CreateTable
CREATE TABLE "GtfsShapeVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "datasetVersionId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    CONSTRAINT "GtfsShapeVersion_datasetVersionId_fkey" FOREIGN KEY ("datasetVersionId") REFERENCES "DatasetVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GtfsShapePoint" (
    "shapeId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "lat" REAL NOT NULL,
    "lon" REAL NOT NULL,
    "distance" REAL,

    PRIMARY KEY ("shapeId", "sequence"),
    CONSTRAINT "GtfsShapePoint_shapeId_fkey" FOREIGN KEY ("shapeId") REFERENCES "GtfsShapeVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK ("sequence" >= 0),
    CHECK ("lat" BETWEEN -90 AND 90),
    CHECK ("lon" BETWEEN -180 AND 180),
    CHECK ("distance" IS NULL OR "distance" >= 0)
);

-- CreateTable
CREATE TABLE "GtfsTripVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "datasetVersionId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "shapeId" TEXT,
    "payload" TEXT NOT NULL,
    CONSTRAINT "GtfsTripVersion_datasetVersionId_fkey" FOREIGN KEY ("datasetVersionId") REFERENCES "DatasetVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GtfsTripVersion_datasetVersionId_routeId_fkey" FOREIGN KEY ("datasetVersionId", "routeId") REFERENCES "GtfsRouteVersion" ("datasetVersionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GtfsTripVersion_datasetVersionId_serviceId_fkey" FOREIGN KEY ("datasetVersionId", "serviceId") REFERENCES "GtfsService" ("datasetVersionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GtfsTripVersion_datasetVersionId_shapeId_fkey" FOREIGN KEY ("datasetVersionId", "shapeId") REFERENCES "GtfsShapeVersion" ("datasetVersionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
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

    PRIMARY KEY ("tripId", "sequence"),
    CONSTRAINT "GtfsStopTimeVersion_datasetVersionId_tripId_fkey" FOREIGN KEY ("datasetVersionId", "tripId") REFERENCES "GtfsTripVersion" ("datasetVersionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "GtfsStopTimeVersion_datasetVersionId_stopId_fkey" FOREIGN KEY ("datasetVersionId", "stopId") REFERENCES "GtfsStopVersion" ("datasetVersionId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK ("sequence" >= 0),
    CHECK ("arrivalSeconds" IS NULL OR "arrivalSeconds" >= 0),
    CHECK ("departureSeconds" IS NULL OR "departureSeconds" >= "arrivalSeconds")
);

-- CreateTable
CREATE TABLE "CtpStopIdentity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "reviewStatus" TEXT NOT NULL DEFAULT 'unreviewed',
    "currentObservationId" TEXT,
    CONSTRAINT "CtpStopIdentity_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "DataSource" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CtpStopIdentity_id_currentObservationId_fkey" FOREIGN KEY ("id", "currentObservationId") REFERENCES "CtpStopObservation" ("stopId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CtpStopObservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stopId" TEXT NOT NULL,
    "datasetVersionId" TEXT NOT NULL,
    "sourceStopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lat" REAL NOT NULL,
    "lon" REAL NOT NULL,
    "province" TEXT NOT NULL,
    "canton" TEXT NOT NULL,
    "district" TEXT,
    "provinceCode" TEXT,
    "cantonCode" TEXT,
    "coordX" TEXT,
    "coordY" TEXT,
    "sourceCrs" TEXT NOT NULL,
    "outputCrs" TEXT NOT NULL,
    "retrievedAt" DATETIME NOT NULL,
    "reviewStatus" TEXT NOT NULL,
    "provenance" TEXT NOT NULL,
    CONSTRAINT "CtpStopObservation_stopId_fkey" FOREIGN KEY ("stopId") REFERENCES "CtpStopIdentity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CtpStopObservation_datasetVersionId_fkey" FOREIGN KEY ("datasetVersionId") REFERENCES "DatasetVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK (length(trim("name")) > 0),
    CHECK ("lat" BETWEEN -90 AND 90),
    CHECK ("lon" BETWEEN -180 AND 180),
    CHECK ("outputCrs" = 'EPSG:4326')
);

-- CreateTable
CREATE TABLE "StopReconciliation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gtfsStopId" TEXT NOT NULL,
    "ctpObservationId" TEXT NOT NULL,
    "distanceMeters" REAL NOT NULL,
    "method" TEXT NOT NULL,
    "algorithmVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'candidate',
    "reviewer" TEXT,
    "evidence" TEXT,
    "reviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StopReconciliation_gtfsStopId_fkey" FOREIGN KEY ("gtfsStopId") REFERENCES "GtfsStopVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StopReconciliation_ctpObservationId_fkey" FOREIGN KEY ("ctpObservationId") REFERENCES "CtpStopObservation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CHECK ("distanceMeters" >= 0),
    CHECK ("status" IN ('candidate','ambiguous','accepted','rejected')),
    CHECK ("status" NOT IN ('accepted','rejected') OR ("reviewer" IS NOT NULL AND length(trim("reviewer")) > 0 AND "evidence" IS NOT NULL AND length(trim("evidence")) > 0 AND "reviewedAt" IS NOT NULL))
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_GtfsTrip" (
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
    CONSTRAINT "GtfsTrip_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "GtfsRoute" ("route_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_GtfsTrip" ("bikes_allowed", "block_id", "direction_id", "headsign", "route_id", "service_id", "shape_id", "short_name", "trip_id", "wheelchair_accessible") SELECT "bikes_allowed", "block_id", "direction_id", "headsign", "route_id", "service_id", "shape_id", "short_name", "trip_id", "wheelchair_accessible" FROM "GtfsTrip";
DROP TABLE "GtfsTrip";
ALTER TABLE "new_GtfsTrip" RENAME TO "GtfsTrip";
CREATE INDEX "GtfsTrip_route_id_idx" ON "GtfsTrip"("route_id");
CREATE INDEX "GtfsTrip_service_id_idx" ON "GtfsTrip"("service_id");
CREATE INDEX "GtfsTrip_shape_id_idx" ON "GtfsTrip"("shape_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

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
CREATE UNIQUE INDEX "StopReconciliation_gtfsStopId_ctpObservationId_algorithmVersion_key" ON "StopReconciliation"("gtfsStopId", "ctpObservationId", "algorithmVersion");

-- CreateIndex
CREATE UNIQUE INDEX "GtfsCalendarDate_service_id_date_key" ON "GtfsCalendarDate"("service_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "GtfsStopTime_trip_id_stop_sequence_key" ON "GtfsStopTime"("trip_id", "stop_sequence");

-- CreateIndex
CREATE UNIQUE INDEX "GtfsShape_shape_id_shape_pt_sequence_key" ON "GtfsShape"("shape_id", "shape_pt_sequence");

-- CreateIndex
CREATE UNIQUE INDEX "StopRoute_stopId_routeId_key" ON "StopRoute"("stopId", "routeId");

