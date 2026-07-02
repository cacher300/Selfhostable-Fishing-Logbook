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

async function loadGalleryItems() {
  const response = await fetch(`/api/gallery?category=${encodeURIComponent(activeGalleryCategory)}`);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Could not load gallery");
  }
  const payload = await response.json();
  return payload.media || [];
}

async function loadOrphanMediaItems() {
  const response = await fetch("/api/orphaned-media");
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Could not load orphaned media");
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

function galleryCard(item, options = {}) {
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
        <a class="button secondary" href="${escapeHtml(item.downloadUrl || item.url)}" download="${escapeHtml(downloadName)}">Download Original</a>
        ${options.orphan ? `<button class="button danger" type="button" data-delete-orphan-media="${escapeHtml(item.filename)}" data-delete-orphan-category="${escapeHtml(item.category)}">Delete From Drive</button>` : ""}
      </div>
    </article>
  `;
}

async function renderOrphanMedia() {
  els.orphanMediaStatus.textContent = "Scanning for orphaned media...";
  els.orphanMediaGrid.innerHTML = "";
  try {
    const items = await loadOrphanMediaItems();
    els.orphanMediaStatus.textContent = items.length === 1 ? "1 orphaned upload" : `${items.length} orphaned uploads`;
    if (!items.length) {
      els.orphanMediaGrid.innerHTML = `<div class="empty-state"><p>No orphaned uploads found.</p></div>`;
      return;
    }
    els.orphanMediaGrid.innerHTML = items.map((item) => galleryCard(item, { orphan: true })).join("");
  } catch (error) {
    console.error("Could not render orphaned media.", error);
    els.orphanMediaStatus.textContent = error.message || "Could not scan orphaned media.";
    els.orphanMediaGrid.innerHTML = `<div class="empty-state"><p>The orphaned media scan could not be loaded.</p></div>`;
  }
}

async function deleteOrphanMedia(category, filename) {
  if (!category || !filename) return;
  if (!confirm("Delete this orphaned upload from the drive?")) return;
  try {
    const response = await protectedFetch(`/api/uploads/${encodeURIComponent(category)}/${encodeURIComponent(filename)}`, { method: "DELETE" });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "Could not delete orphaned media");
    }
    await renderGallery();
  } catch (error) {
    console.error("Could not delete orphaned media.", error);
    els.orphanMediaStatus.textContent = error.message || "Could not delete orphaned media.";
  }
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
      await renderOrphanMedia();
      return;
    }
    els.galleryGrid.innerHTML = items.map(galleryCard).join("");
    await renderOrphanMedia();
  } catch (error) {
    console.error("Could not render gallery.", error);
    els.galleryStatus.textContent = error.message || "Could not load gallery.";
    els.galleryGrid.innerHTML = `<div class="empty-state"><p>The gallery could not be loaded.</p></div>`;
    await renderOrphanMedia();
  }
}
