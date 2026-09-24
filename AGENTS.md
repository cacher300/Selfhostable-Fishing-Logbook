# Fishing Logbook: Codex Working Agreement

## Project shape

This repository is the self-hosted web client for Fishing Logbook:

- Flask routes and startup live in `server.py`.
- Concern-specific backend code lives in `backend/`.
- `templates/` contains the server-rendered shell, views, dialogs, and row templates.
- `static/js/` contains classic global scripts loaded in dependency order; there is no frontend build or module bundler.
- `static/css/` contains the web styles.
- `cloud/worker/` is a separate Cloudflare D1/R2 Worker with its own `package.json` and tests.
- The mobile Expo client is maintained in the adjacent `..\Mobile` repository.
  Treat it as a companion client, not an unrelated project: it reads/writes the
  same canonical v2 document through archives, while its native SQLite tables
  are only local projections.

The application is for one trusted operator or household. There are no accounts,
roles, permissions, or application-level authorization checks. Never recommend
exposing the Flask service directly to the public internet. Production relies on
an authenticated HTTPS reverse proxy, with Docker bound to a loopback port.

Read the relevant document before making a cross-cutting change:

- `docs/DEVELOPMENT.md`: change discipline, data safety, verification, and run commands.
- `docs/ARCHITECTURE.md`: request/state flows and component ownership.
- `docs/DATA_MODEL.md`: canonical schema and field semantics.
- `docs/API.md`: route contracts, validation, CSRF, and media behavior.
- `docs/FEATURE_INVENTORY.md`: implemented, partial, hidden, and absent features.
- `docs/GAP_ANALYSIS.md`: verified gaps and security limitations.
- `docs/ROADMAP.md`: future priorities; do not implement roadmap items implicitly.
- `docs/DEPLOYMENT.md`: production, backups, GitLab deployment, D1, and R2 boundaries.
- `docs/V2_LOCAL_HANDOFF.md`: local database/archive handoff rules.
- `..\Mobile\README.md`: mobile commands and client boundary.
- `..\Mobile\docs\MOBILE_DATABASE_FIELDS.md`: desktop/mobile field coverage.
- `..\Mobile\docs\MOBILE_DESKTOP_PARITY_AUDIT.md`: verified behavior parity and intentional differences.
- `..\Mobile\docs\MOBILE_FEATURE_MATRIX.md`: mobile scope and staged features.
- `..\Mobile\docs\OFFLINE_STRATEGY.md`: local-first storage, media, and future sync requirements.
- `PRODUCT.md`: product purpose, trusted-operator context, visual roles, and accessibility commitments.
- `.impeccable/`: active UI briefs; read the relevant brief before changing a surface covered by it.

## Runtime and commands

Use Python 3.13 for this repository. Do not use an arbitrary system `python`.
The project launcher owns the virtual environment and installs the pinned
requirements:

```powershell
.\scripts\run-local.ps1
```

Use `-Reset` only when the environment is genuinely broken:

```powershell
.\scripts\run-local.ps1 -Reset
```

The application listens on `http://127.0.0.1:8080` by default. `HOST` and
`PORT` may override the bind address. `FISH_DATA_DIR` selects an alternate
runtime data directory and is required for disposable browser-test data.

Node.js 22 or newer is used for JavaScript tests and browser tests:

```powershell
npm ci
npm run playwright:install
```

Useful verification commands:

```powershell
.\scripts\doctor.ps1
.\scripts\check.ps1
```

The check script runs Python compilation, Python tests, Node tests, the
generated-standalone freshness check, and the Playwright smoke suite. Run the
narrowest relevant test during iteration, then run the full check before handing
off a change.

## Source of truth and generated output

- `templates/` and `static/` are the editable web sources.
- `standalone.html` is generated output. Never edit it by hand. After changing
  templates or frontend assets, run `.venv\Scripts\python.exe scripts/build-standalone.py`;
  use `.venv\Scripts\python.exe scripts/build-standalone.py --check` to verify
  freshness.
- `index.html` is only the direct-file bootstrap for the generated fallback.
  The fallback uses localStorage but is not full offline parity: uploads,
  weather proxies, gallery APIs, and server behavior require Flask.
- HTML IDs/classes and classic-script load order are effectively internal APIs.
  Renaming one requires tracing every selector, renderer, event handler, form
  collector, and test that uses it.

## Data and schema rules

- Schema version 2 is the only runtime format. The complete v2 document is the
  API boundary and is validated on reads, writes, and imports.
- Preserve unknown/additive v2 properties and cross-client fields. Do not add
  runtime reshaping or silently migrate data during a request.
- Keep landed catches and lost fish separate. Lost fish use `possibleSpecies`
  and are never counted as landed fish.
- Setup rows describe timed gear configuration. Fish-specific speed, depth, and
  catch context belong on catch/lost-fish records. Trolling fish should resolve
  through `setupLineId` when possible.
- Preserve existing `catch.quantity`, `gearUsed.personId`, additive properties,
  mobile live-event fields, and all reel `lineHistory` entries when editing.
- IDs and references are string-based and are primarily maintained by UI
  behavior. Deletion must preserve the existing location guard and gear cleanup.
- Typed fishing measurements are persisted as strings with unit preferences in
  `settings.units`; unit changes must convert persisted numeric values in the
  same save operation and leave free-form text unchanged.

## Data safety

Treat `data/`, uploads, backups, local archives, names, locations, and photos as
private user data:

- Do not inspect, modify, delete, or commit personal runtime data unless the user
  explicitly asks for that exact operation.
- Use a temporary `FISH_DATA_DIR` for browser tests and destructive workflows.
- A database and its matching `uploads/` tree must be backed up/restored
  together. The portable v2 archive is the transfer boundary, not a SQLite
  snapshot.
- A Shared Trip ZIP is a one-trip snapshot, not a whole-logbook backup.
- Legacy conversion is an explicit offline operation through
  `scripts/migrate_logbook_v2.py`; never run it during server startup or a
  request.
- Do not use a local/mobile snapshot to replace newer production data. Stop
  writes, back up, compare, install matching database/media, and verify before
  reopening the service.

## Mobile companion and cross-client changes

The adjacent mobile client is Expo SDK 57 / React Native / TypeScript. It uses
SQLite on native platforms and IndexedDB on web, but the canonical interchange
format is the complete `schemaVersion: 2` JSON document inside an
`archiveVersion: 2` `fishing-logbook-archive` ZIP. The archive must contain
`manifest.json`, `logbook.json`, and every referenced
`media/<category>/<filename>` entry. A Shared Trip ZIP is a separate version-2,
one-trip format and is not a backup.

When changing the v2 schema, archive/media behavior, or a feature represented in
both clients, update the sibling mobile repository in the same change or state
why the boundary is intentional. Check `..\Mobile\src\domain\types.ts`,
`validate-logbook.ts`, storage archive/shared-trip code, the relevant tests, and
the mobile parity/field documentation. Preserve these especially sensitive
cross-client fields and semantics:

- `settings.defaultPeople`, units, time format, chop ranges, saved setups,
  default saved setups, private photo locations, and bathymetry calibration.
- Trip `idleHours`, `pausedAt`, `liveStatus`, `liveEvents`, coordinates, weather,
  and probe-temperature data.
- Setup-line `personId`, stable `id`, timing, gear references, rigging, and
  presentation context.
- Catch/lost `setupLineId`, `personId`, `quantity`, landed-vs-lost separation,
  spot assignment, photo/location metadata, depth/FOW fields, and weather.
- Gear quantities/media and every reel `lineHistory` entry.

Overlapping mobile workflows include offline active trips, Quick Catch/Quick
Lost, trolling setup timelines, camera/GPS capture, media queues, maps,
weather/depth enrichment, expeditions/spots, stats/personal bests, gear and
line history, saved setups, checklists, wiki, and archive/shared-trip transfer.
Do not remove or silently reshape a field used by those workflows.

For a cross-client change, run the desktop checks and, from `..\Mobile`, run:

```powershell
npm run typecheck
npm test
npm run build:web
```

Before writing mobile code, read the exact Expo SDK 57 documentation linked in
`..\Mobile\AGENTS.md`. Native camera, GPS, maps, filesystem, and SQLite changes
need a development-build or physical-device check; a web export is not enough.

## Backend and API changes

- Keep route handling in `server.py`; put storage, media, security, weather,
  bathymetry, and Great Lakes logic in the appropriate `backend/` module.
- Mutating browser requests require the session CSRF token from
  `GET /api/csrf-token` in `X-CSRF-Token`.
- Validate externally supplied paths, categories, coordinates, dates, payload
  types, and upload extensions. Preserve the referenced-media deletion guard.
- Keep API route contracts in `docs/API.md` and update tests when a contract
  changes.
- Environmental APIs, map tiles, and CDNs are best-effort/external. A provider
  failure must not prevent a valid trip from being saved.
- Do not assume authentication, rate limiting, upload-size limits, or malware
  scanning exists; these are documented gaps.

## Frontend changes and verification

Preserve the product principles from `PRODUCT.md`: keep the logbook private and
trustworthy, make recorded evidence easy to scan, preserve the path from a
summary back to its source trip, and prefer resilient data states over
decoration. Keep the established deep-navy, green-positive, blue-secondary,
muted-slate, and light/dark-theme roles. Preserve semantic headings, labels,
keyboard access, visible focus, readable contrast, and narrow-screen behavior.

For an active `.impeccable/` brief, preserve existing routes, data, filters,
view-trip actions, IDs, data attributes, control semantics, and plain
HTML/CSS/JavaScript unless the user explicitly requests a behavior change.

When adding or renaming a field, update all of the following together:

1. Template markup and unit labels.
2. DOM population and method-specific visibility.
3. Form hydration and collection.
4. Browser/backend v2 validation and canonical defaults where applicable.
5. Summary, map, analytics, import/export, and reference cleanup behavior.
6. Relevant documentation and tests.

The primary routed views are `/`, `/trips`, `/expeditions`, `/bests`, `/stats`,
`/leaderboard`, `/map`, `/gear`, `/gallery`, `/checklists`, `/wiki`, and
`/settings`. Direct routes select the initial panel; in-page navigation does
not currently provide full browser history synchronization.

Browser automation uses Node Playwright, not Python Playwright. The standard
flow is: app loads -> first meaningful screen renders -> primary navigation and
one representative control respond without page errors. Browser tests must use
the disposable test data directory and must not reuse a live server.

For behavior changes, verify proportionally: normal and trolling trips, setup
resolution, landed/lost totals, media queue/reference cleanup, locations/maps,
units/time/settings, archive import/export, routed views, and narrow screens as
applicable. External weather/marine/astronomy/NOAA behavior is environment
dependent and should be reported as such.

## Deployment and scope

- The default branch deploys automatically through GitLab after validation.
- Production data must live outside the deployment checkout.
- Never put deploy keys, API tokens, database IDs, or personal data in Git.
- The Cloudflare Worker uses D1/R2 bindings and protected CI variables; do not
  route production traffic to it or change live storage as part of an ordinary
  local change.
- Accounts, profiles, roles, notifications, moderation, feature flags, full
  PWA/offline sync, year-over-year reports, and natural/live bait are not
  implemented. Do not invent or partially implement them unless the user asks.

## Handoff standard

Before finishing:

1. Inspect `git diff` and preserve unrelated user changes.
2. Run `scripts/doctor.ps1` if setup changed.
3. Run the narrow relevant tests and then `scripts/check.ps1` when practical.
4. If the generated standalone check fails because of pre-existing frontend
   edits, report that clearly and do not overwrite unrelated work silently.
5. Summarize changed files, commands run, failures, external dependencies, and
   any remaining risk.
