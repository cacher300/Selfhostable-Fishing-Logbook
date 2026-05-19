# Trolling Logbook

A self-hosted fishing logbook built for anglers who want to learn from their trolling trips, not just record that they went fishing.

This app is for tracking the details that actually matter after a day on the water: which line fired, what lure and flasher were on it, how deep it was running, how fast you were moving, what FOW you were over, what direction you were trolling, who was fishing, what fish were landed, what fish were lost, and what pattern is worth trying next time.

It runs locally in your browser with a small Flask backend and stores your private logbook in `data/logbook.json`. Photos and videos stay on your machine under `data/uploads/`.

## What It Helps With

- Rebuild productive trolling patterns from past trips.
- Compare lures, flashers, lure/flasher combos, depths, speed ranges, FOW ranges, trolling direction, and setup types.
- Separate landed fish from lost fish so missed bites still teach you something without inflating catch totals.
- Track full trolling spreads, not just individual catches.
- Keep trip notes, fishfinder shots, rig photos, catch photos, launch photos, and GPS-tagged catch locations together.
- See what worked by species, season, location, water clarity, weather, person, and trip rating.

## Main Features

### Trip Log

- Add, edit, delete, search, filter, and sort trips.
- Track date, waterbody, start/end time, target species, method, intent, rating, weather, wind, water temperature, clarity, structure, and notes.
- Save repeat locations and people so future trips are faster to enter.
- Mark trips as `Serious` or `Experimental`.
- Rate trips as `Bad`, `Good`, or `Outstanding`.
- Supported methods include Trolling, Casting, Jigging, Fly Fishing, Bait Fishing, Ice Fishing, and Shore Fishing.

### Trolling-Specific Logging

For trolling trips, the app exposes extra fields for:

- Setup line: port, center, starboard, or a custom line label.
- Presentation: downrigger, cheater, planer board / leadcore, or dipsey diver.
- Lure and optional flasher.
- Speed.
- Trolling direction.
- FOW caught.
- Ball depth.
- Line behind board.
- Estimated lure depth.
- Dipsey plate setting.
- Line out.
- Estimated depth.

Trip summaries include a trolling spread diagram so you can see the spread as a whole and connect catches/lost fish back to the setup line that produced them.

### Catches And Lost Fish

- Log each landed fish individually.
- Track species, person, released/kept status, length, weight, time, water depth, depth down, lure/flasher, notes, and trolling details.
- Attach photos or videos to individual catches.
- Add manual GPS coordinates or let the app use GPS coordinates from catch photo metadata.
- Log lost fish separately with possible species, setup, depth, speed, FOW, and notes.

### Gear Library

- Save reusable lures with name, type, brand/model, color, notes, and image.
- Save reusable flashers with name, type, brand/model, color, notes, and image.
- Reuse saved gear in trip setup timelines and catch records.
- Edit or delete saved lures and flashers from the Gear view.

### Photos, Videos, And GPS

- Upload trip note media, catch media, lure images, flasher images, and raw queue media.
- Use the Photo Queue as a phone dump, then assign media later to a trip, catch, lure, or flasher.
- Generate lower-resolution image previews for faster browsing.
- Extract JPEG capture time and GPS metadata when available.
- Ignore one configured home/launch-adjacent GPS location to avoid polluting catch maps.
- Browse all uploaded media in the Gallery view.

### Stats, Patterns, And Maps

- Dashboard totals for trips, fish caught, hours fished, waterbodies, catch rate, and pounds/hour.
- Advanced stats for outcomes, catch/release ratio, percent lost, lure performance, flasher performance, lure/flasher combos, species, locations, methods, people, months, ratings, weather, water clarity, and trip intent.
- Trolling analytics for direction, setup type, FOW range, exact FOW, trolling speed, and depth down.
- Pattern Finder ranks repeatable patterns by species, gear, setup, FOW, depth, speed, time, clarity, weather, and month.
- Map view plots GPS-tagged catches with species filters and links out to Google Maps.

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

The normal local run binds to `127.0.0.1`, which is meant for use on the same machine.

## Run With Docker

From this folder:

```sh
./launch-container.sh
```

Then open:

```text
http://127.0.0.1
```

The launcher rebuilds the image, replaces the existing Fishing Logbook container, starts it in the background, and refreshes the nightly backup cron job.

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

Use the Data menu in the app to export or import the JSON logbook. The JSON export includes trips, lures, flashers, people, setup entries, catches, lost fish, and media metadata. It does not include the uploaded media files themselves, so a full manual backup should include both:

```text
data/logbook.json
data/uploads/
```

## Nightly NAS Backups

The repo includes host-side scripts for nightly backups:

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

- `server.py` serves the app, reads/writes the JSON logbook, handles uploads, creates image previews, manages the photo queue, and exposes gallery/export endpoints.
- `index.html` contains the app shell, views, dialogs, and row templates.
- `styles.css` contains the layout and visual design.
- `app-state.js` defines defaults, shared state, normalization, load/save behavior, media helpers, and DOM references.
- `app.js` wires events, routing between views, dialogs, imports/exports, and initialization.
- `trip-editor.js` handles trip forms, catches, lost fish, people, setup timeline rows, validation, and save/delete behavior.
- `trolling-spread.js` resolves setup-line relationships and trolling-specific labels.
- `maps-summary.js` renders trip summaries, maps, timelines, and trolling spread diagrams.
- `stats.js` computes advanced stats and trolling analytics.
- `patterns.js` ranks repeatable fishing patterns.
- `photos.js` handles uploads, EXIF metadata, GPS extraction, catch photos, trip photos, and the photo queue.
- `gear.js` handles lures, flashers, previews, and gear library editing.
- `gallery.js` renders uploaded media.
- `dashboard.js` renders the trip list, filters, sidebar stats, and high-level dashboard.
- `data-transfer.js` handles JSON import/export.
- `data/logbook.example.json` is a safe starter data shape.

## Good Future Upgrades

- Authentication or a simple password gate for remote use.
- SQLite storage with migrations and automatic dated backups.
- CSV export for spreadsheet analysis.
- More charting for seasonal, water-temperature, and gear-performance trends.
- Map pins for launches, productive trolling passes, and waypoint notes.
- Catch-photo editing and captions per catch photo.
