# Mobile database field audit

Compared the current `data/logbook.sqlite3` record keys with desktop normalization,
gear dialogs, trip saving, and mobile forms on September 4, 2026.

| Desktop fields | Mobile access |
| --- | --- |
| `trip.expeditionId` | Trip editor → Basics; saved trip details |
| `expeditions`: name, start/end dates, destination, notes | More → Expeditions; add and edit |
| `trip.idleHours`, lines-set time | Trip editor → Basics; net fishing hours subtract idle time, including overnight trips |
| Trip and fish `structureType` | Basics, Catches, Lost; saved trip summaries |
| Setup and fish `rigging`, `riggingDetails` | Setup, Catches, Lost; shown for soft plastics or existing rigging values |
| `riggings`, `structureOptions` | More → Predefined Fields |
| Catch `spotId`, `spotAssignmentMode` | Catches → Fishing spot; automatic GPS, manual spot, or explicit no spot |
| `spots`: name, coordinates, radius | More → Fishing Spots; add and edit, matching desktop's 25–500 m radius |
| Lure `model`, `divingDepth`, `quantityAvailable`, `glow` | Gear → Baits |
| Flasher `glow` | Gear → Flashers |
| Rod/reel `quantityAvailable` | Gear → Rods/Reels |

The existing editors already cover the other recorded fish depths, speeds,
photo locks, probe profiles, setup equipment references, line history and core
gear specifications. Internal flags, legacy aliases and media bookkeeping are
retained in payloads rather than added as new fishing inputs.

New collections remain in the canonical extra metadata supported by the native
repository, so existing mobile databases do not require a table migration.
Older archives receive defaults for absent choice lists and reference collections.

Validation: `npm run typecheck` in `mobile`; four tests via
`node --test mobile/tests/database-fields.test.cjs`; isolated browser checks at
390 × 844 for trip idle time, catch rigging, expedition and gear save/reload,
spot selection/radius, and zero gear quantities. Browser checks used bundled
Playwright with installed Edge because the Browser skill was unavailable.
Native iOS/Android execution was not tested.
