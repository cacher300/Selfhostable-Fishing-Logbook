function tripSpeciesSummary(trip) {
  const speciesCounts = new Map();
  (trip.catches || []).forEach((catchItem) => {
    const species = String(catchItem.species || "").trim();
    if (!species) return;
    speciesCounts.set(species, (speciesCounts.get(species) || 0) + fishCount(catchItem));
  });
  const topSpecies = [...speciesCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return {
    count: speciesCounts.size,
    top: topSpecies ? `${displayTitleText(topSpecies[0])} (${topSpecies[1]})` : "None"
  };
}
const displayLowercaseTokens = new Set(["mph", "hPa", "kph", "km", "mm", "cm", "lb", "lbs", "ft", "in"]);

function displayTitleText(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.replace(/\S+/g, (word) => {
    const bare = word.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "");
    if (!bare) return word;
    if (displayLowercaseTokens.has(bare)) return word;
    if (/^[A-Z0-9]{2,}$/.test(bare)) return word;
    const firstLetterIndex = word.search(/[A-Za-z]/);
    if (firstLetterIndex < 0) return word;
    return `${word.slice(0, firstLetterIndex)}${word[firstLetterIndex].toUpperCase()}${word.slice(firstLetterIndex + 1)}`;
  });
}
function displaySentenceText(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.replace(/(^|[.!?]\s+)([a-z])/g, (match, prefix, letter) => `${prefix}${letter.toUpperCase()}`);
}
function displayPhotoTitle(photo) {
  return displaySentenceText(photo.caption || "Trip photo");
}

function summaryPhotoGrid(photos = [], emptyText = "No photos", options = {}) {
  if (!photos.length) return `<div class="empty-state compact-empty"><p>${escapeHtml(emptyText)}</p></div>`;
  const className = ["summary-photo-grid", options.compact ? "compact-photo-grid" : "", options.hero ? "hero-photo-grid" : ""].filter(Boolean).join(" ");
  return `
    <div class="${className}">
      ${photos.map((photo, index) => `
        <figure class="summary-photo-card">
          ${options.openable && !isVideoMedia(photo) ? `<button class="summary-photo-open" type="button" data-report-photo-index="${index}" aria-label="Enlarge ${escapeHtml(displayPhotoTitle(photo))}">${mediaMarkup(photo, "summary-photo-asset")}</button>` : mediaMarkup(photo, "summary-photo-asset")}
          ${!options.hideCaptions && photo.caption ? `<figcaption>${escapeHtml(displayPhotoTitle(photo))}</figcaption>` : ""}
        </figure>
      `).join("")}
    </div>
  `;
}
function catchMediaAltText(speciesOrTitle = "", index = 0, options = {}) {
  const label = displayTitleText(speciesOrTitle || "Catch");
  const mediaType = options.video ? "video" : "photo";
  if (options.thumbnail) return `${label} catch ${mediaType} ${index + 1}`;
  return `${label} catch ${mediaType}`;
}

function catchMediaPreview(photo, speciesOrTitle, index, options = {}) {
  const source = previewImage(photo);
  if (!source) return "";
  const isVideo = isVideoMedia(photo);
  const alt = options.decorative ? "" : catchMediaAltText(speciesOrTitle, index, { thumbnail: options.thumbnail, video: isVideo });
  if (isVideo && options.thumbnail) {
    const videoSource = originalMediaUrl(photo) || source;
    return `<video class="${escapeHtml(options.className || "")}" src="${escapeHtml(videoSource)}" muted playsinline preload="metadata" aria-hidden="true"></video>`;
  }
  if (isVideo && !options.thumbnail) {
    const videoSource = originalMediaUrl(photo) || source;
    return `<video class="${escapeHtml(options.className || "")}" src="${escapeHtml(videoSource)}" controls preload="metadata" playsinline aria-label="${escapeHtml(catchMediaAltText(speciesOrTitle, index, { video: true }))}"></video>`;
  }
  const imageMarkup = `<img class="${escapeHtml(options.className || "")}" src="${escapeHtml(source)}" alt="${escapeHtml(alt)}" ${options.loading ? `loading="${escapeHtml(options.loading)}"` : ""}>`;
  return imageMarkup;
}

function renderCatchMediaGallery(photos = [], speciesOrTitle = "", options = {}) {
  if (!photos.length) return "";
  const photoCount = photos.length;
  const heroIndex = options.heroPhotoId
    ? photos.findIndex((photo) => photo.id === options.heroPhotoId)
    : -1;
  const requestedIndex = Number.isFinite(Number(options.selectedIndex))
    ? Number(options.selectedIndex)
    : heroIndex;
  const selectedIndex = Math.max(0, Math.min(heroIndex >= 0 && options.selectedIndex === undefined ? heroIndex : requestedIndex || 0, photoCount - 1));
  const selectedPhoto = photos[selectedIndex] || photos[0];
  const thumbnailPhotos = photos.map((photo, index) => ({ photo, index }));
  const showAllThumbnails = Boolean(options.showAllThumbnails);
  const visibleThumbnailPhotos = showAllThumbnails ? thumbnailPhotos : thumbnailPhotos.slice(0, 4);
  const hiddenThumbnailCount = showAllThumbnails ? 0 : Math.max(0, thumbnailPhotos.length - visibleThumbnailPhotos.length);
  const galleryClasses = [
    "catch-media-gallery",
    visibleThumbnailPhotos.length ? "has-thumbnails" : "is-single",
    showAllThumbnails ? "is-scrollable" : ""
  ].filter(Boolean).join(" ");
  const openButton = options.context === "summary"
    ? `
      <button
        class="featured-image-button"
        type="button"
        data-catch-gallery-open
        data-open-photo-index="${escapeHtml(String(selectedIndex))}"
        aria-label="${escapeHtml(`Open ${catchMediaAltText(speciesOrTitle, selectedIndex, { video: isVideoMedia(selectedPhoto) })} in gallery`)}"
      ></button>
    `
    : "";
  return `
    <section
      class="${galleryClasses}"
      data-catch-media-gallery
      data-gallery-context="${escapeHtml(options.context || "summary")}"
      data-catch-index="${escapeHtml(String(options.catchIndex ?? ""))}"
      data-selected-index="${escapeHtml(String(selectedIndex))}"
      data-photo-count="${escapeHtml(String(photoCount))}"
      data-show-all-thumbnails="${showAllThumbnails ? "true" : "false"}"
      style="--catch-gallery-thumb-count:${Math.max(1, visibleThumbnailPhotos.length)};"
    >
      <div class="featured-image-shell">
        <span class="featured-image-wrap">
          ${catchMediaPreview(selectedPhoto, speciesOrTitle, selectedIndex, {
            className: "featured-image",
            loading: "eager",
            enableDownload: options.context === "detail"
          })}
        </span>
        ${openButton}
      </div>
      ${visibleThumbnailPhotos.length ? `
        <div class="thumbnail-column" aria-label="Catch media thumbnails">
          ${visibleThumbnailPhotos.map(({ photo, index: actualIndex }, thumbIndex) => {
            const isActive = actualIndex === selectedIndex;
            const isMoreButton = hiddenThumbnailCount > 0 && thumbIndex === visibleThumbnailPhotos.length - 1;
            return `
              <button
                class="thumbnail-button ${isActive ? "is-active" : ""}"
                type="button"
                ${isMoreButton ? "data-catch-gallery-open" : "data-catch-gallery-thumb"}
                data-photo-index="${escapeHtml(String(actualIndex))}"
                ${isMoreButton ? `data-open-photo-index="${escapeHtml(String(actualIndex))}"` : ""}
                aria-label="${escapeHtml(isMoreButton ? `Open ${hiddenThumbnailCount} more catch media items` : `Show ${catchMediaAltText(speciesOrTitle, actualIndex, { thumbnail: true, video: isVideoMedia(photo) })}`)}"
                aria-pressed="${isActive ? "true" : "false"}"
              >
                ${catchMediaPreview(photo, speciesOrTitle, actualIndex, { className: "thumbnail-image", loading: "lazy", thumbnail: true, decorative: true })}
                ${isMoreButton ? `<span class="more-overlay">+${hiddenThumbnailCount}</span>` : ""}
              </button>
            `;
          }).join("")}
        </div>
      ` : ""}
    </section>
  `;
}

function displaySpeedValue(value) {
  return displayStoredMeasurement(value, "speed");
}

function displayFowValue(value) {
  const text = displayStoredMeasurement(value, "depth");
  return /\bFOW\b/i.test(text) ? text : `${text} FOW`;
}

function compactSetupDisplayLabel(record = {}) {
  const lineLabel = displayTitleText(record.lineLabel || "");
  const side = displayTitleText(setupLineSideLabel(record.side));
  const presentation = displayTitleText(presentationLabel(record.presentation));
  const rod = displayTitleText(rodName(record.rodId));
  if (lineLabel) return lineLabel;
  return [side, presentation].filter(Boolean).join(" ") || rod;
}

function tripWeatherSummaryData(trip) {
  const weatherData = trip.weatherData || {};
  const window = weatherData.tripWindow || {};
  const daily = weatherData.daily || {};
  const trend = weatherData.trend || {};
  const noApiWeather = !trip.weatherData || weatherData.status === "missing-coordinates" || weatherData.status === "error";
  const barometricTrend = window.pressureTrendRateHpa3h === null || window.pressureTrendRateHpa3h === undefined
    ? ""
    : `${window.pressureTrendRateHpa3h > 0 ? "+" : ""}${formatUnitValue(Math.abs(window.pressureTrendRateHpa3h), "pressure", "hPa", { decimals: 1 })} / 3 hr / ${window.pressureTrendRateLabel || barometricTrendLabel(window.pressureTrendRateHpa3h)}`;
  const windTrend = [
    trend.windTrend,
    trend.windDirectionShiftDegrees ? `${trend.windDirectionShiftDegrees} deg wind shift` : ""
  ].filter(Boolean).join(" / ");
  const primaryWindText = (trip.wind || weatherWindText(weatherData) || formatUnitValue(daily.windSpeedMaxMph, "windSpeed", "mph"))
    .split(",")[0]
    .trim();
  const moonText = weatherData.sunMoon ? `${weatherData.sunMoon.phase} (${weatherData.sunMoon.illuminationPercent}%)` : "";
  const sunriseSunset = [timeText(weatherData.sunMoon?.sunrise) || daily.sunrise?.slice(11, 16), timeText(weatherData.sunMoon?.sunset) || daily.sunset?.slice(11, 16)].filter(Boolean).join(" / ");
  return {
    weatherData,
    window,
    daily,
    trend,
    noApiWeather,
    barometricTrend,
    primaryWindText,
    moonText,
    sunriseSunset
  };
}

const CATCH_DETAIL_GROUPS = Object.freeze([
  { id: "overview", label: "Catch overview" },
  { id: "tackle", label: "Tackle" },
  { id: "location", label: "Location & depth" },
  { id: "conditions", label: "Conditions" },
  { id: "presentation", label: "Presentation", wide: true },
  { id: "trolling", label: "Trolling details", wide: true },
  { id: "notes", label: "Notes", wide: true }
]);

function catchDetailValueMarkup(row) {
  if (row.kind === "lure" && row.lureId) {
    return `<button class="catch-detail-lure-link" type="button" data-catch-lure-id="${escapeHtml(row.lureId)}" aria-label="View lure details for ${escapeHtml(row.value)}">${escapeHtml(row.value)}</button>`;
  }
  if (row.kind === "flasher" && row.lureId) {
    return `<button class="catch-detail-lure-link" type="button" data-catch-flasher-id="${escapeHtml(row.lureId)}" aria-label="View flasher details for ${escapeHtml(row.value)}">${escapeHtml(row.value)}</button>`;
  }
  return escapeHtml(row.value);
}

function catchDetailRows(trip, catchItem, catchIndex) {
  const record = resolveTripLineRecord({ ...catchItem, trip });
  const trollingTrip = isTrollingTripRecord(trip);
  const formatWeightDetail = (value) => {
    return displayStoredMeasurement(value, "fishWeight");
  };
  const rows = [
    { key: "species", group: "overview", label: "Species", value: displayTitleText(record.species || catchItem.species) },
    { key: "status", group: "overview", label: "Status", value: record.released ? "Released" : "Kept", kind: "status" },
    { key: "time", group: "overview", label: "Time", value: catchItem.time ? formatDisplayTime(catchItem.time) : "" },
    { key: "angler", group: "overview", label: "Angler", value: reportPersonName(trip, catchItem.personId) },
    { key: "length", group: "overview", label: "Length", value: displayStoredMeasurement(record.length, "fishLength") },
    { key: "weight", group: "overview", label: "Weight", value: formatWeightDetail(record.weight) },
    { key: "spot", group: "location", label: "Spot", value: spotName(catchItem.spotId) },
    { key: "waterDepth", group: "location", label: "Water depth", value: reportDepthValue(record.fowCaught || record.waterDepth) },
    { key: "depthDown", group: "location", label: "Depth down", value: reportDepthDown(record, catchItem) },
    { key: "rod", group: "tackle", label: "Rod", value: displayTitleText(rodName(record.rodId)) },
    { key: "lure", group: "tackle", label: "Lure", value: displayTitleText(lureName(record.lureId)), kind: "lure", lureId: record.lureId },
    { key: "rigging", group: "tackle", label: "Rigging", value: trollingTrip ? "" : record.rigging },
    { key: "riggingDetails", group: "tackle", label: "Rig details", value: trollingTrip ? "" : record.riggingDetails },
    { key: "flasher", group: "tackle", label: "Flasher", value: displayTitleText(flasherName(record.flasherId)), kind: "flasher", lureId: record.flasherId },
    { key: "presentation", group: "presentation", label: "Presentation", value: displayTitleText(presentationLabel(record.presentation)) },
    { key: "direction", group: "presentation", label: "Direction", value: displayTitleText(record.direction) },
    { key: "gpsSpeed", group: "presentation", label: "GPS speed", value: displaySpeedValue(record.gpsSpeed || record.speed) },
    { key: "ballSpeed", group: "presentation", label: "Ball speed", value: displaySpeedValue(record.ballSpeed) },
    { key: "ballTemp", group: "presentation", label: "Ball temp", value: displayStoredMeasurement(record.ballTemp, "waterTemperature") },
    { key: "flatlineWeight", group: "trolling", label: "Flatline weight", value: record.flatlineWeightOz ? `${record.flatlineWeightOz} oz` : "" },
    { key: "lineBehindBoard", group: "trolling", label: "Line behind board", value: reportDepthValue(record.lineBehindBoard) },
    { key: "leadcoreColors", group: "trolling", label: "Leadcore colors", value: record.leadcoreColors },
    { key: "dipseySetting", group: "trolling", label: "Dipsey setting", value: record.dipseySetting },
    { key: "lineOut", group: "trolling", label: "Line out", value: reportDepthValue(record.lineOut) },
    { key: "retrieve", group: "trolling", label: "Retrieve", value: record.retrieve },
    { key: "shaker", group: "trolling", label: "Shaker", value: trollingTrip ? (record.shaker ? "Yes" : "No") : "" },
    { key: "deepestRigger", group: "trolling", label: "Deepest rigger", value: trollingTrip ? (record.deepestRigger ? "Yes" : "No") : "" },
    { key: "catchWeather", group: "conditions", label: "Catch weather", value: catchWeatherSummary(catchItem.weatherData || {}), wide: true, hideLabel: true },
    { key: "notes", group: "notes", label: "Notes", value: displaySentenceText(catchItem.notes), kind: "notes", wide: true }
  ].filter(({ value }) => value !== null && value !== undefined && value !== "");
  const visibleGroups = CATCH_DETAIL_GROUPS.map((group) => ({
    ...group,
    rows: rows.filter((row) => row.group === group.id)
  })).filter(({ rows: groupRows }) => groupRows.length);
  return `<section class="catch-detail-fields-wrap" aria-label="Catch details"><div class="catch-detail-groups">${visibleGroups.map((group) => `
    <section class="catch-detail-group catch-detail-group-${group.id}${group.wide ? " catch-detail-group-wide" : ""}" aria-labelledby="catch-detail-group-${group.id}">
      <h3 id="catch-detail-group-${group.id}">${escapeHtml(group.label)}</h3>
      <dl class="catch-detail-fields${group.rows.length === 1 ? " catch-detail-fields-single" : ""}">${group.rows.map((row) => `
        <div class="catch-detail-field${row.wide ? " catch-detail-field-wide" : ""}${row.kind === "notes" ? " catch-detail-field-notes" : ""}">
          <dt class="${row.hideLabel ? "visually-hidden" : ""}">${escapeHtml(row.label)}</dt>
          <dd class="${row.kind === "status" ? "catch-detail-value-status" : ""}">${catchDetailValueMarkup(row)}</dd>
        </div>
      `).join("")}</dl>${group.id === "location" ? `
      <div class="catch-detail-location-action">
        <button class="button secondary compact-action" type="button" data-show-catch-map data-catch-index="${catchIndex}" aria-controls="catchDetailLocationPopout" aria-label="Show ${escapeHtml(displayTitleText(catchItem.species || "catch"))} location on map">Show on map</button>
        <div id="catchDetailLocationHost"></div>
      </div>` : ""}
    </section>
  `).join("")}</div></section>`;
}

function reportAdditionalConditionRows(trip) {
  const {
    weatherData,
    window,
    daily,
    trend,
    noApiWeather,
    barometricTrend,
    moonText
  } = tripWeatherSummaryData(trip);
  if (noApiWeather) return weatherData.message ? [["API weather", weatherData.message]] : [];
  return [
    ["Air temperature", formatUnitValue(window.temperatureC, "airTemperature", "C")],
    ["Pressure", weatherValueWithTrend(formatUnitValue(window.pressureHpa, "pressure", "hPa", { decimals: 1 }), trend.pressureTrend)],
    ["Barometric trend", barometricTrend],
    ["Front tag", weatherData.frontTag],
    ["Humidity", weatherValue(window.humidityPercent, "%")],
    ["Cloud cover", weatherValue(window.cloudCoverPercent, "%")],
    ["Precipitation", formatUnitValue(window.precipitationIn ?? daily.precipitationIn, "precipitation", "in", { decimals: 1 })],
    ["Moon", moonText]
  ];
}

function renderCatchDetailPopout(trip, catchItem, index, selectedIndex) {
  return `
    <div class="catch-detail-popout" id="catchDetailPopout" role="dialog" aria-modal="true" aria-label="Catch details">
      <div class="catch-detail-panel">
        <button class="icon-button catch-detail-close" type="button" data-close-catch-detail aria-label="Close catch details"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg></button>
        ${renderCatchMediaGallery(catchItem.photos || [], catchItem.species || `Catch ${index + 1}`, {
          catchIndex: index,
          selectedIndex,
          heroPhotoId: catchItem.heroPhotoId,
          context: "detail",
          showAllThumbnails: true
        })}
        ${catchDetailRows(trip, catchItem, index)}
      </div>
    </div>
  `;
}

function renderCatchDetailLocationPopout(trip, catchItem, index) {
  const title = displayTitleText(catchItem.species || "Catch location");
  return `
    <div class="catch-detail-location-popout" id="catchDetailLocationPopout" data-catch-index="${index}" data-catch-location-scope="trip" role="dialog" aria-modal="true" aria-labelledby="catchDetailLocationTitle">
      <div class="catch-detail-location-panel">
        <div class="catch-detail-location-header">
          <div>
            <p class="eyebrow">Catch location</p>
            <h2 id="catchDetailLocationTitle">${escapeHtml(title)}</h2>
          </div>
          <button class="icon-button" type="button" data-close-catch-map aria-label="Close catch location map"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg></button>
        </div>
        <div class="catch-detail-location-tools" role="group" aria-label="Catch map scope">
          <button class="catch-detail-location-scope is-active" type="button" data-catch-location-scope="trip" aria-pressed="true">Trip catches</button>
          <button class="catch-detail-location-scope" type="button" data-catch-location-scope="all" aria-pressed="false">All catches</button>
        </div>
        <div id="catchDetailLocationLegend" class="catch-detail-location-legend" aria-label="Map legend"></div>
        <div id="catchDetailLocationMap" class="fish-map catch-detail-location-map"></div>
      </div>
    </div>
  `;
}
