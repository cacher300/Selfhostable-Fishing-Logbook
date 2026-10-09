# Development Guide

## Prerequisites and Run Commands

Python 3.13 is used by the container and local launcher. Runtime dependencies
(`requirements.txt`) are Flask, jsonschema, Pillow, `pillow-heif` for HEIC/HEIF
image handling, and gunicorn; `requirements-dev.txt` adds pytest. Node.js 22+
builds the browser bundle and runs the JavaScript and browser tests.

```powershell
.\scripts\run-local.ps1
```

Open `http://127.0.0.1:8080`. The server creates `data/logbook.sqlite3` from defaults when started through `main()` and the database is missing. If an existing database is corrupt or incompatible, startup continues in degraded mode so the app shell and archive recovery tools remain available; the original file is not overwritten by ordinary saves.

The launcher creates `.venv`, installs the pinned development requirements when
their hash changes, runs `npm ci` whenever `package-lock.json` changes, builds
the frontend bundle with `npm run build`, and starts the server with that
environment. The server refuses to start when `static/dist` has not been built
and warns when JS/CSS sources are newer than the last build. It does not silently delete an existing environment; use
`.\scripts\run-local.ps1 -Reset` when a rebuild is intentional. When running
`server.py` yourself, use the project interpreter
(`.venv\Scripts\python.exe server.py`) and build the frontend first; the server no
longer re-launches itself inside the virtual environment.

### Frontend build

The browser code is ES modules under `static/js/` (entry `static/js/main.js`) and
stylesheets under `static/css/` (entry `static/css/app.css`). esbuild bundles them,
together with Leaflet, esri-leaflet, html2canvas, and the Roboto font from npm,
into `static/dist/`:

```powershell
npm run build          # development/test bundle (state is deep-frozen to catch mutations)
npm run build:watch    # rebuild on change while developing
node scripts/build-frontend.mjs --production   # what the Docker image ships
```

`static/dist/manifest.json` maps `app.js`/`app.css` to content-hashed URLs that
the templates read through `asset_url()`; there are no hand-maintained `?v=`
strings. `static/dist/` and `standalone.html` are generated and not committed.
After a build, `py scripts/build-standalone.py` renders the direct-file fallback.

Docker:

```sh
docker compose up --build -d
docker compose down
```

`launch-container.sh` removes current/legacy named containers, rebuilds, and starts Compose. It does not run or schedule backups.

## Repository Map

- `server.py`: entry point; builds `AppConfig` from the environment and the Flask app.
- `backend/app_factory.py`, `backend/config.py`: application factory and runtime configuration.
- `backend/routes/`: HTTP blueprints (`pages`, `logbook`, `media`, `environment`).
- `backend/storage/`: `LogbookStore`/`MediaStore` interfaces with local (SQLite + disk) and cloud implementations, plus the media transaction helper.
- `backend/logbook_store.py`: v2 validation (shared schema + semantic rules). `backend/logbook_repository.py`: SQLite I/O and revisions.
- `backend/media_service.py`, `backend/archive_service.py`, `backend/shared_trip_archive.py`: media helpers, whole-logbook archives, Shared Trip ZIPs.
- `backend/weather_service.py`, `bathymetry_service.py`, `great_lakes_service.py`: environmental proxies.
- `schema/`: the shared v2 JSON Schema, constants, and canonical default document. `npm run schema:generate` regenerates `static/js/generated/` and the mobile copies under `..\Mobile\src\domain\generated`; `npm run schema:check` checks both clients when the adjacent Mobile checkout is available. GitLab runs `npm run schema:check:desktop` because its checkout contains only this repository.
- `templates/index.html` and `templates/partials/`: server-rendered shell, screens, dialogs, and row templates.
- `static/js/`: ES modules by concern. `store.js` owns every logbook change (`commit`), `actions.js` holds domain actions, `html.js` the auto-escaping `html` template tag, `router.js` history navigation, `vendor.js` third-party libraries.
- `static/css/`: styles by concern, bundled from `app.css`.
- `index.html`: direct-file bootstrap for the generated `standalone.html` fallback.

## Change Discipline

The UI and scripts are tightly coupled by selectors. When adding or renaming a field, update:

1. Markup/template and unit labels.
2. DOM population and method-specific visibility.
3. Draft binding (`data-bind`, `draft-binding.js`) and the draft normalizers (`trip-draft.js`, `gear-draft.js`, `settings-draft.js`) with their round-trip tests; forms never read controls on save.
4. The shared schema (`schema/logbook.schema.json`), semantic rules in `backend/logbook_store.py` and the generator, canonical defaults in `schema/default-logbook.json`, then `npm run schema:generate`.
5. Summary, map, analytics, import/export, and reference cleanup behavior.
6. Data/API/feature documentation.

Change logbook data only through `store.commit()` or an action in `actions.js`; never mutate `state` (ESLint and the frozen development state reject it). Build markup only with the `html` tagged template from `html.js`.

Keep landed and lost fish separate. Setup rows describe timed gear configuration; fish-specific speed and depth belong on catch/lost records. Trolling fish should resolve through `setupLineId` when possible.

## Data Safety

Do not commit `data/logbook.sqlite3`, uploads, backups, or personal media. Before testing destructive workflows, copy the database and upload tree. The portable v2 archive contains the canonical logbook document and uploaded media; it does not contain a SQLite database snapshot.

Legacy database conversion is an offline operation, never a server startup or request path:

```powershell
py scripts/migrate_logbook_v2.py --database <path-to-legacy.sqlite3>
py scripts/migrate_logbook_v2.py --database <path-to-legacy.sqlite3> --apply
py scripts/migrate_logbook_v2.py --archive <path-to-mobile-or-desktop.zip> --apply
```

The apply command creates a backup, converts known v1 fields to v2 fields, migrates date-first default trip titles to the current species/method/sequence format, validates the result, and rewrites the SQLite database or shared ZIP archive. For an older archive whose referenced files live in a neighboring upload tree, add `--media-root <uploads>` so the script can include those files. The running desktop or mobile application must receive a canonical v2 database/archive.

The browser saves the whole document (`PUT /api/logbook`) with the revision it last read, and only updates its state and localStorage cache after the server accepts the change. A save based on an outdated revision is refused with `412` instead of overwriting newer data.

## Cross-Client Changes

The adjacent `..\Mobile` repository is a companion Expo SDK 57 client. It does
not share the desktop SQLite tables or continuously synchronize with the server;
the validated v2 JSON/archive format is the compatibility boundary. When a
change touches schema fields, archive/media paths, or a workflow also present on
mobile, update the mobile types/validator, archive or shared-trip code, tests,
and parity documentation together. Preserve unknown/additive properties and
stable IDs.

Mobile verification from the sibling repository:

```powershell
Set-Location ..\Mobile
npm run typecheck
npm test
npm run build:web
```

The mobile client currently covers offline active-trip capture, Quick Catch and
Quick Lost, trolling setup timelines, camera/GPS/media capture, maps, weather
and depth enrichment, expeditions/spots, stats/personal bests, gear/line
history, saved setups, checklists, wiki, and archive/shared-trip transfer.
Behavior changes in these areas are parity changes even when the desktop UI is
the only surface edited.

## Manual Verification Checklist

`.\scripts\check.ps1` runs Python compilation and tests, schema freshness, ESLint, Node unit tests, the frontend and standalone builds, and the Playwright suite. Automated suites cover the core behavior. For a behavior change, verify proportionally:

- Start the Flask app and load all routed views directly.
- Create/edit/delete a normal trip and a trolling trip.
- Change setup lines and confirm catch selectors, summaries, spread, timeline, and stats.
- Verify landed totals do not count lost fish.
- Upload/queue/claim/remove image and video samples; inspect gallery and orphan cleanup.
- Test manual catch GPS and supported metadata GPS on both maps.
- Test mapped/unmapped trips and weather-service failure; trip save must still complete.
- Change unit/time/predefined/chop settings and inspect forms and reports.
- Export/import into a disposable copy; verify schema v2, integrity, and that valid records are not reshaped.
- Exercise narrow-screen navigation/dialog/table behavior.

Useful static checks:

```powershell
py -m compileall server.py backend
npm run lint
npm run schema:check
rg -n "TODO|FIXME|deprecated|patterns" . -g "!.venv/**" -g "!data/**" -g "!node_modules/**"
```

After changing templates or frontend code, rebuild with `npm run build` (and `py scripts/build-standalone.py` if you use the direct-file fallback).

The Flask URL map can be inspected with:

```powershell
.venv\Scripts\python.exe -c "from server import app; print(app.url_map)"
```

## External Integration Testing

Weather, marine, astronomy, and map tiles require network access (Leaflet itself is bundled). Use mapped coordinates and dates accepted by the provider. Confirm both forecast and historical branches and expect marine data to be unavailable for some inland coordinates.

## Environment Variables

Application (read once by `AppConfig.from_env()`): `HOST` (default `127.0.0.1`), `PORT` (default `8080`), `SECRET_KEY`, `SESSION_COOKIE_SECURE`, `FISH_STORAGE_BACKEND` and `FISH_CLOUD_API_URL` (cloud mode only).

`FISH_DATA_DIR` overrides the local runtime data directory. Browser tests set it
to a disposable temporary directory so they cannot touch personal logbook data.

NOAA Great Lakes data: `GREAT_LAKES_BACKGROUND_REFRESH` (default `true`; tests
and the Playwright server turn it off) keeps the map's NOAA data downloaded in
the background, and `GREAT_LAKES_CACHE_DIR` (default
`<system temp>/fishing-logbook-great-lakes`) holds that shared download cache.
The cache is disposable and is never part of a backup. See
[Great Lakes data refresh](ARCHITECTURE.md#great-lakes-data-refresh).
`GREAT_LAKES_PREPARE_WORKERS` controls drawing processes (default: up to four,
limited by available CPU cores; set `1` for minimal memory use). Workers stay
alive across preparation batches and hourly refreshes. Up to four lake models
download concurrently. Run metadata and complete animation-frame ranges are
shared on disk; temperature keeps its fitted desktop colour range, while waves
and upwelling skip range scans because their colour domains are fixed. New
value images use faster WebP encoding at quality 97, trading larger files for
less preparation time. Restart the app after changing this setting.
`GREAT_LAKES_HISTORY_URL` (default `https://greatlakestrolling.com`) is the
Great Lakes Trolling site the map's "Past 90 days" reads saved conditions from;
point it at a local copy (`http://127.0.0.1:8090`) while developing both.

Launcher: `APP_URL`, `CONTAINER_NAME`, and `LEGACY_CONTAINER_NAME`.

Browser tests use Node.js 22+ and Playwright for Chromium. Run `npm ci`,
`npm run playwright:install`, `npm run build`, and then `npm run test:e2e`. Where the
bundled Chromium cannot be downloaded, set `PLAYWRIGHT_CHANNEL=msedge` (or `chrome`)
to use an installed browser, and `PLAYWRIGHT_VIDEO=off` if ffmpeg is unavailable. The Playwright
configuration starts the Flask test server, waits for `/healthz`, captures
failure artifacts outside the repository, and never reuses an existing server.

## Adding an API Route

Add the route to the matching blueprint in `backend/routes/` and keep concern logic in `backend/`; reach storage only through `storage()` (the `LogbookStore`/`MediaStore` interfaces), never through backend-specific branches. Validate all externally supplied paths, categories, coordinates, dates, and payload types. Remember that every current route is unauthenticated; adding a mutating endpoint affects every device on the private network that can reach the app.
