# Gap Analysis

Audit date: 2026-06-18. Findings are source-verified. “Verification Required” means the code path exists but depends on runtime/external behavior not proven by static inspection.

## Partially Implemented Features

| Finding | Evidence | Impact | Recommendation |
|---|---|---|---|
| “Baits” is a lure library only. | Gear tab is labeled Baits but data/UI use `lures` and lure-specific fields. | Natural/live bait cannot be represented cleanly. | Rename the tab to Lures or add a bait entity and method-specific fields. |
| Imported multi-fish `quantity` affects totals but has no UI field. | `fishCount()` reads quantity; catch collection never writes it. | Imported records may behave differently from UI records. | Add a quantity control with validation or normalize all catches to one fish. |
| Seasonal analysis is month aggregation only. | Month Patterns exists; no season/year comparison engine. | Historical trend questions require manual filtering. | Add year/season comparison after measurement normalization. |
| Local-file fallback is not offline feature parity. | localStorage works on `file:`, but upload/weather/gallery APIs do not. | Users may mistake it for a complete offline mode. | Label it fallback mode or implement a service worker and deferred sync. |
| Routed navigation is one-way. | Direct URLs select a view, but nav buttons do not update history and there is no `popstate` listener. | Refresh/share/back behavior can disagree with the visible panel. | Synchronize panel changes with `pushState` and handle back/forward. |
| JSON import validation is shallow. | Only several top-level arrays are type-checked. | Malformed nested data can enter persistence and break screens later. | Add versioned recursive validation and actionable errors. |
| External environmental integrations are code-complete but environment-dependent. | Open-Meteo, SunriseSunset.io, CDN, and tile calls require network/provider behavior. | Weather/maps may fail outside tested networks or provider limits. | Add integration smoke tests and graceful-status monitoring. Verification Required. |

## Referenced but Not Implemented

| Finding | Evidence | Status |
|---|---|---|
| Personal bests | No PB computation or screen despite length/weight fields. | Not implemented. |
| Year-over-year historical comparisons | Trips can be filtered by year, but reports do not compare years. | Not implemented. |
| Accounts, profiles, roles, permissions | No auth dependencies, routes, session logic, or data entities. | Not implemented. |
| Notifications | No browser Notification API, email/SMS integration, notification entity, or scheduler. | Not implemented. |
| Moderation/admin console | No role boundary or privileged views/routes. | Not implemented. |
| Full PWA/offline sync | No manifest, service worker, cache, IndexedDB, or sync process. | Not implemented. |
| Feature flags | No flag store or conditional configuration framework. | Not implemented. |

## Data Fields Not Exposed or Not Fully Exposed in UI

| Field/capability | Code behavior | Assessment |
|---|---|---|
| `catch.quantity` | Used by dashboard/stats when present. | No create/edit control; imported-data-only behavior. |
| `gearUsed.personId` | Setup collection always writes an empty string. | Schema residue or unfinished setup attribution. |
| Setup-level speed/depth properties | Resolver can inherit `line.speed`, `line.ballDepth`, etc. | Current setup template intentionally omits them; likely backward compatibility, not current UI. |
| Arbitrary unknown JSON fields | Additive normalization preserves most unknown keys. | Not necessarily dead, but unvalidated and invisible. Verification Required for any private historical dataset. |
| Raw Open-Meteo weather codes/daylight fields | Fetched/stored in normalized records, but not all receive dedicated visible reports. | Useful as source data; partially surfaced through summaries/analytics. |

## UI/Backend Disconnections

| Finding | Evidence | Impact |
|---|---|---|
| Browser and backend duplicate weather reduction logic. | Similar trip-window, trend, marine, astronomy, and catch enrichment implementations exist in JS and Python. | Drift risk; bulk refresh may not match interactive save. |
| Settings/cleanup endpoints have no privilege boundary. | Every visitor can import/replace data and delete eligible media. | They function, but are unsafe on an untrusted network. |

## Dead, Deprecated, or Unused Code

| Finding | Evidence | Recommendation |
|---|---|---|
| Legacy `tripTypes` | Deleted in both normalizers; no current producer/consumer. | Keep only as an explicit versioned migration, then retire when safe. |

No unused public API route was found; the current archive, media, weather, bathymetry, page, and static routes are wired or intentionally public.

## Missing Validation and Security Controls

- No authentication, authorization, session handling, or CSRF protection.
- The `/static/` handler restricts extensions and stays beneath `static/`; keep this regression covered.
- No Flask `MAX_CONTENT_LENGTH`; upload size is unbounded in application code.
- File acceptance relies primarily on extension, with MIME used only as a fallback classifier; content is not malware-scanned.
- No deep logbook schema validation, uniqueness checks, referential checks, or limits on arrays/text.
- JSON writes are not atomic, locked, or conflict-checked; concurrent saves can lose data.
- Invalid JSON on disk silently falls back to defaults, which can hide corruption until a later write.
- Browser localStorage is updated before server persistence; a failed PUT creates divergent copies.
- Queue delete is idempotent but does not report “not found,” reducing auditability.
- Upstream proxy routes have no rate limiting or caching across HTTP requests.
- Backup scripts and Docker deployment require host-specific verification; restore is not scripted.

## Missing Documentation Before This Audit

- No authoritative feature inventory.
- No architecture, data model, API, development, roadmap, or gap document.
- The README and architecture docs describe the current SQLite-backed web app and archive workflow.
- No documented schema version, migration policy, restore procedure, or security deployment baseline.

## Recommended Priorities

1. Block static serving of `data/`, `backups/`, dotfiles, and server source; add a regression test immediately.
2. Add an authentication boundary or require/document authenticated reverse-proxy deployment; add CSRF and upload limits.
3. Implement atomic locked writes and versioned deep schema validation before expanding features.
4. Add automated tests around normalization, setup resolution, lost-vs-landed metrics, media references, and time/weather logic.
5. Keep legacy archive compatibility explicit and periodically prune migrations after a documented retention window.
6. Decide product direction for catch quantity, natural bait, personal bests, and comparative seasonal reports.

## Potential Future Enhancements

- Unit-aware personal bests and trophy history.
- Year/season comparison with comparable effort and condition coverage.
- Natural/live bait inventory and bait-specific presentation fields.
- Restore workflow with backup integrity checks.
- Secured maintenance command for all-trip weather refresh.
- PWA/offline capture with conflict-aware synchronization.
- Import preview/diff and dry-run validation.
- Accessibility and large-dataset performance improvements.
