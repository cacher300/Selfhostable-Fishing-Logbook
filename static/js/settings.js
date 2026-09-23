function renderSettings() {
  syncSettingsTabs();
  renderPreferenceSettings();
  renderTrollingSpreadSettings();
  renderSavedSetupSettings();
  renderUnitSettings();
  renderFowCalibrationSettings();
  renderPredefinedFieldSettings();
  syncUnitLabels();
  renderChopRangeSettings();
  renderFishingSpotSettings();
  renderPrivatePhotoLocationSettings();
  renderLocationManager();
}

function trollingSpreadRowMarkup(item = {}, { disabled = false, sourceIndex = "" } = {}) {
  const comboId = String(item.comboId || "");
  const side = String(item.side || "");
  const presentation = String(item.presentation || "");
  const comboOptions = state.rodReelCombos.map((combo) => (
    `<option value="${escapeHtml(combo.id)}" ${combo.id === comboId ? "selected" : ""}>${escapeHtml(comboName(combo.id) || "Rod / reel combo")}</option>`
  )).join("");
  const choiceOptions = (key, selectedValue, emptyLabel) => (
    `<option value="">${escapeHtml(emptyLabel)}</option>${optionChoices(key).map((option) => (
      `<option value="${escapeHtml(option.value)}" ${option.value === selectedValue ? "selected" : ""}>${escapeHtml(option.label)}</option>`
    )).join("")}`
  );
  return `
    <div class="trolling-spread-row"${sourceIndex === "" ? "" : ` data-source-index="${sourceIndex}"`}>
      <label>
        <span>Rod / reel combo</span>
        <select class="trolling-spread-combo"${disabled ? " disabled" : ""}>
          <option value="">Select rod / reel combo</option>
          ${comboOptions}
        </select>
      </label>
      <label>
        <span>Side</span>
        <select class="trolling-spread-side"${disabled ? " disabled" : ""}>${choiceOptions("setupLineSides", side, "Select side")}</select>
      </label>
      <label>
        <span>Method</span>
        <select class="trolling-spread-presentation"${disabled ? " disabled" : ""}>${choiceOptions("trollingPresentations", presentation, "Select method")}</select>
      </label>
      ${disabled ? "" : '<button class="button danger remove-trolling-spread-row" type="button">Remove</button>'}
    </div>
  `;
}

function trollingSpreadRodsForPreview(spread = []) {
  return (Array.isArray(spread) ? spread : []).map((item, index) => ({
    ...(state.rodReelCombos.find((combo) => combo.id === item.comboId) || {}),
    id: `trolling-spread-${index}`,
    comboId: item.comboId,
    lineSide: item.side,
    trollingMethod: item.presentation,
    lureId: "",
    flasherId: "",
    fishCount: 0,
    lostCount: 0
  }));
}

function renderTrollingSpreadPreview(card, spread) {
  const canvas = card?.querySelector("[data-trolling-spread-preview]");
  if (!canvas || typeof renderSpreadDiagram !== "function") return;
  canvas.innerHTML = renderSpreadDiagram(trollingSpreadRodsForPreview(spread), { labelWithCombo: true });
}

function renderTrollingSpreadCard(item, { draft = false } = {}) {
  const name = String(item?.name || "");
  const spread = Array.isArray(item?.spread) ? item.spread : [];
  const editing = draft || activeTrollingSpreadEditorId === item.id;
  const expanded = editing;
  return `
    <article class="trolling-spread-card${draft ? " is-draft" : ""}" data-trolling-spread-id="${escapeHtml(item.id)}" data-trolling-spread-draft="${draft ? "true" : "false"}" data-trolling-spread-editing="${editing ? "true" : "false"}" data-trolling-spread-toggle aria-expanded="${expanded ? "true" : "false"}" onclick="toggleTrollingSpreadCard(this, event)">
      <div class="trolling-spread-card-header">
        <label class="settings-control trolling-spread-name-control">
          <span>Spread</span>
          <input class="trolling-spread-name" type="text" maxlength="60" value="${escapeHtml(name)}" placeholder="1 Man Spread"${editing ? "" : " readonly"} />
        </label>
        <div class="trolling-spread-card-actions">
          ${editing && !draft ? '<button class="button secondary finish-trolling-spread-edit" type="button">Done</button>' : !editing ? '<button class="button secondary edit-trolling-spread" type="button">Edit</button>' : ""}
          ${editing && !draft ? '<button class="button danger delete-trolling-spread" type="button">Delete</button>' : draft ? '<button class="button secondary cancel-trolling-spread" type="button">Cancel</button>' : ""}
        </div>
      </div>
      <div class="trolling-spread-card-body"${expanded ? "" : " hidden"}>
        <div class="trolling-spread-card-section">
          <div class="trolling-spread-card-section-heading">
            <div>
              <strong>Rod positions</strong>
              <span>Saved spreads use combo, side, and presentation only.</span>
            </div>
            ${editing ? '<button class="button secondary add-trolling-spread-row" type="button">Add Rod</button>' : ""}
          </div>
          <div class="trolling-spread-list">
            ${spread.map((row, index) => trollingSpreadRowMarkup(row, { disabled: !editing, sourceIndex: index })).join("") || '<p class="trolling-spread-empty-rows">Add at least one rod to save this spread.</p>'}
          </div>
        </div>
        <div class="trolling-spread-card-preview">
          <strong class="trolling-spread-preview-heading">Preview</strong>
          <div data-trolling-spread-preview></div>
        </div>
      </div>
    </article>
  `;
}

function renderTrollingSpreadSettings() {
  if (!els.defaultTrollingSpreadRows) return;
  const spreads = currentTrollingSpreads();
  const visibleSpreads = trollingSpreadDraft ? [...spreads, trollingSpreadDraft] : spreads;
  const defaultId = String(state.settings?.defaultTrollingSpreadId || "");
  if (els.defaultTrollingSpreadId) {
    els.defaultTrollingSpreadId.innerHTML = [
      '<option value="">No Trolling default</option>',
      ...spreads.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`)
    ].join("");
    els.defaultTrollingSpreadId.value = spreads.some((item) => item.id === defaultId) ? defaultId : "";
  }
  els.defaultTrollingSpreadRows.innerHTML = `
    ${visibleSpreads.length
      ? visibleSpreads.map((item) => renderTrollingSpreadCard(item, { draft: item === trollingSpreadDraft })).join("")
      : '<div class="trolling-spread-empty-state">No saved trolling spreads yet. Add one to make it available from the trip editor.</div>'}
  `;
  visibleSpreads.forEach((item) => {
    const card = els.defaultTrollingSpreadRows.querySelector(`[data-trolling-spread-id="${CSS.escape(item.id)}"]`);
    renderTrollingSpreadPreview(card, item.spread);
  });
}

function addTrollingSpread() {
  if (trollingSpreadDraft) {
    document.querySelector(`[data-trolling-spread-id="${CSS.escape(trollingSpreadDraft.id)}"] .trolling-spread-name`)?.focus();
    return;
  }
  trollingSpreadDraft = { id: createId(), name: "", spread: [] };
  activeTrollingSpreadEditorId = trollingSpreadDraft.id;
  renderTrollingSpreadSettings();
  document.querySelector(`[data-trolling-spread-id="${CSS.escape(trollingSpreadDraft.id)}"] .trolling-spread-name`)?.focus();
}

function addTrollingSpreadRowToCard(card) {
  const list = card?.querySelector(".trolling-spread-list");
  if (!list || card.dataset.trollingSpreadEditing !== "true") return;
  card.querySelector(".trolling-spread-empty-rows")?.remove();
  list.insertAdjacentHTML("beforeend", trollingSpreadRowMarkup());
  renderTrollingSpreadPreview(card, collectTrollingSpreadCard(card).spread);
  scheduleTrollingSpreadAutosave(card);
  list.querySelector(".trolling-spread-row:last-child select")?.focus();
}

function editTrollingSpread(spreadId) {
  if (!currentTrollingSpreads().some((item) => item.id === spreadId)) return;
  activeTrollingSpreadEditorId = spreadId;
  renderTrollingSpreadSettings();
  document.querySelector(`[data-trolling-spread-id="${CSS.escape(spreadId)}"] .trolling-spread-name`)?.focus();
}

function collectTrollingSpreadCard(card) {
  const id = card?.dataset.trollingSpreadId || createId();
  const existing = currentTrollingSpreads().find((item) => item.id === id);
  return {
    ...existing,
    id,
    name: card?.querySelector(".trolling-spread-name")?.value.trim() || "",
    spread: [...card?.querySelectorAll(".trolling-spread-row") || []].map((row) => ({
      ...(row.dataset.sourceIndex !== undefined ? existing?.spread?.[Number(row.dataset.sourceIndex)] : {}),
      comboId: row.querySelector(".trolling-spread-combo")?.value || "",
      side: row.querySelector(".trolling-spread-side")?.value || "",
      presentation: row.querySelector(".trolling-spread-presentation")?.value || ""
    }))
  };
}

function setTrollingSpreadSettingsMessage(message = "") {
  if (!els.trollingSpreadSettingsMessage) return;
  els.trollingSpreadSettingsMessage.textContent = message;
  els.trollingSpreadSettingsMessage.classList.toggle("hidden", !message);
}

function toggleTrollingSpreadCard(card, event = null) {
  if (!card) return;
  const clickedName = event?.target?.matches(".trolling-spread-name");
  if (event?.target?.closest("button, input, select, textarea, a") && !clickedName) return;
  if (card.dataset.trollingSpreadDraft === "true") return;

  // A spread's expanded state is its editing state. Clicking the card surface
  // should therefore enter the editor rather than opening a read-only card.
  if (card.dataset.trollingSpreadEditing !== "true") {
    editTrollingSpread(card.dataset.trollingSpreadId);
  }
}

async function finishTrollingSpreadEdit(card) {
  const next = collectTrollingSpreadCard(card);
  if (!next.name) {
    setTrollingSpreadSettingsMessage("Enter a name for this spread before finishing.");
    card?.querySelector(".trolling-spread-name")?.focus();
    return;
  }
  if (!next.spread.length) {
    setTrollingSpreadSettingsMessage("Add at least one rod with a rod / reel combo before finishing.");
    return;
  }
  clearTimeout(settingsAutosaveTimer);
  await saveTrollingSpreadCard(card, { autosave: true });
  activeTrollingSpreadEditorId = "";
  setTrollingSpreadSettingsMessage("");
  renderTrollingSpreadSettings();
}

function scheduleTrollingSpreadAutosave(card) {
  if (!card || card.dataset.trollingSpreadEditing !== "true") return;
  scheduleSettingsAutosave(async (options = {}) => {
    const next = collectTrollingSpreadCard(card);
    if (!next.name || !next.spread.length) return;
    await saveTrollingSpreadCard(card, options);
  });
}

async function saveTrollingSpreadCard(card, options = {}) {
  const next = collectTrollingSpreadCard(card);
  const wasDraft = card?.dataset.trollingSpreadDraft === "true";
  if (!next.name) {
    if (!options.silentInvalid) setTrollingSpreadSettingsMessage("Enter a name for this spread before saving.");
    if (!options.silentInvalid) card?.querySelector(".trolling-spread-name")?.focus();
    return;
  }
  if (!next.spread.length) {
    if (!options.silentInvalid) setTrollingSpreadSettingsMessage("Add at least one rod with a rod / reel combo before saving.");
    return;
  }
  if (next.spread.some((row) => !row.comboId)) {
    if (!options.silentInvalid) setTrollingSpreadSettingsMessage("Choose a combo or remove the empty rod row before saving.");
    return;
  }
  const duplicate = currentTrollingSpreads()
    .some((item) => item.id !== next.id && item.name.toLowerCase() === next.name.toLowerCase());
  if (duplicate) {
    if (!options.silentInvalid) setTrollingSpreadSettingsMessage("Spread names must be unique.");
    if (!options.silentInvalid) card?.querySelector(".trolling-spread-name")?.focus();
    return;
  }
  const previousState = structuredClone(state);
  const spreads = [...currentTrollingSpreads()];
  const index = spreads.findIndex((item) => item.id === next.id);
  if (index >= 0) spreads[index] = next;
  else spreads.push(next);
  state.settings = { ...(state.settings || {}), trollingSpreads: spreads };
  trollingSpreadDraft = null;
  activeTrollingSpreadEditorId = next.id;
  setTrollingSpreadSettingsMessage("");
  try {
    await runSettingsSave(() => saveState(), "The trolling spread could not be saved.", options);
    renderTrollingSpreadSettings();
  } catch (error) {
    state = previousState;
    trollingSpreadDraft = wasDraft ? next : null;
    activeTrollingSpreadEditorId = next.id;
    renderTrollingSpreadSettings();
  }
}

async function deleteTrollingSpread(spreadId) {
  const spread = currentTrollingSpreads().find((item) => item.id === spreadId);
  if (!spread || !confirm(`Delete the ${spread.name} spread?`)) return;
  const previousState = structuredClone(state);
  if (activeTrollingSpreadEditorId === spreadId) activeTrollingSpreadEditorId = "";
  const spreads = currentTrollingSpreads().filter((item) => item.id !== spreadId);
  state.settings = {
    ...(state.settings || {}),
    trollingSpreads: spreads,
    defaultTrollingSpreadId: state.settings?.defaultTrollingSpreadId === spreadId ? "" : state.settings?.defaultTrollingSpreadId || ""
  };
  try {
    await runSettingsSave(() => saveState(), "The trolling spread could not be deleted.");
    renderTrollingSpreadSettings();
  } catch (error) {
    state = previousState;
    renderTrollingSpreadSettings();
  }
}

async function saveDefaultTrollingSpreadId(options = {}) {
  const previousId = state.settings?.defaultTrollingSpreadId || "";
  const nextId = els.defaultTrollingSpreadId?.value || "";
  const validId = !nextId || currentTrollingSpreads().some((item) => item.id === nextId);
  if (!validId) return;
  state.settings = { ...(state.settings || {}), defaultTrollingSpreadId: nextId };
  try {
    await runSettingsSave(() => saveState(), "The Trolling default could not be saved.", options);
  } catch (error) {
    state.settings = { ...(state.settings || {}), defaultTrollingSpreadId: previousId };
    renderTrollingSpreadSettings();
  }
}

function refreshTrollingSpreadCardPreview(card) {
  renderTrollingSpreadPreview(card, collectTrollingSpreadCard(card).spread);
}

function cancelTrollingSpreadDraft() {
  trollingSpreadDraft = null;
  activeTrollingSpreadEditorId = "";
  setTrollingSpreadSettingsMessage("");
  renderTrollingSpreadSettings();
}

function renderPreferenceSettings() {
  applyThemePreference();
  document.querySelectorAll("[data-theme-option]").forEach((input) => {
    input.checked = input.value === themePreference();
  });
  if (els.timeFormatSelect) els.timeFormatSelect.value = timeFormatPreference();
  if (els.defaultHomeLakeSelect) els.defaultHomeLakeSelect.value = state.settings?.defaultHomeLake || "";
  if (els.fishHawkToggle) els.fishHawkToggle.checked = hasFishHawk();
  renderDefaultPeopleSettings();
  document.querySelectorAll("[data-time-format-option]").forEach((input) => {
    input.checked = input.value === timeFormatPreference();
  });
}

async function saveFishHawkPreference(options = {}) {
  const previousSetting = hasFishHawk();
  const nextSetting = Boolean(els.fishHawkToggle?.checked);
  state.settings = { ...(state.settings || {}), hasFishHawk: nextSetting };
  try {
    await runSettingsSave(
      async () => {
        await saveState();
        syncFishHawkVisibility();
        const summaryTrip = state.trips.find((trip) => trip.id === activeSummaryTripId);
        if (summaryTrip && els.tripSummaryDialog?.open) openTripSummary(summaryTrip);
      },
      "The Fish Hawk setting could not be saved.",
      options
    );
  } catch (error) {
    state.settings = { ...(state.settings || {}), hasFishHawk: previousSetting };
    renderPreferenceSettings();
    syncFishHawkVisibility();
  }
}

function renderDefaultPeopleSettings() {
  if (!els.defaultPeopleOptions) return;
  const selectedIds = new Set(Array.isArray(state.settings?.defaultPeople) ? state.settings.defaultPeople : []);
  const people = mergePeople(state.people || []);
  els.defaultPeopleOptions.innerHTML = people.length
    ? people.map((person) => `
        <label>
          <input type="checkbox" value="${escapeHtml(person.id)}" ${selectedIds.has(person.id) ? "checked" : ""} />
          <span>${escapeHtml(person.name)}</span>
        </label>
      `).join("")
    : '<span class="default-people-empty">Add people from a trip to choose defaults.</span>';
}

async function saveDefaultPeople(options = {}) {
  const availableIds = new Set((state.people || []).map((person) => person.id));
  const defaultPeople = [...els.defaultPeopleOptions?.querySelectorAll('input[type="checkbox"]:checked') || []]
    .map((input) => input.value)
    .filter((id) => availableIds.has(id));
  state.settings = { ...(state.settings || {}), defaultPeople };
  await runSettingsSave(() => saveState(), "The default people could not be saved.", options);
}

async function saveDefaultHomeLake(options = {}) {
  const defaultHomeLake = els.defaultHomeLakeSelect?.value || "";
  state.settings = { ...(state.settings || {}), defaultHomeLake };
  await runSettingsSave(() => saveState(), "The default home lake could not be saved.", options);
}

function setSettingsTab(tab = "general") {
  activeSettingsTab = tab;
  syncSettingsTabs();
  if (tab === "waterbodies") {
    setTimeout(() => privatePhotoLocationMap?.invalidateSize(), 80);
    setTimeout(() => fishingSpotMap?.invalidateSize(), 80);
  }
}

function syncSettingsTabs() {
  const tabs = document.querySelectorAll("[data-settings-tab]");
  const panels = document.querySelectorAll("[data-settings-panel]");
  if (![...tabs].some((tab) => tab.dataset.settingsTab === activeSettingsTab)) activeSettingsTab = "general";
  tabs.forEach((tab) => {
    const active = tab.dataset.settingsTab === activeSettingsTab;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
  });
  panels.forEach((panel) => {
    const active = panel.dataset.settingsPanel === activeSettingsTab;
    panel.classList.toggle("is-active", active);
    panel.hidden = !active;
  });
}

function applyThemePreference(theme = themePreference()) {
  const normalizedTheme = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = normalizedTheme;
  document.documentElement.style.colorScheme = normalizedTheme;
}

async function saveThemePreference(options = {}) {
  const selectedTheme = document.querySelector("[data-theme-option]:checked")?.value;
  const theme = selectedTheme === "dark" ? "dark" : "light";
  applyThemePreference(theme);
  state.settings = {
    ...(state.settings || {}),
    theme
  };
  try {
    await runSettingsSave(
      () => saveState(),
      "The theme could not be saved.",
      options
    );
  } catch (error) {
    applyThemePreference();
    renderPreferenceSettings();
  }
}

function renderUnitSettings() {
  if (!els.unitSettingsFields) return;
  const units = normalizeUnits(state.settings?.units);
  const rows = [
    ["depth", "Depth"],
    ["distance", "Distance"],
    ["speed", "Speed"],
    ["windSpeed", "Wind"],
    ["pressure", "Pressure"],
    ["airTemperature", "Air Temp"],
    ["waterTemperature", "Water Temp"],
    ["precipitation", "Precipitation"],
    ["waveHeight", "Wave Height"],
    ["fishLength", "Fish Length"],
    ["fishWeight", "Fish Weight"]
  ];
  els.unitSettingsFields.innerHTML = rows.map(([key, label]) => `
    <label class="settings-control">
      <span>${escapeHtml(label)}</span>
      <select data-unit-setting="${escapeHtml(key)}">
        ${(unitOptions[key] || []).map((option) => `
          <option value="${escapeHtml(option.value)}"${units[key] === option.value ? " selected" : ""}>${escapeHtml(option.label)}</option>
        `).join("")}
      </select>
    </label>
  `).join("");
}

function renderFowCalibrationSettings() {
  if (!els.fowCalibrationFields) return;
  const calibrationUnit = unitPreference("depth") || "ft";
  const lakeCalibrations = state.settings?.bathymetryLakeCalibrationsFeet || {};
  els.fowCalibrationFields.innerHTML = ["Erie", "Ontario", "St. Clair", "Huron", "Michigan", "Superior"].map((lake) => `
    <label class="settings-control">
      <span>${escapeHtml(lake)} FOW adjustment</span>
      <input data-bathymetry-lake-calibration="${escapeHtml(lake)}" data-bathymetry-calibration-end="offshoreOffsetFeet" type="number" step="0.1" value="${escapeHtml(bathymetryOffsetDisplayValue(lakeCalibrations[lake]?.offshoreOffsetFeet ?? 0, calibrationUnit))}" />
    </label>
  `).join("");
}

function bathymetryOffsetDisplayValue(offsetFeet, depthUnit = unitPreference("depth")) {
  const offset = Number(offsetFeet);
  if (!Number.isFinite(offset)) return "0";
  const converted = convertUnitValue(offset, "ft", depthUnit || "ft");
  if (converted === null) return "0";
  return trimNumber(Math.round(converted * 100) / 100);
}

function bathymetryOffsetFeetFromDisplay(value, depthUnit = unitPreference("depth")) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  const converted = convertUnitValue(number, depthUnit || "ft", "ft");
  return converted === null ? 0 : Math.round(converted * 100) / 100;
}

async function saveUnitSettings(options = {}) {
  const previousState = structuredClone(state);
  const previousUnits = normalizeUnits(state.settings?.units);
  const units = { ...previousUnits };
  document.querySelectorAll("[data-unit-setting]").forEach((select) => {
    units[select.dataset.unitSetting] = select.value;
  });
  const originalCalibrations = state.settings?.bathymetryLakeCalibrationsFeet || {};
  const lakeCalibrations = { ...originalCalibrations };
  document.querySelectorAll("[data-bathymetry-lake-calibration]").forEach((input) => {
    const lake = input.dataset.bathymetryLakeCalibration;
    const field = input.dataset.bathymetryCalibrationEnd;
    // The field was rendered in the unit that was active before this save.
    const existing = originalCalibrations[lake] || {};
    const currentDisplayValue = bathymetryOffsetDisplayValue(existing[field] ?? 0, previousUnits.depth);
    if (String(input.value).trim() === currentDisplayValue) return;
    lakeCalibrations[lake] = {
      ...existing,
      [field]: bathymetryOffsetFeetFromDisplay(input.value, previousUnits.depth)
    };
  });
  const nextUnits = normalizeUnits(units);
  convertStoredMeasurements(previousUnits, nextUnits);
  state.settings = {
    ...(state.settings || {}),
    units: nextUnits,
    bathymetryLakeCalibrationsFeet: lakeCalibrations
  };
  try {
    await runSettingsSave(
      async () => {
        await saveState();
        weatherRequestCache.clear();
        marineRequestCache.clear();
        renderAll();
        if (options.rerender !== false && !els.settingsPanel?.classList.contains("hidden")) renderSettings();
        syncUnitLabels();
        const summaryTrip = state.trips.find((trip) => trip.id === activeSummaryTripId);
        if (summaryTrip && els.tripSummaryDialog?.open) openTripSummary(summaryTrip);
      },
      "The unit settings could not be saved.",
      options
    );
  } catch (error) {
    state = previousState;
    renderAll();
    if (options.rerender !== false && !els.settingsPanel?.classList.contains("hidden")) renderSettings();
  }
}

function unitLabelText(baseText, key) {
  return `${baseText} (${unitSymbol(key)})`;
}

function syncUnitLabels(root = document) {
  root.querySelectorAll("[data-unit-label]").forEach((label) => {
    label.textContent = unitLabelText(label.dataset.unitLabelText || label.textContent, label.dataset.unitLabel);
  });
  if (els.waterTemp) els.waterTemp.placeholder = unitPreference("waterTemperature") === "C" ? "8 C" : "47 F";
  if (els.structure) els.structure.placeholder = `40-60 FOW (${unitSymbol("depth")})`;
  if (els.waveHeight) updateMarineWaveHeightPlaceholder(activeTripWeatherData);
  root.querySelectorAll(".catch-length").forEach((input) => {
    input.placeholder = unitPreference("fishLength") === "cm" ? "71 cm" : "28 in";
  });
  root.querySelectorAll(".catch-weight").forEach((input) => {
    input.placeholder = unitPreference("fishWeight") === "kg" ? "4 kg" : "9 lb";
  });
  root.querySelectorAll("#reelMaxDrag").forEach((input) => {
    input.placeholder = unitPreference("fishWeight") === "kg" ? "8 kg" : "18 lb";
  });
  root.querySelectorAll(".catch-water-depth").forEach((input) => {
    input.placeholder = `24 FOW (${unitSymbol("depth")})`;
  });
  root.querySelectorAll(".catch-depth-down").forEach((input) => {
    input.placeholder = `14 ${unitSymbol("depth")}`;
  });
  root.querySelectorAll(".catch-fow").forEach((input) => {
    input.placeholder = `24 FOW (${unitSymbol("depth")})`;
  });
  root.querySelectorAll(".catch-gps-speed, .catch-ball-speed").forEach((input) => {
    input.placeholder = unitPreference("speed") === "mph" ? "2.4 mph" : unitPreference("speed") === "kn" ? "2.1 kn" : "3.9 kph";
  });
  root.querySelectorAll(".catch-ball-temp").forEach((input) => {
    input.placeholder = unitPreference("waterTemperature") === "C" ? "8 C" : "47 F";
  });
  root.querySelectorAll(".catch-ball-depth, .catch-estimated-lure-depth, .catch-estimated-depth").forEach((input) => {
    input.placeholder = `17 ${unitSymbol("depth")}`;
  });
  root.querySelectorAll(".catch-line-behind-board, .catch-line-out").forEach((input) => {
    input.placeholder = `45 ${unitSymbol("depth")}`;
  });
}

async function saveTimeFormatPreference(options = {}) {
  const checked = document.querySelector("[data-time-format-option]:checked");
  const nextTimeFormat = checked?.value || els.timeFormatSelect?.value || "24";
  if (els.timeFormatSelect) els.timeFormatSelect.value = nextTimeFormat === "12" ? "12" : "24";
  state.settings = {
    ...(state.settings || {}),
    timeFormat: nextTimeFormat === "12" ? "12" : "24"
  };
  try {
    await runSettingsSave(
      async () => {
        await saveState();
        renderAll();
        syncUnitLabels();
        if (activeTripWeatherData?.daily) setWeatherStatus(weatherCardConditionsLabel());
        const summaryTrip = state.trips.find((trip) => trip.id === activeSummaryTripId);
        if (summaryTrip && els.tripSummaryDialog?.open) openTripSummary(summaryTrip);
      },
      "The time format could not be saved.",
      options
    );
  } catch (error) {
  }
}
