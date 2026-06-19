# Mobile Feature Matrix

This matrix maps every one of the 94 source-verified capabilities in `FEATURE_INVENTORY.md` to a mobile disposition and release tier. The existing application remains the behavioral source of truth.

## Classification Rules

- **Essential**: required for credible field use or safe operation on mobile.
- **Useful**: clearly valuable on mobile but not required to record a trip safely.
- **Optional**: parity or convenience that can follow the first release.
- **Unsuitable**: should remain server/desktop-only, be replaced by a native equivalent, or be retired.
- **Tier 1**: launch critical.
- **Tier 2**: important after launch.
- **Tier 3**: defer, retain server-side, or retire.

Every Tier 1 capture workflow must be local-first. “Cached” means readable offline after initial download; “full” means create/edit/delete locally with a durable outbox.

## Core Fishing Features

| ID | Feature | Mobile value | Tier | Current → recommended mobile workflow | Layout and input | Offline requirement | Challenges / performance | Decision justification |
|---|---|---:|---:|---|---|---|---|---|
| C01 | Trip logging | Essential | 1 | Modal CRUD → Trips tab, Start Trip, autosaved draft, End Trip, later edit/delete. | List + full-screen wizard; taps, pickers, keyboard. | Full; never block save on network. | Long forms, accidental closure; incremental writes. | The mobile app fails its field mission without trip capture. |
| C02 | Trip basics | Essential | 1 | One long section → short Start Trip sheet, expandable details, automatic time/hour calculation. | Two-column only on tablets; date/time/select controls. | Full with cached choices. | Fast one-handed entry and overnight trips. | Minimum context for every trip. |
| C03 | Trip list search | Useful | 1 | Toolbar search → native search header with recent queries and offline FTS. | Search field, result cards. | Search local database. | Index notes/species/gear without loading all trips. | Needed to retrieve prior patterns in the field. |
| C04 | Trip filtering | Useful | 1 | Inline selects → filter sheet with chips for target/method/year. | Bottom sheet, multi-select chips. | Local filters. | Preserve state without clutter. | Core retrieval with modest effort. |
| C05 | Trip sorting | Useful | 2 | Table/header sorting → compact sort menu. | Bottom sheet/radio list. | Local. | Avoid desktop-style sortable columns. | Useful but newest-first is adequate at launch. |
| C06 | Trip summary/report | Essential | 1 | Large dialog → scrollable Trip Detail with overview and section tabs. | Header metrics, collapsible cards, sticky actions. | Full cached detail and local media thumbnails. | Large nested records; virtualize timeline/media. | Review and edit are central to trust and parity. |
| C07 | People tracking | Useful | 1 | Repeated text rows → cached picker with quick add and recent people. | Searchable picker/chips. | Full. | Duplicate names and identity merge. | Required for existing attribution semantics. |
| C08 | Species tracking | Essential | 1 | Selects/settings → searchable recent/favorite species picker with add. | Picker, favorites, optional keyboard. | Full cached list and local additions. | Fast selection with gloves/wet hands. | Required by target and catch capture. |
| C09 | Method tracking | Essential | 1 | Method select changes form → prominent method choice at trip start. | Segmented favorites + full picker. | Full. | Changing method after entries may hide data; warn, do not discard. | Controls the complete capture model. |
| C10 | Location tracking (waterbodies) | Essential | 1 | Settings map-pin CRUD → nearby/recent waterbody picker and map/list manager. | Map + list; GPS locate, map long-press, coordinate fields. | Full; cache pins and basic map region where licensing permits. | Map tiles offline, GPS permissions, duplicates. | Trips and weather depend on locations. |
| C11 | Launch tracking | Useful | 1 | Nested launch manager → launch picker filtered by waterbody; “Use current location.” | List/map bottom sheet. | Full. | Accurate pin capture and parent relationship. | Launch coordinates improve field speed and weather accuracy. |
| C12 | Water conditions | Essential | 1 | Conditions form → quick condition card, recent values, optional later completion. | Numeric keyboard, unit suffixes, select chips. | Full. | Typed legacy strings versus normalized numeric input. | Core fishing evidence. |
| C13 | Manual weather tag | Useful | 1 | Select → one-tap condition chips; never overwritten by API data. | Chips + More picker. | Full. | Keep user observation separate from enrichment. | Cheap, valuable field context. |
| C14 | Trolling setup timeline | Essential | 1 | Repeated setup rows → live Spread screen with active rods, Start/Change/Stop actions. | Horizontal rod cards or schematic; taps, time defaults. | Full and event-oriented. | Complex one-handed updates; preserve exact timing and IDs. | Defining product workflow. |
| C15 | Deepest-rigger marker | Useful | 1 | Checkbox → single-select badge on active downriggers. | Toggle/badge on setup card. | Full. | Enforce at most one active deepest rigger per interval if product chooses; preserve legacy data. | Small input with analytical value. |
| C16 | Setup-line catch resolution | Essential | 1 | Setup-line select → quick catch starts by tapping the producing rod. | Active setup cards and fallback picker. | Full. | Stable IDs across offline edits and setup changes. | Prevents duplicate gear entry and preserves analytics. |
| C17 | Landed catch logging | Essential | 1 | Expandable row → Quick Catch flow with defaults, then optional detail/media. | Full-screen sheet; large controls, camera/GPS actions. | Full including media references. | Must save in seconds; crash-safe drafts. | Primary in-field action. |
| C18 | Multi-fish count convention | Optional | 3 | Imported hidden quantity → explicitly decide single fish versus quantity before mobile UI. | If retained, stepper default 1. | Full if implemented. | Ambiguous semantics and analytics compatibility. | Product decision is required; do not perpetuate hidden behavior at launch. |
| C19 | Lost fish logging | Essential | 1 | Separate repeated row → Quick Lost action beside Quick Catch. | Short sheet; rod, time, possible species, notes. | Full. | Must remain excluded from landed totals. | Core pattern evidence and explicit existing behavior. |
| C20 | Trolling fish context | Essential | 1 | Many conditional fields → prefill from active setup/GPS; progressive disclosure by presentation. | Presentation-specific panels, numeric keypad, compass picker. | Full. | Speed/depth units and rapid entry. | Required for trolling parity and pattern analysis. |
| C21 | Casting retrieve notes | Useful | 2 | Text field → presets plus optional text/voice note. | Chips + text/dictation. | Full. | Free-text consistency. | Valuable outside trolling but not launch-critical. |
| C22 | Catch GPS override | Essential | 1 | Manual coordinates/photo fallback → automatic current GPS with visible accuracy, edit pin/manual override. | GPS button, map pin, coordinate editor. | Full; no network required for coordinates. | Permission denial, stale fixes, accuracy, privacy. | Mobile provides materially better catch positioning. |
| C23 | Trip notes and observations | Essential | 1 | Text area → autosaved notes with keyboard and OS dictation. | Full-width editor, quick prompts. | Full. | Long text and draft recovery. | Captures the “next time” reasoning. |
| C24 | Catch notes | Useful | 1 | Text area → optional short notes with dictation. | Compact editor/voice keyboard. | Full. | Avoid slowing Quick Catch. | Existing field with low implementation cost. |
| C25 | Lure/bait library | Essential | 1 | CRUD grid/dialog → cached searchable lure picker; basic add/edit at launch, rich library later. | List/cards, scan/photo shortcut, form. | Read/write full. | Large inventories, image caching, “bait” naming ambiguity. | Setup/catch capture depends on reusable lures. |
| C26 | Flasher library | Essential | 1 | CRUD grid/dialog → same mobile inventory pattern as lures. | Searchable list/cards. | Read/write full. | Image cache and inline creation. | Required for trolling parity. |
| C27 | Reel inventory | Useful | 2 | Wide table/dialog → searchable inventory and detail screen. | List + detail/edit form. | Cached; edits local-first. | Many specification fields. | Existing setups can resolve with cached records; full management can follow. |
| C28 | Rod inventory | Useful | 2 | Wide table/dialog → searchable inventory and detail screen. | List + detail/edit form. | Cached; edits local-first. | Dense specifications. | Same rationale as reels. |
| C29 | Rod/reel combos | Useful | 1 | Combo CRUD/select → favorite setup shortcuts in spread creation. | Compact picker and pair editor. | Full. | References must survive offline gear edits. | Major accelerator for launch-critical trolling setup. |
| C30 | Line-spooling history | Optional | 3 | Dense reel subtable → reel detail timeline and maintenance editor. | Timeline/list; date and structured inputs. | Cached/editable offline. | Data density, low field urgency. | Better managed after launch. |
| C31 | Trolling spread diagram | Useful | 2 | SVG summary → touch-friendly live/summary schematic with tap targets. | Landscape-capable schematic + accessible list. | Cached/local render. | Small screens and overlapping lines; avoid heavy redraw. | High-value comprehension, not needed to save data. |
| C32 | Event timeline | Useful | 2 | Filtered summary timeline → chronological trip activity feed with edit shortcuts. | Virtualized list, filter chips. | Full local. | Merge/sort large media and event sets. | Valuable review tool after capture is stable. |

## Media, Mapping, and Environmental Features

| ID | Feature | Mobile value | Tier | Current → recommended mobile workflow | Layout and input | Offline requirement | Challenges / performance | Decision justification |
|---|---|---:|---:|---|---|---|---|---|
| E01 | Trip media uploads | Essential | 1 | File input/queue → camera or library capture stored locally, attached immediately, uploaded later. | Camera/library action sheet, caption editor. | Full local files + outbox. | Storage pressure, compression, HEIC/video, retries. | Native capture is a primary mobile advantage. |
| E02 | Catch media uploads | Essential | 1 | File input → camera embedded in Quick Catch and post-catch detail. | Camera-first flow, thumbnail strip. | Full local files + outbox. | Never delay catch save for upload. | Core field evidence and GPS fallback. |
| E03 | Gear media uploads | Useful | 2 | File input → camera/library on gear detail. | Single hero image/media picker. | Local pending upload. | Lower urgency; cache management. | Useful inventory enhancement. |
| E04 | Media metadata extraction | Useful | 1 | Browser parser → capture native timestamp/GPS at creation and parse imported assets where available. | Automatic with reviewable metadata. | Local. | Platform metadata differences and privacy permissions. | Needed for timeline/map parity without network. |
| E05 | Image preview generation | Essential | 1 | Server-only thumbnail → local thumbnail/compression immediately; server still creates canonical preview. | Invisible background operation. | Required locally. | Memory spikes on large images; queue work and cap dimensions. | Smooth offline gallery and upload efficiency. |
| E06 | Photo Queue | Useful | 1 | Server holding queue → local Capture Inbox plus existing server queue compatibility. | Inbox grid, multi-select Assign. | Full local; sync queue status later. | Duplicate assignment and two queue domains. | Mobile makes capture-first assignment-later even more valuable. |
| E07 | Media Gallery | Useful | 2 | Server gallery → paged local+remote gallery with sync badges. | Grid, filters, full-screen viewer. | Cached thumbnails; remote originals on demand. | Large libraries and video bandwidth. | Not required to log a trip. |
| E08 | Orphan-media cleanup | Unsuitable | 3 | Gallery cleanup → keep as authenticated maintenance/web function; mobile may show storage status only. | No launch screen. | None. | Destructive and server-global. | Poor field workflow and higher deletion risk. |
| E09 | Global fish/media map | Useful | 2 | Leaflet map/list → native map with clustering and list fallback. | Full-screen map, filter sheet, result drawer. | Cached records; offline basemap optional and bounded. | Tile licensing/storage, clustering, battery. | Valuable discovery, not capture-critical. |
| E10 | Trip map | Useful | 2 | Embedded summary map → Trip Detail map section. | Map card opening full screen. | Coordinates always; basemap best-effort offline. | Same map constraints at smaller scope. | Enhances review after launch. |
| E11 | Automatic trip weather | Useful | 1 | Fetch during preview/save → capture coordinates/time locally; enrich when online without blocking. | Status card and refresh action. | Queue enrichment; retain last result. | Provider availability and stale data. | Existing behavior should survive, but network must never gate save. |
| E12 | Catch-time weather | Useful | 1 | Fetch on trip save → attach catch context asynchronously from stored time/GPS. | Invisible with detail status. | Deferred enrichment. | Idempotency and correct source selection. | Preserves analytical evidence. |
| E13 | Weather trends/front classification | Useful | 2 | Browser calculation → one canonical backend/domain service; cache result. | Summary card/chips. | Read cached; compute after data arrives. | Eliminate JS/Python drift. | Analysis, not immediate capture. |
| E14 | Marine wave enrichment | Useful | 2 | Fetch and autofill → online enrichment with explicit user-value precedence. | Conditions card with source/status. | Cached; manual entry always available. | Inland availability and provider gaps. | Important for trolling but safe to defer beyond core weather. |
| E15 | Sun/moon enrichment | Useful | 2 | Fetch on save → background enrichment and cached trip context. | Conditions detail. | Cached/deferred. | Time zones and provider availability. | Useful analytical context, not capture-critical. |

## Analytics Features

| ID | Feature | Mobile value | Tier | Current → recommended mobile workflow | Layout and input | Offline requirement | Challenges / performance | Decision justification |
|---|---|---:|---:|---|---|---|---|---|
| A01 | Dashboard totals | Useful | 1 | Persistent desktop sidebar → Home cards with recent trip and sync state. | Scrollable cards; no input. | Compute locally from synced data. | Incremental aggregates for large logs. | Gives immediate confidence and orientation. |
| A02 | Top species and lures | Useful | 2 | Sidebar bars → Home insight cards linking to reports. | Compact bars/list. | Local. | Keep calculations responsive. | Helpful but not required for launch capture. |
| A03 | Fishing streak metrics | Optional | 3 | Hidden branding metric → optional Home insight. | Small card. | Local. | Low value compared with fishing patterns. | Defer hidden/non-core behavior. |
| A04 | Advanced KPI summary | Useful | 2 | Dense KPI grid → Analytics overview with horizontal/stacked cards. | Cards and drill-down. | Local or cached server aggregate. | Calculation cost and consistent filters. | Important parity after launch. |
| A05 | Analytics filters | Useful | 2 | Large toolbar → reusable filter sheet with saved scopes. | Chips, searchable pickers, Apply/Clear. | Local. | Many dimensions on small screen. | Required when advanced analytics ship. |
| A06 | Outcome analytics | Useful | 2 | Tables → outcome cards and accessible chart/list. | Donut/stacked bar + table view. | Local. | Lost/landed semantics must remain exact. | High-value first analytics group. |
| A07 | Time/bite windows | Useful | 2 | Tables → time histogram and bite-window cards. | Chart + list. | Cached weather data. | Time zones/overnight events. | Useful after enrichment is stable. |
| A08 | Best pattern combinations | Useful | 2 | Wide table → ranked pattern cards with confidence and “use next trip” action. | Ranked list/detail. | Local. | Explainability and sparse samples. | Directly serves product purpose. |
| A09 | Lure efficiency | Useful | 2 | Wide table/chart → sortable lure performance list and detail. | List, compact bars, filter sheet. | Local. | Accurate effort-time calculations. | High mobile review value. |
| A10 | Lure spread context | Optional | 3 | Wide diagnostic table → lure detail insight section. | Cards/list. | Local. | Complex explanation on small screen. | Defer deep analysis. |
| A11 | Lure dimensions | Useful | 2 | Type/color tables → segmented analytics list. | Tabs/chips. | Local. | Color text normalization. | Moderate analytical value. |
| A12 | Flasher/combo analytics | Useful | 2 | Trolling tables → trolling analytics cards. | Ranked list. | Local. | Timed setup completeness. | Important for product audience. |
| A13 | Trolling setup analytics | Useful | 2 | Multiple tables → grouped Trolling report with drill-down. | Sectioned list/charts. | Local. | Many dimensions and confidence labels. | Core post-launch differentiation. |
| A14 | FOW/depth distribution | Useful | 2 | Tables → histograms and exact-value list. | Charts + accessible data list. | Local. | Current typed strings require parsing/normalization. | Strong pattern value. |
| A15 | Technique/location/people | Useful | 2 | Tables → segmented comparisons. | Ranked cards/list. | Local. | Privacy and small samples. | Useful parity. |
| A16 | Seasonal analysis | Optional | 3 | Month table → month/season chart; no new year-over-year claim. | Line/bar chart. | Local. | Current feature is partial. | Preserve only verified month behavior initially. |
| A17 | Condition analytics | Useful | 2 | Many tables → grouped Conditions report with availability indicators. | Cards/charts/filter sheet. | Cached data. | Sparse weather coverage and heavy calculations. | Valuable, but depends on robust enrichment. |
| A18 | Sortable tables/charts | Optional | 3 | Desktop table/chart toggles → mobile-native chart with accessible ranked list; omit arbitrary wide tables. | Chart/list toggle. | Local. | Screen width, accessibility, chart library weight. | Preserve information, not desktop presentation mechanics. |
| A19 | Confidence/efficiency labels | Useful | 2 | Legend and columns → badges with tap-for-definition. | Badge, help sheet. | Local. | Avoid overstating evidence. | Necessary when performance reports ship. |
| A20 | Stats diagnostics | Optional | 3 | Deep-link table → Data Quality screen with fix actions. | Issue list grouped by trip. | Local. | Cross-screen deep links and false positives. | Valuable maintenance, not field capture. |

## User Preferences

| ID | Feature | Mobile value | Tier | Current → recommended mobile workflow | Layout and input | Offline requirement | Challenges / performance | Decision justification |
|---|---|---:|---:|---|---|---|---|---|
| U01 | Measurement preferences | Essential | 1 | Settings grid → Units screen; preserve source units and display conversion. | Grouped pickers. | Full and available before sync. | Typed legacy strings cannot be safely converted automatically. | Every capture label depends on units. |
| U02 | Time format | Useful | 1 | Select → system-default suggestion with explicit 12/24 override. | Radio rows. | Full. | Locale versus stored preference. | Small parity feature affecting all times. |
| U03 | Predefined fields | Useful | 2 | Dense settings lists → per-category manager, reorder/favorite/recent support. | List editor, add, delete confirmations. | Full; sync changes. | Deletes must not rewrite historical text. | Launch can use cached lists and inline add; full management can follow. |
| U04 | Chop ranges | Useful | 2 | Editable table → ordered range editor with validation and preview. | List of thresholds, numeric keypad. | Full. | Unit conversion and open-ended final range. | Useful but rarely changed in field. |
| U05 | Direct-file fallback | Unsuitable | 3 | `file:` localStorage mode → replace with native SQLite offline mode; do not reproduce. | None. | Superseded. | Maintaining two offline models would create drift. | Native offline is the correct replacement. |

## Administrative and Data-Management Features

| ID | Feature | Mobile value | Tier | Current → recommended mobile workflow | Layout and input | Offline requirement | Challenges / performance | Decision justification |
|---|---|---:|---:|---|---|---|---|---|
| D01 | JSON export | Useful | 2 | Browser download → generate/request export and invoke native share sheet. | Settings action + progress. | Local export possible; server export when online. | Media binaries remain separate; privacy. | Important ownership feature, not launch capture. |
| D02 | JSON import | Optional | 3 | File input/replace → document picker, validation preview, explicit merge/replace. | Wizard with diff/errors. | Parse locally; server commit online. | Existing shallow validation is unsafe on mobile. | Defer until versioned validation exists. |
| D03 | Local/NAS backup | Unsuitable | 3 | Host shell script → retain server-side; mobile only reports last successful backup if endpoint added. | Optional status card. | Cached status only. | Host credentials must never live in app. | Infrastructure responsibility. |
| D04 | Nightly backup installation | Unsuitable | 3 | Cron installer → remain host administration. | None. | None. | Platform cannot administer server cron safely. | Server-only. |
| D05 | Docker launch lifecycle | Unsuitable | 3 | Shell/Compose → remain deployment documentation. | None. | None. | Not an app workflow. | Server-only. |
| D06 | Location deletion guard | Useful | 2 | Client guard → retain server enforcement and mobile reference warning. | Confirmation sheet listing affected trips. | Local precheck; server authoritative. | Offline deletion may conflict with remote references. | Needed when full location management ships. |
| D07 | Gear referential cleanup | Useful | 2 | Client cascade → server/domain mutation with impact preview and tombstone. | Confirmation with reference count. | Queue deletion; resolve on sync. | Current client-only cascade is unsafe with offline replicas. | Required for safe mobile gear deletion. |

## Technical, Integration, and Hidden Capabilities

| ID | Feature | Mobile value | Tier | Current → recommended mobile workflow | Layout and input | Offline requirement | Challenges / performance | Decision justification |
|---|---|---:|---:|---|---|---|---|---|
| T01 | JSON persistence API | Essential infrastructure | 1 | Whole-document GET/PUT → keep GET for bootstrap/legacy web; add authenticated revisioned entity sync for mobile. | No direct screen; sync status UI. | Durable SQLite + outbox. | Lost updates, payload growth, auth, idempotency. | Current PUT is not safe for offline mobile. |
| T02 | JSON normalization | Essential infrastructure | 1 | Duplicate JS/Python normalization → canonical versioned domain contract on server plus matching mobile migrations. | No screen. | Migrations run locally. | Compatibility and unknown legacy fields. | Required to preserve source data safely. |
| T03 | UUID/slug identity | Essential infrastructure | 1 | Browser IDs → client-generated UUIDs for offline entities; server preserves IDs. | No screen. | Required. | Collision is negligible; idempotency keys separate. | Enables offline creation and references. |
| T04 | Weather proxy APIs | Useful infrastructure | 1 | Browser proxy calls → reuse behind authenticated mobile client. | Weather status only. | Deferred queue. | Secure exposure, rate limits, caching. | Existing proxy logic is reusable. |
| T05 | Marine proxy API | Useful infrastructure | 2 | Reuse with authentication/caching. | Conditions status. | Deferred/cached. | Provider gaps. | Can follow basic weather. |
| T06 | Astronomy proxy API | Useful infrastructure | 2 | Reuse with authentication/caching. | Conditions status. | Deferred/cached. | Provider/timezone behavior. | Can follow launch. |
| T07 | Media API | Essential infrastructure | 1 | Immediate multipart upload → add auth, size limits, checksums, resumable/idempotent upload sessions; retain storage/preview core. | Upload queue screen/status. | Local files and retry outbox. | Large video, duplicate retries, background limits. | Required for camera-first mobile. |
| T08 | SPA route serving | Unsuitable | 3 | Flask HTML routes → retain for web app; native app uses its own navigation. | None. | None. | No benefit to duplicating route semantics. | Existing web remains available during migration. |
| T09 | Route-based initial view | Unsuitable | 3 | Path-derived panel → native deep links and navigation stacks. | Native router. | Route state local. | Link mapping to entity IDs. | Replace, do not port. |
| T10 | Responsive/mobile layout | Useful reference | 3 | Responsive CSS → redesign native components; reuse information hierarchy only. | Native tabs/stacks/sheets. | N/A. | HTML/CSS cannot be reused directly. | Reference, not implementation asset. |
| T11 | No-store responses | Useful infrastructure | 1 | Global no-store → keep for sensitive API responses; mobile maintains explicit local cache. | No screen. | Local cache governed by app. | HTTP cache versus application cache. | Compatible and privacy-conscious. |
| T12 | Environment configuration | Useful infrastructure | 1 | Host env vars → retain server settings; add mobile server URL/enrollment configuration and build-time defaults. | Connection setup screen. | Store endpoint and credentials securely. | LAN discovery, TLS, changing addresses. | Self-hosted mobile needs a safe connection model. |
| T13 | Backend bulk weather refresh | Optional | 3 | Uncalled routine → secure server maintenance job or remove; never run as a mobile batch. | Optional admin status. | None. | Drift from interactive enrichment. | Not a field feature. |
| T14 | Removed Pattern Finder residue | Unsuitable | 3 | Stale CSS/docs → do not migrate; preserve only verified Best Pattern tables. | None. | None. | Scope confusion. | Explicitly deprecated. |
| T15 | Deprecated `tripTypes` cleanup | Unsuitable | 3 | Implicit cleanup → one documented import migration; exclude from new schema. | None. | Migration may run locally. | Historical imports. | Compatibility only, not a mobile feature. |

## Tier Summary

### Tier 1 — Launch Critical

Launch centers on offline trip/catch/lost-fish capture, trolling setup resolution, reusable fishing choices, local camera/GPS/media, basic retrieval/summary, preferences, weather deferral, and secure synchronization. Infrastructure work in T01/T02/T07/T12 is a launch dependency even though it is not visible UI.

### Tier 2 — Important

Tier 2 restores rich maps, advanced gear management, spread/timeline views, environmental detail, most analytics, preference administration, safe referential deletion, exports, and media gallery parity.

### Tier 3 — Nice to Have, Server-Only, or Retire

Tier 3 contains deep maintenance analytics, line history, import, hidden/legacy behavior, host administration, desktop routing/presentation mechanics, and deprecated residue. “Unsuitable” does not mean delete the existing server capability; it means do not reproduce it as a native mobile workflow.
