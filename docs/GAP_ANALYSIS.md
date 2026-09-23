# Gap Analysis

Audit date: 2026-09-23. Findings are source-verified against the canonical code paths. “Verification Required” means the code path exists but depends on runtime/external behavior not proven by static inspection.

## Partially Implemented Features

| Finding | Evidence | Impact | Recommendation |
|---|---|---|---|
| “Baits” is a lure library only. | Gear tab is labeled Baits but data/UI use `lures` and lure-specific fields. | Natural/live bait cannot be represented cleanly. | Rename the tab to Lures or add a bait entity and method-specific fields. |
| Desktop has no catch `quantity` control. | Analytics honors the field and trip editing now preserves existing values. | Desktop-created catches default to one; mobile/imported multi-fish records remain intact. | Decide whether to expose a desktop quantity control. |
| Seasonal analysis is month aggregation only. | Month Patterns exists; no season/year comparison engine. | Historical trend questions require manual filtering. | Add year/season comparison after measurement normalization. |
| Local-file fallback is not offline feature parity. | localStorage works on `file:`, but upload/weather/gallery APIs do not. | Users may mistake it for a complete offline mode. | Label it fallback mode or implement a service worker and deferred sync. |
| Routed navigation is one-way. | Direct URLs select a view, but nav buttons do not update history and there is no `popstate` listener. | Refresh/share/back behavior can disagree with the visible panel. | Synchronize panel changes with `pushState` and handle back/forward. |
| External environmental integrations are code-complete but environment-dependent. | Open-Meteo, SunriseSunset.io, CDN, and tile calls require network/provider behavior. | Weather/maps may fail outside tested networks or provider limits. | Add integration smoke tests and graceful-status monitoring. Verification Required. |

## Referenced but Not Implemented

| Finding | Evidence | Status |
|---|---|---|
| Year-over-year historical comparisons | Trips can be filtered by year, but reports do not compare years. | Not implemented. |
| Accounts, profiles, roles, permissions | No auth dependencies, routes, session logic, or data entities. | Not implemented. |
| Notifications | No browser Notification API, email/SMS integration, notification entity, or scheduler. | Not implemented. |
| Moderation/admin console | No role boundary or privileged views/routes. | Not implemented. |
| Full PWA/offline sync | No manifest, service worker, cache, IndexedDB, or sync process. | Not implemented. |
| Feature flags | No flag store or conditional configuration framework. | Not implemented. |

## Data Fields Not Exposed or Not Fully Exposed in UI

| Field/capability | Code behavior | Assessment |
|---|---|---|
| `catch.quantity` | Used by dashboard/stats; the desktop editor now preserves it without exposing an edit control. | Some records represent multiple fish in one catch record; new UI records default to one. |
| `gearUsed.personId` | Mobile can assign an angler to a setup line; desktop preserves the value but has no assignment control. | Cross-client field; not schema residue. |
| Reel line-history detail | Mobile can edit all spool records; desktop edits the most recent record only but now preserves every other v2 history entry. | Desktop cannot yet manage the full history, but editing the reel no longer truncates it. |
| Arbitrary additive properties | Mobile types explicitly retain additive properties; desktop validates JSON and preserves existing properties during trip edits. | Useful for cross-client evolution; do not treat unknown values as validated domain fields. |
| Raw Open-Meteo weather codes/daylight fields | Fetched/stored in normalized records, but not all receive dedicated visible reports. | Useful as source data; partially surfaced through summaries/analytics. |

## UI/Backend Disconnections

| Finding | Evidence | Impact |
|---|---|---|
| Browser and backend weather responsibilities are split. | The browser reduces weather data while Flask provides allowlisted upstream proxies. | Keep the proxy contract and browser reducer covered together. |
| Settings/cleanup endpoints have no privilege boundary. | Every visitor can import/replace data and delete eligible media. | They function, but are unsafe on an untrusted network. |

No unused public API route was found; the current archive, media, weather, bathymetry, page, and static routes are wired or intentionally public.

## Missing Validation and Security Controls

- No authentication or authorization model; Flask sessions are used only for CSRF tokens.
- The `/static/` handler restricts extensions and stays beneath `static/`; keep this regression covered.
- No Flask `MAX_CONTENT_LENGTH`; upload size is unbounded in application code.
- File acceptance relies primarily on extension, with MIME used only as a fallback classifier; content is not malware-scanned.
- Recursive logbook validation, uniqueness checks, and coordinate/reference checks exist; array/text size limits and some field-level constraints remain limited.
- SQLite writes are serialized and atomic within a transaction, but concurrent browser saves remain whole-document last-write-wins.
- Missing or empty SQLite storage falls back to defaults; invalid stored data raises an error rather than silently resetting it.
- Browser localStorage is updated before server persistence; a failed PUT creates divergent copies.
- Queue delete is idempotent but does not report “not found,” reducing auditability.
- Upstream proxy routes have no rate limiting or caching across HTTP requests.
- Host-managed backups and Docker deployment require host-specific verification; restore is not scripted.

## Documentation Status

- The repository now has feature inventory, architecture, data model, API, development, deployment, roadmap, and gap documents.
- Schema version 2 is the canonical runtime and archive format; normal reads and writes validate and preserve records without runtime reshaping.
- Backup and restore boundaries are documented, but a non-destructive restore workflow is not yet scripted.

## Recommended Priorities

1. Add an authentication boundary or require/document authenticated reverse-proxy deployment; add upload limits and rate limiting.
2. Expand field-level limits and referential validation while preserving the atomic SQLite write path.
3. Add automated tests around normalization, setup resolution, lost-vs-landed metrics, media references, and time/weather logic.
4. Keep the v2 archive boundary and backup/restore workflow explicit.
5. Decide product direction for catch quantity, natural bait, and comparative seasonal reports.

## Potential Future Enhancements

- Unit-aware personal bests and trophy history.
- Year/season comparison with comparable effort and condition coverage.
- Natural/live bait inventory and bait-specific presentation fields.
- Restore workflow with backup integrity checks.
- PWA/offline capture with conflict-aware synchronization.
- Import preview/diff and dry-run validation.
- Accessibility and large-dataset performance improvements.
