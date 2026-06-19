# Feature Inventory

Audit date: 2026-06-18. This inventory is based only on executable code, markup, configuration, and scripts in this repository. The application has one effective role: **trusted logbook operator**. There are no accounts, roles, or permission checks.

Status vocabulary:

- **Implemented**: connected through the relevant UI, browser logic, persistence/API, or operational script.
- **Partial**: usable, but materially incomplete or narrower than the feature name suggests.
- **Hidden**: implemented or callable without primary navigation, or present only as an operational/code capability.
- **Deprecated**: residue or documentation for a removed feature.
- **Not implemented**: explicitly audited and absent. These rows are not included in the 72-feature count.
- **Verification Required**: code suggests behavior that was not exercised against its external dependency.

“Database” refers to collections or nested records in `data/logbook.json`; there are no database tables.

## Core Fishing Features

| ID | Feature | Description / purpose | Status | Entry point and role | Data and dependencies | Related files | Database | API endpoints | Screens |
|---|---|---|---|---|---|---|---|---|---|
| C01 | Trip logging | Create, edit, save, and delete fishing trips. | Implemented | New Trip, trip row Edit, summary Edit; trusted operator | Trip plus nested people, gear, catches, lost fish, media | `index.html`, `trip-editor.js`, `app.js` | `trips[]` | GET/PUT `/api/logbook` | Trips, Trip dialog |
| C02 | Trip basics | Capture title, date, waterbody, launch, times, target, method, intent, rating, and calculated hours. | Implemented | Basics section | Saved option lists; overnight time calculation | `trip-editor.js`, `stats.js` | Trip scalar fields | GET/PUT `/api/logbook` | Trip dialog |
| C03 | Trip list search | Search location, target/catch species, lure names, and notes. | Implemented | Search box | In-memory normalized state | `dashboard.js`, `index.html` | `trips`, `lures` | GET `/api/logbook` | Trips |
| C04 | Trip filtering | Filter by target, method, and year. | Implemented | Trips toolbar | Saved predefined lists and trip dates | `dashboard.js` | `trips` | GET `/api/logbook` | Trips |
| C05 | Trip sorting | Sort by date, catch rate, fish count, hours, or sortable table columns. | Implemented | Sort control/table headers | Calculated fish, hours, rate | `dashboard.js`, `app.js` | `trips.catches`, `hours` | None beyond logbook read | Trips |
| C06 | Trip summary/report | Present metrics, conditions, notes, media, setup, catches, maps, spread, and event timeline; supports edit/delete. | Implemented | View button on trip row | All trip nested records, Leaflet | `maps-summary.js`, `location-weather.js` | `trips[]` | Media GET routes | Trip Summary dialog |
| C07 | People tracking | Add reusable people and attribute landed/lost fish to them. | Implemented | People section and fish rows | People are merged globally from trips | `trip-editor.js`, `logbook_store.py` | `people[]`, `trip.people[]`, `personId` | GET/PUT `/api/logbook` | Trip dialog, Stats |
| C08 | Species tracking | Maintain species choices and record target, landed, and possible lost-fish species. | Implemented | Trip/catch forms; Settings | User-managed option list | `settings.js`, `trip-editor.js`, `stats.js` | `species[]`, trip/catch species | GET/PUT `/api/logbook` | Trips, Stats, Settings |
| C09 | Method tracking | Record fishing method and adapt the form for trolling/casting. | Implemented | Trip Method select | User-managed method list | `form-utils.js`, `trip-editor.js` | `methods[]`, `trip.method` | GET/PUT `/api/logbook` | Trip dialog, Stats |
| C10 | Location tracking (waterbodies) | Create/edit/delete saved waterbody pins and reuse them on trips. | Implemented | Settings Waterbodies or trip “+” | Leaflet/OpenStreetMap; deletion blocked while referenced | `locations.js`, `app-state.js` | `locations[]` | GET/PUT `/api/logbook` | Settings, Trip dialog |
| C11 | Launch tracking | Store optional named launch pins under a waterbody. | Implemented | Launch “+” and location manager | Parent waterbody; used as preferred weather coordinate | `locations.js` | `locations[].launches[]` | GET/PUT `/api/logbook` | Settings, Trip dialog |
| C12 | Water conditions | Record water temperature, clarity, depth/structure, wave height, and derived chop label. | Implemented | Conditions section | Unit preferences and chop ranges | `trip-editor.js`, `settings.js`, `location-weather.js` | Trip condition fields | GET/PUT `/api/logbook` | Trip dialog, Summary, Stats |
| C13 | Manual weather tag | Record a simple user-defined weather condition without overwriting it with API weather. | Implemented | Weather select | `weatherTypes[]` | `trip-editor.js`, `stats.js` | `trip.weather` | GET/PUT `/api/logbook` | Trip dialog, Stats |
| C14 | Trolling setup timeline | Record timed rod/setup changes with side, label, combo/rod/reel, lure, flasher, presentation, and change note. | Implemented | Setup section on trolling trips | Gear libraries; trip time calculation | `trip-editor.js`, `trolling-spread.js` | `trip.gearUsed[]` | GET/PUT `/api/logbook` | Trip dialog, Summary |
| C15 | Deepest-rigger marker | Mark downrigger setup rows as the deepest rigger for analysis. | Implemented | Downrigger setup row | Trolling presentation | `form-utils.js`, `stats.js` | `gearUsed[].deepestRigger` | GET/PUT `/api/logbook` | Trip dialog, Stats |
| C16 | Setup-line catch resolution | Resolve trolling catches/lost fish through a selected setup row, inheriting gear and presentation context. | Implemented | Rod selector on fish rows | `setupLineId` foreign-key-like reference | `trolling-spread.js`, `trip-editor.js` | `catch.setupLineId`, `gearUsed[].id` | None beyond logbook | Trip dialog, Summary, Stats |
| C17 | Landed catch logging | Record species, person, release status, length, weight, time, depth, notes, gear, GPS, and media. | Implemented | Add Catch | Method-specific fields and gear libraries | `trip-editor.js`, `photos.js` | `trip.catches[]` | GET/PUT `/api/logbook`, upload routes | Trip dialog, Summary, Stats, Map |
| C18 | Multi-fish count convention | Treat a numeric `quantity` on imported catch records as fish count; UI-created catches default to one. | Hidden / Partial | No UI quantity field | Imported JSON only | `dashboard.js` | `catch.quantity` | PUT `/api/logbook` | Stats/dashboard calculations |
| C19 | Lost fish logging | Record possible species and fishing context separately from landed catches. | Implemented | Add Lost Fish | Shares catch template but removes landed-only fields/media | `trip-editor.js`, `stats.js` | `trip.lostFish[]` | GET/PUT `/api/logbook` | Trip dialog, Summary timeline, Stats |
| C20 | Trolling fish context | Record direction, FOW, speed, ball depth, board lead, lure depth, dipsey setting, line out, and estimated depth. | Implemented | Trolling catch/lost rows | Presentation controls conditional field visibility | `form-utils.js`, `trip-editor.js` | Catch/lost trolling fields | GET/PUT `/api/logbook` | Trip dialog, Summary, Stats |
| C21 | Casting retrieve notes | Show and save retrieve style for casting catches/lost fish. | Implemented | Casting fish row | Method visibility logic | `form-utils.js`, `trip-editor.js` | `catch.retrieve` | GET/PUT `/api/logbook` | Trip dialog, Summary |
| C22 | Catch GPS override | Accept manual latitude/longitude and prefer it over media GPS. | Implemented | Catch row coordinates | Coordinate validation | `photos.js`, `maps-summary.js` | `manualCoordinates`, `coordinates` | GET/PUT `/api/logbook` | Trip dialog, Maps |
| C23 | Trip notes and observations | Record free-form pattern, launch, and next-time observations. | Implemented | Photos and Notes section | None | `trip-editor.js`, `maps-summary.js` | `trip.notes` | GET/PUT `/api/logbook` | Trip dialog, Summary |
| C24 | Catch notes | Record free-form strike, retrieve, release, or lost-fish observations. | Implemented | Fish row Notes | None | `trip-editor.js`, `maps-summary.js` | `catch.notes`, `lostFish.notes` | GET/PUT `/api/logbook` | Trip dialog, Summary |
| C25 | Lure/bait library | CRUD reusable lures with type, brand/model, color, notes, media, usage, and outcomes. Natural/live bait has no dedicated model. | Partial | Gear > Baits; inline New Lure | Upload service, trip references | `gear.js`, `index.html` | `lures[]`, `lureId` | Logbook and upload APIs | Gear, Trip dialog, Stats |
| C26 | Flasher library | CRUD trolling flashers/attractors with metadata, media, usage, and outcomes. | Implemented | Gear > Flashers; inline New Flasher | Upload service | `gear.js` | `flashers[]`, `flasherId` | Logbook and upload APIs | Gear, Trip dialog, Stats |
| C27 | Reel inventory | CRUD reels with specifications, purchase data, notes, media, and fish counts. | Implemented | Gear > Reels | Upload service, combos, setup references | `gear.js` | `reels[]`, `reelId` | Logbook and upload APIs | Gear, Trip dialog |
| C28 | Rod inventory | CRUD rods with specifications, purchase data, notes, media, and fish counts. | Implemented | Gear > Rods | Upload service, combos, setup references | `gear.js` | `rods[]`, `rodId` | Logbook and upload APIs | Gear, Trip dialog |
| C29 | Rod/reel combos | Save named rod/reel pairings and copy selections into setup rows. | Implemented | Gear > Combos | Rod/reel IDs | `gear.js` | `rodReelCombos[]`, `comboId` | GET/PUT `/api/logbook` | Gear, Trip dialog |
| C30 | Line-spooling history | Track reel line entries, dates, type, brand/name, weight, diameters, color, backing, and notes. | Implemented | Edit Reel; Line Tracker tab | Reel ownership and line type list | `gear.js` | `reels[].lineHistory[]` | GET/PUT `/api/logbook` | Gear |
| C31 | Trolling spread diagram | Draw setup geometry and show catch/lost counts for a trip. | Implemented | Trip Summary | Setup sides/presentations | `maps-summary.js`, `trolling-spread.js` | `gearUsed`, catches, lost fish | None | Trip Summary |
| C32 | Event timeline | Merge setup changes, catches, lost fish, and geotagged media into a filterable chronology. | Implemented | Trip Summary | Times and media capture times | `maps-summary.js` | Nested trip records | None | Trip Summary |

## Media, Mapping, and Environmental Features

| ID | Feature | Description / purpose | Status | Entry point and role | Data and dependencies | Related files | Database | API endpoints | Screens |
|---|---|---|---|---|---|---|---|---|---|
| E01 | Trip media uploads | Attach multiple images/videos with captions to trip notes. | Implemented | Add Photos / Use Queue | Local filesystem and metadata sidecars | `photos.js`, `media_service.py` | `trip.notePhotos[]` + files | POST `/api/uploads/trip-photos` | Trip dialog, Summary, Gallery |
| E02 | Catch media uploads | Attach multiple images/videos to landed catches. | Implemented | Catch Add Photos / Use Queue | Local filesystem; lost fish intentionally excluded | `photos.js` | `catch.photos[]` + files | POST `/api/uploads/catch-photos` | Trip dialog, Summary, Gallery, Map |
| E03 | Gear media uploads | Attach image/video records to lures, flashers, rods, and reels. | Implemented | Gear dialogs | Local filesystem | `gear.js`, `media_service.py` | Gear image fields + files | POST `/api/uploads/{category}` | Gear, Gallery |
| E04 | Media metadata extraction | Parse JPEG EXIF and MOV/MP4 metadata for capture time and GPS; ignore one configured GPS area. | Implemented | Automatic during browser upload | Browser `ArrayBuffer`; format-dependent | `photos.js` | Media metadata records | Upload API stores metadata | Upload workflows, Map/timeline |
| E05 | Image preview generation | Apply EXIF orientation and create JPEG thumbnails up to 1200×1200. | Implemented | Automatic server upload | Pillow; unsupported image decoding yields no preview | `media_service.py` | Metadata sidecar preview fields | Preview GET route | Gallery and media cards |
| E06 | Photo Queue | Phone-friendly holding queue with upload, inspect, assign, and delete workflows. | Implemented | Settings > Photo Queue and Use Queue buttons | Queue category and claim/move operation | `photos.js`, `server.py` | Queue sidecars/files; claimed references | Queue GET/POST/DELETE APIs | Queue dialog, Trip/Gear dialogs |
| E07 | Media Gallery | Browse all or category-filtered uploaded media with metadata and direct file access. | Implemented | Gallery route | Upload directories | `gallery.js`, `media_service.py` | Files/sidecars | GET `/api/gallery` | Gallery |
| E08 | Orphan-media cleanup | Detect unreferenced non-queue uploads and allow deletion. | Implemented | Gallery > Orphaned Media | Recursive reference scan; deletion guard rechecks references | `gallery.js`, `media_service.py`, `server.py` | Files vs logbook references | GET `/api/orphaned-media`; DELETE upload | Gallery |
| E09 | Global fish/media map | Map catch GPS and geotagged trip media with species/category filtering and list links. | Implemented | Map route | Leaflet + OpenStreetMap tiles | `maps-summary.js` | Catch/media coordinates | File GET routes | Map |
| E10 | Trip map | Map one trip’s catch and media records with filtering. | Implemented | Trip Summary | Leaflet + tile service | `maps-summary.js` | Nested trip coordinates | None | Trip Summary |
| E11 | Automatic trip weather | Fetch historical or forecast weather for trip window; launch pin wins over waterbody pin. | Implemented; external verification required | Automatic preview/save | Open-Meteo proxy, network | `location-weather.js`, `weather_service.py` | `trip.weatherData` | GET weather archive/forecast | Trip dialog, Summary, Stats |
| E12 | Catch-time weather | Save nearest hourly weather for timed catches, preferring catch GPS. | Implemented; external verification required | Automatic on trip save | Open-Meteo and catch time/GPS | Same as E11 | `catch.weatherData` | GET weather archive/forecast | Summary, Stats |
| E13 | Weather trends/front classification | Calculate pressure/temperature/wind/cloud trends, 3-hour pressure rate, and front tag. | Implemented | Automatic weather enrichment | Hourly records | `location-weather.js`, `weather_service.py` | `weatherData.trend`, `frontTag` | Weather APIs | Summary, Stats |
| E14 | Marine wave enrichment | Fetch wave height/direction/period, retry without cell selection, and fill wave height when user left it blank. | Implemented; external verification required | Automatic weather preview/save | Open-Meteo Marine | `location-weather.js`, `weather_service.py` | `weatherData.marine`, trip wave fields | GET `/api/weather/marine` | Trip dialog, Summary |
| E15 | Sun/moon enrichment | Fetch sunrise, sunset, moonrise, moonset, phase, and illumination. | Implemented; external verification required | Automatic weather preview/save | SunriseSunset.io | `location-weather.js`, `weather_service.py` | `weatherData.sunMoon` | GET `/api/astronomy` | Summary, Stats |

## Analytics Features

| ID | Feature | Description / purpose | Status | Entry point and role | Data and dependencies | Related files | Database | API endpoints | Screens |
|---|---|---|---|---|---|---|---|---|---|
| A01 | Dashboard totals | Trips, landed fish, hours, waterbodies, catch rate, pounds/hour, and days since last trip. | Implemented | Sidebar | Normalized trips | `dashboard.js` | Trips/catches | GET `/api/logbook` | All routes/sidebar |
| A02 | Top species and lures | Bar summaries for most-caught species and top producing lures. | Implemented | Sidebar | Catch/setup resolution | `dashboard.js` | Catches, lures, setup rows | None | Sidebar |
| A03 | Fishing streak metrics | Compute fishing days, longest day run, and productive-day runs for spotlight text. | Hidden | Brand spotlight; not a dedicated report | Trip dates | `dashboard.js` | Trips/catches | None | Sidebar branding |
| A04 | Advanced KPI summary | Report trip length, landed/lost, rates, skunks, best trip/rate, release/keep, and gear-use time. | Implemented | Stats route | Filters and time calculations | `stats.js` | Trips and nested records | None | Stats |
| A05 | Analytics scoping and filters | Scope by method, thresholds, lost-fish inclusion, species, person, location, gear, clarity, weather, month, and rating. | Implemented | Stats toolbar | Global state only; not persisted | `stats.js`, `app.js` | All analytics inputs | None | Stats |
| A06 | Outcome analytics | Landed, released, kept, lost, percentages, species mix, and release patterns. | Implemented | Overview group | Landed/lost separation | `stats.js` | Catches/lost fish | None | Stats |
| A07 | Time-of-day and bite windows | Bucket interactions by time and relative sunrise/sunset windows. | Implemented | Overview/Conditions | Catch times and sun/moon data | `stats.js`, `location-weather.js` | Catch times, sunMoon | None | Stats |
| A08 | Best pattern combinations | Rank observed lure/flasher, presentation, FOW, depth, speed, and related combinations. This is a table, not the removed Pattern Finder screen. | Implemented | Overview > Best Pattern Combos | Resolved catch context | `stats.js` | Catches/setup/gear | None | Stats |
| A09 | Lure efficiency | Fish, hours, rates, trip counts, time/fish share, efficiency, confidence, and labels. | Implemented | Lure and Gear Performance | Setup timing quality | `stats.js` | Gear timeline and catches | None | Stats |
| A10 | Lure spread context | Identify producing, quiet, and sole-producer lure behavior within trip spreads. | Implemented | Lure Spread Context | Multiple setup lines/trips | `stats.js` | Gear/catches | None | Stats |
| A11 | Lure dimensions | Compare lure type and lure color performance. | Implemented | Lure Type/Color cards | Lure library metadata | `stats.js` | `lures`, gear usage | None | Stats |
| A12 | Flasher and lure/flasher analytics | Compare flasher and combination performance with trolling-only visibility. | Implemented | Stats trolling scope | Timed setup usage | `stats.js` | Flashers/gear/catches | None | Stats |
| A13 | Trolling setup analytics | Analyze direction, line side, presentation, deepest-rigger state, and highlights. | Implemented | Depth and FOW group | Setup-line resolution and timing | `stats.js` | Gear/catches/lost fish | None | Stats |
| A14 | FOW/depth distribution | Compare FOW ranges, exact FOW, and depth-down fish share. | Implemented | Depth and FOW group | Numeric extraction from typed strings | `stats.js` | Catch depth fields | None | Stats |
| A15 | Technique/location/people analysis | Compare location, method, angler, and month efficiency. | Implemented | Technique Performance | Trip hours and filtered catches | `stats.js` | Trips/people | None | Stats |
| A16 | Seasonal analysis | Month patterns provide aggregate seasonal comparison. No year-over-year report exists. | Partial | Month Patterns | Trip dates | `stats.js` | Trips | None | Stats |
| A17 | Condition analytics | Compare clarity, manual weather, wind, pressure, cloud, air temperature, sunshine, trends, fronts, moon phase/window. | Implemented | Conditions group | API coverage varies | `stats.js` | Trip/catch weather | None | Stats |
| A18 | Sortable tables and charts | Sort analytics columns and switch supported cards among table, bar, stacked, grouped, donut, or line charts. | Implemented | Card controls/headers | Rendered stats rows | `stats.js`, `app.js` | Derived only | None | Stats |
| A19 | Confidence/efficiency labels | Label observed performance and distinguish reliable samples, overuse, watch lists, and insufficient data. | Implemented | Stats cards and legend | Hours/trip thresholds | `stats.js`, `index.html` | Derived only | None | Stats |
| A20 | Stats diagnostics | Detect missing setup time/details and provide deep links to affected trip/setup sections. | Implemented | Advanced Tables | Trip editor deep-link events | `stats.js`, `app.js` | Trips/gear/catches | None | Stats, Trip dialog |
| A21 | Personal bests | No dedicated largest/heaviest/longest fish or PB report exists. | Not implemented | None | — | — | — | — | — |
| A22 | Historical/year-over-year comparisons | Year filtering exists on Trips, but there is no comparative historical report. | Not implemented | None | — | — | — | — | — |

## User Features and Preferences

| ID | Feature | Description / purpose | Status | Entry point and role | Data and dependencies | Related files | Database | API endpoints | Screens |
|---|---|---|---|---|---|---|---|---|---|
| U01 | Measurement preferences | Configure depth, distance, trolling/wind speed, pressure, temperatures, precipitation, waves, fish length/weight. | Implemented | Settings > Measurements | Conversion helpers; typed values remain strings | `settings.js`, `app-state.js` | `settings.units` | PUT `/api/logbook` | Settings and all labels/reports |
| U02 | Time-format preference | Choose 12- or 24-hour display. | Implemented | Settings > Time Format | Raw HTML time values remain 24-hour | `settings.js`, `app-state.js` | `settings.timeFormat` | PUT `/api/logbook` | Settings, summaries |
| U03 | Predefined fields | Manage species, methods, lure/flasher/rod/reel/line types, conditions, presentations, directions, and line sides. | Implemented | Settings > Predefined Fields | Existing saved text remains valid | `settings.js`, `logbook_store.py` | Top-level option arrays | PUT `/api/logbook` | Settings/forms |
| U04 | Chop-range preferences | Configure wave-height thresholds and labels. | Implemented | Settings > Chop Ranges | Internally normalized to feet | `settings.js`, `location-weather.js` | `settings.chopRanges` | PUT `/api/logbook` | Settings, Trip/Summary |
| U05 | Direct-file local fallback | Opening `index.html` directly loads/saves localStorage when Flask is unavailable. Uploads/weather do not work in this mode. | Implemented / Partial | Open local HTML file | Browser localStorage | `app-state.js` | None | Same SPA UI |
| U06 | Accounts | No registration, login, session, or password support. | Not implemented | None | — | — | — | — | — |
| U07 | Profiles | No per-person application profiles; fishing people are attribution records only. | Not implemented | None | — | — | — | — | — |
| U08 | Permissions/roles | No authorization checks or role model. | Not implemented | None | — | — | — | — | — |
| U09 | Notifications | No in-app, email, push, SMS, or scheduled notifications. | Not implemented | None | — | — | — | — | — |

## Administrative and Data-Management Features

| ID | Feature | Description / purpose | Status | Entry point and role | Data and dependencies | Related files | Database | API endpoints | Screens |
|---|---|---|---|---|---|---|---|---|---|
| D01 | JSON export | Download normalized logbook data; uploaded binaries are excluded. | Implemented | Settings > Export JSON | Server data file | `data-transfer.js`, `server.py` | Entire logbook | GET `/api/export` | Settings |
| D02 | JSON import | Parse, minimally shape-check, normalize, persist, and rerender imported data. | Implemented / Partial | Settings > Import JSON | Browser file reader; weak deep validation | `data-transfer.js`, `app-state.js` | Entire logbook | PUT `/api/logbook` | Settings |
| D03 | Local/NAS backup | Monthly JSON backup plus uploads mirror, local retention, optional mounted path or SSH/rsync/scp target. | Implemented; host verification required | Shell script | POSIX tools, SSH/rsync optional | `scripts/backup-logbook.sh` | Data file + uploads | None | None |
| D04 | Nightly backup installation | Install a 03:00 cron job, replacing an existing entry for the script. | Implemented; host verification required | Install script / launcher | `crontab` | `scripts/install-nightly-backup.sh` | Filesystem | None | None |
| D05 | Docker launch lifecycle | Stop old/current containers, install backup cron when available, rebuild, and launch Compose. | Implemented; host verification required | `launch-container.sh` | Docker Compose, host cron | Launcher/Compose files | Mounted `./data` | Port 80→8080 | None |
| D06 | Location referential deletion guard | Refuse to delete locations/launches still used by trips. | Implemented | Settings manager delete buttons | Name/ID matching | `locations.js` | Trips/locations | PUT `/api/logbook` | Settings |
| D07 | Gear referential cleanup | Deleting gear clears references from combos/trips/catches where coded. | Implemented | Gear delete actions | Client-side cascading updates | `gear.js` | Gear and nested IDs | PUT `/api/logbook` | Gear |
| D08 | Moderation tools | No shared content, reports, bans, review queue, or moderation role. | Not implemented | None | — | — | — | — | — |
| D09 | Administrative console | No admin-only screen or privileged API. Settings and cleanup are available to every visitor. | Not implemented | None | — | — | — | — | — |

## Technical Features, Integrations, and Hidden Capabilities

| ID | Feature | Description / purpose | Status | Entry point and role | Data and dependencies | Related files | Database | API endpoints | Screens |
|---|---|---|---|---|---|---|---|---|---|
| T01 | JSON persistence API | Read and replace the normalized logbook document. | Implemented | SPA load/save; unauthenticated | Flask and filesystem | `server.py`, `logbook_store.py` | `data/logbook.json` | GET/PUT `/api/logbook` | All |
| T02 | JSON normalization | Merge defaults, sanitize settings/options/coordinates, migrate string locations, and merge people/locations from trips. | Implemented | Every read/write/import | No schema version | `logbook_store.py`, `app-state.js` | Entire document | GET/PUT logbook | All |
| T03 | UUID/slug identity | Create browser UUIDs for records and deterministic slugs for migrated locations/options. | Implemented | Automatic | Web Crypto or fallback | `app-state.js`, `logbook_store.py` | IDs throughout | None | All edit workflows |
| T04 | Weather proxy APIs | Allowlisted proxies for Open-Meteo archive and forecast requests. | Implemented | Browser weather workflow | Internet access | `server.py`, `weather_service.py` | None directly | GET archive/forecast | Trip workflow |
| T05 | Marine proxy API | Allowlisted Open-Meteo Marine proxy. | Implemented | Browser weather workflow | Internet access | Same | None directly | GET `/api/weather/marine` | Trip workflow |
| T06 | Astronomy proxy API | Allowlisted SunriseSunset.io proxy. | Implemented | Browser weather workflow | Internet access | Same | None directly | GET `/api/astronomy` | Trip workflow |
| T07 | Media API | Validate categories/extensions, store UUID filenames/metadata, list, claim, serve, and delete files. | Implemented | Upload/gallery workflows | Flask, Pillow, filesystem | `server.py`, `media_service.py` | Upload tree | Upload/gallery/media routes | Media workflows |
| T08 | SPA route serving | Serve the same `index.html` at `/trips`, `/stats`, `/map`, `/gear`, `/gallery`, and `/settings`; `/` redirects to `/trips`. | Implemented | Browser URL/nav | Flask static serving | `server.py`, `app.js` | None | Page routes | Six screens |
| T09 | Route-based initial view | Direct SPA routes select the matching initial view. In-page navigation does not update the URL and no `popstate` handler exists. | Partial | Direct URL or primary nav | `window.location.pathname` | `app.js` | None | Page routes | Six screens |
| T10 | Responsive/mobile layout | Reflow navigation, tables, dialogs, sidebar summary, maps, and settings for narrower screens. No native/PWA install exists. | Implemented | CSS media queries | Browser viewport | `styles.css`, `app.js` | None | None | All |
| T11 | No-store responses | Add `Cache-Control: no-store` to every Flask response. | Implemented | Automatic | Flask response hook | `server.py` | None | All server routes | All |
| T12 | Environment configuration | Configure bind host/port and backup paths/target/key/retention through environment variables. | Implemented | Process/shell environment | Host process | `backend_config.py`, scripts, Compose | None | None | None |
| T13 | Backend bulk weather refresh | Refresh every trip with request caching and per-trip error continuation. No route, CLI, schedule, or caller exposes it. | Hidden / Incomplete | Code only | External weather APIs | `weather_service.py` | Mutates all trip weather | None | None |
| T14 | Removed Pattern Finder residue | Pattern Finder JS/view was removed, but README claims it and `.patterns-*` CSS remains. | Deprecated | No entry point | Git history confirms removal | `README.md`, `styles.css` | None | None | None |
| T15 | Deprecated `tripTypes` cleanup | Both normalizers delete a legacy `tripTypes` property. | Hidden / Deprecated | Automatic normalization | Legacy imported JSON | `app-state.js`, `logbook_store.py` | Removes top-level field | GET/PUT logbook | None |
| T16 | Offline/PWA | No service worker, web manifest, cache strategy, IndexedDB, or background sync. Local-file fallback is not full offline parity. | Not implemented | None | — | — | — | — | — |
| T17 | Feature flags | No feature-flag framework or environment-controlled product toggles. | Not implemented | None | — | — | — | — | — |
| T18 | Database migrations | No relational database or migration framework. Compatibility changes are performed during JSON normalization. | Not implemented | None | — | — | — | — | — |

## Inventory Totals

- Verified implemented, partial, hidden, or deprecated capabilities: **94**.
- Core fishing workflow capabilities: **32**.
- Media, map, and environmental capabilities: **15**.
- Analytics capabilities counted: **20** (excluding two explicitly absent reports).
- User/preferences capabilities counted: **5**.
- Administrative/data-management capabilities counted: **7**.
- Technical capabilities counted: **15**.

These six mutually exclusive sections total 94. “Not implemented” rows are retained for audit completeness but excluded from the feature count.
