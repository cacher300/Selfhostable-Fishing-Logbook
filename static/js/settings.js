function renderSettings() {
  syncSettingsTabs();
  renderPreferenceSettings();
  renderDefaultTrollingSpreadSettings();
  renderUnitSettings();
  renderFowCalibrationSettings();
  renderPredefinedFieldSettings();
  syncUnitLabels();
  renderChopRangeSettings();
  renderFishingSpotSettings();
  renderPrivatePhotoLocationSettings();
  renderLocationManager();
}

function defaultTrollingSpreadRowMarkup(item = {}) {
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
    <div class="default-trolling-spread-row">
      <label>
        <span>Rod / reel combo</span>
        <select class="default-spread-combo">
          <option value="">Select rod / reel combo</option>
          ${comboOptions}
        </select>
      </label>
      <label>
        <span>Side</span>
        <select class="default-spread-side">${choiceOptions("setupLineSides", side, "Select side")}</select>
      </label>
      <label>
        <span>Method</span>
        <select class="default-spread-presentation">${choiceOptions("trollingPresentations", presentation, "Select method")}</select>
      </label>
      <button class="button danger remove-default-trolling-spread-row" type="button">Remove</button>
    </div>
  `;
}

function storedDefaultTrollingSpreadForSpecies(targetSpecies = "") {
  const target = String(targetSpecies || "").trim();
  return normalizeDefaultTrollingSpreads(
    state.settings?.defaultTrollingSpreads,
    state.settings?.defaultTrollingSpread
  ).find((item) => item.targetSpecies === target)?.spread || [];
}

function renderDefaultTrollingSpreadSettings() {
  if (!els.defaultTrollingSpreadRows) return;
  const species = [...new Set((state.species || []).map((item) => String(item || "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  if (els.defaultTrollingSpreadTargetSpecies) {
    if (activeDefaultTrollingSpreadTargetSpecies && !species.includes(activeDefaultTrollingSpreadTargetSpecies)) {
      activeDefaultTrollingSpreadTargetSpecies = "";
    }
    els.defaultTrollingSpreadTargetSpecies.innerHTML = ["All target species", ...species].map((speciesName) => {
      const value = speciesName === "All target species" ? "" : speciesName;
      return `<option value="${escapeHtml(value)}" ${value === activeDefaultTrollingSpreadTargetSpecies ? "selected" : ""}>${escapeHtml(speciesName)}</option>`;
    }).join("");
  }
  const spread = storedDefaultTrollingSpreadForSpecies(activeDefaultTrollingSpreadTargetSpecies);
  els.defaultTrollingSpreadRows.innerHTML = `
    <div class="default-trolling-spread-list">
      ${(spread.length ? spread : [{}]).map(defaultTrollingSpreadRowMarkup).join("")}
    </div>
  `;
  renderDefaultTrollingSpreadPreview();
}

function addDefaultTrollingSpreadRow() {
  const list = els.defaultTrollingSpreadRows?.querySelector(".default-trolling-spread-list");
  if (!list) return renderDefaultTrollingSpreadSettings();
  list.insertAdjacentHTML("beforeend", defaultTrollingSpreadRowMarkup());
  renderDefaultTrollingSpreadPreview();
}

function collectDefaultTrollingSpreadSettings() {
  return [...els.defaultTrollingSpreadRows?.querySelectorAll(".default-trolling-spread-row") || []].map((row) => ({
    comboId: row.querySelector(".default-spread-combo")?.value || "",
    side: row.querySelector(".default-spread-side")?.value || "",
    presentation: row.querySelector(".default-spread-presentation")?.value || ""
  })).filter((item) => item.comboId);
}

function defaultTrollingSpreadRodsForPreview() {
  return collectDefaultTrollingSpreadSettings().map((item, index) => ({
    ...(state.rodReelCombos.find((combo) => combo.id === item.comboId) || {}),
    id: `default-spread-${index}`,
    comboId: item.comboId,
    lineSide: item.side,
    trollingMethod: item.presentation,
    lureId: "",
    flasherId: "",
    fishCount: 0,
    lostCount: 0
  }));
}

function renderDefaultTrollingSpreadPreview() {
  if (!els.defaultTrollingSpreadCanvas || typeof renderSpreadDiagram !== "function") return;
  els.defaultTrollingSpreadCanvas.innerHTML = renderSpreadDiagram(defaultTrollingSpreadRodsForPreview(), { labelWithCombo: true });
}

function updateDefaultTrollingSpreadSettings(targetSpecies, spread) {
  const currentSpread = normalizeDefaultTrollingSpread(spread);
  const spreads = normalizeDefaultTrollingSpreads(
    state.settings?.defaultTrollingSpreads,
    state.settings?.defaultTrollingSpread
  ).filter((item) => item.targetSpecies !== targetSpecies);
  if (currentSpread.length) spreads.push({ targetSpecies, spread: currentSpread });
  state.settings = {
    ...(state.settings || {}),
    defaultTrollingSpreads: spreads,
    defaultTrollingSpread: defaultTrollingSpreadForSpecies("", spreads, [])
  };
}

async function saveDefaultTrollingSpreadSettings(options = {}) {
  const targetSpecies = options.targetSpecies ?? activeDefaultTrollingSpreadTargetSpecies;
  const spread = options.spread ?? collectDefaultTrollingSpreadSettings();
  updateDefaultTrollingSpreadSettings(targetSpecies, spread);
  try {
    await runSettingsSave(
      async () => {
        await saveState();
        if (options.rerender !== false) renderDefaultTrollingSpreadSettings();
      },
      "The default trolling spread could not be saved.",
      options
    );
  } catch (error) {
  }
}

function renderPreferenceSettings() {
  applyThemePreference();
  document.querySelectorAll("[data-theme-option]").forEach((input) => {
    input.checked = input.value === themePreference();
  });
  if (els.timeFormatSelect) els.timeFormatSelect.value = timeFormatPreference();
  if (els.defaultHomeLakeSelect) els.defaultHomeLakeSelect.value = state.settings?.defaultHomeLake || "";
  if (els.boatFeatureEnabled) els.boatFeatureEnabled.checked = state.settings?.boatFeatureEnabled === true;
  document.querySelectorAll("[data-time-format-option]").forEach((input) => {
    input.checked = input.value === timeFormatPreference();
  });
}

async function saveBoatFeaturePreference(options = {}) {
  const boatFeatureEnabled = els.boatFeatureEnabled?.checked === true;
  state.settings = { ...(state.settings || {}), boatFeatureEnabled };
  syncBoatFeatureVisibility();
  if (!boatFeatureEnabled && document.body.dataset.activeView === "boat") setView("trips");
  await runSettingsSave(() => saveState(), "The Boat tab preference could not be saved.", options);
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
  const lakeCalibrations = normalizeBathymetryLakeCalibrations(state.settings?.bathymetryLakeCalibrationsFeet);
  els.fowCalibrationFields.innerHTML = ["Erie", "Ontario", "St. Clair", "Huron", "Michigan", "Superior"].map((lake) => `
    <label class="settings-control">
      <span>${escapeHtml(lake)} FOW adjustment</span>
      <input data-bathymetry-lake-calibration="${escapeHtml(lake)}" data-bathymetry-calibration-end="offshoreOffsetFeet" type="number" step="0.1" value="${escapeHtml(bathymetryOffsetDisplayValue(lakeCalibrations[lake].offshoreOffsetFeet, calibrationUnit))}" />
    </label>
  `).join("");
}

function bathymetryOffsetDisplayValue(offsetFeet, depthUnit = unitPreference("depth")) {
  const offset = normalizeBathymetryOffsetFeet(offsetFeet);
  const converted = convertUnitValue(offset, "ft", depthUnit || "ft");
  if (converted === null) return "0";
  return trimNumber(Math.round(converted * 100) / 100);
}

function bathymetryOffsetFeetFromDisplay(value, depthUnit = unitPreference("depth")) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  const converted = convertUnitValue(number, depthUnit || "ft", "ft");
  return normalizeBathymetryOffsetFeet(converted);
}

async function saveUnitSettings(options = {}) {
  const previousState = structuredClone(state);
  const previousUnits = normalizeUnits(state.settings?.units);
  const units = { ...previousUnits };
  document.querySelectorAll("[data-unit-setting]").forEach((select) => {
    units[select.dataset.unitSetting] = select.value;
  });
  const lakeCalibrations = {};
  document.querySelectorAll("[data-bathymetry-lake-calibration]").forEach((input) => {
    const lake = input.dataset.bathymetryLakeCalibration;
    lakeCalibrations[lake] ||= {};
    // The field was rendered in the unit that was active before this save.
    lakeCalibrations[lake][input.dataset.bathymetryCalibrationEnd] = bathymetryOffsetFeetFromDisplay(input.value, previousUnits.depth);
  });
  const nextUnits = normalizeUnits(units);
  convertStoredMeasurements(previousUnits, nextUnits);
  state.settings = {
    ...(state.settings || {}),
    units: nextUnits,
    bathymetryLakeCalibrationsFeet: normalizeBathymetryLakeCalibrations(lakeCalibrations)
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
