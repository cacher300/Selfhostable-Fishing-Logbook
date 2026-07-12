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
  const response = await protectedFetch(`/api/uploads/${category}`, {
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

function parseMetadataDateTime(value) {
  const match = String(value || "").match(/^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
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

function videoText(view, offset, length) {
  if (length <= 0 || offset < 0 || offset + length > view.byteLength) return "";
  return new TextDecoder("utf-8").decode(new Uint8Array(view.buffer, view.byteOffset + offset, length)).replace(/\0/g, "").trim();
}

function videoBoxType(view, offset) {
  if (offset < 0 || offset + 4 > view.byteLength) return "";
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3)
  );
}

function videoBoxSize(view, offset) {
  const size = view.getUint32(offset);
  if (size === 1 && offset + 16 <= view.byteLength) {
    const high = view.getUint32(offset + 8);
    const low = view.getUint32(offset + 12);
    return high * 4294967296 + low;
  }
  return size;
}

function videoBoxHeaderSize(view, offset) {
  return view.getUint32(offset) === 1 ? 16 : 8;
}

function quickTimeDateTime(secondsSince1904) {
  if (!secondsSince1904) return null;
  const secondsBetweenEpochs = 2082844800;
  const timestamp = (secondsSince1904 - secondsBetweenEpochs) * 1000;
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  const pad = (value) => String(value).padStart(2, "0");
  return {
    captureDate: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    captureTime: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
    capturedAt: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  };
}

function parseIso6709Coordinates(value) {
  const match = String(value || "").trim().match(/^([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)(?:[+-]\d+(?:\.\d+)?)?\//);
  if (!match) return null;
  const coordinates = {
    latitude: Number(match[1]),
    longitude: Number(match[2])
  };
  return isUsableCoordinates(coordinates) ? coordinates : null;
}

function readVideoDataBoxes(view, start, end) {
  const values = [];
  let offset = start;
  while (offset + 8 <= end) {
    const size = videoBoxSize(view, offset);
    const headerSize = videoBoxHeaderSize(view, offset);
    if (size < headerSize || offset + size > end) break;
    if (videoBoxType(view, offset + 4) === "data" && size > headerSize + 8) {
      values.push(videoText(view, offset + headerSize + 8, size - headerSize - 8));
    }
    offset += size;
  }
  return values;
}

function parseVideoKeys(view, start, end) {
  const keys = new Map();
  if (start + 8 > end) return keys;
  let offset = start + 8;
  const count = view.getUint32(start + 4);
  for (let index = 1; index <= count && offset + 8 <= end; index += 1) {
    const size = view.getUint32(offset);
    if (size < 8 || offset + size > end) break;
    keys.set(index, videoText(view, offset + 8, size - 8));
    offset += size;
  }
  return keys;
}

function parseVideoMetadata(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  const metadata = {};
  let metadataKeys = new Map();

  function applyTextMetadata(key, value) {
    if (!key || !value) return;
    const normalizedKey = key.toLowerCase();
    if (!metadata.coordinates && (key === "\u00a9xyz" || normalizedKey.includes("location.iso6709"))) {
      const coordinates = parseIso6709Coordinates(value);
      if (coordinates) metadata.coordinates = shouldIgnorePhotoCoordinates(coordinates) ? null : coordinates;
    }
    if (!metadata.captureTime && (key === "\u00a9day" || normalizedKey.includes("creationdate") || normalizedKey.includes("date"))) {
      Object.assign(metadata, parseMetadataDateTime(value) || {});
    }
  }

  function walkBoxes(start, end) {
    let offset = start;
    while (offset + 8 <= end) {
      const size = videoBoxSize(view, offset);
      const headerSize = videoBoxHeaderSize(view, offset);
      if (size < headerSize || offset + size > end) break;
      const type = videoBoxType(view, offset + 4);
      const contentStart = offset + headerSize;
      const contentEnd = offset + size;

      if (type === "mvhd" && !metadata.captureTime && contentStart + 8 <= contentEnd) {
        const version = view.getUint8(contentStart);
        const creationTime = version === 1 && contentStart + 16 <= contentEnd
          ? (view.getUint32(contentStart + 4) * 4294967296) + view.getUint32(contentStart + 8)
          : view.getUint32(contentStart + 4);
        Object.assign(metadata, quickTimeDateTime(creationTime) || {});
      } else if (type === "keys") {
        metadataKeys = parseVideoKeys(view, contentStart, contentEnd);
      } else if (type === "ilst") {
        let itemOffset = contentStart;
        while (itemOffset + 8 <= contentEnd) {
          const itemSize = videoBoxSize(view, itemOffset);
          const itemHeaderSize = videoBoxHeaderSize(view, itemOffset);
          if (itemSize < itemHeaderSize || itemOffset + itemSize > contentEnd) break;
          const itemType = videoBoxType(view, itemOffset + 4);
          const numericKey = view.getUint32(itemOffset + 4);
          const key = metadataKeys.get(numericKey) || itemType;
          readVideoDataBoxes(view, itemOffset + itemHeaderSize, itemOffset + itemSize).forEach((value) => applyTextMetadata(key, value));
          itemOffset += itemSize;
        }
      } else if (["moov", "udta", "trak", "mdia", "minf", "stbl"].includes(type)) {
        walkBoxes(contentStart, contentEnd);
      } else if (type === "meta") {
        walkBoxes(contentStart + 4, contentEnd);
      }

      offset += size;
    }
  }

  walkBoxes(0, view.byteLength);
  return metadata;
}

const maxFullVideoMetadataBytes = 64 * 1024 * 1024;
const videoMetadataSliceBytes = 16 * 1024 * 1024;

function findContainedVideoBox(arrayBuffer, type) {
  const view = new DataView(arrayBuffer);
  for (let offset = 4; offset + 4 <= view.byteLength; offset += 1) {
    if (videoBoxType(view, offset) !== type) continue;
    const boxStart = offset - 4;
    const boxSize = videoBoxSize(view, boxStart);
    const headerSize = videoBoxHeaderSize(view, boxStart);
    if (boxSize >= headerSize && boxStart + boxSize <= view.byteLength) {
      return arrayBuffer.slice(boxStart, boxStart + boxSize);
    }
  }
  return null;
}

function hasUsefulMediaMetadata(metadata) {
  return Boolean(metadata?.coordinates || metadata?.captureTime);
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
  return (await extractMediaMetadata(file)).coordinates || null;
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

async function extractVideoMetadata(file) {
  const isVideo = file.type?.startsWith("video/") || /\.(mov|mp4|m4v)$/i.test(file.name || "");
  if (!isVideo) return {};
  try {
    if (file.size <= maxFullVideoMetadataBytes) {
      return parseVideoMetadata(await file.arrayBuffer());
    }

    const firstSlice = await file.slice(0, videoMetadataSliceBytes).arrayBuffer();
    const firstMetadata = parseVideoMetadata(firstSlice);
    if (hasUsefulMediaMetadata(firstMetadata)) return firstMetadata;

    const tailStart = Math.max(0, file.size - videoMetadataSliceBytes);
    const tailSlice = await file.slice(tailStart).arrayBuffer();
    const moovBox = findContainedVideoBox(tailSlice, "moov");
    return moovBox ? parseVideoMetadata(moovBox) : firstMetadata;
  } catch (error) {
    console.warn("Could not read video metadata.", error);
    return {};
  }
}

async function extractMediaMetadata(file) {
  return {
    ...await extractPhotoMetadata(file),
    ...await extractVideoMetadata(file)
  };
}

async function addNotePhotos(event) {
  const files = [...event.target.files];
  if (!files.length) return;

  try {
    const photos = await Promise.all(files.map(async (file) => {
      const metadata = await extractMediaMetadata(file);
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

function applyPhotoCaptureTimeToCatch(row, photos) {
  const captureTime = photos.find((photo) => /^\d{2}:\d{2}$/.test(photo.captureTime || ""))?.captureTime;
  const timeInput = row.querySelector(".catch-time");
  if (captureTime && timeInput) timeInput.value = captureTime;
}

async function addCatchPhotos(event) {
  const row = event.target.closest(".catch-row");
  const files = [...event.target.files];
  if (!row || !files.length) return;

  try {
    const photos = await Promise.all(files.map(async (file) => {
      const metadata = await extractMediaMetadata(file);
      return {
        id: createId(),
        name: file.name,
        ...await uploadImageFile(file, "catch-photos", metadata),
        ...metadata
      };
    }));

    row.catchPhotos = [...(row.catchPhotos || []), ...photos];
    applyPhotoCaptureTimeToCatch(row, photos);
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
      <button class="icon-button remove-catch-photo" type="button" aria-label="Remove catch photo"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg></button>
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
  return catchLocationFromRow(row);
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
    <article class="photo-queue-card" data-queue-photo="${escapeHtml(photo.filename)}" ${activePhotoQueueTarget ? `data-select-queued-photo="${escapeHtml(photo.filename)}" tabindex="0" role="button"` : ""}>
      <div class="photo-queue-image-wrap">
        ${mediaMarkup(photo)}
        <button class="icon-button photo-queue-remove" type="button" data-delete-queued-photo="${escapeHtml(photo.filename)}" aria-label="Remove queued photo"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg></button>
      </div>
      <div>
        <strong>${escapeHtml(photo.name || "Queued photo")}</strong>
        <span>${isUsableCoordinates(photo.coordinates) ? escapeHtml(formatCoordinates(photo.coordinates)) : "No GPS metadata"}</span>
      </div>
      <div class="photo-queue-card-actions">
        ${activePhotoQueueTarget ? `<button class="button primary" type="button" data-select-queued-photo="${escapeHtml(photo.filename)}">Use Photo</button>` : ""}
      </div>
    </article>
  `).join("");
}

async function openPhotoQueue(target = null) {
  activePhotoQueueTarget = target;
  returnToTripDialog.queue = Boolean(target) && els.tripDialog.open;
  returnToTripDialog.lureImage = target?.type === "lure" && els.lureDialog.open;
  returnToTripDialog.flasherImage = target?.type === "flasher" && els.flasherDialog.open;
  returnToTripDialog.reelImage = target?.type === "reel" && els.reelDialog.open;
  returnToTripDialog.rodImage = target?.type === "rod" && els.rodDialog.open;
  els.photoQueueDialog.showModal();
  await renderPhotoQueue();
}

function restoreDialogAfterPhotoQueue() {
  if (returnToTripDialog.queue) {
    returnToTripDialog.queue = false;
  }
  if (returnToTripDialog.lureImage) {
    returnToTripDialog.lureImage = false;
  }
  if (returnToTripDialog.flasherImage) {
    returnToTripDialog.flasherImage = false;
  }
  if (returnToTripDialog.reelImage) {
    returnToTripDialog.reelImage = false;
  }
  if (returnToTripDialog.rodImage) {
    returnToTripDialog.rodImage = false;
  }
}

async function addPhotosToQueue(event) {
  const files = [...event.target.files];
  if (!files.length) return;
  els.photoQueueStatus.textContent = "Uploading photos...";
  try {
    await Promise.all(files.map(async (file) => {
      const metadata = await extractMediaMetadata(file);
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
    const response = await protectedFetch("/api/photo-queue/claim", {
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
      applyPhotoCaptureTimeToCatch(row, [photoItem]);
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
    if (activePhotoQueueTarget.type === "reel") {
      pendingReelImage = photoItem;
      document.querySelector("#reelImage").value = "";
      renderQueuedGearImage("reel");
    }
    if (activePhotoQueueTarget.type === "rod") {
      pendingRodImage = photoItem;
      document.querySelector("#rodImage").value = "";
      renderQueuedGearImage("rod");
    }

    await renderPhotoQueue();
    if (["lure", "flasher", "reel", "rod"].includes(activePhotoQueueTarget.type)) {
      els.photoQueueDialog.close();
    }
  } catch (error) {
    console.error("Could not claim queued photo.", error);
    els.photoQueueStatus.textContent = error.message || "Queued photo could not be used.";
  }
}

async function deleteQueuedPhoto(filename) {
  try {
    const response = await protectedFetch(`/api/photo-queue/${encodeURIComponent(filename)}`, { method: "DELETE" });
    if (!response.ok) throw new Error("Could not delete queued photo");
    await renderPhotoQueue();
  } catch (error) {
    console.error("Could not delete queued photo.", error);
    els.photoQueueStatus.textContent = error.message || "Queued photo could not be deleted.";
  }
}
