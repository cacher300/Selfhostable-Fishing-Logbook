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
  els.reelDialog.dataset.removedPhotoKeys = "[]";
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
  els.rodDialog.dataset.removedPhotoKeys = "[]";
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
  els.lureDialog.dataset.removedPhotoKeys = "[]";
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
  setValue("lureWeight", lure?.weight || "");
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
    ["Lure weight", lure.weight],
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
  els.flasherDialog.dataset.removedPhotoKeys = "[]";
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
      ...gearPhotoFields(uploadedPhotos, existing, "reel")
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
      ...gearPhotoFields(uploadedPhotos, existing, "rod")
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
      weight: getValue("lureWeight"),
      quantityAvailable: getValue("lureQuantityAvailable"),
      glow: document.querySelector("#lureGlow").checked,
      notes: getValue("lureNotes"),
      ...gearPhotoFields(uploadedImage ? [uploadedImage] : [], existing, "lure")
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
      ...gearPhotoFields(uploadedImage ? [uploadedImage] : [], existing, "flasher")
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

