# Mobile-Specific Opportunities

These are opportunities enabled by a mobile device, not claims about current functionality. Priorities assume the launch mission is reliable offline fishing capture.

| Opportunity | User value | Complexity | Priority | Recommendation / constraints |
|---|---|---:|---:|---|
| Native camera in Quick Catch | Records the fish without leaving the capture flow; timestamp/GPS can be attached at source. | Medium | 1 | Build into launch. Save locally first and process thumbnails off the critical path. |
| Automatic foreground catch GPS | Removes manual coordinate entry and improves maps/weather. | Low–Medium | 1 | Capture accuracy and fix time; allow skip/manual correction. Do not require background permission. |
| Quick Catch from active rod | One tap carries setup, lure/flasher, presentation, time, and person defaults into a catch. | Medium | 1 | Highest-value mobile redesign. Keep a fallback picker and visible inherited context. |
| Quick Lost Fish | Captures missed strikes with minimal interruption while preserving landed/lost separation. | Low | 1 | Place beside Quick Catch with visually distinct confirmation. |
| Active Trip lock-screen/live activity | Shows elapsed time, counts, and fast return to trip. | High, platform-specific | 3 | Consider only after core reliability; iOS Live Activities/Android notifications require separate design. |
| OS dictation for trip/catch notes | Enables hands-free-ish observation capture using built-in keyboard dictation. | Low | 1 | Rely on platform dictation first; it may work offline depending on device/language. Do not require microphone integration. |
| In-app voice notes/transcription | Faster narrative notes and later transcription. | Medium–High | 3 | Store audio locally; transcription privacy/offline model choices are substantial. |
| Weather auto-capture | Uses trip/catch location and time without manual lookup. | Medium | 1 basic / 2 rich | Preserve current provider logic; defer when offline and never overwrite manual tag/value. |
| Nearby waterbody/launch suggestions | Speeds trip start and reduces wrong-location selection. | Medium | 2 | Rank saved locations by current GPS locally; no external place database required. |
| Launch geofence detection | Suggests starting/ending a trip at a saved launch. | High | 3 | Background permission, battery, false positives, and platform geofence limits make this post-launch. |
| Background trip track | Captures route/speed history and can infer trolling passes. | High | 3 | Explicit opt-in only; battery/privacy/store-review implications. Current schema has no track entity. |
| Foreground live speed/heading | Displays current trolling speed and direction while app is open. | Medium | 2 | Useful without background tracking; clearly distinguish measured device speed from entered catch speed. |
| One-tap setup timers | Starts/stops lure/flasher effort automatically from spread actions. | Medium | 1 | Aligns directly with existing setup timing and analytics; handle app/process interruptions using timestamps, not timers in memory. |
| Haptic save confirmation | Confirms catch/lost/setup save without requiring visual attention. | Low | 1 | Use subtle, accessible haptics; never substitute for visible saved state. |
| Photo-based fish measurement | Estimates length using reference object/AR/computer vision. | Very High | 3 | Research feature only until validated for accuracy; always label estimate and allow correction. |
| OCR lure/gear label capture | Prefills brand/model/line specs from packaging. | High | 3 | Useful for inventory onboarding, not field-critical; requires review before save. |
| Barcode/QR gear tagging | Selects a rod/reel/lure by scanning a user-applied tag. | Medium | 3 | Expo Camera supports barcode detection; useful only for larger inventories. |
| NFC gear tags | Tap a tagged rod to select setup line. | High, platform-specific | 3 | Cross-platform NFC behavior and tag management add burden; QR is simpler first. |
| Offline “next pattern” card | Precomputes likely lure/setup/conditions from existing verified analytics before leaving coverage. | Medium–High | 2 | Use transparent evidence/confidence; do not resurrect unverified Pattern Finder claims. |
| Push sync/weather completion | Alerts when uploads or weather enrichment finish/fail. | Medium | 3 | In-app sync badges are enough initially; push adds server/device token infrastructure. |
| Trip reminders | Reminds user to finish an active trip or complete missing details. | Low–Medium | 2 | Local notifications only; opt-in and quiet by default. |
| Gear maintenance reminders | Uses reel line dates/purchase history to suggest inspection/re-spooling. | Medium | 3 | Requires explicit rules/preferences; avoid pretending calendar age equals wear. |
| Share trip summary | Produces a privacy-reviewed image/PDF/text summary. | Medium | 2 | Default to redacting exact GPS; use OS share sheet. |
| Emergency coordinate card | Quickly displays/copies current coordinates. | Low | 3 | Avoid positioning it as a safety/rescue service; no guarantee of communications. |
| Offline area preparation | Downloads selected trip/gear metadata, thumbnails, weather snapshot, and permitted map data before departure. | Medium–High | 2 | Provide size estimate and expiry; map provider license must permit offline storage. |
| Device biometric app lock | Adds local privacy for fishing spots/photos. | Low–Medium | 2 | Optional convenience atop server authentication; define recovery behavior. |
| Home-screen widget | Shows next/active trip, last conditions, or quick-start action. | High, platform-specific | 3 | Defer until core domain and deep links are stable. |
| Wearable quick event capture | Mark catch/lost/setup event from watch. | Very High | 3 | Requires watch apps and reconciliation UI; timestamp-only event could be explored later. |

## Highest-Value Mobile Redesigns

1. **Active rod → Quick Catch/Lost:** turns the setup-line relationship into the primary interaction rather than a form field.
2. **Crash-safe active trip:** timestamps and events persist continuously, even with no network.
3. **Camera/GPS at capture:** context becomes automatic, reviewable, and locally durable.
4. **Capture Inbox:** makes the existing Photo Queue local-first and truly useful on the water.
5. **Sync Center:** gives a self-hosted offline app an understandable reliability model.

## Opportunities Explicitly Deferred at Launch

Background location, geofencing, fish measurement, transcription, push, widgets, wearables, OCR, NFC, and native live activities add permissions, privacy, platform variance, battery use, or validation risk. None should share the launch critical path with offline trip/catch durability.
