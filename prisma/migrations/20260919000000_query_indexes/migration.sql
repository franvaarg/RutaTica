-- Additive indexes for schedule/geometry ordering and reverse route lookup.
CREATE INDEX "GtfsCalendarDate_date_service_id_idx" ON "GtfsCalendarDate"("date", "service_id");
CREATE INDEX "GtfsStopTime_trip_id_stop_sequence_idx" ON "GtfsStopTime"("trip_id", "stop_sequence");
CREATE INDEX "GtfsShape_shape_id_shape_pt_sequence_idx" ON "GtfsShape"("shape_id", "shape_pt_sequence");
DROP INDEX "GtfsShape_shape_id_idx";
CREATE INDEX "StopRoute_routeId_sequence_idx" ON "StopRoute"("routeId", "sequence");
