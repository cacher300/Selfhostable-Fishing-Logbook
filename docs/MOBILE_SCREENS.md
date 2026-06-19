# Mobile Screen Inventory

## Navigation Model

Recommended launch navigation uses four bottom tabs:

1. **Home** — active-trip state, quick actions, recent trips, basic totals, sync status.
2. **Trips** — search/filter/history and trip detail.
3. **Gear** — lure/flasher and setup reference libraries; expanded inventory in Tier 2.
4. **More** — map, analytics, gallery, settings, data tools.

When a trip is active, a persistent **Trip Bar** appears above the tabs with elapsed time, location, active rods, Quick Catch, Lost Fish, and End Trip. The active-trip workspace is a stack with Overview, Spread, Activity, and Notes sections. Capture flows use full-screen sheets so they are not lost when the OS interrupts the app.

API references below describe the target architecture. “Sync API” means the required authenticated revisioned mobile API, not the current unsafe whole-document PUT.

## Tier 1 Screens

### M01 — Server Connection and Device Enrollment

- **Purpose:** Connect the app to a self-hosted instance securely.
- **Primary actions:** Scan enrollment QR, enter HTTPS server URL/code, test connection, name device, retry.
- **Data:** Server identity, schema/API compatibility, device credentials, last error.
- **Entry:** First launch; Settings > Connection.
- **API:** New enrollment/auth/health endpoints; initial `GET /api/logbook` during transitional bootstrap.
- **Offline:** Previously enrolled users can enter the app offline; first enrollment requires server access.
- **Wireframe:** Logo/title → server URL or Scan QR → connection result → privacy explanation → Connect.

### M02 — Home

- **Purpose:** Immediate field dashboard and recovery point.
- **Primary actions:** Start/continue trip, Quick Catch/Lost when active, open recent trip, sync now.
- **Data:** Active draft, recent trips, trips/fish/hours totals, pending sync/media count.
- **Entry:** Default tab.
- **API:** None for render; background sync when appropriate.
- **Offline:** Fully operational from SQLite.
- **Wireframe:** Sync banner → active-trip hero or Start Trip → two large quick-action buttons → recent trips → compact totals.

### M03 — Trips

- **Purpose:** Browse and retrieve trip history.
- **Primary actions:** Search, filter, start trip, open trip, sort later.
- **Data:** Date/title/location/method/target/hours/landed/lost/sync state.
- **Entry:** Trips tab; Home “See all.”
- **API:** Incremental sync only.
- **Offline:** Full local list/search/filter.
- **Wireframe:** Search header → filter chips → virtualized trip cards → floating Start Trip button.

### M04 — Trip Filter Sheet

- **Purpose:** Apply target, method, year, and later advanced filters.
- **Primary actions:** Select, clear, apply.
- **Data:** Cached option lists and available years.
- **Entry:** Trips filter button.
- **API:** None.
- **Offline:** Full.
- **Wireframe:** Draggable sheet → grouped chips/pickers → result count → Clear/Apply sticky footer.

### M05 — Start Trip

- **Purpose:** Create the minimum viable active trip quickly.
- **Primary actions:** Choose waterbody/launch, date/start time, target, method, intent; start.
- **Data:** Trip basics, recent/favorite choices, current location suggestion.
- **Entry:** Home/Trips Start Trip.
- **API:** None before local commit; optional weather request after start.
- **Offline:** Full.
- **Wireframe:** Waterbody and launch → target/method → time/intent → optional title → Start Trip. Advanced fields collapsed.

### M06 — Active Trip Workspace

- **Purpose:** Operate the trip while fishing.
- **Primary actions:** Quick Catch, Lost Fish, setup change, conditions, notes, media, end trip.
- **Data:** Elapsed time, conditions, active setups, catch/lost counts, sync state.
- **Entry:** Active Trip Bar/Home.
- **API:** None for actions; opportunistic sync/enrichment.
- **Offline:** Full.
- **Wireframe:** Trip header/timer → Catch and Lost buttons → segmented Overview/Spread/Activity/Notes → End Trip.

### M07 — Trip Overview/Edit

- **Purpose:** View/edit basics and conditions without one giant form.
- **Primary actions:** Edit fields, refresh weather, manage people, open location.
- **Data:** All trip scalar fields, people, environmental snapshot.
- **Entry:** Active Trip > Overview; saved Trip Detail > Edit.
- **API:** Weather proxies when online; sync later.
- **Offline:** Full edits; weather marked pending.
- **Wireframe:** Summary cards for Basics, Conditions, People, Weather; each opens a focused sheet.

### M08 — Waterbody/Launch Picker

- **Purpose:** Select a saved fishing location quickly.
- **Primary actions:** Search, choose nearby/recent, add waterbody/launch.
- **Data:** Locations, launches, coordinates, distance from current fix.
- **Entry:** Start/Edit Trip.
- **API:** Sync only.
- **Offline:** Full cached selection and creation.
- **Wireframe:** Nearby/Recent tabs → search → location rows with nested launch → Add button.

### M09 — Location Editor and Pin Picker

- **Purpose:** Create/edit waterbody or launch coordinates.
- **Primary actions:** Use current GPS, move map pin, enter coordinates/name, save.
- **Data:** Location/launch record and GPS accuracy.
- **Entry:** Picker/Add; Settings location manager.
- **API:** Sync later; map tiles as available.
- **Offline:** Coordinates and save work without network; basemap may be absent unless cached.
- **Wireframe:** Name → Use Current Location/accuracy → map → latitude/longitude → Save.

### M10 — Live Trolling Spread

- **Purpose:** Manage active timed setup lines.
- **Primary actions:** Add rod, start/stop/change setup, mark deepest rigger, tap rod to record fish.
- **Data:** Active/historical `gearUsed`, combo/rod/reel/lure/flasher/presentation/side.
- **Entry:** Active Trip > Spread.
- **API:** None for local use.
- **Offline:** Full.
- **Wireframe:** Port/Center/Starboard lanes with large rod cards; Add Rod; stopped/history below. Accessible list mode available.

### M11 — Setup Line Editor

- **Purpose:** Create or change one setup line with correct timing.
- **Primary actions:** Select side/label/combo/gear/presentation, start/stop, deepest rigger.
- **Data:** Gear libraries, presentations, current trip time.
- **Entry:** Spread Add/Change; catch fallback picker.
- **API:** None.
- **Offline:** Full.
- **Wireframe:** Start/change time → combo shortcut → rod/reel → lure/flasher → presentation-specific options → Save.

### M12 — Quick Catch

- **Purpose:** Save a landed fish in seconds.
- **Primary actions:** Select producing rod, species/person, release status; capture GPS/time automatically; Save & Camera or Save.
- **Data:** Catch fields, active setup, recent defaults, GPS accuracy.
- **Entry:** Persistent Quick Catch; tap spread rod.
- **API:** None before local save.
- **Offline:** Full and transactionally durable.
- **Wireframe:** Rod hero → species/person → landed/released → auto time/GPS status → Save; “More details” expands trolling/depth/size fields.

### M13 — Catch Detail/Edit

- **Purpose:** Complete or correct all landed-catch fields and media.
- **Primary actions:** Edit measurements/context/notes/GPS, add/remove media.
- **Data:** Complete catch, setup resolution, catch weather state.
- **Entry:** Quick Catch confirmation; Trip Activity/Detail.
- **API:** Media/weather sync as available.
- **Offline:** Full.
- **Wireframe:** Catch summary/photo → Details, Trolling/Casting, Location, Weather, Notes, Media cards → Save status.

### M14 — Quick Lost Fish

- **Purpose:** Record a lost fish without inflating landed totals.
- **Primary actions:** Choose rod/possible species/time/context, save.
- **Data:** Lost-fish fields and active setup.
- **Entry:** Persistent Lost button; spread rod menu.
- **API:** None.
- **Offline:** Full.
- **Wireframe:** Distinct “Lost” color/header → rod → possible species → optional context/notes → Save.

### M15 — Trip Activity

- **Purpose:** Review catches, lost fish, and setup events during a trip.
- **Primary actions:** Filter, open/edit event, add missing event.
- **Data:** Local merged event timeline.
- **Entry:** Active Trip > Activity; saved Trip Detail.
- **API:** None.
- **Offline:** Full.
- **Wireframe:** Filter chips → chronological virtualized rows with event icon/time/summary/sync badge.

### M16 — Camera Capture

- **Purpose:** Capture catch/trip/gear media with context.
- **Primary actions:** Photograph/record, retake, accept, optionally annotate.
- **Data:** Local URI, timestamp, GPS, orientation, target attachment.
- **Entry:** Quick Catch, Catch Detail, Notes, Capture Inbox, Gear Detail.
- **API:** None until queued upload.
- **Offline:** Full.
- **Wireframe:** Native camera preview → shutter/video → review → Use Photo. Permission-denied education state required.

### M17 — Capture Inbox / Photo Queue

- **Purpose:** Capture now and assign later.
- **Primary actions:** Capture/import, multi-select, assign to trip/catch/gear, delete local unassigned item.
- **Data:** Local pending media plus server queue items after sync.
- **Entry:** Home quick action; More; attachment pickers.
- **API:** Existing queue list/claim plus new idempotent upload flow.
- **Offline:** Full local inbox.
- **Wireframe:** Sync/status header → thumbnail grid with pending badges → selection toolbar → Assign/Delete.

### M18 — Trip Detail

- **Purpose:** Mobile replacement for the trip summary dialog.
- **Primary actions:** Edit, delete, share/export later, open catch/setup/map/media detail.
- **Data:** Metrics, basics, conditions/weather, notes, spread, activity, catches/lost, media.
- **Entry:** Trips/Home/Map/Analytics deep links.
- **API:** None to render cached data; lazy remote media fetch.
- **Offline:** Full record and cached thumbnails.
- **Wireframe:** Hero/title/date → metric strip → section cards → sticky Edit; heavy sections lazy-rendered.

### M19 — Gear Home

- **Purpose:** Find reusable fishing gear used by capture workflows.
- **Primary actions:** Search, switch Lures/Flashers/Combos, add/edit basics.
- **Data:** Gear identity, image thumbnail, type/color, usage summary.
- **Entry:** Gear tab; inline setup/catch picker.
- **API:** Sync/media upload.
- **Offline:** Full cached list and local changes.
- **Wireframe:** Search → type tabs → virtualized rows/cards → Add.

### M20 — Gear Picker

- **Purpose:** Select gear rapidly without leaving the setup/catch flow.
- **Primary actions:** Recent/favorite/search/select, inline create.
- **Data:** Relevant gear collection.
- **Entry:** Setup Line Editor, non-trolling Catch Detail.
- **API:** None.
- **Offline:** Full.
- **Wireframe:** Bottom sheet → Recent → search results → New item → selection returns to prior screen.

### M21 — Lure/Flasher/Combo Editor

- **Purpose:** Minimum launch CRUD for setup dependencies.
- **Primary actions:** Edit name/type/brand/color/notes/pairing, attach media later.
- **Data:** Lure/flasher/combo fields and references.
- **Entry:** Gear Home/Picker.
- **API:** Sync/media outbox.
- **Offline:** Full.
- **Wireframe:** Focused form with primary identity first; Save; destructive delete deferred or guarded.

### M22 — Units and Time Settings

- **Purpose:** Configure labels/display before field entry.
- **Primary actions:** Choose measurement units and clock format.
- **Data:** `settings.units`, `settings.timeFormat`.
- **Entry:** More > Settings; onboarding suggestion.
- **API:** Sync later.
- **Offline:** Full.
- **Wireframe:** Grouped rows with current value and native pickers; explanatory footer about typed legacy values.

### M23 — Sync Center

- **Purpose:** Make offline state understandable and recoverable.
- **Primary actions:** Sync now, inspect failures, retry media, resolve conflicts, view connection.
- **Data:** Last sync, pending mutations/media, errors, conflict records, server identity.
- **Entry:** Home sync banner; More > Sync.
- **API:** Auth, pull/push, upload endpoints.
- **Offline:** Fully displays queue and errors; actions wait for connectivity.
- **Wireframe:** Overall status → pending counts → failed/conflicted sections → per-item Retry/Resolve → connection details.

### M24 — Conflict Resolution

- **Purpose:** Resolve the rare edit/delete conflicts automation cannot safely merge.
- **Primary actions:** Keep mine, use server, field-by-field merge, duplicate as new trip.
- **Data:** Base/local/server versions and revisions.
- **Entry:** Sync Center notification.
- **API:** Conflict fetch and conditional mutation.
- **Offline:** Review cached conflict; final submission waits for server.
- **Wireframe:** Entity summary → conflicting fields only → local/server comparison → resolution action with warning.

### M25 — End Trip Review

- **Purpose:** Finish the active trip without forcing complete data entry.
- **Primary actions:** Set end time, review missing basics, see pending weather/media, save/end.
- **Data:** Trip status, counts, setup lines still active, diagnostics.
- **Entry:** Active Trip End Trip.
- **API:** None before local completion.
- **Offline:** Full.
- **Wireframe:** End time → active rods warning/stop all → summary → optional missing-data prompts → End Trip.

## Tier 2 Screens

### M26 — Map Explorer

- **Purpose:** Browse all geotagged catches and trip media.
- **Actions/data:** Filter species/category, cluster markers, open item/trip; local coordinate records and cached thumbnails.
- **Entry/API/offline:** More > Map; no API except sync/media; list fallback always offline, basemap best effort.
- **Wireframe:** Map → filter button → summary → bottom result drawer; toggle Map/List.

### M27 — Trip Map

- **Purpose:** Show one trip’s catches/media spatially.
- **Actions/data:** Filter, select marker, open catch; trip coordinates/media.
- **Entry/API/offline:** Trip Detail; no direct API; cached coordinates and optional map region.
- **Wireframe:** Map card/full-screen map → category chips → selected-item preview.

### M28 — Analytics Home

- **Purpose:** Organize mobile reports without reproducing one very long desktop page.
- **Actions/data:** Choose Overview, Patterns, Gear, Trolling, Conditions, Data Quality; show active filter summary.
- **Entry/API/offline:** More > Analytics; local calculations; fully available from synced data.
- **Wireframe:** KPI strip → report category cards → global filter chip row.

### M29 — Analytics Filter Sheet

- **Purpose:** Apply the existing method/threshold/dimension scope consistently.
- **Actions/data:** Edit filters, save scope, clear/apply; all cached option values.
- **Entry/API/offline:** Any analytics report; none; full local.
- **Wireframe:** Scope/method → minimum samples → dimension pickers → Include Lost → Apply.

### M30 — Analytics Report

- **Purpose:** Render each verified report in mobile form.
- **Actions/data:** Sort, switch accessible chart/list, open supporting trips, read confidence explanation.
- **Entry/API/offline:** Analytics category; no direct API if computed locally; full local.
- **Wireframe:** Title/filter summary → insight callout → compact chart → ranked list → methodology/help.

### M31 — Media Gallery/Viewer

- **Purpose:** Browse local and remote uploads.
- **Actions/data:** Filter, view, download/cache, open attachment; media metadata and sync state.
- **Entry/API/offline:** More > Media; gallery/media GET; cached thumbnails offline.
- **Wireframe:** Filtered thumbnail grid → full-screen swipe viewer → metadata/attachment link.

### M32 — Rod/Reel Inventory and Detail

- **Purpose:** Manage dense gear specifications and fish counts.
- **Actions/data:** Search/add/edit, open combos/line history; rod/reel fields and references.
- **Entry/API/offline:** Gear > More Types; sync/media; local-first.
- **Wireframe:** Type tab/list → detail hero → specs groups → usage → Edit.

### M33 — Predefined Field Manager

- **Purpose:** Manage all user-owned option lists.
- **Actions/data:** Select category, add/edit/delete/reorder/favorite; current top-level arrays.
- **Entry/API/offline:** Settings; sync; full local.
- **Wireframe:** Category list → option rows → Add → historical-value warning on delete.

### M34 — Chop Range Editor

- **Purpose:** Manage wave-height classification.
- **Actions/data:** Edit ordered labels/maximums and preview result.
- **Entry/API/offline:** Settings; sync; full local.
- **Wireframe:** Unit context → ordered range rows → sample preview → Save.

### M35 — Location Manager

- **Purpose:** Browse/edit/delete waterbodies and launches outside trip entry.
- **Actions/data:** Search/add/edit/delete; locations and trip reference counts.
- **Entry/API/offline:** Settings; sync; local edits with guarded delete.
- **Wireframe:** Waterbody cards with launch children → map/edit/delete actions.

### M36 — Export and Share

- **Purpose:** Preserve data ownership from mobile.
- **Actions/data:** Create local JSON export or request server export, share through OS sheet.
- **Entry/API/offline:** Settings > Data; `/api/export` or local serializer; local export works offline.
- **Wireframe:** Export scope explanation → Create → file size/date → Share.

## Tier 3 / Server-Preferred Screens

### M37 — Import Wizard

- **Purpose:** Safely preview and import JSON after versioned validation exists.
- **Actions/data:** Pick file, validate, inspect counts/errors, choose merge/replace, confirm.
- **Entry/API/offline:** Settings > Data; validation/import API; local parse possible but server confirmation required.
- **Wireframe:** File → validation summary → diff/conflicts → backup warning → Import.

### M38 — Line History

- **Purpose:** Manage reel spooling records.
- **Actions/data:** Add/edit/discard line entries; complete line history.
- **Entry/API/offline:** Reel Detail; sync; local-first.
- **Wireframe:** Current line hero → chronological entries → Add/Mark discarded.

### M39 — Data Quality

- **Purpose:** Mobile form of stats diagnostics.
- **Actions/data:** Filter issues, open/fix trip/setup, dismiss understood issue.
- **Entry/API/offline:** Analytics > Data Quality; local; full offline.
- **Wireframe:** Issue counts → grouped issue list → Fix button deep-links to exact editor.

## Screens Intentionally Not Built

- Docker/container controls, cron installation, and NAS credentials remain server administration.
- Orphan-media destructive cleanup remains in the authenticated web/admin surface.
- Deprecated Pattern Finder residue and `tripTypes` are not screens.
- The web app’s six URL panels, giant dialogs, and wide tables are information sources, not mobile navigation templates.
