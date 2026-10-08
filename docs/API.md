# HTTP API

Base URL defaults to `http://127.0.0.1:8080`. Routes are grouped into Flask blueprints under `backend/routes/` (`pages`, `logbook`, `media`, `environment`) and reach storage only through the `LogbookStore`/`MediaStore` interfaces in `backend/storage/`. Application, API, and upload routes are unauthenticated. Mutating requests require the CSRF token returned by `GET /api/csrf-token` in the `X-CSRF-Token` header. Every Flask response includes `Cache-Control: no-store`, except `/static/` assets (Flask's default file caching), successful upload original/preview GET and HEAD responses (`private, max-age=3600`), and successful Great Lakes temperature, current, and raster layer responses (`private, max-age=600`). Upload media can be reused from the browser cache for one hour; shared proxies must not cache it. Local media supports ETag revalidation and range requests. Errors remain `no-store`. Replacing or deleting media at the same URL can leave the previous browser copy available until that hour expires or the user forces a reload. This is a desktop HTTP policy; the canonical archive format and mobile storage are unchanged.

## Logbook

### `GET /api/logbook`

Returns the complete v2 logbook reconstructed from SQLite, with an `ETag` header carrying the document revision (for example `"12"`). A missing or empty database returns the canonical v2 defaults. If the local database is corrupt, unreadable, or incompatible, the route returns `503 {"error": "...", "databaseUnavailable": true}`; the web shell remains available in fallback mode so the browser can show cached data or its built-in starter state without changing the original database.

### Revisions and `If-Match`

Every successful write increments a revision stored with the document. Writes accept an optional `If-Match` header with the revision the client last read; when another client saved first, the write is refused with `412 {"error": "...", "revisionConflict": true}` and the current revision in `ETag`, and nothing is changed. Successful writes return the new revision in `ETag`. Without `If-Match` a write is unconditional.

### `PUT /api/logbook`

Replaces the complete logbook document. The browser saves every change this way, sending `If-Match` with the revision it last read.

The request must be a complete v2 document. It is validated before replacement; ordinary reads, writes, and imports preserve the document without reshaping. Documents without `schemaVersion` and unsupported schema versions are rejected.

When the existing local database cannot be read, ordinary saves return `503` with `databaseUnavailable: true` rather than replacing the unreadable file with a browser fallback. Use an explicit archive import to repair or replace that database.

Required top-level JSON types:

- Body must be an object.
- `schemaVersion` must be `2`.
- Every v2 collection listed in `DATA_MODEL.md` must be present as an array, including option lists, gear libraries, people, locations, spots, expeditions, and trips.
- `settings` must be an object.
- `spots` must contain uniquely identified/named records with valid coordinates and a radius from 25 through 500 meters.
- `expeditions` must contain uniquely identified records with a name and ordered ISO start/end dates.

Success: `200 {"ok": true}` with the new `ETag`. Shape failure: `400 {"error": "..."}`. Validation uses the shared JSON Schema in `schema/logbook.schema.json` plus the semantic rules in `backend/logbook_store.py` (unique IDs and names, date order); error messages start with the failing path such as `settings.checklists[0].items[0].done`. See `DATA_MODEL.md`.


### `GET /api/archive`

Returns an `archiveVersion` 2 ZIP containing `manifest.json`, the canonical v2 logbook at `logbook.json`, and uploaded media under `media/<category>/`. This format is shared by desktop and mobile and contains no platform-specific database file.

### `POST /api/archive`

Imports an archiveVersion 2 logbook/media archive and replaces the current logbook and media after validation. Media files are staged and promoted as one transaction; if installing the logbook fails, every promoted file is rolled back and overwritten files are restored. When the existing database cannot accept SQL, the validated archive is installed into a fresh database and the old file is kept in a recovery folder.

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

Looks up Great Lakes depth for numeric latitude and longitude coordinates. It searches the bundled NOAA contour data within 500 m first, then falls back to Esri Canada contours and NOAA lake-model bathymetry for offshore points or when contour sources have no nearby line. The response includes depth_m, depth_ft, lake_name, and depth_source; points on land or outside every lake return null depth fields. The request uses the saved per-lake FOW calibration settings.

### `GET /api/bathymetry/contours/{lake}`

Streams the bundled NOAA bathymetry contours for one of Erie, Huron, Michigan, Ontario, or Superior as GeoJSON. The desktop map loads only contours that intersect the current view and caches the parsed layer in memory for later pans.

### `GET /api/great-lakes/temperature-value`

Returns a modelled Great Lakes water-temperature value for numeric `forecastHour`, `depth`, `resolution`, `latitude`, and `longitude` query values. `forecastHour` is snapped to `0`, `6`, `12`, `24`, or `48` and counts from the current hour: `0` ("Now") is the newest complete NOAA run's frame nearest the present, not the run's start, and every Great Lakes route uses the same rule. Depth is bounded to 0–500 meters and snapped to the nearest NOAA depth level; resolution is bounded to 128–512 pixels. An optional comma-separated `models` list selects known NOAA models.

### `GET /api/great-lakes/profile`

Returns the modelled water-column temperature profile and estimated thermocline for numeric `forecastHour`, `latitude`, and `longitude`, with the same optional `models` selection.

### `GET /api/great-lakes/<layer>`

Returns the current model payload for `temperature` or `currents`. The optional `forecastHour`, `depth`, and `models` query values select the model view.

The currents payload includes sampled `data` points and, when the NOAA run has a regular velocity grid, interpolatable `fields` plus speed-shading `rasters`. Each field carries a compact `waterMask` (row-major bits from NOAA's near-native wet/dry mask) so particles stay on the water. A run with only unstructured FVCOM fields can return sampled currents with empty `fields` and `rasters` arrays; the map then shows static arrows.

### `GET /api/great-lakes/current-profile`

Returns modeled current speed and flow direction at each available water-column layer near numeric `latitude` and `longitude`. Optional `forecastHour` and comma-separated `models` select the forecast. An available response contains `model`, `validTime`, `requested`, `modelLocation`, `sampleDistanceKm`, `depthApproximate`, and shallow-to-deep `values`. Each value has `depthMeters`, eastward `u` and northward `v` in m/s, `speedMetersPerSecond`, and `directionDegrees` (the direction water flows, clockwise from north). FVCOM sigma-layer depths are estimated from nearby model bathymetry. A point without usable nearby data returns `{ "available": false }`; unstructured model faces more than 25 km away are excluded. The Map requests this endpoint when **View current profile** is pressed in the depth popup.

### `GET /api/great-lakes/temperature-raster`

Returns a server-rendered temperature raster payload for the optional `forecastHour`, `depth`, `resolution`, and `models` query values. Each raster is an RGBA image (`imageUrl` data URL, WebP when available) warped to Web Mercator and clipped to NOAA's water mask; all lakes in one response share the colour range reported as `metadata.minC`/`metadata.maxC`.

At depth, temperature and current layers cover only water at least that deep: shallower areas are transparent and outside each current field's `waterMask`. A lake whose deepest model level is shallower than the requested depth has no raster or field, and its `metadata.models[]` entry has `tooShallow: true` and `maxDepthMeters`. The profile and current-profile lookups read the nearest wet cell of the model volume the server already keeps on disk when there is one, so map clicks answer in tens of milliseconds.

### `GET /api/great-lakes/thermocline-raster`

Returns a server-rendered thermocline-depth raster payload for the optional `forecastHour`, `resolution`, and `models` query values. Rasters are rendered like temperature rasters and share the range in `metadata.minDepthMeters`/`metadata.maxDepthMeters` (the 2nd–98th percentile, so outliers do not flatten the colours); water mixed top to bottom, without a thermocline, is drawn in `metadata.mixedColor`.

### `GET /api/great-lakes/waves-raster`

Returns the NOAA GLWU wave layer for the optional `forecastHour`, `resolution`, and `models` query values. `rasters` holds one significant-wave-height image per lake, rendered like temperature rasters and clipped to the same water mask, sharing the range in `metadata.minHeightMeters` (always 0) and `metadata.maxHeightMeters` (at least 1 m). `arrows` lists wave-model cells (every 4th cell, about 10 km apart) with `latitude`, `longitude`, `heightMeters`, `periodSeconds`, and `directionDegrees` (the direction waves come from, degrees true). `metadata` also reports the wave `run`, `selectedForecastHour`, and `validTime`. If NOMADS has no usable run, `rasters` is empty and every model is `available: false`.

### `GET /api/great-lakes/wave-value`

Returns the modelled waves at required `latitude` and `longitude` for the optional `forecastHour`: `available`, `heightMeters`, `periodSeconds`, `directionDegrees` (from the nearest wave-model cell), `validTime`, `run`, and `source`. Points just inside the shoreline use the nearest water cell; points off the lakes return `available: false`.

### `GET /api/great-lakes/status`

Reports what the server is serving for the optional comma-separated `models`: `generatedAt`, a `version` string that changes when a new NOAA run is used or "Now" advances an hour, per-model `run`, `runTime`, `nowForecastHour`, `nowValidTime`, and `nextRunExpectedAt`, the same fields for the hourly wave model in `waves` with its own `wavesVersion`, and the background refresher's last activity and errors in `refresher`. Never cached. Layer requests may include `data=<version>`; the server ignores it, but it gives each data version its own browser-cache entry.

### `GET /api/great-lakes/observations`

Returns live measurements from NOAA National Data Buoy Center stations in the Great Lakes region (buoys and shore gauges): `generatedAt`, `source`, and `stations`, each with `id`, `name`, `owner`, `type` (`Buoy` or `Shore station`), `latitude`, `longitude`, NDBC `url`, `waterTemperature` (`temperatureC`, `observedAt`) or `null`, `waves` (`heightMeters`, `periodSeconds`, `directionDegrees` waves come from, `observedAt`) or `null`, and `current` or `null`. A current is the newest current-meter profile: `observedAt` and `values` with `depthMeters`, `directionDegrees` (the bearing the water flows toward), and `speedMetersPerSecond`. Only stations with a reading from the last 6 hours are included. Readings are fetched live from NDBC on every request and never cached (about 400 KB: only the newest 4 KB of each current-meter file is downloaded); if NDBC is unreachable the route returns 503 with an empty `stations` list.

### `GET /api/great-lakes/model-points`

Returns the forecast model's calculation points inside required numeric `south`, `west`, `north`, and `east` bounds. `kind=temperature` (default) returns FVCOM mesh nodes; `kind=currents` returns triangle centres, where the model computes velocity; `kind=waves` returns the GLWU wave model's 2.5 km water cells (and ignores `models`). Optional comma-separated `models` selects lakes. The response contains `kind`, `count`, `limit`, `tooMany`, per-model availability in `models`, and `points` as a flat `[latitude, longitude, …]` array. Points are never thinned: when `count` exceeds `limit`, `tooMany` is `true` and `points` is empty so the client can ask the user to zoom in. Each model's mesh is downloaded once per server process.

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

JSON body: `{ "filename": "...", "targetCategory": "..." }`. Moves a queued file, sidecar, and preview to a non-queue category under a new UUID name. The move is transactional: a failure restores the queued files. Returns the new media reference.

### `POST /api/photo-queue/copy`

Same body as claim. Copies a queued file (and preview) to a non-queue category for autofill while keeping the queue original for review. Returns the new media reference.

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

### Great Lakes historical fishing conditions

GET `/api/great-lakes/history/point/fishing-conditions?time=<ISO-8601>&latitude=<degrees>&longitude=<degrees>` proxies one historical sample from GreatLakesTrolling. It returns temperature readings and the thermocline NOAA derives from the profile, plus the underwater current profile and nearest model-cell location. The desktop server forwards this request to the configured GREAT_LAKES_HISTORY_URL; the site retains temperature profiles for 90 days and full-depth current profiles for 30 days.

## SPA and Static Routes

- `/`, `/trips`, `/expeditions`, `/bests`, `/stats`, `/leaderboard`, `/map`, `/gear`, `/gallery`, `/checklists`, `/wiki`, and `/settings` render `templates/index.html` and its feature partials. `/` selects the Trips view.
- `/static/<path:filename>` serves only `.css`, `.js`, `.map`, `.png`, `.jpg`, `.jpeg`, `.svg`, `.webp`, `.woff`, and `.woff2` files beneath `static/`. The page loads the built bundle `static/dist/app.js` and `static/dist/app-styles.css` with content-hash `?v=` query strings from `static/dist/manifest.json`.
- `/favicon.ico` returns 204.


Thermocline and current layer metadata may include availability with state
(fallback, waiting, or error), missingModels, outageSeconds, errorAfterSeconds,
and lastGoodAt when available. Thermocline fallback retains its saved layer's
original valid time. When a complete current map is cached, a current fallback
retains that map's original valid times and identifies the lakes that could not
be refreshed. Layer model metadata includes the NOAA run identifier; the apps
show its generation time in local time. Delayed responses use no-store. Status
versions are opaque and can change as additional forecast hours arrive within
the same NOAA cycle.
