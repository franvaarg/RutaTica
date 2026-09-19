# Reproducing nationwide validation

Use a disposable SQLite backup, never the only application or production database. All commands run from the repository root. The September 19 run used `/tmp/rutatica-release/validation.db`; the application database was opened read-only for copying and content hashing. No commit, push, deployment, or production migration is part of this procedure.

## Data boundary

GTFS supplies trips, schedules, sequences, calendars and route relationships. CTP supplies mapped stop locations. The importer writes only `ctp_stops`. Neither proximity reconciliation nor coverage classification creates GTFS associations. CTP-only results explicitly have `hasRouteData: false`.

The local CSV snapshot and its conflict report are inputs, not generated test fixtures. Keep their provenance and the extractor's `review_required` status. Quarantine malformed records rather than assigning names or coordinates. Current source selectors enumerate 82 cantons; that enumeration must not be presented as independent proof of present-day administrative completeness.

## Ordered checks

1. Create a SQLite backup with Python `sqlite3.Connection.backup`, recording content hashes for existing tables. Apply the reviewed CTP and query-index migrations **only to that copy**.
2. Set an absolute `DATABASE_URL=file:/tmp/rutatica-release/validation.db`.
3. Run `npx prisma validate`, `npx prisma generate`, `npm run typecheck`, `npm run lint`, and `npm test`, sequentially.
4. Run SQLite `PRAGMA integrity_check` and `PRAGMA foreign_key_check`.
5. Run `npm run import-ctp -- --apply`; retain its summary and audit files.
6. Run `python3 scripts/verify-import-snapshot.py /tmp/rutatica-release/validation.db`. This requires the original table-hash mapping in `before.json` beside the snapshot; it records `ctp-first.sha256` on the first run.
7. Repeat the import and snapshot verification. Require zero inserts/updates and identical CTP content, IDs and timestamps. Every original table must retain its original hash.
8. Run `npm run validate:nationwide`; its full report is `data/ctp_reports/nationwide.json`.
9. Run `npm run smoke:release`.
10. Start a local server with the same snapshot and an empty `OPEN_TRIP_PLANNER_URL`; run `npm run test:browser`. The optional `PLAYWRIGHT_MODULE` points to an external Playwright installation, `APP_URL` selects the local server, and `BROWSER_REPORT` stores results. Install Chromium first. No external transport response is mocked into a successful route.
11. Stop the server; run `npm run build -- --webpack`, followed by `npm run build` if the environment allows it.
12. Run `git diff --check` and `git status --short`. Do not commit automatically.

## Geographic interpretation

The audit includes all source-enumerated provinces/cantons, invalid coordinate screening, the national CTP bounding box, 50 m overlap candidates and bounded API/search probes across at least 21 real locations. Province latitude extremes and midpoints exercise geographic edges and interiors. Additional source records sample San José, San Carlos, Los Chiles, La Cruz, Talamanca, Corredores, Pérez Zeledón, Liberia, Puntarenas and Limón for urban, rural, border and intercity-area coverage. These are coverage/query tests, not proof of transport service between those places.

CTP administrative labels come from the source. GTFS stops lack administrative columns. A GTFS stop is assigned an **inferred** label only when CTP stops within 50 m agree on one province/canton. All other GTFS stops remain unclassified. This inference is not point-in-polygon classification and cannot prove a canton lacks GTFS. Saved selector polygons are rectangles, unsuitable as administrative boundaries. Likewise the coordinate envelope detects gross errors but cannot prove exact national-border containment. Validated administrative boundaries are needed to close those limitations.

Map/API payloads are bounded at 100 stops and stop autocomplete at six. The map requests viewport bounds at zoom 12 or higher, cancels obsolete requests, and explains truncation. Benchmarks are single-process local measurements, not a concurrent production load test.
