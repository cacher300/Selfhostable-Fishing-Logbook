# Selfhostable Fishing Logbook

A private, self-hosted fishing journal built to answer one practical question: **what pattern should I run next time?** It supports general fishing records and adds a detailed trolling workflow for spread changes, landed fish, lost fish, depth, speed, direction, FOW, reusable gear, weather, maps, and performance analysis.

The application is a single-user tool. It has no login, account, role, or permission system; do not expose it directly to an untrusted network.

## What It Does

- Logs trips, people, waterbodies, launches, conditions, notes, catches, and lost fish.
- Records timed trolling setup changes and ties fish back to the producing setup line.
- Manages lures, flashers, rods, reels, rod/reel combos, and reel line history.
- Stores photos and videos locally, including a phone-first Photo Queue.
- Extracts supported photo/video capture time and GPS metadata for maps and timelines.
- Enriches mapped trips with Open-Meteo weather/marine data and SunriseSunset.io sun/moon data.
- Reports dashboard totals and detailed fishing, trolling, gear, condition, and diagnostic analytics.
- Imports/exports JSON and includes host-side local/NAS backup scripts.

The complete audited feature list is in [docs/FEATURE_INVENTORY.md](docs/FEATURE_INVENTORY.md). Architecture, data, API, development, gaps, and roadmap documentation live under `docs/`.

## Technology and Storage

- Backend: Flask/Python.
- Frontend: plain HTML, CSS, and JavaScript; no build step.
- Persistence: `data/logbook.json`.
- Uploads: `data/uploads/<category>/` with JSON metadata sidecars and image previews.
- Direct-file fallback: opening `index.html` uses browser localStorage, but uploads and external-data proxies require Flask.

There is no relational database or migration framework. Compatibility normalization runs whenever the JSON document is read or written.

## Run Locally

```powershell
py -m pip install -r requirements.txt
py server.py
```

Open `http://127.0.0.1:8080`. Configure `HOST` and `PORT` with environment variables if needed.

## Run with Docker

```sh
./launch-container.sh
```

Open `http://127.0.0.1`. Docker Compose publishes host port 80 to container port 8080 and mounts `./data:/app/data`.

The launcher also attempts to install the included 03:00 nightly backup job when `crontab` is available. Review its NAS defaults before running it.

## Data, Export, and Backup

Private data is intentionally ignored by git:

```text
data/logbook.json
data/uploads/
backups/
```

JSON export contains the logbook document and media references, not uploaded binary files. A complete backup must include both `data/logbook.json` and `data/uploads/`.

Run a host-side backup manually:

```sh
NAS_BACKUP_TARGET='/mnt/nas/fishing-logbook' ./scripts/backup-logbook.sh
```

The target may also be an SSH destination such as `user@host:/path`. `KEEP_MONTHLY_BACKUPS` defaults to 3; `SSH_KEY_PATH`, `DATA_FILE`, `UPLOADS_DIR`, and `LOCAL_BACKUP_DIR` are configurable.

## External Services

When relevant features are used, the server/browser contacts:

- Open-Meteo archive, forecast, and marine APIs.
- SunriseSunset.io.
- Leaflet assets and OpenStreetMap map tiles loaded from public CDNs/services.

Failed weather, marine, or astronomy requests do not prevent a trip from being saved.

## Important Limitations

- No authentication, authorization, CSRF protection, or multi-user isolation.
- No formal automated test suite.
- JSON writes are whole-document and not transactional.
- Upload size is not capped in application code.
- “Baits” currently means the lure library; natural/live bait has no dedicated data model.
- No dedicated personal-best, year-over-year comparison, notification, or Pattern Finder screen exists.

See [docs/GAP_ANALYSIS.md](docs/GAP_ANALYSIS.md) and [docs/ROADMAP.md](docs/ROADMAP.md) for verified gaps and recommended priorities.
