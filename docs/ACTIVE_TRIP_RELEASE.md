# Localities and active trip release

The initial map hides generic GTFS, CTP and nearest-stop markers until a destination is selected. Selected GTFS itineraries retain only their A-to-B calls and blue paths. ARESEP discovery remains an explicitly selected informational corridor, not a scheduled itinerary.

Users can save a selected locality and restore it as a destination after reloading. Saved localities are stored in this browser, capped at 20, and do not require the unavailable server favorites API.

Starting a trip opens its progress panel. Geolocation advances the next ordered call within 100 metres; proximity to a different call cannot skip the itinerary. The panel shows next stop, remaining calls, estimated minutes and final locality. Minutes use the selected GTFS call times and elapsed trip time, including service times after midnight. This is an estimate, not live vehicle telemetry. Pausing preserves call progress.

## Verification

`tests/trip-progress.test.ts` checks call order, remaining time, completion and times after midnight. `scripts/verify-active-trip.cjs` checks desktop and mobile against `APP_URL`, including clean map, origin locality, current origin, saved destination persistence, destination-relevant scheduled route, blue path, only selected calls, intermediate calls, start trip and GPS advancement. Browser artifacts remain in `/tmp`.

The browser test changes only `departAfter` to 04:00 on real planner requests, so the morning-only sample calendar can be exercised at any wall-clock hour. It does not invent routes or replace API data. Current-time/no-service responses are checked separately. GPS movement is simulated by the browser, not observed on a real bus.

## Data boundary

The release retains 88 GTFS stops, 18 GTFS routes, 72 trips and 38,657 CTP physical stops. No new GTFS feed, timetable or route membership is derived from physical-stop proximity. Official nationwide GTFS provenance/current operator timetables remain unverified. National scheduled routing outside the existing feed requires external operator data; in particular San Carlos/Pital has physical stops but no scheduled trip coverage in this snapshot.
