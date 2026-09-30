# Route and stop experience

Selected bus routes use navigation blue (#2563EB). GTFS boarding, intermediate and alighting calls come from the selected trip's stop_times, with original sequence, trip ID, operator and schedule preserved. Transfer calls remain separate in route details; repeated physical coordinates share a map marker with all calls in its popup. Boarding and alighting have permanent labels. The destination remains a separate marker. Walking paths remain explicitly approximate.

Missing GTFS shapes and shapes with obvious coordinate jumps are shown as dashed blue reference paths between actual ordered stops, with an explicit notice that they do not represent streets. Available shapes are used directly. Separate transit legs are never bridged with an invented bus connection. Route selection fits origin, route, stops and destination once; subsequent manual movement is preserved.

ARESEP discovery queries the current viewport against the official PR05_Vista_BusRamales layer (MapServer/5), with at most eight results. ArcGIS returns geometry using outSR=4326, so no manual projection conversion is used. Multipart geometries remain separate. Published source: https://aresep.go.cr/datos-abiertos/rutas-autobuses/

CTP corridor stops are filtered first by the route's bounding box and then by distance to its individual polyline segments (100 m). They are labeled “Parada física cercana al recorrido” and “Cercana al recorrido ARESEP”, without invented membership, sequences or schedules. Up to 500 matched stops are displayed, with the full count and a truncation notice when appropriate. No itinerary selected: existing viewport stop queries remain capped at 100, starting at zoom 12. Selected GTFS or ARESEP: generic stop markers and generic queries are hidden.

ARESEP metadata can be expanded without covering the map permanently. Source failures show an honest unavailable state and a retry button. Areas without a GTFS itinerary can still explore physical stops and reference routes. SQLite and the reviewed physical-stop snapshot remain unchanged.

Verification commands:

- npm run typecheck
- npm run lint
- npm run build -- --webpack
- node --import tsx --test --test-concurrency=1 tests/route-corridor.test.ts
- PLAYWRIGHT_MODULE=/path/to/playwright node scripts/verify-route-stops.cjs
- APP_URL=http://localhost:3100 DATABASE_URL=file:/path/to/custom.db node --import tsx scripts/validate-route-stops.ts

Browser verification uses a real GTFS response at a fixed valid departure time, then real ARESEP responses replayed for UI stability. Nationwide source checks use live APIs independently, covering San José, Heredia, Alajuela, Ciudad Quesada, Pital, Liberia, Puntarenas, Limón and Cartago. These locations exist only in verification scripts.
