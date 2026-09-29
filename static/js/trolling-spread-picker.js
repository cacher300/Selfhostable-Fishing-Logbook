import { html, joinHtml, setHtml } from "./html.js";
import { ui } from "./app-state.js";
import { choiceLabel, currentTrollingSpreads } from "./app-normalization.js";
import { els } from "./app-elements.js";
import { syncTripFormChrome } from "./trip-editor.js";
import { addTripGearRow, populateCatchRodSelects, populateSetupLineSelects, updateAllRowSummaries } from "./trip-rows.js";
import { comboName } from "./gear-core.js";
import { renderLiveTrollingSpread, setupLineSideLabel } from "./trolling-spread.js";
import { isTrollingTrip } from "./form-utils.js";


export function trollingSpreadPickerItemLabel(item) {
  return item.spread.map((row, index) => {
    const combo = comboName(row.comboId) || `Rod ${index + 1}`;
    const side = setupLineSideLabel(row.side);
    const presentation = choiceLabel("trollingPresentations", row.presentation);
    return [side, presentation, combo].filter(Boolean).join(" ");
  }).join(" · ");
}

export function renderTrollingSpreadPicker() {
  if (!els.trollingSpreadPickerList) return;
  const spreads = currentTrollingSpreads();
  setHtml(els.trollingSpreadPickerList, spreads.length
    ? joinHtml(spreads.map((item) => html`
        <button class="trolling-spread-picker-option" type="button" data-pick-trolling-spread="${item.id}">
          <span class="trolling-spread-picker-option-copy">
            <strong>${item.name}</strong>
            <small>${`${item.spread.length} rod${item.spread.length === 1 ? "" : "s"} · ${trollingSpreadPickerItemLabel(item)}`}</small>
          </span>
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
