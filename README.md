# Fishing Logbook

A private, self-hosted fishing journal for recording trips and learning which locations, conditions, people, and gear produce fish. The repository includes a browser application backed by Flask and a local-first Expo app for iOS, Android, and the web.

Fishing Logbook works for general trip records and has deeper support for trolling: timed spread changes, landed and lost fish, presentation details, speed, depth, direction, water conditions, and reusable rod, reel, lure, and flasher libraries.

## Highlights

- Record trips, catches, lost fish, anglers, notes, launches, fishing spots, structures, and media.
- Group trips into expeditions and review trip summaries, timelines, maps, reports, and shareable views.
- Maintain reusable preparation checklists.
- Manage lures, flashers, rods, reels, combos, and line history.
- Track trolling setups over time and connect each fish to the line and presentation that produced it.
- Compare performance through filters, charts, personal bests, and leaderboards.
- Use weather, marine, astronomy, Great Lakes bathymetry, temperature, and thermocline data where available.
- Import and export portable ZIP archives containing both logbook data and media.
- Keep photos and videos on your own server or in the mobile app's local storage.

## Choose a Client

### Self-hosted web app

The primary web app is a Flask server with Jinja templates, plain JavaScript, and CSS. It stores normalized logbook data in SQLite and uploaded media on the local filesystem. There is no frontend package install or build step for normal server use.

Use this client for the complete desktop experience, server-backed media, detailed analytics, expeditions, gallery management, and deployment on a trusted private network.

### Expo mobile app

The Expo mobile app is maintained in the adjacent `..\Mobile` repository. It is an Expo SDK 57, React Native, Expo Router, and TypeScript client with local-first SQLite storage on native platforms and IndexedDB on web. It supports field-oriented trip capture, an active-trip workflow, Quick Catch and Quick Lost, trolling setup changes, camera/library media, GPS, maps, weather/depth enrichment, analytics, personal bests, gear and line history, saved setups, expeditions, spots, checklists, wiki, settings, and archive/shared-trip import/export.

The mobile app is currently standalone: it does not continuously sync with the Flask server. Its local SQLite tables are projections of a canonical logbook document, not a database schema that can be copied directly from `data/logbook.sqlite3`. Move complete data between clients with a Fishing Logbook archive; importing an archive replaces local data only after explicit confirmation. A Shared Trip ZIP is a separate versioned one-trip transfer, not a full backup.

## Desktop / Mobile Compatibility

The web and mobile clients share a document and archive contract, not a live database or sync protocol.

- The only supported runtime document is `schemaVersion: 2` with the complete v2 collection set and stable string IDs.
- A full transfer archive is `archiveVersion: 2`, format `fishing-logbook-archive`, with `manifest.json`, `logbook.json`, and referenced media under `media/<category>/<filename>`.
- Mobile validates the archive version and requires every referenced media file. Do not rename collection keys, change media paths/categories, or remove additive properties without updating both clients.
- Preserve cross-client fields such as `settings.defaultPeople`, units, time format, chop ranges, saved setups, trip `idleHours`/`pausedAt`/`liveStatus`/`liveEvents`, setup-line `personId` and timing, catch/lost `setupLineId`, `personId`, `quantity`, spot/location/photo/depth/weather fields, and complete reel `lineHistory`.
- Do not treat desktop `PUT /api/logbook` as mobile synchronization. It is a whole-document replacement and remains last-write-wins; the mobile offline strategy calls for a future authenticated, revisioned, entity-level sync protocol.

When a desktop change touches the shared schema, archive behavior, media references, or an overlapping workflow, update the adjacent mobile client in the same change or document the intentional boundary. Check the mobile types/validator, archive or shared-trip code, relevant tests, and parity documentation. The mobile verification commands are:

```powershell
Set-Location ..\Mobile
npm run typecheck
npm test
npm run build:web
```

Before writing mobile code, follow the exact Expo SDK 57 documentation linked in `..\Mobile\AGENTS.md`. Native camera, GPS, maps, filesystem, and SQLite behavior still needs a development-build or physical-device check; web export alone cannot prove it.

## Run the Web App

### Windows

Install Python 3.13 and Node.js 22 or newer, then run:

```powershell
.\scripts\run-local.ps1
```

The script creates `.venv`, installs the pinned dependencies when they change,
and starts the app at [http://127.0.0.1:8080](http://127.0.0.1:8080). Use
`-Reset` only when the environment is genuinely broken.

### Manual setup

```sh
py -3.13 -m venv .venv
# Windows:
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe server.py
# macOS/Linux: use Python 3.13 and .venv/bin/python
```

The server binds to `127.0.0.1:8080` by default. Set `HOST` and `PORT` to override those values.

### Docker Compose

```sh
docker compose up --build -d
```

Open [http://127.0.0.1](http://127.0.0.1) or the host's configured DNS name. Compose publishes the application on host port `80` by default so trusted LAN DNS names such as `fishing.logbook` can reach it. Set `APP_PORT` to use another port. The app has no built-in authentication, so do not expose it to an untrusted network. Application data is mounted from `./data` unless `FISH_DATA_DIR` points to a different host directory.

For example:

```sh
APP_PORT=8081 FISH_DATA_DIR=/srv/fishing-logbook-data docker compose up --build -d
```

At first container startup, a session secret is generated in `data/.secret_key`. Set `SECRET_KEY` yourself if you manage secrets externally.

### Browser tests

Install the JavaScript test dependencies and Chromium once:

```powershell
npm ci
npm run playwright:install
```

Run the full local validation suite with:

```powershell
.\scripts\doctor.ps1
.\scripts\check.ps1
```

Browser tests start an isolated Flask process with a temporary
`FISH_DATA_DIR`; they do not use the personal `data/` directory.

## Data, Backups, and Portability

The web app stores private runtime data under:

```text
data/logbook.sqlite3
data/uploads/
data/.secret_key
```

These paths are ignored by Git. Keep the database and upload tree together when making server backups.

Use the archive export for a complete backup or to transfer data between the web and mobile clients. The archive is the cross-client boundary and contains:

```text
manifest.json
logbook.json
media/<category>/...
```

Runtime imports and the API accept canonical v2 data only. Convert an older SQLite database or desktop/mobile ZIP archive offline with `py scripts/migrate_logbook_v2.py --database <path> --apply` or `py scripts/migrate_logbook_v2.py --archive <path> --apply`; the script creates a backup, removes legacy fields, validates the v2 document, and rewrites the archive/database before the app opens it. Use `--media-root <uploads>` when an older archive references local media that is stored beside it rather than inside the ZIP.

The root `index.html` opens the generated `standalone.html` fallback when used directly from disk. That mode persists to browser storage and does not provide server uploads or server proxy features. Edit files under `templates/` and regenerate the fallback with `python scripts/build-standalone.py`; do not edit `standalone.html` by hand.

## Security Notes

This project is designed for one trusted operator or household. It does not provide accounts, authentication, roles, or per-record authorization. CSRF protection guards browser write requests, but it does not prevent another client with network access from reading the logbook.

Do not expose the Flask or Gunicorn service directly to the public internet. Keep it on a trusted network or place it behind an authenticated HTTPS reverse proxy. Production uses Nginx HTTP Basic Auth with a bcrypt password file, and the Docker port is bound to loopback only so the proxy cannot be bypassed. Fishing records may contain precise locations and personal media, so treat the entire `data/` directory as private.

Whole-logbook updates are transactional in SQLite but remain last-write-wins. Avoid editing from multiple web sessions at the same time.

## External Services

Depending on the feature and client, Fishing Logbook may contact:

- Open-Meteo forecast, historical weather, and marine APIs.
- SunriseSunset.io for astronomy data.
- Esri Canada services for Great Lakes bathymetry.
- Great Lakes temperature and thermocline data providers configured by the backend.
- Leaflet CDNs and OpenStreetMap tile services in the web app, plus the native platform map provider in the mobile app.

Environmental enrichment is best-effort. A provider failure does not need to prevent a trip or catch from being saved.

## Development and Tests

Run the backend and browser test suites from the repository root:

```sh
python -m pytest tests -v
node --test tests/*.test.js
python scripts/build-standalone.py --check
npm run test:e2e
```

The GitLab pipeline also compiles the Python sources, runs the Python and Node
test suites, smoke-tests the Flask server, validates Docker Compose, and can
deploy the default branch after all checks pass.

## Project Layout

```text
backend/             Storage, media, security, weather, and lake services
cloud/worker/        Versioned D1/R2 API and Cloudflare deployment configuration
data/                Local database and uploaded media (not committed)
docs/                Architecture, API, data model, deployment, and planning docs
scripts/             Local launcher and standalone build tools
static/              Web JavaScript, CSS, vendor assets, and images
templates/           Jinja application shell, views, and dialogs
tests/               Python and Node test suites
server.py            Flask application and HTTP routes
```

Useful reference documents:

- [Development guide](docs/DEVELOPMENT.md)
- [Architecture](docs/ARCHITECTURE.md)
- [API reference](docs/API.md)
- [Data model](docs/DATA_MODEL.md)
- [Deployment guide](docs/DEPLOYMENT.md)
- [Mobile client README](../Mobile/README.md) (when the sibling repository is checked out)
- [Mobile database field audit](../Mobile/docs/MOBILE_DATABASE_FIELDS.md)
- [Mobile desktop parity audit](../Mobile/docs/MOBILE_DESKTOP_PARITY_AUDIT.md)
- [Mobile feature matrix](../Mobile/docs/MOBILE_FEATURE_MATRIX.md)
- [Mobile offline strategy](../Mobile/docs/OFFLINE_STRATEGY.md)

## License

Licensed under the [Apache License 2.0](LICENSE).
