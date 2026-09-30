import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const files = [
  "trip-editor.js",
  "trip-rows.js",
  "trip-save.js",
  "trip-draft.js",
  "form-utils.js",
  "photos.js",
  "trolling-spread.js",
  "gear-dialogs.js",
  "gear-draft.js",
  "settings.js",
  "settings-core.js",
  "settings-draft.js",
  "settings-fields.js",
  "settings-locations.js",
  "saved-setups.js",
  "checklists.js"
];

const tokenPattern = /\.(value|checked|dataset|selectedOptions)\b|\[['"](?:value|checked|dataset)['"]\]/g;
const writePattern = /\.(value|checked)\s*=|\.dataset(?:\.[\w$]+|\[[^\]]+\])?\s*=|delete\s+\w+\.dataset|setAttribute\("value"/;

const allowedReadPatterns = [
  // Not DOM controls: data objects, Date, Object.values, EXIF entries, SVG points.
  /valueOf\(\)/,
  /Object\.values/,
  /entry\.valueOffset/,
  /option\.value/,
  /row\.value/,
  /target\.dataset\.chart/,
  /svg\.dataset\.chart/,
  /chart\.dataset\.tooltipBound/,

  // Trip validation/focus and backward-compatible value helpers. These do not
  // build persisted records; save still flows through ui.tripDraft.
  /requiredFields\.filter/,
  /tripDateValue/,
  /tripDateDisplay\?\.value/,
  /export function getValue/,
  /document\.querySelector\(`#\$\{valueId\}`\)\.value/,
  /els\.tripRating\.value/,

  // Probe-temperature editor metadata is intentionally stored on generated
  // controls because each editable depth input is its own browser primitive.
  /probeTemperature(Display|Dirty|Raw)/,
  /probeDepthFeet/,
  /input\.value\.trim\(\)/,

  // People selectors still provide labels and temporary IDs for rendered
  // person rows; trip persistence reads the normalized draft.
  /personId/,
  /selectedOptions\[0\]\?\.textContent/,
  /select\?\.selectedOptions/,
  /input\?\.value\.trim\(\)/,
  /select\.value/,
  /select\?\.value/,
  /customName = input\.value/,
  /select\.value !== "__new__"/,

  // Row/card identity and UI state only; domain values come from drafts.
  /dataset\.(catchId|rowId|gearId|lineId|checklistId|checklistItemId|savedSetup|trollingSpread|sourceIndex|settingsPanel|unitSetting|bathymetry|selectedSetupLine|selectedRodId|autoAddedSpread|disclosureReady)/,
  /dataset\?\.lineId/,
  /dataset\?\.gearId/,
  /dataset\?\.catchId/,
  /dataset\?\.rowId/,
  /event\.target\.dataset/,
  /closest\("\[data-saved-setup-new-method\]"\)\?\.dataset/,

  // Control reads that are only used to preserve a user's current selection
  // while repopulating options, or for legacy tests where no draft exists.
  /populate(Lure|Flasher)Select\(select, select\.value\)/,
  /selectedValue \|\| select\.value/,
  /catch-setup-line"\)\?\.value/,
  /catch-leadcore-colors"\)\?\.value/,
  /catch-ball-depth"\)\?\.value/,
  /line-type"\)\?\.value/,

  // Settings visual previews and draft fallback seeding. Saves normalize
  // settingsUi drafts, not these controls.
  /syncTrollingSpreadRowFields/,
  /const color = input\.value/,
  /unitsDraft\[select\.dataset\.unitSetting\] = select\.value/,
  /calibrationDisplayDraft/,
  /privateLocationRadiusProgress\(input\.value\)/,
  /fishingSpotRadiusProgress\(input\.value\)/,
  /label\.dataset\.unitLabel/,
  /input\.checked = input\.value ===/,

  // Media metadata UI state and file-input clearing.
  /metadataLock/,
  /lockedLocation/,
  /photoLocationId/,
  /heroPhotoId/,
  /unknownInput\?\.checked/,
  /event\.target\.value = ""/,
  /#(lure|flasher|reel|rod)Image"\)\.value/,
  /catch-photo-(gps|hero)-/,

  // Draft-derived rendering writes can read the draft-side value property.
  /typeof row === "object" \? row\.value/
];

function isAllowedRead(file, line) {
  return allowedReadPatterns.some((pattern) => pattern.test(line))
    || (file === "trip-rows.js" && /node\.dataset|sourceRow\.dataset/.test(line))
    || (file === "form-utils.js" && /updateTripRow/.test(line))
    || (file === "checklists.js" && /dataset\.checklist/.test(line))
    || (file === "saved-setups.js" && /dataset\.savedSetup|dataset\.pickSavedSetup/.test(line))
    || (file === "settings.js" && /dataset\.trollingSpread|dataset\.settingsPanel/.test(line));
}

const unexpected = [];

for (const file of files) {
  const source = readFileSync(new URL(`../static/js/${file}`, import.meta.url), "utf8");
  source.split(/\r?\n/).forEach((line, index) => {
    tokenPattern.lastIndex = 0;
    if (!tokenPattern.test(line)) return;
    if (writePattern.test(line)) return;
    if (isAllowedRead(file, line)) return;
    unexpected.push(`${file}:${index + 1}: ${line.trim()}`);
  });
}

assert.deepEqual(unexpected, [], `Unexpected control reads:\n${unexpected.join("\n")}`);
