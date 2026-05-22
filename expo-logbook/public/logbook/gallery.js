const galleryCategoryLabels = {
  all: "All uploads",
  "catch-photos": "Catch photos",
  "trip-photos": "Trip photos",
  lures: "Lures",
  flashers: "Flashers",
  queue: "Photo queue"
};

async function loadGalleryItems() {
  const response = await fetch(apiUrl(`/api/gallery?category=${encodeURIComponent(activeGalleryCategory)}`));
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Could not load gallery");
  }
  const payload = await response.json();
  return payload.media || [];
}

function formatFileSize(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return "";
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${trimNumber(value / (1024 * 1024))} MB`;
}

function renderGalleryFilters() {
  const options = Object.entries(galleryCategoryLabels);
  els.galleryCategoryFilter.innerHTML = options.map(([value, label]) => (
    `<option value="${escapeHtml(value)}" ${value === activeGalleryCategory ? "selected" : ""}>${escapeHtml(label)}</option>`
  )).join("");
}

function galleryCard(item) {
  const title = item.name || item.filename || "Upload";
  const details = [
    galleryCategoryLabels[item.category] || item.category,
    item.mediaType || "",
    formatFileSize(item.size)
  ].filter(Boolean).join(" / ");
  const downloadName = item.name || item.filename || "download";
  return `
    <article class="gallery-card">
      <div class="gallery-media">
        ${mediaMarkup(item)}
      </div>
      <div class="gallery-card-body">
        <strong title="${escapeHtml(title)}">${escapeHtml(title)}</strong>
        <span>${escapeHtml(details)}</span>
        ${item.captureTime ? `<span>${escapeHtml([item.captureDate, item.captureTime].filter(Boolean).join(" "))}</span>` : ""}
        <a class="button secondary" href="${escapeHtml(mediaUrl(item.downloadUrl || item.url))}" download="${escapeHtml(downloadName)}">Download Original</a>
      </div>
    </article>
  `;
}

async function renderGallery() {
  renderGalleryFilters();
  els.galleryStatus.textContent = "Loading gallery...";
  els.galleryGrid.innerHTML = "";
  try {
    const items = await loadGalleryItems();
    els.galleryStatus.textContent = items.length === 1 ? "1 upload" : `${items.length} uploads`;
    if (!items.length) {
      els.galleryGrid.innerHTML = `<div class="empty-state"><p>No uploaded media in this category.</p></div>`;
      return;
    }
    els.galleryGrid.innerHTML = items.map(galleryCard).join("");
  } catch (error) {
    console.error("Could not render gallery.", error);
    els.galleryStatus.textContent = error.message || "Could not load gallery.";
    els.galleryGrid.innerHTML = `<div class="empty-state"><p>The gallery could not be loaded.</p></div>`;
  }
}
