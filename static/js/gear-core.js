import { html, insertHtml, joinHtml, setHtml } from "./html.js";
import { state, ui } from "./app-state.js";
import { displayStoredMeasurement } from "./app-units.js";
import { els } from "./app-elements.js";
import { canonicalMediaRef, isVideoMedia, mediaMarkup, mediaReferenceKey, originalMediaUrl } from "./app-media.js";
import { fishCount } from "./dashboard.js";
import { getValue } from "./trip-editor.js";
import { resolveTripLineRecord } from "./trolling-spread.js";


export function gearPhotos(item) {
  return Array.isArray(item?.media) ? item.media : [];
}

export function gearPhotoKey(photo, index = 0) {
  return String(photo?.id || mediaReferenceKey(photo) || `photo-${index}`);
}

export function gearDialogForType(type) {
  return { lure: els.lureDialog, flasher: els.flasherDialog, reel: els.reelDialog, rod: els.rodDialog }[type];
}

export function removedGearPhotoKeys(type) {
  try { return new Set(JSON.parse(gearDialogForType(type)?.dataset.removedPhotoKeys || "[]")); } catch { return new Set(); }
}

export function gearPhotoFields(uploadedPhotos = [], existing = {}, type = "") {
  const removed = removedGearPhotoKeys(type);
  const media = [...gearPhotos(existing).filter((photo, index) => !removed.has(gearPhotoKey(photo, index))), ...uploadedPhotos]
    .map(canonicalMediaRef).filter(Boolean);
  const requestedHero = String(existing?.heroMediaId || "");
  const heroMediaId = media.some((photo) => photo.id === requestedHero && !isVideoMedia(photo)) ? requestedHero : "";
  return { media, heroMediaId };
}

export function gearPhotoSignature(item) {
  return gearPhotos(item).map((photo) => [
    photo.category || "",
    photo.filename || "",
    photo.previewFilename || ""
  ]);
}

export function duplicateMatchesSource(source, duplicate, fields) {
  return fields.every((field) => {
    const sourceValue = Array.isArray(source?.[field]) ? JSON.stringify(source[field]) : String(source?.[field] ?? "");
    const duplicateValue = Array.isArray(duplicate?.[field]) ? JSON.stringify(duplicate[field]) : String(duplicate?.[field] ?? "");
    return sourceValue === duplicateValue;
  }) && JSON.stringify(gearPhotoSignature(source)) === JSON.stringify(gearPhotoSignature(duplicate));
}

export function increasedQuantity(value) {
  if (String(value ?? "").trim() === "") return "2";
  return String(Math.max(0, Number(value) || 0) + 1);
}

export function gearDisplayName(item, fallback = "Gear") {
  return [item?.brand, item?.name].map((value) => String(value || "").trim()).filter(Boolean).join(" ")
    || item?.shortName
    || fallback;
}

export function nextReelCopyShortName(reel) {
  const currentName = String(reel?.shortName || gearDisplayName(reel, "Reel")).trim();
  const baseName = currentName.replace(/\s+#\d+$/i, "") || "Reel";
  const usedNames = new Set(state.reels.map((item) => String(item.shortName || "").trim().toLowerCase()));
  let copyNumber = 2;
  while (usedNames.has(`${baseName} #${copyNumber}`.toLowerCase())) copyNumber += 1;
  return `${baseName} #${copyNumber}`;
}

export function reelModelGroupId(reel) {
  return String(reel?.modelGroupId || reel?.id || "");
}

export function syncReelGroupQuantity(groupId, quantity) {
  if (!groupId) return state.reels;
  return state.reels.map((item) => {
    if (item.id === groupId || reelModelGroupId(item) === groupId) {
      return { ...item, modelGroupId: groupId, quantityAvailable: String(quantity ?? "") };
    }
    return item;
  });
}

export function generatedLureName(lure) {
  return [lure?.color, lure?.spoonSize, lure?.bladeType, lure?.meatRigType, lure?.brand, lure?.type].map((value) => String(value || "").trim()).filter(Boolean).join(" ");
}

export function rodName(id) {
  if (!id) return "";
  return gearDisplayName(state.rods.find((rod) => rod.id === id), "");
}

export function reelName(id) {
  if (!id) return "";
  const reel = state.reels.find((item) => item.id === id);
  return reel?.shortName || gearDisplayName(reel, "");
}

export function comboName(id) {
  if (!id) return "";
  const combo = state.rodReelCombos.find((item) => item.id === id);
  if (!combo) return "";
  return combo.shortName || [rodName(combo.rodId), reelName(combo.reelId)].filter(Boolean).join(" + ");
}

export function lureName(id) {
  if (!id) return "";
  return state.lures.find((lure) => lure.id === id)?.name || "";
}

export function flasherName(id) {
  if (!id) return "";
  return state.flashers.find((flasher) => flasher.id === id)?.name || "";
}

export function activeLineEntry(reel) {
  return [...(reel?.lineHistory || [])]
    .sort((a, b) => String(b.spooledDate || "").localeCompare(String(a.spooledDate || "")))[0] || null;
}

export function mergeLineHistory(existingEntries = [], editedEntries = []) {
  const originals = Array.isArray(existingEntries) ? existingEntries : [];
  const changes = Array.isArray(editedEntries) ? editedEntries : [];
  const editedById = new Map(changes.filter((entry) => entry?.id).map((entry) => [entry.id, entry]));
  const merged = originals.map((entry) => {
    const edited = editedById.get(entry?.id);
    if (!edited) return entry;
    editedById.delete(entry.id);
    return { ...entry, ...edited };
  });
  merged.push(...editedById.values());
  return merged;
}

export function lineSummary(line) {
  if (!line) return "";
  return [
    [line.type, displayStoredMeasurement(line.weight, "fishWeight")].filter(Boolean).join(" "),
    [line.brand, line.name].filter(Boolean).join(" "),
    line.color
  ].filter(Boolean).join(" / ");
}

export function baitStats(type, id) {
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

export function renderQueuedGearImage(type) {
  const pending = {
    lure: ui.pendingLureImage,
    flasher: ui.pendingFlasherImage,
    reel: ui.pendingReelImage,
    rod: ui.pendingRodImage
  }[type];
  const container = document.querySelector({
    lure: "#lureQueuedImage",
    flasher: "#flasherQueuedImage",
    reel: "#reelQueuedImage",
    rod: "#rodQueuedImage"
  }[type]);
  if (!container) return;
  container.classList.toggle("hidden", !pending);
  setHtml(container, pending ? html`
    ${isVideoMedia(pending)
      ? mediaMarkup(pending, "", { download: false })
      : html`<button class="queued-gear-image-preview" type="button" data-open-queued-gear-preview="${type}" aria-label="Enlarge queued photo">
          ${mediaMarkup(pending, "", { download: false })}
          <span>Queued photo selected</span>
        </button>`}
    ${isVideoMedia(pending) ? html`<span>Queued video selected</span>` : ""}
  ` : html``);
}

export function renderExistingGearPhotos(type, item = null, localFiles = []) {
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
      uri: url,
      mediaType: file.type.startsWith("video/") ? "video" : "image",
      mimeType: file.type,
      name: file.name
    };
  });
  const removed = removedGearPhotoKeys(type);
  const photos = gearPhotos(item).filter((photo, index) => !removed.has(gearPhotoKey(photo, index)));
  container.classList.toggle("hidden", !photos.length && !localPhotos.length);
  setHtml(container, html`
    ${photos.length ? html`
      <div class="gear-editor-photos-heading">Current ${photos.length === 1 ? "photo" : "photos"}</div>
      <div class="gear-editor-photo-grid">
        ${joinHtml(photos.map((photo, index) => html`<div class="gear-editor-photo">${mediaMarkup(photo, "", { download: false })}<button class="icon-button gear-editor-photo-remove" type="button" data-remove-gear-photo="${gearPhotoKey(photo, index)}" data-gear-photo-type="${type}" aria-label="Remove photo">×</button></div>`), "")}
      </div>
    ` : ""}
    ${localPhotos.length ? html`
      <div class="gear-editor-photos-heading">Selected ${localPhotos.length === 1 ? "upload" : "uploads"}</div>
      <div class="gear-editor-photo-grid">
        ${joinHtml(localPhotos.map((photo) => html`<div class="gear-editor-photo">${mediaMarkup(photo, "", { download: false })}</div>`), "")}
      </div>
    ` : ""}
  `);
}

export function previewSelectedGearUploads(type, input) {
  const items = { lure: state.lures, flasher: state.flashers, reel: state.reels, rod: state.rods }[type] || [];
  const context = ui.gearDraftContext || {};
  const id = context.editingId || context.duplicateSourceId || {
    lure: getValue("editingLureId"),
    flasher: getValue("editingFlasherId"),
    reel: getValue("editingReelId") || els.reelDialog.dataset.duplicateFromId,
    rod: getValue("editingRodId") || els.rodDialog.dataset.duplicateFromId
  }[type];
  ui.gearDraftUploads = { ...(ui.gearDraftUploads || {}), [type]: [...(input?.files || [])] };
  renderExistingGearPhotos(type, ui.gearDraft || items.find((item) => item.id === id) || null, ui.gearDraftUploads[type]);
}

export function removeExistingGearPhoto(type, key) {
  const dialog = gearDialogForType(type);
  if (!dialog) return;
  const keys = removedGearPhotoKeys(type);
  keys.add(key);
  dialog.dataset.removedPhotoKeys = JSON.stringify([...keys]);
  if (ui.gearDraft) {
    const media = gearPhotos(ui.gearDraft).filter((photo, index) => gearPhotoKey(photo, index) !== key);
    ui.gearDraft.media = media;
    if (ui.gearDraft.heroMediaId && !media.some((photo) => photo.id === ui.gearDraft.heroMediaId && !isVideoMedia(photo))) {
      ui.gearDraft.heroMediaId = "";
    }
  }
  const input = document.querySelector({ lure: "#lureImage", flasher: "#flasherImage", reel: "#reelImage", rod: "#rodImage" }[type]);
  previewSelectedGearUploads(type, input);
}

export function openQueuedGearImagePreview(type) {
  const pending = {
    lure: ui.pendingLureImage,
    flasher: ui.pendingFlasherImage,
    reel: ui.pendingReelImage,
    rod: ui.pendingRodImage
  }[type];
  const source = originalMediaUrl(pending);
  if (!source || isVideoMedia(pending)) return;
  document.querySelector(".queued-gear-photo-lightbox")?.remove();
  const dialog = gearDialogForType(type);
  const lightboxHost = dialog?.open ? dialog : document.body;
  insertHtml(lightboxHost, "beforeend", html`
    <div class="report-photo-lightbox queued-gear-photo-lightbox" role="dialog" aria-modal="true" aria-label="Queued gear photo">
      <button type="button" class="report-photo-lightbox-close" data-close-report-photo aria-label="Close photo">×</button>
      <img src="${source}" alt="Queued gear photo">
    </div>
  `);
  document.body.classList.add("report-photo-lightbox-open");
  document.querySelector(".queued-gear-photo-lightbox [data-close-report-photo]")?.focus();
}
