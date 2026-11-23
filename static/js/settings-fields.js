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

let activeCategoryQuery = "";

export function predefinedFieldItems(group) {
  return group.choice ? optionChoices(group.key) : optionLabels(group.key);
}

export function predefinedFieldValue(item) {
  return typeof item === "object" ? item.label : item;
}

function predefinedFieldGroupMarkup(group, items, { open = false } = {}) {
  const summary = [group.label, ...items.map((item) => predefinedFieldValue(item))].join(" ").toLocaleLowerCase();
  return html`
    <details class="predefined-field-group" name="predefined-field-groups" data-predefined-key="${group.key}" data-settings-draft-root="predefinedFieldsDraft" data-category-search="${summary}" ${open ? "open" : ""}>
      <summary class="predefined-field-summary">
        <span>
          <strong>${group.label}</strong>
          <small>${items.slice(0, 3).map((item) => predefinedFieldValue(item)).join(", ")}${items.length > 3 ? "..." : ""}</small>
        </span>
        <span class="predefined-field-count">${items.length} ${items.length === 1 ? "item" : "items"}</span>
      </summary>
      <div class="predefined-field-body">
        <div class="predefined-option-actions predefined-option-actions--top">
          <button class="button secondary add-predefined-option" type="button">Add</button>
        </div>
        <div class="predefined-option-list">
          ${joinHtml(items.map((item, index) => html`
            <div class="predefined-option-row" data-option-index="${index}">
              <input class="predefined-option-delete-select" type="checkbox" aria-label="Select ${predefinedFieldValue(item)} for deletion" />
              <input class="predefined-option-label" type="text" value="${predefinedFieldValue(item)}" data-settings-bind="${group.key}.${index}.label" aria-label="${group.label} option" />
            </div>
          `), "")}
        </div>
        <div class="predefined-option-actions predefined-option-actions--bottom">
          <button class="button secondary add-predefined-option" type="button">Add</button>
          <div class="predefined-delete-actions">
            <p class="predefined-delete-hint hidden" aria-live="polite"></p>
            <button class="button danger predefined-delete-entries" type="button" aria-label="Delete entries from ${group.label}" ${items.length ? "" : "disabled"}>Delete Entries</button>
            <button class="button secondary predefined-delete-cancel hidden" type="button">Cancel</button>
          </div>
        </div>
      </div>
    </details>
  `;
}

export function renderPredefinedFieldSettings() {
  if (!els.predefinedFieldSettings) return;
  settingsUi.predefinedFieldsDraft = predefinedFieldsDraftFromState(predefinedFieldGroups, stateLikePredefinedFields());
  settingsUi.predefinedFieldsDirty = new Set();
  const draft = settingsUi.predefinedFieldsDraft;
  setHtml(els.predefinedFieldSettings, joinHtml(predefinedFieldGroups.map((group) => (
    predefinedFieldGroupMarkup(group, draft[group.key] || [])
  )), ""));
  filterPredefinedFieldSettings();
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

export function syncPredefinedFieldSummary(group) {
  if (!group) return;
  const label = group.querySelector(".predefined-field-summary strong")?.textContent || "";
  const values = [...group.querySelectorAll(".predefined-option-label")]
    .map((input) => input.value.trim())
    .filter(Boolean);
  const preview = group.querySelector(".predefined-field-summary small");
  if (preview) preview.textContent = `${values.slice(0, 3).join(", ")}${values.length > 3 ? "..." : ""}`;
  group.setAttribute("data-category-search", [label, ...values].join(" ").toLocaleLowerCase());
}

export function filterPredefinedFieldSettings(query = activeCategoryQuery) {
  activeCategoryQuery = String(query).trim().toLocaleLowerCase();
  const groups = [...(els.predefinedFieldSettings?.querySelectorAll(".predefined-field-group") || [])];
  let visibleCount = 0;
  groups.forEach((group) => {
    const matches = !activeCategoryQuery || (group.getAttribute("data-category-search") || "").includes(activeCategoryQuery);
    group.hidden = !matches;
    if (matches) visibleCount += 1;
  });
  const emptyState = document.querySelector("#categorySearchEmpty");
  if (emptyState) emptyState.hidden = !activeCategoryQuery || visibleCount > 0;
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
  removePredefinedOptions(groupKey, [index]);
}

export function removePredefinedOptions(groupKey, indices) {
  if (!settingsUi.predefinedFieldsDraft) settingsUi.predefinedFieldsDraft = predefinedFieldsDraftFromState(predefinedFieldGroups, stateLikePredefinedFields());
  if (!settingsUi.predefinedFieldsDirty) settingsUi.predefinedFieldsDirty = new Set();
  const rows = settingsUi.predefinedFieldsDraft[groupKey];
  if (!Array.isArray(rows)) return;
  const selected = new Set(indices.map(Number).filter((index) => Number.isInteger(index) && index >= 0 && index < rows.length));
  if (!selected.size) return;
  settingsUi.predefinedFieldsDirty.add(groupKey);
  settingsUi.predefinedFieldsDraft[groupKey] = rows.filter((_, index) => !selected.has(index));
  renderPredefinedFieldSettingsFromDraft();
}

export function syncPredefinedDeleteControls(group) {
  if (!group) return;
  const deleteMode = group.classList.contains("is-delete-mode");
  const selectedCount = group.querySelectorAll(".predefined-option-delete-select:checked").length;
  const rowCount = group.querySelectorAll(".predefined-option-row").length;
  group.querySelectorAll(".predefined-option-label").forEach((input) => { input.disabled = deleteMode; });
  group.querySelectorAll(".add-predefined-option").forEach((button) => { button.disabled = deleteMode; });
  const deleteButton = group.querySelector(".predefined-delete-entries");
  if (deleteButton) {
    deleteButton.disabled = deleteMode ? selectedCount === 0 : rowCount === 0;
    deleteButton.setAttribute("aria-label", deleteMode
      ? `Delete selected entries from ${group.querySelector(".predefined-field-summary strong")?.textContent || "category"}`
      : `Select entries to delete from ${group.querySelector(".predefined-field-summary strong")?.textContent || "category"}`);
  }
  group.querySelector(".predefined-delete-cancel")?.classList.toggle("hidden", !deleteMode);
  const hint = group.querySelector(".predefined-delete-hint");
  if (hint) {
    hint.textContent = deleteMode
      ? (selectedCount ? `${selectedCount} selected` : "Select entries to delete")
      : "";
    hint.classList.toggle("hidden", !deleteMode);
  }
}

export function handlePredefinedEntryDeleteClick(group) {
  if (!group) return false;
  if (!group.classList.contains("is-delete-mode")) {
    group.classList.add("is-delete-mode");
    syncPredefinedDeleteControls(group);
    group.querySelector(".predefined-option-delete-select")?.focus();
    return false;
  }

  const selectedRows = [...group.querySelectorAll(".predefined-option-delete-select:checked")];
  if (!selectedRows.length) return false;
  const groupLabel = group.querySelector(".predefined-field-summary strong")?.textContent?.trim() || "category";
  const count = selectedRows.length;
  const entryLabel = count === 1 ? "entry" : "entries";
  if (!window.confirm(`Delete ${count} selected ${groupLabel.toLocaleLowerCase()} ${entryLabel}?`)) return false;

  const indices = selectedRows.map((input) => Number(input.closest(".predefined-option-row")?.dataset.optionIndex));
  removePredefinedOptions(group.dataset.predefinedKey || "", indices);
  return true;
}

export function cancelPredefinedEntryDeletion(group) {
  if (!group) return;
  group.classList.remove("is-delete-mode");
  group.querySelectorAll(".predefined-option-delete-select").forEach((input) => { input.checked = false; });
  syncPredefinedDeleteControls(group);
}

function renderPredefinedFieldSettingsFromDraft() {
  const draft = settingsUi.predefinedFieldsDraft;
  settingsUi.predefinedFieldsDraft = draft;
  if (!els.predefinedFieldSettings || !draft) return;
  const openGroups = new Set([...els.predefinedFieldSettings.querySelectorAll(".predefined-field-group[open]")]
    .map((group) => group.dataset.predefinedKey));
  setHtml(els.predefinedFieldSettings, joinHtml(predefinedFieldGroups.map((group) => (
    predefinedFieldGroupMarkup(group, draft[group.key] || [], { open: openGroups.has(group.key) })
  )), ""));
  filterPredefinedFieldSettings();
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
