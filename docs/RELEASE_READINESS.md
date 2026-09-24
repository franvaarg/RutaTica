## Migration preparation — 2026-09-23

These changes prepare an isolated PostgreSQL/Neon staging exercise, not production deployment. No Neon connection was made. The repository SQLite snapshot is protected and unchanged; validation uses a disposable copy. See [migration plan](POSTGRESQL_MIGRATION_PLAN.md) and [local validation evidence](MIGRATION_PREPARATION_VALIDATION.md).

Implemented: strict GTFS audit; documented removal of 26 absent optional shapes affecting 50 trips; all-trip stop-route derivation; canonical version-scoped identities/FKs; calendar-dates-only services; atomic publication/failure tracking; CTP observation history/quarantine/current-state policy; persisted reviewable reconciliation; repeated-stop selection; separate offline PostgreSQL schema/SQL.

Remaining production gates: PostgreSQL execution tests, verification of publication locks/retries, provider-specific connection/search/load checks, reader snapshot consistency during feed publication, current authoritative schedules/holiday exceptions, and optional PostGIS rollout. Source completeness remains review_required. These are explicit future staging/cutover tasks; no production readiness or nationwide schedule coverage is claimed.

# RutaTica release-readiness — 2026-09-19

This report covers the accumulated local working tree and a disposable SQLite backup. No commit, push, deployment, or production database modification was performed. Existing changes present at the start were preserved.

## 1. CTP import totals

38,699 normalized input records; **38,657 inserted**, zero updated on first import; **42 quarantined for missing required values** (source descriptions). Zero conflicting source IDs. The duplicate audit verified 16,596 occurrences in 7,935 groups, representing 8,661 extra source rows already collapsed by extraction. Imported data retains source provenance and original coordinates. Import uses batches of 50 in one atomic transaction; regression tests include rollback after the first batch succeeds.

## 2. Idempotency and GTFS preservation

Second import: **0 inserted, 0 updated, 38,657 unchanged**. Full CTP table content, IDs and timestamps retain SHA-256 `8f91e9c6df94cb1517257088527bae77d07b1ffde9ee7e4b89bc1e77318f401d`. All 19 pre-existing tables retain identical content hashes. GTFS remains 88 stops, 18 routes, 72 trips and 396 stop-time rows. SQLite integrity and foreign-key checks pass after both imports.

## 3–5. Nationwide, province and canton coverage

All seven source provinces and all 82 source-enumerated cantons contain imported CTP stops. See [complete province and canton tables](NATIONWIDE_COVERAGE.md) and [machine-readable canton counts](NATIONWIDE_COVERAGE.csv). Imported province totals: Alajuela 10,609; Cartago 4,316; Guanacaste 3,632; Heredia 3,151; Limón 3,804; Puntarenas 4,313; San José 8,832.

GTFS administrative counts are explicitly **inferred** from unique CTP canton labels within 50 m: Alajuela 1, Cartago 1, Heredia 1, San José 11; 74 GTFS stops remain unclassified. Eleven cantons have both sources under this method; 71 have CTP but no classified GTFS. No GTFS-only or zero-usable-data canton was identified in the source enumeration. This does not prove GTFS absence or current administrative completeness.

CTP bounds: latitude 8.3478333896–11.2117425146, longitude −85.8513971146–−82.6136446429. No imported coordinates fail finite/range/mainland-envelope checks. Exact national-border containment and administrative point-in-polygon classification require validated boundary polygons; saved selector rectangles cannot supply that evidence.

## 6–7. Overlaps and incomplete coverage

At 50 m, nine one-to-one likely overlaps and 12 ambiguous pairs were reported; **no merges or route associations** were created. 38,636 CTP stops and 74 GTFS stops have no proximity candidate.

The extractor finished with `review_required`: nationwide WFS count 123,176 versus canton sum 123,171, a five-feature discrepancy. Viewer stops and WFS features are different counts and must not be equated. Forty-two unnamed records remain quarantined. The source enumerates 82 cantons; administrative completeness is not independently certified. Northern-zone mapped stops do not supply missing schedules: Ciudad Quesada has 58 imported CTP stops within 1 km and no GTFS stops within 25 km.

## 8. Routing

Forward and reverse representative GTFS routes passed local smoke checks (two forward options, one reverse). GTFS controls trips, schedules, sequences, calendars and route associations. CTP-only planning returns no fabricated itinerary and explains the missing route/schedule data. Route adapters preserve routing source, unknown fares and geometry availability. GTFS audit has zero structural errors but 26 referenced shapes are absent. Approximate stop geometry is not an actual road or pedestrian path.

## 9. OTP

Configured OTP is attempted first; absent, failed, malformed, oversized, empty or walking-only results fall back to GTFS. Response streaming is capped at 2 MiB with an eight-second timeout. Fixture tests cover valid responses and fallback. No live OTP deployment, graph or GraphQL schema was certified; local smoke explicitly disabled OTP.

## 10–12. Mobile, map and search

Map queries use visible bounds, debounce, request cancellation, zoom gating and at most 100 markers with truncation/error notices. CTP markers identify their source and missing route/schedule availability. Marker names are accessible. No nationwide browser payload is loaded.

Autocomplete combines bounded local/source results, offers keyboard selection and explicit external place search, cancels obsolete requests and labels CTP-only stops. Escape dismisses an open suggestion list before dismissing the navigation sheet. Route errors use an alert; the inactive notification control is labeled and disabled. Mobile route results can close/reopen and use a bounded panel. Automated browser results are recorded below.

## 13. API/security

Input validation bounds coordinates, radii, limits, offsets, identifiers, query size and repeated parameters. Download traversal and invalid API requests passed smoke tests. Import paths and CSV headers/size are constrained; malformed/conflicting records are quarantined; SQL values are parameterized. Personal endpoints remain unavailable until authenticated persistence exists. Deployment-level rate limiting, provider capacity and a live deployment security review are not certified by local tests.

## 14. Performance

93 bounded map/nearby/search probes passed across 31 actual locations in all provinces, including urban, rural, border and intercity areas. Largest payload 9,706 bytes; observed p95 877.34 ms, maximum 1,208.86 ms. These are local sequential measurements, not concurrent production load certification. Existing geographic indexes and added trip/shape/route-association indexes support filtered access. First import SQL phase 37.023 s; full import/audit 97.199 s. Snapshot 97,280,000 bytes; peak import RSS 585,216 KiB. Parsing and audit work still occur on an idempotent rerun.

## 15–16. Browser, build and test evidence

Final results are appended after the ordered checks finish. Reproduction: [NATIONWIDE_VALIDATION.md](NATIONWIDE_VALIDATION.md). Detailed local logs are under `/tmp/rutatica-release`; import audits and complete national JSON are under ignored `data/ctp_reports`.

## 17. Files changed

The final working-tree inventory is appended below. It includes pre-existing release changes, not only this continuation.

## 18. Remaining limitations

- Source WFS reconciliation and exact administrative/border classification remain unresolved data gates.
- Nationwide CTP locations do not provide nationwide GTFS service; no transport data was invented to fill gaps.
- Missing GTFS shapes, operator schedule/fare verification and calendar freshness remain data limitations.
- Live OTP compatibility and deployment behavior remain unverified; no deployment was authorized.
- Local routing still lacks previous-service-day after-midnight lookup; transfer/walking geometry is approximate and initial waiting is excluded from local duration.
- Real-device soft keyboards, screen-reader usability and external provider reliability need device/operational verification beyond headless checks.
- The imported snapshot is disposable and is not the unchanged bundled application database. Packaging an approved imported snapshot is a separate release step.

## 19–20. Release assessment

Final score and recommendation are recorded after validation below. A national transport-planning release cannot claim schedule coverage from physical CTP stop coverage.
