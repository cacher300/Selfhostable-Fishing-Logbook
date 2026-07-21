function previewImage(item) {
  return item?.previewImage || item?.previewUrl || item?.image || item?.url || "";
}

function isVideoMedia(item) {
  return item?.mediaType === "video" || item?.mimeType?.startsWith?.("video/");
}

function originalMediaUrl(item) {
  return item?.url || item?.image || previewImage(item);
}

function mediaDownloadName(item) {
  const base = String(item?.name || item?.filename || item?.caption || "original-photo")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]+/g, "-")
    .replace(/\s+/g, " ");
  const normalized = base || "original-photo";
  const url = String(originalMediaUrl(item) || "");
  const extensionMatch = url.match(/\.([a-zA-Z0-9]{2,5})(?:[?#]|$)/);
  const extension = extensionMatch ? `.${extensionMatch[1].toLowerCase()}` : ".jpg";
  return /\.[a-zA-Z0-9]{2,5}$/.test(normalized) ? normalized : `${normalized}${extension}`;
}

function mediaMarkup(item, className = "", options = {}) {
  const source = previewImage(item);
  if (!source) return "";
  if (isVideoMedia(item)) {
    const videoSource = originalMediaUrl(item) || source;
    return `<video class="${escapeHtml(className)}" src="${escapeHtml(videoSource)}" controls preload="metadata"></video>`;
  }
  const originalSource = originalMediaUrl(item) || source;
  if (options.download === false) {
    return `<img class="${escapeHtml(className)}" src="${escapeHtml(source)}" alt="">`;
  }
  return `
    <span class="media-download-frame">
      <img class="${escapeHtml(className)}" src="${escapeHtml(source)}" alt="">
      <a
        class="media-download-link"
        href="${escapeHtml(originalSource)}"
        download="${escapeHtml(mediaDownloadName(item))}"
        target="_blank"
        rel="noreferrer"
        aria-label="Download original image"
        title="Download original"
      >
        Download original
      </a>
    </span>
  `;
}

function isUsableCoordinates(coordinates) {
  if (!coordinates) return false;
  const latitude = Number(coordinates.latitude);
  const longitude = Number(coordinates.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return false;
  return !(latitude === 0 && longitude === 0);
}
