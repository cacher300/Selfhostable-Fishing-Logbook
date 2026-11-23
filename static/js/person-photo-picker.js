import { html, joinHtml, setHtml } from "./html.js";
import { protectedFetch } from "./app-config.js";
import { canonicalMediaRef, isVideoMedia, mediaEditSession, previewImage, trackCreatedMedia } from "./app-media.js";
import { galleryCategoryLabels } from "./gallery.js";
import { markTripFormChanged, setPersonPhotoForRow } from "./trip-editor.js";
import { updateTripRow } from "./draft-binding.js";

let pickerDialog = null;
let activePersonRow = null;
let pickerPhotos = [];
let pickerRequestId = 0;
let selectingPhoto = false;

function personPhotoReference(item) {
  if (!item) return null;
  const photo = { category: item.category, filename: item.filename };
  ["name", "caption", "mediaType", "mimeType", "previewFilename", "captureTime"].forEach((key) => {
    if (typeof item[key] === "string" && item[key]) photo[key] = item[key];
  });
  if (item.coordinates && typeof item.coordinates === "object") photo.coordinates = item.coordinates;
  return canonicalMediaRef(photo);
}

function pickerMarkup() {
  return html`
    <form method="dialog" novalidate>
      <header class="dialog-header">
        <div>
          <h2>Choose person photo</h2>
          <p class="dialog-supporting-text">Pick any photo from your gallery.</p>
        </div>
        <button class="button secondary compact-action" type="button" data-person-photo-picker-close>Close</button>
      </header>
      <label class="person-photo-picker-search">
        <span>Search gallery</span>
        <input type="search" data-person-photo-picker-search placeholder="Name, file, or category" autocomplete="off" />
      </label>
      <p class="person-photo-picker-status" data-person-photo-picker-status role="status" aria-live="polite">Loading gallery photos…</p>
      <div class="person-photo-picker-grid" data-person-photo-picker-grid aria-label="Gallery photos"></div>
      <footer class="dialog-actions">
        <button class="button secondary" type="button" data-person-photo-picker-upload>Upload new photo</button>
        <button class="button secondary" type="button" data-person-photo-picker-cancel>Cancel</button>
      </footer>
    </form>`;
}

function ensurePickerDialog() {
  if (pickerDialog) return pickerDialog;
  pickerDialog = document.createElement("dialog");
  pickerDialog.id = "personPhotoPickerDialog";
  pickerDialog.className = "dialog person-photo-picker-dialog";
  setHtml(pickerDialog, pickerMarkup());
  document.body.append(pickerDialog);

  pickerDialog.addEventListener("click", (event) => {
    if (event.target.matches("[data-person-photo-picker-close], [data-person-photo-picker-cancel]")) {
      pickerDialog.close();
      return;
    }

    if (event.target.closest("[data-person-photo-picker-upload]")) {
      const uploadInput = activePersonRow?.querySelector(".person-photo-input");
      pickerDialog.close();
      uploadInput?.click();
      return;
    }

    const choice = event.target.closest("[data-person-photo-choice]");
    if (!choice || !activePersonRow) return;
    const item = pickerPhotos[Number(choice.dataset.personPhotoChoice)];
    if (item?.category === "queue") {
      void copyQueuedPhotoForPerson(item, activePersonRow);
      return;
    }
    const photo = personPhotoReference(item);
    if (!photo) return;

    applyPersonPhoto(activePersonRow, photo);
    pickerDialog.close();
  });

  pickerDialog.querySelector("[data-person-photo-picker-search]").addEventListener("input", renderPickerPhotos);
  pickerDialog.addEventListener("close", () => {
    if (pickerDialog.open) return;
    activePersonRow = null;
    selectingPhoto = false;
    pickerRequestId += 1;
  });
  return pickerDialog;
}

function applyPersonPhoto(row, photo) {
  setPersonPhotoForRow(row, photo);
  updateTripRow("people", row.dataset.personId, { photo });
  markTripFormChanged();
}

function setSelectionBusy(busy, name = "") {
  selectingPhoto = busy;
  pickerDialog.querySelectorAll("[data-person-photo-choice], [data-person-photo-picker-upload]").forEach((button) => {
    button.disabled = busy;
  });
  pickerDialog.querySelector("[data-person-photo-picker-search]").disabled = busy;
  pickerDialog.querySelector("[data-person-photo-picker-status]").textContent = busy
    ? `Adding ${name || "photo"}…`
    : `${pickerPhotos.length} ${pickerPhotos.length === 1 ? "photo" : "photos"} in your gallery.`;
}

async function copyQueuedPhotoForPerson(item, row) {
  if (selectingPhoto) return;
  const session = mediaEditSession("trip");
  if (!session) {
    pickerDialog.querySelector("[data-person-photo-picker-status]").textContent = "Reopen the trip editor before choosing a queued photo.";
    return;
  }

  const requestId = pickerRequestId;
  setSelectionBusy(true, item.name || item.filename);
  try {
    const response = await protectedFetch("/api/photo-queue/copy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: item.filename, targetCategory: "people" })
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "Could not add this queued photo.");
    }
    const media = await response.json();
    if (!trackCreatedMedia(session, media, item.filename)) return;
    const photo = canonicalMediaRef(media);
    if (!photo) throw new Error("Could not prepare this photo for the person.");
    if (requestId !== pickerRequestId || !pickerDialog.open || activePersonRow !== row) return;
    applyPersonPhoto(row, photo);
    pickerDialog.close();
  } catch (error) {
    if (requestId !== pickerRequestId || !pickerDialog.open) return;
    setSelectionBusy(false);
    pickerDialog.querySelector("[data-person-photo-picker-status]").textContent = error.message || "Could not add this photo.";
  }
}

function renderPickerPhotos() {
  if (!pickerDialog) return;
  const query = pickerDialog.querySelector("[data-person-photo-picker-search]").value.trim().toLowerCase();
  const matching = pickerPhotos.filter((item) => {
    if (!query) return true;
    return [
      item.name,
      item.filename,
      item.caption,
      ...(Array.isArray(item.captions) ? item.captions : []),
      galleryCategoryLabels[item.category] || item.category
    ].filter(Boolean).join(" ").toLowerCase().includes(query);
  });

  const currentPhoto = activePersonRow?.__personPhoto;
  const currentKey = currentPhoto?.category && currentPhoto?.filename
    ? `${currentPhoto.category}/${currentPhoto.filename}`
    : "";
  const cards = matching.map((item) => {
    const index = pickerPhotos.indexOf(item);
    const name = item.name || item.filename || "Gallery photo";
    const category = galleryCategoryLabels[item.category] || item.category || "Photo";
    const key = `${item.category}/${item.filename}`;
    return html`
      <button class="person-photo-choice${key === currentKey ? " is-current" : ""}" type="button" data-person-photo-choice="${index}" aria-label="Select ${name} from ${category}" aria-pressed="${key === currentKey}">
        <img src="${previewImage(item)}" alt="" loading="lazy" />
        <span class="person-photo-choice-name">${name}</span>
        <span class="person-photo-choice-category">${category}</span>
      </button>`;
  });

  const status = pickerDialog.querySelector("[data-person-photo-picker-status]");
  status.textContent = matching.length
    ? `${matching.length} ${matching.length === 1 ? "photo" : "photos"}${query ? " found" : " in your gallery"}.`
    : pickerPhotos.length
      ? "No gallery photos match that search."
      : "No uploaded photos are available yet. You can upload one below.";
  setHtml(pickerDialog.querySelector("[data-person-photo-picker-grid]"), joinHtml(cards));
}

export async function openPersonPhotoPicker(row) {
  if (!row?.isConnected) return;
  const dialog = ensurePickerDialog();
  if (dialog.open) dialog.close();
  setSelectionBusy(false);
  activePersonRow = row;
  pickerPhotos = [];
  const requestId = ++pickerRequestId;
  dialog.querySelector("[data-person-photo-picker-search]").value = "";
  dialog.querySelector("[data-person-photo-picker-status]").textContent = "Loading gallery photos…";
  setHtml(dialog.querySelector("[data-person-photo-picker-grid]"), html``);
  dialog.showModal();
  dialog.querySelector("[data-person-photo-picker-search]").focus();

  try {
    const response = await fetch("/api/gallery?category=all");
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "Could not load gallery photos.");
    }
    const payload = await response.json();
    if (requestId !== pickerRequestId || !dialog.open) return;
    pickerPhotos = (payload.media || []).filter((item) => !isVideoMedia(item) && previewImage(item));
    renderPickerPhotos();
  } catch (error) {
    if (requestId !== pickerRequestId || !dialog.open) return;
    dialog.querySelector("[data-person-photo-picker-status]").textContent = error.message || "The gallery could not be loaded.";
    setHtml(dialog.querySelector("[data-person-photo-picker-grid]"), html``);
  }
}
