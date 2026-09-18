# CTP physical stop integration — 2026-09-18

## Release boundary

CTP records official mapped physical stops. It does **not** supply verified GTFS routes, trips, schedules, transfers, travel times, or proof of current service. `GtfsStop`, `StopRoute`, GTFS trips and OTP remain the only routing inputs. No CTP-to-GTFS association is written. A close spatial candidate is not a route relationship.

The national importer has only been run in dry-run mode against the existing application database. Loading production requires explicit approval. A projected coverage count is not deployed coverage.

## Inspection and architecture

The existing SQLite database has 88 GTFS stops. GTFS import upserts `GtfsStop`; trip times and `StopRoute` reference its primary key. `findNearestStops` is used by both local planning and nearby route lookup. These routing callers remain GTFS-only. The former map loader depended on successful route planning, and autocomplete used settlement suggestions/Nominatim.

Choose **A: separate `ctp_stops` table**, represented by `CtpStop` in Prisma. This creates a structural boundary around GTFS relationships and limits importer writes to a single table. Public display queries combine both sources, preserve GTFS `stopId`, and add source-qualified public `id`. CTP `stopId` is namespaced and cannot collide with GTFS IDs. No PostGIS is necessary for this release.

The model preserves internal PK, source `CTP`, source identifier, extraction candidate ID, name, transformed coordinates, original coordinates as strings without precision loss, province/canton/district, complete row provenance JSON, a content hash and creation/update times. Original empty descriptions are rejected; names are not invented. Ambiguous WFS districts are returned as null; the original district and candidates remain in provenance.

Identity is SHA-256 of the source ID and decimal-normalized original x/y, without floating-point rounding. Only that derived key is unique. Source IDs and candidate IDs are not constrained globally. Input ID/geometry variants and conflicting payloads are quarantined, never merged. Indexes cover both latitude/longitude orders, province, canton and source ID.

## Actual files inspected

`data/ctp_exports/ctp_all_stops.csv`: **38,699 rows; 36,408,251 bytes; 33 columns**:

```text
identificador_parada, geometriatextual, coord_x, coord_y, descripcion,
source_stop_identifier, source_record, province, canton, province_code,
canton_code, source_endpoint, retrieved_at, source_crs, output_crs,
longitude, latitude, coordinate_status, geometry_conflict, original_payload,
distance_ciudad_quesada_m, outside_cr_screen, wfs_numeric_ids,
wfs_feature_ids, wfs_match_count, wfs_ambiguous, district,
district_candidates, district_source, candidate_id, occurrence_count,
source_records, selection_provenance
```

- Source identity: `identificador_parada`, `source_stop_identifier`; extraction identity: `candidate_id`. Source row/WFS identifiers remain provenance, not GTFS identifiers.
- Coordinates: `coord_x/coord_y`, EPSG:5367; `longitude/latitude`, EPSG:4326. WKT is preserved in metadata.
- Geography: province/canton names and codes; district, district candidates and district source.
- 38,699 distinct source IDs in this snapshot. 42 empty descriptions; no other empty fields. All source coordinate status flags are valid, with no geometry conflict/outside-CR flags. 816 rows have ambiguous WFS matches.
- `ctp_duplicate_conflicts.csv`: 16,596 rows, 7,935 repeated IDs, all labeled `exact_duplicate`. They account for 8,661 extra source occurrences already collapsed by extraction, not 16,596 extra unique stops. The importer verifies duplicate labels against the normalized candidate and writes every occurrence to local JSONL audit.
- `ctp_validation_summary.csv`: 47,360 viewer rows, 38,699 normalized candidates; WFS national 123,176 vs canton sum 123,171, a discrepancy of five features. Source coverage status remains `review_required`, not certified nationwide completeness.

## Source and extraction provenance

Inputs were previously extracted from the public CTP viewer structured endpoint `https://visortp.ctp.go.cr/Visor/service/ctp` and reconciled against the viewer's WFS `paradas_ubicacion` layer. Source endpoint, retrieval timestamp, original payload, source CRS, output CRS and WFS IDs are retained per record. The supplied extraction review describes verified TLS with a validated CA bundle, conservative rate limiting, canton enumeration, count checks and WFS spatial matching within 0.1 m. This integration does not re-scrape or access new endpoints.

Snapshot retrieval metadata begins 2026-09-12. Public accessibility is not confirmation of a redistribution license, mandated attribution, permissible caching period or source accuracy/current service. Confirm these with the publisher before external redistribution. Records are infrastructure, but free-text descriptions are not certified free of incidental personal information. Do not expose internal payloads or serve raw exports through download APIs.

## Migration and safe operation

No migration has been applied to `db/custom.db`. Two migrations are included because this repository previously had no Prisma migration history:

1. `20260917000000_baseline` reproduces the pre-CTP Prisma schema.
2. `20260918000000_ctp_stops` adds only the new table, constraints and indexes.

For a **new disposable database**, `prisma migrate deploy` applies both. For an **existing database**, first back it up, verify its schema matches the baseline, and mark only the baseline as applied with `prisma migrate resolve --applied 20260917000000_baseline`; then `prisma migrate deploy`. These are operator actions requiring target-specific authorization. Do not use `db push`, reset or a destructive migration against the sole production copy. Review schema drift before baselining.

Dry-run (safe default; existing database path is mandatory):

```bash
DATABASE_URL=file:../db/custom.db npm run import-ctp -- --dry-run
```

Only after explicit approval, use the approved target URL and `--apply`:

```bash
DATABASE_URL=file:/absolute/path/to/approved-copy.db npm run import-ctp -- --apply
```

No arbitrary CLI input/output paths are accepted. Both fixed input files are required, and symlinks outside the export directory are rejected. Reports use a unique directory under ignored `data/ctp_reports/`; JSON/JSONL avoids spreadsheet formula execution. Never open raw CSV in a spreadsheet with formula evaluation enabled. Source strings are rendered through React escaping, not HTML interpolation. SQL uses Prisma parameters; no source value is executed as shell/SQL.

CSV limits: 100 MiB per file, 150,000 rows, 64 KiB per record; strict quoting/column count/header checks. Malformed CSV stops the run before DB writes and produces `failure.json`. Row-level validation rejects missing IDs/names, invalid/nonfinite coordinates, incorrect CRS/status/provenance and coordinates outside a conservative mainland CR screen. This geographic screen is not an administrative boundary certificate and would need explicit adjustment for offshore coverage.

Reports distinguish input duplicates, source duplicate occurrences, invalid rows, conflicts, imported/updated/unchanged/skipped counts and projected vs applied mode. Every source conflict/duplicate and rejected row is written to `audit.jsonl`. `summary.json` includes coverage and reconciliation counts; detailed pairs are in `reconciliation.json`.

Writes are idempotent upserts in a single CTP-only transaction, with a five-minute timeout. Any failed write rolls the transaction back. Serialize import jobs: dry-run counts are a snapshot and concurrent writers can invalidate projections. A repeat unchanged snapshot yields unchanged rows. Changed metadata updates the existing identity; a moved source stop creates a distinct physical identity, retaining the earlier record. No implicit deletion occurs. Before refreshing changed snapshots, review moved/removed IDs and discrepancies; retirement and historical dataset versioning require a future explicit policy.

## Public query contract and UX

- `/api/stops`: existing search/lat/lon/radius/limit/offset plus `source=GTFS|CTP`, `province`, `canton`, `bbox=south,west,north,east`.
- `/api/nearest-stop`: same physical stop sources, default radius 2 km, default limit 50; retains nested `stop` and `distanceKm` response.
- `/api/locations/search?q=...&type=stop`: explicit physical-stop autocomplete; ordinary settlement lookup remains available. The active autocomplete also searches `/api/stops` and labels CTP as lacking route/schedule data.
- Common public fields: `id`, legacy-compatible `stopId`, name, lat/lon, source, `hasRouteData`, routeCount, province/canton/district. No provenance JSON/internal DB PK is exposed. GTFS route availability reflects actual StopRoute/stop-time relations; it is not proof of a departure today. CTP always has `hasRouteData=false`, routeCount 0.
- Display lookup returns `ctpAvailable=false` if the additive table has not been deployed, while preserving GTFS results. Other DB errors are not hidden. Missing CTP infrastructure can never break successful GTFS/OTP routing.
- Map fetches visible bounds after movement with debounce, cancellation and stale-response protection, independent of route results. Zoom below 12 requests no stops; maximum 100 visible markers, with an explicit zoom-in/truncation notice. No national dataset is sent to the browser.
- CTP markers use a neutral outlined icon and the popup: “Parada oficial registrada por CTP. Ruta/horario todavía no disponible en RutaTica.” Selected-route GTFS geometry and markers remain separate.
- When no GTFS/OTP route is found near CTP infrastructure, the planner returns zero routes and an honest infrastructure-only message. The UI preserves that message; any driving fallback is described as an automobile alternative.

## Reconciliation and Ciudad Quesada

Reusable proximity helpers use 50 m candidate distance and spatial bins. They do not merge records or write relationships. A one-to-one geographic candidate is merely a likely overlap; one-to-many/many-to-one candidates are ambiguous, including opposite-direction stops.

Initial dry-run on accepted CTP rows versus 88 existing GTFS stops: **9 one-to-one candidate pairs, 12 ambiguous pairs, 38,636 unmatched CTP, 74 unmatched GTFS**. Pair counts are not distinct stop counts.

Center: latitude 10.3275, longitude -84.4372. Application Haversine distances, accepted rows only:

| Radius | CTP projected | GTFS | Combined projected |
|---|---:|---:|---:|
| 1 km | 58 | 0 | 58 |
| 5 km | 373 | 0 | 373 |
| 10 km | 661 | 0 | 661 |
| 25 km | 2,555 | 0 | 2,555 |

Nearest CTP: `PBA-21001-397`, (10.328979888894139, -84.43678051906224), 0.170835 km. Nearest GTFS: `ALA001`, (10.0163, -84.2119), 42.490763 km.

Extraction summary uses WGS84 ellipsoidal distances and all input rows: 58/374/663/2,608. Its accepted-name subset is 58/374/663/2,591. Differences from API projections reflect Haversine vs ellipsoidal boundary decisions and rejected descriptions. Do not mix those counts in a release claim.

## Performance and validation scope

B-tree spatial filtering, limits up to 100, offset up to 10,000, radius up to 50 km and bounding boxes no larger than one degree per axis constrain public queries. Radial distance ranking considers all candidates inside the server-side box before limiting, avoiding nearest-stop errors caused by arbitrary ID truncation. Pagination is stable GTFS-first for non-radial queries; geographic queries order by actual distance and public ID. Administrative filters apply to CTP because GTFS has no equivalent fields.

No query loads all national records into the browser. Provenance JSON is excluded from display SELECTs. The import keeps bounded input/audit data in server memory; production memory limits and load behavior must be verified with the actual hosting configuration. Unindexed substring text search scans names but limits response size; consider FTS if measured traffic warrants it. SQLite remains a deployment snapshot; build tracing uses the approved DB snapshot, not raw CSV files.

Tests use synthetic temporary databases for migration, parsing, validation, duplicate handling, source precision, dry-run, repeat import, changed names, rollback, coexistence, API labels, radius/bbox queries and CTP-only route rejection. Real national dataset import, live-map validation and measured production latency remain separate approval/release gates. See `RELEASE_VERIFICATION.txt` for actual executed checks.
