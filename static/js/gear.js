function imageFields(uploadedImage, existing = {}) {
  return {
    image: uploadedImage?.image || existing.image || "",
    previewImage: uploadedImage?.previewImage || existing.previewImage || uploadedImage?.image || existing.image || "",
    imagePath: uploadedImage?.path || existing.imagePath || "",
    imageFilename: uploadedImage?.filename || existing.imageFilename || "",
    previewPath: uploadedImage?.previewPath || existing.previewPath || "",
    previewFilename: uploadedImage?.previewFilename || existing.previewFilename || ""
  };
}

function gearPhotos(item) {
  if (Array.isArray(item?.photos) && item.photos.length) return item.photos;
  return item?.image ? [item] : [];
}

function gearPhotoFields(uploadedPhotos = [], existing = {}) {
  const photos = [...gearPhotos(existing), ...uploadedPhotos].filter((photo) => photo?.image);
  return { ...imageFields(photos[0]), photos };
}

function gearPhotoSignature(item) {
  return gearPhotos(item).map((photo) => [
    photo.image || "",
    photo.previewImage || "",
    photo.imagePath || "",
    photo.imageFilename || "",
    photo.previewPath || "",
    photo.previewFilename || ""
  ]);
}

function duplicateMatchesSource(source, duplicate, fields) {
  return fields.every((field) => {
    const sourceValue = Array.isArray(source?.[field]) ? JSON.stringify(source[field]) : String(source?.[field] ?? "");
    const duplicateValue = Array.isArray(duplicate?.[field]) ? JSON.stringify(duplicate[field]) : String(duplicate?.[field] ?? "");
    return sourceValue === duplicateValue;
  }) && JSON.stringify(gearPhotoSignature(source)) === JSON.stringify(gearPhotoSignature(duplicate));
}

function increasedQuantity(value) {
  if (String(value ?? "").trim() === "") return "2";
  return String(Math.max(0, Number(value) || 0) + 1);
}

function gearDisplayName(item, fallback = "Gear") {
  return [item?.brand, item?.name].map((value) => String(value || "").trim()).filter(Boolean).join(" ")
    || item?.shortName
    || fallback;
}

function generatedLureName(lure) {
  return [lure?.color, lure?.spoonSize, lure?.bladeType, lure?.brand, lure?.type].map((value) => String(value || "").trim()).filter(Boolean).join(" ");
}

function rodName(id) {
  if (!id) return "";
  return gearDisplayName(state.rods.find((rod) => rod.id === id), "");
}

function reelName(id) {
  if (!id) return "";
  return gearDisplayName(state.reels.find((reel) => reel.id === id), "");
}

function comboName(id) {
  if (!id) return "";
  const combo = state.rodReelCombos.find((item) => item.id === id);
  if (!combo) return "";
  return combo.shortName || [rodName(combo.rodId), reelName(combo.reelId)].filter(Boolean).join(" + ");
}

function lureName(id) {
  if (!id) return "";
  return state.lures.find((lure) => lure.id === id)?.name || "";
}

function flasherName(id) {
  if (!id) return "";
  return state.flashers.find((flasher) => flasher.id === id)?.name || "";
}

function activeLineEntry(reel) {
  return (reel?.lineHistory || [])
    .sort((a, b) => String(b.spooledDate || "").localeCompare(String(a.spooledDate || "")))[0] || null;
}

function lineSummary(line) {
  if (!line) return "";
  return [
    [line.type, displayStoredMeasurement(line.weight, "fishWeight")].filter(Boolean).join(" "),
    [line.brand, line.name].filter(Boolean).join(" "),
    line.color
  ].filter(Boolean).join(" / ");
}

function baitStats(type, id) {
  const key = type === "flasher" ? "flasherId" : "lureId";
  let landed = 0;
  let lost = 0;
  const trips = new Set();
  let lastUsed = "";
  state.trips.forEach((trip) => {
    const records = [
      ...(trip.catches || []).map((record) => ({ record, lost: false })),
      ...(trip.lostFish || []).map((record) => ({ record, lost: true })),
      ...(trip.gearUsed || []).map((record) => ({ record, setup: true }))
    ];
    records.forEach(({ record, lost: isLost, setup }) => {
      const resolved = setup ? record : resolveTripLineRecord({ ...record, trip });
      if (resolved[key] !== id) return;
      trips.add(trip.id);
      if (trip.date && (!lastUsed || trip.date > lastUsed)) lastUsed = trip.date;
      if (setup) return;
      if (isLost) lost += 1;
      else landed += fishCount(record);
    });
  });
  return { landed, lost, trips: trips.size, lastUsed };
}

function renderQueuedGearImage(type) {
  const pending = {
    lure: pendingLureImage,
    flasher: pendingFlasherImage,
    reel: pendingReelImage,
    rod: pendingRodImage
  }[type];
  const container = document.querySelector({
    lure: "#lureQueuedImage",
    flasher: "#flasherQueuedImage",
    reel: "#reelQueuedImage",
    rod: "#rodQueuedImage"
  }[type]);
  if (!container) return;
  container.classList.toggle("hidden", !pending);
  container.innerHTML = pending ? `
    ${isVideoMedia(pending)
      ? mediaMarkup(pending, "", { download: false })
      : `<button class="queued-gear-image-preview" type="button" data-open-queued-gear-preview="${escapeHtml(type)}" aria-label="Enlarge queued photo">${mediaMarkup(pending, "", { download: false })}</button>`}
    <span>${escapeHtml(isVideoMedia(pending) ? "Queued video selected" : "Queued photo selected")}</span>
  ` : "";
}

function renderExistingGearPhotos(type, item = null, localFiles = []) {
  const container = document.querySelector({
    lure: "#lureExistingPhotos",
    flasher: "#flasherExistingPhotos",
    reel: "#reelExistingPhotos",
    rod: "#rodExistingPhotos"
  }[type]);
  if (!container) return;
  (container._localPreviewUrls || []).forEach((url) => URL.revokeObjectURL(url));
  container._localPreviewUrls = [];
  const localPhotos = [...localFiles].map((file) => {
    const url = URL.createObjectURL(file);
    container._localPreviewUrls.push(url);
    return {
      image: url,
      previewImage: url,
      mediaType: file.type.startsWith("video/") ? "video" : "image",
      mimeType: file.type,
      name: file.name
    };
  });
  const photos = gearPhotos(item);
  container.classList.toggle("hidden", !photos.length && !localPhotos.length);
  container.innerHTML = `
    ${photos.length ? `
      <div class="gear-editor-photos-heading">Current ${photos.length === 1 ? "photo" : "photos"}</div>
      <div class="gear-editor-photo-grid">
        ${photos.map((photo) => `<div class="gear-editor-photo">${mediaMarkup(photo, "", { download: false })}</div>`).join("")}
      </div>
    ` : ""}
    ${localPhotos.length ? `
      <div class="gear-editor-photos-heading">Selected ${localPhotos.length === 1 ? "upload" : "uploads"}</div>
      <div class="gear-editor-photo-grid">
        ${localPhotos.map((photo) => `<div class="gear-editor-photo">${mediaMarkup(photo, "", { download: false })}</div>`).join("")}
      </div>
    ` : ""}
  `;
}

function previewSelectedGearUploads(type, input) {
  const items = { lure: state.lures, flasher: state.flashers, reel: state.reels, rod: state.rods }[type] || [];
  const id = {
    lure: getValue("editingLureId"),
    flasher: getValue("editingFlasherId"),
    reel: getValue("editingReelId") || els.reelDialog.dataset.duplicateFromId,
    rod: getValue("editingRodId") || els.rodDialog.dataset.duplicateFromId
  }[type];
  renderExistingGearPhotos(type, items.find((item) => item.id === id) || null, input?.files || []);
}

function openQueuedGearImagePreview(type) {
  const pending = {
    lure: pendingLureImage,
    flasher: pendingFlasherImage,
    reel: pendingReelImage,
    rod: pendingRodImage
  }[type];
  const source = originalMediaUrl(pending);
  if (!source || isVideoMedia(pending)) return;
  document.querySelector(".queued-gear-photo-lightbox")?.remove();
  document.body.insertAdjacentHTML("beforeend", `
    <div class="report-photo-lightbox queued-gear-photo-lightbox" role="dialog" aria-modal="true" aria-label="Queued gear photo">
      <button type="button" class="report-photo-lightbox-close" data-close-report-photo aria-label="Close photo">×</button>
      <img src="${escapeHtml(source)}" alt="Queued gear photo">
    </div>
  `);
  document.querySelector(".queued-gear-photo-lightbox [data-close-report-photo]")?.focus();
}

function renderLurePreview(row) {
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
  populateGearSelect(select, state.reels, selectedId, "No reel selected", (reel) => gearDisplayName(reel, "Reel"));
}

function populateComboSelect(select, selectedId = "") {
  populateGearSelect(select, state.rodReelCombos, selectedId, "No combo selected", (combo) => comboName(combo.id) || "Combo");
}

function savedLureTypes() {
  return [...new Set(state.lures.map((lure) => String(lure.type || "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
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
    return `<span class="gear-picker-photo-placeholder" aria-hidden="true">${type === "lure" ? "L" : "F"}</span>`;
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
  return `
    <button
      class="gear-picker-option ${item.id === selected?.id ? "is-selected" : ""}"
      type="button"
      role="option"
      aria-selected="${String(item.id === selected?.id)}"
      data-gear-picker-option="${escapeHtml(item.id)}"
    >
      ${gearPickerMedia(item, type)}
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
      <span class="gear-picker-photo-placeholder" aria-hidden="true">—</span>
      <span><strong>Select lure</strong><small>Clear selection</small></span>
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
  empty?.classList.add("hidden");
  if (trigger) {
    trigger.innerHTML = `
      <span class="gear-picker-trigger-media">${gearPickerMedia(selected, type)}</span>
      <span class="gear-picker-trigger-copy">
        <strong>${escapeHtml(selected ? gearPickerLabel(selected, placeholder) : placeholder)}</strong>
        <small>${escapeHtml(selected ? [selected.type, selected.brand].filter(Boolean).join(" / ") || "Saved gear" : `Choose from ${items.length} saved ${type}${items.length === 1 ? "" : "s"}`)}</small>
      </span>
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
    `;
  }
  if (!menu) return;
  const query = picker.dataset.gearPickerQuery || "";
  if (type === "lure" && !query && picker.dataset.gearPickerView !== "lures") {
    if (count) count.textContent = `${savedLureTypes().length} types`;
    menu.innerHTML = lureTypePickerMarkup(selected);
    return;
  }

  const lureType = picker.dataset.gearPickerActiveType || "";
  const filteredItems = items.filter((item) => {
    if (query) return [item.name, item.color, item.type, item.brand].filter(Boolean).join(" ").toLowerCase().includes(query);
    return type !== "lure" || String(item.type || "").trim() === lureType;
  });
  if (count) count.textContent = query ? `${filteredItems.length} found` : `${filteredItems.length} saved`;
  menu.innerHTML = `
    ${type === "lure" && !query ? `
      <button class="gear-picker-back" type="button" data-gear-picker-back>
        <span aria-hidden="true">‹</span>
        All lure types
      </button>
      <p class="gear-picker-type-heading">${escapeHtml(lureType)}</p>
    ` : ""}
    ${type === "flasher" ? `
      <button class="gear-picker-option gear-picker-option-empty ${selected ? "" : "is-selected"}" type="button" role="option" aria-selected="${String(!selected)}" data-gear-picker-option="">
        <span class="gear-picker-photo-placeholder" aria-hidden="true">—</span>
        <span><strong>${escapeHtml(placeholder)}</strong><small>Clear selection</small></span>
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
    picker.dataset.gearPickerView = type === "lure" ? "types" : "items";
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
  const selectedLure = state.lures.find((lure) => lure.id === selectedId);
  if (!selectedLure) {
    renderLureTypeOptions(select);
    return;
  }
  populateLuresForType(select, String(selectedLure.type || "").trim(), selectedId);
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
      search.value = "";
      picker.dataset.gearPickerQuery = "";
      picker.dataset.gearPickerView = picker.dataset.gearPicker === "lure" ? "types" : "items";
      picker.dataset.gearPickerActiveType = "";
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
    if (type === "lure") {
      const lure = state.lures.find((item) => item.id === selectedId);
      if (lure) populateLuresForType(select, String(lure.type || "").trim(), selectedId);
      else renderLureTypeOptions(select);
    } else {
      select.value = selectedId;
      renderGearPicker(select, type);
    }
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

function renderLineRows(lines = []) {
  const container = document.querySelector("#reelLineRows");
  if (!container) return;
  container.innerHTML = lineRowMarkup(activeLineEntry({ lineHistory: lines }) || {});
}

function lineUsesBraid(type) {
  return String(type || "").trim().toLowerCase() === "braid";
}

function updateMonoBackingVisibility(row) {
  if (!row) return;
  const backingField = row.querySelector(".line-mono-backing-field");
  const backingInput = row.querySelector(".line-mono-backing");
  const lineType = row.querySelector(".line-type")?.value;
  const showBacking = lineUsesBraid(lineType);
  backingField?.classList.toggle("hidden", !showBacking);
  if (!showBacking && backingInput) backingInput.checked = false;
}

function lineRowMarkup(line = {}) {
  const id = line.id || createId();
  const showMonoBacking = lineUsesBraid(line.type || optionLabels("lineTypes")[0]);
  return `
    <article class="line-editor-row" data-line-id="${escapeHtml(id)}">
      <label><span>Spooled date</span><input class="line-spooled-date" type="date" value="${escapeHtml(line.spooledDate || "")}" /></label>
      <label><span>Type</span><select class="line-type">${optionLabels("lineTypes").map((type) => `<option value="${escapeHtml(type)}" ${type === line.type ? "selected" : ""}>${escapeHtml(type)}</option>`).join("")}</select></label>
      <label><span>Brand</span><input class="line-brand" type="text" value="${escapeHtml(line.brand || "")}" placeholder="Berkley" /></label>
      <label><span>Name</span><input class="line-name" type="text" value="${escapeHtml(line.name || "")}" placeholder="X5" /></label>
      <label><span>Weight (${unitSymbol("fishWeight")})</span><input class="line-weight" type="text" value="${escapeHtml(line.weight || "")}" placeholder="30" /></label>
      <label><span>Diameter in</span><input class="line-diameter-in" type="text" value="${escapeHtml(line.diameterIn || "")}" placeholder="0.008" /></label>
      <label><span>Diameter mm</span><input class="line-diameter-mm" type="text" value="${escapeHtml(line.diameterMm || "")}" placeholder="0.20" /></label>
      <label><span>Color</span><input class="line-color" type="text" value="${escapeHtml(line.color || "")}" placeholder="Lo-Vis" /></label>
      <label class="checkbox-label line-mono-backing-field ${showMonoBacking ? "" : "hidden"}"><input class="line-mono-backing" type="checkbox" ${line.monoBacking && showMonoBacking ? "checked" : ""} /><span>Mono backing</span></label>
      <label class="line-notes-field"><span>Notes</span><input class="line-notes" type="text" value="${escapeHtml(line.notes || "")}" placeholder="Spooling notes" /></label>
    </article>
  `;
}

function collectLineRows() {
  const lines = [...document.querySelectorAll("#reelLineRows .line-editor-row")]
    .map((row) => ({
      id: row.dataset.lineId || createId(),
      spooledDate: row.querySelector(".line-spooled-date").value,
      type: row.querySelector(".line-type").value,
      brand: row.querySelector(".line-brand").value.trim(),
      name: row.querySelector(".line-name").value.trim(),
      weight: row.querySelector(".line-weight").value.trim(),
      diameterIn: row.querySelector(".line-diameter-in").value.trim(),
      diameterMm: row.querySelector(".line-diameter-mm").value.trim(),
      color: row.querySelector(".line-color").value.trim(),
      monoBacking: row.querySelector(".line-mono-backing").checked,
      notes: row.querySelector(".line-notes").value.trim()
    }))
    .filter((line) => line.spooledDate || line.type || line.brand || line.name || line.weight || line.diameterIn || line.diameterMm || line.color || line.monoBacking || line.notes);
  return lines.slice(0, 1);
}

function openReelDialog(reel = null, { duplicate = false } = {}) {
  els.reelForm.reset();
  pendingReelImage = null;
  renderQueuedGearImage("reel");
  renderExistingGearPhotos("reel", reel);
  populateOptionSelect(document.querySelector("#reelStyle"), optionLabels("reelStyles"), "Select style");
  const editing = Boolean(reel) && !duplicate;
  document.querySelector("#reelDialog h2").textContent = editing ? "Edit Reel" : duplicate ? "Duplicate Reel" : "Add Reel";
  els.reelDialog.dataset.duplicateFromId = duplicate ? reel?.id || "" : "";
  setValue("editingReelId", editing ? reel?.id || "" : "");
  setValue("reelShortName", reel?.shortName || "");
  setValue("reelStyle", reel?.style || "");
  setValue("reelBrand", reel?.brand || "");
  setValue("reelName", reel?.name || "");
  setValue("reelSize", reel?.size || "");
  setValue("reelWeight", reel?.weight || "");
  setValue("reelGearRatio", reel?.gearRatio || "");
  setValue("reelRetrieveRate", reel?.retrieveRate || "");
  setValue("reelMaxDrag", reel?.maxDrag || "");
  setValue("reelMonoCapacity", reel?.monoCapacity || "");
  setValue("reelBraidCapacity", reel?.braidCapacity || "");
  setValue("reelPurchaseAmount", reel?.purchaseAmount || "");
  setValue("reelDateBought", reel?.dateBought || "");
  setValue("reelQuantityAvailable", reel?.quantityAvailable ?? "");
  setValue("reelNotes", reel?.notes || "");
  renderLineRows(reel?.lineHistory || []);
  els.deleteReelButton.classList.toggle("hidden", !editing);
  els.reelDialog.showModal();
}

function openRodDialog(rod = null, { duplicate = false } = {}) {
  els.rodForm.reset();
  pendingRodImage = null;
  renderQueuedGearImage("rod");
  renderExistingGearPhotos("rod", rod);
  populateOptionSelect(document.querySelector("#rodType"), optionLabels("rodTypes"), "Select type");
  const editing = Boolean(rod) && !duplicate;
  document.querySelector("#rodDialog h2").textContent = editing ? "Edit Rod" : duplicate ? "Duplicate Rod" : "Add Rod";
  els.rodDialog.dataset.duplicateFromId = duplicate ? rod?.id || "" : "";
  setValue("editingRodId", editing ? rod?.id || "" : "");
  setValue("rodShortName", rod?.shortName || "");
  setValue("rodType", rod?.type || "");
  setValue("rodBrand", rod?.brand || "");
  setValue("rodName", rod?.name || "");
  setValue("rodLength", rod?.length || "");
  setValue("rodPower", rod?.power || "");
  setValue("rodAction", rod?.action || "");
  setValue("rodLureRating", rod?.lureRating || "");
  setValue("rodPurchaseAmount", rod?.purchaseAmount || "");
  setValue("rodDateBought", rod?.dateBought || "");
  setValue("rodQuantityAvailable", rod?.quantityAvailable ?? "");
  setValue("rodNotes", rod?.notes || "");
  els.deleteRodButton.classList.toggle("hidden", !editing);
  els.rodDialog.showModal();
}

function openComboDialog(combo = null) {
  els.comboForm.reset();
  const editing = Boolean(combo);
  document.querySelector("#comboDialog h2").textContent = editing ? "Edit Combo" : "Add Combo";
  setValue("editingComboId", combo?.id || "");
  setValue("comboShortName", combo?.shortName || "");
  document.querySelector("#comboShortName").dataset.autoName = "";
  populateRodSelect(document.querySelector("#comboRod"), combo?.rodId || "");
  populateReelSelect(document.querySelector("#comboReel"), combo?.reelId || "");
  setValue("comboNotes", combo?.notes || "");
  els.deleteComboButton.classList.toggle("hidden", !editing);
  els.comboDialog.showModal();
}

function openLureDialog(lure = null, pendingRowId = "") {
  prepareInlineGearDialog("lure", pendingRowId);
  els.lureForm.reset();
  pendingLureImage = null;
  renderQueuedGearImage("lure");
  renderExistingGearPhotos("lure", lure);
  populateOptionSelect(document.querySelector("#lureType"), state.lureTypes, "Select lure type");
  populateOptionSelect(document.querySelector("#lureBladeType"), optionLabels("lureBladeTypes"), "Select blade type");
  populateOptionSelect(document.querySelector("#lureSpoonSize"), optionLabels("lureSpoonSizes"), "Select spoon size");
  const editing = Boolean(lure);
  document.querySelector("#lureDialog h2").textContent = editing ? "Edit Lure" : "Add Lure";
  setValue("pendingCatchRow", pendingRowId);
  setValue("editingLureId", lure?.id || "");
  setValue("lureName", lure?.name || "");
  setValue("lureType", lure?.type || "");
  setValue("lureDivingDepth", lure?.divingDepth || "");
  setValue("lureBladeType", lure?.bladeType || "");
  setValue("lureSpoonSize", lure?.spoonSize || "");
  updateLureDivingDepthField();
  setValue("lureBrand", lure?.brand || "");
  setValue("lureModel", lure?.model || "");
  setValue("lureColor", lure?.color || "");
  setValue("lureQuantityAvailable", lure?.quantityAvailable ?? "");
  document.querySelector("#lureGlow").checked = Boolean(lure?.glow);
  setValue("lureNotes", lure?.notes || "");
  els.deleteLureButton.classList.toggle("hidden", !editing);
  els.lureDialog.showModal();
}

function openLureInfoDialog(lure, pendingRowId = "") {
  if (!lure) return;
  prepareInlineGearDialog("lureInfo", pendingRowId);
  const stats = baitStats("lure", lure.id);
  const hasDivingDepth = ["crankbait", "jerkbait"].includes(lure.type?.toLowerCase());
  const hasBladeType = isWormHarnessType(lure.type);
  const hasSpoonSize = isSpoonType(lure.type);
  const details = [
    ["Type", lure.type],
    ["Diving depth", hasDivingDepth ? lure.divingDepth : ""],
    ["Blade type", hasBladeType ? lure.bladeType : ""],
    ["Spoon size", hasSpoonSize ? lure.spoonSize : ""],
    ["Brand", lure.brand],
    ["Model", lure.model],
    ["Color", lure.color],
    ["Quantity owned", lure.quantityAvailable],
    ["Glow", lure.glow ? "Yes" : "No"],
    ["Fish lost", stats.lost],
    ["Trips used", stats.trips],
    ["Last used", stats.lastUsed]
  ].filter(([, value]) => value !== "" && value !== null && value !== undefined);
  document.querySelector("#lureInfoTitle").textContent = lure.name || "Lure";
  els.lureInfoDialog.dataset.lureId = lure.id;
  els.lureInfoContent.innerHTML = `
    ${lure.image ? `<div class="lure-info-media">${mediaMarkup(lure, "", { download: false })}</div>` : ""}
    <dl class="lure-info-list">
      ${details.map(([label, value]) => `
        <div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(String(value))}</dd></div>
      `).join("")}
    </dl>
    ${lure.notes ? `<div class="lure-info-notes"><strong>Notes</strong><p>${escapeHtml(lure.notes)}</p></div>` : ""}
  `;
  els.lureInfoDialog.showModal();
}

function updateLureDivingDepthField() {
  const lureType = getValue("lureType");
  const hasDivingDepth = ["crankbait", "jerkbait"].includes(lureType.toLowerCase());
  document.querySelector("#lureDivingDepthField").classList.toggle("hidden", !hasDivingDepth);
  document.querySelector("#lureBladeTypeField").classList.toggle("hidden", !isWormHarnessType(lureType));
  document.querySelector("#lureSpoonSizeField").classList.toggle("hidden", !isSpoonType(lureType));
}

function isWormHarnessType(type) {
  return String(type || "").trim().toLowerCase() === "worm harness";
}

function isSpoonType(type) {
  return String(type || "").trim().toLowerCase() === "spoon";
}

function openFlasherDialog(flasher = null, pendingRowId = "") {
  prepareInlineGearDialog("flasher", pendingRowId);
  els.flasherForm.reset();
  pendingFlasherImage = null;
  renderQueuedGearImage("flasher");
  renderExistingGearPhotos("flasher", flasher);
  populateOptionSelect(document.querySelector("#flasherType"), state.flasherTypes, "Select flasher type");
  const editing = Boolean(flasher);
  document.querySelector("#flasherDialog h2").textContent = editing ? "Edit Flasher" : "Add Flasher";
  setValue("pendingFlasherCatchRow", pendingRowId);
  setValue("editingFlasherId", flasher?.id || "");
  setValue("flasherName", flasher?.name || "");
  setValue("flasherType", flasher?.type || "");
  setValue("flasherBrand", flasher?.brand || "");
  setValue("flasherModel", flasher?.model || "");
  setValue("flasherColor", flasher?.color || "");
  document.querySelector("#flasherGlow").checked = Boolean(flasher?.glow);
  setValue("flasherNotes", flasher?.notes || "");
  els.deleteFlasherButton.classList.toggle("hidden", !editing);
  els.flasherDialog.showModal();
}

function openFlasherInfoDialog(flasher, pendingRowId = "") {
  if (!flasher) return;
  prepareInlineGearDialog("flasherInfo", pendingRowId);
  const stats = baitStats("flasher", flasher.id);
  const details = [
    ["Type", flasher.type],
    ["Brand", flasher.brand],
    ["Model", flasher.model],
    ["Color", flasher.color],
    ["Glow", flasher.glow ? "Yes" : "No"],
    ["Fish lost", stats.lost],
    ["Trips used", stats.trips],
    ["Last used", stats.lastUsed]
  ].filter(([, value]) => value !== "" && value !== null && value !== undefined);
  document.querySelector("#flasherInfoTitle").textContent = flasher.name || "Flasher";
  els.flasherInfoDialog.dataset.flasherId = flasher.id;
  els.flasherInfoContent.innerHTML = `
    ${flasher.image ? `<div class="lure-info-media">${mediaMarkup(flasher, "", { download: false })}</div>` : ""}
    <dl class="lure-info-list">
      ${details.map(([label, value]) => `
        <div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(String(value))}</dd></div>
      `).join("")}
    </dl>
    ${flasher.notes ? `<div class="lure-info-notes"><strong>Notes</strong><p>${escapeHtml(flasher.notes)}</p></div>` : ""}
  `;
  els.flasherInfoDialog.showModal();
}

async function saveReel(event) {
  event.preventDefault();
  try {
    const editingId = getValue("editingReelId");
    const existing = state.reels.find((item) => item.id === editingId || item.id === els.reelDialog.dataset.duplicateFromId);
    const imageFiles = [...document.querySelector("#reelImage").files];
    const uploadedPhotos = imageFiles.length
      ? await Promise.all(imageFiles.map((file) => uploadImageFile(file, "reels")))
      : pendingReelImage ? [pendingReelImage] : [];
    const reel = {
      id: editingId || createId(),
      shortName: getValue("reelShortName"),
      style: getValue("reelStyle"),
      brand: getValue("reelBrand"),
      name: getValue("reelName"),
      size: getValue("reelSize"),
      weight: getValue("reelWeight"),
      gearRatio: getValue("reelGearRatio"),
      retrieveRate: getValue("reelRetrieveRate"),
      maxDrag: getValue("reelMaxDrag"),
      monoCapacity: getValue("reelMonoCapacity"),
      braidCapacity: getValue("reelBraidCapacity"),
      purchaseAmount: getValue("reelPurchaseAmount"),
      dateBought: getValue("reelDateBought"),
      quantityAvailable: getValue("reelQuantityAvailable"),
      notes: getValue("reelNotes"),
      lineHistory: collectLineRows(),
      ...gearPhotoFields(uploadedPhotos, existing)
    };
    const duplicatedUnchanged = !editingId && Boolean(els.reelDialog.dataset.duplicateFromId)
      && duplicateMatchesSource(existing, reel, [
        "shortName", "style", "brand", "name", "size", "weight", "gearRatio", "retrieveRate",
        "maxDrag", "monoCapacity", "braidCapacity", "purchaseAmount", "dateBought", "quantityAvailable",
        "notes", "lineHistory"
      ]);
    const index = state.reels.findIndex((item) => item.id === reel.id);
    if (duplicatedUnchanged) existing.quantityAvailable = increasedQuantity(existing.quantityAvailable);
    else if (index >= 0) state.reels[index] = reel;
    else state.reels.push(reel);
    upsertListValue("reelStyles", reel.style);
    reel.lineHistory.forEach((line) => upsertListValue("lineTypes", line.type));
    await saveState();
    els.reelDialog.close();
    els.reelForm.reset();
    els.reelDialog.dataset.duplicateFromId = "";
    pendingReelImage = null;
    renderAll();
  } catch (error) {
    console.error("Could not save reel.", error);
    alert(error.message || "The reel could not be saved.");
  }
}

async function saveRod(event) {
  event.preventDefault();
  try {
    const editingId = getValue("editingRodId");
    const existing = state.rods.find((item) => item.id === editingId || item.id === els.rodDialog.dataset.duplicateFromId);
    const imageFiles = [...document.querySelector("#rodImage").files];
    const uploadedPhotos = imageFiles.length
      ? await Promise.all(imageFiles.map((file) => uploadImageFile(file, "rods")))
      : pendingRodImage ? [pendingRodImage] : [];
    const rod = {
      id: editingId || createId(),
      shortName: getValue("rodShortName"),
      type: getValue("rodType"),
      brand: getValue("rodBrand"),
      name: getValue("rodName"),
      length: getValue("rodLength"),
      power: getValue("rodPower"),
      action: getValue("rodAction"),
      lureRating: getValue("rodLureRating"),
      purchaseAmount: getValue("rodPurchaseAmount"),
      dateBought: getValue("rodDateBought"),
      quantityAvailable: getValue("rodQuantityAvailable"),
      notes: getValue("rodNotes"),
      ...gearPhotoFields(uploadedPhotos, existing)
    };
    const duplicatedUnchanged = !editingId && Boolean(els.rodDialog.dataset.duplicateFromId)
      && duplicateMatchesSource(existing, rod, [
        "shortName", "type", "brand", "name", "length", "power", "action", "lureRating",
        "purchaseAmount", "dateBought", "quantityAvailable", "notes"
      ]);
    const index = state.rods.findIndex((item) => item.id === rod.id);
    if (duplicatedUnchanged) existing.quantityAvailable = increasedQuantity(existing.quantityAvailable);
    else if (index >= 0) state.rods[index] = rod;
    else state.rods.push(rod);
    upsertListValue("rodTypes", rod.type);
    await saveState();
    els.rodDialog.close();
    els.rodForm.reset();
    els.rodDialog.dataset.duplicateFromId = "";
    pendingRodImage = null;
    renderAll();
  } catch (error) {
    console.error("Could not save rod.", error);
    alert(error.message || "The rod could not be saved.");
  }
}

async function saveCombo(event) {
  event.preventDefault();
  try {
    const combo = {
      id: getValue("editingComboId") || createId(),
      shortName: getValue("comboShortName"),
      rodId: getValue("comboRod"),
      reelId: getValue("comboReel"),
      notes: getValue("comboNotes")
    };
    const index = state.rodReelCombos.findIndex((item) => item.id === combo.id);
    if (index >= 0) state.rodReelCombos[index] = combo;
    else state.rodReelCombos.push(combo);
    await saveState();
    els.comboDialog.close();
    renderAll();
  } catch (error) {
    console.error("Could not save combo.", error);
    alert(error.message || "The combo could not be saved.");
  }
}

async function saveLure(event) {
  event.preventDefault();
  try {
    const editingId = getValue("editingLureId");
    const existing = state.lures.find((item) => item.id === editingId);
    const imageFile = document.querySelector("#lureImage").files[0];
    const uploadedImage = imageFile ? await uploadImageFile(imageFile, "lures") : pendingLureImage;
    const lure = {
      id: editingId || createId(),
      name: getValue("lureName"),
      type: getValue("lureType"),
      divingDepth: ["crankbait", "jerkbait"].includes(getValue("lureType").toLowerCase()) ? getValue("lureDivingDepth") : "",
      bladeType: isWormHarnessType(getValue("lureType")) ? getValue("lureBladeType") : "",
      spoonSize: isSpoonType(getValue("lureType")) ? getValue("lureSpoonSize") : "",
      brand: getValue("lureBrand"),
      model: getValue("lureModel"),
      color: getValue("lureColor"),
      quantityAvailable: getValue("lureQuantityAvailable"),
      glow: document.querySelector("#lureGlow").checked,
      notes: getValue("lureNotes"),
      ...imageFields(uploadedImage, existing)
    };
    lure.name = lure.name || generatedLureName(lure) || "Unnamed Lure";
    const lureIndex = state.lures.findIndex((item) => item.id === lure.id);
    if (lureIndex >= 0) state.lures[lureIndex] = lure;
    else state.lures.push(lure);
    upsertListValue("lureTypes", lure.type);
    await saveState();
    [...document.querySelectorAll(".catch-lure, .trip-gear-lure, .trip-gear-cheater-lure")].forEach((select) => populateLureSelect(select, select.value));
    const rowId = getValue("pendingCatchRow");
    const row = [...document.querySelectorAll(".catch-row, .gear-used-row")].find((item) => item.dataset.rowId === rowId);
    if (row) {
      const select = row.querySelector(".catch-lure, .trip-gear-lure");
      populateLuresForType(select, lure.type, lure.id);
      select.value = lure.id;
      renderLurePreview(row);
      updateRowSummary(row);
    }
    els.lureDialog.close();
    els.lureForm.reset();
    pendingLureImage = null;
    renderQueuedGearImage("lure");
    renderAll();
  } catch (error) {
    console.error("Could not save lure.", error);
    alert(error.message || "The lure could not be saved.");
  }
}

async function saveFlasher(event) {
  event.preventDefault();
  try {
    const editingId = getValue("editingFlasherId");
    const existing = state.flashers.find((item) => item.id === editingId);
    const imageFile = document.querySelector("#flasherImage").files[0];
    const uploadedImage = imageFile ? await uploadImageFile(imageFile, "flashers") : pendingFlasherImage;
    const flasher = {
      id: editingId || createId(),
      name: getValue("flasherName"),
      type: getValue("flasherType"),
      brand: getValue("flasherBrand"),
      model: getValue("flasherModel"),
      color: getValue("flasherColor"),
      glow: document.querySelector("#flasherGlow").checked,
      notes: getValue("flasherNotes"),
      ...imageFields(uploadedImage, existing)
    };
    const flasherIndex = state.flashers.findIndex((item) => item.id === flasher.id);
    if (flasherIndex >= 0) state.flashers[flasherIndex] = flasher;
    else state.flashers.push(flasher);
    upsertListValue("flasherTypes", flasher.type);
    await saveState();
    [...document.querySelectorAll(".catch-flasher, .trip-gear-flasher")].forEach((select) => populateFlasherSelect(select, select.value));
    const rowId = getValue("pendingFlasherCatchRow");
    const row = [...document.querySelectorAll(".catch-row, .gear-used-row")].find((item) => item.dataset.rowId === rowId);
    if (row) row.querySelector(".catch-flasher, .trip-gear-flasher").value = flasher.id;
    if (row) renderFlasherPreview(row);
    if (row) updateRowSummary(row);
    els.flasherDialog.close();
    els.flasherForm.reset();
    pendingFlasherImage = null;
    renderQueuedGearImage("flasher");
    renderAll();
  } catch (error) {
    console.error("Could not save flasher.", error);
    alert(error.message || "The flasher could not be saved.");
  }
}

async function deleteReel() {
  const reelId = getValue("editingReelId");
  const reel = state.reels.find((item) => item.id === reelId);
  if (!reel || !confirm(`Delete ${gearDisplayName(reel, "this reel")}? This clears it from combos and trips.`)) return;
  state.reels = state.reels.filter((item) => item.id !== reelId);
  state.rodReelCombos.forEach((combo) => {
    if (combo.reelId === reelId) combo.reelId = "";
  });
  state.trips.forEach((trip) => (trip.gearUsed || []).forEach((gearItem) => {
    if (gearItem.reelId === reelId) gearItem.reelId = "";
  }));
  await saveState();
  els.reelDialog.close();
  renderAll();
}

async function deleteRod() {
  const rodId = getValue("editingRodId");
  const rod = state.rods.find((item) => item.id === rodId);
  if (!rod || !confirm(`Delete ${gearDisplayName(rod, "this rod")}? This clears it from combos and trips.`)) return;
  state.rods = state.rods.filter((item) => item.id !== rodId);
  state.rodReelCombos.forEach((combo) => {
    if (combo.rodId === rodId) combo.rodId = "";
  });
  state.trips.forEach((trip) => (trip.gearUsed || []).forEach((gearItem) => {
    if (gearItem.rodId === rodId) gearItem.rodId = "";
  }));
  await saveState();
  els.rodDialog.close();
  renderAll();
}

async function deleteCombo() {
  const comboId = getValue("editingComboId");
  const combo = state.rodReelCombos.find((item) => item.id === comboId);
  if (!combo || !confirm(`Delete ${comboName(comboId) || "this combo"}? Trips keep their selected rod and reel.`)) return;
  state.rodReelCombos = state.rodReelCombos.filter((item) => item.id !== comboId);
  state.trips.forEach((trip) => (trip.gearUsed || []).forEach((gearItem) => {
    if (gearItem.comboId === comboId) gearItem.comboId = "";
  }));
  await saveState();
  els.comboDialog.close();
  renderAll();
}

async function deleteLure() {
  const lureId = getValue("editingLureId");
  const lure = state.lures.find((item) => item.id === lureId);
  if (!lure || !confirm(`Delete ${lure.name}? This removes it from saved lures and clears it from catches.`)) return;
  state.lures = state.lures.filter((item) => item.id !== lureId);
  state.trips.forEach((trip) => {
    (trip.gearUsed || []).forEach((gearItem) => { if (gearItem.lureId === lureId) gearItem.lureId = ""; });
    (trip.catches || []).forEach((catchItem) => { if (catchItem.lureId === lureId) catchItem.lureId = ""; });
    (trip.lostFish || []).forEach((fish) => { if (fish.lureId === lureId) fish.lureId = ""; });
  });
  await saveState();
  els.lureDialog.close();
  renderAll();
}

async function deleteFlasher() {
  const flasherId = getValue("editingFlasherId");
  const flasher = state.flashers.find((item) => item.id === flasherId);
  if (!flasher || !confirm(`Delete ${flasher.name}? This removes it from saved flashers and clears it from catches.`)) return;
  state.flashers = state.flashers.filter((item) => item.id !== flasherId);
  state.trips.forEach((trip) => {
    (trip.gearUsed || []).forEach((gearItem) => { if (gearItem.flasherId === flasherId) gearItem.flasherId = ""; });
    (trip.catches || []).forEach((catchItem) => { if (catchItem.flasherId === flasherId) catchItem.flasherId = ""; });
    (trip.lostFish || []).forEach((fish) => { if (fish.flasherId === flasherId) fish.flasherId = ""; });
  });
  await saveState();
  els.flasherDialog.close();
  renderAll();
}

function renderInventoryTable(container, headers, rows, emptyText) {
  if (!container) return;
  if (!rows.length) {
    container.innerHTML = `<div class="empty-state"><p>${escapeHtml(emptyText)}</p></div>`;
    return;
  }
  const sortState = inventorySortState[container.id];
  container.innerHTML = `
    <table>
      <thead><tr>${headers.map((header, index) => {
        const sortable = Boolean(header) && header !== "Photo";
        const sorted = sortState?.index === index;
        const direction = sorted ? sortState.direction : "none";
        return `<th aria-sort="${direction === "asc" ? "ascending" : direction === "desc" ? "descending" : "none"}">${sortable ? `<button class="inventory-sort-button" type="button" data-inventory-sort-table="${escapeHtml(container.id)}" data-inventory-sort-index="${index}">${escapeHtml(header)}${sorted ? `<span aria-hidden="true"> ${direction === "asc" ? "↑" : "↓"}</span>` : ""}</button>` : escapeHtml(header)}</th>`;
      }).join("")}</tr></thead>
      <tbody>${rows.map((row) => {
        const cells = Array.isArray(row) ? row : row.cells;
        const attributes = Array.isArray(row) ? "" : Object.entries(row.attributes || {})
          .map(([name, value]) => `${escapeHtml(name)}="${escapeHtml(String(value))}"`)
          .join(" ");
        return `<tr ${attributes}>${cells.map((cell) => `<td>${cell}</td>`).join("")}</tr>`;
      }).join("")}</tbody>
    </table>
  `;
  applyInventoryTableControls(container);
}

let activeGearFilter = { field: "all", query: "" };
const inventorySortState = {};
let gearFilterSuggestionsOpen = false;

function activeInventoryTable() {
  return document.querySelector(`[data-gear-panel="${activeGearTab}"] .inventory-table`);
}

function inventoryHeaderLabels(container) {
  return [...container.querySelectorAll("thead th")].map((header) => header.textContent.replace(/[↑↓]/g, "").trim());
}

function syncGearFilterFields() {
  const container = activeInventoryTable();
  if (!container || !els.gearFilterField) return;
  const headers = inventoryHeaderLabels(container).filter((label) => label && label !== "Photo");
  if (!headers.includes(activeGearFilter.field)) activeGearFilter.field = "all";
  els.gearFilterField.innerHTML = `<option value="all">All fields</option>${headers.map((label) => `<option value="${escapeHtml(label)}">${escapeHtml(label)}</option>`).join("")}`;
  els.gearFilterField.value = activeGearFilter.field;
  if (els.gearFilterQuery) els.gearFilterQuery.value = activeGearFilter.query;
  syncGearFilterSuggestions();
}

function syncGearFilterSuggestions() {
  const container = activeInventoryTable();
  if (!container || !els.gearFilterSuggestions) return;
  const headers = inventoryHeaderLabels(container);
  const fieldIndex = activeGearFilter.field === "all" ? -1 : headers.indexOf(activeGearFilter.field);
  const query = activeGearFilter.query.trim().toLocaleLowerCase();
  const values = [...new Set([...container.querySelectorAll("tbody tr")].flatMap((row) => {
    const cells = [...row.cells].map((cell) => cell.textContent.trim());
    return fieldIndex >= 0 ? [cells[fieldIndex]] : cells;
  }).filter((value) => value && value !== "-" && value.toLocaleLowerCase().includes(query)))].sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" })).slice(0, 100);
  els.gearFilterSuggestions.innerHTML = values.map((value) => `<button type="button" role="option" data-gear-filter-suggestion="${escapeHtml(value)}">${escapeHtml(value)}</button>`).join("");
  els.gearFilterSuggestions.classList.toggle("hidden", !gearFilterSuggestionsOpen || !values.length);
}

function openGearFilterSuggestions() {
  gearFilterSuggestionsOpen = true;
  syncGearFilterSuggestions();
}

function closeGearFilterSuggestions() {
  gearFilterSuggestionsOpen = false;
  syncGearFilterSuggestions();
}

function selectGearFilterSuggestion(value) {
  if (els.gearFilterQuery) els.gearFilterQuery.value = value;
  activeGearFilter = { field: els.gearFilterField?.value || "all", query: value };
  closeGearFilterSuggestions();
  applyInventoryTableControls();
}

function applyInventoryTableControls(container = activeInventoryTable()) {
  if (!container) return;
  const headers = inventoryHeaderLabels(container);
  const filterIndex = activeGearFilter.field === "all" ? -1 : headers.indexOf(activeGearFilter.field);
  const query = activeGearFilter.query.trim().toLocaleLowerCase();
  const rows = [...container.querySelectorAll("tbody tr")];
  rows.forEach((row) => {
    const cells = [...row.cells].map((cell) => cell.textContent.trim().toLocaleLowerCase());
    const haystack = filterIndex >= 0 ? cells[filterIndex] || "" : cells.join(" ");
    row.hidden = Boolean(query) && !haystack.includes(query);
  });
  const sortState = inventorySortState[container.id];
  if (!sortState) return;
  rows.sort((left, right) => {
    const leftValue = left.cells[sortState.index]?.textContent.trim() || "";
    const rightValue = right.cells[sortState.index]?.textContent.trim() || "";
    const numericLeftText = leftValue.replace(/[^0-9.-]/g, "");
    const numericRightText = rightValue.replace(/[^0-9.-]/g, "");
    const numericLeft = Number(numericLeftText);
    const numericRight = Number(numericRightText);
    const compared = numericLeftText !== "" && numericRightText !== "" && Number.isFinite(numericLeft) && Number.isFinite(numericRight)
      ? numericLeft - numericRight
      : leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: "base" });
    return sortState.direction === "asc" ? compared : -compared;
  });
  const body = container.querySelector("tbody");
  rows.forEach((row) => body.append(row));
}

function updateGearFilter() {
  activeGearFilter = {
    field: els.gearFilterField?.value || "all",
    query: els.gearFilterQuery?.value || ""
  };
  gearFilterSuggestionsOpen = true;
  syncGearFilterSuggestions();
  applyInventoryTableControls();
}

function clearGearFilter() {
  activeGearFilter = { field: "all", query: "" };
  gearFilterSuggestionsOpen = false;
  syncGearFilterFields();
  syncGearFilterSuggestions();
  applyInventoryTableControls();
}

function sortInventoryTable(tableId, index) {
  const previous = inventorySortState[tableId];
  if (previous?.index === Number(index) && previous.direction === "desc") {
    delete inventorySortState[tableId];
    renderGearLibrary();
    return;
  }
  inventorySortState[tableId] = {
    index: Number(index),
    direction: previous?.index === Number(index) && previous.direction === "asc" ? "desc" : "asc"
  };
  const container = document.querySelector(`#${tableId}`);
  renderGearLibrary();
  applyInventoryTableControls(container);
}

function inventoryRow(type, item, cells) {
  return {
    attributes: { "data-inventory-type": type, "data-inventory-id": item.id },
    cells
  };
}

function gearUsageCells(type, id) {
  const stats = gearPerformanceStats(type, id);
  return [
    escapeHtml(String(stats.landed || 0)),
    stats.lastUsed ? escapeHtml(formatDate(stats.lastUsed)) : "-"
  ];
}

function inventoryThumb(item) {
  const photos = gearPhotos(item);
  if (!photos.length) return "";
  return mediaMarkup(photos[0], "inventory-thumb", { download: false });
}

function openInventoryItemInfo(type, id) {
  if (type === "lure") return openLureInfoDialog(state.lures.find((item) => item.id === id), "inventory");
  if (type === "flasher") return openFlasherInfoDialog(state.flashers.find((item) => item.id === id), "inventory");

  const collection = type === "reel" ? state.reels : type === "rod" ? state.rods : state.rodReelCombos;
  const item = collection.find((entry) => entry.id === id);
  if (!item) return;
  const label = type === "reel" ? "Reel" : type === "rod" ? "Rod" : "Combo";
  const details = type === "reel"
    ? [["Spooled line", lineSummary(activeLineEntry(item))], ["Style", item.style], ["Brand", item.brand], ["Model", item.name], ["Size", item.size], ["Gear ratio", item.gearRatio]]
    : type === "rod"
      ? [["Type", item.type], ["Brand", item.brand], ["Model", item.name], ["Length", item.length], ["Power", item.power], ["Action", item.action]]
      : [["Rod", rodName(item.rodId)], ["Reel", reelName(item.reelId)]];
  const stats = gearPerformanceStats(type, id);
  details.push(["Fish caught", stats.landed], ["Last used", stats.lastUsed ? formatDate(stats.lastUsed) : "-"]);
  els.inventoryInfoTitle.textContent = gearDisplayName(item, label);
  els.inventoryInfoContent.innerHTML = `
    ${gearPhotos(item).length ? `<div class="lure-info-media">${mediaMarkup(gearPhotos(item)[0], "", { download: false })}</div>` : ""}
    <dl class="lure-info-list">${details.filter(([, value]) => value !== "" && value !== null && value !== undefined).map(([name, value]) => `<div><dt>${escapeHtml(name)}</dt><dd>${escapeHtml(String(value))}</dd></div>`).join("")}</dl>
    ${item.notes ? `<div class="lure-info-notes"><strong>Notes</strong><p>${escapeHtml(item.notes)}</p></div>` : ""}
  `;
  els.inventoryInfoDialog.showModal();
}

function renderReelInventory() {
  const rows = state.reels.map((reel) => {
    return inventoryRow("reel", reel, [
      inventoryThumb(reel),
      escapeHtml(gearDisplayName(reel, "Reel")),
      ...gearUsageCells("reel", reel.id),
      escapeHtml(lineSummary(activeLineEntry(reel)) || "-"),
      escapeHtml(reel.style || "-"),
      escapeHtml(reel.brand || "-"),
      escapeHtml(reel.name || "-"),
      escapeHtml(reel.size || "-"),
      escapeHtml(reel.weight || "-"),
      escapeHtml(reel.gearRatio || "-"),
      escapeHtml(reel.retrieveRate || "-"),
      escapeHtml(displayStoredMeasurement(reel.maxDrag, "fishWeight") || "-"),
      escapeHtml(reel.monoCapacity || "-"),
      escapeHtml(reel.braidCapacity || "-"),
      escapeHtml(reel.purchaseAmount || "-"),
      escapeHtml(reel.dateBought || "-"),
      escapeHtml(reel.quantityAvailable === "" || reel.quantityAvailable === null || reel.quantityAvailable === undefined ? "-" : reel.quantityAvailable),
      `<div class="inventory-actions"><button class="button secondary inventory-edit-action" type="button" data-edit-reel="${escapeHtml(reel.id)}">Edit</button><button class="button secondary" type="button" data-duplicate-reel="${escapeHtml(reel.id)}">Duplicate</button></div>`
    ]);
  });
  renderInventoryTable(els.reelInventoryTable, ["Photo", "Name", "Fish caught", "Last used", "Spooled Line", "Style", "Brand", "Model", "Size", "Weight", "Gear", "Retrieve", `Max Drag (${unitSymbol("fishWeight")})`, "Mono Cap", "Braid Cap", "Purchase", "Bought", "Owned", ""], rows, "No saved reels yet.");
}

function renderRodInventory() {
  const rows = state.rods.map((rod) => {
    return inventoryRow("rod", rod, [
      inventoryThumb(rod),
      escapeHtml(gearDisplayName(rod, "Rod")),
      ...gearUsageCells("rod", rod.id),
      escapeHtml(rod.type || "-"),
      escapeHtml(rod.brand || "-"),
      escapeHtml(rod.name || "-"),
      escapeHtml(rod.length || "-"),
      escapeHtml(rod.power || "-"),
      escapeHtml(rod.action || "-"),
      escapeHtml(rod.lureRating || "-"),
      escapeHtml(rod.purchaseAmount || "-"),
      escapeHtml(rod.dateBought || "-"),
      escapeHtml(rod.quantityAvailable === "" || rod.quantityAvailable === null || rod.quantityAvailable === undefined ? "-" : rod.quantityAvailable),
      `<div class="inventory-actions"><button class="button secondary inventory-edit-action" type="button" data-edit-rod="${escapeHtml(rod.id)}">Edit</button><button class="button secondary" type="button" data-duplicate-rod="${escapeHtml(rod.id)}">Duplicate</button></div>`
    ]);
  });
  renderInventoryTable(els.rodInventoryTable, ["Photo", "Name", "Fish caught", "Last used", "Type", "Brand", "Model", "Length", "Power", "Action", "Lure Rating", "Purchase", "Bought", "Owned", ""], rows, "No saved rods yet.");
}

function renderComboInventory() {
  const rows = state.rodReelCombos.map((combo) => {
    return inventoryRow("combo", combo, [
      escapeHtml(comboName(combo.id) || "Combo"),
      ...gearUsageCells("combo", combo.id),
      escapeHtml(rodName(combo.rodId) || "-"),
      escapeHtml(reelName(combo.reelId) || "-"),
      escapeHtml(combo.notes || ""),
      `<button class="button secondary inventory-edit-action" type="button" data-edit-combo="${escapeHtml(combo.id)}">Edit</button>`
    ]);
  });
  renderInventoryTable(els.comboInventoryTable, ["Combo", "Fish caught", "Last used", "Rod", "Reel", "Notes", ""], rows, "No saved combos yet.");
}

function renderLineTracker() {
  const rows = state.reels.map((reel) => {
    const line = activeLineEntry(reel);
    if (!line) return null;
    return [
      escapeHtml(gearDisplayName(reel, "Reel")),
      escapeHtml(line.spooledDate || "-"),
      escapeHtml(line.type || "-"),
      escapeHtml(line.brand || "-"),
      escapeHtml(line.name || "-"),
      escapeHtml(displayStoredMeasurement(line.weight, "fishWeight") || "-"),
      escapeHtml(line.diameterIn || "-"),
      escapeHtml(line.diameterMm || "-"),
      escapeHtml(line.color || "-"),
      line.monoBacking ? "Yes" : "No",
      escapeHtml(line.notes || "")
    ];
  }).filter(Boolean);
  renderInventoryTable(els.lineTrackerTable, ["Reel", "Spooled", "Type", "Brand", "Name", `Weight (${unitSymbol("fishWeight")})`, "Dia In", "Dia Mm", "Color", "Backing", "Notes"], rows, "No current line saved yet. Edit a reel to add current line.");
}

function renderBaitInventory() {
  const rows = state.lures.map((lure) => {
    return inventoryRow("lure", lure, [
      inventoryThumb(lure),
      `<button class="inventory-gear-preview-link" type="button" data-inventory-lure-id="${escapeHtml(lure.id)}" aria-label="Open preview for ${escapeHtml(lure.name || "lure")}">${escapeHtml(lure.name || "-")}</button>`,
      ...gearUsageCells("lure", lure.id),
      escapeHtml(lure.type || "-"),
      escapeHtml(lure.brand || "-"),
      escapeHtml(lure.model || "-"),
      escapeHtml(lure.color || "-"),
      escapeHtml(lure.quantityAvailable === "" || lure.quantityAvailable === null || lure.quantityAvailable === undefined ? "-" : lure.quantityAvailable),
      `<button class="button secondary inventory-edit-action" type="button" data-edit-lure="${escapeHtml(lure.id)}">Edit</button>`
    ]);
  });
  renderInventoryTable(els.baitInventoryTable, ["Photo", "Lure", "Fish caught", "Last used", "Type", "Brand", "Model", "Color", "Owned", ""], rows, "No saved lures yet.");
}

function renderFlasherInventory() {
  const rows = state.flashers.map((flasher) => {
    return inventoryRow("flasher", flasher, [
      inventoryThumb(flasher),
      escapeHtml(flasher.name || "-"),
      ...gearUsageCells("flasher", flasher.id),
      escapeHtml(flasher.type || "-"),
      escapeHtml(flasher.brand || "-"),
      escapeHtml(flasher.model || "-"),
      escapeHtml(flasher.color || "-"),
      `<button class="button secondary inventory-edit-action" type="button" data-edit-flasher="${escapeHtml(flasher.id)}">Edit</button>`
    ]);
  });
  renderInventoryTable(els.flasherInventoryTable, ["Photo", "Flasher", "Fish caught", "Last used", "Type", "Brand", "Model", "Color", ""], rows, "No saved flashers yet.");
}

function setGearTab(tab) {
  activeGearTab = tab;
  const showingTackleBoxes = tab === "tackle-boxes";
  document.querySelectorAll("[data-gear-tab]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.gearTab === tab);
  });
  document.querySelectorAll("[data-gear-panel]").forEach((panel) => {
    panel.classList.toggle("hidden", panel.dataset.gearPanel !== tab);
  });
  document.querySelectorAll(".gear-standard-action").forEach((button) => {
    button.classList.toggle("hidden", showingTackleBoxes);
  });
  document.querySelector("#newTackleBoxButton")?.classList.toggle("hidden", !showingTackleBoxes);
  const controls = document.querySelector(".gear-inventory-controls");
  const activePanel = document.querySelector(`[data-gear-panel="${tab}"]`);
  if (controls && activePanel && !showingTackleBoxes) activePanel.querySelector(".gear-header")?.append(controls);
  controls?.classList.toggle("hidden", showingTackleBoxes);
  syncGearFilterFields();
  applyInventoryTableControls();
  if (showingTackleBoxes && typeof renderTackleBoxes === "function") renderTackleBoxes();
}

function renderGearLibrary() {
  renderReelInventory();
  renderRodInventory();
  renderComboInventory();
  renderLineTracker();
  renderBaitInventory();
  renderFlasherInventory();
  if (typeof renderTackleBoxes === "function") renderTackleBoxes();
  setGearTab(activeGearTab);
}
