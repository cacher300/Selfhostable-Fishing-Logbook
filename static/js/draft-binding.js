import { createId } from "./app-defaults.js";
import { state, ui } from "./app-state.js";
import { settingsUi } from "./settings-core.js";

const rootBindings = [
  ["#tripId", "id"],
  ["#tripTitle", "title"],
  ["#tripDateValue", "date"],
  ["#tripExpedition", "expeditionId"],
  ["#tripLocation", "locationId"],
  ["#tripLaunch", "launchId"],
  ["#launchTime", "launchTime"],
  ["#linesPulledTime", "linesPulledTime"],
  ["#tripIdleTime", "idleHours"],
  ["#targetSpecies", "targetSpecies"],
  ["#method", "method"],
  ["#waterTemp", "waterTemp"],
  ["#waterClarity", "waterClarity"],
  ["#flyHatch", "flyHatch"],
  ["#waterLevel", "waterLevel"],
  ["#weather", "weather"],
  ["#waveHeight", "waveHeight"],
  ["#structure", "structure"],
  ["#tripNotes", "notes"],
  ["#tripRating", "tripRating"],
  ['input[name="tripIntent"]', "intent"]
];

const personBindings = [
  [".person-name", "name"],
  [".person-select", "personSelect"]
];

const gearBindings = [
  [".trip-gear-start-time", "startTime"],
  [".trip-gear-end-time", "endTime"],
  [".trip-gear-change-note", "changeNote"],
  [".trip-gear-side", "side"],
  [".trip-gear-line-label", "lineLabel"],
  [".trip-gear-leadcore", "hasLeadcore"],
  [".trip-gear-combo", "comboId"],
  [".trip-gear-lure", "lureId"],
  [".trip-gear-rigging", "rigging"],
  [".trip-gear-rigging-details", "riggingDetails"],
  [".trip-gear-leader", "leader"],
  [".trip-gear-tippet", "tippet"],
  [".trip-gear-flasher", "flasherId"],
  [".catch-presentation", "presentation"],
  [".trip-gear-distance-behind", "distanceBehind"],
  [".trip-gear-dipsey-diver-color", "dipseyDiverColor"],
  [".trip-gear-attached-weight", "attachedWeightOz"],
  [".trip-gear-cheater", "hasCheater"],
  [".trip-gear-cheater-lure", "cheaterLureId"]
];

const fishBindings = [
  [".catch-details-unknown", "detailsUnknown"],
  [".catch-person", "personId"],
  [".catch-species", "species"],
  [".catch-possible-species", "possibleSpecies"],
  [".catch-released", "kept"],
  [".catch-length", "length"],
  [".catch-weight", "weight"],
  [".catch-spot", "spotSelection"],
  [".catch-structure", "structureType"],
  [".catch-time", "time"],
  [".catch-time-unknown", "timeUnknown"],
  [".catch-water-depth", "waterDepth"],
  [".catch-depth-down", "depthDown"],
  [".catch-presentation", "presentation"],
  [".catch-direction", "direction"],
  [".catch-fow", "fowCaught"],
  [".catch-gps-speed", "gpsSpeed"],
  [".catch-ball-speed", "ballSpeed"],
  [".catch-ball-temp", "ballTemp"],
  [".catch-shaker", "shaker"],
  [".catch-retrieve", "retrieve"],
  [".catch-fly-presentation", "flyPresentation"],
  [".catch-rigging", "rigging"],
  [".catch-rigging-details", "riggingDetails"],
  [".catch-ball-depth", "ballDepth"],
  [".catch-deepest-rigger", "deepestRigger"],
  [".catch-flatline-weight-oz", "flatlineWeightOz"],
  [".catch-line-behind-board", "lineBehindBoard"],
  [".catch-leadcore-colors", "leadcoreColors"],
  [".catch-estimated-lure-depth", "estimatedLureDepth"],
  [".catch-dipsey-setting", "dipseySetting"],
  [".catch-line-out", "lineOut"],
  [".catch-estimated-depth", "estimatedDepth"],
  [".catch-notes", "notes"],
  [".catch-setup-line", "setupLineValue"],
  [".catch-rod", "rodSelect"],
  [".catch-lure", "lureId"],
  [".catch-latitude", "manualLatitude"],
  [".catch-longitude", "manualLongitude"]
];

function controlsUnder(root) {
  return ["input", "select", "textarea"].flatMap((tag) => [...root.getElementsByTagName(tag)]);
}

function firstMatchingBinding(control, bindings) {
  return bindings.find(([selector]) => control.matches(selector)) || null;
}

function rowCollection(row) {
  if (!row) return "";
  if (row.classList.contains("person-row")) return "people";
  if (row.classList.contains("gear-used-row")) return "gearUsed";
  if (row.classList.contains("lost-fish-row")) return "lostFish";
  if (row.classList.contains("catch-row")) return "catches";
  return "";
}

function rowId(row) {
  if (!row) return "";
  return row.getAttribute("data-catch-id")
    || row.getAttribute("data-gear-id")
    || row.getAttribute("data-person-id")
    || row.getAttribute("data-row-id")
    || "";
}

function setRowAttributes(row) {
  const collection = rowCollection(row);
  if (!collection) return;
  const id = rowId(row) || createId();
  row.setAttribute("data-draft-collection", collection);
  row.setAttribute("data-row-id", row.getAttribute("data-row-id") || id);
  if (collection === "catches" || collection === "lostFish") row.setAttribute("data-catch-id", id);
  if (collection === "gearUsed") row.setAttribute("data-gear-id", id);
  if (collection === "people") row.setAttribute("data-person-id", id);
}

function bindControls(root) {
  controlsUnder(root).forEach((control) => {
    const row = control.closest(".person-row, .gear-used-row, .catch-row");
    if (row) setRowAttributes(row);
    const bindings = row?.classList.contains("person-row")
      ? personBindings
      : row?.classList.contains("gear-used-row")
        ? gearBindings
        : row?.classList.contains("catch-row")
          ? fishBindings
          : rootBindings;
    const binding = firstMatchingBinding(control, bindings);
    if (binding) control.setAttribute("data-bind", binding[1]);
  });
}

export function applyTripDraftBindings(root) {
  if (!root) return;
  [...root.getElementsByClassName("person-row")].forEach(setRowAttributes);
  [...root.getElementsByClassName("gear-used-row")].forEach(setRowAttributes);
  [...root.getElementsByClassName("catch-row")].forEach(setRowAttributes);
  bindControls(root);
}

function draftCollection(name) {
  if (!ui.tripDraft) return [];
  if (!Array.isArray(ui.tripDraft[name])) ui.tripDraft[name] = [];
  return ui.tripDraft[name];
}

export function findDraftRecord(collection, id) {
  return draftCollection(collection).find((item) => String(item.id) === String(id)) || null;
}

function cloneDraftValue(value) {
  if (value === undefined) return value;
  return structuredClone(value);
}

function ensureDraftRecord(collection, id, defaults = {}) {
  const items = draftCollection(collection);
  let record = items.find((item) => String(item.id) === String(id));
  if (!record) {
    record = { ...defaults, id: id || createId() };
    items.push(record);
  }
  return record;
}

export function removeDraftRecord(collection, id) {
  if (!ui.tripDraft || !Array.isArray(ui.tripDraft[collection])) return;
  ui.tripDraft[collection] = ui.tripDraft[collection].filter((item) => String(item.id) !== String(id));
}

export function replaceDraftRecord(collection, record) {
  const items = draftCollection(collection);
  const next = { ...cloneDraftValue(record), id: record.id || createId() };
  const index = items.findIndex((item) => String(item.id) === String(next.id));
  if (index >= 0) items[index] = next;
  else items.push(next);
  return next;
}

export function updateTripField(field, value) {
  if (ui.tripDraftHydrating) return ui.tripDraft || null;
  if (!ui.tripDraft || !field) return null;
  setPath(ui.tripDraft, field, cloneDraftValue(value));
  syncRootDerivedFields(field);
  return ui.tripDraft;
}

export function updateTripRow(collection, rowId, patch = {}) {
  if (ui.tripDraftHydrating) return null;
  if (!ui.tripDraft || !collection) return null;
  const targetId = rowId || patch.id;
  if (!targetId) return null;
  const record = ensureDraftRecord(collection, targetId);
  Object.assign(record, cloneDraftValue(patch), { id: rowId || patch.id || record.id });
  return record;
}

export function insertTripRow(collection, record = {}, index = undefined) {
  if (!ui.tripDraft || !collection) return null;
  const items = draftCollection(collection);
  const next = { ...cloneDraftValue(record), id: record.id || createId() };
  const existingIndex = items.findIndex((item) => String(item.id) === String(next.id));
  if (existingIndex >= 0) items.splice(existingIndex, 1);
  const targetIndex = Number.isInteger(index) ? Math.max(0, Math.min(index, items.length)) : items.length;
  items.splice(targetIndex, 0, next);
  return next;
}

export function replaceTripRows(collection, records = []) {
  if (!ui.tripDraft || !collection) return [];
  ui.tripDraft[collection] = records.map((record) => ({ ...cloneDraftValue(record), id: record.id || createId() }));
  return ui.tripDraft[collection];
}

export function draftRecordForRow(row) {
  if (!row?.getAttribute) return null;
  const collection = row?.getAttribute("data-draft-collection") || rowCollection(row);
  const id = rowId(row);
  return collection && id ? ensureDraftRecord(collection, id) : null;
}

function controlValue(control) {
  const type = control.getAttribute("type") || "";
  if (type === "checkbox") return Boolean(control.checked);
  if (type === "radio") return control.checked ? control.value : undefined;
  return control.value ?? "";
}

function setPath(target, path, value) {
  const parts = String(path || "").split(".").filter(Boolean);
  if (!target || !parts.length) return;
  let cursor = target;
  parts.slice(0, -1).forEach((part) => {
    if (!cursor[part] || typeof cursor[part] !== "object") cursor[part] = {};
    cursor = cursor[part];
  });
  cursor[parts.at(-1)] = value;
}

function selectedOption(control) {
  return control.selectedOptions?.[0] || null;
}

function syncDerivedRecordFields(record, path, control) {
  if (!record) return;
  if (path === "comboId") {
    const combo = state.rodReelCombos.find((item) => String(item.id) === String(record.comboId));
    record.rodId = combo?.rodId || "";
    record.reelId = combo?.reelId || "";
  }
  if (path === "spotSelection") {
    const value = record.spotSelection || "__automatic__";
    record.spotAssignmentMode = value === "__automatic__" ? "automatic" : "manual";
    record.spotId = String(value).startsWith("__") ? "" : value;
  }
  if (path === "rodSelect") {
    const option = selectedOption(control);
    record.setupLineId = record.rodSelect || "";
    record.rodId = option?.getAttribute("data-rod-id") || "";
    record.lureId = option?.getAttribute("data-lure-id") || record.lureId || "";
  }
  if (path === "manualLatitude" || path === "manualLongitude") {
    const latitude = Number(record.manualLatitude);
    const longitude = Number(record.manualLongitude);
    record.manualCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude)
      ? { latitude, longitude, manual: true }
      : null;
  }
}

function syncRootDerivedFields(path) {
  if (!ui.tripDraft) return;
  if (path === "method" && String(ui.tripDraft.method || "").trim().toLowerCase() !== "trolling") {
    draftCollection("gearUsed").forEach((line) => { line.side = ""; });
  }
}

function updateProbeProfile(control) {
  if (!control.hasAttribute("data-probe-depth-feet")) return false;
  const depth = Number(control.getAttribute("data-probe-depth-feet"));
  if (!Number.isFinite(depth) || !ui.tripDraft) return false;
  const value = String(control.value ?? "").trim();
  const profile = Array.isArray(ui.tripDraft.probeTemperatureProfile) ? ui.tripDraft.probeTemperatureProfile : [];
  const next = profile.filter((entry) => Number(entry.depthFeet) !== depth);
  if (value) next.push({ depthFeet: depth, temperature: value });
  ui.tripDraft.probeTemperatureProfile = next.sort((first, second) => Number(first.depthFeet) - Number(second.depthFeet));
  return true;
}

function updateTripDraftFromControl(control) {
  if (!control || !ui.tripDraft) return false;
  if (updateProbeProfile(control)) return true;
  const bindingRow = control.closest(".person-row, .gear-used-row, .catch-row");
  if (bindingRow) setRowAttributes(bindingRow);
  const inferred = firstMatchingBinding(control, bindingRow?.classList.contains("person-row")
    ? personBindings
    : bindingRow?.classList.contains("gear-used-row")
      ? gearBindings
      : bindingRow?.classList.contains("catch-row")
        ? fishBindings
        : rootBindings);
  const path = control.getAttribute("data-bind") || inferred?.[1] || "";
  if (!path) return false;
  const value = controlValue(control);
  if (value === undefined) return false;
  const row = control.closest("[data-draft-collection]");
  if (row) {
    const collection = row.getAttribute("data-draft-collection");
    const record = ensureDraftRecord(collection, rowId(row));
    if (path === "personSelect") {
      if (value && value !== "__new__") {
        const person = state.people.find((item) => String(item.id) === String(value));
        record.id = person?.id || record.id;
        record.name = person?.name || record.name || "";
        row.setAttribute("data-person-id", record.id);
      }
      return true;
    }
    setPath(record, path, value);
    syncDerivedRecordFields(record, path, control);
    return true;
  }
  setPath(ui.tripDraft, path, value);
  syncRootDerivedFields(path);
  return true;
}

export function handleTripDraftControlEvent(event) {
  // This delegated event handler is the only trip-draft path that reads live
  // control values. Programmatic editor changes must call updateTripField() or
  // updateTripRow() instead of asking save to re-read the DOM.
  const control = event.target?.closest?.("input, select, textarea");
  if (!control?.closest?.("#tripDialog")) return;
  updateTripDraftFromControl(control);
  ui.tripFormUserChanged = true;
}


const gearBindingsById = new Map([
  ["lureName", "name"], ["lureType", "type"], ["lureDivingDepth", "divingDepth"], ["lureBladeType", "bladeType"],
  ["lureSpoonSize", "spoonSize"], ["lureMeatRigType", "meatRigType"], ["lureSoftPlasticType", "softPlasticType"],
  ["flyCategory", "flyCategory"], ["flyPattern", "flyPattern"], ["flyHookSize", "flyHookSize"], ["lureBrand", "brand"],
  ["lureModel", "model"], ["lureColor", "color"], ["lureWeight", "weight"], ["lureQuantityAvailable", "quantityAvailable"],
  ["lureGlow", "glow"], ["lureNotes", "notes"],
  ["flasherName", "name"], ["flasherType", "type"], ["flasherBrand", "brand"], ["flasherModel", "model"],
  ["flasherColor", "color"], ["flasherGlow", "glow"], ["flasherNotes", "notes"],
  ["reelShortName", "shortName"], ["reelStyle", "style"], ["reelBrand", "brand"], ["reelName", "name"],
  ["reelSize", "size"], ["reelWeight", "weight"], ["reelGearRatio", "gearRatio"], ["reelMaxDrag", "maxDrag"],
  ["reelMonoCapacity", "monoCapacity"], ["reelBraidCapacity", "braidCapacity"], ["reelFlyLineRange", "flyLineRange"],
  ["reelArbor", "arbor"], ["reelPurchaseAmount", "purchaseAmount"], ["reelDateBought", "dateBought"],
  ["reelQuantityAvailable", "quantityAvailable"], ["reelNotes", "notes"],
  ["rodShortName", "shortName"], ["rodType", "type"], ["rodBrand", "brand"], ["rodName", "name"],
  ["rodLength", "length"], ["rodPower", "power"], ["rodAction", "action"], ["rodFlyWeight", "flyWeight"],
  ["rodPieces", "pieces"], ["rodLureRating", "lureRating"], ["rodPurchaseAmount", "purchaseAmount"],
  ["rodDateBought", "dateBought"], ["rodQuantityAvailable", "quantityAvailable"], ["rodNotes", "notes"],
  ["comboShortName", "shortName"], ["comboRod", "rodId"], ["comboReel", "reelId"], ["comboNotes", "notes"]
]);

const lineBindings = [
  ["line-spooled-date", "spooledDate"], ["line-type", "type"], ["line-brand", "brand"], ["line-name", "name"],
  ["line-weight", "weight"], ["line-fly-weight", "flyWeight"], ["line-fly-taper", "flyTaper"],
  ["line-fly-density", "flyDensity"], ["line-diameter-in", "diameterIn"], ["line-diameter-mm", "diameterMm"],
  ["line-color", "color"], ["line-mono-backing", "monoBacking"], ["line-notes", "notes"]
];

export function createGearDraft(record = null, defaults = {}) {
  ui.gearDraft = structuredClone(record || defaults || {});
  return ui.gearDraft;
}

export function setGearDraftContext(context = {}) {
  ui.gearDraftContext = { ...context };
  return ui.gearDraftContext;
}

export function applyGearDraftBindings(root) {
  if (!root) return;
  controlsUnder(root).forEach((control) => {
    const id = control.getAttribute("id") || "";
    const direct = gearBindingsById.get(id);
    if (direct) control.setAttribute("data-gear-bind", direct);
    const line = lineBindings.find(([className]) => control.classList.contains(className));
    if (line) control.setAttribute("data-gear-line-bind", line[1]);
  });
}

function ensureLineDraft(id = "") {
  if (!ui.gearDraft) return null;
  if (!Array.isArray(ui.gearDraft.lineHistory)) ui.gearDraft.lineHistory = [];
  const requestedId = String(id || "");
  let line = requestedId
    ? ui.gearDraft.lineHistory.find((entry) => String(entry?.id || "") === requestedId)
    : null;
  if (!line) {
    line = ui.gearDraft.lineHistory[0];
    if (!line) {
      line = { id: requestedId || createId() };
      ui.gearDraft.lineHistory[0] = line;
    } else if (requestedId && !line.id) {
      line.id = requestedId;
    }
  }
  return line;
}

export function updateGearLineEntry(rowOrId, patch = {}) {
  if (!ui.gearDraft) return null;
  const id = typeof rowOrId === "string" ? rowOrId : rowOrId?.getAttribute?.("data-line-id") || "";
  const line = ensureLineDraft(id);
  if (!line) return null;
  Object.assign(line, cloneDraftValue(patch), { id: id || line.id || createId() });
  return line;
}

function updateGearDraftFromControl(control) {
  if (!control || !ui.gearDraft) return false;
  const id = control.getAttribute("id") || "";
  const inferredLine = lineBindings.find(([className]) => control.classList.contains(className));
  const linePath = control.getAttribute("data-gear-line-bind") || inferredLine?.[1] || "";
  const path = control.getAttribute("data-gear-bind") || gearBindingsById.get(id) || "";
  const value = controlValue(control);
  if (value === undefined) return false;
  if (linePath) {
    const row = control.closest(".line-editor-row");
    setPath(ensureLineDraft(row?.getAttribute("data-line-id") || ""), linePath, value);
    return true;
  }
  if (path) {
    setPath(ui.gearDraft, path, value);
    return true;
  }
  return false;
}

export function handleGearDraftControlEvent(event) {
  const control = event.target?.closest?.("input, select, textarea");
  if (!control?.closest?.("#lureDialog, #flasherDialog, #reelDialog, #rodDialog, #comboDialog")) return;
  updateGearDraftFromControl(control);
}

function updateSettingsDraftPath(draftName, path, value) {
  if (!draftName || !path || !settingsUi[draftName]) return null;
  setPath(settingsUi[draftName], path, cloneDraftValue(value));
  return settingsUi[draftName];
}

function updateSettingsDraftList(draftName, path, value, selected) {
  if (!draftName || !path || !settingsUi[draftName]) return null;
  const parts = String(path || "").split(".").filter(Boolean);
  const field = parts.pop();
  let target = settingsUi[draftName];
  parts.forEach((part) => {
    if (!target[part] || typeof target[part] !== "object") target[part] = {};
    target = target[part];
  });
  if (!Array.isArray(target[field])) target[field] = [];
  const textValue = String(value || "");
  target[field] = selected
    ? [...new Set([...target[field], textValue].filter(Boolean))]
    : target[field].filter((item) => String(item) !== textValue);
  return settingsUi[draftName];
}

export function handleSettingsDraftControlEvent(event) {
  // This delegated event handler is the only settings-draft path that reads
  // live control values. Programmatic settings changes update settingsUi drafts
  // directly and save paths normalize those drafts instead of re-reading DOM.
  const control = event.target?.closest?.("input, select, textarea");
  if (!control) return false;
  const draftName = control.getAttribute("data-settings-draft") || control.closest("[data-settings-draft-root]")?.getAttribute("data-settings-draft-root") || "";
  const listPath = control.getAttribute("data-settings-list");
  if (listPath) {
    updateSettingsDraftList(draftName, listPath, control.value, Boolean(control.checked));
    return true;
  }
  const path = control.getAttribute("data-settings-bind") || "";
  if (!path) return false;
  updateSettingsDraftPath(draftName, path, controlValue(control));
  return true;
}
