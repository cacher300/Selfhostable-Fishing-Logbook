import { html, insertHtml, joinHtml, setHtml } from "./html.js";
import { returnToTripDialog, state } from "./app-state.js";
import { els } from "./app-elements.js";
import { mediaMarkup, previewImage } from "./app-media.js";
import { comboName, gearDisplayName, gearPhotos } from "./gear-core.js";
import { isFlyFishingTrip } from "./form-utils.js";


export function isSoftPlasticLureRow(row) {
  const lureId = row?.querySelector(".catch-lure, .trip-gear-lure")?.value || "";
  const lure = state.lures.find((item) => String(item.id) === String(lureId));
  return String(lure?.type || "").trim().toLowerCase() === "soft plastic";
}

export function updateRiggingVisibility(row) {
  if (!row) return;
  const isSoftPlastic = isSoftPlasticLureRow(row);
  row.classList.toggle("has-soft-plastic-rigging", isSoftPlastic);
  row.querySelectorAll(".catch-rigging, .catch-rigging-details, .trip-gear-rigging, .trip-gear-rigging-details")
    .forEach((control) => {
      const field = control.closest("label");
      field?.classList.toggle("hidden", !isSoftPlastic);
      field?.toggleAttribute("hidden", !isSoftPlastic);
      if (!isSoftPlastic) control.value = "";
    });
}

export function renderLurePreview(row) {
  updateRiggingVisibility(row);
  const preview = row.querySelector(".lure-preview");
  const lureId = row.querySelector(".catch-lure, .trip-gear-lure")?.value;
  const lure = state.lures.find((item) => item.id === lureId);
  if (!preview || !lure) {
    if (preview) setHtml(preview, html``);
    return;
  }
  const image = gearPhotos(lure).length ? mediaMarkup(gearPhotos(lure)[0], "", { download: false }) : "";
  const details = [lure.type, lure.brand, lure.color].filter(Boolean).join(" / ");
  setHtml(preview, html`
    <button class="lure-preview-card" type="button" data-preview-lure-id="${lure.id}" aria-label="Open preview for ${lure.name || "lure"}">
      ${image}
      <div>
        <strong>${lure.name}</strong>
        <span>${details || "Saved lure"}</span>
      </div>
    </button>
  `);
}

export function renderFlasherPreview(row) {
  const preview = row.querySelector(".flasher-preview");
  const flasherId = row.querySelector(".catch-flasher, .trip-gear-flasher")?.value;
  const flasher = state.flashers.find((item) => item.id === flasherId);
  if (!preview || !flasher) {
    if (preview) setHtml(preview, html``);
    return;
  }
  const image = gearPhotos(flasher).length ? mediaMarkup(gearPhotos(flasher)[0], "", { download: false }) : "";
  const details = [flasher.type, flasher.brand, flasher.color].filter(Boolean).join(" / ");
  setHtml(preview, html`
    <button class="flasher-preview-card" type="button" data-preview-flasher-id="${flasher.id}" aria-label="Open preview for ${flasher.name || "flasher"}">
      ${image}
      <div>
        <strong>${flasher.name}</strong>
        <span>${details || "Saved flasher"}</span>
      </div>
    </button>
  `);
}

export function prepareInlineGearDialog(type, pendingRowId = "") {
  returnToTripDialog[type] = Boolean(pendingRowId) && els.tripDialog.open;
}

export function restoreTripDialogAfterInlineGear(type) {
  if (!returnToTripDialog[type]) return;
  returnToTripDialog[type] = false;
}

export function populateGearSelect(select, items, selectedId, placeholder, labelFn) {
  if (!select) return;
  setHtml(select, html`<option value="">${placeholder}</option>${joinHtml(items.map((item) => (
    html`<option value="${item.id}" ${item.id === selectedId ? "selected" : ""}>${labelFn(item)}</option>`
  )), "")}`);
}

export function populateRodSelect(select, selectedId = "") {
  populateGearSelect(select, state.rods, selectedId, "No rod selected", (rod) => gearDisplayName(rod, "Rod"));
}

export function populateReelSelect(select, selectedId = "") {
  populateGearSelect(select, state.reels, selectedId, "No reel selected", (reel) => reel.shortName || gearDisplayName(reel, "Reel"));
}

export function populateComboSelect(select, selectedId = "") {
  populateGearSelect(select, state.rodReelCombos, selectedId, "No combo selected", (combo) => comboName(combo.id) || "Combo");
}

export function isFlyLure(lure) {
  return String(lure?.type || "").trim().toLowerCase() === "fly";
}

export function lurePickerScope(select) {
  return select?.closest("#tripDialog") && isFlyFishingTrip() ? "flies" : "standard";
}

export function luresForPicker(select) {
  return lurePickerScope(select) === "flies"
    ? state.lures.filter(isFlyLure)
    : state.lures.filter((lure) => !isFlyLure(lure));
}

export function savedLureTypes(select) {
  return [...new Set(luresForPicker(select).map((lure) => String(lure.type || "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

export function preferredLurePickerType(select) {
  if (!select?.matches(".trip-gear-cheater-lure")) return "";
  return savedLureTypes().find((type) => type.toLowerCase() === "spoon") || "";
}

export function lureTypeOptionValue(type) {
  return `__type__:${type}`;
}

export function lureOptionsForType(type, select) {
  return luresForPicker(select).filter((lure) => String(lure.type || "").trim() === type);
}

export function gearPickerItems(type, select) {
  return type === "lure" ? luresForPicker(select) : state.flashers;
}

export function gearPickerLabel(item, fallback) {
  return [item?.name || fallback, item?.color].filter(Boolean).join(" - ");
}

export function gearPickerMedia(item, type) {
  const source = previewImage(item);
  if (!source) {
    if (type === "lure") return "";
    return html`<span class="gear-picker-photo-placeholder" aria-hidden="true">F</span>`;
  }
  return html`<img src="${source}" alt="" />`;
}

export function closeGearPickers(except = null) {
  document.querySelectorAll(".gear-media-picker.is-open").forEach((picker) => {
    if (picker === except) return;
    picker.classList.remove("is-open");
    picker.querySelector(".gear-picker-trigger")?.setAttribute("aria-expanded", "false");
    picker.querySelector(".gear-picker-menu")?.classList.add("hidden");
  });
}

export function gearPickerOptionMarkup(item, type, selected) {
  const media = gearPickerMedia(item, type);
  return html`
    <button
      class="gear-picker-option ${media ? "" : "gear-picker-option-no-media"} ${item.id === selected?.id ? "is-selected" : ""}"
      type="button"
      role="option"
      aria-selected="${String(item.id === selected?.id)}"
      data-gear-picker-option="${item.id}"
    >
      ${media}
      <span>
        <strong>${gearPickerLabel(item, type === "lure" ? "Lure" : "Flasher")}</strong>
        <small>${[item.type, item.brand].filter(Boolean).join(" / ") || "Saved gear"}</small>
      </span>
      <span class="gear-picker-check" aria-hidden="true">✓</span>
    </button>
  `;
}

export function lureTypePickerMarkup(selected, select) {
  return html`
    <button class="gear-picker-option gear-picker-option-empty ${selected ? "" : "is-selected"}" type="button" role="option" aria-selected="${String(!selected)}" data-gear-picker-option="">
      <span><strong>Clear selection</strong></span>
    </button>
    ${joinHtml(savedLureTypes(select).map((lureType) => {
      const lures = lureOptionsForType(lureType, select);
      return html`
        <button class="gear-picker-option gear-picker-type-option" type="button" role="option" aria-selected="false" data-gear-picker-type="${lureType}">
          <span><strong>${lureType}</strong><small>${lures.length} saved lure${lures.length === 1 ? "" : "s"}</small></span>
          <span class="gear-picker-type-arrow" aria-hidden="true">›</span>
        </button>
      `;
    }), "")}
  `;
}

export function renderGearPicker(select, type) {
  const picker = select?.closest(".gear-media-picker");
  if (!picker) return;
  const items = gearPickerItems(type, select);
  const selected = items.find((item) => item.id === select.value);
  const placeholder = type === "lure" ? "Select lure" : "No flasher";
  const trigger = picker.querySelector(".gear-picker-trigger");
  const menu = picker.querySelector(".gear-picker-options");
  const count = picker.querySelector(".gear-picker-count");
  const empty = picker.querySelector(".gear-picker-empty");
  const pickerMedia = gearPickerMedia(selected, type);
  empty?.classList.add("hidden");
  if (trigger) {
    setHtml(trigger, html`
      ${pickerMedia ? html`<span class="gear-picker-trigger-media">${pickerMedia}</span>` : ""}
      <span class="gear-picker-trigger-copy">
        <strong>${selected ? gearPickerLabel(selected, placeholder) : placeholder}</strong>
        ${selected ? html`<small>${[selected.type, selected.brand].filter(Boolean).join(" / ") || "Saved gear"}</small>` : ""}
      </span>
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
    `);
  }
  if (!menu) return;
  const query = picker.dataset.gearPickerQuery || "";
  const view = picker.dataset.gearPickerView || (type === "lure" ? "types" : "items");
  const activeType = picker.dataset.gearPickerActiveType || "";
  const filteredItems = items.filter((item) => {
    if (query) return [item.name, item.color, item.type, item.brand].filter(Boolean).join(" ").toLowerCase().includes(query);
    if (type === "lure" && view === "lures") return String(item.type || "").trim() === activeType;
    return true;
  });
  if (count) count.textContent = query
    ? `${filteredItems.length} found`
    : type === "lure" && view === "types"
      ? `${savedLureTypes(select).length} categories`
      : `${filteredItems.length} saved`;
  if (type === "lure" && view === "types" && !query) {
    setHtml(menu, lureTypePickerMarkup(selected, select));
    empty?.classList.toggle("hidden", savedLureTypes(select).length > 0);
    return;
  }
  setHtml(menu, html`
    ${type === "lure" && view === "lures" && !query ? html`
      <button class="gear-picker-back" type="button" data-gear-picker-back>‹ All lure categories</button>
      <div class="gear-picker-type-heading">${activeType}</div>
    ` : ""}
    ${type === "flasher" || type === "lure" ? html`
      <button class="gear-picker-option gear-picker-option-empty ${selected ? "" : "is-selected"}" type="button" role="option" aria-selected="${String(!selected)}" data-gear-picker-option="">
        <span><strong>Clear selection</strong></span>
      </button>
    ` : ""}
    ${joinHtml(filteredItems.map((item) => gearPickerOptionMarkup(item, type, selected)))}
  `);
  empty?.classList.toggle("hidden", filteredItems.length > 0);
}

export function enhanceGearSelect(select, type) {
  if (!select) return;
  let picker = select.closest(".gear-media-picker");
  if (!picker) {
    picker = document.createElement("div");
    picker.className = "gear-media-picker";
    picker.dataset.gearPicker = type;
    picker.dataset.gearPickerView = "items";
    select.parentNode.insertBefore(picker, select);
    picker.append(select);
    select.classList.add("gear-picker-native");
    select.tabIndex = -1;
    select.setAttribute("aria-hidden", "true");
    insertHtml(picker, "beforeend", html`
      <button class="gear-picker-trigger" type="button" aria-haspopup="listbox" aria-expanded="false"></button>
      <div class="gear-picker-menu hidden">
        <div class="gear-picker-search-row">
          <input class="gear-picker-search" type="search" placeholder="Search saved ${type}s…" aria-label="Search saved ${type}s" />
          <span class="gear-picker-count"></span>
        </div>
        <div class="gear-picker-options" role="listbox" aria-label="Saved ${type}s"></div>
        <p class="gear-picker-empty hidden">No matching ${type}s.</p>
      </div>
    `);
  }
  renderGearPicker(select, type);
}

export function renderLureTypeOptions(select) {
  select.dataset.lurePickerMode = "types";
  select.dataset.lurePickerType = "";
  setHtml(select, html`<option value="">Select lure</option>${joinHtml(savedLureTypes(select).map((type) => (
    html`<option value="${lureTypeOptionValue(type)}">${type}</option>`
  )), "")}`);
  enhanceGearSelect(select, "lure");
}

export function populateLureSelect(select, selectedId = "") {
  select.dataset.lurePickerMode = "items";
  select.dataset.lurePickerType = "";
  const picker = select.closest(".gear-media-picker");
  if (picker) {
    picker.dataset.gearPickerView = "items";
    picker.dataset.gearPickerActiveType = "";
  }
  setHtml(select, html`<option value="">Select lure</option>${joinHtml(luresForPicker(select).map((lure) => {
    const label = [lure.name, lure.color].filter(Boolean).join(" - ");
    return html`<option value="${lure.id}" ${lure.id === selectedId ? "selected" : ""}>${label}</option>`;
  }), "")}`);
  enhanceGearSelect(select, "lure");
}

export function populateLuresForType(select, type, selectedId = "") {
  select.dataset.lurePickerMode = "lures";
  select.dataset.lurePickerType = type;
  const lures = lureOptionsForType(type, select);
  setHtml(select, html`<option value="">Select lure</option>${joinHtml(lures.map((lure) => {
    const label = [lure.name, lure.color].filter(Boolean).join(" - ");
    return html`<option value="${lure.id}" ${lure.id === selectedId ? "selected" : ""}>${label}</option>`;
  }), "")}`);
  enhanceGearSelect(select, "lure");
}

export function reopenLurePicker(select) {
  select.focus();
  try {
    select.showPicker?.();
  } catch (_error) {
    // Some browsers do not allow programmatic reopening of native selects.
  }
}

export function populateFlasherSelect(select, selectedId = "") {
  setHtml(select, html`<option value="">No flasher</option>${joinHtml(state.flashers.map((flasher) => {
    const label = [flasher.name, flasher.color].filter(Boolean).join(" - ");
    return html`<option value="${flasher.id}" ${flasher.id === selectedId ? "selected" : ""}>${label}</option>`;
  }), "")}`);
  enhanceGearSelect(select, "flasher");
}

export function syncComboToRow(row) {
  const combo = state.rodReelCombos.find((item) => item.id === row.querySelector(".trip-gear-combo")?.value);
  if (!combo) return;
  const rodSelect = row.querySelector(".trip-gear-rod");
  const reelSelect = row.querySelector(".trip-gear-reel");
  if (rodSelect && combo.rodId) rodSelect.value = combo.rodId;
  if (reelSelect && combo.reelId) reelSelect.value = combo.reelId;
}

export function setup() {
  document.addEventListener("click", (event) => {
    const trigger = event.target.closest(".gear-picker-trigger");
    if (trigger) {
      event.preventDefault();
      const picker = trigger.closest(".gear-media-picker");
      const opening = !picker.classList.contains("is-open");
      closeGearPickers(opening ? picker : null);
      picker.classList.toggle("is-open", opening);
      trigger.setAttribute("aria-expanded", String(opening));
      picker.querySelector(".gear-picker-menu")?.classList.toggle("hidden", !opening);
      if (opening) {
        const search = picker.querySelector(".gear-picker-search");
        const preferredType = preferredLurePickerType(picker.querySelector("select"));
        search.value = "";
        picker.dataset.gearPickerQuery = "";
        picker.dataset.gearPickerView = preferredType ? "lures" : picker.dataset.gearPicker === "lure" ? "types" : "items";
        picker.dataset.gearPickerActiveType = preferredType;
        renderGearPicker(picker.querySelector("select"), picker.dataset.gearPicker);
        requestAnimationFrame(() => search.focus());
      }
      return;
    }
  
    const lureTypeOption = event.target.closest("[data-gear-picker-type]");
    if (lureTypeOption) {
      event.preventDefault();
      const picker = lureTypeOption.closest(".gear-media-picker");
      picker.dataset.gearPickerView = "lures";
      picker.dataset.gearPickerActiveType = lureTypeOption.dataset.gearPickerType;
      renderGearPicker(picker.querySelector("select"), "lure");
      return;
    }
  
    const backButton = event.target.closest("[data-gear-picker-back]");
    if (backButton) {
      event.preventDefault();
      const picker = backButton.closest(".gear-media-picker");
      picker.dataset.gearPickerView = "types";
      picker.dataset.gearPickerActiveType = "";
      renderGearPicker(picker.querySelector("select"), "lure");
      return;
    }
  
    const option = event.target.closest("[data-gear-picker-option]");
    if (option) {
      event.preventDefault();
      const picker = option.closest(".gear-media-picker");
      const select = picker.querySelector("select");
      const type = picker.dataset.gearPicker;
      const selectedId = option.dataset.gearPickerOption;
      select.value = selectedId;
      renderGearPicker(select, type);
      closeGearPickers();
      select.dispatchEvent(new Event("change", { bubbles: true }));
      picker.querySelector(".gear-picker-trigger")?.focus();
      return;
    }
  
    if (!event.target.closest(".gear-media-picker")) closeGearPickers();
  });

  document.addEventListener("input", (event) => {
    if (!event.target.matches(".gear-picker-search")) return;
    const picker = event.target.closest(".gear-media-picker");
    const query = event.target.value.trim().toLowerCase();
    picker.dataset.gearPickerQuery = query;
    picker.dataset.gearPickerView = query ? "search" : (picker.dataset.gearPicker === "lure" ? "types" : "items");
    if (!query) picker.dataset.gearPickerActiveType = "";
    renderGearPicker(picker.querySelector("select"), picker.dataset.gearPicker);
  });

  document.addEventListener("keydown", (event) => {
    const picker = event.target.closest?.(".gear-media-picker");
    if (!picker) return;
    if (event.key === "Escape" && picker.classList.contains("is-open")) {
      closeGearPickers();
      picker.querySelector(".gear-picker-trigger")?.focus();
    }
  });
}
