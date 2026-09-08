# RutaTica release-readiness review — 2026-09-08

**Recommendation: not ready for release for San Carlos / the northern zone. Score: 5/10.**

No commit, push, deployment, migration or GTFS import was performed. The tracked SQLite database is unchanged. Review started from a clean working tree.

## Release blockers found

1. **Required geographic coverage is absent.** The bundled database has 88 stops and 72 trips. Its coordinate extent is latitude 9.842–10.2134, longitude -84.34–-83.0365. A read-only API query within 10 km of Ciudad Quesada returns no stops. Only Guápiles appears north of latitude 10.2. A validated northern-zone feed or tested OTP deployment is required.
2. Production builds previously bypassed TypeScript errors. Active code included incompatible Prisma model calls, a misspelled route type, nullable-map type mismatches and React ref/type errors. Corrected; historical backup trees no longer participate in application checks.
3. Legacy diagnostics exposed Prisma internals; personal endpoints trusted caller-selected user IDs and allowed cross-user deletion. Diagnostics now return 404. Personal APIs return explicit 503 until authenticated identity and durable storage exist; no current `src` consumers were found.
4. SQLite deployment configuration lacked explicit tracing and its example URL resolved to the wrong directory. Corrected schema-relative URL resolution, tracing and Prisma generation. Actual Vercel deployment remains unverified.
5. Route-card selection replaced GTFS geometry with automobile routing. Corrected. Server-local timezone and midnight default could select the wrong service/departure. Corrected.

## Implemented changes

### Mobile UX and accessibility

- Results occupy a bottom panel on small screens, with scrolling, close and reopen controls. Desktop retains the side panel.
- Route cards support keyboard activation and expose selection state. Nested controls retain their own keyboard behavior.
- Search fields have accessible names and 44 px height; clear controls have names and larger targets. Suggestions no longer steal focus on hover, and obsolete search responses are discarded.
- Visible focus styling, reduced-motion CSS and dynamic viewport handling. Failure boundary offers retry without displaying internal exceptions.
- A search using current location requires an actual GPS position; it no longer silently starts from San José when location is unavailable.
- Explicit estimate notice and “Tarifa no disponible” when a price is unknown. API failure is distinguished from no transit results; direct driving alternatives are not listed as buses.

### Routing, maps and GTFS/OTP

- Leaflet module loads client-side. Long routes are no longer forcibly zoomed to level 12. ResizeObserver invalidates map size without panning.
- Selected route geometry is retained; selected-route stops receive prominent markers. Fixed mismatched stop API response fields.
- Local calendar evaluation and OTP date/time use America/Costa_Rica. Exceptions add/remove services, including services only present in calendar_dates.
- Validate GTFS time strings, sequence direction and prohibited pickup/drop-off. Include walking access when determining whether a departure is reachable. No wrapping to a past departure as if it were upcoming.
- Clip shapes with interpolated shape_dist_traveled endpoints when usable, with existing proximity clipping as fallback. Distances are measured geometrically in km, not inferred from undocumented GTFS units.
- OTP invalid response structures/polylines, failures and timeout fall back safely; log reason categories without payloads or endpoint credentials. OTP runs before the local calendar query.
- Importer updates changed exception types and returns failure status when errors occur. Removed an unused invalid Prisma query. Retired incompatible demo seeding explicitly.

### API/security and performance

- Shared finite/range validation for coordinates, radius, pagination and duplicate/oversized parameter values.
- Generic public error messages. Diagnostic details are not returned to clients. Download allowlist and own-property check remain; asynchronous reads handle missing files and I/O failure safely.
- Nearby stop search filters by spatial bounds before distance sorting, instead of scanning only the first 500 stop IDs.
- Legacy search/nearby use current GTFS models; company filtering is applied to the database query.
- Legacy planner delegates in-process instead of fetching its own host. Network helper timeouts bound waiting. Location cache is capped at 200 entries.
- Prisma client is reused per process; regenerated before build. Public assets total approximately 1.8 MB. No dependency expansion or full monitoring platform.

## Verification

Tests run without external OTP or writes to the application database.

| Check | Result |
|---|---|
| `npm run typecheck` | PASS, exit 0 |
| `npm run lint` | PASS, zero reported issues |
| `npm test` | PASS, 10 tests, zero failures |
| `prisma validate` | PASS, schema valid |
| Prisma generation (`prebuild`) | PASS, client 6.19.3 |
| Default Turbopack build | BLOCKED by environment, see below |
| `npm run build -- --webpack` | PASS, exit 0; compilation, TypeScript, 19 pages and tracing completed |
| `git diff --check` | PASS |
| Database diff/integrity | Unchanged; quick_check OK; no FK violations |
| Mobile browser | BLOCKED; no usable screenshot |

Raw final output: `docs/RELEASE_VERIFICATION.txt`.

- Regression suite: **10 passed** — timezone boundary, calendar additions/removals/expiry, malformed and extended GTFS times, no past-departure wrap, geometry clipping/distance units, query abuse, download traversal/prototype keys, OTP error/invalid/empty responses and polylines, SQLite URL resolution.
- Representative local route smoke: 200, five GTFS-local options, finite positive durations and finite nonnegative distances, approximately 1.6 seconds in this environment. One option has seven shape points; others use the explicitly approximate stop-geometry fallback. This is not a load test.
- Read-only API smoke: `/api/stops` 200 (2 results), `/api/nearest-stop` 200 (9), `/api/routes` 200 (2), `/api/routes/search` 200 (15), `/api/routes/nearby` 200 (15). Northern-zone `/api/best-route`: 200 with zero results. Invalid coordinates: 400.
- SQLite `quick_check`: `ok`; `foreign_key_check`: zero violations. Calendars end 2026-12-31. This does not certify actual operator schedules.
- Default `npm run build` / Turbopack: failed in restricted environment (Google Fonts access, then internal CSS worker port binding). Retried with external approval; port restriction persisted. Do not treat this as a successful default build.
- Build tracing inspection: database present in `/api/stops`, `/api/best-route` and `/api/download` traces; DOCX present in download trace; `.next/standalone/db/custom.db` exists. Actual Vercel execution remains untested.
- Webpack production build compiled and generated 19 pages successfully; final run includes regenerated Prisma and is reported below.
- Firefox headless mobile capture attempted at 390×844 with permission, but Snap mount namespace/framebuffer errors prevented a usable capture. Temporary browser/server stopped. **No visual/hydration/fullscreen/keyboard E2E certification.** No screenshots from earlier work are reused as evidence.
- Tracked sensitive-name scan found only `.env.example`; no secrets were added. This is not a complete historical secret audit. Active runtime code/config was checked for development-machine paths.

## Remaining known issues / release gates

- **Dependency drift:** installed Next.js is 16.3.4 and Prisma is 6.19.3, while `bun.lock` records Next.js 16.1.3 and Prisma 6.19.2. Verification here uses installed dependencies. A clean frozen-lockfile install and build must pass before release; no dependency upgrade or lockfile rewrite was performed. Error recovery uses the compatible `reset` callback.
- Supply and validate San Carlos/northern-zone GTFS coverage. Verify operator schedules, fares, dates and representative routes; current calendars expire at year end.
- Validate actual Vercel function tracing, database availability, environment variables, cold-start latency and OTP deployment/schema. SQLite here is a read-only snapshot, not durable user storage.
- Run real mobile/browser checks at 320, 360, 390 and 430 px, including open results, soft keyboard, fullscreen, focus, selected stops and network failures. Automated browser validation was blocked.
- Public Nominatim/OSRM/Overpass/tile dependencies require production service/policy/capacity review. Autocomplete still uses public Nominatim directly. OSRM foot profile on the public server is not certified pedestrian routing. Do not advertise turn-by-turn pedestrian safety.
- Local routing does not search the previous service day's after-midnight trips. Transfers use stop geometry; shape-less/repeated-stop loops remain approximate. Initial waiting is excluded from local duration. No realtime delay guarantee.
- Local planner still performs repeated trip/stop queries and caps transfer candidates; load-test with the full intended feed. Request cancellation across concurrent route selections, OTP body-size limits and deployment-level rate limiting need further hardening.
- Importer is not an atomic full-feed replacement; missing-data validation, calendar_dates-only feed import and complete multi-direction StopRoute reconstruction still require staging work. Never run against the sole production copy.
- Favorites/history/settings remain explicitly unavailable until authentication/persistence are designed. No migration was performed. Archived scripts/backups/logs remain in the repository and should receive a separate cleanup/security audit.

## Files changed

- `.env.example`
- `BITACORA_CAMBIOS.md`
- `BITACORA_DESARROLLO.md`
- `docs/OPEN_TRIP_PLANNER.md`
- `docs/POSTGIS_MIGRATION_PROPOSAL.md`
- `docs/RELEASE_READINESS.md`
- `docs/RELEASE_VERIFICATION.txt`
- `eslint.config.mjs`
- `next.config.ts`
- `package.json`
- `prisma/seed.ts`
- `scripts/import-gtfs.ts`
- `src/app/api/best-route/route.ts`
- `src/app/api/companies/route.ts`
- `src/app/api/download/route.ts`
- `src/app/api/fare/[routeId]/route.ts`
- `src/app/api/favorites/[id]/route.ts`
- `src/app/api/favorites/route.ts`
- `src/app/api/history/route.ts`
- `src/app/api/locations/search/route.ts`
- `src/app/api/nearest-stop/route.ts`
- `src/app/api/routes/nearby/route.ts`
- `src/app/api/routes/plan/route.ts`
- `src/app/api/routes/route.ts`
- `src/app/api/routes/search/route.ts`
- `src/app/api/settings/route.ts`
- `src/app/api/shape/[shapeId]/route.ts`
- `src/app/api/stops/route.ts`
- `src/app/api/test2/route.ts`
- `src/app/api/test3/route.ts`
- `src/app/api/trip/[tripId]/route.ts`
- `src/app/error.tsx`
- `src/app/globals.css`
- `src/app/page.tsx`
- `src/components/location-autocomplete.tsx`
- `src/components/map.tsx`
- `src/components/ui/carousel.tsx`
- `src/hooks/use-mobile.ts`
- `src/lib/api-validation.ts`
- `src/lib/db.ts`
- `src/lib/environment.ts`
- `src/lib/otp-client.ts`
- `src/lib/service-date.ts`
- `src/lib/spatial.ts`
- `src/lib/time-utils.ts`
- `tests/release.test.ts`
- `tsconfig.json`
