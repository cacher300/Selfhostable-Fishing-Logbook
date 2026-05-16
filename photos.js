function getExifAscii(view, offset, count) {
  let value = "";
  for (let index = 0; index < count; index += 1) {
    const charCode = view.getUint8(offset + index);
    if (charCode) value += String.fromCharCode(charCode);
  }
  return value;
}

async function uploadImageFile(file, category, metadata = {}) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("metadata", JSON.stringify(metadata));
  const response = await fetch(`/api/uploads/${category}`, {
    method: "POST",
    body: formData
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Image upload failed");
  }
  const payload = await response.json();
  return {
    ...payload,
    image: payload.url,
    previewImage: payload.previewUrl || payload.url
  };
}

function getExifRational(view, offset, littleEndian) {
  const numerator = view.getUint32(offset, littleEndian);
  const denominator = view.getUint32(offset + 4, littleEndian);
  return denominator ? numerator / denominator : 0;
}

function getExifValueOffset(view, tiffStart, entryOffset, type, count, littleEndian) {
  const valueOffset = entryOffset + 8;
  const byteCounts = {
    1: 1,
    2: 1,
    3: 2,
    4: 4,
    5: 8
  };
  const totalBytes = (byteCounts[type] || 0) * count;
  return totalBytes <= 4 ? valueOffset : tiffStart + view.getUint32(valueOffset, littleEndian);
}

function readExifIfd(view, tiffStart, ifdOffset, littleEndian) {
  if (!ifdOffset || tiffStart + ifdOffset + 2 > view.byteLength) return new Map();
  const entries = new Map();
  const entryCount = view.getUint16(tiffStart + ifdOffset, littleEndian);
  for (let index = 0; index < entryCount; index += 1) {
    const entryOffset = tiffStart + ifdOffset + 2 + index * 12;
    if (entryOffset + 12 > view.byteLength) break;
    const tag = view.getUint16(entryOffset, littleEndian);
    const type = view.getUint16(entryOffset + 2, littleEndian);
    const count = view.getUint32(entryOffset + 4, littleEndian);
    const valueOffset = getExifValueOffset(view, tiffStart, entryOffset, type, count, littleEndian);
    entries.set(tag, { type, count, valueOffset });
  }
  return entries;
}

function exifCoordinate(view, entry, reference, littleEndian) {
  if (!entry || entry.type !== 5 || entry.count < 3) return null;
  const degrees = getExifRational(view, entry.valueOffset, littleEndian);
  const minutes = getExifRational(view, entry.valueOffset + 8, littleEndian);
  const seconds = getExifRational(view, entry.valueOffset + 16, littleEndian);
  const sign = reference === "S" || reference === "W" ? -1 : 1;
  return sign * (degrees + minutes / 60 + seconds / 3600);
}

function exifText(view, entry) {
  if (!entry || entry.type !== 2 || !entry.count) return "";
  return getExifAscii(view, entry.valueOffset, entry.count).trim();
}

function parseExifDateTime(value) {
  const match = String(value || "").match(/^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second = "00"] = match;
  return {
    captureDate: `${year}-${month}-${day}`,
    captureTime: `${hour}:${minute}`,
    capturedAt: `${year}-${month}-${day}T${hour}:${minute}:${second}`
  };
}

function parseExifMetadata(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return {};

  let offset = 2;
  while (offset + 4 < view.byteLength) {
    if (view.getUint8(offset) !== 0xff) return {};
    const marker = view.getUint8(offset + 1);
    const segmentLength = view.getUint16(offset + 2);
    if (marker === 0xe1 && getExifAscii(view, offset + 4, 6) === "Exif") {
      const tiffStart = offset + 10;
      const byteOrder = getExifAscii(view, tiffStart, 2);
      const littleEndian = byteOrder === "II";
      if (!littleEndian && byteOrder !== "MM") return {};
      if (view.getUint16(tiffStart + 2, littleEndian) !== 42) return {};

      const firstIfdOffset = view.getUint32(tiffStart + 4, littleEndian);
      const firstIfd = readExifIfd(view, tiffStart, firstIfdOffset, littleEndian);
      const exifPointer = firstIfd.get(0x8769);
      const exifIfd = exifPointer ? readExifIfd(view, tiffStart, view.getUint32(exifPointer.valueOffset, littleEndian), littleEndian) : new Map();

      const capturedAt = parseExifDateTime(
        exifText(view, exifIfd.get(0x9003))
        || exifText(view, exifIfd.get(0x9004))
        || exifText(view, firstIfd.get(0x9003))
        || exifText(view, firstIfd.get(0x9004))
        || exifText(view, firstIfd.get(0x0132))
      );

      const gpsPointer = firstIfd.get(0x8825);
      if (!gpsPointer) return { ...(capturedAt || {}) };

      const gpsIfd = readExifIfd(view, tiffStart, view.getUint32(gpsPointer.valueOffset, littleEndian), littleEndian);
      const latRefEntry = gpsIfd.get(0x0001);
      const lonRefEntry = gpsIfd.get(0x0003);
      const latitude = exifCoordinate(view, gpsIfd.get(0x0002), latRefEntry ? getExifAscii(view, latRefEntry.valueOffset, latRefEntry.count) : "N", littleEndian);
      const longitude = exifCoordinate(view, gpsIfd.get(0x0004), lonRefEntry ? getExifAscii(view, lonRefEntry.valueOffset, lonRefEntry.count) : "E", littleEndian);
      const coordinates = latitude === null || longitude === null ? null : { latitude, longitude };
      return {
        ...(capturedAt || {}),
        coordinates: shouldIgnorePhotoCoordinates(coordinates) ? null : coordinates
      };
    }
    offset += 2 + segmentLength;
  }

  return {};
}

const ignoredPhotoLocation = { latitude: 43.16142, longitude: -79.33851 };
const ignoredPhotoLocationRadiusMeters = 400;

function distanceMeters(a, b) {
  const radius = 6371000;
  const toRadians = (value) => (Number(value) * Math.PI) / 180;
  const deltaLat = toRadians(b.latitude - a.latitude);
  const deltaLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const value = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function shouldIgnorePhotoCoordinates(coordinates) {
  if (!coordinates) return false;
  return distanceMeters(coordinates, ignoredPhotoLocation) <= ignoredPhotoLocationRadiusMeters;
}

async function extractPhotoCoordinates(file) {
  return (await extractPhotoMetadata(file)).coordinates || null;
}

async function extractPhotoMetadata(file) {
  const isJpeg = file.type?.includes("jpeg") || /\.(jpe?g)$/i.test(file.name || "");
  if (!isJpeg) return {};
  try {
    return parseExifMetadata(await file.arrayBuffer());
  } catch (error) {
    console.warn("Could not read photo metadata.", error);
    return {};
  }
}

async function addNotePhotos(event) {
  const files = [...event.target.files];
  if (!files.length) return;

  try {
    const photos = await Promise.all(files.map(async (file) => {
      const metadata = await extractPhotoMetadata(file);
      return {
        id: createId(),
        name: file.name,
        caption: "",
        ...await uploadImageFile(file, "trip-photos", metadata),
        ...metadata
      };
    }));

    activeNotePhotos = [...activeNotePhotos, ...photos];
    event.target.value = "";
    renderNotePhotos();
  } catch (error) {
    console.error("Could not add note photos.", error);
    showTripFormMessage(error.message || "Those trip photos could not be uploaded.");
  }
}

function renderNotePhotos() {
  if (!activeNotePhotos.length) {
    els.notePhotoGrid.innerHTML = `<div class="empty-state"><p>No note photos attached.</p></div>`;
    return;
  }

  els.notePhotoGrid.innerHTML = activeNotePhotos.map((photo) => `
    <article class="note-photo-card" data-note-photo="${photo.id}">
      ${mediaMarkup(photo)}
      <div class="note-photo-body">
        <input class="note-photo-caption" type="text" value="${escapeHtml(photo.caption || "")}" placeholder="Caption, like fishfinder, launch, rig" />
        <button class="button danger remove-note-photo" type="button">Remove</button>
      </div>
    </article>
  `).join("");
}

function collectNotePhotos() {
  const captions = new Map([...els.notePhotoGrid.querySelectorAll("[data-note-photo]")].map((card) => [
    card.dataset.notePhoto,
    card.querySelector(".note-photo-caption").value.trim()
  ]));

  return activeNotePhotos.map((photo) => ({
    ...photo,
    caption: captions.get(photo.id) ?? photo.caption ?? ""
  }));
}

async function addCatchPhotos(event) {
  const row = event.target.closest(".catch-row");
  const files = [...event.target.files];
  if (!row || !files.length) return;

  try {
    const photos = await Promise.all(files.map(async (file) => {
      const metadata = await extractPhotoMetadata(file);
      return {
        id: createId(),
        name: file.name,
        ...await uploadImageFile(file, "catch-photos", metadata),
        ...metadata
      };
    }));

    row.catchPhotos = [...(row.catchPhotos || []), ...photos];
    event.target.value = "";
    renderCatchPhotos(row);
    updateRowSummary(row);
  } catch (error) {
    console.error("Could not add catch photos.", error);
    showTripFormMessage(error.message || "Those catch photos could not be uploaded.");
  }
}

function renderCatchPhotos(row) {
  const grid = row.querySelector(".catch-photo-grid");
  if (!grid) return;

  const photos = row.catchPhotos || [];
  grid.innerHTML = photos.map((photo) => `
    <article class="catch-photo-card" data-catch-photo="${photo.id}">
      ${mediaMarkup(photo)}
      <button class="icon-button remove-catch-photo" type="button" aria-label="Remove catch photo">x</button>
      <span>${escapeHtml(photo.name || "Catch photo")}</span>
      ${isUsableCoordinates(photo.coordinates) ? `<small>${formatCoordinates(photo.coordinates)}</small>` : `<small>No GPS metadata</small>`}
    </article>
  `).join("");
}

function collectCatchPhotos(row) {
  return (row.catchPhotos || []).map((photo) => ({ ...photo }));
}

function firstCatchCoordinates(row) {
  return (row.catchPhotos || []).find((photo) => isUsableCoordinates(photo.coordinates))?.coordinates || null;
}

function manualCoordinatesFromRow(row) {
  const latitudeText = row.querySelector(".catch-latitude")?.value.trim() || "";
  const longitudeText = row.querySelector(".catch-longitude")?.value.trim() || "";
  if (!latitudeText && !longitudeText) return null;
  const coordinates = {
    latitude: Number(latitudeText),
    longitude: Number(longitudeText),
    manual: true
  };
  return isUsableCoordinates(coordinates) ? coordinates : null;
}

function fishCoordinatesFromRow(row) {
  return manualCoordinatesFromRow(row) || firstCatchCoordinates(row);
}

async function loadPhotoQueue() {
  const response = await fetch("/api/photo-queue");
  if (!response.ok) throw new Error("Could not load photo queue");
  const payload = await response.json();
  return payload.photos || [];
}

async function renderPhotoQueue() {
  const photos = await loadPhotoQueue();
  els.photoQueueStatus.textContent = photos.length === 1 ? "1 queued photo" : `${photos.length} queued photos`;
  if (!photos.length) {
    els.photoQueueGrid.innerHTML = `<div class="empty-state"><p>No queued photos. Upload from your phone, then pick them here while logging.</p></div>`;
    return;
  }

  els.photoQueueGrid.innerHTML = photos.map((photo) => `
    <article class="photo-queue-card" data-queue-photo="${photo.filename}">
      <div class="photo-queue-image-wrap">
        ${mediaMarkup(photo)}
        <button class="icon-button photo-queue-remove" type="button" data-delete-queued-photo="${photo.filename}" aria-label="Remove queued photo">x</button>
      </div>
      <div>
        <strong>${escapeHtml(photo.name || "Queued photo")}</strong>
        <span>${isUsableCoordinates(photo.coordinates) ? escapeHtml(formatCoordinates(photo.coordinates)) : "No GPS metadata"}</span>
      </div>
      <div class="photo-queue-card-actions">
        ${activePhotoQueueTarget ? `<button class="button primary" type="button" data-select-queued-photo="${photo.filename}">Use Photo</button>` : ""}
      </div>
    </article>
  `).join("");
}

async function openPhotoQueue(target = null) {
  activePhotoQueueTarget = target;
  returnToTripDialog.queue = Boolean(target) && els.tripDialog.open;
  returnToTripDialog.lureImage = target?.type === "lure" && els.lureDialog.open;
  returnToTripDialog.flasherImage = target?.type === "flasher" && els.flasherDialog.open;
  if (returnToTripDialog.queue) els.tripDialog.close();
  if (returnToTripDialog.lureImage) els.lureDialog.close();
  if (returnToTripDialog.flasherImage) els.flasherDialog.close();
  els.photoQueueDialog.showModal();
  await renderPhotoQueue();
}

function restoreDialogAfterPhotoQueue() {
  if (returnToTripDialog.queue) {
    returnToTripDialog.queue = false;
    setTimeout(() => {
      if (!els.tripDialog.open) els.tripDialog.showModal();
    }, 0);
  }
  if (returnToTripDialog.lureImage) {
    returnToTripDialog.lureImage = false;
    setTimeout(() => {
      if (!els.lureDialog.open) els.lureDialog.showModal();
    }, 0);
  }
  if (returnToTripDialog.flasherImage) {
    returnToTripDialog.flasherImage = false;
    setTimeout(() => {
      if (!els.flasherDialog.open) els.flasherDialog.showModal();
    }, 0);
  }
}

async function addPhotosToQueue(event) {
  const files = [...event.target.files];
  if (!files.length) return;
  els.photoQueueStatus.textContent = "Uploading photos...";
  try {
    await Promise.all(files.map(async (file) => {
      const metadata = await extractPhotoMetadata(file);
      return uploadImageFile(file, "queue", metadata);
    }));
    event.target.value = "";
    await renderPhotoQueue();
  } catch (error) {
    console.error("Could not add photos to queue.", error);
    els.photoQueueStatus.textContent = error.message || "Photos could not be uploaded.";
  }
}

async function claimQueuedPhoto(filename) {
  if (!activePhotoQueueTarget) return;
  try {
    const response = await fetch("/api/photo-queue/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename,
        targetCategory: activePhotoQueueTarget.category
      })
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "Could not use queued photo");
    }
    const photo = await response.json();
  const photoItem = {
    id: createId(),
    ...photo,
    image: photo.url,
    previewImage: photo.previewUrl || photo.url
  };

    if (activePhotoQueueTarget.type === "catch") {
      const row = activePhotoQueueTarget.row;
      row.catchPhotos = [...(row.catchPhotos || []), photoItem];
      renderCatchPhotos(row);
      updateRowSummary(row);
    }
    if (activePhotoQueueTarget.type === "trip") {
      activeNotePhotos = [...activeNotePhotos, { ...photoItem, caption: "" }];
      renderNotePhotos();
    }
    if (activePhotoQueueTarget.type === "lure") {
      pendingLureImage = photoItem;
      document.querySelector("#lureImage").value = "";
      renderQueuedGearImage("lure");
    }
    if (activePhotoQueueTarget.type === "flasher") {
      pendingFlasherImage = photoItem;
      document.querySelector("#flasherImage").value = "";
      renderQueuedGearImage("flasher");
    }

    await renderPhotoQueue();
    if (["lure", "flasher"].includes(activePhotoQueueTarget.type)) {
      els.photoQueueDialog.close();
    }
  } catch (error) {
    console.error("Could not claim queued photo.", error);
    els.photoQueueStatus.textContent = error.message || "Queued photo could not be used.";
  }
}

async function deleteQueuedPhoto(filename) {
  try {
    const response = await fetch(`/api/photo-queue/${encodeURIComponent(filename)}`, { method: "DELETE" });
    if (!response.ok) throw new Error("Could not delete queued photo");
    await renderPhotoQueue();
  } catch (error) {
    console.error("Could not delete queued photo.", error);
    els.photoQueueStatus.textContent = error.message || "Queued photo could not be deleted.";
  }
}
