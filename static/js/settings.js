function parseWaveHeightFeet(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value * 3.28084 : null;
  const text = String(value).trim().toLowerCase();
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const number = Number(match[0]);
  if (!Number.isFinite(number) || number < 0) return null;
  if (/\bm\b|meter|metre/.test(text)) return number * 3.28084;
  return number;
}

function chopLabelForWaveHeight(value) {
  const feet = parseWaveHeightFeet(value);
  if (feet === null) return "";
  const ranges = normalizeChopRanges(state.settings?.chopRanges);
  const bounded = ranges.find((range) => range.maxFeet !== null && feet <= Number(range.maxFeet));
  return (bounded || ranges.find((range) => range.maxFeet === null) || ranges.at(-1))?.label || "";
}

function renderSettings() {
  renderPreferenceSettings();
  renderUnitSettings();
  renderPredefinedFieldSettings();
  syncUnitLabels();
  renderChopRangeSettings();
  renderLocationManager();
}

function renderPreferenceSettings() {
  applyThemePreference();
  if (els.themeSelect) els.themeSelect.value = themePreference();
  if (els.timeFormatSelect) els.timeFormatSelect.value = timeFormatPreference();
}

function applyThemePreference(theme = themePreference()) {
  const normalizedTheme = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = normalizedTheme;
  document.documentElement.style.colorScheme = normalizedTheme;
}

async function saveThemePreference() {
  const theme = els.themeSelect?.value === "dark" ? "dark" : "light";
  applyThemePreference(theme);
  state.settings = {
    ...(state.settings || {}),
    theme
  };
  try {
    await saveState();
  } catch (error) {
    console.error("Could not save theme.", error);
    alert(error.message || "The theme could not be saved.");
    applyThemePreference();
    if (els.themeSelect) els.themeSelect.value = themePreference();
  }
}

function renderUnitSettings() {
  if (!els.unitSettingsFields) return;
  const units = normalizeUnits(state.settings?.units);
  const rows = [
    ["depth", "Depth fields"],
    ["distance", "Map distances"],
    ["speed", "Trolling speed"],
    ["windSpeed", "Wind speed"],
    ["pressure", "Pressure"],
    ["airTemperature", "Air temperature"],
    ["waterTemperature", "Water temperature"],
    ["precipitation", "Precipitation"],
    ["waveHeight", "Wave height"],
    ["fishLength", "Fish length"],
    ["fishWeight", "Fish weight"]
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

async function saveUnitSettings() {
  const units = normalizeUnits(state.settings?.units);
  document.querySelectorAll("[data-unit-setting]").forEach((select) => {
    units[select.dataset.unitSetting] = select.value;
  });
  state.settings = {
    ...(state.settings || {}),
    units: normalizeUnits(units)
  };
  try {
    await saveState();
    weatherRequestCache.clear();
    marineRequestCache.clear();
    renderAll();
    syncUnitLabels();
    const summaryTrip = state.trips.find((trip) => trip.id === activeSummaryTripId);
    if (summaryTrip && els.tripSummaryDialog?.open) openTripSummary(summaryTrip);
  } catch (error) {
    console.error("Could not save units.", error);
    alert(error.message || "The unit settings could not be saved.");
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
  root.querySelectorAll(".catch-water-depth").forEach((input) => {
    input.placeholder = `24 ${unitSymbol("depth")}`;
  });
  root.querySelectorAll(".catch-depth-down").forEach((input) => {
    input.placeholder = `14 ${unitSymbol("depth")}`;
  });
  root.querySelectorAll(".catch-fow").forEach((input) => {
    input.placeholder = `24 FOW (${unitSymbol("depth")})`;
  });
  root.querySelectorAll(".catch-speed").forEach((input) => {
    input.placeholder = unitPreference("speed") === "mph" ? "2.4 mph" : unitPreference("speed") === "kn" ? "2.1 kn" : "3.9 kph";
  });
  root.querySelectorAll(".catch-ball-depth, .catch-estimated-lure-depth, .catch-estimated-depth").forEach((input) => {
    input.placeholder = `17 ${unitSymbol("depth")}`;
  });
  root.querySelectorAll(".catch-line-behind-board, .catch-line-out").forEach((input) => {
    input.placeholder = `45 ${unitSymbol("depth")}`;
  });
}

async function saveTimeFormatPreference() {
  state.settings = {
    ...(state.settings || {}),
    timeFormat: els.timeFormatSelect?.value === "12" ? "12" : "24"
  };
  try {
    await saveState();
    renderAll();
    syncUnitLabels();
    const summaryTrip = state.trips.find((trip) => trip.id === activeSummaryTripId);
    if (summaryTrip && els.tripSummaryDialog?.open) openTripSummary(summaryTrip);
  } catch (error) {
    console.error("Could not save time format.", error);
    alert(error.message || "The time format could not be saved.");
  }
}

const predefinedFieldGroups = [
  { key: "species", label: "Species" },
  { key: "methods", label: "Methods" },
  { key: "waterClarities", label: "Water clarity" },
  { key: "weatherTypes", label: "Weather" },
  { key: "lureTypes", label: "Lure types" },
  { key: "flasherTypes", label: "Flasher types" },
  { key: "reelStyles", label: "Reel styles" },
  { key: "rodTypes", label: "Rod types" },
  { key: "lineTypes", label: "Line types" },
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
          <span>${escapeHtml(group.label)}</span>
          <span class="predefined-field-count">${items.length} ${items.length === 1 ? "item" : "items"}</span>
        </summary>
        <div class="predefined-field-body">
          <div class="predefined-field-header">
          <button class="button secondary add-predefined-option" type="button">Add</button>
          </div>
          <div class="predefined-option-list">
            ${items.map((item, index) => `
              <div class="predefined-option-row" data-option-index="${index}">
                <input class="predefined-option-label" type="text" value="${escapeHtml(predefinedFieldValue(item))}" aria-label="${escapeHtml(group.label)} option" />
                <button class="button danger remove-predefined-option" type="button">Delete</button>
              </div>
            `).join("")}
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

async function savePredefinedFieldSettings() {
  Object.assign(state, collectPredefinedFieldSettings());
  try {
    await saveState();
    renderAll();
    renderSettings();
  } catch (error) {
    console.error("Could not save predefined fields.", error);
    alert(error.message || "The predefined fields could not be saved.");
  }
}

function renderChopRangeSettings() {
  if (!els.chopRangeRows) return;
  const ranges = normalizeChopRanges(state.settings?.chopRanges);
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

async function saveChopRanges() {
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
    await saveState();
    renderSettings();
    renderTrips();
  } catch (error) {
    console.error("Could not save chop ranges.", error);
    alert(error.message || "The chop ranges could not be saved.");
  }
}
