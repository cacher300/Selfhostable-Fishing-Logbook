import { html, insertHtml, joinHtml, setHtml } from "./html.js";
import { createId, speciesColor, unitOptions } from "./app-defaults.js";
import { state, ui } from "./app-state.js";
import { currentTrollingSpreads, hasFishHawk, optionChoices } from "./app-normalization.js";
import { convertStoredMeasurements, convertUnitValue, normalizeUnits, themePreference, timeFormatPreference, unitPreference, unitSymbol } from "./app-units.js";
import { updateLogbook, updateSettings } from "./actions.js";
import { els } from "./app-elements.js";
import { renderLocationManager } from "./locations.js";
import { marineRequestCache, setWeatherStatus, updateMarineWaveHeightPlaceholder, weatherCardConditionsLabel, weatherRequestCache } from "./location-weather.js";
import { runSettingsSave, scheduleSettingsAutosave, settingsAutosaveTimer, settingsUi } from "./settings-core.js";
import { renderSavedSetupSettings } from "./saved-setups.js";
import { renderChopRangeSettings, renderPredefinedFieldSettings } from "./settings-fields.js";
import { renderFishingSpotSettings, renderPrivatePhotoLocationSettings } from "./settings-locations.js";
import { renderAll } from "./dashboard.js";
import { mergePeople } from "./trip-editor.js";
import { comboName } from "./gear-core.js";
import { renderSpreadDiagram } from "./trolling-spread.js";
import { renderFishMap } from "./maps.js";
import { openTripSummary } from "./trip-timeline.js";
import { syncFishHawkVisibility, trimNumber } from "./form-utils.js";
import {
  preferencesDraftFromSettings,
  preferencesFromDraft,
  speciesMapColorsDraftFromSettings,
  speciesMapColorsFromDraft,
  trollingSpreadFromDraft,
  unitsDraftFromSettings,
  unitsFromDraft
} from "./settings-draft.js";


export function renderSettings() {
  syncSettingsTabs();
  renderPreferenceSettings();
  renderSpeciesMapColorSettings();
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

export function trollingSpreadRowMarkup(item = {}, { disabled = false, sourceIndex = "", spreadIndex = 0 } = {}) {
  const comboId = String(item.comboId || "");
  const side = String(item.side || "");
  const presentation = String(item.presentation || "");
  const dipseyDiverColor = String(item.dipseyDiverColor || "");
  const comboOptions = joinHtml(state.rodReelCombos.map((combo) => (
    html`<option value="${combo.id}" ${combo.id === comboId ? "selected" : ""}>${comboName(combo.id) || "Rod / reel combo"}</option>`
  )), "");
  const choiceOptions = (key, selectedValue, emptyLabel) => (
    html`<option value="">${emptyLabel}</option>${joinHtml(optionChoices(key).map((option) => (
      html`<option value="${option.value}" ${option.value === selectedValue ? "selected" : ""}>${option.label}</option>`
    )), "")}`
  );
  return html`
    <div class="trolling-spread-row"${sourceIndex === "" ? "" : html` data-source-index="${sourceIndex}"`}>
      <label>
        <span>Rod / reel combo</span>
        <select class="trolling-spread-combo" data-settings-draft="trollingSpreadsDraft" data-settings-bind="${spreadIndex}.spread.${sourceIndex === "" ? 0 : sourceIndex}.comboId"${disabled ? " disabled" : ""}>
          <option value="">Select rod / reel combo</option>
          ${comboOptions}
        </select>
      </label>
      <label>
        <span>Side</span>
        <select class="trolling-spread-side" data-settings-draft="trollingSpreadsDraft" data-settings-bind="${spreadIndex}.spread.${sourceIndex === "" ? 0 : sourceIndex}.side"${disabled ? " disabled" : ""}>${choiceOptions("setupLineSides", side, "Select side")}</select>
      </label>
      <label>
        <span>Method</span>
        <select class="trolling-spread-presentation" data-settings-draft="trollingSpreadsDraft" data-settings-bind="${spreadIndex}.spread.${sourceIndex === "" ? 0 : sourceIndex}.presentation"${disabled ? " disabled" : ""}>${choiceOptions("trollingPresentations", presentation, "Select method")}</select>
      </label>
      <label class="trolling-spread-dipsey-color-field${trollingSpreadUsesDipseyDiverColor(presentation) ? "" : " hidden"}">
        <span>Dipsey diver color</span>
        <input class="trolling-spread-dipsey-color" type="text" value="${dipseyDiverColor}" data-settings-draft="trollingSpreadsDraft" data-settings-bind="${spreadIndex}.spread.${sourceIndex === "" ? 0 : sourceIndex}.dipseyDiverColor" placeholder="Purple / green"${disabled ? " disabled" : ""} />
      </label>
      ${disabled ? "" : html`<button class="button danger remove-trolling-spread-row" type="button">Remove</button>`}
    </div>
  `;
}

export function trollingSpreadUsesDipseyDiverColor(value) {
  const key = String(value || "").trim().toLowerCase().replace(/[\s_]+/g, "-");
  return key === "high-diver" || key === "low-diver";
}

export function syncTrollingSpreadRowFields(row) {
  if (!row) return;
  const card = row.closest(".trolling-spread-card");
  const presentation = settingsUi.trollingSpreadsDraft?.[Number(card?.dataset.trollingSpreadIndex)]?.spread?.[Number(row.dataset.sourceIndex)]?.presentation || "";
  const supportsColor = trollingSpreadUsesDipseyDiverColor(presentation);
  row.querySelector(".trolling-spread-dipsey-color-field")?.classList.toggle("hidden", !supportsColor);
  if (!supportsColor) {
    const input = row.querySelector(".trolling-spread-dipsey-color");
    if (input) input.value = "";
  }
}

export function trollingSpreadRodsForPreview(spread = []) {
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

export function renderTrollingSpreadPreview(card, spread) {
  const canvas = card?.querySelector("[data-trolling-spread-preview]");
  if (!canvas || typeof renderSpreadDiagram !== "function") return;
  setHtml(canvas, renderSpreadDiagram(trollingSpreadRodsForPreview(spread), { labelWithCombo: true }));
}

export function renderTrollingSpreadCard(item, { draft = false, index = 0 } = {}) {
  const name = String(item?.name || "");
  const spread = Array.isArray(item?.spread) ? item.spread : [];
  const editing = draft || settingsUi.activeTrollingSpreadEditorId === item.id;
  const expanded = editing;
  return html`
    <article class="trolling-spread-card${draft ? " is-draft" : ""}" data-trolling-spread-id="${item.id}" data-trolling-spread-index="${index}" data-trolling-spread-draft="${draft ? "true" : "false"}" data-trolling-spread-editing="${editing ? "true" : "false"}" data-trolling-spread-toggle aria-expanded="${expanded ? "true" : "false"}" onclick="toggleTrollingSpreadCard(this, event)">
      <div class="trolling-spread-card-header">
        <label class="settings-control trolling-spread-name-control">
          <span>Spread</span>
          <input class="trolling-spread-name" type="text" maxlength="60" value="${name}" data-settings-draft="trollingSpreadsDraft" data-settings-bind="${index}.name" placeholder="1 Man Spread"${editing ? "" : " readonly"} />
        </label>
        <div class="trolling-spread-card-actions">
          ${editing && !draft ? html`<button class="button secondary finish-trolling-spread-edit" type="button">Done</button>` : !editing ? html`<button class="button secondary edit-trolling-spread" type="button">Edit</button>` : ""}
          ${editing && !draft ? html`<button class="button danger delete-trolling-spread" type="button">Delete</button>` : draft ? html`<button class="button secondary cancel-trolling-spread" type="button">Cancel</button>` : ""}
        </div>
      </div>
      <div class="trolling-spread-card-body"${expanded ? "" : " hidden"}>
        <div class="trolling-spread-card-section">
          <div class="trolling-spread-card-section-heading">
            <div>
              <strong>Rod positions</strong>
              <span>Saved spreads use combo, side, presentation, and optional High/Low Diver color.</span>
            </div>
            ${editing ? html`<button class="button secondary add-trolling-spread-row" type="button">Add Rod</button>` : ""}
          </div>
          <div class="trolling-spread-list">
            ${spread.length ? joinHtml(spread.map((row, rowIndex) => trollingSpreadRowMarkup(row, { disabled: !editing, sourceIndex: rowIndex, spreadIndex: index }))) : html`<p class="trolling-spread-empty-rows">Add at least one rod to save this spread.</p>`}
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

export function renderTrollingSpreadSettings() {
  if (!els.defaultTrollingSpreadRows) return;
  const spreads = currentTrollingSpreads();
  const visibleSpreads = settingsUi.trollingSpreadDraft ? [...spreads, settingsUi.trollingSpreadDraft] : spreads;
  settingsUi.trollingSpreadsDraft = structuredClone(visibleSpreads);
  const defaultId = String(state.settings?.defaultTrollingSpreadId || "");
  if (els.defaultTrollingSpreadId) {
    setHtml(els.defaultTrollingSpreadId, joinHtml([
      html`<option value="">No Trolling default</option>`,
      ...spreads.map((item) => html`<option value="${item.id}">${item.name}</option>`)
    ]));
    els.defaultTrollingSpreadId.value = spreads.some((item) => item.id === defaultId) ? defaultId : "";
    els.defaultTrollingSpreadId.setAttribute("data-settings-draft", "preferencesDraft");
    els.defaultTrollingSpreadId.setAttribute("data-settings-bind", "defaultTrollingSpreadId");
  }
  setHtml(els.defaultTrollingSpreadRows, html`
    ${visibleSpreads.length
      ? joinHtml(visibleSpreads.map((item, index) => renderTrollingSpreadCard(item, { draft: item === settingsUi.trollingSpreadDraft, index })))
      : html`<div class="trolling-spread-empty-state">No saved trolling spreads yet. Add one to make it available from the trip editor.</div>`}
  `);
  els.defaultTrollingSpreadRows.querySelectorAll(".trolling-spread-row").forEach(syncTrollingSpreadRowFields);
  visibleSpreads.forEach((item) => {
    const card = els.defaultTrollingSpreadRows.querySelector(`[data-trolling-spread-id="${CSS.escape(item.id)}"]`);
    renderTrollingSpreadPreview(card, item.spread);
  });
}

export function addTrollingSpread() {
  if (settingsUi.trollingSpreadDraft) {
    document.querySelector(`[data-trolling-spread-id="${CSS.escape(settingsUi.trollingSpreadDraft.id)}"] .trolling-spread-name`)?.focus();
    return;
  }
  settingsUi.trollingSpreadDraft = { id: createId(), name: "", spread: [] };
  settingsUi.activeTrollingSpreadEditorId = settingsUi.trollingSpreadDraft.id;
  renderTrollingSpreadSettings();
  document.querySelector(`[data-trolling-spread-id="${CSS.escape(settingsUi.trollingSpreadDraft.id)}"] .trolling-spread-name`)?.focus();
}

export function addTrollingSpreadRowToCard(card) {
  const list = card?.querySelector(".trolling-spread-list");
  if (!list || card.dataset.trollingSpreadEditing !== "true") return;
  const spread = settingsUi.trollingSpreadsDraft?.[Number(card.dataset.trollingSpreadIndex)];
  if (spread) {
    if (!Array.isArray(spread.spread)) spread.spread = [];
    spread.spread.push({ comboId: "", side: "", presentation: "", dipseyDiverColor: "" });
  }
  card.querySelector(".trolling-spread-empty-rows")?.remove();
  insertHtml(list, "beforeend", trollingSpreadRowMarkup({}, { sourceIndex: spread?.spread?.length ? spread.spread.length - 1 : "", spreadIndex: Number(card.dataset.trollingSpreadIndex) }));
  renderTrollingSpreadPreview(card, collectTrollingSpreadCard(card).spread);
  scheduleTrollingSpreadAutosave(card);
  list.querySelector(".trolling-spread-row:last-child select")?.focus();
}

export function editTrollingSpread(spreadId) {
  if (!currentTrollingSpreads().some((item) => item.id === spreadId)) return;
  settingsUi.activeTrollingSpreadEditorId = spreadId;
  renderTrollingSpreadSettings();
  document.querySelector(`[data-trolling-spread-id="${CSS.escape(spreadId)}"] .trolling-spread-name`)?.focus();
}

export function collectTrollingSpreadCard(card) {
  const id = card?.dataset.trollingSpreadId || createId();
  const existing = currentTrollingSpreads().find((item) => item.id === id);
  const draft = settingsUi.trollingSpreadsDraft?.[Number(card?.dataset.trollingSpreadIndex)] || { id, spread: [] };
  const next = trollingSpreadFromDraft({ ...draft, id }, existing || {});
  if (existing && JSON.stringify(draft.spread || []) === JSON.stringify(existing.spread || [])) next.spread = existing.spread || [];
  return next;
}

export function setTrollingSpreadSettingsMessage(message = "") {
  if (!els.trollingSpreadSettingsMessage) return;
  els.trollingSpreadSettingsMessage.textContent = message;
  els.trollingSpreadSettingsMessage.classList.toggle("hidden", !message);
}

export function toggleTrollingSpreadCard(card, event = null) {
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

export async function finishTrollingSpreadEdit(card) {
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
  settingsUi.activeTrollingSpreadEditorId = "";
  setTrollingSpreadSettingsMessage("");
  renderTrollingSpreadSettings();
}

export function scheduleTrollingSpreadAutosave(card) {
  if (!card || card.dataset.trollingSpreadEditing !== "true") return;
  scheduleSettingsAutosave(async (options = {}) => {
    const next = collectTrollingSpreadCard(card);
    if (!next.name || !next.spread.length) return;
    await saveTrollingSpreadCard(card, options);
  });
}

export async function saveTrollingSpreadCard(card, options = {}) {
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
  const spreads = [...currentTrollingSpreads()];
  const index = spreads.findIndex((item) => item.id === next.id);
  if (index >= 0) spreads[index] = next;
  else spreads.push(next);
  settingsUi.trollingSpreadDraft = null;
  settingsUi.activeTrollingSpreadEditorId = next.id;
  setTrollingSpreadSettingsMessage("");
  try {
    await runSettingsSave(
      () => updateSettings((settings) => { settings.trollingSpreads = spreads; }),
      "The trolling spread could not be saved.",
      options
    );
    renderTrollingSpreadSettings();
  } catch (error) {
    settingsUi.trollingSpreadDraft = wasDraft ? next : null;
    settingsUi.activeTrollingSpreadEditorId = next.id;
    renderTrollingSpreadSettings();
  }
}

export async function deleteTrollingSpread(spreadId) {
  const spread = currentTrollingSpreads().find((item) => item.id === spreadId);
  if (!spread || !confirm(`Delete the ${spread.name} spread?`)) return;
  if (settingsUi.activeTrollingSpreadEditorId === spreadId) settingsUi.activeTrollingSpreadEditorId = "";
  const spreads = currentTrollingSpreads().filter((item) => item.id !== spreadId);
  try {
    await runSettingsSave(
      () => updateSettings((settings) => {
        settings.trollingSpreads = spreads;
        settings.defaultTrollingSpreadId = settings.defaultTrollingSpreadId === spreadId ? "" : settings.defaultTrollingSpreadId || "";
      }),
      "The trolling spread could not be deleted."
    );
    renderTrollingSpreadSettings();
  } catch (error) {
    renderTrollingSpreadSettings();
  }
}

export async function saveDefaultTrollingSpreadId(options = {}) {
  const nextId = (settingsUi.preferencesDraft || preferencesDraftFromSettings(state.settings || {})).defaultTrollingSpreadId || "";
  const validId = !nextId || currentTrollingSpreads().some((item) => item.id === nextId);
  if (!validId) return;
  try {
    await runSettingsSave(
      () => updateSettings((settings) => { settings.defaultTrollingSpreadId = nextId; }),
      "The Trolling default could not be saved.",
      options
    );
  } catch (error) {
    renderTrollingSpreadSettings();
  }
}

export function refreshTrollingSpreadCardPreview(card) {
  renderTrollingSpreadPreview(card, collectTrollingSpreadCard(card).spread);
}

export function cancelTrollingSpreadDraft() {
  settingsUi.trollingSpreadDraft = null;
  settingsUi.activeTrollingSpreadEditorId = "";
  setTrollingSpreadSettingsMessage("");
  renderTrollingSpreadSettings();
}

export function renderPreferenceSettings() {
  settingsUi.preferencesDraft = preferencesDraftFromSettings(state.settings || {});
  applyThemePreference();
  document.querySelectorAll("[data-theme-option]").forEach((input) => {
    input.checked = input.value === themePreference();
    input.setAttribute("data-settings-draft", "preferencesDraft");
    input.setAttribute("data-settings-bind", "theme");
  });
  if (els.timeFormatSelect) {
    els.timeFormatSelect.value = timeFormatPreference();
    els.timeFormatSelect.setAttribute("data-settings-draft", "preferencesDraft");
    els.timeFormatSelect.setAttribute("data-settings-bind", "timeFormat");
  }
  if (els.defaultHomeLakeSelect) {
    els.defaultHomeLakeSelect.value = state.settings?.defaultHomeLake || "";
    els.defaultHomeLakeSelect.setAttribute("data-settings-draft", "preferencesDraft");
    els.defaultHomeLakeSelect.setAttribute("data-settings-bind", "defaultHomeLake");
  }
  if (els.fishHawkToggle) {
    els.fishHawkToggle.checked = hasFishHawk();
    els.fishHawkToggle.setAttribute("data-settings-draft", "preferencesDraft");
    els.fishHawkToggle.setAttribute("data-settings-bind", "hasFishHawk");
  }
  renderDefaultPeopleSettings();
  document.querySelectorAll("[data-time-format-option]").forEach((input) => {
    input.checked = input.value === timeFormatPreference();
    input.setAttribute("data-settings-draft", "preferencesDraft");
    input.setAttribute("data-settings-bind", "timeFormat");
  });
}

export function speciesMapSettingNames() {
  const names = [];
  const seen = new Set();
  const add = (value) => {
    const name = String(value || "").trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) return;
    seen.add(key);
    names.push(name);
  };
  (state.species || []).forEach(add);
  (state.trips || []).forEach((trip) => {
    (trip.catches || []).forEach((catchItem) => add(catchItem.species));
    (trip.lostFish || []).forEach((fish) => add(fish.possibleSpecies || fish.species));
  });
  Object.keys(state.settings?.speciesMapColors || {}).forEach(add);
  return names;
}

export function renderSpeciesMapColorSettings() {
  if (!els.speciesMapColorRows) return;
  const species = speciesMapSettingNames();
  settingsUi.speciesMapColorsDraft = speciesMapColorsDraftFromSettings(state.settings || {});
  settingsUi.speciesMapColorsDirty = new Set();
  setHtml(els.speciesMapColorRows, species.length
    ? joinHtml(species.map((name) => {
      const color = speciesColor(name);
      return html`
        <div class="map-pin-settings-row">
          <label class="map-pin-settings-color-picker">
            <span class="map-pin-settings-swatch" data-species-map-swatch style="--species-map-color:${color}" aria-hidden="true"></span>
            <input type="color" data-species-map-color="${name}" data-settings-draft="speciesMapColorsDraft" data-settings-bind="${name}" value="${color}" aria-label="Map pin color for ${name}" />
          </label>
          <strong class="map-pin-settings-name">${name}</strong>
        </div>
      `;
    }), "")
    : html`<p class="map-pin-settings-empty">Add species under Categories before assigning map colors.</p>`);
}

export function syncSpeciesMapColorPreview(input) {
  if (!input?.matches("[data-species-map-color]")) return;
  const row = input.closest(".map-pin-settings-row");
  const color = input.value;
  row?.querySelector("[data-species-map-swatch]")?.style.setProperty("--species-map-color", color);
}

export function collectSpeciesMapColors() {
  if (settingsUi.speciesMapColorsDirty?.size) {
    const next = { ...(state.settings?.speciesMapColors || {}) };
    settingsUi.speciesMapColorsDirty.forEach((species) => {
      Object.assign(next, speciesMapColorsFromDraft(
        { [species]: settingsUi.speciesMapColorsDraft?.[species] },
        { [species]: next[species] }
      ));
    });
    return next;
  }
  return speciesMapColorsFromDraft(
    settingsUi.speciesMapColorsDraft || speciesMapColorsDraftFromSettings(state.settings || {}),
    state.settings?.speciesMapColors || {}
  );
}

export async function saveSpeciesMapColors(options = {}) {
  const speciesMapColors = collectSpeciesMapColors();
  try {
    await runSettingsSave(
      async () => {
        await updateSettings((settings) => {
          settings.speciesMapColors = speciesMapColors;
        });
        if (options.rerender !== false) renderSpeciesMapColorSettings();
        if (!els.mapPanel?.classList.contains("hidden")) renderFishMap();
      },
      "The species map colors could not be saved.",
      options
    );
  } catch (error) {
    renderSpeciesMapColorSettings();
  }
}

export async function saveFishHawkPreference(options = {}) {
  const nextSetting = (settingsUi.preferencesDraft || preferencesDraftFromSettings(state.settings || {})).hasFishHawk !== false;
  try {
    await runSettingsSave(
      async () => {
        await updateSettings((settings) => {
          settings.hasFishHawk = nextSetting;
        });
        syncFishHawkVisibility();
        const summaryTrip = state.trips.find((trip) => trip.id === ui.activeSummaryTripId);
        if (summaryTrip && els.tripSummaryDialog?.open) openTripSummary(summaryTrip);
      },
      "The Fish Hawk setting could not be saved.",
      options
    );
  } catch (error) {
    renderPreferenceSettings();
    syncFishHawkVisibility();
  }
}

export function renderDefaultPeopleSettings() {
  if (!els.defaultPeopleOptions) return;
  const selectedIds = new Set(Array.isArray(state.settings?.defaultPeople) ? state.settings.defaultPeople : []);
  const people = mergePeople(state.people || []);
  setHtml(els.defaultPeopleOptions, people.length
    ? joinHtml(people.map((person) => html`
        <label>
          <input type="checkbox" value="${person.id}" data-settings-draft="preferencesDraft" data-settings-list="defaultPeople" ${selectedIds.has(person.id) ? "checked" : ""} />
          <span>${person.name}</span>
        </label>
      `), "")
    : html`<span class="default-people-empty">Add people from a trip to choose defaults.</span>`);
}

export async function saveDefaultPeople(options = {}) {
  const availableIds = new Set((state.people || []).map((person) => person.id));
  const preferences = preferencesFromDraft(settingsUi.preferencesDraft || preferencesDraftFromSettings(state.settings || {}), state.settings || {}, availableIds);
  await runSettingsSave(
    () => updateSettings((settings) => { settings.defaultPeople = preferences.defaultPeople; }),
    "The default people could not be saved.",
    options
  );
}

export async function saveDefaultHomeLake(options = {}) {
  const defaultHomeLake = String((settingsUi.preferencesDraft || preferencesDraftFromSettings(state.settings || {})).defaultHomeLake || "");
  await runSettingsSave(
    () => updateSettings((settings) => { settings.defaultHomeLake = defaultHomeLake; }),
    "The default home lake could not be saved.",
    options
  );
}

export function setSettingsTab(tab = "general") {
  settingsUi.activeSettingsTab = tab;
  syncSettingsTabs();
  if (tab === "waterbodies") {
    setTimeout(() => ui.privatePhotoLocationMap?.invalidateSize(), 80);
    setTimeout(() => ui.fishingSpotMap?.invalidateSize(), 80);
  }
}

export function syncSettingsTabs() {
  const tabs = document.querySelectorAll("[data-settings-tab]");
  const panels = document.querySelectorAll("[data-settings-panel]");
  if (![...tabs].some((tab) => tab.dataset.settingsTab === settingsUi.activeSettingsTab)) settingsUi.activeSettingsTab = "general";
  tabs.forEach((tab) => {
    const active = tab.dataset.settingsTab === settingsUi.activeSettingsTab;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
  });
  panels.forEach((panel) => {
    const active = panel.dataset.settingsPanel === settingsUi.activeSettingsTab;
    panel.classList.toggle("is-active", active);
    panel.hidden = !active;
  });
}

export function applyThemePreference(theme = themePreference()) {
  const normalizedTheme = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = normalizedTheme;
  document.documentElement.style.colorScheme = normalizedTheme;
}

export async function saveThemePreference(options = {}) {
  const theme = (settingsUi.preferencesDraft || preferencesDraftFromSettings(state.settings || {})).theme === "dark" ? "dark" : "light";
  applyThemePreference(theme);
  try {
    await runSettingsSave(
      () => updateSettings((settings) => { settings.theme = theme; }),
      "The theme could not be saved.",
      options
    );
  } catch (error) {
    applyThemePreference();
    renderPreferenceSettings();
  }
}

export function renderUnitSettings() {
  if (!els.unitSettingsFields) return;
  settingsUi.unitsDraft = unitsDraftFromSettings(state.settings || {});
  const units = settingsUi.unitsDraft;
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
  setHtml(els.unitSettingsFields, joinHtml(rows.map(([key, label]) => html`
    <label class="settings-control">
      <span>${label}</span>
      <select data-unit-setting="${key}" data-settings-draft="unitsDraft" data-settings-bind="${key}">
        ${joinHtml((unitOptions[key] || []).map((option) => html`
          <option value="${option.value}"${units[key] === option.value ? " selected" : ""}>${option.label}</option>
        `), "")}
      </select>
    </label>
  `), ""));
}

export function renderFowCalibrationSettings() {
  if (!els.fowCalibrationFields) return;
  const calibrationUnit = unitPreference("depth") || "ft";
  const lakeCalibrations = state.settings?.bathymetryLakeCalibrationsFeet || {};
  settingsUi.bathymetryLakeCalibrationDisplayDraft = {};
  setHtml(els.fowCalibrationFields, joinHtml(["Erie", "Ontario", "St. Clair", "Huron", "Michigan", "Superior"].map((lake) => html`
    <label class="settings-control">
      <span>${lake} FOW adjustment</span>
      <input data-bathymetry-lake-calibration="${lake}" data-bathymetry-calibration-end="offshoreOffsetFeet" data-settings-draft="bathymetryLakeCalibrationDisplayDraft" data-settings-bind="${lake}.offshoreOffsetFeet" type="number" step="0.1" value="${bathymetryOffsetDisplayValue(lakeCalibrations[lake]?.offshoreOffsetFeet ?? 0, calibrationUnit)}" />
    </label>
  `), ""));
  Object.entries(lakeCalibrations).forEach(([lake, calibration]) => {
    settingsUi.bathymetryLakeCalibrationDisplayDraft[lake] = {
      offshoreOffsetFeet: bathymetryOffsetDisplayValue(calibration?.offshoreOffsetFeet ?? 0, calibrationUnit)
    };
  });
}

export function bathymetryOffsetDisplayValue(offsetFeet, depthUnit = unitPreference("depth")) {
  const offset = Number(offsetFeet);
  if (!Number.isFinite(offset)) return "0";
  const converted = convertUnitValue(offset, "ft", depthUnit || "ft");
  if (converted === null) return "0";
  return trimNumber(Math.round(converted * 100) / 100);
}

export function bathymetryOffsetFeetFromDisplay(value, depthUnit = unitPreference("depth")) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  const converted = convertUnitValue(number, depthUnit || "ft", "ft");
  return converted === null ? 0 : Math.round(converted * 100) / 100;
}

export async function saveUnitSettings(options = {}) {
  const previousUnits = normalizeUnits(state.settings?.units);
  let unitsDraft = settingsUi.unitsDraft;
  if (!unitsDraft) {
    unitsDraft = { ...previousUnits };
    document.querySelectorAll("[data-unit-setting]").forEach((select) => {
      unitsDraft[select.dataset.unitSetting] = select.value;
    });
  }
  const units = unitsFromDraft(unitsDraft, previousUnits);
  const originalCalibrations = state.settings?.bathymetryLakeCalibrationsFeet || {};
  const lakeCalibrations = { ...originalCalibrations };
  let calibrationDisplayDraft = settingsUi.bathymetryLakeCalibrationDisplayDraft;
  if (!calibrationDisplayDraft) {
    calibrationDisplayDraft = {};
    document.querySelectorAll("[data-bathymetry-lake-calibration]").forEach((input) => {
      const lake = input.dataset.bathymetryLakeCalibration;
      const field = input.dataset.bathymetryCalibrationEnd;
      calibrationDisplayDraft[lake] = { ...(calibrationDisplayDraft[lake] || {}), [field]: input.value };
    });
  }
  Object.entries(calibrationDisplayDraft || {}).forEach(([lake, fields]) => {
    Object.entries(fields || {}).forEach(([field, value]) => {
    // The field was rendered in the unit that was active before this save.
    const existing = originalCalibrations[lake] || {};
    const currentDisplayValue = bathymetryOffsetDisplayValue(existing[field] ?? 0, previousUnits.depth);
    if (String(value).trim() === currentDisplayValue) return;
    lakeCalibrations[lake] = {
      ...existing,
      [field]: bathymetryOffsetFeetFromDisplay(value, previousUnits.depth)
    };
    });
  });
  const nextUnits = normalizeUnits(units);
  try {
    await runSettingsSave(
      async () => {
        await updateLogbook((draft) => {
          convertStoredMeasurements(previousUnits, nextUnits, draft);
          draft.settings = {
            ...(draft.settings || {}),
            units: nextUnits,
            bathymetryLakeCalibrationsFeet: lakeCalibrations
          };
        });
        weatherRequestCache.clear();
        marineRequestCache.clear();
        renderAll();
        if (options.rerender !== false && !els.settingsPanel?.classList.contains("hidden")) renderSettings();
        syncUnitLabels();
        const summaryTrip = state.trips.find((trip) => trip.id === ui.activeSummaryTripId);
        if (summaryTrip && els.tripSummaryDialog?.open) openTripSummary(summaryTrip);
      },
      "The unit settings could not be saved.",
      options
    );
  } catch (error) {
    renderAll();
    if (options.rerender !== false && !els.settingsPanel?.classList.contains("hidden")) renderSettings();
  }
}

export function unitLabelText(baseText, key) {
  return `${baseText} (${unitSymbol(key)})`;
}

export function syncUnitLabels(root = document) {
  root.querySelectorAll("[data-unit-label]").forEach((label) => {
    label.textContent = unitLabelText(label.dataset.unitLabelText || label.textContent, label.dataset.unitLabel);
  });
  if (els.waterTemp) els.waterTemp.placeholder = unitPreference("waterTemperature") === "C" ? "8 C" : "47 F";
  if (els.structure) els.structure.placeholder = `40-60 FOW (${unitSymbol("depth")})`;
  if (els.waveHeight) updateMarineWaveHeightPlaceholder(ui.activeTripWeatherData);
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

export async function saveTimeFormatPreference(options = {}) {
  const nextTimeFormat = (settingsUi.preferencesDraft || preferencesDraftFromSettings(state.settings || {})).timeFormat || "24";
  if (els.timeFormatSelect) els.timeFormatSelect.value = nextTimeFormat === "12" ? "12" : "24";
  const timeFormat = nextTimeFormat === "12" ? "12" : "24";
  try {
    await runSettingsSave(
      async () => {
        await updateSettings((settings) => {
          settings.timeFormat = timeFormat;
        });
        renderAll();
        syncUnitLabels();
        if (ui.activeTripWeatherData?.daily) setWeatherStatus(weatherCardConditionsLabel());
        const summaryTrip = state.trips.find((trip) => trip.id === ui.activeSummaryTripId);
        if (summaryTrip && els.tripSummaryDialog?.open) openTripSummary(summaryTrip);
      },
      "The time format could not be saved.",
      options
    );
  } catch (error) {
  }
}
