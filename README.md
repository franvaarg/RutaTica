## Local transport versioning (2026-09-23)

PostgreSQL/Neon **connection-only** preparation is available in the [staging runbook](docs/POSTGRESQL_STAGING_CONNECTION.md): isolated client, separate migration history, and read-only diagnostics. SQLite remains the application default. No Neon connection, PostgreSQL migration, or data import is implied by this preparation.

The application remains on SQLite. New GTFS/CTP importers publish immutable canonical versions and replace the existing API projection atomically. Both CLIs default to audit/dry-run; `--apply` requires an explicit disposable SQLite copy and refuses `db/custom.db`. Do not apply these changes to the sole snapshot.

- `npm run audit:gtfs`: corrected feed, strict dangling-shape errors.
- `npm run audit:ctp`: source normalization/quarantine audit, no database writes.
- `DATABASE_URL=file:/absolute/path/to/disposable.db npm run import-gtfs -- --apply`
- `DATABASE_URL=file:/absolute/path/to/disposable.db npm run import-ctp -- --apply`

Apply the reviewed SQLite migrations to the disposable target before importing. For an existing snapshot copy, baseline only after verifying its schema; never replay the baseline over existing tables. The detailed workflow and offline PostgreSQL draft are described in [the migration plan](docs/POSTGRESQL_MIGRATION_PLAN.md). PostgreSQL has NOT been connected, configured or deployed. The old snapshot intentionally still contains its historical data; use the validated copy to exercise the corrected feed.

# RutaTica

RutaTica is a Spanish-language, mobile-first public transport application intended to serve Costa Rica nationally. It combines a map of transport infrastructure with journey planning backed by imported GTFS schedules and an optional external OpenTripPlanner (OTP) service.

**National stop visibility is implemented; national journey-planning coverage is not yet established.** A mapped CTP stop does not establish a route, timetable, fare, or currently operating service.

## Current scope

Repository audit: September 19, 2026. Stack: Next.js 16.3.4 App Router, React 19, TypeScript, Tailwind CSS 4, Radix/shadcn UI components, Leaflet/react-leaflet, and Prisma 6 with SQLite.

| Area | Current status |
| --- | --- |
| GTFS import and local planning | Implemented for the supported scheduled-feed subset; geographic coverage is limited by the imported feed. |
| Nationwide CTP integration | Importer, separate storage, map/search queries, provenance, and validation tooling implemented. National import validated on a disposable database. |
| OTP integration | GraphQL client and local fallback implemented and fixture-tested; live deployment compatibility remains unverified. |
| Map, search, mobile interface | Implemented, including source labels, bounded stop loading, keyboard autocomplete, and collapsible results. |
| Personal accounts and persistence | Not implemented as usable features. Favorites, history, and settings APIs return 503. Some navigation controls are placeholders; notifications are disabled. |
| Production national service | Pending data verification, infrastructure, operational validation, and deployment. |

The bundled `db/custom.db` currently contains **88 GTFS stops, 18 routes, 72 trips, 396 stop-time rows, and 169 shape points**. A read-only inspection confirmed that it has no `ctp_stops` table. Its calendars extend through December 31, 2026; this is feed metadata, not independent confirmation of current service.

The separate national validation snapshot documented in [release readiness](docs/RELEASE_READINESS.md) contains **38,657 imported CTP stops**, with 42 unnamed records quarantined from 38,699 candidates. It covers seven source provinces and 82 source-enumerated cantons. Those figures describe the reviewed source snapshot, not certified administrative completeness or deployed coverage.

## Main features

- Origin/destination selection, browser geolocation, nearby stops, and ranked transit options.
- GTFS schedules, calendar exceptions, stop sequences, route/operator information, available fares, and available shapes.
- Optional OTP transit itineraries with automatic GTFS fallback.
- Separate CTP and GTFS stop identities, source labels, and route-data availability indicators.
- Map controls, selected-route overlays, route cards, and location tracking during a trip. Device tracking is not live vehicle telemetry.
- Data audits, import reports, regression tests, release smoke checks, and optional browser checks.

## Nationwide transport-data strategy

The application separates **physical infrastructure** from **transport service**:

| Source | Role | Trust boundary |
| --- | --- | --- |
| CTP exports | Officially mapped physical stop locations and administrative/source metadata | Cannot establish GTFS route membership, departures, travel times, or transfers. |
| GTFS | Agencies, stops, routes, trips, calendars, stop times, fares, and shapes | Planning depends on feed completeness, freshness, and supported features. |
| OTP | External transit planning using its own configured graph | Only validated transit itineraries are accepted; the deployed graph must be verified separately. |
| OpenStreetMap-related services | Basemap, place lookup, and auxiliary road/POI information | Place or road geometry is not evidence of a bus service. |

Expanding national planning requires validated operator/service feeds and an operational routing graph. Adding CTP locations or migrating databases alone cannot supply missing schedules.

### CTP integration

`CtpStop` maps to a separate `ctp_stops` table with no GTFS route/trip foreign keys. It retains original coordinates, transformed coordinates, source identifiers, candidate identity, geography, provenance JSON, content hashes, and timestamps. Identity uses the source ID and decimal-normalized original coordinates.

The importer validates fixed local export files, quarantines invalid/conflicting records, audits duplicate occurrences, and performs idempotent CTP-only writes in one transaction. Dry-run is the default. It does not scrape the source or delete records missing from a newer snapshot. Moved stops and retirement/versioning require review.

Map, nearby-stop, and search responses expose bounded public fields, with CTP always marked `hasRouteData: false`. Missing CTP tables degrade gracefully to GTFS display results. Other database errors are not silently treated as missing coverage.

### GTFS integration

The importer supports agencies, calendars and exceptions, routes, stops, trips, stop times, shapes, fare attributes/rules, and custom `empresas.csv`, `colores.csv`, and `tarifas.csv`. Custom imports also populate supporting company, color, fare, and stop-route data. The planner relies on `StopRoute` associations; a generic feed import needs verification of those associations before routing can be considered usable.

Read-only preflight checks validate identifiers, relationships, coordinates, sequences, times, calendars, and shape distances. Unsupported frequency-based scheduling, missing-time interpolation, and calendar-dates-only trip services fail preflight. Missing referenced shapes generate warnings. The bundled feed currently passes structural preflight with **26 referenced shapes absent**.

GTFS import is not a single atomic snapshot replacement: it upserts records and replaces some tables in separate stages. A failed import can leave partial changes. Use a backed-up staging database and inspect import errors and `ImportLog` before publishing a snapshot.

### OTP integration and fallback behavior

`OPEN_TRIP_PLANNER_URL` optionally selects a server-side OTP GTFS GraphQL endpoint. The client uses the `plan` query, requests up to five itineraries, sends Costa Rican local date/time, applies an eight-second timeout and a 2 MiB response limit, and validates itinerary values, transit legs, and encoded geometry.

Absent configuration, network/HTTP/GraphQL errors, invalid or oversized responses, empty results, and walking-only results fall back to local GTFS planning. OTP is attempted before local calendar queries, so an operational OTP can answer independently of local database availability. If local planning then fails, the API returns an error rather than claiming no service exists.

The integration is implemented, but no live OTP graph or deployed schema is certified. Pin and test the server version and query contract before production; see [OTP documentation](docs/OPEN_TRIP_PLANNER.md).

## Routing behavior

`/api/best-route` accepts origin/destination coordinates and optional `departAfter` in `HH:mm:ss` for the current Costa Rican service date. The local planner:

1. Finds up to ten GTFS stops within 1 km of each endpoint.
2. Uses active calendars and exceptions, route associations, trip direction, ordered stop times, and pickup/drop-off restrictions.
3. Evaluates direct trips and limited one-transfer alternatives.
4. Scores options using travel time, walking, transfers, and available fare data, returning up to five options.

Results identify their routing source when provided, and distinguish distance/duration provenance. Unknown fares remain unknown. Available GTFS shapes are clipped to the relevant segment; missing shapes are not replaced with invented bus-road geometry. OTP itineraries with multiple transit legs do not receive a fabricated continuous bus polyline.

Walking is approximate. Local duration includes walking and transfer waiting but excludes the initial wait. Previous-service-day trips after midnight are not searched. Shape clipping without distance metadata can be ambiguous on loops.

When only CTP infrastructure exists nearby, the planner returns no invented itinerary and explains the missing route/schedule data. The UI may offer an explicitly labeled automobile alternative using OSRM; that is not a transit result.

## Map behavior

The Leaflet map uses OpenStreetMap tiles and requests stops independently of route planning. At zoom 12 or higher, viewport changes trigger debounced, cancellable bounding-box requests. Responses and visible infrastructure markers are capped at 100, with zoom-in/truncation and error notices. The browser never loads the full national dataset.

CTP markers use a distinct neutral appearance and explain that routes/schedules are unavailable. Selected-route geometry and markers remain separate from infrastructure markers. Walking connections are straight-line approximations, not verified pedestrian navigation. External tiles, Nominatim, OSRM, and auxiliary Overpass requests depend on provider availability.

## Search/autocomplete

Autocomplete combines built-in Costa Rican settlement suggestions with up to three GTFS and three CTP stop matches. It labels CTP results as lacking route/schedule data, debounces requests, cancels obsolete searches, and supports keyboard selection and Escape dismissal.

“Buscar más lugares” explicitly requests external place search through Nominatim. The server limits results and maintains a small, five-minute in-memory cache, with cached fallback on upstream failure. `type=stop` selects physical-stop search instead of place lookup. Geographic proximity never creates route membership.

## Mobile-first UI

The Spanish interface includes a map-focused layout, a navigation sheet, touch-sized controls, bounded route results, close/reopen actions, alerts, and accessible autocomplete/marker labels. Browser checks cover widths from 320 to 768 pixels and a shortened viewport. Real-device keyboards, screen-reader usability, and complete navigation flows still need validation; placeholder bottom-navigation buttons do not constitute finished features.

## API routes

| Route | Methods | Behavior |
| --- | --- | --- |
| `/api` | GET | Basic greeting; not a database/readiness health check. |
| `/api/stops` | GET | Physical-stop search; `search`, `source`, `province`, `canton`, `lat`/`lon`/`radius`, `bbox`, `limit`, `offset`. |
| `/api/nearest-stop` | GET | Nearby physical stops; requires coordinates, defaults to 2 km and 50 results. |
| `/api/locations/search` | GET | `q` place lookup; `type=stop` for bounded physical-stop search. |
| `/api/routes` | GET | GTFS route catalog with `search`, `company`, `limit`, `offset`. |
| `/api/routes/search` | GET | Route search using `q`. |
| `/api/routes/nearby` | GET | Routes associated with nearby GTFS stops; `lat`, `lon`, optional `radius`. |
| `/api/best-route` | GET | `originLat`, `originLon`, `destLat`, `destLon`, optional `departAfter`. |
| `/api/routes/plan` | GET | Geocodes `destination` from `lat`/`lon`, then delegates to the planner. |
| `/api/trip/[tripId]` | GET | Trip and ordered stop-time details. |
| `/api/shape/[shapeId]` | GET | Stored shape geometry. |
| `/api/fare/[routeId]` | GET | Stored route fare information. |
| `/api/companies` | GET | Active companies and associated route counts. |
| `/api/download?file=bitacora` | GET | Allowlisted project DOCX download only. |
| `/api/favorites`, `/api/history`, `/api/settings` | GET, POST | Unavailable: 503 until authenticated persistence exists. |
| `/api/favorites/[id]` | DELETE | Unavailable: 503. |
| `/api/test2`, `/api/test3` | GET | Retired endpoints returning 404. |

Stop bounding boxes use `south,west,north,east`; they cannot be combined with radial coordinates. Administrative filters apply to CTP records because GTFS stops lack those columns.

## Data provenance and trust model

CTP extraction provenance includes source endpoint, retrieval time, source/output CRS, original payload, and WFS matching metadata. Public APIs omit internal provenance payloads and database primary keys. Source-qualified IDs preserve GTFS/CTP separation. `hasRouteData` indicates stored relationships, not a guaranteed departure today.

Reconciliation reports proximity candidates within 50 m without merging records or creating associations. GTFS administrative coverage inferred from nearby CTP labels is explicitly marked inferred; unclassified stops do not prove absence of service.

The source extraction remains `review_required`: national WFS counts differ from summed canton counts by five features. Source labels and a mainland coordinate envelope do not certify exact borders or administrative completeness. Redistribution rights, required attribution, freshness, and incidental personal information in source descriptions still require review. Raw exports are ignored local artifacts and are not downloadable through the public API.

## Security protections and input hardening

- API validation rejects duplicate parameters, oversized queries, invalid identifiers, nonfinite coordinates, and invalid coordinate ranges. Shared bounds include 24 query entries, 4,096 encoded query characters, 256 characters per value, radius at most 50 km, limit at most 100, and offset at most 10,000.
- Stop bounding boxes must be ordered and no larger than one degree per axis. Radial queries filter and rank by distance before pagination.
- Database access uses Prisma and parameterized values. Source names are rendered as text through React escaping.
- Downloads use a fixed allowlist and reject traversal, absolute paths, and unexpected keys.
- CTP import constrains paths and symlinks, requires an existing database, and bounds CSV files to 100 MiB, 150,000 rows, and 64 KiB per record. Strict parsing and provenance/coordinate checks precede writes; reports use JSON/JSONL.
- OTP URLs permit HTTP/HTTPS without embedded credentials; upstream timeouts, response size limits, and contract validation constrain failures. Personal-data endpoints fail closed with 503.

These controls do not establish a completed production security review. Deployment-level rate limiting, provider capacity, authenticated identity, and durable user storage remain outstanding.

## Database architecture

Prisma currently uses **SQLite**, with schema-relative file URL resolution. The schema contains GTFS core tables, `StopRoute`, companies, route colors/logos/configuration, import logs, personal-data models, and the isolated `CtpStop` model. Personal-data tables do not imply implemented authentication or usable personal APIs.

Geographic access uses indexed latitude/longitude bounding boxes followed by Haversine filtering in Node.js. It does not use a true spatial index; substring search may scan names.

### Current local development database

The tracked `db/custom.db` is the existing GTFS development snapshot. The current schema is ahead of that snapshot's CTP deployment. Normal GTFS browsing tolerates the missing CTP table; national validation requires a separately migrated and imported copy.

Migrations include a pre-CTP baseline, the additive CTP table, and query indexes. For an existing database, back it up, verify baseline/schema compatibility, and resolve the baseline before applying later migrations as described in [CTP integration](docs/CTP_DATA_INTEGRATION.md). Do not blindly replay the baseline or reset the bundled database.

### Production database plans

[PostgreSQL + PostGIS](docs/POSTGIS_MIGRATION_PROPOSAL.md) is a proposal, not an implemented migration. It describes geographic columns, GiST indexes, and distance queries. The current provider and URL validator remain SQLite-specific; changing the URL alone cannot enable PostgreSQL. Read-only snapshot deployment is the interim architecture; persistent user features need a separate reviewed persistence design.

## Project structure

```text
src/app/                 Main page, layout, styles, error boundary, API handlers
src/components/          Map, autocomplete, icons, reusable UI components
src/hooks/               UI hooks
src/lib/                 Database, routing, OTP, validation, CTP and GTFS helpers
prisma/schema.prisma     Database models
prisma/migrations/       Baseline, CTP storage, query indexes
db/custom.db             Existing GTFS development snapshot
gtfs-data/               Bundled GTFS and custom import files
data/ctp_exports/        Local CTP inputs (ignored; not supplied by a fresh clone)
data/ctp_reports/        Generated audits and validation reports (ignored)
scripts/                 Imports, audits, snapshot checks, smoke/browser validation
tests/                   Node test suites
docs/                    Architecture, coverage, validation, release evidence
public/                  Static assets
next.config.ts           Build mode and file tracing
```

`prisma/seed.ts` is retired and intentionally throws; use the GTFS importer for reviewed data.

## Installation and environment variables

Use Node.js **22–24** (`>=22 <25`) and the declared package manager, **npm 11.19.0**. From the repository root:

```bash
npm ci
npm run db:generate
```

Create a local ignored `.env` using the placeholders below, replacing them before running the application. Select a local SQLite copy for development. No credentials or machine-specific values belong in committed configuration.

```dotenv
DATABASE_URL="file:<absolute-path-to-local-sqlite-copy>"
# Optional: omit to use local GTFS only.
OPEN_TRIP_PLANNER_URL="<full-otp-gtfs-graphql-endpoint>"
```

`DATABASE_URL` is required for database queries. Relative SQLite paths resolve from `prisma/`, not the repository root. Standalone import/validation scripts require the variable explicitly in their process environment; do not assume Next.js `.env` loading applies to them.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | SQLite file URL for the selected database. |
| `OPEN_TRIP_PLANNER_URL` | Optional full OTP endpoint; omit or leave empty to disable OTP. |
| `APP_URL` | Optional browser-check server URL; runner defaults to local port 3100. |
| `PLAYWRIGHT_MODULE` | Optional path to a separately installed Playwright module. |
| `BROWSER_REPORT` | Optional output path for browser-check JSON. |
| `PORT`, `HOSTNAME` | Runtime binding controls for standalone hosting. |
| `VERCEL` | Platform-provided flag that disables standalone output in this configuration. |

### Development commands

```bash
npm run dev
npm run typecheck
npm run lint
npm run db:generate
```

For a **new disposable database** with an explicitly selected URL, `npx prisma migrate deploy` creates the schema. Import reviewed GTFS data afterward. Existing snapshots require the baseline review described above. `db:push`, `db:migrate`, and destructive `db:reset` scripts exist, but are not normal startup steps and should not be run against the sole application/production copy.

### Build commands

```bash
npm run build -- --webpack
```

This is the production build path reported passing for the current project. `npm run build` uses Next.js's default builder; historical environment restrictions prevented default-builder validation. The `prebuild` hook generates Prisma. Google font fetching during builds requires network access.

For the configured self-hosted standalone package:

```bash
npm run build:standalone
npm run start:standalone
```

`build:standalone` uses the default builder and copies `public` and `.next/static` into the standalone output. It does not automatically select Webpack. If using a Webpack build, perform the equivalent asset copies before starting `.next/standalone/server.js`. `npm start` runs `next start` for a standard Next.js deployment; use the standalone launcher for standalone artifacts.

## Data import workflows

All URL/path values below are placeholders. Import commands write to the selected database; run them only against an intentionally selected, backed-up target. None are required merely to launch the existing GTFS snapshot.

### GTFS import workflow

1. Obtain and review an extracted feed directory and any required custom files. The importer reads files, not a remote feed or ZIP URL.
2. Run the read-only audit and review warnings as well as errors.
3. Prepare a migrated staging database and import explicitly.
4. Inspect `ImportLog`, stop-route relationships, calendars, fares, shapes, and representative forward/reverse routes before releasing the resulting snapshot.

```bash
npm run audit:gtfs
npm run audit:gtfs -- <validated-feed-directory>
DATABASE_URL='file:<absolute-path-to-staging-sqlite>' npm run import-gtfs -- --gtfs-dir '<validated-feed-directory>'
```

There is no GTFS dry-run import mode; `audit:gtfs` is the read-only preflight. Preserve a backup because import stages can partially succeed.

### CTP import workflow

1. Supply reviewed `ctp_all_stops.csv` and `ctp_duplicate_conflicts.csv` under `data/ctp_exports/`. These ignored artifacts are not downloaded automatically. National validation also needs `ctp_validation_summary.csv`.
2. Prepare an existing disposable SQLite backup with the reviewed migrations applied.
3. Run dry-run, inspect quarantine/duplicate/reconciliation reports, then apply to that selected copy.
4. Repeat the import and verify zero inserts/updates, unchanged GTFS tables, and database integrity.

```bash
DATABASE_URL='file:<absolute-path-to-existing-sqlite-copy>' npm run import-ctp -- --dry-run
DATABASE_URL='file:<absolute-path-to-existing-sqlite-copy>' npm run import-ctp -- --apply
```

Each run writes a unique report directory under `data/ctp_reports/`, including `summary.json`, `audit.jsonl`, and `reconciliation.json`, or `failure.json` on failure. Serialize imports. Review reports before sharing: they can contain local paths and raw source details.

## Testing and Playwright/E2E status

```bash
npm test
npm run typecheck
npm run lint
git diff --check
```

The current project status supplied for this audit reports **24/24 tests, typecheck, ESLint, Webpack production build, and diff checks passing**. Those checks were not rerun as part of this documentation-only audit. The read-only GTFS audit was rerun and passed with the missing-shape warning described above.

Tests use Node's built-in test runner through `tsx`. They cover service dates and exceptions, time parsing, geometry clipping, scoring/provenance, input and download validation, OTP fixtures and fallback, CTP CSV/path hardening, temporary SQLite migrations, atomic rollback, idempotency, and routing isolation. Temporary test databases do not certify the production dataset.

`npm run test:browser` runs the optional Playwright Chromium script in `scripts/verify-mobile.cjs`. **Playwright is not a package dependency**: provide it and its Chromium binary separately. Start the app against an imported national validation snapshot first, with OTP disabled for the local-fallback checks.

```bash
APP_URL='<local-validation-server-url>' PLAYWRIGHT_MODULE='<path-to-playwright-module>' BROWSER_REPORT='<browser-report-path>' npm run test:browser
```

The runner checks CTP API results across seven provinces and five viewport widths, autocomplete keyboard handling, CTP-only messaging, closing/reopening results, horizontal overflow, and runtime/hydration errors. It deliberately blocks external HTTPS requests during UI checks. It is a focused browser smoke suite, not complete E2E certification or proof of external provider reliability. Checked-in historical evidence includes a blocked browser attempt; do not infer a current successful browser run solely from the script's presence.

## Nationwide validation tooling and release readiness

Follow [the ordered national validation procedure](docs/NATIONWIDE_VALIDATION.md) against a disposable imported snapshot:

```bash
DATABASE_URL='file:<absolute-path-to-imported-snapshot>' npm run validate:nationwide
DATABASE_URL='file:<absolute-path-to-imported-snapshot>' npm run smoke:release
DATABASE_URL='file:<absolute-path-to-imported-snapshot>' node --import tsx scripts/verify-ctp.ts
python3 scripts/verify-import-snapshot.py '<absolute-path-to-imported-snapshot>'
```

The snapshot verifier requires the pre-import table-hash mapping in `before.json` beside the database. It records the first CTP hash for subsequent idempotency checks; see the procedure before running it.

`validate:nationwide` reads imported data and source coverage metadata, checks coordinates, reports province/canton counts and inferred GTFS coverage, computes overlap candidates, and probes bounded map/nearby/search queries. It writes `data/ctp_reports/nationwide.json`. `smoke:release` calls API handlers directly with OTP disabled and checks representative routes, malformed input, and download traversal. Its fixtures depend on the bundled GTFS IDs and active schedules.

The documented September 19 national run includes 93 probes across 31 locations, repeat-import idempotency, and unchanged pre-existing tables. These are local sequential measurements, not concurrent production load certification.

Release review should include database integrity/foreign-key checks, before/after hashes, import reports, fresh calendars, representative routing, browser checks, typecheck/lint/tests, production build, and diff review. Then validate the actual deployed filesystem, approved data snapshot, OTP contract, external providers, and operational controls. Passing local tests does not establish national transport coverage.

## Deployment architecture

The browser uses the Next.js UI and API handlers; server-side Prisma reads SQLite and the OTP client optionally calls a separate routing service. The browser also uses external map/geographic services. Runtime API/database requirements mean this is not a static-only website.

`next.config.ts` produces standalone output outside Vercel and explicitly traces `db/custom.db` into API artifacts and the allowlisted DOCX into the download handler. A different validation database is not automatically packaged just because `DATABASE_URL` points to it. Publishing an approved imported snapshot requires an explicit packaging and runtime-path check.

The documented Vercel approach is a read-only bundled SQLite snapshot, not durable writable serverless storage. Imports must run as operator jobs outside request handling. An existing `Caddyfile` provides a local reverse-proxy configuration, including query-selected upstream ports; it is not a reviewed public production ingress configuration. No live deployment is certified by this README.

## Known limitations and remaining production work

- Acquire and verify wider GTFS/operator coverage, current schedules/fares, missing shapes, and source redistribution permissions. Resolve the CTP WFS discrepancy and validate administrative boundaries.
- Review CTP snapshot refresh, moved/retired stops, history, and publication policy. Package the approved national snapshot explicitly.
- Deploy and validate a pinned OTP graph/schema with appropriate memory, TLS, health checks, and observability.
- Address local routing limitations: supported GTFS subset, one-transfer search, initial wait exclusion, previous-service-day lookup, approximate walking, and ambiguous loop geometry.
- Complete authentication, persistent favorites/history/settings, unfinished navigation, and real-device/accessibility verification. No GTFS-Realtime vehicle feed is implemented.
- Validate concurrent load, database/search performance, provider policies/capacity, rate limits, backups/restore, monitoring, and production security. PostgreSQL/PostGIS remains planned.

## Documentation

- [CTP integration, provenance, migrations, and import controls](docs/CTP_DATA_INTEGRATION.md)
- [Nationwide validation procedure](docs/NATIONWIDE_VALIDATION.md)
- [Province/canton coverage](docs/NATIONWIDE_COVERAGE.md) and [CSV coverage table](docs/NATIONWIDE_COVERAGE.csv)
- [Release-readiness findings](docs/RELEASE_READINESS.md)
- [Historical verification transcript](docs/RELEASE_VERIFICATION.txt) — dated evidence, not a current deployment guarantee
- [OpenTripPlanner integration](docs/OPEN_TRIP_PLANNER.md)
- [PostgreSQL/PostGIS proposal](docs/POSTGIS_MIGRATION_PROPOSAL.md)
- [Development log](BITACORA_DESARROLLO.md) and [change log](BITACORA_CAMBIOS.md)
- [Contributor instructions](AGENTS.md) — consult the installed Next.js guides before application changes
