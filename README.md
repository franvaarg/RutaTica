# RutaTica

RutaTica is a Spanish-language, mobile-first public transport application intended to serve Costa Rica nationally. It combines a map of transport infrastructure with journey planning backed by imported GTFS schedules and an optional external OpenTripPlanner (OTP) service.

**National stop visibility is implemented; national journey-planning coverage is not yet established.** A mapped CTP stop does not establish a route, timetable, fare, or currently operating service.

## Current scope

Repository/documentation review: September 28, 2026. Stack: Next.js 16.3.4 App Router, React 19, TypeScript, Tailwind CSS 4, Radix/shadcn UI components, Leaflet/react-leaflet, and Prisma 6 with SQLite.

| Area | Current status |
| --- | --- |
| Versioned publication | Implemented: canonical history, atomic compatibility projections, ImportRun evidence and rollback tests on SQLite. |
| PostgreSQL/Neon staging | Connectivity, schema migration, schema/catalog verification, GTFS publication and active dataset, and status CLI VERIFIED on Neon staging. CTP publication has not yet succeeded. |
| GTFS import and local planning | Implemented for the supported scheduled-feed subset; geographic coverage is limited by the imported feed. |
| Nationwide CTP integration | Importer, separate storage, map/search queries, provenance, and validation tooling implemented. National import validated on a disposable database. |
| OTP integration | GraphQL client and local fallback implemented and fixture-tested; live deployment compatibility remains unverified. |
| Map, search, mobile interface | Implemented, including source labels, bounded stop loading, keyboard autocomplete, and collapsible results. |
| Personal accounts and persistence | Not implemented as usable features. Favorites, history, and settings APIs return 503. Some navigation controls are placeholders; notifications are disabled. |
| Production national service | Pending data verification, infrastructure, operational validation, and deployment. |

### Verified datasets and evidence boundaries

The corrected repository GTFS source and local publication are documented in [migration validation](docs/MIGRATION_PREPARATION_VALIDATION.md). Neon staging GTFS publication and its active dataset are also **VERIFIED**, with the agencies, stops, routes, trips, stop times, services, calendars, calendar exceptions, shapes and shape points below confirmed in Neon. Derived membership and fare counts retain their local validation scope.

| GTFS entity | Count | Validation scope |
| --- | ---: | --- |
| Agencies | 3 | VERIFIED in Neon staging |
| Stops | 88 | VERIFIED in Neon staging |
| Routes | 18 | VERIFIED in Neon staging |
| Trips | 72 | VERIFIED in Neon staging |
| Stop times | 396 | VERIFIED in Neon staging |
| Services / weekly calendars | 3 / 3 | VERIFIED in Neon staging |
| Calendar exceptions | 13 | VERIFIED in Neon staging |
| Shapes / shape points | 10 / 169 | VERIFIED in Neon staging |
| Derived stop-route pairs | 122 | Locally validated |
| Fare attributes / fare rules | 6 / 19 | Locally validated |

The corrected source has zero dangling shape references: 50 optional trip references were cleared, retaining all 72 trips without inventing geometry. The historic snapshot had 121 stop-route pairs; derivation adds INT009/R101. The protected `db/custom.db` remains the historical development snapshot, not the corrected, versioned national publication. Do not infer its contents from the corrected-source counts. Calendars end on December 31, 2026; this does not independently verify current service.

| CTP normalized source / local validation | Count |
| --- | ---: |
| Input stop rows | 38,699 |
| Accepted stops / first-publication identities and observations | 38,657 |
| Rejected unnamed rows | 42 |
| Ambiguous districts retained as null | 816 |
| Normalized conflicts | 0 |
| Original duplicate-occurrence evidence records | 16,596 |
| Total ImportRejection evidence records in the documented first publication | 16,638 |
| Source provinces / source-enumerated cantons | 7 / 82 |

Duplicate-occurrence evidence is not an additional 16,596 rejected normalized stops. The documented local publication had 38,657 usable CTP display records, two active versions (one per source), and two successful publications. Later movement/absence review can reduce display counts without deleting observations. Historical local reconciliation recorded nine candidates and twelve ambiguous matches, with zero automatically accepted. These CTP counts describe the reviewed local snapshot, not a successfully published Neon CTP dataset, certified administrative completeness or national scheduled-service coverage.

**Implemented** means present in repository code; **locally validated** means local source audits/tests; **staging-validated** means verified on live PostgreSQL/Neon. The staging results below reflect the verified state supplied by the project operator; this README correction did not rerun live commands.

| Staging validation | Status |
| --- | --- |
| Neon PostgreSQL connectivity | VERIFIED |
| PostgreSQL staging schema migration | VERIFIED |
| PostgreSQL schema/catalog verification | VERIFIED |
| GTFS publication to Neon staging | VERIFIED |
| GTFS active dataset in Neon | VERIFIED, with counts above |
| PostgreSQL staging status CLI | VERIFIED |
| CTP preparation/normalization | VERIFIED locally: 38,699 read, 38,657 accepted, 42 rejected, 816 ambiguous districts |
| CTP publication to Neon staging | NOT YET SUCCESSFUL; final diagnosis/fix and successful verification remain required |

The previous CTP publication failed safely: no partial CTP dataset became active, and the active GTFS dataset remained intact. This observed failure does not establish complete PostgreSQL fault-injection, concurrency or load certification.

The complete Next.js application has **not been validated end-to-end against Neon**. Application PostgreSQL cutover and PostGIS remain planned. Production is **NOT deployed**; production cutover remains pending.

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

`CtpStopIdentity` keeps a stable, source-scoped external identity; `CtpStopObservation` keeps immutable versioned location/provenance history. Original EPSG:5367 coordinates, transformed WGS84 coordinates, source administrative metadata, retrieval time and raw provenance survive publication. The separate `ctp_stops` table is the current usable display projection, with no GTFS route/trip foreign keys.

The importer validates fixed local exports and preserves quarantine/duplicate evidence. It neither scrapes nor downloads data. Moved stops become inactive pending review; absent stops become inactive with `missing_from_snapshot`, which is not proof of official retirement. Reappearance does not bypass review. Distinct co-located source IDs remain distinct. History is retained, and current pointers/display replacement are atomic.

Map, nearby-stop, and search responses expose bounded public fields, with CTP always marked `hasRouteData: false`. Missing CTP tables degrade gracefully to GTFS display results. Other database errors are not silently treated as missing coverage.

### GTFS integration

The importer supports agencies, services, calendars and exceptions, routes, stops, trips, stop times, shapes, fare attributes/rules and custom source files. Canonical version-scoped tables preserve original payloads and the source manifest; fares remain in the manifest and compatibility tables pending canonical fare normalization. Composite foreign keys prevent cross-version references. Service-day times are stored as integer seconds, including values beyond 24:00.

Publication derives `StopRoute` from all trips/stop times. Routing also queries actual trip membership, so a stale cache cannot hide a valid association. Read-only preflight checks identifiers, relationships, coordinates, sequences, times, calendars and shape distances. Dangling referenced shapes are errors. Exception-only services are supported; unsupported local-planner features such as frequencies and missing-time interpolation block publication. The corrected bundled feed audit has no errors, warnings or unsupported features.

### DatasetVersion / ImportRun and atomic publication

`DataSource` defines the source namespace. `DatasetVersion` records checksums, retrieval/publication times, manifest and state. `ImportRun` records validation, counts and pending/importing/validating/succeeded/failed execution states; `ImportRejection` retains CTP evidence. GTFS checksums cover sorted filenames and exact bytes; CTP checksums cover normalized accepted data and audit evidence.

Canonical entity writes, compatibility projection replacement, validation, active-slot switching and successful run completion share one Serializable transaction. A shared publication mutex and up to three attempts on serialization conflicts protect publication. The transaction has a five-minute timeout. Failure inside it rolls back data/activation, preserving the prior publication; failure metadata and CTP quarantine evidence survive outside that transaction. Fault-injection rollback is tested locally. The failed Neon CTP publication also preserved the active GTFS dataset and activated no partial CTP dataset; broader PostgreSQL rollback/fault-injection certification remains pending.

A unique active slot identifies the active version per source; superseded canonical history remains intact. Already published checksums are no-ops and do not reactivate superseded versions. Failed versions can be retried. A crash may leave an incomplete run requiring operator review. There is no automatic command to roll back an already committed publication; do not toggle active slots manually. Post-commit verification failure can occur after successful publication: inspect status before retrying.

Compatibility readers support only one active GTFS source and one CTP source. Serialize operator imports and use a publication maintenance window until multi-query readers pin a version or share a consistent snapshot. Atomic writes alone do not give separate API reads a shared snapshot.

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

GTFS and CTP are not destructively merged. `StopReconciliation` links a versioned GTFS stop to a specific CTP observation, retaining distance, method, algorithm version and candidate/ambiguous/accepted/rejected state. Proximity within 50 m only proposes candidates. Accepted/rejected decisions require reviewer, evidence and review timestamp; recomputation preserves reviewed decisions. Even acceptance does not create route/service membership. The local CTP apply command computes candidates after publication; PostgreSQL staging CLIs do not generate or accept links. GTFS administrative coverage inferred from nearby CTP labels is explicitly marked inferred; unclassified stops do not prove absence of service.

The source extraction remains `review_required`: national WFS counts differ from summed canton counts by five features. Source labels and a mainland coordinate envelope do not certify exact borders or administrative completeness. Redistribution rights, required attribution, freshness, and incidental personal information in source descriptions still require review. Raw exports are ignored local artifacts and are not downloadable through the public API.

## Security protections and input hardening

- API validation rejects duplicate parameters, oversized queries, invalid identifiers, nonfinite coordinates, and invalid coordinate ranges. Shared bounds include 24 query entries, 4,096 encoded query characters, 256 characters per value, radius at most 50 km, limit at most 100, and offset at most 10,000.
- Stop bounding boxes must be ordered and no larger than one degree per axis. Radial queries filter and rank by distance before pagination.
- Database access uses Prisma and parameterized values. Source names are rendered as text through React escaping.
- Downloads use a fixed allowlist and reject traversal, absolute paths, and unexpected keys.
- CTP import constrains paths and symlinks, requires an existing database, and bounds CSV files to 100 MiB, 150,000 rows, and 64 KiB per record. Strict parsing and provenance/coordinate checks precede writes; versioned publication retains audit evidence in ImportRejection.
- OTP URLs permit HTTP/HTTPS without embedded credentials; upstream timeouts, response size limits, and contract validation constrain failures. Personal-data endpoints fail closed with 503.

These controls do not establish a completed production security review. Deployment-level rate limiting, provider capacity, authenticated identity, and durable user storage remain outstanding.

## Database architecture

The application Prisma client uses **SQLite**, with schema-relative file URL resolution. The schema contains canonical GTFS/CTP history, publication/reconciliation models, compatibility tables, `StopRoute`, company/branding data, import logs and personal-data models. Personal-data tables do not imply implemented authentication or usable personal APIs.

Geographic access uses indexed latitude/longitude bounding boxes followed by Haversine filtering in Node.js. It does not use a true spatial index; substring search may scan names.

### Current local development database

The tracked `db/custom.db` is the existing GTFS development snapshot. The current schema is ahead of that snapshot's CTP deployment. Normal GTFS browsing tolerates the missing CTP table; national validation requires a separately migrated and imported copy.

SQLite migrations include a pre-CTP baseline, CTP storage, query indexes and versioned transport publication. For an existing database, back it up, verify baseline/schema compatibility, and resolve the baseline before applying later migrations as described in [CTP integration](docs/CTP_DATA_INTEGRATION.md). Do not blindly replay the baseline or reset the bundled database.

### PostgreSQL/Neon staging architecture — GTFS verified, CTP publication pending

`prisma/postgresql/schema.prisma` generates an isolated client at `node_modules/.prisma/postgresql-staging`. Its separate migration history defines 37 tables with PostgreSQL constraints and indexes. Operator CLIs use that client; the application continues using the SQLite client. Changing `DATABASE_URL` alone cannot switch the application provider.

Staging initially retains text JSON/date codecs for compatibility. PostGIS, native JSONB/date conversion, application pooling and provider cutover remain planned. Geographic queries currently use indexed coordinate bounds followed by Haversine filtering, not a spatial index. See the [staging runbook](docs/POSTGRESQL_STAGING_CONNECTION.md) for the current commands; older migration-plan descriptions of future importer work are superseded by these implemented CLI entry points.

## Project structure

```text
src/app/                 Main page, layout, styles, error boundary, API handlers
src/components/          Map, autocomplete, icons, reusable UI components
src/hooks/               UI hooks
src/lib/                 Database, routing, OTP, validation, CTP and GTFS helpers
prisma/schema.prisma     Database models
prisma/migrations/       SQLite baseline, CTP, indexes, versioned publication
prisma/postgresql/       Isolated PostgreSQL schema and migration history
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
DATABASE_URL="<sqlite-file-url-for-local-development-copy>"
# Optional: omit to use local GTFS only.
OPEN_TRIP_PLANNER_URL="<full-otp-gtfs-graphql-endpoint>"
```

`DIRECT_URL` is not read by the staging workflow. Never expose database configuration through `NEXT_PUBLIC_` variables. Staging commands require TLS for Neon (`sslmode=require` or `verify-full`) and the `public` schema.

`DATABASE_URL` is required for database queries. Relative SQLite paths resolve from `prisma/`, not the repository root. Standalone import/validation scripts require the variable explicitly in their process environment; do not assume Next.js `.env` loading applies to them.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | SQLite file URL for the app/local tools; explicitly exported PostgreSQL staging URL only in the isolated operator shell. |
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

For a **new disposable database**, apply the reviewed SQLite migrations using the procedure in [CTP integration](docs/CTP_DATA_INTEGRATION.md), then import reviewed GTFS data. Existing snapshots require the baseline review described above. `db:push`, `db:migrate`, and destructive `db:reset` scripts exist, but are not normal startup steps and should not be run against the sole application/production copy.

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

### Local SQLite development imports

Prepare an existing disposable copy with reviewed SQLite migrations before applying. Existing snapshots need schema/baseline review; never reset or replay a baseline over the sole snapshot. Both local importers default to audit/dry-run. Apply requires an explicit existing SQLite target and refuses `db/custom.db`, including symlink aliases.

```bash
npm run audit:gtfs
npm run audit:ctp
npm run import-gtfs -- --dry-run
npm run import-ctp -- --dry-run
DATABASE_URL='<sqlite-file-url-for-migrated-disposable-copy>' npm run import-gtfs -- --gtfs-dir '<validated-feed-directory>' --apply
DATABASE_URL='<sqlite-file-url-for-migrated-disposable-copy>' npm run import-ctp -- --apply
```

CTP requires reviewed local `data/ctp_exports/ctp_all_stops.csv` and `ctp_duplicate_conflicts.csv`; national coverage checks additionally require `ctp_validation_summary.csv`. These ignored inputs are not supplied by a fresh clone. Inspect `DatasetVersion`, `ImportRun` and `ImportRejection`, canonical/projection parity and source checksums after publication. The current versioned CLIs print JSON summaries; historical per-run report directories describe earlier tooling. Keep source files and audit evidence for later verification, and review local reports before sharing.

### Neon staging: schema, GTFS and CTP operator commands

Use a dedicated Bash shell and supply the intended staging URL through a hidden prompt; keep the application's SQLite `.env` unchanged. Do not put a real URL in documentation or shell history. Commands must run from the repository root with dependencies installed. The URL alone cannot prove that a target is staging: select the intended isolated database operationally.

```bash
bash
read -r -s -p 'Neon staging DATABASE_URL: ' DATABASE_URL
export DATABASE_URL
npm run db:postgresql:validate
npm run db:postgresql:generate
npm run db:postgresql:check
# Initial schema only: empty public schema or exact completed baseline rerun.
npm run db:postgresql:migrate
npm run db:postgresql:verify
npm run db:postgresql:status

# These two import commands WRITE immediately; no flags or implicit dry-run.
npm run db:postgresql:import:gtfs
npm run db:postgresql:verify:gtfs
npm run db:postgresql:import:ctp
npm run db:postgresql:verify:ctp
npm run db:postgresql:status
unset DATABASE_URL
exit
```

Generation is local and does not connect. `check` is read-only connectivity/schema inspection; `migrate` guards and applies the independent initial migration; `verify` checks the catalog, expected tables, constraints, indexes and migration checksum. Never run root SQLite `db:push`, `db:migrate` or `db:reset` against PostgreSQL. The initial migration guard is not a general future migration runner.

Imports pin inputs to corrected `gtfs-data` and normalized `data/ctp_exports`, using `rutatica-gtfs` and `ctp-official` respectively. They validate canonical/projection content before activation, then verify the active publication. Verifiers use read-only Serializable snapshots and return nonzero on mismatch. They compare local-source checksums, counts, relationships, stop-route membership, services/shapes, CTP provenance/quarantine and current/display consistency. Verification requires the matching retained input files; an older active version may legitimately differ from current local inputs after a failed replacement.

For failure investigation, rerun the read-only commands:

```bash
npm run db:postgresql:status
npm run db:postgresql:verify:gtfs
npm run db:postgresql:verify:ctp
```

Run them within the staging shell while its URL is exported. Status lists versions, active slots, runs and counts; canonical totals can include historical versions. Incomplete runs older than one hour are marked possibly abandoned, not proven abandoned. Confirm the writer has stopped before intervention, retain evidence, correct the cause and retry. Do not delete history or manually change active slots. Staging errors are sanitized; do not share raw local database errors or source payloads. Connectivity, schema/catalog checks, GTFS publication/active data and status CLI are verified on Neon. The previous CTP attempt failed safely; CTP publication still requires diagnosis/fix and successful verification. Complete application runtime and load validation against Neon remain pending.

## Testing and Playwright/E2E status

```bash
npm test
npm run typecheck
npm run lint
git diff --check
```

Validation rerun on September 28, 2026:

| Check | Result |
| --- | --- |
| `npm test` | 41 passed, zero failed; rerun outside the sandbox after its Python subprocess restriction blocked temporary-database setup. |
| `npm run typecheck` | Passed when rerun after build type generation; the initial overlapping run encountered transient missing generated types. Run build and typecheck sequentially. |
| `npm run lint` | Passed. |
| `npm run build -- --webpack` | Passed, including TypeScript, page generation and build tracing. |
| `npm run audit:gtfs` | Passed: zero errors, warnings, unsupported features or dangling shapes. |
| `npm run audit:ctp` | Passed with the accepted/quarantined counts above and zero normalized conflicts. |
| README review | Diff reviewed, whitespace check passed, all 26 documented npm script names exist in package.json, and local documentation links resolve. |

Source audits verify the corrected GTFS and normalized CTP inputs; historical full-data publication evidence is linked above. The operator-confirmed live Neon results are listed above; no live commands were rerun for this README correction. Complete Next.js end-to-end validation against Neon, production deployment and live OTP validation are not established. Browser checks were not rerun. Local tests of PostgreSQL verification contracts alone do not certify live PostgreSQL behavior.

Tests use Node's built-in test runner through `tsx`. They cover service dates and exceptions, time parsing, geometry clipping, scoring/provenance, input and download validation, OTP fixtures and fallback, CTP CSV/path hardening, temporary SQLite migrations, atomic rollback, idempotency, and routing isolation. Temporary test databases do not certify the production dataset.

`npm run test:browser` runs the optional Playwright Chromium script in `scripts/verify-mobile.cjs`. **Playwright is not a package dependency**: provide it and its Chromium binary separately. Start the app against an imported national validation snapshot first, with OTP disabled for the local-fallback checks.

```bash
APP_URL='<local-validation-server-url>' PLAYWRIGHT_MODULE='<path-to-playwright-module>' BROWSER_REPORT='<browser-report-path>' npm run test:browser
```

The runner checks CTP API results across seven provinces and five viewport widths, autocomplete keyboard handling, CTP-only messaging, closing/reopening results, horizontal overflow, and runtime/hydration errors. It deliberately blocks external HTTPS requests during UI checks. It is a focused browser smoke suite, not complete E2E certification or proof of external provider reliability. Checked-in historical evidence includes a blocked browser attempt; do not infer a current successful browser run solely from the script's presence.

## Nationwide validation tooling and release readiness

Follow [the ordered national validation procedure](docs/NATIONWIDE_VALIDATION.md) against a disposable imported snapshot:

```bash
DATABASE_URL='<sqlite-file-url-for-imported-snapshot>' npm run validate:nationwide
DATABASE_URL='<sqlite-file-url-for-imported-snapshot>' npm run smoke:release
```

Additional SQLite-only diagnostic scripts are described in the linked procedure. The historical snapshot verifier requires `before.json` hashes and assumes pre-existing tables remain unchanged; that assumption does not apply to deliberate versioned GTFS projection replacement. Use the current publication tests and PostgreSQL verifiers for that workflow.

`validate:nationwide` reads imported data and source coverage metadata, checks coordinates, reports province/canton counts and inferred GTFS coverage, computes overlap candidates, and probes bounded map/nearby/search queries. It writes `data/ctp_reports/nationwide.json`. `smoke:release` calls API handlers directly with OTP disabled and checks representative routes, malformed input, and download traversal. Its fixtures depend on the bundled GTFS IDs and active schedules.

The documented September 19 national run includes 93 probes across 31 locations, repeat-import idempotency, and unchanged pre-existing tables. These are local sequential measurements, not concurrent production load certification.

Release review should include database integrity/foreign-key checks, before/after hashes, import reports, fresh calendars, representative routing, browser checks, typecheck/lint/tests, production build, and diff review. Then validate the actual deployed filesystem, approved data snapshot, OTP contract, external providers, and operational controls. Passing local tests does not establish national transport coverage.

## Deployment architecture

The browser uses the Next.js UI and API handlers; server-side Prisma reads SQLite and the OTP client optionally calls a separate routing service. The browser also uses external map/geographic services. Runtime API/database requirements mean this is not a static-only website.

`next.config.ts` produces standalone output outside Vercel and explicitly traces `db/custom.db` into API artifacts and the allowlisted DOCX into the download handler. A different validation database is not automatically packaged just because `DATABASE_URL` points to it. Publishing an approved imported snapshot requires an explicit packaging and runtime-path check.

The documented Vercel approach is a read-only bundled SQLite snapshot, not durable writable serverless storage. Imports must run as operator jobs outside request handling. An existing `Caddyfile` provides a local reverse-proxy configuration, including query-selected upstream ports; it is not a reviewed public production ingress configuration. Neon staging database and GTFS validation do not constitute application deployment. Production is not deployed.

## Known limitations and remaining production work

- Acquire and verify wider GTFS/operator coverage, current schedules/fares, missing shapes, and source redistribution permissions. Resolve the CTP WFS discrepancy and validate administrative boundaries.
- Operationalize the implemented CTP movement/absence review and publication policy. Rehearse refresh/recovery and package the approved national snapshot explicitly.
- Deploy and validate a pinned OTP graph/schema with appropriate memory, TLS, health checks, and observability.
- Address local routing limitations: supported GTFS subset, one-transfer search, initial wait exclusion, previous-service-day lookup, approximate walking, and ambiguous loop geometry.
- Complete authentication, persistent favorites/history/settings, unfinished navigation, and real-device/accessibility verification. No GTFS-Realtime vehicle feed is implemented.
- Validate concurrent load, database/search performance, provider policies/capacity, rate limits, backups/restore, monitoring, and production security. Neon connectivity, schema/catalog checks, GTFS publication and status CLI are verified. CTP PostgreSQL publication diagnosis/fix and successful verification, full application validation against Neon, production cutover and PostGIS remain pending.

## Production deployment plan — planned, not completed

1. Archive/checksum approved source exports and the prior database/build; verify rights, freshness, calendars and unresolved CTP coverage issues.
2. Build on the verified Neon connectivity, migrated/verified schema, GTFS publication/active counts and status CLI. Diagnose/fix CTP PostgreSQL publication, publish it successfully and run its verifier. Retain sanitized evidence and complete PostgreSQL idempotency, fault-injection, locking and retry validation.
3. Implement application PostgreSQL provider/client selection, deliberate search/geographic parity, pool limits and deployment packaging. Preserve text codecs initially; treat PostGIS as a separate change. Replace SQLite-specific diagnostics and tracing only during actual cutover.
4. Run API/browser/build checks against staging, representative routing and CTP-only cases, concurrent load, provider failure tests, security/monitoring checks and backup/restore rehearsals. Validate a pinned OTP service/graph if enabled. Establish reader snapshot consistency or maintenance windows.
5. Prepare the production Next.js host, managed PostgreSQL, separate optional OTP service, TLS/ingress, secret management and operator import jobs. Confirm operational readiness and production cutover authorization before switching traffic/configuration.
6. Freeze imports/writes, reconcile final checksums, publish the approved datasets, deploy and smoke-test. Keep the prior database/build available. On cutover failure, restore the prior application configuration/build/database selection and retain failure evidence; do not destructively modify the old database.

Production is **NOT deployed**. Production cutover remains pending; verified Neon staging GTFS publication does not imply a completed application provider cutover.

## Documentation

- [Current PostgreSQL/Neon staging commands](docs/POSTGRESQL_STAGING_CONNECTION.md)
- [Versioned publication model and migration/cutover design](docs/POSTGRESQL_MIGRATION_PLAN.md) — historical future-work statements require comparison with current tooling above
- [Dated local migration validation and exact counts](docs/MIGRATION_PREPARATION_VALIDATION.md)
- [Shape repair decisions](docs/GTFS_SHAPE_RESOLUTION.json), [CSV repairs](docs/GTFS_CSV_REPAIRS.json), [stop-route reconciliation](docs/STOP_ROUTE_RESOLUTION.json)
- [CTP integration, provenance, migrations, and import controls](docs/CTP_DATA_INTEGRATION.md)
- [Nationwide validation procedure](docs/NATIONWIDE_VALIDATION.md)
- [Province/canton coverage](docs/NATIONWIDE_COVERAGE.md) and [CSV coverage table](docs/NATIONWIDE_COVERAGE.csv)
- [Release-readiness findings](docs/RELEASE_READINESS.md)
- [Historical verification transcript](docs/RELEASE_VERIFICATION.txt) — dated evidence, not a current deployment guarantee
- [OpenTripPlanner integration](docs/OPEN_TRIP_PLANNER.md)
- [PostgreSQL/PostGIS proposal](docs/POSTGIS_MIGRATION_PROPOSAL.md)
- [Development log](BITACORA_DESARROLLO.md) and [change log](BITACORA_CAMBIOS.md)
- [Contributor instructions](AGENTS.md) — consult the installed Next.js guides before application changes
