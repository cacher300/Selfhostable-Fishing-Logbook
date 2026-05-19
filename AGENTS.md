# Agent Brief: Trolling Logbook

This project is a private, self-hosted trolling-focused fishing logbook. Future changes should treat it as an angler workflow tool, not a generic CRUD demo.

## Product Purpose

The app helps a trolling angler record enough detail after each trip to answer: what pattern should I run next time?

The important domain concepts are:

- Trips have date, waterbody, hours, target species, method, intent, rating, conditions, notes, people, setup timeline, catches, lost fish, and media.
- Trolling trips need richer fields than other fishing methods: line side/label, presentation, lure, flasher, speed, direction, FOW, ball depth, line behind board, estimated lure depth, dipsey setting, line out, and estimated depth.
- Landed catches and lost fish are intentionally separate. Lost fish should contribute to lost-fish stats and pattern evidence, but not inflate landed catch totals.
- Gear is reusable. Lures and flashers live in top-level libraries and are referenced by ID from trip setup entries and catches.
- Photos and videos are local uploads. Some JPEG photos can supply capture time and GPS coordinates.
- GPS-tagged catches feed map views and trip summaries.

## Architecture

- Backend: `server.py`, a small Flask app.
- Frontend: plain HTML/CSS/JavaScript, no build step.
- Persistence: JSON file at `data/logbook.json`.
- Uploads: local files under `data/uploads/`.
- Static app entry: `index.html`.

There is no package manager, bundler, framework, or formal test suite at the moment. Keep changes simple and compatible with directly served browser scripts.

## Key Files

- `server.py`: API routes, logbook normalization/validation, uploads, preview creation, queue claim/delete, gallery, export, static serving.
- `index.html`: view markup, dialogs, and row templates. Field names/classes here are tightly coupled to JS selectors.
- `app-state.js`: default data, global state, DOM element references, normalization, load/save, media helpers.
- `app.js`: event wiring, view switching, dialog coordination, app initialization.
- `trip-editor.js`: trip form lifecycle, validation, people, catches, lost fish, setup timeline, setup-line select syncing, trip save/delete.
- `trolling-spread.js`: trolling setup-line helpers and record resolution.
- `maps-summary.js`: trip summary dialog, catch maps, timelines, trolling spread diagram.
- `stats.js`: advanced stats, trolling metrics, pattern helper functions shared by `patterns.js`.
- `patterns.js`: Fish Pattern Finder ranking and cards.
- `photos.js`: uploads, EXIF parsing, GPS extraction, photo queue, catch/trip media handling.
- `gear.js`: lure/flasher create/edit/delete and previews.
- `gallery.js`: media gallery.
- `dashboard.js`: sidebar stats, trip table, filters.
- `data-transfer.js`: JSON import/export.
- `styles.css`: all styling.

## Backend API Surface

- `GET /api/logbook`: read normalized logbook JSON.
- `PUT /api/logbook`: validate and write logbook JSON.
- `POST /api/uploads/<category>`: upload image/video to `catch-photos`, `trip-photos`, `lures`, `flashers`, or `queue`.
- `GET /api/photo-queue`: list queued media.
- `POST /api/photo-queue/claim`: move queued media into a target category.
- `DELETE /api/photo-queue/<filename>`: delete queued media.
- `GET /api/gallery?category=all|...`: list uploaded media.
- `GET /api/export`: download logbook JSON.
- `GET /uploads/<category>/<filename>` and `_previews`: serve uploaded media.

## Data Shape Notes

Top-level state normally contains:

- `species`
- `methods`
- `lureTypes`
- `flasherTypes`
- `lures`
- `flashers`
- `people`
- `locations`
- `trips`

Trip records may contain:

- `id`, `title`, `date`, `location`, `startTime`, `endTime`, `hours`
- `targetSpecies`, `method`, `intent`, `tripRating`
- `waterTemp`, `waterClarity`, `weather`, `wind`, `structure`, `notes`
- `notePhotos`
- `people`
- `gearUsed`
- `catches`
- `lostFish`

Trolling setup entries in `gearUsed` can include:

- `id`, `personId`, `startTime`, `endTime`, `changeNote`
- `side`, `lineLabel`, `lureId`, `flasherId`, `presentation`
- `speed`, `ballDepth`, `lineBehindBoard`, `estimatedLureDepth`, `dipseySetting`, `lineOut`, `estimatedDepth`
- `lureMinutes`, `flasherMinutes`

Catch records can include:

- `id`, `personId`, `species`, `released`, `length`, `weight`, `time`
- `waterDepth`, `depthDown`, `direction`, `fowCaught`, `speed`
- trolling depth/presentation fields
- either `setupLineId` for trolling catches or direct `lureId` for non-trolling catches
- `manualCoordinates`, `coordinates`, `photos`, `notes`

Lost fish records use similar context fields but normally use `possibleSpecies` and do not carry catch photos.

## Important Behaviors To Preserve

- `normalizeState` and `normalize_logbook` both force the supported method list and merge people/locations from trips.
- Opening `index.html` directly should still fall back to `localStorage`; running through Flask persists to `data/logbook.json`.
- Trolling-only controls are shown/hidden based on method.
- Catches on trolling trips should resolve through setup lines when possible.
- Setup-line selectors must update when setup timeline rows change.
- Photo Queue is designed for phone uploads first, assignment later.
- GPS coordinates come from manual catch inputs first, then from catch photo EXIF.
- The configured ignored photo location in `photos.js` is intentional and prevents one known location from polluting catch maps.
- Imported JSON should be normalized before use.

## Development Guidance

- Prefer small, plain-JS changes that fit the existing global-function pattern.
- When adding fields, update all relevant places: HTML template, form collection, form hydration, normalization/defaults, summaries, stats/patterns if applicable, and README/this brief if user-facing.
- Be careful with renamed CSS classes or IDs; most JS selectors are direct and string-based.
- Keep private data out of git. Do not commit `data/logbook.json`, uploads, backups, or personal media.
- Use `rg` for navigation.
- There is no automated test suite. For behavior changes, run the app and manually exercise the affected workflow.

## Running Locally

```powershell
py -m pip install -r requirements.txt
python server.py
```

Open `http://127.0.0.1:8080`.

For Docker:

```sh
./launch-container.sh
```

Open `http://127.0.0.1`.
