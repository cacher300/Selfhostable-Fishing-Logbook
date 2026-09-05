function previewImage(item) {
  return item?.previewImage || item?.previewUrl || item?.image || item?.url || "";
}

function isVideoMedia(item) {
  return item?.mediaType === "video" || item?.mimeType?.startsWith?.("video/");
}

function originalMediaUrl(item) {
  return item?.url || item?.image || previewImage(item);
}

function mediaMarkup(item, className = "") {
  const source = previewImage(item);
  if (!source) return "";
  if (isVideoMedia(item)) {
    const videoSource = originalMediaUrl(item) || source;
    return `<video class="${escapeHtml(className)}" src="${escapeHtml(videoSource)}" controls preload="metadata"></video>`;
  }
  return `<img class="${escapeHtml(className)}" src="${escapeHtml(source)}" alt="">`;
}

function isUsableCoordinates(coordinates) {
  if (!coordinates) return false;
  const latitude = Number(coordinates.latitude);
  const longitude = Number(coordinates.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return false;
  return !(latitude === 0 && longitude === 0);
}
