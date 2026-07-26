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
  const image = lure.image ? mediaMarkup(lure) : "";
  const details = [lure.type, lure.brand, lure.color].filter(Boolean).join(" / ");
  preview.innerHTML = `
    <div class="lure-preview-card">
      ${image}
      <div>
        <strong>${escapeHtml(lure.name)}</strong>
        <span>${escapeHtml(details || "Saved lure")}</span>
      </div>
    </div>
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
  const image = flasher.image ? mediaMarkup(flasher) : "";
  const details = [flasher.type, flasher.brand, flasher.color].filter(Boolean).join(" / ");
  preview.innerHTML = `
    <div class="flasher-preview-card">
      ${image}
      <div>
        <strong>${escapeHtml(flasher.name)}</strong>
        <span>${escapeHtml(details || "Saved flasher")}</span>
      </div>
    </div>
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

function renderLureTypeOptions(select) {
  select.dataset.lurePickerMode = "types";
  select.dataset.lurePickerType = "";
  select.innerHTML = `<option value="">Select lure</option>` + savedLureTypes().map((type) => (
    `<option value="${escapeHtml(lureTypeOptionValue(type))}">${escapeHtml(type)}</option>`
  )).join("");
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
}

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
    ["Brand / model", lure.brand],
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
    ${lure.image ? `<div class="lure-info-media">${mediaMarkup(lure)}</div>` : ""}
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
  populateOptionSelect(document.querySelector("#flasherType"), state.flasherTypes, "Select flasher type");
  const editing = Boolean(flasher);
  document.querySelector("#flasherDialog h2").textContent = editing ? "Edit Flasher" : "Add Flasher";
  setValue("pendingFlasherCatchRow", pendingRowId);
  setValue("editingFlasherId", flasher?.id || "");
  setValue("flasherName", flasher?.name || "");
  setValue("flasherType", flasher?.type || "");
  setValue("flasherBrand", flasher?.brand || "");
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
    ["Brand / model", flasher.brand],
    ["Color", flasher.color],
    ["Glow", flasher.glow ? "Yes" : "No"],
    ["Fish lost", stats.lost],
    ["Trips used", stats.trips],
    ["Last used", stats.lastUsed]
  ].filter(([, value]) => value !== "" && value !== null && value !== undefined);
  document.querySelector("#flasherInfoTitle").textContent = flasher.name || "Flasher";
  els.flasherInfoDialog.dataset.flasherId = flasher.id;
  els.flasherInfoContent.innerHTML = `
    ${flasher.image ? `<div class="lure-info-media">${mediaMarkup(flasher)}</div>` : ""}
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
  container.innerHTML = `
    <table>
      <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
      <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody>
    </table>
  `;
}

function inventoryThumb(item) {
  const photos = gearPhotos(item);
  if (!photos.length) return `<span class="inventory-thumb-placeholder">No image</span>`;
  return mediaMarkup(photos[0], "inventory-thumb");
}

function renderReelInventory() {
  const rows = state.reels.map((reel) => {
    return [
      inventoryThumb(reel),
      escapeHtml(gearDisplayName(reel, "Reel")),
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
      `<div class="inventory-actions"><button class="button secondary" type="button" data-edit-reel="${escapeHtml(reel.id)}">Edit</button><button class="button secondary" type="button" data-duplicate-reel="${escapeHtml(reel.id)}">Duplicate</button></div>`
    ];
  });
  renderInventoryTable(els.reelInventoryTable, ["Photo", "Name", "Spooled Line", "Style", "Brand", "Model", "Size", "Weight", "Gear", "Retrieve", `Max Drag (${unitSymbol("fishWeight")})`, "Mono Cap", "Braid Cap", "Purchase", "Bought", "Owned", ""], rows, "No saved reels yet.");
}

function renderRodInventory() {
  const rows = state.rods.map((rod) => {
    return [
      inventoryThumb(rod),
      escapeHtml(gearDisplayName(rod, "Rod")),
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
      `<div class="inventory-actions"><button class="button secondary" type="button" data-edit-rod="${escapeHtml(rod.id)}">Edit</button><button class="button secondary" type="button" data-duplicate-rod="${escapeHtml(rod.id)}">Duplicate</button></div>`
    ];
  });
  renderInventoryTable(els.rodInventoryTable, ["Photo", "Name", "Type", "Brand", "Model", "Length", "Power", "Action", "Lure Rating", "Purchase", "Bought", "Owned", ""], rows, "No saved rods yet.");
}

function renderComboInventory() {
  const rows = state.rodReelCombos.map((combo) => {
    return [
      escapeHtml(comboName(combo.id) || "Combo"),
      escapeHtml(rodName(combo.rodId) || "-"),
      escapeHtml(reelName(combo.reelId) || "-"),
      escapeHtml(combo.notes || ""),
      `<button class="button secondary" type="button" data-edit-combo="${escapeHtml(combo.id)}">Edit</button>`
    ];
  });
  renderInventoryTable(els.comboInventoryTable, ["Combo", "Rod", "Reel", "Notes", ""], rows, "No saved combos yet.");
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
    const stats = baitStats("lure", lure.id);
    return [
      inventoryThumb(lure),
      escapeHtml(lure.name || "-"),
      escapeHtml(lure.type || "-"),
      escapeHtml(lure.brand || "-"),
      escapeHtml(lure.color || "-"),
      escapeHtml(lure.quantityAvailable === "" || lure.quantityAvailable === null || lure.quantityAvailable === undefined ? "-" : lure.quantityAvailable),
      stats.lost,
      stats.trips,
      escapeHtml(stats.lastUsed || "-"),
      `<button class="button secondary" type="button" data-edit-lure="${escapeHtml(lure.id)}">Edit</button>`
    ];
  });
  renderInventoryTable(els.baitInventoryTable, ["Photo", "Lure", "Type", "Brand", "Color", "Owned", "Lost", "Trips", "Last Used", ""], rows, "No saved lures yet.");
}

function renderFlasherInventory() {
  const rows = state.flashers.map((flasher) => {
    const stats = baitStats("flasher", flasher.id);
    return [
      inventoryThumb(flasher),
      escapeHtml(flasher.name || "-"),
      escapeHtml(flasher.type || "-"),
      escapeHtml(flasher.brand || "-"),
      escapeHtml(flasher.color || "-"),
      stats.lost,
      stats.trips,
      escapeHtml(stats.lastUsed || "-"),
      `<button class="button secondary" type="button" data-edit-flasher="${escapeHtml(flasher.id)}">Edit</button>`
    ];
  });
  renderInventoryTable(els.flasherInventoryTable, ["Photo", "Flasher", "Type", "Brand", "Color", "Lost", "Trips", "Last Used", ""], rows, "No saved flashers yet.");
}

function setGearTab(tab) {
  activeGearTab = tab;
  document.querySelectorAll("[data-gear-tab]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.gearTab === tab);
  });
  document.querySelectorAll("[data-gear-panel]").forEach((panel) => {
    panel.classList.toggle("hidden", panel.dataset.gearPanel !== tab);
  });
}

function renderGearLibrary() {
  renderReelInventory();
  renderRodInventory();
  renderComboInventory();
  renderLineTracker();
  renderBaitInventory();
  renderFlasherInventory();
  setGearTab(activeGearTab);
}
