# HTTP API

Base URL defaults to `http://127.0.0.1:8080`. Application, API, and upload routes require the configured HTTP Basic credentials. Mutating requests also require the CSRF token returned by authenticated `GET /api/csrf-token` in the `X-CSRF-Token` header. Every Flask response includes `Cache-Control: no-store`.

## Logbook

### `GET /api/logbook`

Returns the complete normalized logbook JSON document. A missing or malformed data file returns normalized defaults rather than an HTTP error.

### `PUT /api/logbook`

Replaces the complete logbook document.

Imports are recursively checked before normalization. Validation errors identify the failing JSON path. Legacy documents without `schemaVersion` are treated as version 0 and migrated to version 1; versions newer than the server supports are rejected.

Required top-level JSON types:

- Body must be an object.
- `trips`, `lures`, and `flashers` must be arrays.
- `reels`, `rods`, and `rodReelCombos`, when present, must be arrays.
- `people`, when present, must be an array.

Success: `200 {"ok": true}`. Shape failure: `400 {"error": "..."}`. Validation is not recursive; see `DATA_MODEL.md`.

### `GET /api/export`

Returns normalized JSON as attachment `fishing-logbook.json`. Uploaded files are not embedded.

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

## Uploads and Media

Allowed categories: `catch-photos`, `trip-photos`, `lures`, `flashers`, `reels`, `rods`, `queue`.

Allowed image extensions: AVIF, GIF, HEIC/HEIF, JPEG, PNG, WebP. Allowed video extensions: MOV, MP4/M4V, WebM, AVI, MPEG/MPG, and 3GP. Extension matching is case-normalized. Requests are limited to 25 MB by default; configure `MAX_UPLOAD_BYTES` to change the limit.

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

- `/` redirects to `/trips`.
- `/trips`, `/stats`, `/map`, `/gear`, `/gallery`, `/settings` return `index.html`.
- `/static/<path:filename>` serves only `.css` and `.js` files beneath `static/`.
- `/favicon.ico` returns 204.

## Code-Only Service

`refresh_all_trip_weather()` in `backend/weather_service.py` reads the logbook, refreshes every trip with request caches, records per-trip errors, and writes the result. It is not connected to HTTP, CLI, cron, or app startup and therefore is not a public API.
