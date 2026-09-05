function summaryMetric(label, value) {
  return `<article class="metric-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "0")}</strong></article>`;
}

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

function timelinePhotoTitle(photo) {
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

function summaryValueItem(label, value, options = {}) {
  return `
    <span class="${options.muted ? "summary-value muted-value" : "summary-value"}">
      <strong>${escapeHtml(label)}</strong>
      ${escapeHtml(value || "Not logged")}
    </span>
  `;
}

function displaySpeedValue(value) {
  return displayStoredMeasurement(value, "speed");
}

function displayFowValue(value) {
  const text = displayStoredMeasurement(value, "depth");
  return /\bFOW\b/i.test(text) ? text : `${text} FOW`;
}

function setupTimelineRecord(trip, gearItem, index) {
  const rodReel = comboName(gearItem.comboId) || [rodName(gearItem.rodId), reelName(gearItem.reelId)].filter(Boolean).join(" + ");
  const rod = rodReel || [setupLineSideLabel(gearItem.side), gearItem.lineLabel].filter(Boolean).join(" ") || `Rod ${index + 1}`;
  const lure = [lureName(gearItem.lureId), flasherName(gearItem.flasherId)].filter(Boolean).join(" + ");
  const position = [
    setupLineSideLabel(gearItem.side),
    gearItem.lineLabel
  ].filter(Boolean).join(" \u00b7 ");
  return {
    rod: displayTitleText(rod),
    rodReel: displayTitleText(rodReel),
    presentation: presentationLabel(gearItem.presentation),
    lure: displayTitleText(lure),
    position: displayTitleText(position),
    startTime: gearItem.startTime ? formatDisplayTime(gearItem.startTime) : "",
    endTime: gearItem.endTime ? formatDisplayTime(gearItem.endTime) : "",
    changeNote: displaySentenceText(gearItem.changeNote || "")
  };
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

function renderTripKeyConditions(trip) {
  const {
    weatherData,
    window,
    noApiWeather,
    primaryWindText
  } = tripWeatherSummaryData(trip);
  if (noApiWeather && !trip.weather && !trip.waterTemp && !trip.wind && !trip.structure) {
    return `
      <section class="summary-weather-empty">
        ${summaryValueItem("API Weather", weatherData.message || "Add a mapped location pin to fetch weather.")}
      </section>
    `;
  }
  return `
    <section class="summary-section summary-key-conditions" aria-label="Key conditions">
      <div class="metric-grid summary-condition-metrics">
        ${summaryMetric("Weather", trip.weather || catchWeatherSummary(weatherData) || "Not logged")}
        ${summaryMetric("Water Temp", displayStoredMeasurement(trip.waterTemp, "waterTemperature") || "Not logged")}
        ${summaryMetric("Wind", primaryWindText || "Not logged")}
        ${summaryMetric("FOW Range", displayStoredMeasurement(trip.structure, "depth") || "Not logged")}
      </div>
    </section>
  `;
}

function renderTripWeatherDetailsSection(trip) {
  const {
    weatherData,
    window,
    daily,
    trend,
    noApiWeather,
    barometricTrend,
    moonText,
    sunriseSunset
  } = tripWeatherSummaryData(trip);
  if (noApiWeather) {
    return weatherData.message ? `
      <section class="summary-section summary-weather-details-section">
        <h3>Weather Details</h3>
        <div class="summary-weather-empty">
          ${summaryValueItem("API Weather", weatherData.message)}
        </div>
      </section>
    ` : "";
  }
  return `
    <section class="summary-section summary-weather-details-section">
      <h3>Weather Details</h3>
      <div class="weather-secondary-grid">
        ${summaryValueItem("Pressure", weatherValueWithTrend(formatUnitValue(window.pressureHpa, "pressure", "hPa", { decimals: 1 }), trend.pressureTrend), { muted: true })}
        ${summaryValueItem("Front Tag", weatherData.frontTag || "", { muted: true })}
        ${summaryValueItem("Moon", moonText, { muted: true })}
        ${summaryValueItem("Humidity", weatherValue(window.humidityPercent, "%"), { muted: true })}
        ${summaryValueItem("Cloud Cover", weatherValue(window.cloudCoverPercent, "%"), { muted: true })}
        ${summaryValueItem("Sunrise / Sunset", sunriseSunset, { muted: true })}
        ${summaryValueItem("Precipitation", formatUnitValue(window.precipitationIn ?? daily.precipitationIn, "precipitation", "in", { decimals: 1 }), { muted: true })}
        ${summaryValueItem("Barometric Trend", barometricTrend, { muted: true })}
        ${summaryValueItem("Wave / Chop", formatWaveHeightChopLine(trip, weatherData), { muted: true })}
        ${summaryValueItem("Air Temp", formatUnitValue(window.temperatureC, "airTemperature", "C"), { muted: true })}
      </div>
    </section>
  `;
}

function catchMetaRow(label, value) {
  if (!value) return "";
  return `
    <div class="catch-meta-row">
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value)}</dd>
    </div>
  `;
}

function renderCatchReportDetails(trip, catchItem) {
  const record = resolveTripLineRecord({ ...catchItem, trip });
  const presentation = record.presentation || "";
  const trollingTrip = isTrollingTripRecord(trip);
  const castingTrip = String(trip?.method || "").toLowerCase() === "casting";
  const depthDetails = [];
  if (record.fowCaught) depthDetails.push(displayFowValue(record.fowCaught));
  if (record.depthDown) depthDetails.push(`${displayStoredMeasurement(record.depthDown, "depth")} down`);
  if (presentation === "flatline") {
    if (record.flatlineWeightOz) depthDetails.push(`${record.flatlineWeightOz} oz`);
    if (record.estimatedDepth) depthDetails.push(`${displayStoredMeasurement(record.estimatedDepth, "depth")} down`);
  } else if (presentation === "flatline-leadcore") {
    if (record.lineBehindBoard) depthDetails.push(`${displayStoredMeasurement(record.lineBehindBoard, "depth")} behind board`);
    if (record.estimatedLureDepth) depthDetails.push(`${displayStoredMeasurement(record.estimatedLureDepth, "depth")} lure depth`);
  } else if (presentation === "dipsey-diver") {
    if (record.dipseySetting) depthDetails.push(`${record.dipseySetting} setting`);
    if (record.lineOut) depthDetails.push(`${displayStoredMeasurement(record.lineOut, "depth")} out`);
  } else if (record.ballDepth) {
    depthDetails.push(`${displayStoredMeasurement(record.ballDepth, "depth")} ball`);
  }
  if (record.estimatedDepth && presentation !== "flatline") depthDetails.push(`${displayStoredMeasurement(record.estimatedDepth, "depth")} est.`);
  const setupLabel = record.setupLine ? setupLineDisplayLabel(trip, record.setupLine) : "";
  return `
    <dl class="catch-meta-list">
      ${catchMetaRow("Lure", displayTitleText(lureName(record.lureId)))}
      ${trollingTrip ? catchMetaRow("Flasher", displayTitleText(flasherName(record.flasherId))) : ""}
      ${catchMetaRow("Method", trollingTrip ? presentationLabel(presentation) : displayTitleText(trip.method || ""))}
      ${!trollingTrip ? catchMetaRow("Rigging", record.rigging) : ""}
      ${!trollingTrip ? catchMetaRow("Rig details", record.riggingDetails) : ""}
      ${catchMetaRow("Depth", depthDetails.join(" / "))}
      ${catchMetaRow("Spot", spotName(catchItem.spotId))}
      ${trollingTrip ? catchMetaRow("GPS Speed", displaySpeedValue(record.gpsSpeed || record.speed)) : ""}
      ${trollingTrip ? catchMetaRow("Ball Speed", displaySpeedValue(record.ballSpeed)) : ""}
      ${castingTrip ? catchMetaRow("Retrieve", record.retrieve) : ""}
    </dl>
  `;
}

function catchDetailRows(trip, catchItem) {
  const record = resolveTripLineRecord({ ...catchItem, trip });
  const trollingTrip = isTrollingTripRecord(trip);
  const formatWeightDetail = (value) => {
    return displayStoredMeasurement(value, "fishWeight");
  };
  const rows = [
    ["Species", displayTitleText(record.species || catchItem.species)],
    ["Status", record.released ? "Released" : "Kept", "status"],
    ["Time", catchItem.time ? formatDisplayTime(catchItem.time) : ""],
    ["Angler", reportPersonName(trip, catchItem.personId)],
    ["Spot", spotName(catchItem.spotId)],
    ["Water depth", reportDepthValue(record.fowCaught || record.waterDepth)],
    ["Depth Down", reportDepthDown(record, catchItem)],
    ["Length", displayStoredMeasurement(record.length, "fishLength")],
    ["Weight", formatWeightDetail(record.weight)],
    ["Rod", displayTitleText(rodName(record.rodId))],
    ["Lure", displayTitleText(lureName(record.lureId)), "lure", record.lureId],
    ["Rigging", trollingTrip ? "" : record.rigging],
    ["Rig details", trollingTrip ? "" : record.riggingDetails],
    ["Flasher", displayTitleText(flasherName(record.flasherId)), "flasher", record.flasherId],
    ["Presentation", displayTitleText(presentationLabel(record.presentation))],
    ["Direction", displayTitleText(record.direction)],
    ["GPS Speed", displaySpeedValue(record.gpsSpeed || record.speed)],
    ["Ball Speed", displaySpeedValue(record.ballSpeed)],
    ["Flatline Weight", record.flatlineWeightOz ? `${record.flatlineWeightOz} oz` : ""],
    ["Line Behind Board", reportDepthValue(record.lineBehindBoard)],
    ["Leadcore Colors", record.leadcoreColors],
    ["Dipsey Setting", record.dipseySetting],
    ["Line Out", reportDepthValue(record.lineOut)],
    ["Retrieve", record.retrieve],
    ["Shaker", trollingTrip ? (record.shaker ? "Yes" : "No") : ""],
    ["Deepest Rigger", trollingTrip ? (record.deepestRigger ? "Yes" : "No") : ""],
    ["Catch Weather", catchWeatherSummary(catchItem.weatherData || {})],
    ["Notes", displaySentenceText(catchItem.notes), "notes"]
  ].filter(([, value]) => value !== null && value !== undefined && value !== "");
  return `<section class="catch-detail-table-wrap" aria-label="Catch details"><table class="catch-detail-table"><tbody>${rows.map(([label, value, kind = "", lureId = ""]) => `
    <tr class="${label === "Catch Weather" || label === "Notes" ? "catch-detail-table-wide" : ""}"><th scope="row">${escapeHtml(label)}</th><td>${kind === "lure" && lureId
      ? `<button class="catch-detail-lure-link" type="button" data-catch-lure-id="${escapeHtml(lureId)}" aria-label="View lure details for ${escapeHtml(value)}">${escapeHtml(value)}</button>`
      : kind === "flasher" && lureId
        ? `<button class="catch-detail-lure-link" type="button" data-catch-flasher-id="${escapeHtml(lureId)}" aria-label="View flasher details for ${escapeHtml(value)}">${escapeHtml(value)}</button>`
      : escapeHtml(value)}</td></tr>
  `).join("")}</tbody></table></section>`;
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
        ${catchDetailRows(trip, catchItem)}
      </div>
    </div>
  `;
}

function renderTripSummaryCatches(trip) {
  const catches = trip.catches || [];
  if (!catches.length) return `<div class="empty-state compact-empty"><p>No catches logged.</p></div>`;
  return catches.map((catchItem, index) => {
    const status = catchItem.released ? "Released" : "Kept";
    return `
      <article
        class="summary-catch-card"
        data-summary-catch-index="${index}"
        role="button"
        tabindex="0"
        aria-label="${escapeHtml(`Open details for ${displayTitleText(catchItem.species || `Catch ${index + 1}`)}`)}"
      >
        <div class="catch-info">
          <div class="catch-report-heading">
            <div>
              <strong class="catch-title">${escapeHtml(displayTitleText(catchItem.species || `Catch ${index + 1}`))}</strong>
              <span class="catch-subtitle">${escapeHtml(status)}${catchItem.time ? " &middot; " : ""}${catchItem.time ? escapeHtml(formatDisplayTime(catchItem.time)) : ""}</span>
            </div>
          </div>
          ${renderCatchReportDetails(trip, catchItem)}
          ${catchItem.notes ? `<p>${escapeHtml(displaySentenceText(catchItem.notes))}</p>` : ""}
        </div>
        ${renderCatchMediaGallery(catchItem.photos || [], catchItem.species || `Catch ${index + 1}`, {
          catchIndex: index,
          heroPhotoId: catchItem.heroPhotoId,
          context: "summary"
        })}
      </article>
    `;
  }).join("");
}
