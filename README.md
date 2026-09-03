# Fishing Logbook

A private, self-hosted fishing journal for recording trips and learning which locations, conditions, people, and gear produce fish. The repository includes a browser application backed by Flask and a local-first Expo app for iOS, Android, and the web.

Fishing Logbook works for general trip records and has deeper support for trolling: timed spread changes, landed and lost fish, presentation details, speed, depth, direction, water conditions, and reusable rod, reel, lure, and flasher libraries.

## Highlights

- Record trips, catches, lost fish, anglers, notes, launches, fishing spots, structures, and media.
- Group trips into expeditions and review trip summaries, timelines, maps, reports, and shareable views.
- Manage lures, flashers, rods, reels, combos, line history, tackle boxes, and an optional boat layout.
- Track trolling setups over time and connect each fish to the line and presentation that produced it.
- Compare performance through filters, charts, personal bests, leaderboards, and data-quality diagnostics.
- Use weather, marine, astronomy, Great Lakes bathymetry, temperature, and thermocline data where available.
- Import and export portable ZIP archives containing both logbook data and media.
- Keep photos and videos on your own server or in the mobile app's local storage.

## Choose a Client

### Self-hosted web app

The primary web app is a Flask server with Jinja templates, plain JavaScript, and CSS. It stores normalized logbook data in SQLite and uploaded media on the local filesystem. There is no frontend package install or build step for normal server use.

Use this client for the complete desktop experience, server-backed media, detailed analytics, expeditions, gallery management, and deployment on a trusted private network.

### Expo mobile app

The `mobile/` project is a React Native, Expo Router, and TypeScript client with local SQLite storage. It supports field-oriented trip capture, an active-trip workflow, catches and lost fish, trolling setup changes, camera/library media, GPS, maps, analytics, gear, settings, and archive import/export.

The mobile app is currently standalone: it does not continuously sync with the Flask server. Move data between clients with a Fishing Logbook archive. Importing an archive replaces local data only when you choose that action.

## Run the Web App

### Windows

Install Python 3.11 or newer, then run:

```powershell
.\scripts\run-local.ps1
```

The script creates `.venv`, installs missing dependencies, and starts the app at [http://127.0.0.1:8080](http://127.0.0.1:8080).

### Manual setup

```sh
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
python -m pip install -r requirements.txt
python server.py
```

The server binds to `127.0.0.1:8080` by default. Set `HOST` and `PORT` to override those values.

### Docker Compose

```sh
docker compose up --build -d
```

Open [http://127.0.0.1](http://127.0.0.1). Compose publishes host port `80` by default; set `APP_PORT` to use another port. Application data is mounted from `./data` unless `FISH_DATA_DIR` points to a different host directory.

For example:

```sh
APP_PORT=8081 FISH_DATA_DIR=/srv/fishing-logbook-data docker compose up --build -d
```

At first container startup, a session secret is generated in `data/.secret_key`. Set `SECRET_KEY` yourself if you manage secrets externally.

## Run the Mobile App

Install Node.js, then:

```sh
cd mobile
npm install
npm start
```

Expo will offer targets for Android, iOS, and the browser. You can also start a target directly:

```sh
npm run android
npm run ios
npm run web
```

Native maps, camera, media-library access, location, and SQLite behavior should be verified with an Expo development build or a physical device. Platform SDK requirements still apply for local iOS and Android builds.

## Data, Backups, and Portability

The web app stores private runtime data under:

```text
data/logbook.sqlite3
data/uploads/
data/.secret_key
```

These paths are ignored by Git. Keep the database and upload tree together when making server backups.

Use the archive export for a portable backup or to transfer data between the web and mobile clients. A Fishing Logbook archive contains:

```text
manifest.json
logbook.json
media/<category>/...
```

Legacy JSON imports remain supported. A plain JSON export or database copy does not include uploaded media.

The root `index.html` opens the generated `standalone.html` fallback when used directly from disk. That mode persists to browser storage and does not provide server uploads or server proxy features. Edit files under `templates/` and regenerate the fallback with `python scripts/build-standalone.py`; do not edit `standalone.html` by hand.

## Security Notes

This project is designed for one trusted operator or household. It does not provide accounts, authentication, roles, or per-record authorization. CSRF protection guards browser write requests, but it does not prevent another client with network access from reading the logbook.

Do not expose the Flask or Gunicorn service directly to the public internet. Keep it on a trusted network or place it behind an authenticated HTTPS reverse proxy. Fishing records may contain precise locations and personal media, so treat the entire `data/` directory as private.

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
```

Check the mobile TypeScript project separately:

```sh
cd mobile
npm run typecheck
```

The GitLab pipeline also compiles the Python sources, smoke-tests the Flask server, validates Docker Compose, and can deploy the default branch after all checks pass.

## Project Layout

```text
backend/             Storage, media, security, weather, and lake services
data/                Local database and uploaded media (not committed)
docs/                Architecture, API, data model, deployment, and planning docs
mobile/              Expo/React Native mobile client
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

## License

Licensed under the [Apache License 2.0](LICENSE).
