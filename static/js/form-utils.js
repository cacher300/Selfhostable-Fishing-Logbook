import { html, joinHtml, setHtml } from "./html.js";
import { hasFishHawk, optionLabels } from "./app-normalization.js";
import { convertUnitValue, unitPreference, unitSymbol } from "./app-units.js";
import { sortTrollingSetupRows, syncLastTrollingSpreadImportButton, updateRowSummary } from "./trip-rows.js";
import { updateRiggingVisibility } from "./gear-pickers.js";
import { renderLiveTrollingSpread } from "./trolling-spread.js";
import { findDraftRecord, updateTripRow } from "./draft-binding.js";
import { state, ui } from "./app-state.js";
import { isGreatLakesFishingTrip } from "./trip-fishing-conditions.js";

function draftCollectionForFishRow(row) {
  return row?.classList?.contains?.("lost-fish-row") ? "lostFish" : "catches";
}

function draftIdForRow(row) {
  return row?.dataset?.catchId || row?.dataset?.rowId || "";
}

export function isTrollingTrip() {
  return String(ui.tripDraft?.method || "").toLowerCase() === "trolling";
}

export function isCastingTrip() {
  return String(ui.tripDraft?.method || "").toLowerCase() === "casting";
}

export function isFlyFishingTrip() {
  return String(ui.tripDraft?.method || "").toLowerCase() === "fly fishing";
}

export function populateStructureSelect(select, selectedValue = "") {
  if (!select) return;
  const current = selectedValue || select.value || "";
  const options = optionLabels("structureOptions");
  const values = options.includes(current) || !current ? options : [...options, current];
  setHtml(select, joinHtml([
    html`<option value="">Select structure</option>`,
    ...values.map((item) => html`<option value="${item}">${item}</option>`),
    html`<option value="__new__">Add new structure...</option>`
  ]));
  select.value = current;
}

export function updateTrollingVisibility() {
  const trolling = isTrollingTrip();
  const casting = isCastingTrip();
  const flyFishing = isFlyFishingTrip();
  const greatLakesFishing = isGreatLakesFishingTrip(ui.tripDraft, state.locations);
  const tripDialog = document.querySelector("#tripDialog");
  if (!trolling) {
    document.querySelectorAll(".trip-gear-side").forEach((select) => {
      select.value = "";
      updateTripRow("gearUsed", select.closest(".gear-used-row")?.dataset?.gearId, { side: "" });
    });
  }
  document.querySelectorAll("#tripDialog .gear-used-row .gear-lure-field > span").forEach((label) => {
    label.textContent = casting ? "Lure (optional)" : "Lure";
  });
  tripDialog?.classList.toggle("is-trolling", trolling);
  tripDialog?.classList.toggle("is-great-lakes-fishing", greatLakesFishing);
  document.querySelector("#tripThermoclineDepth")?.closest(".trip-thermocline-field")?.classList.toggle("hidden", !greatLakesFishing);
  document.querySelectorAll("#tripDialog .great-lakes-current-field").forEach((element) => {
    element.classList.toggle("hidden", !greatLakesFishing);
  });
  document.querySelectorAll("#tripDialog .trolling-field").forEach((element) => {
    element.classList.toggle("hidden", !trolling);
  });
  document.querySelectorAll("#tripDialog .casting-field").forEach((element) => {
    element.classList.toggle("hidden", !casting);
  });
  document.querySelectorAll("#tripDialog .fly-trip-field, #tripDialog .fly-setup-field, #tripDialog .fly-catch-field").forEach((element) => {
    element.classList.toggle("hidden", !flyFishing);
  });
  document.querySelectorAll("#tripDialog .fow-range-field").forEach((element) => {
    element.classList.toggle("hidden", flyFishing);
  });
  document.querySelectorAll("#tripDialog .non-trolling-field").forEach((element) => {
    element.classList.toggle("hidden", trolling);
  });
  document.querySelectorAll("#tripDialog .trolling-catch-line-field").forEach((element) => {
    element.classList.toggle("hidden", !trolling);
  });
  document.querySelectorAll("#tripDialog .catch-row .direct-catch-gear:not(.trolling-field)").forEach((element) => {
    element.classList.toggle("hidden", trolling);
  });
  document.querySelectorAll("#tripDialog .catch-row").forEach((row) => {
    const lostFish = row.classList.contains("lost-fish-row");
    const hideDuplicateDepth = trolling;
    row.querySelector(".catch-water-depth-field")?.classList.toggle("hidden", hideDuplicateDepth);
    row.querySelector(".catch-depth-down-field")?.classList.toggle("hidden", hideDuplicateDepth);
    row.querySelector(".catch-fow-field")?.classList.toggle("hidden", !trolling && !lostFish);
    row.querySelector(".catch-fow-field .metadata-lock-button")?.classList.remove("hidden");
  });
  sortTrollingSetupRows();
  document.querySelectorAll(".catch-row, .gear-used-row").forEach(updateRowSummary);
  document.querySelectorAll(".catch-row, .gear-used-row").forEach(updatePresentationFields);
  // Method visibility can reveal non-trolling fields; apply the lure-specific
  // rule last so rigging is only available for Soft Plastic lures.
  document.querySelectorAll(".catch-row, .gear-used-row").forEach(updateRiggingVisibility);
  renderLiveTrollingSpread();
  syncLastTrollingSpreadImportButton();
  syncFishHawkVisibility();
}

export function syncFishHawkVisibility() {
  const method = String(ui.tripDraft?.method || "").trim().toLowerCase();
  const greatLakesJigging = method === "jigging" && isGreatLakesFishingTrip(ui.tripDraft, state.locations);
  const availableForTrip = isTrollingTrip() || greatLakesJigging;
  document.querySelectorAll(".fish-hawk-field").forEach((element) => {
    element.classList.toggle("hidden", !hasFishHawk() || !availableForTrip);
  });
}

export function updatePresentationFields(row) {
  const isCatchRow = row.classList.contains("catch-row");
  const record = isCatchRow
    ? findDraftRecord(draftCollectionForFishRow(row), draftIdForRow(row)) || {}
    : findDraftRecord("gearUsed", row?.dataset?.gearId || "") || {};
  const presentationSelect = row.querySelector(".catch-presentation");
  const presentation = record.presentation || "";
  const estimatedDepthLabel = row.querySelector(".estimated-depth-label");
  const isLeadcoreCatch = isCatchRow && catchRowUsesLeadcore(row);
  row.querySelectorAll(".trolling-param").forEach((field) => field.classList.remove("visible"));
  if (isCatchRow && presentationSelect) {
    presentationSelect.disabled = true;
    presentationSelect.setAttribute("aria-disabled", "true");
  }
  if (estimatedDepthLabel) {
    estimatedDepthLabel.dataset.unitLabelText = presentation === "flatline" ? "Depth down" : "Estimated depth";
    estimatedDepthLabel.textContent = presentation === "flatline" ? "Depth down" : "Estimated depth";
  }
  if (!isTrollingTrip()) return;

  if (row.classList.contains("gear-used-row")) {
    const distanceBehindLabel = row.querySelector(".trip-gear-distance-behind-label");
    if (presentation === "downrigger" || presentation === "Downrigger") {
      row.querySelector(".param-distance-behind")?.classList.add("visible");
      if (distanceBehindLabel) distanceBehindLabel.textContent = "Distance behind ball";
    } else if (["dipsey-diver", "High Diver", "Low Diver"].includes(presentation)) {
      row.querySelector(".param-distance-behind")?.classList.add("visible");
      if (distanceBehindLabel) distanceBehindLabel.textContent = "Distance behind Dipsy";
    }
    if (isDipseyDiverColorPresentation(presentation)) {
      row.querySelector(".param-dipsey-diver-color")?.classList.add("visible");
    } else {
      const dipseyDiverColor = row.querySelector(".trip-gear-dipsey-diver-color");
      if (dipseyDiverColor) dipseyDiverColor.value = "";
      updateTripRow("gearUsed", row.dataset?.gearId, { dipseyDiverColor: "" });
    }
    if (isLeadcoreCapablePresentation(presentation)) {
      row.querySelector(".param-leadcore")?.classList.add("visible");
    } else {
      const leadcoreToggle = row.querySelector(".trip-gear-leadcore");
      if (leadcoreToggle) leadcoreToggle.checked = false;
      updateTripRow("gearUsed", row.dataset?.gearId, { hasLeadcore: false });
    }
    if (presentation === "downrigger" || presentation === "Downrigger") {
      row.querySelector(".param-cheater")?.classList.add("visible");
      if (record.hasCheater) {
        row.querySelector(".param-cheater-lure")?.classList.add("visible");
        row.querySelector(".cheater-lure-action")?.classList.add("visible");
        row.querySelector(".param-cheater-lure-select")?.classList.add("visible");
      }
    }
    if (isAttachedWeightPresentation(presentation)) {
      row.querySelector(".param-attached-weight")?.classList.add("visible");
    } else {
      const attachedWeight = row.querySelector(".trip-gear-attached-weight");
      if (attachedWeight) attachedWeight.value = "";
      updateTripRow("gearUsed", row.dataset?.gearId, { attachedWeightOz: "" });
    }
    return;
  }

  const isMainDownrigger = ["downrigger", "Downrigger"].includes(presentation);
  const isCheater = ["cheater", "Cheater"].includes(presentation);
  const isBoardOrChute = ["Outside Board", "Inside Board", "Chute Rod", "flatline-leadcore", "flatline"].includes(presentation);
  const deepestRiggerToggle = row.querySelector(".catch-deepest-rigger");
  if (isMainDownrigger || isCheater) {
    row.querySelector(".param-ball-depth")?.classList.add("visible");
    if (isCheater) {
      row.querySelector(".param-lure-depth")?.classList.add("visible");
      updateCheaterDepth(row);
    }
  }
  if (isMainDownrigger) {
    row.querySelector(".param-deepest-rigger")?.classList.add("visible");
  } else if (deepestRiggerToggle) {
    deepestRiggerToggle.checked = false;
    updateTripRow(draftCollectionForFishRow(row), draftIdForRow(row), { deepestRigger: false });
  }
  if (isBoardOrChute) {
    row.querySelector(".param-flatline-weight")?.classList.add("visible");
    row.querySelector(".param-board-line")?.classList.add("visible");
  }
  if (isBoardOrChute || isCheater) {
    row.querySelector(".param-lure-depth")?.classList.add("visible");
  }
  if (isLeadcoreCatch) {
    row.querySelector(".param-leadcore-colors")?.classList.add("visible");
    row.querySelector(".param-lure-depth")?.classList.add("visible");
    updateLeadcoreEstimatedDepth(row);
  } else {
    const estimatedLureDepth = row.querySelector(".catch-estimated-lure-depth");
    if (estimatedLureDepth && !isCheater) estimatedLureDepth.readOnly = false;
  }
  if (["dipsey-diver", "High Diver", "Low Diver"].includes(presentation)) {
    row.querySelector(".param-dipsey-setting")?.classList.add("visible");
    row.querySelector(".param-line-out")?.classList.add("visible");
    row.querySelector(".param-estimated-depth")?.classList.add("visible");
  }
}

export function isLeadcoreCapablePresentation(presentation) {
  return ["Outside Board", "Inside Board", "Chute Rod", "flatline-leadcore", "flatline"].includes(presentation);
}

export function isAttachedWeightPresentation(presentation) {
  return ["Outside Board", "Inside Board", "Chute Rod", "flatline-leadcore", "flatline"].includes(presentation);
}

export function isDipseyDiverColorPresentation(presentation) {
  const key = String(presentation || "").trim().toLowerCase().replace(/[\s_]+/g, "-");
  return key === "high-diver" || key === "low-diver";
}

export function catchRowUsesLeadcore(row) {
  const selectedValue = findDraftRecord(draftCollectionForFishRow(row), draftIdForRow(row))?.setupLineValue
    || "";
  const setupLineId = selectedValue.split("::")[0];
  const setup = findDraftRecord("gearUsed", setupLineId);
  if (setup) return isLeadcoreCapablePresentation(setup.presentation) && Boolean(setup.hasLeadcore);
  return false;
}

export function leadcoreDepthLabel(colors) {
  const feet = colors * 5;
  const converted = convertUnitValue(feet, "ft", unitPreference("depth"));
  if (converted === null) return "";
  const decimals = unitPreference("depth") === "m" ? 1 : 0;
  const rounded = Math.round(converted * (10 ** decimals)) / (10 ** decimals);
  return `${trimNumber(rounded)} ${unitSymbol("depth")}`;
}

export function updateLeadcoreEstimatedDepth(row) {
  const record = findDraftRecord(draftCollectionForFishRow(row), draftIdForRow(row));
  const colors = Number(record?.leadcoreColors);
  const output = row.querySelector(".catch-estimated-lure-depth");
  if (!output) return;
  output.readOnly = true;
  const value = Number.isFinite(colors) && colors > 0 ? leadcoreDepthLabel(colors) : "";
  output.value = value;
  updateTripRow(draftCollectionForFishRow(row), draftIdForRow(row), { estimatedLureDepth: value });
}

export function updateCheaterDepth(row) {
  const output = row.querySelector(".catch-estimated-lure-depth");
  if (!output) return;
  output.readOnly = true;
  const record = findDraftRecord(draftCollectionForFishRow(row), draftIdForRow(row));
  const ballDepth = Number.parseFloat(record?.ballDepth);
  const value = Number.isFinite(ballDepth) ? trimNumber(ballDepth / 2) : "";
  output.value = value;
  updateTripRow(draftCollectionForFishRow(row), draftIdForRow(row), { estimatedLureDepth: value });
}

export function trimNumber(value) {
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
}
