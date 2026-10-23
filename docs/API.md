# HTTP API

Base URL defaults to `http://127.0.0.1:8080`. Routes are grouped into Flask blueprints under `backend/routes/` (`pages`, `logbook`, `media`, `environment`) and reach storage only through the `LogbookStore`/`MediaStore` interfaces in `backend/storage/`. Application, API, and upload routes are unauthenticated. Mutating requests require the CSRF token returned by `GET /api/csrf-token` in the `X-CSRF-Token` header. Every Flask response includes `Cache-Control: no-store`, except `/static/` assets (Flask's default file caching) and successful upload original/preview GET and HEAD responses (`private, max-age=3600`). Upload media can be reused from the browser cache for one hour; shared proxies must not cache it. Local media supports ETag revalidation and range requests. Errors remain `no-store`. Replacing or deleting media at the same URL can leave the previous browser copy available until that hour expires or the user forces a reload. This is a desktop HTTP policy; the canonical archive format and mobile storage are unchanged.

The desktop browser uses the same public `/api/v1` API as the mobile app, defaulting to `https://greatlakestrolling.com`. It requests forecast layers, points, stations, model points, animations, and history directly from that host. Set `GREAT_LAKES_API_URL` to use another compatible host. When the configured host differs from the desktop app origin, it must allow browser cross-origin requests. Flask does not proxy Great Lakes conditions or history.

## Logbook

### `GET /api/logbook`

Returns the complete v2 logbook reconstructed from SQLite, with an `ETag` header carrying the document revision (for example `"12"`). A missing or empty database returns the canonical v2 defaults. If the local database is corrupt, unreadable, or incompatible, the route returns `503 {"error": "...", "databaseUnavailable": true}`; the web shell remains available in fallback mode so the browser can show cached data or its built-in starter state without changing the original database.

### Revisions and `If-Match`

Every successful write increments a revision stored with the document. Writes accept an optional `If-Match` header with the revision the client last read; when another client saved first, the write is refused with `412 {"error": "...", "revisionConflict": true}` and the current revision in `ETag`, and nothing is changed. Successful writes return the new revision in `ETag`. Without `If-Match` a write is unconditional.

### `PUT /api/logbook`

Replaces the complete logbook document. The browser saves every change this way, sending `If-Match` with the revision it last read. If startup cannot read a valid server document with an ETag, the browser permits viewing its cached copy but refuses changed saves until a successful reload. It never sends an unconditional PUT from fallback state. The direct-file fallback can still save locally.

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

Returns the `.logbook` download: an `archiveVersion` 2 ZIP containing `manifest.json`, the canonical v2 logbook at `logbook.json`, and uploaded media under `media/<category>/`. This format is shared by desktop and mobile and contains no platform-specific database file.

### `POST /api/archive`

Imports a `.logbook` file containing an archiveVersion 2 ZIP and replaces the current logbook and media after validation. Media files are staged and promoted as one transaction; if installing the logbook fails, every promoted file is rolled back and overwritten files are restored. When the existing database cannot accept SQL, the validated archive is installed into a fresh database and the old file is kept in a recovery folder. Existing `.zip` logbook archives remain importable.

### `GET /api/trips/<trip_id>/shared-archive`

Downloads a `.trip` file containing a versioned `fishing-logbook-shared-trip` ZIP for one trip. It includes only that trip, its required people, locations, spots, used gear, and referenced media; unrelated history, preferences, and expeditions are excluded.

### `POST /api/shared-trip-archive/preview`

Accepts multipart field `archive` containing a `.trip` file (ZIP) and returns its trip summary, normalized-name person suggestions, and likely local overlap candidates. It does not change the logbook.

### `POST /api/shared-trip-archive/import`

Accepts multipart `archive` containing a `.trip` file (ZIP), JSON `personMappings` (`sourcePersonId` to existing local person ID), `duplicateAction` (`add`, `replace`, or `keep-local`), and `replacementTripId` for `replace`. It merges the one imported trip without replacing unrelated logbook data. Imported media is copied under collision-free filenames. `replace` is allowed only for a candidate returned by preview.

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

Looks up Great Lakes depth for numeric latitude and longitude coordinates. It searches the bundled NOAA contour data within 500 m first, then uses cached NOAA lake-model bathymetry for offshore points, with Esri Canada contours as the final fallback. Cold model downloads are shared and each point request waits at most three seconds for them; remote contour requests use a two-second timeout. Model failures remain errors rather than being reported as land. Local contour indexes persist in the Great Lakes cache and invalidate when the bundled geometry changes. The response includes depth_m, depth_ft, lake_name, and depth_source; points on land or outside every lake return null depth fields. The request uses the saved per-lake FOW calibration settings.

### `GET /api/bathymetry/contours/{lake}`

Streams the bundled NOAA bathymetry contours for one of Erie, Huron, Michigan, Ontario, or Superior as GeoJSON. Optional `detail=6|9|12|full` selects geometry simplified for the map zoom; the default is `full`, and invalid detail values return 400. Optional `detail=6|9|12|full` selects geometry simplified for the map zoom; the default is `full`, and invalid detail values return 400. The desktop map loads only contours that intersect the current view and caches the parsed layer in memory for later pans.

## Uploads and Media

Allowed categories: `catch-photos`, `trip-photos`, `lures`, `flashers`, `reels`, `rods`, `people`, `queue`. The `people` category stores optional person portrait photos.

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

## SPA and Static Routes

- `/`, `/trips`, `/expeditions`, `/bests`, `/stats`, `/leaderboard`, `/map`, `/gear`, `/gallery`, `/checklists`, `/wiki`, and `/settings` render `templates/index.html` and its feature partials. `/` selects the Trips view.
- `/static/<path:filename>` serves only `.css`, `.js`, `.map`, `.png`, `.jpg`, `.jpeg`, `.svg`, `.webp`, `.woff`, and `.woff2` files beneath `static/`. The page loads the built bundle `static/dist/app.js` and `static/dist/app-styles.css` with content-hash `?v=` query strings from `static/dist/manifest.json`.
- `/favicon.ico` returns 204.


### Bathymetry indexes

The Docker image includes bundled NOAA contour assets and prepares their local indexes during the image build. Local installations can prepare the same indexes with `.venv\Scripts\python.exe scripts/prepare-depth-indexes.py`; generated indexes live under `static/data/depth-indexes/` outside the private logbook data directory.
