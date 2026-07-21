const galleryCategoryLabels = {
  all: "All uploads",
  "catch-photos": "Catch photos",
  "trip-photos": "Trip photos",
  lures: "Lures",
  flashers: "Flashers",
  reels: "Reels",
  rods: "Rods",
  queue: "Photo queue"
};

const galleryQuickFilters = [
  { value: "all", label: "All" },
  { value: "photos", label: "Photos" },
  { value: "videos", label: "Videos" },
  { value: "trip-photos", label: "Trip Photos" },
  { value: "catch-photos", label: "Catch Photos" },
  { value: "lures", label: "Lures" },
  { value: "flashers", label: "Flashers" },
  { value: "reels", label: "Reels" },
  { value: "rods", label: "Rods" }
];

let galleryItems = [];
let galleryVisibleItems = [];
let activeGalleryQuickFilter = "all";
let activeGallerySearch = "";
let activeGallerySort = "newest";
let activeGalleryPageSize = "50";
let activeGalleryPage = 1;
let gallerySelectionMode = false;
let selectedGalleryItems = new Set();
let activeGalleryLightboxIndex = -1;

async function loadGalleryItems() {
  const response = await fetch(`/api/gallery?category=${encodeURIComponent(activeGalleryCategory)}`);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Could not load gallery");
  }
  const payload = await response.json();
  return payload.media || [];
}

function galleryItemKey(item) {
  return `${item.category}/${item.filename}`;
}

function findGalleryItem(key) {
  return galleryItems.find((item) => galleryItemKey(item) === key) || null;
}

function formatFileSize(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return "";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${trimNumber(value / (1024 * 1024))} MB`;
}

function galleryCaptureText(item, fallback = "No capture time") {
  const date = item.captureDate ? formatDate(item.captureDate) : "";
  const time = item.captureTime ? formatDisplayTime(item.captureTime) : "";
  return [date, time].filter(Boolean).join(" ") || fallback;
}

function galleryMediaTypeLabel(item) {
  return isVideoMedia(item) ? "Video" : "Photo";
}

function gallerySourceLabel(item) {
  return galleryCategoryLabels[item.category] || item.category || "Uploads";
}

function gallerySortValue(item) {
  const capture = `${item.captureDate || ""}T${item.captureTime || ""}`;
  const captureTime = Date.parse(capture);
  if (Number.isFinite(captureTime)) return captureTime;
  return Number(item.modified || 0) * 1000;
}

function galleryMediaKey(item) {
  const path = String(item?.path || "");
  if (path.includes("/")) return path;
  const category = String(item?.category || "");
  const filename = String(item?.filename || "");
  if (category && filename) return `${category}/${filename}`;
  for (const field of ["url", "image"]) {
    const value = String(item?.[field] || "");
    if (value.startsWith("/uploads/")) return value.replace("/uploads/", "");
  }
  return "";
}

function galleryStateCaptions(item) {
  const key = galleryMediaKey(item);
  if (!key) return [];
  const captions = [];
  const addCaption = (caption) => {
    const text = String(caption || "").trim();
    if (text && !captions.includes(text)) captions.push(text);
  };
  const visit = (value) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    if (galleryMediaKey(value) === key) addCaption(value.caption);
    Object.values(value).forEach(visit);
  };
  visit(state?.trips || []);
  return captions;
}

function galleryCaptionText(item) {
  const captions = [
    item.caption,
    ...(Array.isArray(item.captions) ? item.captions : []),
    ...galleryStateCaptions(item)
  ];
  return String(captions.find((caption) => String(caption || "").trim()) || "").trim();
}

function renderGalleryFilters() {
  const options = Object.entries(galleryCategoryLabels);
  els.galleryCategoryFilter.innerHTML = options.map(([value, label]) => (
    `<option value="${escapeHtml(value)}" ${value === activeGalleryCategory ? "selected" : ""}>${escapeHtml(label)}</option>`
  )).join("");

  els.galleryQuickFilters.innerHTML = galleryQuickFilters.map((filter) => `
    <button class="gallery-filter-chip${filter.value === activeGalleryQuickFilter ? " is-active" : ""}" type="button" data-gallery-quick-filter="${escapeHtml(filter.value)}" aria-pressed="${filter.value === activeGalleryQuickFilter}">
      ${escapeHtml(filter.label)}
    </button>
  `).join("");
}

function galleryFilteredItems(items) {
  const query = activeGallerySearch.trim().toLowerCase();
  return items.filter((item) => {
    const quickMatch = activeGalleryQuickFilter === "all"
      || (activeGalleryQuickFilter === "photos" && !isVideoMedia(item))
      || (activeGalleryQuickFilter === "videos" && isVideoMedia(item))
      || item.category === activeGalleryQuickFilter;
    if (!quickMatch) return false;
    if (!query) return true;
    return [
      item.name,
      item.filename,
      item.mediaType,
      item.mimeType,
      item.caption,
      ...(Array.isArray(item.captions) ? item.captions : []),
      ...galleryStateCaptions(item),
      gallerySourceLabel(item),
      galleryCaptureText(item, "")
    ].filter(Boolean).join(" ").toLowerCase().includes(query);
  }).sort((a, b) => {
    if (activeGallerySort === "oldest") return gallerySortValue(a) - gallerySortValue(b);
    if (activeGallerySort === "mediaType") return galleryMediaTypeLabel(a).localeCompare(galleryMediaTypeLabel(b)) || gallerySortValue(b) - gallerySortValue(a);
    if (activeGallerySort === "fileSize") return Number(b.size || 0) - Number(a.size || 0);
    return gallerySortValue(b) - gallerySortValue(a);
  });
}

function galleryPageLimit() {
  if (activeGalleryPageSize === "all") return Infinity;
  const limit = Number(activeGalleryPageSize);
  return Number.isFinite(limit) && limit > 0 ? limit : 50;
}

function galleryPageCount(totalItems) {
  const limit = galleryPageLimit();
  if (!Number.isFinite(limit)) return 1;
  return Math.max(1, Math.ceil(totalItems / limit));
}

function setGalleryPage(page) {
  activeGalleryPage = Math.max(1, Number(page) || 1);
  renderGalleryItems();
}

function galleryPreviewMarkup(item) {
  if (isVideoMedia(item)) {
    const videoSource = item.url || item.image || "";
    return `<video src="${escapeHtml(videoSource)}" muted playsinline preload="metadata" aria-hidden="true"></video>`;
  }
  const source = item.previewImage || item.previewUrl || item.image || item.url || "";
  return `<img src="${escapeHtml(source)}" alt="">`;
}

function galleryCard(item, index) {
  const key = galleryItemKey(item);
  const selected = selectedGalleryItems.has(key);
  const downloadName = item.name || item.filename || "download";
  const caption = galleryCaptionText(item);
  return `
    <article class="gallery-card${selected ? " is-selected" : ""}${gallerySelectionMode ? " is-selecting" : ""}" data-gallery-key="${escapeHtml(key)}">
      <label class="gallery-select-control" aria-label="Select ${escapeHtml(downloadName)}">
        <input type="checkbox" data-gallery-select="${escapeHtml(key)}" ${selected ? "checked" : ""}>
        <span></span>
      </label>
      <button class="gallery-thumb-button" type="button" data-gallery-open="${escapeHtml(String(index))}" aria-label="Open ${escapeHtml(downloadName)}">
        <span class="gallery-media">
          ${galleryPreviewMarkup(item)}
          ${caption ? `<span class="gallery-caption">${escapeHtml(caption)}</span>` : ""}
          ${isVideoMedia(item) ? `
            <span class="gallery-play-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 7.5v9l7-4.5z" /></svg></span>
          ` : ""}
        </span>
      </button>
      <div class="gallery-hover-overlay" aria-hidden="true">
        <button type="button" data-gallery-open="${escapeHtml(String(index))}" title="View" aria-label="View"><svg viewBox="0 0 16 16"><path d="M1.5 8s2.25-4 6.5-4 6.5 4 6.5 4-2.25 4-6.5 4-6.5-4-6.5-4z" /><circle cx="8" cy="8" r="2" /></svg></button>
        <a href="${escapeHtml(item.downloadUrl || item.url)}" download="${escapeHtml(downloadName)}" title="Download Original" aria-label="Download Original"><svg viewBox="0 0 16 16"><path d="M8 2v7m0 0 3-3m-3 3L5 6M3 12.5h10" /></svg></a>
        <button type="button" data-gallery-delete="${escapeHtml(key)}" title="Delete" aria-label="Delete"><svg viewBox="0 0 16 16"><path d="M3 4h10M6 4V2.75h4V4m-5 2v6m3-6v6m3-6v6M4.5 4l.5 9h6l.5-9" /></svg></button>
      </div>
      <details class="gallery-more-actions">
        <summary aria-label="More actions"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="3.5" cy="8" r="1" /><circle cx="8" cy="8" r="1" /><circle cx="12.5" cy="8" r="1" /></svg></summary>
        <div>
          <button type="button" data-gallery-open="${escapeHtml(String(index))}">View</button>
          <a href="${escapeHtml(item.downloadUrl || item.url)}" download="${escapeHtml(downloadName)}">Download Original</a>
          <button type="button" data-gallery-delete="${escapeHtml(key)}">Delete</button>
        </div>
      </details>
      <div class="gallery-card-body">
        <span>${escapeHtml(galleryCaptureText(item))}</span>
      </div>
    </article>
  `;
}

function updateGallerySelectionBar() {
  const count = selectedGalleryItems.size;
  els.gallerySelectionBar?.classList.toggle("hidden", !gallerySelectionMode);
  els.galleryBatchDownloadButton?.toggleAttribute("disabled", count === 0);
  els.galleryBatchDeleteButton?.toggleAttribute("disabled", count === 0);
  if (els.gallerySelectModeButton) {
    els.gallerySelectModeButton.textContent = gallerySelectionMode ? "Cancel Select" : "Select Photos";
    els.gallerySelectModeButton.classList.toggle("is-active", gallerySelectionMode);
  }
  if (els.gallerySelectionCount) {
    els.gallerySelectionCount.textContent = count === 1 ? "1 selected" : `${count} selected`;
  }
}

function setGallerySelectionMode(active) {
  gallerySelectionMode = Boolean(active);
  if (!gallerySelectionMode) selectedGalleryItems.clear();
  renderGalleryItems();
}

function renderGalleryItems() {
  const matchedItems = galleryFilteredItems(galleryItems);
  const limit = galleryPageLimit();
  const pageCount = galleryPageCount(matchedItems.length);
  activeGalleryPage = Math.min(Math.max(1, activeGalleryPage), pageCount);
  const startIndex = Number.isFinite(limit) ? (activeGalleryPage - 1) * limit : 0;
  const endIndex = Number.isFinite(limit) ? startIndex + limit : matchedItems.length;
  galleryVisibleItems = matchedItems.slice(startIndex, endIndex);
  selectedGalleryItems = new Set([...selectedGalleryItems].filter((key) => galleryItems.some((item) => galleryItemKey(item) === key)));
  if (els.galleryCount) els.galleryCount.textContent = galleryItems.length === 1 ? "1 upload" : `${galleryItems.length} uploads`;
  els.galleryStatus.textContent = `Showing ${galleryVisibleItems.length} of ${matchedItems.length} ${matchedItems.length === 1 ? "photo" : "photos"} available`;
  els.galleryPagination?.classList.toggle("hidden", pageCount <= 1);
  els.galleryPreviousPageButton?.toggleAttribute("disabled", activeGalleryPage <= 1);
  els.galleryNextPageButton?.toggleAttribute("disabled", activeGalleryPage >= pageCount);
  if (els.galleryPageStatus) els.galleryPageStatus.textContent = `Page ${activeGalleryPage} of ${pageCount}`;
  updateGallerySelectionBar();
  if (!galleryVisibleItems.length) {
    els.galleryGrid.innerHTML = `<div class="empty-state"><p>No uploaded media matches these filters.</p></div>`;
    return;
  }
  els.galleryGrid.innerHTML = galleryVisibleItems.map(galleryCard).join("");
}

async function renderGallery() {
  renderGalleryFilters();
  if (els.galleryCount) els.galleryCount.textContent = "Loading...";
  els.galleryStatus.textContent = "Loading gallery...";
  els.galleryPagination?.classList.add("hidden");
  els.galleryGrid.innerHTML = "";
  try {
    galleryItems = await loadGalleryItems();
    renderGalleryItems();
  } catch (error) {
    console.error("Could not render gallery.", error);
    if (els.galleryCount) els.galleryCount.textContent = "Unavailable";
    els.galleryStatus.textContent = error.message || "Could not load gallery.";
    els.galleryPagination?.classList.add("hidden");
    els.galleryGrid.innerHTML = `<div class="empty-state"><p>The gallery could not be loaded.</p></div>`;
  }
}

function galleryLightboxMarkup(item, index) {
  const downloadName = item.name || item.filename || "download";
  const details = [
    ["Type", galleryMediaTypeLabel(item)],
    ["Source", gallerySourceLabel(item)],
    ["Captured", galleryCaptureText(item)],
    ["File size", formatFileSize(item.size) || "Not available"],
    ["Filename", item.filename || "Not available"],
    ["MIME type", item.mimeType || "Not available"]
  ];
  return `
    <div class="gallery-lightbox" role="dialog" aria-modal="true" aria-label="Media viewer">
      <button class="gallery-lightbox-close" type="button" data-gallery-lightbox-close aria-label="Close"><svg viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8" /></svg></button>
      <button class="gallery-lightbox-nav previous" type="button" data-gallery-lightbox-prev aria-label="Previous media" ${index <= 0 ? "disabled" : ""}><svg viewBox="0 0 16 16"><path d="M10 3 5 8l5 5" /></svg></button>
      <figure class="gallery-lightbox-stage">
        ${isVideoMedia(item)
          ? `<video src="${escapeHtml(item.url || item.image || "")}" controls autoplay playsinline></video>`
          : `<img src="${escapeHtml(item.image || item.url || item.previewImage || "")}" alt="">`}
      </figure>
      <button class="gallery-lightbox-nav next" type="button" data-gallery-lightbox-next aria-label="Next media" ${index >= galleryVisibleItems.length - 1 ? "disabled" : ""}><svg viewBox="0 0 16 16"><path d="m6 3 5 5-5 5" /></svg></button>
      <aside class="gallery-lightbox-details">
        <div>
          <p>${escapeHtml(`${index + 1} of ${galleryVisibleItems.length}`)}</p>
          <h4>${escapeHtml(downloadName)}</h4>
        </div>
        <dl>
          ${details.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}
        </dl>
        <div class="gallery-lightbox-actions">
          <a class="button secondary" href="${escapeHtml(item.downloadUrl || item.url)}" download="${escapeHtml(downloadName)}">Download Original</a>
          <button class="button danger" type="button" data-gallery-delete="${escapeHtml(galleryItemKey(item))}">Delete</button>
        </div>
      </aside>
    </div>
  `;
}

function openGalleryLightbox(index) {
  const item = galleryVisibleItems[index];
  if (!item) return;
  closeGalleryLightbox();
  activeGalleryLightboxIndex = index;
  document.body.insertAdjacentHTML("beforeend", galleryLightboxMarkup(item, index));
  document.body.classList.add("gallery-lightbox-open");
  document.querySelector("[data-gallery-lightbox-close]")?.focus();
}

function closeGalleryLightbox() {
  document.querySelector(".gallery-lightbox")?.remove();
  document.body.classList.remove("gallery-lightbox-open");
  activeGalleryLightboxIndex = -1;
}

function stepGalleryLightbox(direction) {
  const nextIndex = activeGalleryLightboxIndex + direction;
  if (nextIndex < 0 || nextIndex >= galleryVisibleItems.length) return;
  openGalleryLightbox(nextIndex);
}

function selectedGalleryPayload() {
  return [...selectedGalleryItems].map(findGalleryItem).filter(Boolean);
}

function downloadGalleryItems(items) {
  items.forEach((item, index) => {
    setTimeout(() => {
      const link = document.createElement("a");
      link.href = item.downloadUrl || item.url;
      link.download = item.name || item.filename || "download";
      document.body.append(link);
      link.click();
      link.remove();
    }, index * 120);
  });
}

async function deleteGalleryItems(items) {
  const deletable = items.filter((item) => item.category !== "queue");
  if (!deletable.length) {
    alert("Queue media can be removed from the Photo Queue.");
    return;
  }
  const label = deletable.length === 1 ? (deletable[0].name || deletable[0].filename) : `${deletable.length} items`;
  if (!confirm(`Delete ${label}? Media attached to the logbook will be protected.`)) return;
  for (const item of deletable) {
    const response = await protectedFetch(`/api/uploads/${encodeURIComponent(item.category)}/${encodeURIComponent(item.filename)}`, { method: "DELETE" });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || `Could not delete ${item.filename}`);
    }
    selectedGalleryItems.delete(galleryItemKey(item));
  }
  closeGalleryLightbox();
  await renderGallery();
}

function toggleGallerySelection(key, selected) {
  if (!gallerySelectionMode) return;
  if (selected) selectedGalleryItems.add(key);
  else selectedGalleryItems.delete(key);
  const card = els.galleryGrid.querySelector(`[data-gallery-key="${CSS.escape(key)}"]`);
  card?.classList.toggle("is-selected", selected);
  updateGallerySelectionBar();
}

function syncGallerySearchSort() {
  activeGallerySearch = els.gallerySearchInput?.value || "";
  activeGallerySort = els.gallerySortSelect?.value || "newest";
  activeGalleryPageSize = els.galleryPageSizeSelect?.value || "50";
  activeGalleryPage = 1;
  renderGalleryItems();
}
