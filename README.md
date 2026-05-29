# Selfhostable Fishing Logbook

Selfhostable Fishing Logbook is a private fishing journal for anglers who want their past trips to help answer the next-trip question: what should I run, where, and under what conditions?

It has a special emphasis on trolling, with support for full spread details, setup timelines, lures, flashers, depths, speed, direction, FOW, landed fish, and lost fish. It also works as a general fishing logbook for other methods, so you can keep all of your trips, catches, gear, photos, locations, weather, maps, and pattern notes in one self-hosted app.

The app runs locally with a small Flask backend and stores your private logbook in `data/logbook.json`. Photos and videos stay on your machine under `data/uploads/`.

## Why Use It

- Learn which fishing patterns keep showing up across trips.
- Record trolling details without forcing every fishing trip into a trolling-only workflow.
- Keep landed catches separate from lost fish, so missed bites still count as pattern evidence without inflating catch totals.
- Track reusable gear, locations, launches, people, trip notes, media, weather, maps, and stats in one place.
- Self-host your data instead of putting fishing spots, photos, and trip history into a cloud service.

## Features

### Trip Log

- Add, edit, search, filter, sort, and delete trips.
- Track date, waterbody, optional launch, start and end time, hours, target species, method, trip intent, rating, weather notes, wind, water temperature, clarity, structure, people, and trip notes.
- Save repeat waterbodies and launches with map coordinates.
- Save people so trips and catches can be tied back to who was fishing.
- Manage your own dropdown values for species, methods, weather tags, clarity, setup labels, gear types, directions, and other fishing-specific fields.
- Use locally stored JSON, with browser localStorage fallback when opening the app directly without the server.

### Trolling Workflow

- Build a setup timeline for trolling spreads.
- Track each setup line by side, label, presentation, lure, optional flasher, start/end time, and change note.
- Mark the deepest downrigger when that matters to the pattern.
- Tie catches and lost fish back to the setup line that produced them.
- Record trolling-specific fish context such as speed, direction, FOW, ball depth, line behind board, estimated lure depth, dipsey setting, line out, and estimated depth.
- Review trip summaries with setup timelines and a trolling spread diagram.

### Catches And Lost Fish

- Log landed fish individually with species, angler, released/kept status, length, weight, time, depth, lure, flasher, notes, and media.
- Log lost fish separately with possible species, setup, speed, depth, FOW, direction, and notes.
- Attach photos and videos to catches.
- Add manual GPS coordinates to catches or use GPS coordinates from JPEG photo metadata when available.
- Use catch GPS points in map views and catch-time weather lookups.

### Gear Library

- Save reusable lures with name, type, brand/model, color, notes, and image.
- Save reusable flashers with name, type, brand/model, color, notes, and image.
- Save rods, reels, and combos for more complete gear tracking.
- Reuse saved gear in trip setup rows and catch records.
- Browse and edit gear from the Gear view.

### Photos, Videos, And Gallery

- Upload trip note media, catch media, lure images, flasher images, rod images, reel images, and queue media.
- Use the Photo Queue as a phone-friendly holding area, then assign media to a trip, catch, lure, flasher, rod, or reel later.
- Generate smaller image previews for faster browsing.
- Extract JPEG capture time and GPS metadata when available.
- Browse uploaded media in the Gallery view.

### Weather, Sun, Moon, And Marine Conditions

- Fetch historical weather for trips that have a saved waterbody or launch pin.
- Use launch coordinates when selected, otherwise waterbody coordinates.
- Use catch GPS coordinates for catch-time weather when available.
- Store trip-window weather based on the actual trip start/end time, including overnight trips.
- Store nearest-hour weather for catches with logged catch times.
- Include temperature, precipitation, wind, gusts, pressure, humidity, cloud cover, weather codes, sunshine, daylight, and marine wave data where available.
- Include sunrise, sunset, moonrise, moonset, moon phase, and moon illumination.
- Keep the hand-entered trip weather tag separate from API weather so your fishing notes stay yours.
- Choose display/input units for depth, distance, trolling speed, wind, pressure, air temperature, water temperature, precipitation, wave height, fish length, and fish weight.

### Stats, Patterns, And Maps

- See dashboard totals for trips, fish caught, hours fished, waterbodies, catch rate, pounds per hour, most caught species, and top lures.
- Use advanced stats for species, locations, methods, people, months, trip ratings, weather, clarity, lures, flashers, lure/flasher combos, release ratio, lost-fish percentage, and catch rates.
- Use trolling analytics for direction, line side, setup type, deepest-rigger results, FOW, depth, and setup performance.
- Include or exclude lost fish in selected stats where useful.
- Use Pattern Finder to rank repeatable patterns by species, gear, setup, FOW, depth, speed, time, clarity, weather, wind, pressure, cloud cover, air temperature, front tag, moon window, and month.
- View GPS-tagged catches, trip photos, and videos on maps, with links out to Google Maps.

### Import, Export, And Backups

- Export your logbook as JSON from the Data menu.
- Import a JSON logbook and have it normalized before use.
- Keep private data out of git by default.
- Use included backup scripts for local and optional NAS backups.

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

The normal local run binds to `127.0.0.1`, which is intended for use on the same machine.

## Run With Docker

From this folder:

```sh
./launch-container.sh
```

Then open:

```text
http://127.0.0.1
```

The launcher rebuilds the image, replaces the existing Selfhostable Fishing Logbook container, starts it in the background, and refreshes the nightly backup cron job.

You can also run Docker Compose directly:

```sh
docker compose up --build -d
```

To stop it:

```sh
docker compose down
```

Docker mounts your local data folder into the container:

```text
./data:/app/data
```

Your private database and uploads remain on your machine and are not baked into the Docker image.

## Data And Backups

The private logbook database lives at:

```text
data/logbook.json
```

Uploaded media lives at:

```text
data/uploads/
```

`data/logbook.json` is intentionally ignored by git so private fishing spots, people, notes, catches, and media metadata do not get committed.

Use the Data menu in the app to export or import the JSON logbook. The JSON export includes trips, gear, people, setup entries, catches, lost fish, and media metadata. It does not include the uploaded media files themselves, so a full manual backup should include both:

```text
data/logbook.json
data/uploads/
```

## Nightly NAS Backups

The repo includes optional host-side scripts for nightly backups:

- `scripts/backup-logbook.sh`
- `scripts/install-nightly-backup.sh`

The backup script creates monthly JSON backups, syncs uploaded media, stores local copies in `backups/`, and can copy the backup set to a NAS path.

Example SSH/SCP setup:

```sh
ssh-keygen -t ed25519 -f ~/.ssh/fishing_logbook_backup -C "fishing-logbook-backup"
ssh-copy-id -i ~/.ssh/fishing_logbook_backup.pub Default@192.168.3.30
./scripts/install-nightly-backup.sh Default@192.168.3.30:/volume1/FishingBackups
```

Run a backup immediately:

```sh
NAS_BACKUP_TARGET='Default@192.168.3.30:/volume1/FishingBackups' SSH_KEY_PATH="$HOME/.ssh/fishing_logbook_backup" ./scripts/backup-logbook.sh
```

Backup logs are written to:

```text
backups/backup.log
```

## Self-Hosting Notes

This app currently has no login system. It is designed as a private, one-person or household logbook.

If you expose it beyond your own machine or trusted home network, put it behind your normal password-protected reverse proxy first. Docker runs with `HOST=0.0.0.0` so it can receive traffic through the published container port.

## Project Layout

- `server.py`: Flask routes and static serving.
- `backend/`: logbook storage, media handling, defaults, and weather helpers.
- `static/js/`: plain browser JavaScript.
- `static/css/`: app styling.
- `data/`: private logbook JSON and local uploads.

## Contributing

PRs are welcome. Feature requests are welcome too, especially ideas that make the logbook more useful for real fishing workflows across trolling and other fishing methods.

## Privacy Notes

Selfhostable Fishing Logbook is built around local ownership of your data:

- Your saved logbook lives in `data/logbook.json`.
- Your uploaded photos and videos live in `data/uploads/`.
- Exports are plain JSON.
- Uploaded media files are not included in JSON exports, so back up the uploads folder separately.
- The app can call external weather, astronomy, and map tile services when those features are used.
