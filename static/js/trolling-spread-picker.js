function trollingSpreadPickerItemLabel(item) {
  return item.spread.map((row, index) => {
    const combo = comboName(row.comboId) || `Rod ${index + 1}`;
    const side = setupLineSideLabel(row.side);
    const presentation = choiceLabel("trollingPresentations", row.presentation);
    return [side, presentation, combo].filter(Boolean).join(" ");
  }).join(" · ");
}

function renderTrollingSpreadPicker() {
  if (!els.trollingSpreadPickerList) return;
  const spreads = normalizeTrollingSpreads(state.settings?.trollingSpreads);
  els.trollingSpreadPickerList.innerHTML = spreads.length
    ? spreads.map((item) => `
        <button class="trolling-spread-picker-option" type="button" data-pick-trolling-spread="${escapeHtml(item.id)}">
          <span class="trolling-spread-picker-option-copy">
            <strong>${escapeHtml(item.name)}</strong>
            <small>${escapeHtml(`${item.spread.length} rod${item.spread.length === 1 ? "" : "s"} · ${trollingSpreadPickerItemLabel(item)}`)}</small>
          </span>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg>
        </button>
      `).join("")
    : '<p class="trolling-spread-picker-empty">No saved spreads yet. Create one in Settings → Trolling Spread.</p>';
}

function openTrollingSpreadPicker() {
  if (!isTrollingTrip() || !els.trollingSpreadPickerDialog) return;
  renderTrollingSpreadPicker();
  els.trollingSpreadPickerDialog.showModal();
}

function applySavedTrollingSpread(spreadId) {
  const spread = normalizeTrollingSpreads(state.settings?.trollingSpreads).find((item) => item.id === spreadId);
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
    distanceBehind: ""
  }));
  populateSetupLineSelects();
  populateCatchRodSelects();
  updateAllRowSummaries();
  renderLiveTrollingSpread();
  els.trollingSpreadPickerDialog?.close();
  tripFormUserChanged = true;
  syncTripFormChrome();
}

els.trollingSpreadPickerList?.addEventListener("click", (event) => {
  const option = event.target.closest("[data-pick-trolling-spread]");
  if (option) applySavedTrollingSpread(option.dataset.pickTrollingSpread);
});
