# Roadmap

This roadmap is derived from verified code gaps, not from assumed product commitments.

## Priority 0: Protect Private Data

1. Add authentication or document a supported reverse-proxy authentication configuration; bind Docker safely by default.
2. Add upload-size limits, rate limiting, and stronger upload content validation.
3. Add backup/restore verification; SQLite writes are already atomic and serialized, but concurrent browser saves remain last-write-wins.

## Priority 1: Establish Schema and Quality Guardrails

1. Define an explicit migration policy for the existing schema version and compatibility fields.
2. Expand server validation limits and referential checks for trips, nested records, IDs, coordinates, and units.
3. Add automated tests for normalization, overnight time logic, setup resolution, landed-vs-lost totals, media references, and proxy validation.
4. Add a browser smoke suite for trip CRUD, trolling setup/catches, queue assignment, and settings.

## Priority 2: Close Product Gaps

1. Decide whether imported catch `quantity` should gain a UI control or be rejected/normalized away.
2. Add a dedicated natural/live bait model if “Baits” is intended to cover more than lures.
3. Add year-over-year/season comparison reports and explicit success-rate definitions.
4. Keep the existing pattern-combination tables aligned with the current personal-best and analytics screens.

## Priority 3: Operational Reliability

1. Keep browser weather enrichment and backend proxy behavior covered by focused tests as either side changes.
2. Add backup status/restore documentation and non-destructive restore tooling.
3. Add health/readiness endpoints and structured logs for container operation.
4. Pin third-party frontend assets or self-host Leaflet to reduce CDN dependency.

## Priority 4: Usability and Scale

1. Add pagination/virtualization for large trip, gallery, and analytics datasets.
2. Improve accessibility testing for dialogs, chart alternatives, focus restoration, and table navigation.
3. Consider a PWA/offline queue only if offline parity includes conflict handling and deferred uploads.
4. Move from shared globals to modules incrementally once test coverage protects selector-heavy workflows.
5. Complete SPA URL synchronization so navigation, refresh, links, and browser back/forward agree.

Notifications, moderation, and multi-user profiles should remain out of scope until identity, authorization, and data ownership are designed together.
