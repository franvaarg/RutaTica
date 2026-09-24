# Local migration preparation validation — 2026-09-23

No PostgreSQL/Neon database was connected or created. No deployment, commit or push was performed. No production data was modified. The repository SQLite snapshot remains byte-for-byte unchanged.

## Validated data

- Original `db/custom.db` SHA-256: `5775af63e517026d8b91a08ae1ae94f5759cedb0986383f433c014bb4f8f78cd`.
- Disposable full-data validation database: `/tmp/rutatica-migration-audit/validation.db`.
- Corrected source: 3 agencies, 88 stops, 18 routes, 72 trips, 396 stop times, 3 calendars, 13 exceptions and 169 points in 10 shapes.
- 50 optional shape references cleared, all 72 trips retained, zero dangling shapes. No geometry fabricated. Per-ID decisions: [GTFS_SHAPE_RESOLUTION.json](GTFS_SHAPE_RESOLUTION.json).
- 19 fare-rule rows had a surplus empty CSV column; company description commas were properly quoted. Values were retained. Details: [GTFS_CSV_REPAIRS.json](GTFS_CSV_REPAIRS.json).
- Membership: 121 original pairs → 122 derived pairs. Only missing original pair: INT009/R101. No extras. Validation copy has zero missing/extra pairs. [STOP_ROUTE_RESOLUTION.json](STOP_ROUTE_RESOLUTION.json).
- Canonical GTFS: 72 version-scoped trips, 396 version-scoped stop times and 3 independent service entities.
- CTP: 38,657 stable identities, observations and usable display records; 42 rejected unnamed rows preserved. 816 ambiguous districts remain null.
- ImportRejection contains 16,638 evidence records: 16,596 original duplicate occurrences plus 42 rejected stop rows. Source duplicates are not 16,596 additionally rejected normalized stops.
- 294 co-located coordinate groups in accepted numeric-coordinate observations remain separate identities. The earlier audit's 293 groups used raw coordinate strings over all 38,699 source rows; float normalization and population differ. No coordinate-based merge occurred.
- Reconciliation: 9 candidate and 12 ambiguous records; 0 automatically accepted.
- Two successful source publications, two active dataset versions (one GTFS, one CTP).
- SQLite integrity_check: ok. foreign_key_check: zero violations.

## Test coverage and verification

Publication tests use newly migrated temporary databases and exercise dataset-scoped ID reuse, same-version FKs, unique sequence keys, active-slot CHECK constraints, missing-shape rejection, null shapes, calendar-dates-only services and >24-hour times. Injected failures after canonical inserts, projection replacement and activation preserve the exact previous active projection and produce failed ImportRuns. CTP tests cover history, movement, absent stops, quarantine evidence, null ambiguous districts, co-location and reviewed reconciliation that survives recomputation. Routing tests cover loop occurrences, current Costa Rican service dates and exception additions/removals.

The full-data database above was built before the final added SQL CHECK clauses; the final migration, including those clauses, is exercised by the fresh-database publication tests. The full-data values independently pass the checks. No claim is made that SQLite tests certify PostgreSQL runtime behavior.

Validation command logs are local under `/tmp/rutatica-migration-audit/`: Prisma validation/generation, draft PostgreSQL schema validation, typecheck, lint, all tests, GTFS audit, CTP audit, CTP API checks, release smoke tests and production Webpack build. Final outcomes are recorded below after command completion.

## Remaining boundaries

PostgreSQL DDL is an offline draft, not executed SQL. The next stage must verify its SQL/runtime, transaction locking/retries, pool behavior, search semantics, typed conversion, performance and restore. Native JSONB/DATE conversion is deliberately deferred until the corresponding client codecs change. The SQLite compatibility reader supports one active feed source; use a publication maintenance window or reader snapshot transactions until canonical version-pinned readers replace it. No national route coverage is inferred from CTP.

The local planner still does not search yesterday's service day after midnight, implement frequencies/interpolation/continuous pickup, or certify current schedules. All calendars expire 2026-12-31 and current holiday exceptions require authoritative refresh. CTP coverage remains review_required. These are documented staging/production acceptance boundaries, not concealed migration guarantees.

## Files changed

- `README.md`
- `docs/CTP_DATA_INTEGRATION.md`
- `docs/GTFS_CSV_REPAIRS.json`
- `docs/GTFS_SHAPE_RESOLUTION.json`
- `docs/OPEN_TRIP_PLANNER.md`
- `docs/POSTGRESQL_MIGRATION_PLAN.md`
- `docs/RELEASE_READINESS.md`
- `docs/STOP_ROUTE_RESOLUTION.json`
- `gtfs-data/empresas.csv`
- `gtfs-data/fare_rules.txt`
- `gtfs-data/trips.txt`
- `package.json`
- `prisma/migrations/20260923000000_versioned_transport/migration.sql`
- `prisma/postgresql/initial-draft.sql`
- `prisma/postgresql/schema.prisma`
- `prisma/schema.prisma`
- `scripts/audit-ctp.ts`
- `scripts/import-ctp.ts`
- `scripts/import-gtfs.ts`
- `src/app/api/best-route/route.ts`
- `src/lib/ctp-import.ts`
- `src/lib/ctp-publication.ts`
- `src/lib/environment.ts`
- `src/lib/gtfs-audit.ts`
- `src/lib/gtfs-publication.ts`
- `src/lib/publication-transaction.ts`
- `src/lib/routing-membership.ts`
- `src/lib/service-time.ts`
- `src/lib/storage/legacy-ctp-projection.ts`
- `src/lib/storage/sqlite.ts`
- `src/lib/time-utils.ts`
- `src/lib/trip-segments.ts`
- `tests/ctp.test.ts`
- `tests/publication.test.ts`
- `tests/quality.test.ts`
- `tests/release.test.ts`
