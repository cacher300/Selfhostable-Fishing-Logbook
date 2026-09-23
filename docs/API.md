# HTTP API

Base URL defaults to `http://127.0.0.1:8080`. Application, API, and upload routes are unauthenticated. Mutating requests require the CSRF token returned by `GET /api/csrf-token` in the `X-CSRF-Token` header. Every Flask response includes `Cache-Control: no-store`.

## Logbook

### `GET /api/logbook`

Returns the complete v2 logbook reconstructed from SQLite. A missing or empty database returns the canonical v2 defaults; invalid stored data returns a server error.

### `PUT /api/logbook`

Replaces the complete logbook document.

The request must be a complete v2 document. It is validated before replacement; ordinary reads, writes, and imports preserve the document without reshaping. Documents without `schemaVersion` and unsupported schema versions are rejected.

Required top-level JSON types:

- Body must be an object.
- `schemaVersion` must be `2`.
- Every v2 collection listed in `DATA_MODEL.md` must be present as an array, including option lists, gear libraries, people, locations, spots, expeditions, and trips.
- `settings` must be an object.
- `spots` must contain uniquely identified/named records with valid coordinates and a radius from 25 through 500 meters.
- `expeditions` must contain uniquely identified records with a name and ordered ISO start/end dates.

Success: `200 {"ok": true}`. Shape failure: `400 {"error": "..."}`. Validation recursively checks JSON values and known nested record structures; see `DATA_MODEL.md`.

### `GET /api/archive`

Returns an `archiveVersion` 2 ZIP containing `manifest.json`, the canonical v2 logbook at `logbook.json`, and uploaded media under `media/<category>/`. This format is shared by desktop and mobile and contains no platform-specific database file.

### `POST /api/archive`

Imports an archiveVersion 2 logbook/media archive and replaces the current logbook and media after validation.

### `GET /api/trips/<trip_id>/shared-archive`

Downloads a versioned `fishing-logbook-shared-trip` ZIP for one trip. It includes only that trip, its required people, locations, spots, used gear, and referenced media; unrelated history, preferences, and expeditions are excluded.

### `POST /api/shared-trip-archive/preview`

Accepts multipart field `archive` containing a Shared Trip ZIP and returns its trip summary, normalized-name person suggestions, and likely local overlap candidates. It does not change the logbook.

### `POST /api/shared-trip-archive/import`

Accepts multipart `archive`, JSON `personMappings` (`sourcePersonId` to existing local person ID), `duplicateAction` (`add`, `replace`, or `keep-local`), and `replacementTripId` for `replace`. It merges the one imported trip without replacing unrelated logbook data. Imported media is copied under collision-free filenames. `replace` is allowed only for a candidate returned by preview.

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

Returns non-queue local or cloud uploads not recursively referenced by the saved logbook as `{ "media": [...] }`. The Gallery uses this route for its orphaned media scan. Review results before deletion because uploads in an unsaved editor can appear here.

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
