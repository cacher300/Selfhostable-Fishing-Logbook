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
    [line.type, line.weight ? `${line.weight} lb` : ""].filter(Boolean).join(" "),
    [line.brand, line.name].filter(Boolean).join(" "),
    line.color
  ].filter(Boolean).join(" / ");
}

function gearCatchCounts(predicate) {
  let landed = 0;
  let lost = 0;
  state.trips.forEach((trip) => {
    (trip.catches || []).forEach((catchItem) => {
      const line = setupLineForRecord({ ...catchItem, trip });
      if (line && predicate(line)) landed += fishCount(catchItem);
    });
    (trip.lostFish || []).forEach((fish) => {
      const line = setupLineForRecord({ ...fish, trip });
      if (line && predicate(line)) lost += 1;
    });
  });
  return { landed, lost };
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
    ${mediaMarkup(pending, "", { download: type !== "lure" })}
    <span>${escapeHtml(isVideoMedia(pending) ? "Queued video selected" : "Queued photo selected")}</span>
  ` : "";
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

function lineRowMarkup(line = {}) {
  const id = line.id || createId();
  return `
    <article class="line-editor-row" data-line-id="${escapeHtml(id)}">
      <label><span>Spooled date</span><input class="line-spooled-date" type="date" value="${escapeHtml(line.spooledDate || "")}" /></label>
      <label><span>Type</span><select class="line-type">${optionLabels("lineTypes").map((type) => `<option value="${escapeHtml(type)}" ${type === line.type ? "selected" : ""}>${escapeHtml(type)}</option>`).join("")}</select></label>
      <label><span>Brand</span><input class="line-brand" type="text" value="${escapeHtml(line.brand || "")}" placeholder="Berkley" /></label>
      <label><span>Name</span><input class="line-name" type="text" value="${escapeHtml(line.name || "")}" placeholder="X5" /></label>
      <label><span>Weight</span><input class="line-weight" type="text" value="${escapeHtml(line.weight || "")}" placeholder="30" /></label>
      <label><span>Diameter in</span><input class="line-diameter-in" type="text" value="${escapeHtml(line.diameterIn || "")}" placeholder="0.008" /></label>
      <label><span>Diameter mm</span><input class="line-diameter-mm" type="text" value="${escapeHtml(line.diameterMm || "")}" placeholder="0.20" /></label>
      <label><span>Color</span><input class="line-color" type="text" value="${escapeHtml(line.color || "")}" placeholder="Lo-Vis" /></label>
      <label class="checkbox-label"><input class="line-mono-backing" type="checkbox" ${line.monoBacking ? "checked" : ""} /><span>Mono backing</span></label>
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

function openReelDialog(reel = null) {
  els.reelForm.reset();
  pendingReelImage = null;
  renderQueuedGearImage("reel");
  populateOptionSelect(document.querySelector("#reelStyle"), optionLabels("reelStyles"), "Select style");
  const editing = Boolean(reel);
  document.querySelector("#reelDialog h2").textContent = editing ? "Edit Reel" : "Add Reel";
  setValue("editingReelId", reel?.id || "");
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
  setValue("reelNotes", reel?.notes || "");
  renderLineRows(reel?.lineHistory || []);
  els.deleteReelButton.classList.toggle("hidden", !editing);
  els.reelDialog.showModal();
}

function openRodDialog(rod = null) {
  els.rodForm.reset();
  pendingRodImage = null;
  renderQueuedGearImage("rod");
  populateOptionSelect(document.querySelector("#rodType"), optionLabels("rodTypes"), "Select type");
  const editing = Boolean(rod);
  document.querySelector("#rodDialog h2").textContent = editing ? "Edit Rod" : "Add Rod";
  setValue("editingRodId", rod?.id || "");
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
    ["Glow", lure.glow ? "Yes" : "No"],
    ["Fish caught", stats.landed],
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
    ["Fish caught", stats.landed],
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
    const existing = state.reels.find((item) => item.id === editingId);
    const imageFile = document.querySelector("#reelImage").files[0];
    const uploadedImage = imageFile ? await uploadImageFile(imageFile, "reels") : pendingReelImage;
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
      notes: getValue("reelNotes"),
      lineHistory: collectLineRows(),
      ...imageFields(uploadedImage, existing)
    };
    const index = state.reels.findIndex((item) => item.id === reel.id);
    if (index >= 0) state.reels[index] = reel;
    else state.reels.push(reel);
    upsertListValue("reelStyles", reel.style);
    reel.lineHistory.forEach((line) => upsertListValue("lineTypes", line.type));
    await saveState();
    els.reelDialog.close();
    els.reelForm.reset();
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
    const existing = state.rods.find((item) => item.id === editingId);
    const imageFile = document.querySelector("#rodImage").files[0];
    const uploadedImage = imageFile ? await uploadImageFile(imageFile, "rods") : pendingRodImage;
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
      notes: getValue("rodNotes"),
      ...imageFields(uploadedImage, existing)
    };
    const index = state.rods.findIndex((item) => item.id === rod.id);
    if (index >= 0) state.rods[index] = rod;
    else state.rods.push(rod);
    upsertListValue("rodTypes", rod.type);
    await saveState();
    els.rodDialog.close();
    els.rodForm.reset();
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
  return item?.image ? mediaMarkup(item, "inventory-thumb") : `<span class="inventory-thumb-placeholder">No image</span>`;
}

function renderReelInventory() {
  const rows = state.reels.map((reel) => {
    const counts = gearCatchCounts((line) => line.reelId === reel.id);
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
      escapeHtml(reel.maxDrag || "-"),
      escapeHtml(reel.monoCapacity || "-"),
      escapeHtml(reel.braidCapacity || "-"),
      escapeHtml(reel.purchaseAmount || "-"),
      escapeHtml(reel.dateBought || "-"),
      `${counts.landed}${counts.lost ? ` / ${counts.lost} lost` : ""}`,
      `<button class="button secondary" type="button" data-edit-reel="${escapeHtml(reel.id)}">Edit</button>`
    ];
  });
  renderInventoryTable(els.reelInventoryTable, ["Photo", "Name", "Spooled Line", "Style", "Brand", "Model", "Size", "Weight", "Gear", "Retrieve", "Max Drag", "Mono Cap", "Braid Cap", "Purchase", "Bought", "Fish", ""], rows, "No saved reels yet.");
}

function renderRodInventory() {
  const rows = state.rods.map((rod) => {
    const counts = gearCatchCounts((line) => line.rodId === rod.id);
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
      `${counts.landed}${counts.lost ? ` / ${counts.lost} lost` : ""}`,
      `<button class="button secondary" type="button" data-edit-rod="${escapeHtml(rod.id)}">Edit</button>`
    ];
  });
  renderInventoryTable(els.rodInventoryTable, ["Photo", "Name", "Type", "Brand", "Model", "Length", "Power", "Action", "Lure Rating", "Purchase", "Bought", "Fish", ""], rows, "No saved rods yet.");
}

function renderComboInventory() {
  const rows = state.rodReelCombos.map((combo) => {
    const counts = gearCatchCounts((line) => line.comboId === combo.id || (line.rodId === combo.rodId && line.reelId === combo.reelId));
    return [
      escapeHtml(comboName(combo.id) || "Combo"),
      escapeHtml(rodName(combo.rodId) || "-"),
      escapeHtml(reelName(combo.reelId) || "-"),
      escapeHtml(combo.notes || ""),
      `${counts.landed}${counts.lost ? ` / ${counts.lost} lost` : ""}`,
      `<button class="button secondary" type="button" data-edit-combo="${escapeHtml(combo.id)}">Edit</button>`
    ];
  });
  renderInventoryTable(els.comboInventoryTable, ["Combo", "Rod", "Reel", "Notes", "Fish", ""], rows, "No saved combos yet.");
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
      escapeHtml(line.weight || "-"),
      escapeHtml(line.diameterIn || "-"),
      escapeHtml(line.diameterMm || "-"),
      escapeHtml(line.color || "-"),
      line.monoBacking ? "Yes" : "No",
      escapeHtml(line.notes || "")
    ];
  }).filter(Boolean);
  renderInventoryTable(els.lineTrackerTable, ["Reel", "Spooled", "Type", "Brand", "Name", "Lb", "Dia In", "Dia Mm", "Color", "Backing", "Notes"], rows, "No current line saved yet. Edit a reel to add current line.");
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
      stats.landed,
      stats.lost,
      stats.trips,
      escapeHtml(stats.lastUsed || "-"),
      `<button class="button secondary" type="button" data-edit-lure="${escapeHtml(lure.id)}">Edit</button>`
    ];
  });
  renderInventoryTable(els.baitInventoryTable, ["Photo", "Lure", "Type", "Brand", "Color", "Fish", "Lost", "Trips", "Last Used", ""], rows, "No saved lures yet.");
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
      stats.landed,
      stats.lost,
      stats.trips,
      escapeHtml(stats.lastUsed || "-"),
      `<button class="button secondary" type="button" data-edit-flasher="${escapeHtml(flasher.id)}">Edit</button>`
    ];
  });
  renderInventoryTable(els.flasherInventoryTable, ["Photo", "Flasher", "Type", "Brand", "Color", "Fish", "Lost", "Trips", "Last Used", ""], rows, "No saved flashers yet.");
}

function renderGearGrid(container, items, type) {
  if (!container) return;
  if (!items.length) {
    container.innerHTML = "";
    return;
  }
  container.innerHTML = items.map((item) => {
    const image = item.image ? mediaMarkup(item) : `<div class="gear-image-placeholder">No Image</div>`;
    const details = [item.type, item.brand, item.color].filter(Boolean).join(" / ");
    const editAttr = type === "lure" ? "data-edit-lure" : "data-edit-flasher";
    const deleteAttr = type === "lure" ? "data-delete-lure" : "data-delete-flasher";
    return `
      <article class="gear-card">
        ${image}
        <div class="gear-card-body">
          <h4>${escapeHtml(item.name)}</h4>
          <p>${escapeHtml(details || "No details")}</p>
          <p>${escapeHtml(item.notes || "")}</p>
          <div class="gear-card-actions">
            <button class="button secondary" type="button" ${editAttr}="${escapeHtml(item.id)}">Edit</button>
            <button class="button danger" type="button" ${deleteAttr}="${escapeHtml(item.id)}">Delete</button>
          </div>
        </div>
      </article>
    `;
  }).join("");
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
  renderGearGrid(els.lureLibraryGrid, state.lures, "lure");
  renderGearGrid(els.flasherLibraryGrid, state.flashers, "flasher");
  setGearTab(activeGearTab);
}
