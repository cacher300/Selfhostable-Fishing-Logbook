function isSoftPlasticLureRow(row) {
  const lureId = row?.querySelector(".catch-lure, .trip-gear-lure")?.value || "";
  const lure = state.lures.find((item) => String(item.id) === String(lureId));
  return String(lure?.type || "").trim().toLowerCase() === "soft plastic";
}

function updateRiggingVisibility(row) {
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

function renderLurePreview(row) {
  updateRiggingVisibility(row);
  const preview = row.querySelector(".lure-preview");
  const lureId = row.querySelector(".catch-lure, .trip-gear-lure")?.value;
  const lure = state.lures.find((item) => item.id === lureId);
  if (!preview || !lure) {
    if (preview) preview.innerHTML = "";
    return;
  }
  const image = lure.image ? mediaMarkup(lure, "", { download: false }) : "";
  const details = [lure.type, lure.brand, lure.color].filter(Boolean).join(" / ");
  preview.innerHTML = `
    <button class="lure-preview-card" type="button" data-preview-lure-id="${escapeHtml(lure.id)}" aria-label="Open preview for ${escapeHtml(lure.name || "lure")}">
      ${image}
      <div>
        <strong>${escapeHtml(lure.name)}</strong>
        <span>${escapeHtml(details || "Saved lure")}</span>
      </div>
    </button>
  `;
}

function renderFlasherPreview(row) {
  const preview = row.querySelector(".flasher-preview");
  const flasherId = row.querySelector(".catch-flasher, .trip-gear-flasher")?.value;
  const flasher = state.flashers.find((item) => item.id === flasherId);
  if (!preview || !flasher) {
    if (preview) preview.innerHTML = "";
    return;
  }
  const image = flasher.image ? mediaMarkup(flasher, "", { download: false }) : "";
  const details = [flasher.type, flasher.brand, flasher.color].filter(Boolean).join(" / ");
  preview.innerHTML = `
    <button class="flasher-preview-card" type="button" data-preview-flasher-id="${escapeHtml(flasher.id)}" aria-label="Open preview for ${escapeHtml(flasher.name || "flasher")}">
      ${image}
      <div>
        <strong>${escapeHtml(flasher.name)}</strong>
        <span>${escapeHtml(details || "Saved flasher")}</span>
      </div>
    </button>
  `;
}

function prepareInlineGearDialog(type, pendingRowId = "") {
  returnToTripDialog[type] = Boolean(pendingRowId) && els.tripDialog.open;
}

function restoreTripDialogAfterInlineGear(type) {
  if (!returnToTripDialog[type]) return;
  returnToTripDialog[type] = false;
}

function populateGearSelect(select, items, selectedId, placeholder, labelFn) {
  if (!select) return;
  select.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>` + items.map((item) => (
    `<option value="${item.id}" ${item.id === selectedId ? "selected" : ""}>${escapeHtml(labelFn(item))}</option>`
  )).join("");
}

function populateRodSelect(select, selectedId = "") {
  populateGearSelect(select, state.rods, selectedId, "No rod selected", (rod) => gearDisplayName(rod, "Rod"));
}

function populateReelSelect(select, selectedId = "") {
  populateGearSelect(select, state.reels, selectedId, "No reel selected", (reel) => reel.shortName || gearDisplayName(reel, "Reel"));
}

function populateComboSelect(select, selectedId = "") {
  populateGearSelect(select, state.rodReelCombos, selectedId, "No combo selected", (combo) => comboName(combo.id) || "Combo");
}

function savedLureTypes() {
  return [...new Set(state.lures.map((lure) => String(lure.type || "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function preferredLurePickerType(select) {
  if (!select?.matches(".trip-gear-cheater-lure")) return "";
  return savedLureTypes().find((type) => type.toLowerCase() === "spoon") || "";
}

function lureTypeOptionValue(type) {
  return `__type__:${type}`;
}

function lureOptionsForType(type) {
  return state.lures.filter((lure) => String(lure.type || "").trim() === type);
}

function gearPickerItems(type) {
  return type === "lure" ? state.lures : state.flashers;
}

function gearPickerLabel(item, fallback) {
  return [item?.name || fallback, item?.color].filter(Boolean).join(" - ");
}

function gearPickerMedia(item, type) {
  const source = previewImage(item);
  if (!source) {
    if (type === "lure") return "";
    return `<span class="gear-picker-photo-placeholder" aria-hidden="true">F</span>`;
  }
  return isVideoMedia(item)
    ? `<video src="${escapeHtml(source)}" muted preload="metadata" playsinline aria-hidden="true"></video>`
    : `<img src="${escapeHtml(source)}" alt="" />`;
}

function closeGearPickers(except = null) {
  document.querySelectorAll(".gear-media-picker.is-open").forEach((picker) => {
    if (picker === except) return;
    picker.classList.remove("is-open");
    picker.querySelector(".gear-picker-trigger")?.setAttribute("aria-expanded", "false");
    picker.querySelector(".gear-picker-menu")?.classList.add("hidden");
  });
}

function gearPickerOptionMarkup(item, type, selected) {
  const media = gearPickerMedia(item, type);
  return `
    <button
      class="gear-picker-option ${media ? "" : "gear-picker-option-no-media"} ${item.id === selected?.id ? "is-selected" : ""}"
      type="button"
      role="option"
      aria-selected="${String(item.id === selected?.id)}"
      data-gear-picker-option="${escapeHtml(item.id)}"
    >
      ${media}
      <span>
        <strong>${escapeHtml(gearPickerLabel(item, type === "lure" ? "Lure" : "Flasher"))}</strong>
        <small>${escapeHtml([item.type, item.brand].filter(Boolean).join(" / ") || "Saved gear")}</small>
      </span>
      <span class="gear-picker-check" aria-hidden="true">✓</span>
    </button>
  `;
}

function lureTypePickerMarkup(selected) {
  return `
    <button class="gear-picker-option gear-picker-option-empty ${selected ? "" : "is-selected"}" type="button" role="option" aria-selected="${String(!selected)}" data-gear-picker-option="">
      <span><strong>Clear selection</strong></span>
    </button>
    ${savedLureTypes().map((lureType) => {
      const lures = lureOptionsForType(lureType);
      return `
        <button class="gear-picker-option gear-picker-type-option" type="button" role="option" aria-selected="false" data-gear-picker-type="${escapeHtml(lureType)}">
          <span><strong>${escapeHtml(lureType)}</strong><small>${lures.length} saved lure${lures.length === 1 ? "" : "s"}</small></span>
          <span class="gear-picker-type-arrow" aria-hidden="true">›</span>
        </button>
      `;
    }).join("")}
  `;
}

function renderGearPicker(select, type) {
  const picker = select?.closest(".gear-media-picker");
  if (!picker) return;
  const items = gearPickerItems(type);
  const selected = items.find((item) => item.id === select.value);
  const placeholder = type === "lure" ? "Select lure" : "No flasher";
  const trigger = picker.querySelector(".gear-picker-trigger");
  const menu = picker.querySelector(".gear-picker-options");
  const count = picker.querySelector(".gear-picker-count");
  const empty = picker.querySelector(".gear-picker-empty");
  const pickerMedia = gearPickerMedia(selected, type);
  empty?.classList.add("hidden");
  if (trigger) {
    trigger.innerHTML = `
      ${pickerMedia ? `<span class="gear-picker-trigger-media">${pickerMedia}</span>` : ""}
      <span class="gear-picker-trigger-copy">
        <strong>${escapeHtml(selected ? gearPickerLabel(selected, placeholder) : placeholder)}</strong>
        <small>${escapeHtml(selected ? [selected.type, selected.brand].filter(Boolean).join(" / ") || "Saved gear" : `Choose from ${items.length} saved ${type}${items.length === 1 ? "" : "s"}`)}</small>
      </span>
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
    `;
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
      ? `${savedLureTypes().length} categories`
      : `${filteredItems.length} saved`;
  if (type === "lure" && view === "types" && !query) {
    menu.innerHTML = lureTypePickerMarkup(selected);
    empty?.classList.toggle("hidden", savedLureTypes().length > 0);
    return;
  }
  menu.innerHTML = `
    ${type === "lure" && view === "lures" && !query ? `
      <button class="gear-picker-back" type="button" data-gear-picker-back>‹ All lure categories</button>
      <div class="gear-picker-type-heading">${escapeHtml(activeType)}</div>
    ` : ""}
    ${type === "flasher" || type === "lure" ? `
      <button class="gear-picker-option gear-picker-option-empty ${selected ? "" : "is-selected"}" type="button" role="option" aria-selected="${String(!selected)}" data-gear-picker-option="">
        <span><strong>Clear selection</strong></span>
      </button>
    ` : ""}
    ${filteredItems.map((item) => gearPickerOptionMarkup(item, type, selected)).join("")}
  `;
  empty?.classList.toggle("hidden", filteredItems.length > 0);
}

function enhanceGearSelect(select, type) {
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
    picker.insertAdjacentHTML("beforeend", `
      <button class="gear-picker-trigger" type="button" aria-haspopup="listbox" aria-expanded="false"></button>
      <div class="gear-picker-menu hidden">
        <div class="gear-picker-search-row">
          <input class="gear-picker-search" type="search" placeholder="Search saved ${escapeHtml(type)}s…" aria-label="Search saved ${escapeHtml(type)}s" />
          <span class="gear-picker-count"></span>
        </div>
        <div class="gear-picker-options" role="listbox" aria-label="Saved ${escapeHtml(type)}s"></div>
        <p class="gear-picker-empty hidden">No matching ${escapeHtml(type)}s.</p>
      </div>
    `);
  }
  renderGearPicker(select, type);
}

function renderLureTypeOptions(select) {
  select.dataset.lurePickerMode = "types";
  select.dataset.lurePickerType = "";
  select.innerHTML = `<option value="">Select lure</option>` + savedLureTypes().map((type) => (
    `<option value="${escapeHtml(lureTypeOptionValue(type))}">${escapeHtml(type)}</option>`
  )).join("");
  enhanceGearSelect(select, "lure");
}

function populateLureSelect(select, selectedId = "") {
  select.dataset.lurePickerMode = "items";
  select.dataset.lurePickerType = "";
  const picker = select.closest(".gear-media-picker");
  if (picker) {
    picker.dataset.gearPickerView = "items";
    picker.dataset.gearPickerActiveType = "";
  }
  select.innerHTML = `<option value="">Select lure</option>` + state.lures.map((lure) => {
    const label = [lure.name, lure.color].filter(Boolean).join(" - ");
    return `<option value="${lure.id}" ${lure.id === selectedId ? "selected" : ""}>${escapeHtml(label)}</option>`;
  }).join("");
  enhanceGearSelect(select, "lure");
}

function populateLuresForType(select, type, selectedId = "") {
  select.dataset.lurePickerMode = "lures";
  select.dataset.lurePickerType = type;
  const lures = lureOptionsForType(type);
  select.innerHTML = `<option value="">Select lure</option>` + lures.map((lure) => {
    const label = [lure.name, lure.color].filter(Boolean).join(" - ");
    return `<option value="${lure.id}" ${lure.id === selectedId ? "selected" : ""}>${escapeHtml(label)}</option>`;
  }).join("");
  enhanceGearSelect(select, "lure");
}

function reopenLurePicker(select) {
  select.focus();
  try {
    select.showPicker?.();
  } catch (_error) {
    // Some browsers do not allow programmatic reopening of native selects.
  }
}

function populateFlasherSelect(select, selectedId = "") {
  select.innerHTML = `<option value="">No flasher</option>` + state.flashers.map((flasher) => {
    const label = [flasher.name, flasher.color].filter(Boolean).join(" - ");
    return `<option value="${flasher.id}" ${flasher.id === selectedId ? "selected" : ""}>${escapeHtml(label)}</option>`;
  }).join("");
  enhanceGearSelect(select, "flasher");
}

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

function syncComboToRow(row) {
  const combo = state.rodReelCombos.find((item) => item.id === row.querySelector(".trip-gear-combo")?.value);
  if (!combo) return;
  const rodSelect = row.querySelector(".trip-gear-rod");
  const reelSelect = row.querySelector(".trip-gear-reel");
  if (rodSelect && combo.rodId) rodSelect.value = combo.rodId;
  if (reelSelect && combo.reelId) reelSelect.value = combo.reelId;
}

