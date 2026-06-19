# Mobile Rewrite Readiness and Migration Plan

## Executive Summary

1. **Launch scope:** offline-first trip start/end, complete trip basics/conditions/people, live trolling setups, Quick Catch and Lost Fish, lure/flasher/combo selection, notes, native camera, foreground GPS, Photo Queue/Capture Inbox, trip history/search/detail, units/time preferences, basic totals, weather deferral, secure enrollment, Sync Center, retries, and conflicts that cannot silently overwrite data.
2. **Postpone:** most advanced analytics and maps until Tier 2; line history, imports, deep diagnostics, host administration, deprecated behavior, background tracking/geofencing, push, computer vision, widgets, and wearables until Tier 3 or later.
3. **Architecture:** React Native with Expo and TypeScript; Expo development builds; SQLite local source of truth; filesystem-backed media; mutation/media outboxes; foreground-first and opportunistic background sync; evolved authenticated Flask backend.
4. **Backend reuse:** Flask, weather/marine/astronomy proxy logic, Pillow previews, upload categories/storage, media metadata, JSON export, backups, normalization knowledge, and existing web routes can remain. Whole-document PUT, shallow validation, unauthenticated access, and non-atomic persistence cannot serve production mobile sync unchanged.
5. **Best mobile redesign targets:** live spread/rod interactions, Quick Catch/Lost, crash-safe active trips, camera/GPS capture, local Capture Inbox, and transparent Sync Center.
6. **Lowest-risk path:** secure and version the backend, add sync beside legacy APIs, build one offline vertical slice, beta alongside the existing web app, then expand by feature tier with contract/parity tests. Do not perform a big-bang replacement.

## Readiness Assessment

The product is **domain-ready but platform- and synchronization-not-ready** for a first-class mobile application.

The existing app provides unusually rich, verified fishing workflows and a useful compatibility dataset. That sharply reduces product-discovery risk. It does not provide the security, versioned schema, incremental API, transactional persistence, or conflict model required for a reliable offline mobile client. The lowest-risk plan therefore preserves the current web application and Flask services while adding contracts and mobile infrastructure around them, then migrates screen groups incrementally.

## Current Strengths

- Clear trolling-specific product purpose and terminology.
- Separate landed and lost-fish records with correct analytical intent.
- Stable IDs for most reusable and nested records.
- Detailed trip/setup/catch/lost/media/weather data already in active use.
- Reusable gear libraries and setup-line resolution.
- Explicit launch/waterbody/catch coordinate precedence.
- Non-blocking environmental enrichment.
- Local media storage, metadata sidecars, preview generation, queue, gallery, and orphan detection.
- Broad analytics that reveal which data must survive migration.
- Plain JSON export and normalization provide a practical migration input.
- Small Flask backend is easy to understand and extend.

## Current Weaknesses

- No authentication, authorization, secure device enrollment, or mobile-safe remote exposure.
- Broad static file serving and other documented security gaps.
- Whole-document GET/PUT with no revision, atomicity, lock, change feed, tombstones, or idempotency.
- Shallow backend validation and no schema version/migration ledger.
- Persistence, domain, form, and report behavior are spread across global browser scripts.
- Browser and Python duplicate weather reduction logic.
- Measurements are often unit-bearing free-text strings, limiting safe comparisons/input redesign.
- Media upload is immediate and not designed for resumable/background/offline transfer.
- Current localStorage fallback is a separate partial persistence mode, not synchronization.
- No automated test suite or API contract tests.
- Desktop tables/dialogs and selector-coupled HTML are poor mobile component boundaries.

## Reuse Assessment

### Reusable business rules

Retain behavior, rewrite into tested TypeScript/Python domain services:

- Overnight trip duration and time-window rules.
- Landed versus lost totals and lost-fish inclusion controls.
- Setup-line resolution and inherited gear/presentation context.
- Method/presentation-specific field visibility and defaults.
- Location/launch/catch coordinate precedence.
- Unit preferences and API-value display conversion.
- Chop range classification.
- Weather trip-window, nearest-hour catch weather, trends, front tags, and moon windows—after choosing one canonical implementation.
- Fishing analytics formulas, confidence labels, and diagnostics.
- Media reference detection and attachment semantics.
- People/location normalization and legacy import compatibility.

The existing JavaScript is reference implementation, not a package that can be imported directly into React Native. Extract rules with characterization tests first, then port deliberately without DOM dependencies.

### Reusable APIs/services

| Component | Reuse level | Required change |
|---|---|---|
| Weather archive/forecast proxy | High | Authentication, rate limits/cache, contract tests. |
| Marine proxy | High | Same plus provider-availability handling. |
| Astronomy proxy | High | Same plus timezone contract. |
| Upload filesystem/categories | Medium–High | Auth, size/content limits, checksums/idempotency, retry/resume semantics. |
| Preview generation | High | Keep Pillow pipeline; test mobile formats and orientation. |
| Media serving | Medium | Authenticated/authorized delivery or signed URLs; caching policy. |
| Gallery/orphan services | Medium | Keep as web/admin; paginate for larger libraries. |
| JSON export | High | Add schema version and optional media manifest. |
| `GET /api/logbook` | Medium–High | Keep for bootstrap/legacy read. |
| `PUT /api/logbook` | Low for mobile | Keep for legacy web only or add temporary revisioned CAS; not routine mobile sync. |
| Static SPA routes | None for native | Keep for web coexistence. |
| Backup scripts | High server-side | Add verification/status; no mobile port. |

### Reusable data schema

The domain concepts and IDs are reusable. The physical “one JSON document” storage model is not suitable as the mobile sync model.

Retain:

- Top-level libraries and settings meanings.
- Trip/catch/lost/setup field semantics.
- Existing IDs and references.
- Media categories and metadata fields.
- Weather source fields and manual/API separation.
- Unknown legacy fields during migration, using extension payloads where necessary.

Redesign:

- Add `schemaVersion` and migration history.
- Normalize measurement storage for new records while preserving original legacy text.
- Add entity revisions and created/updated/deleted timestamps.
- Add tombstones, change cursor/log, and idempotency records.
- Separate media identity/attachment/upload state.
- Decide the hidden catch `quantity` contract.
- Decide whether setup snapshots are needed to make historical gear immutable.

### Components to redesign completely

- Navigation and responsive shell.
- Trip dialog as an active-trip workspace and focused sheets.
- Catch/lost rows as rapid capture flows.
- Trolling setup timeline as a live spread interaction.
- Wide analytics tables as mobile reports/drill-down lists.
- File inputs and server-first Photo Queue as native capture/local inbox.
- localStorage fallback as SQLite local-first persistence.
- Browser URL panel routing as native stacks/tabs/deep links.
- Client-only cascading deletes as server-validated domain operations.
- Whole-document synchronization.

### Components/concepts to retain

- Product vocabulary and field set.
- Trip summary information hierarchy.
- Trolling spread visual semantics plus accessible list alternative.
- Timeline event types/ordering.
- Gear image previews and inline gear creation intent.
- Settings categories and user-managed option lists.
- Map filters and manual-coordinate override.
- Analytics grouping and explanatory confidence legend.

## Prerequisite Backend Work

Mobile implementation should not begin feature-by-feature until these contracts are designed:

1. Deny private/static source paths and establish secure deployment baseline.
2. Add device enrollment/authentication and HTTPS requirements.
3. Define schema version, recursive validation, and migration fixtures from real anonymized exports.
4. Add atomic serialized persistence or move server storage to a transactional database while preserving JSON export.
5. Define revisions, tombstones, idempotent mutations, pull cursor, and conflict responses.
6. Define idempotent media upload/attachment lifecycle and limits.
7. Write contract tests for current weather/media behavior and core fishing invariants.

Moving the server to SQLite/PostgreSQL is not strictly required for a prototype, but production entity sync is substantially safer with transactional entity storage. If retaining `logbook.json` initially, the server must serialize mutations, atomically replace files, maintain a durable change log/revision, and recover consistently after interruption.

## Effort Scenarios

Estimates are person-weeks of focused engineering and include development/testing but not long external app-store review delays. They are planning ranges, not commitments.

### Small rewrite / field prototype — 8–12 person-weeks

Scope:

- One Expo client for internal devices.
- Local SQLite, active trip, basic trip/catch/lost/setup capture.
- Foreground camera/GPS and local media.
- Cached gear/locations/preferences.
- Single-device synchronization through a temporary revisioned snapshot/CAS API.
- Minimal sync status and manual recovery.

Excludes full analytics, maps, gallery/admin, rich inventory, conflict UI, background upload reliability, broad device testing, and app-store production hardening.

Risk: useful for validating UX, not a safe claim of full parity or multi-device production readiness.

### Medium rewrite / parity beta — 24–36 person-weeks

Scope:

- Two engineers over roughly 3–5 months, with design/QA support.
- Authentication/enrollment and mobile-safe incremental sync.
- Tier 1 complete; key Tier 2 gear, maps, weather, gallery, exports, and pattern/trolling analytics.
- Media retry pipeline, conflict handling, migrations, contract tests, physical-device E2E.
- Coexistence with web app and migration from existing JSON.

Risk: production candidate for a private/small user base if security and recovery testing pass; not complete parity across all 94 capabilities.

### Full production-grade rewrite — 50–80 person-weeks

Scope:

- Two to four contributors over roughly 6–10 months depending on part-time/full-time staffing and platform expertise.
- All appropriate Tier 1/2 parity and selected Tier 3.
- Hardened backend/entity persistence, observability, backup/restore, rate limits, media scaling.
- Accessibility, performance, privacy review, store assets/policies, beta channels, crash reporting with redaction.
- Broad device/OS matrix, offline chaos testing, migration rollback, support documentation.
- Optional notifications/offline areas/biometric lock after core acceptance.

Risk: lowest operational risk but largest schedule; scope must remain disciplined around deferred mobile opportunities.

## Recommended Phased Migration

### Phase 0 — Contract and security foundation

- Freeze and version the existing domain behavior with tests.
- Fix private-path/static exposure and add authentication/TLS deployment.
- Create anonymized migration fixtures covering legacy and rich trolling trips.
- Decide quantity, measurement representation, and deletion semantics.
- Specify sync/media protocols before client implementation.

Exit criterion: a documented, tested mobile API contract and deterministic migration from current JSON.

### Phase 1 — Offline vertical slice

- Expo shell, enrollment, SQLite migrations, local repository/outbox.
- Start Trip → setup line → Quick Catch/Lost → photo/GPS → End Trip entirely offline.
- App termination/restart recovery and Sync Center basics.
- Single end-to-end sync into a disposable server environment.

Exit criterion: airplane-mode acceptance scenario passes repeatedly on physical iOS and Android.

### Phase 2 — Tier 1 beta

- Complete trip fields, people, locations/launches, lure/flasher/combo CRUD, conditions, notes, Photo Queue.
- Authentication refresh/revocation, entity sync, tombstones, media retries, basic conflict UI.
- Trip history/search/filter/detail and Home totals.
- Basic weather/catch-weather deferral.

Exit criterion: invited users can run web and mobile concurrently without silent loss/duplication.

### Phase 3 — Tier 2 parity

- Rod/reel management, spread visualization, activity timeline, maps, gallery, environmental detail.
- Mobile analytics grouped by product value, not desktop page order.
- Predefined fields/chop/location managers, export/share, guarded deletion.

Exit criterion: all Tier 2 source-of-truth behaviors have parity tests or an explicit approved mobile presentation difference.

### Phase 4 — Production hardening

- Performance on large real-world logs/media libraries.
- Accessibility, localization/timezone/unit edge cases.
- Device/OS/background/network chaos matrix.
- Store release, privacy disclosures, support and rollback procedures.
- Backup/restore drill and server upgrade compatibility.

### Phase 5 — Mobile-native opportunities

Add opt-in features only after evidence: live speed/heading, reminders, offline area packs, biometric lock, share summaries, then potentially background track/geofencing/computer vision.

## Migration and Rollback

- Existing web application remains authoritative until mobile beta data round-trips reliably.
- Every server schema migration creates a verified backup and remains readable/exportable by supported web version.
- First mobile import records source schema version and checksum.
- Mobile must preserve unknown fields it cannot interpret during transitional round trips.
- Use feature flags only on the new mobile/backend capabilities if introduced; the current product has no flag system.
- Provide device revocation and a server switch to disable mobile mutations without disabling web access.
- Rollback means pausing mobile pushes, exporting local unsynced operations/media, restoring compatible server backup if needed, and never silently deleting the local outbox.

## Lowest-Risk Path

The lowest-risk migration is **strangler/coexistence**, not a big-bang rewrite:

1. Stabilize and secure Flask.
2. Add versioned sync alongside existing APIs.
3. Build one complete offline capture slice.
4. Beta with the existing web app still available for review/admin/analytics.
5. Expand by tier while contract tests compare mobile-derived records and reports with the source application.
6. Retire or replace existing web capabilities only after measured parity and recovery evidence.

This sequence preserves current functionality, limits simultaneous unknowns, and directs the first mobile investment toward the workflows that benefit most: active trolling spread, Quick Catch/Lost, camera/GPS, and offline durability.
