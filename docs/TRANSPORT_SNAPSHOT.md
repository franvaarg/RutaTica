# SQLite transport release snapshot

The deployed application reads `db/custom.db` (SQLite). PostgreSQL staging and OTP configuration are unchanged.

## Data and provenance

The approved local exports were reused without downloading or rebuilding the CTP source:

- `data/ctp_exports/ctp_all_stops.csv`: SHA-256 `34d39ad7b637fb4bfc3359be267277dbf1852d172f343b4372ff4bbc713720a0`.
- `data/ctp_exports/ctp_duplicate_conflicts.csv`: SHA-256 `6352b3ba201bd05decc1519b1c5bddcd0c3a953b1da18cf36fad470cd1a84638`.
- Reviewed pipeline: `scripts/import-ctp.ts --apply`, using `prepareImport` and `publishCtp` on a disposable migrated copy.
- 38,699 normalized rows: 38,657 usable physical stops, 42 rejected, zero conflicting source IDs. Seven provinces and 82 source-enumerated cantons. Source completeness remains `review_required`, as documented in [national coverage](NATIONWIDE_COVERAGE.md).

The complete published candidate contains observation history and rejection evidence and is about 233 MiB. It is preserved locally, alongside the original database backup, in the ignored directory `local-transport-release-20260929-144910/`. Raw exports, temporary databases and history artifacts are not committed.

`scripts/build-stop-snapshot.py BASELINE PUBLISHED_CANDIDATE OUTPUT` builds a new disposable deployment snapshot. It copies the baseline, applies the existing additive SQLite schema/index migrations, and copies the current `ctp_stops` display projection **including the full original sourceMetadata**. It does not change the published candidate or discard its history. Versioned publication tables in the release are empty: this is a read-only application snapshot, not the import workspace or an archive of publication history. Import tools must continue targeting separate candidates.

The script checks table content hashes against the baseline and candidate, integrity, foreign keys, accepted stop count, and the GitHub single-file size limit. All preexisting table contents remain unchanged. The release snapshot is 93,995,008 bytes (89.6 MiB); SHA-256 `094d8585a31647bd356c3be5e63c90adf6bdc8705938433721a677c6b9b5478e`. `next.config.ts` continues tracing `./db/custom.db` into API deployment bundles.

| Entity | Rows |
| --- | ---: |
| GTFS agencies | 3 |
| GTFS stops | 88 |
| GTFS routes | 18 |
| GTFS trips | 72 |
| GTFS stop_times | 396 |
| StopRoute | 121 |
| CTP physical stops | 38,657 |

## Display and routing boundaries

The map queries its visible bounding box after initialization and meaningful map movement, debounces by 300 ms, caps responses at 100 stops, aborts stale requests, and asks users to zoom in below zoom 12. GTFS markers are red; CTP markers are gray/white and explain that route/schedule data is unavailable. An initialization race in the React-Leaflet forwarded reference was fixed so stops load even without an initial map movement.

CTP exact district/canton search results rank before incidental name substrings: searching Pital prioritizes the Pital district rather than hospitals elsewhere. Stable pagination and existing radial-distance ordering are retained.

The existing OTP-first/local-GTFS planner remains intact. Empty responses carry `no_coverage`, `no_connection`, or `no_scheduled_trip`, with Spanish explanations. A date-independent, ordered stop-time connectivity check is used only to explain empty results; it never returns an out-of-service trip. The UI distinguishes schedule absence from missing data and labels an OSRM driving alternative as a car journey. Failed driving lookup no longer shows an indefinite calculating indicator.

CTP never creates GTFS routes, trips, frequencies, schedules or operator associations. The existing GTFS schedules mostly contain early morning trips; the covered San José–Alajuela verification explicitly requests departure after 04:00 on the current service date. At 23:59 it correctly returns no scheduled trip. Structural validity does not certify operator schedule freshness.

## Validation and external gap

The candidate passed SQLite integrity/FK checks and preservation of all baseline data (the full import workspace additionally has its internal publication mutex). `verify-ctp`, `validate-nationwide` and release smoke passed: 93 bounded national queries, all seven provinces, and forward/reverse scheduled GTFS results. Browser verification is reproducible with `scripts/verify-transport.cjs` and an external Playwright installation, locally or using `APP_URL` for production. It verifies API counts, pagination, searches, radial/bbox results, covered schedules, late departures, uncovered responses, GTFS/CTP markers, geolocation and Pital selection on desktop/mobile.

Only `gtfs-data/` contains a GTFS feed locally. The prior `upload/RutaticaApp-corregido.zip` contains an older application database, not an additional GTFS feed. No broader valid national GTFS was found in tracked/ignored local project assets. National scheduled routing still requires operator-sourced GTFS with stop-to-trip relationships, route direction, calendars, stop_times and current schedules (plus authoritative shapes where available), including San Carlos/Pital. The CTP physical-stop source cannot fill that gap. OTP is unconfigured locally and was not deployed; a graph built from the same small feed would retain the same limitation.
