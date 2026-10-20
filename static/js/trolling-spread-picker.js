import { html, joinHtml, setHtml } from "./html.js";
import { ui } from "./app-state.js";
import { currentTrollingSpreads } from "./app-normalization.js";
import { els } from "./app-elements.js";
import { syncTripFormChrome } from "./trip-editor.js";
import { addTripGearRow, populateCatchRodSelects, populateSetupLineSelects, updateAllRowSummaries } from "./trip-rows.js";
import { renderLiveTrollingSpread } from "./trolling-spread.js";
import { isTrollingTrip } from "./form-utils.js";
import { replaceTripRows } from "./draft-binding.js";


export function renderTrollingSpreadPicker() {
  if (!els.trollingSpreadPickerList) return;
  const spreads = currentTrollingSpreads();
  setHtml(els.trollingSpreadPickerList, spreads.length
    ? joinHtml(spreads.map((item) => html`
        <button class="trolling-spread-picker-option" type="button" data-pick-trolling-spread="${item.id}">
          <strong class="trolling-spread-picker-option-title">${item.name}</strong>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg>
        </button>
      `), "")
    : html`<p class="trolling-spread-picker-empty">No saved spreads yet. Create one in Settings → Trolling Spread.</p>`);
}

export function openTrollingSpreadPicker() {
  if (!isTrollingTrip() || !els.trollingSpreadPickerDialog) return;
  renderTrollingSpreadPicker();
  els.trollingSpreadPickerDialog.showModal();
}

export function applySavedTrollingSpread(spreadId) {
  const spread = currentTrollingSpreads().find((item) => item.id === spreadId);
  if (!spread) return;
  const rows = [...els.tripGearRows.querySelectorAll(".gear-used-row")];
  if (rows.length && !window.confirm(`Replace the current setup with the ${spread.name} spread?`)) return;

  rows.forEach((row) => row.remove());
  replaceTripRows("gearUsed", []);
  spread.spread.forEach((item) => addTripGearRow({
    comboId: item.comboId,
    side: item.side,
    presentation: item.presentation,
    lureId: "",
    flasherId: "",
    cheaterLureId: "",
    hasCheater: false,
    hasLeadcore: false,
    distanceBehind: "",
    dipseyDiverColor: item.dipseyDiverColor || ""
  }));
  populateSetupLineSelects();
  populateCatchRodSelects();
  updateAllRowSummaries();
  renderLiveTrollingSpread();
  els.trollingSpreadPickerDialog?.close();
  ui.tripFormUserChanged = true;
  syncTripFormChrome();
}

export function setup() {
  els.trollingSpreadPickerList?.addEventListener("click", (event) => {
    const option = event.target.closest("[data-pick-trolling-spread]");
    if (option) applySavedTrollingSpread(option.dataset.pickTrollingSpread);
  });
}
