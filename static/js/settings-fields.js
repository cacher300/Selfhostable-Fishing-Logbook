import { html, joinHtml, setHtml } from "./html.js";
import { state } from "./app-state.js";
import { optionChoices, optionLabels } from "./app-normalization.js";
import { currentChopRanges } from "./app-units.js";
import { replacePredefinedFields, updateSettings } from "./actions.js";
import { els } from "./app-elements.js";
import { runSettingsSave, cancelSettingsAutosave, settingsUi } from "./settings-core.js";
import { renderSettings } from "./settings.js";
import { renderAll, renderTrips } from "./dashboard.js";
import { trimNumber } from "./form-utils.js";
import { chopRangesDraftFromState, chopRangesFromDraft, predefinedFieldsDraftFromState, predefinedFieldsFromDraft } from "./settings-draft.js";


export const predefinedFieldGroups = [
  { key: "species", label: "Species" },
  { key: "methods", label: "Methods" },
  { key: "riggings", label: "Rigging options" },
  { key: "waterClarities", label: "Water clarity" },
  { key: "structureOptions", label: "Structure" },
  { key: "weatherTypes", label: "Weather" },
  { key: "lureTypes", label: "Lure types" },
  { key: "flasherTypes", label: "Flasher types" },
  { key: "reelStyles", label: "Reel categories" },
  { key: "rodTypes", label: "Rod categories" },
  { key: "lineTypes", label: "Line types" },
  { key: "flyCategories", label: "Fly categories" },
  { key: "flyPresentations", label: "Fly presentations" },
  { key: "waterLevels", label: "Water levels" },
  { key: "lureBladeTypes", label: "Lure blade types" },
  { key: "lureSpoonSizes", label: "Lure spoon sizes" },
  { key: "lureBeadSizes", label: "Lure bead sizes" },
  { key: "meatRigTypes", label: "Meat rig types" },
  { key: "softPlasticTypes", label: "Soft plastic styles" },
  { key: "trollingPresentations", label: "Trolling methods", choice: true },
  { key: "trollingDirections", label: "Trolling directions" },
  { key: "setupLineSides", label: "Setup line sides", choice: true }
];

export function predefinedFieldItems(group) {
  return group.choice ? optionChoices(group.key) : optionLabels(group.key);
}

export function predefinedFieldValue(item) {
  return typeof item === "object" ? item.label : item;
}

export function renderPredefinedFieldSettings() {
  if (!els.predefinedFieldSettings) return;
  settingsUi.predefinedFieldsDraft = predefinedFieldsDraftFromState(predefinedFieldGroups, stateLikePredefinedFields());
  settingsUi.predefinedFieldsDirty = new Set();
  const draft = settingsUi.predefinedFieldsDraft;
  setHtml(els.predefinedFieldSettings, joinHtml(predefinedFieldGroups.map((group) => {
    const items = draft[group.key] || [];
    return html`
      <details class="predefined-field-group" data-predefined-key="${group.key}" data-settings-draft-root="predefinedFieldsDraft">
        <summary class="predefined-field-summary">
          <span>
            <strong>${group.label}</strong>
            <small>${items.slice(0, 3).map((item) => predefinedFieldValue(item)).join(", ")}${items.length > 3 ? "..." : ""}</small>
          </span>
          <span class="predefined-field-count">${items.length} ${items.length === 1 ? "item" : "items"}</span>
        </summary>
        <div class="predefined-field-body">
          <div class="predefined-option-list">
            ${joinHtml(items.map((item, index) => html`
              <div class="predefined-option-row" data-option-index="${index}">
                <input class="predefined-option-label" type="text" value="${predefinedFieldValue(item)}" data-settings-bind="${group.key}.${index}.label" aria-label="${group.label} option" />
                <button class="button danger remove-predefined-option" type="button">Delete</button>
              </div>
            `), "")}
            </div>
          <div class="predefined-field-header">
            <button class="button secondary add-predefined-option" type="button">Add</button>
          </div>
        </div>
      </details>
    `;
  }), ""));
}

function stateLikePredefinedFields() {
  return Object.fromEntries(predefinedFieldGroups.map((group) => [group.key, predefinedFieldItems(group)]));
}

export function updatePredefinedFieldCount(group) {
  if (!group) return;
  const count = group.querySelectorAll(".predefined-option-row").length;
  const label = group.querySelector(".predefined-field-count");
  if (label) label.textContent = `${count} ${count === 1 ? "item" : "items"}`;
}

export async function savePredefinedFieldSettings(options = {}) {
  const fields = predefinedFieldsFromDraft(
    predefinedFieldGroups,
    settingsUi.predefinedFieldsDraft || predefinedFieldsDraftFromState(predefinedFieldGroups, stateLikePredefinedFields())
  );
  predefinedFieldGroups.forEach((group) => {
    if (settingsUi.predefinedFieldsDirty?.size && !settingsUi.predefinedFieldsDirty.has(group.key)) {
      delete fields[group.key];
      return;
    }
    if (Object.prototype.hasOwnProperty.call(state, group.key)) return;
    const source = { [group.key]: predefinedFieldItems(group) };
    const draftSource = predefinedFieldsDraftFromState([group], source);
    const untouched = JSON.stringify(settingsUi.predefinedFieldsDraft?.[group.key] || []) === JSON.stringify(draftSource[group.key] || []);
    if (untouched) delete fields[group.key];
  });
  try {
    await runSettingsSave(
      async () => {
        await replacePredefinedFields(fields);
        renderAll();
        if (options.rerender !== false) renderSettings();
      },
      "The predefined fields could not be saved.",
      options
    );
  } catch (error) {
  }
}

export function addPredefinedOption(groupKey) {
  const group = predefinedFieldGroups.find((item) => item.key === groupKey);
  if (!group) return;
  if (!settingsUi.predefinedFieldsDraft) settingsUi.predefinedFieldsDraft = predefinedFieldsDraftFromState(predefinedFieldGroups, stateLikePredefinedFields());
  if (!settingsUi.predefinedFieldsDirty) settingsUi.predefinedFieldsDirty = new Set();
  settingsUi.predefinedFieldsDirty.add(group.key);
  if (!Array.isArray(settingsUi.predefinedFieldsDraft[group.key])) settingsUi.predefinedFieldsDraft[group.key] = [];
  settingsUi.predefinedFieldsDraft[group.key].push(group.choice ? { value: "", label: "" } : { label: "" });
  renderPredefinedFieldSettingsFromDraft();
}

export function removePredefinedOption(groupKey, index) {
  if (!settingsUi.predefinedFieldsDraft) settingsUi.predefinedFieldsDraft = predefinedFieldsDraftFromState(predefinedFieldGroups, stateLikePredefinedFields());
  if (!settingsUi.predefinedFieldsDirty) settingsUi.predefinedFieldsDirty = new Set();
  settingsUi.predefinedFieldsDirty.add(groupKey);
  const rows = settingsUi.predefinedFieldsDraft[groupKey];
  if (Array.isArray(rows)) rows.splice(index, 1);
  renderPredefinedFieldSettingsFromDraft();
}

function renderPredefinedFieldSettingsFromDraft() {
  const draft = settingsUi.predefinedFieldsDraft;
  settingsUi.predefinedFieldsDraft = draft;
  if (!els.predefinedFieldSettings || !draft) return;
  setHtml(els.predefinedFieldSettings, joinHtml(predefinedFieldGroups.map((group) => {
    const items = draft[group.key] || [];
    return html`
      <details class="predefined-field-group" data-predefined-key="${group.key}" data-settings-draft-root="predefinedFieldsDraft" open>
        <summary class="predefined-field-summary">
          <span><strong>${group.label}</strong><small>${items.slice(0, 3).map((item) => predefinedFieldValue(item)).join(", ")}${items.length > 3 ? "..." : ""}</small></span>
          <span class="predefined-field-count">${items.length} ${items.length === 1 ? "item" : "items"}</span>
        </summary>
        <div class="predefined-field-body">
          <div class="predefined-option-list">
            ${joinHtml(items.map((item, index) => html`
              <div class="predefined-option-row" data-option-index="${index}">
                <input class="predefined-option-label" type="text" value="${predefinedFieldValue(item)}" data-settings-bind="${group.key}.${index}.label" aria-label="${group.label} option" />
                <button class="button danger remove-predefined-option" type="button">Delete</button>
              </div>
            `), "")}
          </div>
          <div class="predefined-field-header"><button class="button secondary add-predefined-option" type="button">Add</button></div>
        </div>
      </details>
    `;
  }), ""));
}

export function renderChopRangeSettings() {
  if (!els.chopRangeRows) return;
  if (!settingsUi.chopRangesDraft) settingsUi.chopRangesDraft = chopRangesDraftFromState(currentChopRanges());
  const ranges = settingsUi.chopRangesEditing ? settingsUi.chopRangesDraft : currentChopRanges();
  if (els.editChopRangesButton) {
    els.editChopRangesButton.textContent = settingsUi.chopRangesEditing ? "Done Editing" : "Edit Chop Ranges";
  }
  els.cancelChopRangesButton?.classList.toggle("hidden", !settingsUi.chopRangesEditing);
  if (!settingsUi.chopRangesEditing) {
    const lastBoundedRange = [...ranges].reverse().find((range) => range.maxFeet !== null);
    const overflowText = lastBoundedRange ? `> ${trimNumber(lastBoundedRange.maxFeet)} ft` : "Above previous range";
    setHtml(els.chopRangeRows, html`
      <div class="chop-range-list">
        ${joinHtml(ranges.map((range) => html`
          <div class="chop-range-display-row">
            <strong>${range.label}</strong>
            <span>${range.maxFeet === null ? overflowText : `&le; ${trimNumber(range.maxFeet)} ft`}</span>
          </div>
        `), "")}
      </div>
    `);
    return;
  }
  setHtml(els.chopRangeRows, html`
    <table data-settings-draft-root="chopRangesDraft">
      <thead>
        <tr>
          <th>Condition</th>
          <th>Max wave height</th>
        </tr>
      </thead>
      <tbody>
        ${joinHtml(ranges.map((range, index) => html`
          <tr class="chop-range-row" data-range-index="${index}">
            <td>
              <input class="chop-range-label" type="text" value="${range.label}" data-settings-bind="${index}.label" aria-label="Chop condition label" />
            </td>
            <td>
              ${range.maxFeet === null
                ? html`<span class="range-overflow-label">Above previous range</span>`
                : html`<div class="unit-input"><input class="chop-range-max" type="number" min="0" step="0.1" value="${range.maxFeet}" data-settings-bind="${index}.maxFeet" aria-label="Maximum wave height in feet" /><span>ft</span></div>`}
            </td>
          </tr>
        `), "")}
      </tbody>
    </table>
  `);
}

export async function toggleChopRangeEditing() {
  if (settingsUi.chopRangesEditing) {
    await saveChopRanges();
    settingsUi.chopRangesEditing = false;
    settingsUi.chopRangesEditSnapshot = null;
    renderChopRangeSettings();
    return;
  }
  settingsUi.chopRangesEditSnapshot = currentChopRanges();
  settingsUi.chopRangesDraft = chopRangesDraftFromState(settingsUi.chopRangesEditSnapshot);
  settingsUi.chopRangesEditing = true;
  renderChopRangeSettings();
}

export async function cancelChopRangeEditing() {
  cancelSettingsAutosave();
  settingsUi.chopRangesEditing = false;
  settingsUi.chopRangesDraft = chopRangesDraftFromState(settingsUi.chopRangesEditSnapshot || currentChopRanges());
  settingsUi.chopRangesEditSnapshot = null;
  renderChopRangeSettings();
}

export async function saveChopRanges(options = {}) {
  const current = currentChopRanges();
  let ranges;
  try {
    ranges = chopRangesFromDraft(settingsUi.chopRangesDraft || chopRangesDraftFromState(current), current);
  } catch (error) {
    alert(error.message || "Check the chop ranges before saving.");
    return;
  }
  try {
    await runSettingsSave(
      async () => {
        await updateSettings((settings) => {
          settings.chopRanges = ranges;
        });
        if (options.rerender !== false) {
          settingsUi.chopRangesEditing = false;
          settingsUi.chopRangesDraft = chopRangesDraftFromState(ranges);
          settingsUi.chopRangesEditSnapshot = null;
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
