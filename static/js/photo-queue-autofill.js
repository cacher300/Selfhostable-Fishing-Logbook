import { protectedFetch } from "./app-config.js";
import { createId } from "./app-defaults.js";
import { els } from "./app-elements.js";
import { mediaEditSession, trackCreatedMedia } from "./app-media.js";
import { updateCatchFowFromLocation, updateCatchLocationSummary } from "./locations.js";
import { formatDate } from "./dashboard.js";
import { applyPhotoCaptureTimeToCatch, applyPhotoLocationToCatch, loadPhotoQueue, renderCatchPhotos, selectedCatchPhotoLocation } from "./photos.js";
import { getValue, markTripFormChanged } from "./trip-editor.js";
import { addCatchRow, updateRowSummary } from "./trip-rows.js";

export const PHOTO_QUEUE_CATCH_GAP_MS = 3 * 60 * 1000;

export function photoQueueAutofillDate(photo) {
  const raw = String(photo?.captureDate || photo?.capturedAt || "");
  const match = raw.match(/(\d{4})[-:](\d{2})[-:](\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

export function photoQueueAutofillTimestamp(photo) {
  const timestamp = photo?.capturedAt
    || (photo?.captureDate && photo?.captureTime ? `${photo.captureDate}T${photo.captureTime}` : "");
  const value = timestamp ? Date.parse(timestamp) : NaN;
  return Number.isFinite(value) ? value : null;
}

export function photoQueueCatchGroups(photos = [], tripDate = "") {
  const timestamped = photos
    .map((photo, index) => ({
      photo,
      index,
      date: photoQueueAutofillDate(photo),
      timestamp: photoQueueAutofillTimestamp(photo)
    }))
    .filter((item) => item.date === tripDate && item.timestamp !== null)
    .sort((first, second) => first.timestamp - second.timestamp || first.index - second.index);

  const groups = [];
  timestamped.forEach((item) => {
    const currentGroup = groups.at(-1);
    const previous = currentGroup?.at(-1);
    if (!previous || item.timestamp - previous.timestamp > PHOTO_QUEUE_CATCH_GAP_MS) {
      groups.push([item]);
      return;
    }
    currentGroup.push(item);
  });
  return groups.map((group) => group.map((item) => item.photo));
}

export async function copyQueuedPhotoForCatch(filename) {
  const session = mediaEditSession("trip");
  if (!session) throw new Error("Open the trip editor before copying queued photos.");
  const response = await protectedFetch("/api/photo-queue/copy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, targetCategory: "catch-photos" })
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Could not use queued photo");
  }
  const photo = await response.json();
  if (!trackCreatedMedia(session, photo)) throw new Error("The trip editor closed before the photo was copied.");
  return {
    id: createId(),
    ...photo
  };
}

export async function attachPhotoGroupToCatch(row, photos) {
  row.catchPhotos = photos;
  const selectedPhoto = selectedCatchPhotoLocation(row);
  if (selectedPhoto) applyPhotoLocationToCatch(row, selectedPhoto);
  applyPhotoCaptureTimeToCatch(row, selectedPhoto ? [selectedPhoto] : photos);
  renderCatchPhotos(row);
  updateCatchLocationSummary(row);
  await updateCatchFowFromLocation(row);
  updateRowSummary(row);
}

export function setCatchQueueAutofillStatus(message = "") {
  if (els.catchQueueAutofillStatus) els.catchQueueAutofillStatus.textContent = message;
}

export async function autofillCatchesFromPhotoQueue() {
  const button = els.autofillQueueCatchesButton;
  const tripDate = getValue("tripDate");
  if (!tripDate) {
    setCatchQueueAutofillStatus("Select a trip date before autofilling catches.");
    return;
  }

  if (button) {
    button.disabled = true;
    button.classList.add("is-loading");
    button.setAttribute("aria-busy", "true");
  }
  try {
    const queuePhotos = await loadPhotoQueue();
    const matchingDatePhotos = queuePhotos.filter((photo) => photoQueueAutofillDate(photo) === tripDate);
    const groups = photoQueueCatchGroups(queuePhotos, tripDate);
    if (!groups.length) {
      setCatchQueueAutofillStatus(matchingDatePhotos.length
        ? `${matchingDatePhotos.length} queued photo${matchingDatePhotos.length === 1 ? " has" : "s have"} no usable capture time for ${formatDate(tripDate)}.`
        : `No queued photos match ${formatDate(tripDate)}.`);
      return;
    }

    const depthLookups = [];
    for (const group of groups) {
      const copiedPhotos = await Promise.all(group.map((photo) => copyQueuedPhotoForCatch(photo.filename)));
      const row = addCatchRow();
      depthLookups.push(attachPhotoGroupToCatch(row, copiedPhotos));
    }
    await Promise.all(depthLookups);
    if (typeof markTripFormChanged === "function") markTripFormChanged();
    setCatchQueueAutofillStatus();
  } catch (error) {
    console.error("Could not autofill catches from photo queue.", error);
    setCatchQueueAutofillStatus(error.message || "Catches could not be autofilled from the photo queue.");
  } finally {
    if (button) {
      button.disabled = false;
      button.classList.remove("is-loading");
      button.removeAttribute("aria-busy");
    }
  }
}
