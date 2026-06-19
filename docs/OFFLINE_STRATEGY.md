# Offline Strategy

## Offline Contract

The user must be able to start, operate, and end a fishing trip with no network and without losing data if the app is backgrounded, terminated, or the device reboots. Network access is an enhancement for synchronization, weather, remote media, and maps—not a prerequisite for field capture.

The mobile app must never show “saved” until the record and its synchronization intent are committed locally.

## Required Offline Workflows

### Trip logging

- Create an active trip from cached choices.
- Edit all trip fields and people.
- Calculate overnight duration locally.
- Add/change/stop setup lines and preserve event timing.
- End a trip while media, weather, and server sync remain pending.
- Recover the active trip from SQLite after process death.

### Catch and lost-fish logging

- Capture current time and optional GPS without network.
- Resolve to active setup lines and cached gear.
- Save landed and lost records as separate entities.
- Preserve partially completed Quick Catch drafts if interrupted.
- Permit later correction before or after synchronization.

### Photos and video

- Store captured originals in the app filesystem immediately.
- Generate a bounded local thumbnail and record metadata locally.
- Attach the local media ID to the catch/trip/gear transactionally.
- Upload independently later; record save never waits for upload.
- Keep media through app restarts and report storage pressure.

### GPS

- Request a foreground location fix at catch/media capture.
- Store latitude, longitude, accuracy, fix timestamp, and provider status.
- Accept a last-known fix only when clearly labeled and within a defined age/accuracy policy.
- Permit manual coordinates or map-pin correction.
- Map coordinates remain useful offline even when basemap tiles are unavailable.

## Local Storage Requirements

### SQLite domain data

- All trips and nested fishing entities needed for field work.
- Reusable gear, people, locations/launches, option lists, and preferences.
- Weather/astronomy/marine snapshots already downloaded.
- Entity revision, local edit timestamp, deleted tombstone, and dirty/sync state.
- Active-trip marker and autosaved form drafts.
- Mutation outbox, conflict records, sync cursor, and error history.

### Filesystem data

- Pending and cached media originals.
- Local thumbnails/previews.
- Temporary capture files only until promoted into durable app storage.
- Optional bounded map cache if the chosen provider/license supports it.

### Secure storage

- Access/refresh credentials, device identity secret, and trusted server fingerprint/identity data.
- Do not store fishing records, photos, or the SQLite database in SecureStore.

## Local Schema Principles

Use entity tables rather than one JSON blob. Preserve the server IDs and relationships:

- Trip owns setup lines, catches, lost fish, and trip-media attachments.
- Catches/lost fish reference setup lines and people.
- Setup lines reference combo/rod/reel/lure/flasher records.
- Locations own launches.
- Media is independent and attaches through relationship rows so upload lifecycle does not rewrite the domain record.

Every mutable table needs at least `id`, `revision`, `createdAt`, `updatedAt`, `deletedAt`, and local sync state. Server-generated timestamps are not substitutes for a revision token.

## Mutation Outbox

Each user action writes domain changes and an outbox operation in the same SQLite transaction.

An outbox record contains:

- Unique `deviceMutationId` for idempotency.
- Entity type/ID and operation (`create`, `update`, `delete`).
- Base server revision observed before the edit.
- Changed fields or canonical entity payload.
- Local creation time, attempt count, next attempt, and last error.
- Dependency IDs, such as a catch depending on a locally created trip/setup line.

The sync coordinator submits operations in dependency order. Repeating a request with the same mutation ID must return the original result, not create a duplicate.

## Media Outbox

Media sync is separate because files are larger and fail differently.

Recommended states:

`local` → `queued` → `uploading` → `uploaded` → `attached` or `failed`.

Requirements:

- Compute a checksum and retain stable local media ID.
- Negotiate/create an idempotent upload session.
- Support bounded retries and, for large video, resumable chunks if production usage warrants it.
- Upload thumbnails/images before large videos when bandwidth is poor.
- Attach the returned remote reference through an idempotent domain mutation.
- Never delete the local original until remote verification and retention policy permit it.
- Detect missing local files and show a recoverable error rather than silently dropping the attachment.

## Synchronization Protocol

### Initial synchronization

1. Authenticate/enroll the device.
2. Pull schema/version metadata.
3. Download a normalized snapshot through `GET /api/logbook` or a new snapshot endpoint.
4. Import in one local transaction, preserving unknown legacy fields in an extension payload if needed.
5. Store the server revision/sync cursor.
6. Download thumbnails lazily; do not block initial usability on all media.

### Incremental synchronization

1. Acquire a per-device sync lock.
2. Push ready outbox mutations in dependency order.
3. Upload ready media within network/battery policy.
4. Pull changes after the stored cursor, including tombstones.
5. Apply non-conflicting remote changes transactionally.
6. Rebase unsent local mutations on the new base where safe.
7. Update cursor/last-success only after commit.

Trigger sync on app launch/resume, after a foreground save when reachable, manual Sync Now, connectivity restoration hints, and opportunistic OS background work.

## Conflict Resolution

The application is currently single-user but may have the web app and one or more phones editing the same logbook. Last-write-wins across a whole document is unacceptable.

### Automatic rules

- Independent entities merge automatically: two different catches on one trip both survive.
- Additive child records merge by stable ID.
- Different fields on the same entity merge when both changed from a common base and field semantics permit it.
- Identical repeated mutations are deduplicated by `deviceMutationId`.
- Remote deletion plus unchanged local entity accepts deletion.
- Local deletion plus unchanged remote entity submits deletion.

### Manual conflicts

Require user choice when:

- Both sides changed the same scalar field differently.
- One side deleted an entity the other side edited.
- A gear/location deletion would invalidate new remote references.
- Setup line timing/gear changed remotely while an offline catch references the local version.

For trips, offer field-level comparison and “duplicate as new trip.” For catches/lost fish, do not merge measurements or species heuristically. For notes, show both versions; do not concatenate silently. Preserve local and remote copies until resolution is synchronized.

### Domain-specific relationship policy

A catch’s `setupLineId` should remain stable even if display label/gear changes later. The synchronized setup version at the time of catch is the existing app’s model; if stronger historical immutability is desired, that is a future schema change and must not be assumed during migration.

## Failure Recovery

| Failure | Required behavior |
|---|---|
| App killed during entry | Last committed draft reopens; uncommitted field changes autosave on a short debounce and lifecycle background event. |
| App killed during sync | SQLite transaction rolls back; outbox operation remains retryable. |
| Duplicate request after timeout | Idempotency key returns prior result. |
| Authentication expired | Pause queue, refresh credentials, require re-enrollment only when refresh/revocation fails. |
| Server unavailable | Continue local operation; exponential backoff with jitter and manual retry. |
| Schema mismatch | Stop push, preserve data, display update-required status; never downgrade or discard records. |
| Media upload fails | Domain record remains saved with pending/failed attachment badge. |
| Local storage low | Warn before video capture when possible, offer review/delete of safely synchronized cached media, never auto-delete unsynced originals. |
| Corrupt local database | Attempt verified backup/recovery; preserve media/outbox files; provide diagnostic export. |
| Server conflict | Move operation to conflict state; continue syncing unrelated entities. |
| Weather/provider failure | Mark enrichment pending/failed; do not block trip completion. |

## Retry Policy

- Retry transient network/5xx/timeout failures with exponential backoff and jitter.
- Do not automatically retry validation, permission, schema, quota, or permanent 4xx failures without user or app correction.
- Cap foreground concurrent media uploads to protect battery and bandwidth.
- Respect Wi-Fi-only video preference, low-power/data modes where platform APIs expose them, and explicit user override.
- Keep a human-readable error plus machine code; surface actionable items in Sync Center.

## Offline Maps

Launch does not require downloadable basemaps. The app must still list coordinates and show relative records without tiles. Tier 2 may support bounded “save area for offline use” only after selecting a provider and terms that permit tile storage. Unbounded scraping/caching of public OpenStreetMap tiles is not an acceptable design.

## Weather and Enrichment Queue

Store the coordinate source, trip/catch time, and requested date range locally. When online, request enrichment and attach results only if the user has not replaced the relevant manual value. Requests should be idempotent by coordinates/date/time window/provider version. Manual weather tags remain separate.

## Background Execution Constraints

Background jobs improve eventual sync but are not guaranteed to run promptly. Expo documents that Android WorkManager and iOS BGTaskScheduler choose execution based on system conditions; user termination and vendor policies can suspend work. Therefore:

- Foreground save is local only and immediately successful.
- Foreground sync/app resume carries primary responsibility.
- Background tasks process a bounded queue and exit quickly.
- Background location is excluded from launch.

## Data Retention and Privacy

- Encrypt transport with HTTPS.
- Use OS-protected app storage and secure credential storage.
- Consider SQLCipher only after threat-model review; database encryption increases key management and recovery complexity.
- Provide clear camera/location permission rationale and continue without each permission.
- Never upload precise GPS or media before device enrollment and user-directed sync.
- Logs and crash reports must redact notes, names, media paths, coordinates, tokens, and upstream URLs containing coordinates.

## Acceptance Criteria

- A complete trolling trip with 20 setup changes, 30 catches/lost fish, notes, GPS, and photos can be recorded in airplane mode.
- Force-terminating after any saved action loses no committed record.
- Reopening reconstructs the active trip and pending media.
- Repeated sync requests create no duplicate trips/catches/media.
- Web and mobile independent edits merge; same-field conflicts are shown, not overwritten.
- A 24-hour outage does not degrade field capture.
- Failed weather/media sync never changes landed/lost totals.
- Pending, failed, conflicted, and synchronized states are visible and actionable.
