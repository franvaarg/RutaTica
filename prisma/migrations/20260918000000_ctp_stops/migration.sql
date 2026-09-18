-- Additive migration only: no GTFS table is altered.
CREATE TABLE "ctp_stops" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "identityKey" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'CTP' CHECK ("source" = 'CTP'),
    "sourceStopId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "name" TEXT NOT NULL CHECK (length(trim("name")) > 0),
    "lat" REAL NOT NULL CHECK ("lat" BETWEEN -90 AND 90),
    "lon" REAL NOT NULL CHECK ("lon" BETWEEN -180 AND 180),
    "coordX" TEXT NOT NULL,
    "coordY" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "canton" TEXT NOT NULL,
    "district" TEXT,
    "sourceMetadata" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "ctp_stops_identityKey_key" ON "ctp_stops"("identityKey");
CREATE INDEX "ctp_stops_lat_lon_idx" ON "ctp_stops"("lat", "lon");
CREATE INDEX "ctp_stops_lon_lat_idx" ON "ctp_stops"("lon", "lat");
CREATE INDEX "ctp_stops_province_idx" ON "ctp_stops"("province");
CREATE INDEX "ctp_stops_canton_idx" ON "ctp_stops"("canton");
CREATE INDEX "ctp_stops_sourceStopId_idx" ON "ctp_stops"("sourceStopId");
