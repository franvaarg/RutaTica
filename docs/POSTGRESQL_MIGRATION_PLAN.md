# Transport persistence and future Neon staging

Status: implemented and exercised locally; no PostgreSQL/Neon connection, deployment or production modification. The protected `db/custom.db` snapshot is not automatically migrated or repaired. Select a disposable copy explicitly for new imports. The application provider remains SQLite / Prisma 6.19.3.

## Architecture and naming

`DataSource` identifies a publisher/feed namespace. `DatasetVersion` records the source, content checksum, retrieval time, original GTFS table manifest, publication time and status. `ImportRun` records pending/importing/validating/succeeded/failed, counts, validation and failures. `ImportRejection` retains row-level CTP evidence, including all 42 unnamed rows.

The canonical tables are `GtfsAgencyVersion`, `GtfsStopVersion`, `GtfsRouteVersion`, `GtfsTripVersion`, `GtfsStopTimeVersion`, `GtfsService`, `GtfsCalendarVersion`, `GtfsCalendarDateVersion`, `GtfsShapeVersion` and `GtfsShapePoint`. The Version suffix distinguishes them from the existing API compatibility tables. It does not change GTFS entity semantics. Canonical entity IDs are internal opaque strings; external IDs are unique only within a dataset version. Shape-point and stop-time identity is the parent plus sequence. Calendar exceptions are unique per service/date.

Every GTFS cross-entity reference that could cross feed versions uses a composite FK containing datasetVersionId. A service belongs to a version and has zero or one weekly calendar and any number of exceptions. Trips reference services, not weekly calendars. Exception-only services must have added dates. Shapes have headers so nullable trip-to-shape FKs are enforceable. Optional station coordinates/names remain nullable canonically when the specification permits them. Original columns survive in payload/manifest, including optional fields not yet interpreted by the local planner.

The old Gtfs* tables and StopRoute are one active feed's compatibility projection. Their external primary keys are NOT canonical identity and are not used by reconciliation. Canonical history can retain multiple versions with identical external IDs. Activation of a second GTFS source is deliberately rejected until APIs are converted to source/version-scoped readers. A provider migration must not silently enable multi-feed public IDs. Existing API URLs retain their current meaning for the single active source.

`CtpStopIdentity` is the canonical CtpStop entity: internal stable ID, source/external-ID uniqueness, explicit active flag and current observation FK. `CtpStopObservation` stores version, source ID, normalized name, WGS84 coordinates, administrative names/codes, nullable district, original projected coordinates/CRS, retrieval time, review status and full provenance. Existing `ctp_stops` is only a display projection. Its IDs now come from stable identities, not coordinate hashes. Legacy exported hash IDs must be treated as aliases during a future consumer migration; no persisted favorites currently use them.

`StopReconciliation` references a versioned GTFS stop and a specific CTP observation. It retains distance in metres, method, algorithm version, candidate/ambiguous/accepted/rejected state and review evidence. A review requires a reviewer, evidence and timestamp. Re-running proximity matching does not override a reviewed decision. Acceptance does not create route/service membership or merge records.

## Publication, failure and concurrency

GTFS input is read once; the checksum covers sorted filenames and their exact bytes. Validation uses that in-memory snapshot. A failed preflight creates a failed run/version but does not touch the active projection. Canonical inserts, compatibility replacement, derived StopRoute membership, integrity counts, active-version change and successful run completion share one transaction. No active stop_times/shapes are deleted outside that transaction. Throwing at any checkpoint rolls everything back. Failure metadata is written after rollback. A crash can leave a pending/importing run, never a partially committed projection; operators should mark abandoned runs failed after confirming no writer is running.

A nullable unique activeSlot holds the source ID only on the active version. CHECK constraints enforce valid states and slot ownership. Earlier versions become superseded, with their canonical records intact. Re-importing an already successful checksum is a no-op; it does not reactivate superseded history. Failed versions can be retried because their entity writes rolled back. Do not manually delete successful history.

Run one publisher per source/database. SQLite serializes writers. Publication now uses Serializable transactions, a shared publication-mutex row and up to three whole-transaction attempts for Prisma P2034 serialization conflicts. Verify these semantics on PostgreSQL staging. Never continue a PostgreSQL transaction after a statement error. Uniqueness still prevents duplicate active slots. Publication of the compatibility projection requires a maintenance window until all multi-query API reads pin a version or share a repeatable-read transaction. This is a reader-consistency constraint, not permission to delete history.

CTP publication stores quarantine evidence before its entity transaction. Usable observations, stable identities, current pointers, display replacement and activation are atomic. A moved identity gets a new historical observation but becomes inactive, pending review; neither old nor new coordinates are advertised as usable. Repeated imports do not automatically clear the review. Stops absent from a later snapshot become inactive with missing_from_snapshot, which is not a claim of official removal. Reappearance also requires review. Co-located distinct source IDs remain distinct. Snapshot completeness is still review_required, so absence is not official retirement. History is retained.

A reviewed CTP reactivation must verify source ID continuity and authoritative location, record reviewer/evidence as an additional audit event, and update the current pointer and display projection together in a controlled transaction. There is intentionally no automatic acceptance or public mutation endpoint. Do not directly toggle active without rebuilding the projection.

## SQLite development / safe local validation

`prisma/schema.prisma` and `prisma/migrations/` remain SQLite. The new migration adds canonical tables and constraints and removes the projection's invalid dependency on weekly calendars. Migrate only a disposable copy after running duplicate/FK checks. It rebuilds the legacy trip table using SQLite's migration procedure; never run it unreviewed against the sole source snapshot. Prisma schema validation alone cannot verify the SQL CHECK constraints; use migrations, not db push.

The importer defaults to audit/dry-run. `--apply` requires an explicit existing local SQLite target and refuses the repository snapshot, including symlink aliases. `src/lib/storage/sqlite.ts` owns file URL/path behavior. `environment.ts` has explicit provider handling but defaults to SQLite: PostgreSQL URLs cannot silently change the generated client. The historical projection adapter under storage/ is used only by regression tests, not import CLIs.

SQLite-only diagnostics remain in verify-ctp.ts (PRAGMAs/EXPLAIN QUERY PLAN), verify-import-snapshot.py, local-copy preparation and migration SQL. Replace them with PostgreSQL catalog/constraint checks, row/content comparisons and EXPLAIN (ANALYZE, BUFFERS) during staging. No application routing query uses sqlite_master or PRAGMAs. Remove SQLite output-file tracing only during actual provider cutover.

## PostgreSQL staging artifacts and mapping

`prisma/postgresql/schema.prisma` now uses an explicitly exported `DATABASE_URL` and a separate generated staging client. The reviewed SQL has been promoted to `prisma/postgresql/migrations/20260924000000_initial_transport/migration.sql`, with a PostgreSQL-only migration lock; `initial-draft.sql` is a historical pointer. No PostgreSQL connection or migration has been executed. Follow [the staging connection runbook](POSTGRESQL_STAGING_CONNECTION.md) for generation, read-only diagnostics, guarded initial migration, and catalog verification. The application and root migration history remain SQLite. Initial staging preserves text JSON/date columns for application parity; native conversions below are a later reviewed step.

| SQLite source | PostgreSQL staging mapping |
|---|---|
| canonical opaque string IDs | text PKs, preserve exactly; do not cast cuid values to UUID |
| legacy autoincrement integers | integer/identity sequences; reset sequences above imported maxima |
| Boolean 0/1 | validate then native boolean |
| YYYYMMDD calendar/exception strings | initially retain validated text; later DATE with explicit YYYYMMDD parse and date-aware application codecs |
| DateTime values | inspect SQLite storage classes; milliseconds/text to UTC instants, then timestamptz; never assume seconds |
| metadata/payload/manifest JSON strings | initially text; later validated JSONB with client types/codecs updated; retain raw export artifacts/checksums for byte-level provenance |
| GTFS arrival/departure | canonical integer service-day seconds, nullable when permitted; never SQL TIME, which loses >24-hour semantics |
| projected CTP X/Y | retain original decimal text and EPSG:5367; no float-rounding identity |
| WGS84 lat/lon | double precision, finite/range validation; nullable only where GTFS allows |
| old StopRoute | regenerate DISTINCT stop/route membership from all trips + stop_times; sequence is not route direction/order |
| legacy GTFS/CTP snapshot | import through reviewed publishers to produce canonical history and projections; no blind raw-table restore |

For first staging, generate the isolated PostgreSQL client using the connection runbook and keep the current text codecs. Diagnostics use this client without switching the application. A future data-loading task still needs a PostgreSQL-specific import entry point rather than weakening the local-only guard. Configure application pooling when the application itself migrates. Connection behavior must be verified in staging, not inferred from SQLite tests.

All FKs, compound unique keys and SQL CHECK constraints in the draft must survive promotion into a new PostgreSQL migration history. Never reuse migration_lock.toml or replay SQLite DDL. Include fare tables, branding/company data and all user tables in the inventory even when currently empty. Fare canonical normalization is future work: source fare files currently survive in the version manifest and the active compatibility tables; no history is discarded.

## Geographic and index plan

Retain B-tree uniqueness on source keys, source/checksum, dataset/external ID, dataset/internal ID, trip/sequence, shape/sequence and service/date. Index FK paths, service/date lookups, source-scoped identifiers and administrative province/canton codes. Do not add a standalone source index to a single-source table without a query need. Inspect actual query plans before adding covering indexes.

Plan PostGIS separately; it is NOT installed/configured by this change. Keep EPSG:4326 and longitude-first point construction. Use geography(Point,4326) for metre-based ST_DWithin/distance, or geometry(Point,4326) plus an explicitly indexed geography expression where appropriate. GiST supports spatial lookup. Use bounding boxes to narrow map queries and exact radius predicates for nearest stops. A normal (lat,lon) B-tree is not a spatial-index equivalent. Keep point geometry synchronized with source lat/lon through generated expressions or a reviewed write contract. Do not transform source EPSG:5367 by simply relabeling the SRID. Consider trigram indexing for measured substring-search workloads.

## Exact future Neon cutover sequence (not executed)

1. Review this change, shape-resolution/CSV reports and local validation evidence. Archive/checksum the original SQLite and CTP exports. Confirm authoritative GTFS freshness/rights and current calendar exceptions. No production connection is needed for this review.
2. Authorize and create an isolated Neon staging project/database. Do not point the live application at it. Select the pinned PostgreSQL/Prisma versions and credentials with minimal privileges.
3. Follow the staging connection runbook: validate/generate the isolated client, test connectivity, apply the separate PostgreSQL migration history to empty staging, and verify catalog constraints. Enable PostGIS only in a separately approved spatial step.
4. In a later data-loading task, wire application provider configuration and a staging-only importer; verify publication locking/retries. Keep JSON/date text codecs initially. Replace SQLite verification adapters and case-sensitive search assumptions deliberately.
5. Load the corrected GTFS source and prepared CTP data through staged publishers. Preserve source checksums, 42 quarantines, 816 ambiguous districts and original evidence. Copy supplementary/user records through explicit typed transforms. Reset legacy integer sequences. Never synthesize the absent 26 shapes.
6. Require zero broken FKs/duplicate keys/dangling shapes; compare canonical and projected counts/content and every stop-route pair. Exercise failed-import rollback, version activation, exception-only calendars, loop trips, CTP movement/absence and reconciliation review on PostgreSQL itself.
7. Run all API/smoke/build tests against staging, including geography, search case behavior, pool limits, cold starts and realistic concurrent load. Pin API readers to version/repeatable-read snapshots or schedule publication maintenance windows. PostgreSQL execution/performance is not established by the offline draft.
8. Rehearse a fresh staging restore and rollback. Keep the prior provider, database and application build available. For future production cutover, obtain separate authorization, freeze imports/writes, reconcile final checksums, migrate, smoke-test, then switch application configuration. Never dual-write without a defined consistency protocol.
9. If cutover validation fails, return application configuration to the untouched prior database/build; retain failed staging/run evidence. Do not delete or mutate the old database as rollback.

## Routing boundaries

Membership now queries trips/stop_times directly, so a stale StopRoute cache cannot hide INT009/R101. Publication also derives all 122 stop-route pairs, covering every direction/trip. Repeated-stop selection evaluates ordered occurrences after the requested departure time in direct and transfer legs. Costa Rica timezone and calendar exceptions remain explicit.

The local planner supports today's service day only. Values beyond 24:00 are preserved, but early-morning requests do not search yesterday's service day, and next-day transfer service is not synthesized. Frequencies, continuous pickup/drop-off and time interpolation are not advertised as supported; publication rejects unsupported local-planner feeds separately from Schedule errors. Use a suitably configured OTP feed for those capabilities. All these limitations predate any provider change and remain explicit staging acceptance criteria.

References: [GTFS Schedule](https://gtfs.org/documentation/schedule/reference/), [Neon Prisma guide](https://neon.com/docs/guides/prisma), [Neon PostGIS](https://neon.com/docs/extensions/postgis). Recheck provider-version-specific instructions before executing the future cutover.
