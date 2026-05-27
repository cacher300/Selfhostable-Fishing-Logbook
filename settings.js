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
  syncUnitLabels();
  renderChopRangeSettings();
  renderLocationManager();
}

function renderPreferenceSettings() {
  if (els.timeFormatSelect) els.timeFormatSelect.value = timeFormatPreference();
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
  if (els.structure) els.structure.placeholder = `40-60 ${unitSymbol("depth")}, drop-off`;
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
