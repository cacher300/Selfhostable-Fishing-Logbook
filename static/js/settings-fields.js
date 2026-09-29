import { optionChoices, optionLabels, slugOptionValue } from "./app-normalization.js";
import { currentChopRanges, validateChopRanges } from "./app-units.js";
import { replacePredefinedFields, updateSettings } from "./actions.js";
import { els } from "./app-elements.js";
import { runSettingsSave, settingsAutosaveTimer, settingsUi } from "./settings-core.js";
import { renderSettings } from "./settings.js";
import { renderAll, renderTrips } from "./dashboard.js";
import { escapeHtml, trimNumber } from "./form-utils.js";

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

export function updatePredefinedFieldCount(group) {
  if (!group) return;
  const count = group.querySelectorAll(".predefined-option-row").length;
  const label = group.querySelector(".predefined-field-count");
  if (label) label.textContent = `${count} ${count === 1 ? "item" : "items"}`;
}

export function collectPredefinedFieldSettings() {
  const next = {};
  els.predefinedFieldSettings?.querySelectorAll(".predefined-field-group").forEach((section) => {
    const group = predefinedFieldGroups.find((item) => item.key === section.dataset.predefinedKey);
    if (!group) return;
    const current = predefinedFieldItems(group);
    const rows = [...section.querySelectorAll(".predefined-option-row")];
    if (group.choice) {
      next[group.key] = rows.map((row) => {
        const index = Number(row.dataset.optionIndex);
        const existing = current[index];
        const label = row.querySelector(".predefined-option-label")?.value.trim() || "";
        return {
          ...existing,
          value: existing?.value || slugOptionValue(label),
          label
        };
      });
    } else {
      next[group.key] = rows.map((row) => row.querySelector(".predefined-option-label")?.value ?? "");
    }
  });
  return next;
}

export async function savePredefinedFieldSettings(options = {}) {
  const fields = collectPredefinedFieldSettings();
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

export function renderChopRangeSettings() {
  if (!els.chopRangeRows) return;
  const ranges = currentChopRanges();
  if (els.editChopRangesButton) {
    els.editChopRangesButton.textContent = settingsUi.chopRangesEditing ? "Done Editing" : "Edit Chop Ranges";
  }
  els.cancelChopRangesButton?.classList.toggle("hidden", !settingsUi.chopRangesEditing);
  if (!settingsUi.chopRangesEditing) {
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

export async function toggleChopRangeEditing() {
  if (settingsUi.chopRangesEditing) {
    await saveChopRanges();
    settingsUi.chopRangesEditing = false;
    settingsUi.chopRangesEditSnapshot = null;
    renderChopRangeSettings();
    return;
  }
  settingsUi.chopRangesEditSnapshot = currentChopRanges();
  settingsUi.chopRangesEditing = true;
  renderChopRangeSettings();
}

export async function cancelChopRangeEditing() {
  clearTimeout(settingsAutosaveTimer);
  settingsUi.chopRangesEditing = false;
  settingsUi.chopRangesEditSnapshot = null;
  renderChopRangeSettings();
}

export async function saveChopRanges(options = {}) {
  const current = currentChopRanges();
  const ranges = [...document.querySelectorAll(".chop-range-row")].map((row, index) => {
    const maxInput = row.querySelector(".chop-range-max");
    return {
      ...current[index],
      id: current[index]?.id || `chop-${index + 1}`,
      label: row.querySelector(".chop-range-label")?.value ?? "",
      maxFeet: maxInput ? Number(maxInput.value) : null
    };
  });
  try {
    validateChopRanges(ranges);
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
