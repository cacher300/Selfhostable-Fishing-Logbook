# Selfhostable Fishing Logbook

A private, self-hosted fishing journal built to answer one practical question: **what pattern should I run next time?** It supports general fishing records and adds a detailed trolling workflow for spread changes, landed fish, lost fish, depth, speed, direction, FOW, reusable gear, weather, maps, and performance analysis.

## What It Does

- Logs trips, people, waterbodies, launches, conditions, notes, catches, and lost fish.
- Records timed trolling setup changes and ties fish back to the producing setup line.
- Manages lures, flashers, rods, reels, rod/reel combos, and reel line history.
- Stores photos and videos locally, including a phone-first Photo Queue.
- Extracts supported photo/video capture time and GPS metadata for maps and timelines.
- Enriches mapped trips with Open-Meteo weather/marine data and SunriseSunset.io sun/moon data.
- Reports dashboard totals and detailed fishing, trolling, gear, condition, and diagnostic analytics.
- Imports/exports JSON.

The complete audited feature list is in [docs/FEATURE_INVENTORY.md](docs/FEATURE_INVENTORY.md). Architecture, data, API, development, gaps, and roadmap documentation live under `docs/`.

## Technology and Storage

- Backend: Flask/Python.
- Frontend: plain HTML, CSS, and JavaScript; no build step.
- Persistence: `data/logbook.sqlite3`.
- Uploads: `data/uploads/<category>/` with JSON metadata sidecars and image previews.
- Direct-file fallback: opening `index.html` uses browser localStorage, but uploads and external-data proxies require Flask.

SQLite stores the normalized logbook in transactionally updated collections. The API and JSON export format remain unchanged; compatibility normalization runs whenever it is read or written.

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
The app generates a secure runtime secret automatically. Set `SECRET_KEY` only if you want
sessions to remain valid across application restarts.

## Data and Export

Private data is intentionally ignored by git:

```text
data/logbook.json
data/logbook.sqlite3
data/uploads/
```

JSON export contains the logbook document and media references, not uploaded binary files. To migrate an existing JSON logbook, run `py scripts/import_json_to_sqlite.py`; use `--replace` only when intentionally replacing an existing SQLite logbook.

## External Services

When relevant features are used, the server/browser contacts:

- Open-Meteo archive, forecast, and marine APIs.
- SunriseSunset.io.
- Leaflet assets and OpenStreetMap map tiles loaded from public CDNs/services.

Failed weather, marine, or astronomy requests do not prevent a trip from being saved.

## Important Limitations

- There are no accounts, roles, or login controls; anyone who can reach the app can use it.
- Rate limiting is per process and direct client IP; it is only a lightweight guard for local use.
- The API still replaces the complete logbook document, so concurrent edits can still be last-write-wins even though each SQLite write is transactional.
- “Baits” currently means the lure library; natural/live bait has no dedicated data model.
- No dedicated personal-best, year-over-year comparison, notification, or Pattern Finder screen exists.

See [docs/GAP_ANALYSIS.md](docs/GAP_ANALYSIS.md) and [docs/ROADMAP.md](docs/ROADMAP.md) for verified gaps and recommended priorities.
