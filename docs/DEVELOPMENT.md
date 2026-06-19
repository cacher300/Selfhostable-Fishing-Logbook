# Development Guide

## Prerequisites and Run Commands

Python 3.12 is used by the container. Runtime dependencies are Flask and Pillow.

```powershell
py -m pip install -r requirements.txt
py server.py
```

Open `http://127.0.0.1:8080`. The server creates `data/logbook.json` from defaults when started through `main()` and the file is missing.

Docker:

```sh
docker compose up --build -d
docker compose down
```

`launch-container.sh` is more opinionated: it removes current/legacy named containers, attempts to install the backup cron job, rebuilds, and starts Compose. Review `NAS_BACKUP_TARGET` before using it.

## Repository Map

- `server.py`: Flask routes and static serving.
- `backend/backend_config.py`: paths, defaults, units, media and proxy constants.
- `backend/logbook_store.py`: normalization, validation, JSON I/O.
- `backend/media_service.py`: uploads, previews, gallery, reference/orphan handling.
- `backend/weather_service.py`: proxy and weather reduction helpers.
- `index.html`: all screens, dialogs, and templates.
- `static/js/`: global browser scripts by concern.
- `static/css/styles.css`: all styling and responsive rules.
- `scripts/`: backup and cron installation.

## Change Discipline

The UI and scripts are tightly coupled by selectors. When adding or renaming a field, update:

1. Markup/template and unit labels.
2. DOM population and method-specific visibility.
3. Form hydration and collection.
4. Browser and backend defaults/normalization when applicable.
5. Summary, map, analytics, import/export, and reference cleanup behavior.
6. Data/API/feature documentation.

Keep landed and lost fish separate. Setup rows describe timed gear configuration; fish-specific speed and depth belong on catch/lost records. Trolling fish should resolve through `setupLineId` when possible.

## Data Safety

Do not commit `data/logbook.json`, uploads, backups, or personal media. Before testing destructive workflows, copy both the JSON file and upload tree. JSON export alone is not a complete media backup.

The server performs whole-document writes. Avoid running multiple writers against the same file. A failed server PUT can leave localStorage ahead of server state because the browser writes localStorage first.

## Manual Verification Checklist

There is no formal test suite. For a behavior change, verify proportionally:

- Start the Flask app and load all six routes directly.
- Create/edit/delete a normal trip and a trolling trip.
- Change setup lines and confirm catch selectors, summaries, spread, timeline, and stats.
- Verify landed totals do not count lost fish.
- Upload/queue/claim/remove image and video samples; inspect gallery and orphan cleanup.
- Test manual catch GPS and supported metadata GPS on both maps.
- Test mapped/unmapped trips and weather-service failure; trip save must still complete.
- Change unit/time/predefined/chop settings and inspect forms and reports.
- Export, import into a disposable copy, and verify normalization.
- Exercise narrow-screen navigation/dialog/table behavior.

Useful static checks:

```powershell
py -m compileall server.py backend
rg -n "TODO|FIXME|deprecated|tripTypes|patterns" . -g "!.venv/**" -g "!data/**"
```

The Flask URL map can be inspected with:

```powershell
py -c "from server import app; print(app.url_map)"
```

## External Integration Testing

Weather, marine, astronomy, Leaflet CDN, and map tiles require network access. Use mapped coordinates and dates accepted by the provider. Confirm both forecast and historical branches and expect marine data to be unavailable for some inland coordinates.

## Environment Variables

Application: `HOST` (default `127.0.0.1`), `PORT` (default `8080`).

Backup: `DATA_FILE`, `UPLOADS_DIR`, `LOCAL_BACKUP_DIR`, `NAS_BACKUP_TARGET`, `SSH_KEY_PATH`, `KEEP_MONTHLY_BACKUPS`. Launcher also supports `APP_URL`, `CONTAINER_NAME`, and `LEGACY_CONTAINER_NAME`.

## Adding an API Route

Keep route handling in `server.py` and concern logic in `backend/`. Validate all externally supplied paths, categories, coordinates, dates, and payload types. Remember that every current route is unauthenticated; adding a mutating endpoint increases the trusted-network attack surface.
