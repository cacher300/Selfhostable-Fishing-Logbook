function parseWaveHeightFeet(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? convertUnitValue(value, unitPreference("waveHeight"), "ft") : null;
  const text = String(value).trim().toLowerCase();
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const number = Number(match[0]);
  if (!Number.isFinite(number) || number < 0) return null;
  const explicitUnit = explicitMeasurementUnit(text.match(/[a-zA-Z°]+/)?.[0]);
  const sourceUnit = explicitUnit || unitPreference("waveHeight");
  return convertUnitValue(number, sourceUnit, "ft") ?? null;
}

function chopLabelForWaveHeight(value) {
  const feet = parseWaveHeightFeet(value);
  if (feet === null) return "";
  const ranges = normalizeChopRanges(state.settings?.chopRanges);
  const bounded = ranges.find((range) => range.maxFeet !== null && feet <= Number(range.maxFeet));
  return (bounded || ranges.find((range) => range.maxFeet === null) || ranges.at(-1))?.label || "";
}

let settingsAutosaveTimer = null;
let settingsStatusTimer = null;
let privateLocationNameEditId = "";
let activeSettingsTab = "general";
let chopRangesEditing = false;
let chopRangesEditSnapshot = null;
let activeDefaultTrollingSpreadTargetSpecies = "";
const privateLocationFocusZoom = 16;

function setSettingsSaveStatus(text = "Autosave on", status = "") {
  if (!els.settingsSaveStatus) return;
  els.settingsSaveStatus.textContent = text;
  els.settingsSaveStatus.classList.toggle("is-saving", status === "saving");
  els.settingsSaveStatus.classList.toggle("is-error", status === "error");
}

function markSettingsSaved() {
  setSettingsSaveStatus("Saved");
  clearTimeout(settingsStatusTimer);
  settingsStatusTimer = setTimeout(() => setSettingsSaveStatus("Autosave on"), 1800);
}

async function runSettingsSave(work, errorMessage, options = {}) {
  const isAutosave = options.autosave === true;
  setSettingsSaveStatus(isAutosave ? "Autosaving..." : "Saving...", "saving");
  try {
    await work();
    markSettingsSaved();
  } catch (error) {
    console.error(errorMessage, error);
    setSettingsSaveStatus("Save failed", "error");
    if (!isAutosave) alert(error.message || errorMessage);
    throw error;
  }
}

function scheduleSettingsAutosave(saveAction, delay = 650) {
  clearTimeout(settingsAutosaveTimer);
  setSettingsSaveStatus("Autosaving...", "saving");
  settingsAutosaveTimer = setTimeout(() => {
    saveAction({ autosave: true }).catch(() => {});
  }, delay);
}

function setDatabaseBackupStatus(message = "") {
  if (els.databaseBackupStatus) els.databaseBackupStatus.textContent = message;
}

async function exportDatabaseArchive() {
  const button = els.exportDatabaseButton;
  if (!button) return;
  button.disabled = true;
  setDatabaseBackupStatus("Preparing backup...");
  try {
    const response = await fetch("/api/archive");
    if (!response.ok) throw new Error("Could not export the database.");
    const archive = await response.blob();
    const url = URL.createObjectURL(archive);
    const link = document.createElement("a");
    link.href = url;
    link.download = "fishing-logbook-archive.zip";
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setDatabaseBackupStatus("Backup downloaded. It includes uploaded photos.");
  } catch (error) {
    console.error("Database export failed", error);
    setDatabaseBackupStatus(error.message || "Database export failed.");
    alert(error.message || "Database export failed.");
  } finally {
    button.disabled = false;
  }
}

async function importDatabaseArchive(event) {
  const input = event.target;
  const archive = input.files?.[0];
  input.value = "";
  if (!archive) return;
  if (!confirm("Importing a backup replaces the current logbook data. Uploaded photos in the backup will be restored. Continue?")) return;

  const button = els.importDatabaseButton;
  if (button) button.disabled = true;
  setDatabaseBackupStatus("Importing backup...");
  try {
    const formData = new FormData();
    formData.append("archive", archive);
    const response = await protectedFetch("/api/archive", { method: "POST", body: formData });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Could not import the database.");
    const refreshed = await fetch("/api/logbook");
    if (!refreshed.ok) throw new Error("The backup was imported, but the logbook could not be refreshed.");
    state = normalizeState(await refreshed.json());
    localStorage.setItem(storageKey, JSON.stringify(state));
    renderAll();
    setDatabaseBackupStatus("Backup imported, including uploaded photos.");
  } catch (error) {
    console.error("Database import failed", error);
    setDatabaseBackupStatus(error.message || "Database import failed.");
    alert(error.message || "Database import failed.");
  } finally {
    if (button) button.disabled = false;
  }
}

function renderSettings() {
  syncSettingsTabs();
  renderPreferenceSettings();
  renderDefaultTrollingSpreadSettings();
  renderUnitSettings();
  renderFowCalibrationSettings();
  renderPredefinedFieldSettings();
  syncUnitLabels();
  renderChopRangeSettings();
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
        <span>Trolling method</span>
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
  document.querySelectorAll("[data-time-format-option]").forEach((input) => {
    input.checked = input.value === timeFormatPreference();
  });
}

function setSettingsTab(tab = "general") {
  activeSettingsTab = tab;
  syncSettingsTabs();
  if (tab === "waterbodies") {
    setTimeout(() => privatePhotoLocationMap?.invalidateSize(), 80);
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

const predefinedFieldGroups = [
  { key: "species", label: "Species" },
  { key: "methods", label: "Methods" },
  { key: "waterClarities", label: "Water clarity" },
  { key: "weatherTypes", label: "Weather" },
  { key: "lureTypes", label: "Lure types" },
  { key: "flasherTypes", label: "Flasher types" },
  { key: "reelStyles", label: "Reel categories" },
  { key: "rodTypes", label: "Rod categories" },
  { key: "lineTypes", label: "Line types" },
  { key: "lureBladeTypes", label: "Lure blade types" },
  { key: "lureSpoonSizes", label: "Lure spoon sizes" },
  { key: "trollingPresentations", label: "Trolling methods", choice: true },
  { key: "trollingDirections", label: "Trolling directions" },
  { key: "setupLineSides", label: "Setup line sides", choice: true }
];

function predefinedFieldItems(group) {
  return group.choice ? optionChoices(group.key) : optionLabels(group.key);
}

function predefinedFieldValue(item) {
  return typeof item === "object" ? item.label : item;
}

function renderPredefinedFieldSettings() {
  if (!els.predefinedFieldSettings) return;
  els.predefinedFieldSettings.innerHTML = predefinedFieldGroups.map((group) => {
    const items = predefinedFieldItems(group);
    return `
      <details class="predefined-field-group" data-predefined-key="${escapeHtml(group.key)}">
        <summary class="predefined-field-summary">
          <span>
            <strong>${escapeHtml(group.label)}</strong>
            <small>${items.slice(0, 3).map((item) => escapeHtml(predefinedFieldValue(item))).join(", ")}${items.length > 3 ? "..." : ""}</small>
          </span>
          <span class="predefined-field-count">${items.length} ${items.length === 1 ? "item" : "items"}</span>
        </summary>
        <div class="predefined-field-body">
          <div class="predefined-option-list">
            ${items.map((item, index) => `
              <div class="predefined-option-row" data-option-index="${index}">
                <input class="predefined-option-label" type="text" value="${escapeHtml(predefinedFieldValue(item))}" aria-label="${escapeHtml(group.label)} option" />
                <button class="button danger remove-predefined-option" type="button">Delete</button>
              </div>
            `).join("")}
            </div>
          <div class="predefined-field-header">
            <button class="button secondary add-predefined-option" type="button">Add</button>
          </div>
        </div>
      </details>
    `;
  }).join("");
}

function updatePredefinedFieldCount(group) {
  if (!group) return;
  const count = group.querySelectorAll(".predefined-option-row").length;
  const label = group.querySelector(".predefined-field-count");
  if (label) label.textContent = `${count} ${count === 1 ? "item" : "items"}`;
}

function collectPredefinedFieldSettings() {
  const next = {};
  els.predefinedFieldSettings?.querySelectorAll(".predefined-field-group").forEach((section) => {
    const group = predefinedFieldGroups.find((item) => item.key === section.dataset.predefinedKey);
    if (!group) return;
    const current = predefinedFieldItems(group);
    const rows = [...section.querySelectorAll(".predefined-option-row")];
    if (group.choice) {
      next[group.key] = normalizeChoiceOptions(rows.map((row) => {
        const index = Number(row.dataset.optionIndex);
        const existing = current[index];
        const label = row.querySelector(".predefined-option-label")?.value.trim() || "";
        return {
          value: existing?.value || slugOptionValue(label),
          label
        };
      }), defaults[group.key]);
    } else {
      next[group.key] = normalizeTextOptions(rows.map((row) => row.querySelector(".predefined-option-label")?.value), defaults[group.key]);
    }
  });
  return next;
}

async function savePredefinedFieldSettings(options = {}) {
  Object.assign(state, collectPredefinedFieldSettings());
  try {
    await runSettingsSave(
      async () => {
        await saveState();
        renderAll();
        if (options.rerender !== false) renderSettings();
      },
      "The predefined fields could not be saved.",
      options
    );
  } catch (error) {
  }
}

function renderChopRangeSettings() {
  if (!els.chopRangeRows) return;
  const ranges = normalizeChopRanges(state.settings?.chopRanges);
  if (els.editChopRangesButton) {
    els.editChopRangesButton.textContent = chopRangesEditing ? "Done Editing" : "Edit Chop Ranges";
  }
  els.cancelChopRangesButton?.classList.toggle("hidden", !chopRangesEditing);
  if (!chopRangesEditing) {
    const lastBoundedRange = [...ranges].reverse().find((range) => range.maxFeet !== null);
    const overflowText = lastBoundedRange ? `> ${trimNumber(lastBoundedRange.maxFeet)} ft` : "Above previous range";
    els.chopRangeRows.innerHTML = `
      <div class="chop-range-list">
        ${ranges.map((range) => `
          <div class="chop-range-display-row">
            <strong>${escapeHtml(range.label)}</strong>
            <span>${range.maxFeet === null ? escapeHtml(overflowText) : `&le; ${escapeHtml(trimNumber(range.maxFeet))} ft`}</span>
          </div>
        `).join("")}
      </div>
    `;
    return;
  }
  els.chopRangeRows.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Condition</th>
          <th>Max wave height</th>
        </tr>
      </thead>
      <tbody>
        ${ranges.map((range, index) => `
          <tr class="chop-range-row" data-range-index="${index}">
            <td>
              <input class="chop-range-label" type="text" value="${escapeHtml(range.label)}" aria-label="Chop condition label" />
            </td>
            <td>
              ${range.maxFeet === null
                ? `<span class="range-overflow-label">Above previous range</span>`
                : `<div class="unit-input"><input class="chop-range-max" type="number" min="0" step="0.1" value="${escapeHtml(range.maxFeet)}" aria-label="Maximum wave height in feet" /><span>ft</span></div>`}
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

async function toggleChopRangeEditing() {
  if (chopRangesEditing) {
    await saveChopRanges();
    chopRangesEditing = false;
    chopRangesEditSnapshot = null;
    renderChopRangeSettings();
    return;
  }
  chopRangesEditSnapshot = normalizeChopRanges(state.settings?.chopRanges);
  chopRangesEditing = true;
  renderChopRangeSettings();
}

async function cancelChopRangeEditing() {
  clearTimeout(settingsAutosaveTimer);
  if (chopRangesEditSnapshot) {
    state.settings = {
      ...(state.settings || {}),
      chopRanges: normalizeChopRanges(chopRangesEditSnapshot)
    };
    await runSettingsSave(
      async () => {
        await saveState();
        renderTrips();
      },
      "The chop range edits could not be cancelled."
    ).catch(() => {});
  }
  chopRangesEditing = false;
  chopRangesEditSnapshot = null;
  renderChopRangeSettings();
}

function saveCurrentSettingsTab() {
  if (activeSettingsTab === "trolling-spread") return saveDefaultTrollingSpreadSettings();
  if (activeSettingsTab === "measurements" && chopRangesEditing) return saveChopRanges();
  if (activeSettingsTab === "measurements") return saveUnitSettings();
  if (activeSettingsTab === "lists") return savePredefinedFieldSettings();
  if (activeSettingsTab === "waterbodies") return savePrivatePhotoLocations(collectPrivatePhotoLocationSettings());
  return runSettingsSave(() => saveState(), "The settings could not be saved.");
}

async function saveChopRanges(options = {}) {
  const current = normalizeChopRanges(state.settings?.chopRanges);
  const ranges = [...document.querySelectorAll(".chop-range-row")].map((row, index) => {
    const maxInput = row.querySelector(".chop-range-max");
    return {
      id: current[index]?.id || `chop-${index + 1}`,
      label: row.querySelector(".chop-range-label")?.value.trim() || current[index]?.label || "",
      maxFeet: maxInput ? Number(maxInput.value) : null
    };
  });
  state.settings = {
    ...(state.settings || {}),
    chopRanges: normalizeChopRanges(ranges)
  };
  try {
    await runSettingsSave(
      async () => {
        await saveState();
        if (options.rerender !== false) {
          chopRangesEditing = false;
          chopRangesEditSnapshot = null;
          renderSettings();
        }
        renderTrips();
      },
      "The chop ranges could not be saved.",
      options
    );
  } catch (error) {
  }
}

function privatePhotoLocations() {
  const existing = state.settings?.privatePhotoLocations;
  return normalizePrivatePhotoLocations(existing);
}

function privateLocationSummary(location) {
  return `${coordinateText(location.coordinates)} / ${privateLocationRadiusText(location.radiusMeters)}`;
}

function privateLocationRadiusUnit() {
  return unitPreference("distance") === "mi" ? "ft" : "m";
}

function privateLocationRadiusDisplayValue(radiusMeters) {
  const radius = Math.max(25, Math.min(10000, Number(radiusMeters) || 400));
  const unit = privateLocationRadiusUnit();
  const value = unit === "ft" ? convertUnitValue(radius, "m", "ft") : radius;
  return Math.round(value);
}

function privateLocationRadiusMeters(displayValue) {
  const unit = privateLocationRadiusUnit();
  const value = Number(displayValue) || privateLocationRadiusDisplayValue(400);
  const meters = unit === "ft" ? convertUnitValue(value, "ft", "m") : value;
  return Math.max(25, Math.min(10000, meters || 400));
}

function privateLocationRadiusSliderConfig() {
  const unit = privateLocationRadiusUnit();
  if (unit === "ft") {
    return {
      min: Math.round(convertUnitValue(25, "m", "ft")),
      max: Math.round(convertUnitValue(10000, "m", "ft")),
      step: 1,
      unit
    };
  }
  return { min: 25, max: 10000, step: 25, unit };
}

function privateLocationRadiusText(radiusMeters) {
  const unit = privateLocationRadiusUnit();
  return `${trimNumber(privateLocationRadiusDisplayValue(radiusMeters))} ${unit}`;
}

function privateLocationRadiusProgress(displayValue) {
  const { min, max } = privateLocationRadiusSliderConfig();
  const radius = Math.max(min, Math.min(max, Number(displayValue) || privateLocationRadiusDisplayValue(400)));
  return Math.round(((radius - min) / (max - min)) * 10000) / 100;
}

function privateLocationRadiusStyle(radiusMeters) {
  return `--private-location-radius-progress: ${privateLocationRadiusProgress(privateLocationRadiusDisplayValue(radiusMeters))}%;`;
}

function updatePrivateLocationRadiusControl(input) {
  input.style.setProperty("--private-location-radius-progress", `${privateLocationRadiusProgress(input.value)}%`);
}

function ensureActivePrivatePhotoLocation(locations = privatePhotoLocations()) {
  if (!locations.length) {
    activePrivatePhotoLocationId = "";
    return "";
  }
  if (!locations.some((location) => location.id === activePrivatePhotoLocationId)) {
    activePrivatePhotoLocationId = locations[0].id;
  }
  return activePrivatePhotoLocationId;
}

function renderPrivatePhotoLocationSettings() {
  if (!els.privatePhotoLocationList) return;
  const locations = privatePhotoLocations();
  const activeLocationId = ensureActivePrivatePhotoLocation(locations);
  state.settings = {
    ...(state.settings || {}),
    privatePhotoLocations: locations
  };
  const radiusConfig = privateLocationRadiusSliderConfig();
  els.privatePhotoLocationList.innerHTML = locations.length ? locations.map((location) => `
    <article class="private-location-card${location.id === activeLocationId ? " is-selected" : ""}" data-private-location-id="${escapeHtml(location.id)}" aria-current="${location.id === activeLocationId ? "true" : "false"}">
      <div class="private-location-card-head">
        <div class="private-location-name-row">
          ${privateLocationNameEditId === location.id
            ? `<input class="private-location-name" type="text" value="${escapeHtml(location.name)}" aria-label="Home location name" />`
            : `<button class="private-location-name-display" type="button" data-edit-private-location-name="${escapeHtml(location.id)}" data-private-location-name="${escapeHtml(location.name)}">${escapeHtml(location.name)}</button>`}
        </div>
        <button class="button danger" type="button" data-delete-private-location="${escapeHtml(location.id)}">Delete</button>
      </div>
      <label class="settings-control private-location-radius-control">
        <span>Radius <output class="private-location-radius-value">${escapeHtml(privateLocationRadiusText(location.radiusMeters))}</output></span>
        <input class="private-location-radius" type="range" min="${radiusConfig.min}" max="${radiusConfig.max}" step="${radiusConfig.step}" value="${escapeHtml(privateLocationRadiusDisplayValue(location.radiusMeters))}" aria-label="Home location radius in ${radiusConfig.unit}" style="${privateLocationRadiusStyle(location.radiusMeters)}" />
      </label>
    </article>
  `).join("") : `<div class="empty-state compact-empty"><p>No home locations saved.</p></div>`;
  ensurePrivatePhotoLocationMap();
  renderPrivatePhotoLocationMap();
}

function privateLocationDefaultCoordinates() {
  const first = privatePhotoLocations()[0]?.coordinates;
  if (isUsableCoordinates(first)) return first;
  const selected = selectedTripLocationCoordinates();
  if (isUsableCoordinates(selected)) return selected;
  return { latitude: 43.7, longitude: -79.4 };
}

async function savePrivatePhotoLocations(nextLocations, options = {}) {
  state.settings = {
    ...(state.settings || {}),
    privatePhotoLocations: normalizePrivatePhotoLocations(nextLocations)
  };
  ensureActivePrivatePhotoLocation(state.settings.privatePhotoLocations);
  try {
    await runSettingsSave(
      async () => {
        await saveState();
        if (options.rerender !== false) {
          renderPrivatePhotoLocationSettings();
        } else {
          renderPrivatePhotoLocationMap();
        }
      },
      "The private photo locations could not be saved.",
      options
    );
  } catch (error) {
  }
}

function collectPrivatePhotoLocationSettings() {
  const current = new Map(privatePhotoLocations().map((location) => [location.id, location]));
  return [...els.privatePhotoLocationList.querySelectorAll("[data-private-location-id]")].map((card) => {
    const existing = current.get(card.dataset.privateLocationId);
    const nameInput = card.querySelector(".private-location-name");
    const nameDisplay = card.querySelector("[data-private-location-name]");
    return {
      ...existing,
      name: nameInput?.value.trim() || nameDisplay?.dataset.privateLocationName || existing?.name || "Home",
      radiusMeters: privateLocationRadiusMeters(card.querySelector(".private-location-radius")?.value || privateLocationRadiusDisplayValue(existing?.radiusMeters || 400))
    };
  });
}

function ensurePrivatePhotoLocationMap() {
  if (!window.L || !els.privatePhotoLocationMap) return;
  if (!privatePhotoLocationMap) {
    privatePhotoLocationMap = L.map(els.privatePhotoLocationMap, seamlessMapOptions());
    addSeamlessTileLayer(privatePhotoLocationMap);
    privatePhotoLocationLayer = L.featureGroup().addTo(privatePhotoLocationMap);
    privatePhotoLocationMap.on("click", async (event) => {
      const locations = collectPrivatePhotoLocationSettings();
      const activeLocationId = ensureActivePrivatePhotoLocation(locations);
      if (!activeLocationId) return;
      const next = locations.map((location) => (
        location.id === activeLocationId
          ? { ...location, coordinates: { latitude: event.latlng.lat, longitude: event.latlng.lng } }
          : location
      ));
      await savePrivatePhotoLocations(next);
    });
  }
  const center = privateLocationDefaultCoordinates();
  privatePhotoLocationMap.setView([center.latitude, center.longitude], privatePhotoLocations().length ? 11 : 7);
  setTimeout(() => privatePhotoLocationMap.invalidateSize(), 50);
}

function renderPrivatePhotoLocationMap() {
  if (!window.L || !privatePhotoLocationMap || !privatePhotoLocationLayer) return;
  privatePhotoLocationLayer.clearLayers();
  const locations = privatePhotoLocations();
  locations.forEach((location) => {
    const isActive = location.id === activePrivatePhotoLocationId;
    const point = [location.coordinates.latitude, location.coordinates.longitude];
    const circle = L.circle(point, {
      radius: Number(location.radiusMeters) || 400,
      color: isActive ? "#118753" : "#65718a",
      weight: isActive ? 3 : 2,
      fillColor: "#2fb875",
      fillOpacity: isActive ? 0.18 : 0.08
    }).addTo(privatePhotoLocationLayer);
    circle.bindPopup(`${escapeHtml(location.name)}<br>${escapeHtml(privateLocationSummary(location))}`);
    const marker = L.marker(point, { draggable: true }).addTo(privatePhotoLocationLayer);
    marker.on("click", () => {
      activePrivatePhotoLocationId = location.id;
      renderPrivatePhotoLocationSettings();
    });
    marker.on("dragend", async () => {
      activePrivatePhotoLocationId = location.id;
      const latLng = marker.getLatLng();
      const next = collectPrivatePhotoLocationSettings().map((item) => (
        item.id === location.id
          ? { ...item, coordinates: { latitude: latLng.lat, longitude: latLng.lng } }
          : item
      ));
      await savePrivatePhotoLocations(next);
    });
  });
  if (locations.length) {
    const activeLocation = locations.find((location) => location.id === activePrivatePhotoLocationId) || locations[0];
    privatePhotoLocationMap.setView(
      [activeLocation.coordinates.latitude, activeLocation.coordinates.longitude],
      Math.max(privatePhotoLocationMap.getZoom(), privateLocationFocusZoom)
    );
  }
}
