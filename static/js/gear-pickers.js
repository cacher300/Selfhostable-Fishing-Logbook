import { refreshBeadRigEditor } from "./bead-rig-editor.js";
import { html, insertHtml, joinHtml, setHtml } from "./html.js";
import { returnToTripDialog, state } from "./app-state.js";
import { els } from "./app-elements.js";
import { mediaMarkup, previewImage } from "./app-media.js";
import { comboName, gearDisplayName, gearPhotos } from "./gear-core.js";
import { rodTypeMatchesMethod } from "./rod-method.js";
import { openLurePicker } from "./lure-picker.js";
import { isFlyFishingTrip } from "./form-utils.js";

const RIGGING_DETAILS_LABELS = new Map([
  ["jighead", "Jighead weight"],
  ["texas", "Bullet weight"],
  ["carolina", "Carolina sinker weight"],
  ["neko", "Nail weight"],
  ["drop shot", "Drop-shot weight"],
  ["jika", "Jika weight"],
  ["ned", "Jighead weight"],
  ["wacky", "Wacky weight"]
]);

export function isSoftPlasticLureRow(row) {
  const lureId = row?.querySelector(".catch-lure, .trip-gear-lure")?.value || "";
  const lure = state.lures.find((item) => String(item.id) === String(lureId));
  return String(lure?.type || "").trim().toLowerCase() === "soft plastic";
}

export function updateRiggingVisibility(row) {
  if (!row) return;
  const isSoftPlastic = isSoftPlasticLureRow(row);
  const isTrolling = row.closest("#tripDialog")?.classList.contains("is-trolling") || false;
  const showRigging = isSoftPlastic && !isTrolling;
  row.classList.toggle("has-soft-plastic-rigging", isSoftPlastic);
  row.querySelectorAll(".catch-rigging, .catch-rigging-details, .trip-gear-rigging, .trip-gear-rigging-details")
    .forEach((control) => {
      const field = control.closest("label");
      field?.classList.toggle("hidden", !showRigging);
      field?.toggleAttribute("hidden", !showRigging);
      if (!isSoftPlastic) control.value = "";
    });
  const riggingControl = row.querySelector(".catch-rigging-control, .gear-rigging-control");
  riggingControl?.classList.toggle("hidden", !showRigging);
  riggingControl?.toggleAttribute("hidden", !showRigging);
  const rigging = row.querySelector(".catch-rigging, .trip-gear-rigging")?.value.trim().toLowerCase().replace(/[\s-]+/g, " ") || "";
  const detailsLabel = row.querySelector(".catch-rigging-details-field > span, .gear-rigging-details-field > span");
  if (detailsLabel) detailsLabel.textContent = RIGGING_DETAILS_LABELS.get(rigging) || "Rig details";
}

export function renderLurePreview(row) {
  updateRiggingVisibility(row);
  refreshBeadRigEditor(row);
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

export function gearSelectOptions(items, selectedId, labelFn, isAvailable = () => true) {
  return joinHtml(items.flatMap((item) => {
    const available = isAvailable(item);
    const selected = item.id === selectedId;
    if (!available && !selected) return [];
    return [html`<option value="${item.id}" ${selected ? "selected" : ""} ${available ? "" : "disabled"}>${labelFn(item)}</option>`];
  }), "");
}

export function populateGearSelect(select, items, selectedId, placeholder, labelFn, isAvailable) {
  if (!select) return;
  setHtml(select, html`<option value="">${placeholder}</option>${gearSelectOptions(items, selectedId, labelFn, isAvailable)}`);
}

export function populateRodSelect(select, selectedId = "") {
  populateGearSelect(select, state.rods, selectedId, "No rod selected", (rod) => gearDisplayName(rod, "Rod"));
}

export function populateReelSelect(select, selectedId = "") {
  populateGearSelect(select, state.reels, selectedId, "No reel selected", (reel) => reel.shortName || gearDisplayName(reel, "Reel"));
}

export function tripRodIsAvailable(rodId, method) {
  return rodTypeMatchesMethod(state.rods.find((rod) => rod.id === rodId)?.type, method);
}

export function populateComboSelect(select, selectedId = "", method = "") {
  populateGearSelect(select, state.rodReelCombos, selectedId, "No combo selected", (combo) => comboName(combo.id) || "Combo",
    (combo) => tripRodIsAvailable(combo.rodId, method));
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

export function gearPickerLabel(item, fallback) {
  return [item?.name || fallback, item?.color].filter(Boolean).join(" - ");
}

function gearPickerMedia(source, type) {
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
  const media = gearPickerMedia(previewImage(item), type);
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

export function renderGearPicker(select, type) {
  const picker = select?.closest(".gear-media-picker");
  if (!picker) return;
  const items = type === "lure" ? luresForPicker(select) : state.flashers;
  const selected = items.find((item) => item.id === select.value);
  const placeholder = type === "lure" ? "Select lure" : "No flasher";
  const trigger = picker.querySelector(".gear-picker-trigger");
  const cardButton = picker.querySelector(".gear-picker-card-button");
  const menu = picker.querySelector(".gear-picker-options");
  const count = picker.querySelector(".gear-picker-count");
  const empty = picker.querySelector(".gear-picker-empty");
  const source = previewImage(selected);
  const pickerMedia = gearPickerMedia(source, type);
  const hasPhoto = Boolean(source);
  picker.classList.toggle("has-gear-photo", hasPhoto);
  if (cardButton) {
    cardButton.classList.toggle("hidden", !hasPhoto);
    cardButton.setAttribute(`data-preview-${type}-id`, hasPhoto ? selected.id : "");
    if (hasPhoto) cardButton.setAttribute("aria-label", `Open ${type} card for ${gearPickerLabel(selected, type)}`);
    setHtml(cardButton, hasPhoto ? pickerMedia : "");
  }
  empty?.classList.add("hidden");
  if (trigger) {
    setHtml(trigger, html`
      ${pickerMedia && !hasPhoto ? html`<span class="gear-picker-trigger-media">${pickerMedia}</span>` : ""}
      <span class="gear-picker-trigger-copy">
        <strong>${selected ? gearPickerLabel(selected, placeholder) : placeholder}</strong>
        ${selected ? html`<small>${[selected.type, selected.brand].filter(Boolean).join(" / ") || "Saved gear"}</small>` : ""}
      </span>
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
    `);
  }
  if (!menu) return;
  const query = picker.dataset.gearPickerQuery || "";
  const filteredItems = query
    ? items.filter((item) => [item.name, item.color, item.type, item.brand].filter(Boolean).join(" ").toLowerCase().includes(query))
    : items;
  if (count) count.textContent = `${filteredItems.length} ${query ? "found" : "saved"}`;
  setHtml(menu, html`
    <button class="gear-picker-option gear-picker-option-empty ${selected ? "" : "is-selected"}" type="button" role="option" aria-selected="${String(!selected)}" data-gear-picker-option="">
      <span><strong>Clear selection</strong></span>
    </button>
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
    select.parentNode.insertBefore(picker, select);
    picker.append(select);
    select.classList.add("gear-picker-native");
    select.tabIndex = -1;
    select.setAttribute("aria-hidden", "true");
    insertHtml(picker, "beforeend", html`
      <button class="gear-picker-trigger-media gear-picker-card-button hidden" type="button" aria-haspopup="dialog" title="Open ${type} card"></button>
      <button class="gear-picker-trigger" type="button" aria-haspopup="${type === "lure" ? "dialog" : "listbox"}"${type === "flasher" ? html` aria-expanded="false"` : ""}></button>
      ${type === "flasher" ? html`<div class="gear-picker-menu hidden">
        <div class="gear-picker-search-row">
          <input class="gear-picker-search" type="search" placeholder="Search saved ${type}s…" aria-label="Search saved ${type}s" />
          <span class="gear-picker-count"></span>
        </div>
        <div class="gear-picker-options" role="listbox" aria-label="Saved ${type}s"></div>
        <p class="gear-picker-empty hidden">No matching ${type}s.</p>
      </div>` : ""}
    `);
  }
  renderGearPicker(select, type);
}

export function populateLureSelect(select, selectedId = "") {
  setHtml(select, html`<option value="">Select lure</option>${joinHtml(luresForPicker(select).map((lure) => {
    const label = [lure.name, lure.color].filter(Boolean).join(" - ");
    return html`<option value="${lure.id}" ${lure.id === selectedId ? "selected" : ""}>${label}</option>`;
  }), "")}`);
  enhanceGearSelect(select, "lure");
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
    const cardButton = event.target.closest(".gear-picker-card-button");
    if (cardButton) {
      closeGearPickers();
      cardButton.focus();
      return;
    }
    const trigger = event.target.closest(".gear-picker-trigger");
    if (trigger) {
      event.preventDefault();
      const picker = trigger.closest(".gear-media-picker");
      const select = picker.querySelector("select");
      if (picker.dataset.gearPicker === "lure") {
        closeGearPickers();
        openLurePicker({
          lures: luresForPicker(select),
          selectedId: select.value,
          preferredType: select.matches(".trip-gear-cheater-lure")
            ? savedLureTypes(select).find((type) => type.toLowerCase() === "spoon") : "",
          trigger,
          onChoose(id) {
            if (!select.isConnected || select.value === id) return;
            populateLureSelect(select, id);
            select.dispatchEvent(new Event("change", { bubbles: true }));
          }
        });
        return;
      }
      const opening = !picker.classList.contains("is-open");
      closeGearPickers(opening ? picker : null);
      picker.classList.toggle("is-open", opening);
      trigger.setAttribute("aria-expanded", String(opening));
      picker.querySelector(".gear-picker-menu")?.classList.toggle("hidden", !opening);
      if (opening) {
        const search = picker.querySelector(".gear-picker-search");
        search.value = "";
        picker.dataset.gearPickerQuery = "";
        renderGearPicker(select, picker.dataset.gearPicker);
        requestAnimationFrame(() => search.focus());
      }
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
