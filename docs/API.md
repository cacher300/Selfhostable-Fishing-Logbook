# HTTP API

Base URL defaults to `http://127.0.0.1:8080`. Application, API, and upload routes are unauthenticated. Mutating requests require the CSRF token returned by `GET /api/csrf-token` in the `X-CSRF-Token` header. Every Flask response includes `Cache-Control: no-store`.

## Logbook

### `GET /api/logbook`

Returns the complete normalized logbook JSON document reconstructed from SQLite. A missing or empty database returns normalized defaults; invalid stored data returns a server error.

### `PUT /api/logbook`

Replaces the complete logbook document.

Imports are recursively checked before normalization. Validation errors identify the failing JSON path. Legacy documents without `schemaVersion` are treated as version 0 and migrated to version 1; versions newer than the server supports are rejected.

Required top-level JSON types:

- Body must be an object.
- `trips`, `lures`, and `flashers` must be arrays.
- `reels`, `rods`, and `rodReelCombos`, when present, must be arrays.
- `people`, when present, must be an array.
- `spots`, when present, must be an array of uniquely identified/named records with valid coordinates and a radius from 25 through 10,000 meters.
- `expeditions`, when present, must be an array of uniquely identified records with a name and ordered ISO start/end dates.

Success: `200 {"ok": true}`. Shape failure: `400 {"error": "..."}`. Validation recursively checks JSON values and known nested record structures; see `DATA_MODEL.md`.

### `GET /api/archive`

Returns a portable ZIP archive containing the normalized logbook, manifest, and uploaded media.

### `POST /api/archive`

Imports a portable archive and replaces the current logbook and media after validation.

## Environmental Proxies

These routes accept only allowlisted query keys and use a 20-second upstream timeout.

### `GET /api/weather/archive`

Proxies Open-Meteo Historical Weather. Required: numeric `latitude`, numeric `longitude`, `start_date`, `end_date`. Allowed: `timezone`, `cell_selection`, temperature/wind/precipitation units, `hourly`, and `daily`. Defaults `timezone=auto` and `cell_selection=nearest`.

### `GET /api/weather/forecast`

Proxies Open-Meteo Forecast with the same coordinate validation and allowlist. Unlike archive, server code does not require dates; the browser supplies them.

### `GET /api/weather/marine`

Proxies Open-Meteo Marine. Coordinates are required and date fields are optional at the route level. If `hourly` is omitted, wave height, direction, and period are requested. When the nearest-cell response has no numeric wave height, the server retries without `cell_selection`.

### `GET /api/astronomy`

Proxies SunriseSunset.io. Required: numeric `lat`, numeric `lng`, and `date`. Optional: `timezone`, `time_format`; the latter defaults to `24`.

Proxy errors return an upstream status where available or `503` for network/timeout failures. The response body is `{ "error": "..." }` on handled errors.

### `GET /api/bathymetry/depth`

Looks up the nearest Great Lakes bathymetry feature for numeric `latitude` and `longitude` coordinates. The response includes `depth_m`, `depth_ft`, `lake_name`, and `depth_source`; when a feature is unavailable, the depth fields are null. The request uses the saved per-lake FOW calibration settings.

### `GET /api/great-lakes/temperature-value`

Returns a modelled Great Lakes water-temperature value for numeric `forecastHour`, `depth`, `resolution`, `latitude`, and `longitude` query values. `forecastHour` is snapped to `0`, `6`, `12`, `24`, or `48`; depth is bounded to 0–500 meters and resolution to 128–512 pixels. An optional comma-separated `models` list selects known NOAA models.

### `GET /api/great-lakes/profile`

Returns the modelled water-column temperature profile and estimated thermocline for numeric `forecastHour`, `latitude`, and `longitude`, with the same optional `models` selection.

### `GET /api/great-lakes/<layer>`

Returns the current model payload for `temperature` or `currents`. The optional `forecastHour`, `depth`, and `models` query values select the model view.

### `GET /api/great-lakes/temperature-raster`

Returns a server-rendered temperature raster payload for the optional `forecastHour`, `depth`, `resolution`, and `models` query values.

### `GET /api/great-lakes/thermocline-raster`

Returns a server-rendered thermocline-depth raster payload for the optional `forecastHour`, `resolution`, and `models` query values.

## Uploads and Media

Allowed categories: `catch-photos`, `trip-photos`, `lures`, `flashers`, `reels`, `rods`, `queue`.

Allowed image extensions: AVIF, GIF, HEIC/HEIF, JPEG, PNG, WebP. Allowed video extensions: MOV, MP4/M4V, WebM, AVI, MPEG/MPG, and 3GP. Extension matching is case-normalized. The app does not enforce an application-level upload size limit.

### `POST /api/uploads/<category>`

Multipart fields:

- `file`: required binary upload.
- `metadata`: optional JSON string; malformed JSON becomes an empty object.

The server assigns a UUID filename, stores metadata, and tries to make a JPEG image preview. Returns a media reference with original/stored names, paths, URLs, media type, and preview fields. Invalid category returns 404; missing/unsupported file returns 400.

### `GET /api/photo-queue`

Returns `{ "photos": [...] }`, newest modified first.

### `POST /api/photo-queue/claim`

JSON body: `{ "filename": "...", "targetCategory": "..." }`. Moves a queued file, sidecar, and preview to a non-queue category under a new UUID name. Returns the new media reference.

### `DELETE /api/photo-queue/<filename>`

Deletes queued media, sidecar, and preview. It is idempotent and returns `{ "ok": true }` even when files are absent.

### `GET /api/gallery?category=<value>`

`category` may be `all` or one allowed upload category. Returns `{ "media": [...] }` with metadata, byte size, modified timestamp, category, and download URL. Invalid categories return 400.

### `GET /api/orphaned-media`

Returns non-queue disk items not recursively referenced by the current logbook as `{ "media": [...] }`.

### `DELETE /api/uploads/<category>/<filename>`

Deletes a non-queue upload only when it exists and is not referenced. Returns 400 for invalid/queue categories, 404 when absent, 409 when referenced, or `200 {"ok": true}`.

### Media delivery

- `GET /uploads/<category>/<filename>`
- `GET /uploads/<category>/_previews/<filename>`

Files are served from their category paths. Category validation occurs through the media path helper.

## SPA and Static Routes

- `/`, `/trips`, `/expeditions`, `/bests`, `/stats`, `/leaderboard`, `/map`, `/gear`, `/gallery`, `/checklists`, and `/settings` render `templates/index.html` and its feature partials. `/` selects the Trips view.
- `/static/<path:filename>` serves only `.css`, `.js`, `.png`, `.jpg`, `.jpeg`, `.svg`, and `.webp` files beneath `static/`.
- `/favicon.ico` returns 204.
