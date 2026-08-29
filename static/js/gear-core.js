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

function gearPhotoKey(photo, index = 0) {
  return String(photo?.imagePath || photo?.imageFilename || photo?.image || `photo-${index}`);
}

function gearDialogForType(type) {
  return { lure: els.lureDialog, flasher: els.flasherDialog, reel: els.reelDialog, rod: els.rodDialog }[type];
}

function removedGearPhotoKeys(type) {
  try { return new Set(JSON.parse(gearDialogForType(type)?.dataset.removedPhotoKeys || "[]")); } catch { return new Set(); }
}

function gearPhotoFields(uploadedPhotos = [], existing = {}, type = "") {
  const removed = removedGearPhotoKeys(type);
  const photos = [...gearPhotos(existing).filter((photo, index) => !removed.has(gearPhotoKey(photo, index))), ...uploadedPhotos].filter((photo) => photo?.image);
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
  const reel = state.reels.find((item) => item.id === id);
  return reel?.shortName || gearDisplayName(reel, "");
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
  const removed = removedGearPhotoKeys(type);
  const photos = gearPhotos(item).filter((photo, index) => !removed.has(gearPhotoKey(photo, index)));
  container.classList.toggle("hidden", !photos.length && !localPhotos.length);
  container.innerHTML = `
    ${photos.length ? `
      <div class="gear-editor-photos-heading">Current ${photos.length === 1 ? "photo" : "photos"}</div>
      <div class="gear-editor-photo-grid">
        ${photos.map((photo, index) => `<div class="gear-editor-photo">${mediaMarkup(photo, "", { download: false })}<button class="icon-button gear-editor-photo-remove" type="button" data-remove-gear-photo="${escapeHtml(gearPhotoKey(photo, index))}" data-gear-photo-type="${escapeHtml(type)}" aria-label="Remove photo">×</button></div>`).join("")}
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

function removeExistingGearPhoto(type, key) {
  const dialog = gearDialogForType(type);
  if (!dialog) return;
  const keys = removedGearPhotoKeys(type);
  keys.add(key);
  dialog.dataset.removedPhotoKeys = JSON.stringify([...keys]);
  const input = document.querySelector({ lure: "#lureImage", flasher: "#flasherImage", reel: "#reelImage", rod: "#rodImage" }[type]);
  previewSelectedGearUploads(type, input);
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

