async function saveLure(event) {
  event.preventDefault();
  try {
    const editingId = getValue("editingLureId");
    const existing = state.lures.find((item) => item.id === editingId);
    const imageFile = document.querySelector("#lureImage").files[0];
    const uploadedImage = imageFile ? await uploadImageFile(imageFile, "lures") : null;
    const lure = {
      id: editingId || createId(),
      name: getValue("lureName"),
      type: getValue("lureType"),
      brand: getValue("lureBrand"),
      color: getValue("lureColor"),
    notes: getValue("lureNotes"),
    image: uploadedImage?.image || existing?.image || "",
    previewImage: uploadedImage?.previewImage || existing?.previewImage || uploadedImage?.image || existing?.image || "",
    imagePath: uploadedImage?.path || existing?.imagePath || "",
    imageFilename: uploadedImage?.filename || existing?.imageFilename || "",
    previewPath: uploadedImage?.previewPath || existing?.previewPath || "",
    previewFilename: uploadedImage?.previewFilename || existing?.previewFilename || ""
    };

    const lureIndex = state.lures.findIndex((item) => item.id === lure.id);
    if (lureIndex >= 0) state.lures[lureIndex] = lure;
    else state.lures.push(lure);
    upsertListValue("lureTypes", lure.type);
    await saveState();

    [...document.querySelectorAll(".catch-lure, .trip-gear-lure")].forEach((select) => populateLureSelect(select, select.value));
    const rowId = getValue("pendingCatchRow");
    const row = [...document.querySelectorAll(".catch-row, .gear-used-row")].find((item) => item.dataset.rowId === rowId);
    if (row) row.querySelector(".catch-lure, .trip-gear-lure").value = lure.id;
    if (row) renderLurePreview(row);
    if (row) updateRowSummary(row);

    els.lureDialog.close();
    els.lureForm.reset();
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
    const uploadedImage = imageFile ? await uploadImageFile(imageFile, "flashers") : null;
    const flasher = {
      id: editingId || createId(),
      name: getValue("flasherName"),
      type: getValue("flasherType"),
      brand: getValue("flasherBrand"),
      color: getValue("flasherColor"),
    notes: getValue("flasherNotes"),
    image: uploadedImage?.image || existing?.image || "",
    previewImage: uploadedImage?.previewImage || existing?.previewImage || uploadedImage?.image || existing?.image || "",
    imagePath: uploadedImage?.path || existing?.imagePath || "",
    imageFilename: uploadedImage?.filename || existing?.imageFilename || "",
    previewPath: uploadedImage?.previewPath || existing?.previewPath || "",
    previewFilename: uploadedImage?.previewFilename || existing?.previewFilename || ""
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
    renderAll();
  } catch (error) {
    console.error("Could not save flasher.", error);
    alert(error.message || "The flasher could not be saved.");
  }
}

function lureName(id) {
  if (!id) return "";
  return state.lures.find((lure) => lure.id === id)?.name || "";
}

function flasherName(id) {
  if (!id) return "";
  return state.flashers.find((flasher) => flasher.id === id)?.name || "";
}

function formatCoordinates(coordinates) {
  if (!coordinates) return "";
  return `${Number(coordinates.latitude).toFixed(5)}, ${Number(coordinates.longitude).toFixed(5)}`;
}

function renderLurePreview(row) {
  const preview = row.querySelector(".lure-preview");
  const lureId = row.querySelector(".catch-lure, .trip-gear-lure").value;
  const lure = state.lures.find((item) => item.id === lureId);

  if (!lure) {
    preview.innerHTML = "";
    return;
  }

  const image = lure.image ? `<img src="${previewImage(lure)}" alt="">` : "";
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
  const flasherId = row.querySelector(".catch-flasher, .trip-gear-flasher").value;
  const flasher = state.flashers.find((item) => item.id === flasherId);

  if (!flasher) {
    preview.innerHTML = "";
    return;
  }

  const image = flasher.image ? `<img src="${previewImage(flasher)}" alt="">` : "";
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

function prepareInlineGearDialog(type, pendingRowId) {
  returnToTripDialog[type] = Boolean(pendingRowId) && els.tripDialog.open;
  if (returnToTripDialog[type]) els.tripDialog.close();
}

function restoreTripDialogAfterInlineGear(type) {
  if (!returnToTripDialog[type]) return;
  returnToTripDialog[type] = false;
  setTimeout(() => {
    if (!els.tripDialog.open) els.tripDialog.showModal();
  }, 0);
}

function openLureDialog(lure = null, pendingRowId = "") {
  prepareInlineGearDialog("lure", pendingRowId);
  els.lureForm.reset();
  populateOptionSelect(document.querySelector("#lureType"), state.lureTypes, "Select lure type");
  const editing = Boolean(lure);
  document.querySelector("#lureDialog h2").textContent = editing ? "Edit Lure" : "Add Lure";
  setValue("pendingCatchRow", pendingRowId);
  setValue("editingLureId", lure?.id || "");
  setValue("lureName", lure?.name || "");
  setValue("lureType", lure?.type || "");
  setValue("lureBrand", lure?.brand || "");
  setValue("lureColor", lure?.color || "");
  setValue("lureNotes", lure?.notes || "");
  els.deleteLureButton.classList.toggle("hidden", !editing);
  els.lureDialog.showModal();
}

function openFlasherDialog(flasher = null, pendingRowId = "") {
  prepareInlineGearDialog("flasher", pendingRowId);
  els.flasherForm.reset();
  populateOptionSelect(document.querySelector("#flasherType"), state.flasherTypes, "Select flasher type");
  const editing = Boolean(flasher);
  document.querySelector("#flasherDialog h2").textContent = editing ? "Edit Flasher" : "Add Flasher";
  setValue("pendingFlasherCatchRow", pendingRowId);
  setValue("editingFlasherId", flasher?.id || "");
  setValue("flasherName", flasher?.name || "");
  setValue("flasherType", flasher?.type || "");
  setValue("flasherBrand", flasher?.brand || "");
  setValue("flasherColor", flasher?.color || "");
  setValue("flasherNotes", flasher?.notes || "");
  els.deleteFlasherButton.classList.toggle("hidden", !editing);
  els.flasherDialog.showModal();
}

async function deleteLure() {
  const lureId = getValue("editingLureId");
  const lure = state.lures.find((item) => item.id === lureId);
  if (!lure || !confirm(`Delete ${lure.name}? This removes it from saved lures and clears it from catches.`)) return;

  state.lures = state.lures.filter((item) => item.id !== lureId);
  state.trips.forEach((trip) => {
    (trip.gearUsed || []).forEach((gearItem) => {
      if (gearItem.lureId === lureId) gearItem.lureId = "";
    });
    (trip.catches || []).forEach((catchItem) => {
      if (catchItem.lureId === lureId) catchItem.lureId = "";
    });
    (trip.lostFish || []).forEach((fish) => {
      if (fish.lureId === lureId) fish.lureId = "";
    });
  });
  try {
    await saveState();
    els.lureDialog.close();
    renderAll();
  } catch (error) {
    console.error("Could not delete lure.", error);
    alert(error.message || "The lure could not be deleted.");
  }
}

async function deleteFlasher() {
  const flasherId = getValue("editingFlasherId");
  const flasher = state.flashers.find((item) => item.id === flasherId);
  if (!flasher || !confirm(`Delete ${flasher.name}? This removes it from saved flashers and clears it from catches.`)) return;

  state.flashers = state.flashers.filter((item) => item.id !== flasherId);
  state.trips.forEach((trip) => {
    (trip.gearUsed || []).forEach((gearItem) => {
      if (gearItem.flasherId === flasherId) gearItem.flasherId = "";
    });
    (trip.catches || []).forEach((catchItem) => {
      if (catchItem.flasherId === flasherId) catchItem.flasherId = "";
    });
    (trip.lostFish || []).forEach((fish) => {
      if (fish.flasherId === flasherId) fish.flasherId = "";
    });
  });
  try {
    await saveState();
    els.flasherDialog.close();
    renderAll();
  } catch (error) {
    console.error("Could not delete flasher.", error);
    alert(error.message || "The flasher could not be deleted.");
  }
}

function renderGearLibrary() {
  renderGearGrid(els.lureLibraryGrid, state.lures, "lure");
  renderGearGrid(els.flasherLibraryGrid, state.flashers, "flasher");
}

function renderGearGrid(container, items, type) {
  if (!items.length) {
    container.innerHTML = `<div class="empty-state"><p>No saved ${type === "lure" ? "lures" : "flashers"} yet.</p></div>`;
    return;
  }

  container.innerHTML = items.map((item) => {
    const image = item.image ? `<img src="${previewImage(item)}" alt="">` : `<div class="gear-image-placeholder">No Image</div>`;
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
            <button class="button secondary" type="button" ${editAttr}="${item.id}">Edit</button>
            <button class="button danger" type="button" ${deleteAttr}="${item.id}">Delete</button>
          </div>
        </div>
      </article>
    `;
  }).join("");
}
