# Fishing Logbook

A private, one-person, self-hosted fishing logbook. It is a small Flask app with a browser interface and a local JSON data file, built for detailed trip notes, gear tracking, and fishing stats.

## Features

- Dashboard with trip table, quick stats including lbs/hour, search, target filter, year filter, and sorting.
- Add, edit, and delete trips.
- Track trip title, date, location, start time, end time, target species, method, intent, weather, water conditions, structure, notes, and note photos.
- Remember previously fished waterbodies for quick future location selection.
- Mark trips as Serious or Experimental.
- Current methods: Trolling, Casting, Jigging, Fly Fishing, Bait Fishing, Ice Fishing, and Shore Fishing.
- Save people once and assign catches or setup timeline entries to them on any trip method.
- Attach trip note photos such as fishfinder shots, water condition photos, ramp photos, or rig photos.
- Save reusable lures with name, type, brand/model, color, notes, and image.
- Save reusable flashers with name, type, brand/model, color, notes, and image.
- Edit or delete saved lures and flashers from the Gear page.
- Log each landed fish individually with species, whether it was released after landing, length, weight, time, water depth, estimated depth down, FOW caught, lure, notes, and trolling-specific details when relevant.
- Log lost fish separately with the same trip context without adding them to caught totals or catch rate.
- Log a setup timeline for lures that did not catch fish, lure/flasher combos, setup changes, depth changes, and time windows.
- Show flasher and trolling setup fields only for Trolling trips.
- Track trolling setups for downrigger, cheater, flatline/leadcore, dipsey diver, trolling direction, and speed.
- Advanced Stats page with an overall view or per-method filter, covering outcomes, catch/release ratio, percent lost, lbs/hour, lures, flashers, lure/flasher combos, lost fish, species, locations, trolling direction, trolling setup efficiency, 10-foot FOW ranges, trolling speed performance, depth down, methods, trip intent, people, and month patterns.
- JSON import/export is available from the Data menu for backups.

## Run Locally

From this folder:

```powershell
py -m pip install -r requirements.txt
python server.py
```

Then open:

```text
http://127.0.0.1:8080
```

## Run with Docker

From this folder:

```sh
./launch-container.sh
```

The script stops any currently running Fishing Logbook container, rebuilds the image, and starts it in the background.

Then open:

```text
http://127.0.0.1
```

Docker Compose mounts your local data folder into the container:

```text
./data:/app/data
```

That means `data/logbook.json` stays on your machine, survives container rebuilds, and is not copied into the Docker image.

Without the script, you can run:

```sh
docker compose up --build -d
```

To stop it:

```sh
docker compose down
```

Your data is saved here:

```text
data/logbook.json
```

`data/logbook.json` is intentionally ignored by git so your private fishing data, saved people, locations, notes, and photo metadata do not get pushed to GitHub.

If you ever clone the repo onto a new machine, run the app once and it will create `data/logbook.json` automatically.

## Backups

Use the Data menu in the app to export a JSON backup. The export contains trips, lures, flashers, setup timeline entries, catches, and photo/video metadata. Uploaded media files are stored separately under `data/uploads/`, with lower-resolution previews for photos in each category's `_previews/` folder for faster loading, so use the backup script below for a complete backup.

For a manual backup, copy:

```text
data/logbook.json
data/uploads/
```

## Nightly NAS Backups

The app includes a host-side backup script for the local JSON database and uploaded photos. It creates a monthly backup from `data/logbook.json`, syncs `data/uploads/`, keeps local copies in `backups/`, and can copy everything to your NAS.

If your NAS supports SSH/SCP or rsync, create a dedicated no-passphrase backup key:

```sh
ssh-keygen -t ed25519 -f ~/.ssh/fishing_logbook_backup -C "fishing-logbook-backup"
ssh-copy-id -i ~/.ssh/fishing_logbook_backup.pub Default@192.168.3.30
```

Then install the 3:00 AM nightly cron job like this:

```sh
./scripts/install-nightly-backup.sh Default@192.168.3.30:/volume1/FishingBackups
```

The script creates `logbook-YYYY-MM.json` and an `uploads/` folder, so nightly backups overwrite the current month's JSON and sync current uploaded photos. When a new month starts, a new monthly JSON backup file is created. It keeps the latest 3 monthly JSON backups and deletes older monthly backup files locally and on the NAS.

`launch-container.sh` also refreshes this nightly backup cron job automatically every time it runs, using:

```text
Default@192.168.3.30:/volume1/FishingBackups
```

Override the target or key if needed:

```sh
NAS_BACKUP_TARGET='Default@192.168.3.30:/volume1/FishingBackups' SSH_KEY_PATH="$HOME/.ssh/fishing_logbook_backup" ./launch-container.sh
```

If you mount the NAS share on the laptop instead, pass the mounted folder:

```sh
./scripts/install-nightly-backup.sh /mnt/nas/fishing-logbook-backups
```

Run a backup immediately to test it:

```sh
NAS_BACKUP_TARGET='Default@192.168.3.30:/volume1/FishingBackups' SSH_KEY_PATH="$HOME/.ssh/fishing_logbook_backup" ./scripts/backup-logbook.sh
```

Backup logs are written to:

```text
backups/backup.log
```

## Self-hosting Notes

The normal local Python run binds to `127.0.0.1`, which is best for running on the same machine. Docker runs with `HOST=0.0.0.0` so the container can receive traffic through the published port. If you expose it beyond your own machine or home network, run it behind your normal password-protected reverse-proxy setup.

This version has no login system because it is designed for one person. If you expose it beyond your own machine or home network, put it behind a password-protected reverse proxy first.

## Project Files

- `server.py` is the Flask backend that serves the app and saves JSON data.
- `requirements.txt` lists the Python backend dependencies.
- `Dockerfile` builds the self-hosted app image.
- `docker-compose.yml` runs the app with `./data` mounted for persistent local data.
- `index.html` contains the app markup and form templates.
- `styles.css` contains the layout and visual styling.
- `app.js` contains the browser-side app logic.
- `data/logbook.json` stores your fishing data.

## Good Future Upgrades

- SQLite storage with automatic dated backups.
- Password gate for remote access.
- Map pins for launches, catches, and productive areas.
- Catch-specific photo attachments.
- CSV export for spreadsheet analysis.
- Charts for seasonal patterns, water temperature, and gear performance.
