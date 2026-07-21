function catchMapRecordForTrip(trip, catchItem, catchIndex) {
  const mediaWithCoordinates = (catchItem.photos || []).find((photo) => isUsableCoordinates(photo.coordinates));
  const coordinates = isUsableCoordinates(catchItem.coordinates) ? catchItem.coordinates : mediaWithCoordinates?.coordinates;
  if (!isUsableCoordinates(coordinates)) return null;
  return {
    id: catchItem.id || `${trip.id}-${catchIndex}`,
    type: "catch",
    filterValue: catchItem.species || "Unknown species",
    trip,
    catchItem,
    media: mediaWithCoordinates,
    coordinates
  };
}

function tripMediaMapRecordsForTrip(trip) {
  const tripSource = tripWeatherCoordinates(trip);
  return (trip.notePhotos || []).map((media, index) => {
    const video = isVideoMedia(media);
    const embeddedCoordinates = isUsableCoordinates(media.coordinates) ? media.coordinates : null;
    const coordinates = embeddedCoordinates || (!video && isUsableCoordinates(tripSource?.coordinates)
      ? tripSource.coordinates
      : null);
    if (!coordinates) return null;
    return {
      id: media.id || `${trip.id}-media-${index}`,
      type: video ? "trip-video" : "trip-photo",
      filterValue: video ? "Trip Videos" : "Trip Photos",
      trip,
      media,
      coordinates,
      coordinateSource: embeddedCoordinates ? "media" : "trip"
    };
  }).filter(Boolean);
}

function mapRecordsForTrip(trip) {
  return [
    ...(trip.catches || []).map((catchItem, catchIndex) => catchMapRecordForTrip(trip, catchItem, catchIndex)).filter(Boolean),
    ...tripMediaMapRecordsForTrip(trip)
  ];
}

function catchMapRecords() {
  return state.trips.flatMap(mapRecordsForTrip);
}

const speciesMarkerColors = [
  "#0b6e43",
  "#2763a7",
  "#bc2f2f",
  "#9a5b00",
  "#6f42c1",
  "#087990",
  "#b4236b",
  "#4d7c0f",
  "#795548",
  "#344054"
];

function speciesColor(species = "Fish") {
  const value = species || "Fish";
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return speciesMarkerColors[hash % speciesMarkerColors.length];
}

function mapRecordColor(record) {
  if (record.type === "trip-photo") return "#2763a7";
  if (record.type === "trip-video") return "#9a5b00";
  return speciesColor(record.catchItem?.species);
}

function addMapMarker(layerGroup, record) {
  const color = mapRecordColor(record);
  return L.circleMarker([record.coordinates.latitude, record.coordinates.longitude], {
    radius: record.type === "catch" ? 8 : 7,
    color,
    fillColor: color,
    fillOpacity: 0.86,
    weight: 2,
    pane: record.type === "catch" ? "fishMarkers" : "tripMediaMarkers"
  }).bindPopup(mapPopupHtml(record)).addTo(layerGroup);
}

function ensureMapMarkerPanes(map) {
  if (!map.getPane("tripMediaMarkers")) {
    map.createPane("tripMediaMarkers");
    map.getPane("tripMediaMarkers").style.zIndex = 610;
  }
  if (!map.getPane("fishMarkers")) {
    map.createPane("fishMarkers");
    map.getPane("fishMarkers").style.zIndex = 620;
  }
}

function seamlessMapOptions() {
  return {
    zoomSnap: 1,
    zoomDelta: 1
  };
}

function snapMapTilePane(map) {
  const tilePane = map?.getPane?.("tilePane");
  if (!tilePane) return;
  tilePane.style.marginLeft = "0px";
  tilePane.style.marginTop = "0px";
  const tile = tilePane.querySelector(".leaflet-tile-loaded, .leaflet-tile");
  const rect = (tile || tilePane).getBoundingClientRect();
  const pixelRatio = window.devicePixelRatio || 1;
  const snappedLeft = Math.round(rect.left * pixelRatio) / pixelRatio;
  const snappedTop = Math.round(rect.top * pixelRatio) / pixelRatio;
  tilePane.style.marginLeft = `${snappedLeft - rect.left}px`;
  tilePane.style.marginTop = `${snappedTop - rect.top}px`;
}

function bindMapTilePaneSnapping(map) {
  if (!map || map._logbookTilePaneSnapping) return;
  map._logbookTilePaneSnapping = true;
  map.on("moveend zoomend resize", () => requestAnimationFrame(() => snapMapTilePane(map)));
}

function addSeamlessTileLayer(map) {
  const tileLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);
  tileLayer.on("load tileload", () => requestAnimationFrame(() => snapMapTilePane(map)));
  bindMapTilePaneSnapping(map);
  return tileLayer;
}

function ensureMapPageChartOverlay(map) {
  if (!map || map._logbookNoaaLayer || map._logbookNoaaLayerUnavailable) return;
  const noaaLayer = window.createNOAAChartLayer?.();
  if (!noaaLayer) {
    map._logbookNoaaLayerUnavailable = true;
    if (els.mapNoaaChartsToggle) {
      els.mapNoaaChartsToggle.checked = false;
      els.mapNoaaChartsToggle.disabled = true;
    }
    return;
  }
  map._logbookNoaaLayer = noaaLayer;
}

function syncMapPageChartOverlay(map) {
  if (!map) return;
  ensureMapPageChartOverlay(map);
  const noaaLayer = map._logbookNoaaLayer;
  if (!noaaLayer) return;

  if (els.mapNoaaChartsToggle) {
    els.mapNoaaChartsToggle.checked = activeMapShowNOAACharts;
    els.mapNoaaChartsToggle.disabled = false;
  }

  if (activeMapShowNOAACharts) {
    if (!map.hasLayer(noaaLayer)) noaaLayer.addTo(map);
    noaaLayer.bringToFront?.();
  } else if (map.hasLayer(noaaLayer)) {
    map.removeLayer(noaaLayer);
  }
}

function settleMapLayout(map) {
  setTimeout(() => {
    map.invalidateSize();
    snapMapTilePane(map);
  }, 0);
}

function mapRecordTitle(record) {
  if (record.type === "trip-photo") return record.media.caption || "Trip photo";
  if (record.type === "trip-video") return record.media.caption || "Trip video";
  return record.catchItem?.species || "Fish";
}

function mapRecordFilterOptions(records, options = {}) {
  const species = records
    .filter((record) => record.type === "catch")
    .map((record) => record.catchItem.species || "Unknown species");
  const mediaTypes = options.includeTripMedia
    ? records.filter((record) => record.type !== "catch").map((record) => record.filterValue)
    : [];
  return [options.allLabel || "All species", ...new Set([...species, ...mediaTypes])];
}

function renderMapSpeciesFilter(records) {
  const options = mapRecordFilterOptions(records, { allLabel: "All species" });
  if (!options.includes(activeMapSpecies)) activeMapSpecies = "All species";
  els.mapSpeciesFilter.innerHTML = options.map((option) => (
    `<option value="${escapeHtml(option)}" ${option === activeMapSpecies ? "selected" : ""}>${escapeHtml(option)}</option>`
  )).join("");
  if (els.mapTripPhotosToggle) els.mapTripPhotosToggle.checked = activeMapIncludeTripMedia;
}

function filteredCatchMapRecords(records, filterValue = activeMapSpecies) {
  const catches = records.filter((record) => record.type === "catch");
  if (filterValue === "All species") return catches;
  return catches.filter((record) => record.filterValue === filterValue);
}

function filteredMapRecords(records, filterValue = activeMapSpecies, options = {}) {
  if (filterValue === "All map items") return records;
  const catches = filteredCatchMapRecords(records, filterValue);
  const media = options.includeTripMedia
    ? records.filter((record) => record.type !== "catch")
    : [];
  return [...catches, ...media];
}

function renderMapLegend(records, options = {}) {
  const species = mapRecordFilterOptions(records, { allLabel: "All species" }).slice(1);
  const mediaTypes = options.includeTripMedia
    ? [...new Set(records.filter((record) => record.type !== "catch").map((record) => record.filterValue))]
    : [];
  const legendItems = [...species, ...mediaTypes];
  if (!legendItems.length) return "";
  return `
    <div class="map-legend">
      ${legendItems.map((name) => `
        <span><i style="--pin-color:${name === "Trip Photos" ? "#2763a7" : name === "Trip Videos" ? "#9a5b00" : speciesColor(name)}"></i>${escapeHtml(name)}</span>
      `).join("")}
    </div>
  `;
}

function mapPopupHtml(record) {
  const { trip, media, coordinates } = record;
  const title = [mapRecordTitle(record), trip.location].filter(Boolean).join(" at ");
  return `
    <div class="map-popup" data-map-view-trip="${escapeHtml(trip.id)}" role="button" tabindex="0">
      ${media?.image ? mediaMarkup(media) : ""}
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(formatDate(trip.date))}</span>
      <button class="map-popup-trip-link" type="button" data-view-trip="${escapeHtml(trip.id)}">View Trip</button>
    </div>
  `;
}

function renderMapList(records) {
  if (!records.length) {
    els.mapCatchList.innerHTML = `<div class="empty-state"><p>No geotagged map items match this filter.</p></div>`;
    return;
  }

  els.mapCatchList.innerHTML = records.map((record) => {
    const { trip, media } = record;
    return `
      <article class="map-catch-card" data-map-view-trip="${escapeHtml(trip.id)}" role="button" tabindex="0">
        ${media?.image ? mediaMarkup(media) : ""}
        <div>
          <strong>${escapeHtml(mapRecordTitle(record))}</strong>
          <span>${escapeHtml([formatDate(trip.date), trip.location].filter(Boolean).join(" / "))}</span>
          <button class="map-popup-trip-link" type="button" data-view-trip="${escapeHtml(trip.id)}">View Trip</button>
        </div>
      </article>
    `;
  }).join("");
}

function renderFishMap() {
  const allRecords = catchMapRecords();
  renderMapSpeciesFilter(allRecords);
  const records = filteredMapRecords(allRecords, activeMapSpecies, { includeTripMedia: activeMapIncludeTripMedia });
  els.mapLegend.innerHTML = renderMapLegend(allRecords, { includeTripMedia: activeMapIncludeTripMedia });
  renderMapList(records);

  if (!window.L) {
    els.fishMap.innerHTML = `<div class="empty-state"><p>Map tiles are unavailable, but saved GPS coordinates are listed below.</p></div>`;
    return;
  }

  if (!fishMap) {
    fishMap = L.map(els.fishMap, seamlessMapOptions());
    addSeamlessTileLayer(fishMap);
    syncMapPageChartOverlay(fishMap);
    ensureMapMarkerPanes(fishMap);
    fishMapMarkers = L.layerGroup().addTo(fishMap);
  }
  syncMapPageChartOverlay(fishMap);
  ensureMapMarkerPanes(fishMap);

  fishMapMarkers.clearLayers();
  if (!records.length) {
    fishMap.setView([43.8, -79.5], 6);
    settleMapLayout(fishMap);
    return;
  }

  const bounds = [];
  records.forEach((record) => {
    const point = [record.coordinates.latitude, record.coordinates.longitude];
    bounds.push(point);
    addMapMarker(fishMapMarkers, record);
  });

  if (bounds.length === 1) fishMap.setView(bounds[0], 13);
  else fishMap.fitBounds(bounds, { padding: [28, 28] });
  settleMapLayout(fishMap);
}

function catchMapRecordsForTrip(trip) {
  return mapRecordsForTrip(trip);
}

function renderTripSummaryMapFilter(records) {
  const filter = document.querySelector("#tripSummaryMapFilter");
  if (!filter) return;
  const options = mapRecordFilterOptions(records, { allLabel: "All map items", includeTripMedia: true });
  if (!options.includes(activeTripSummaryMapFilter)) activeTripSummaryMapFilter = "All map items";
  filter.innerHTML = options.map((option) => (
    `<option value="${escapeHtml(option)}" ${option === activeTripSummaryMapFilter ? "selected" : ""}>${escapeHtml(option)}</option>`
  )).join("");
}

function renderTripSummaryMap(trip) {
  const mapNode = document.querySelector("#tripSummaryMap");
  if (!mapNode) return;
  const allRecords = catchMapRecordsForTrip(trip);
  renderTripSummaryMapFilter(allRecords);
  const legend = document.querySelector("#tripSummaryMapLegend");
  if (legend) legend.innerHTML = renderMapLegend(allRecords, { includeTripMedia: true });
  const records = filteredMapRecords(allRecords, activeTripSummaryMapFilter);

  if (!window.L) {
    mapNode.innerHTML = `<div class="empty-state"><p>Map tiles are unavailable.</p></div>`;
    return;
  }

  if (!tripSummaryMap) {
    tripSummaryMap = L.map(mapNode, seamlessMapOptions());
    addSeamlessTileLayer(tripSummaryMap);
    ensureMapMarkerPanes(tripSummaryMap);
    tripSummaryMapMarkers = L.layerGroup().addTo(tripSummaryMap);
  } else if (tripSummaryMap.getContainer() !== mapNode) {
    tripSummaryMap.remove();
    tripSummaryMap = L.map(mapNode, seamlessMapOptions());
    addSeamlessTileLayer(tripSummaryMap);
    ensureMapMarkerPanes(tripSummaryMap);
    tripSummaryMapMarkers = L.layerGroup().addTo(tripSummaryMap);
  }
  ensureMapMarkerPanes(tripSummaryMap);

  tripSummaryMapMarkers.clearLayers();
  if (!records.length) {
    tripSummaryMap.setView([43.8, -79.5], 6);
    settleMapLayout(tripSummaryMap);
    return;
  }

  const bounds = [];
  records.forEach((record) => {
    const point = [record.coordinates.latitude, record.coordinates.longitude];
    bounds.push(point);
    addMapMarker(tripSummaryMapMarkers, record);
  });

  if (bounds.length === 1) tripSummaryMap.setView(bounds[0], 13);
  else tripSummaryMap.fitBounds(bounds, { padding: [24, 24] });
  settleMapLayout(tripSummaryMap);
}

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
  return displaySentenceText(photo.caption || photo.name || "Trip photo");
}

function timelinePhotoTitle(photo) {
  return displaySentenceText(photo.caption || "Trip photo");
}

function summaryPhotoGrid(photos = [], emptyText = "No photos", options = {}) {
  if (!photos.length) return `<div class="empty-state compact-empty"><p>${escapeHtml(emptyText)}</p></div>`;
  const className = ["summary-photo-grid", options.compact ? "compact-photo-grid" : "", options.hero ? "hero-photo-grid" : ""].filter(Boolean).join(" ");
  return `
    <div class="${className}">
      ${photos.map((photo) => `
        <figure class="summary-photo-card">
          ${mediaMarkup(photo, "summary-photo-asset")}
          ${!options.hideCaptions && (photo.caption || photo.name) ? `<figcaption>${escapeHtml(displayPhotoTitle(photo))}</figcaption>` : ""}
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
  if (!options.enableDownload) return imageMarkup;
  const originalSource = originalMediaUrl(photo) || source;
  return `
    <span class="media-download-frame">
      ${imageMarkup}
      <a
        class="media-download-link"
        href="${escapeHtml(originalSource)}"
        download="${escapeHtml(mediaDownloadName(photo))}"
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

function renderCatchMediaGallery(photos = [], speciesOrTitle = "", options = {}) {
  if (!photos.length) return "";
  const photoCount = photos.length;
  const selectedIndex = Math.max(0, Math.min(Number(options.selectedIndex) || 0, photoCount - 1));
  const selectedPhoto = photos[selectedIndex] || photos[0];
  const thumbnailPhotos = photos
    .map((photo, index) => ({ photo, index }))
    .filter(({ index }) => index !== selectedIndex);
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

function summaryChip(label, value, options = {}) {
  if (!value && !options.showEmpty) return "";
  return `
    <span class="summary-chip ${options.kind || ""}">
      ${label ? `<strong>${escapeHtml(label)}</strong>` : ""}
      ${escapeHtml(value || "Not logged")}
    </span>
  `;
}

function displaySpeedValue(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  return /[a-zA-Z]/.test(trimmed) ? trimmed : `${trimmed} ${unitSymbol("speed")}`;
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
        ${summaryMetric("Water Temp", trip.waterTemp || "Not logged")}
        ${summaryMetric("Wind", primaryWindText || "Not logged")}
        ${summaryMetric("FOW Range", trip.structure || "Not logged")}
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

function compactCatchDetails(trip, catchItem, options = {}) {
  const record = resolveTripLineRecord({ ...catchItem, trip });
  const gear = record.setupLine
    ? setupLineDisplayLabel(trip, record.setupLine)
    : [lureName(record.lureId), flasherName(record.flasherId)].filter(Boolean).join(" + ");
  const fishingDetails = [
    options.showOutcome ? (record.released ? "Released" : "Kept") : (record.released ? "Released" : ""),
    record.length,
    record.weight,
    record.time,
    record.fowCaught,
    record.depthDown ? `${record.depthDown} down` : "",
    record.waterDepth ? `${record.waterDepth} water` : "",
    displaySpeedValue(record.speed),
    gear
  ].filter(Boolean).join(" / ");
  const weatherDetails = [
    catchWeatherSummary(catchItem.weatherData),
    catchWeatherComparison(catchItem.weatherData, trip.weatherData),
    moonWindowForTime(catchItem.time, trip.weatherData?.sunMoon)
  ].filter(Boolean).join(" / ");
  const location = record.coordinates ? formatCoordinates(record.coordinates) : "";
  return [fishingDetails, weatherDetails, location].filter(Boolean).join(" | ");
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
  if (record.fowCaught) depthDetails.push(`${record.fowCaught} FOW`);
  if (record.depthDown) depthDetails.push(`${record.depthDown} down`);
  if (presentation === "flatline") {
    if (record.flatlineWeightOz) depthDetails.push(`${record.flatlineWeightOz} oz`);
    if (record.estimatedDepth) depthDetails.push(`${record.estimatedDepth} down`);
  } else if (presentation === "flatline-leadcore") {
    if (record.lineBehindBoard) depthDetails.push(`${record.lineBehindBoard} behind board`);
    if (record.estimatedLureDepth) depthDetails.push(`${record.estimatedLureDepth} lure depth`);
  } else if (presentation === "dipsey-diver") {
    if (record.dipseySetting) depthDetails.push(`${record.dipseySetting} setting`);
    if (record.lineOut) depthDetails.push(`${record.lineOut} out`);
  } else if (record.ballDepth) {
    depthDetails.push(`${record.ballDepth} ball`);
  }
  if (record.estimatedDepth && presentation !== "flatline") depthDetails.push(`${record.estimatedDepth} est.`);
  const setupLabel = record.setupLine ? setupLineDisplayLabel(trip, record.setupLine) : "";
  return `
    <dl class="catch-meta-list">
      ${catchMetaRow("Lure", displayTitleText(lureName(record.lureId)))}
      ${trollingTrip ? catchMetaRow("Flasher", displayTitleText(flasherName(record.flasherId))) : ""}
      ${catchMetaRow("Method", trollingTrip ? presentationLabel(presentation) : displayTitleText(trip.method || ""))}
      ${catchMetaRow("Depth", depthDetails.join(" / "))}
      ${trollingTrip ? catchMetaRow("Speed", displaySpeedValue(record.speed)) : ""}
      ${castingTrip ? catchMetaRow("Retrieve", record.retrieve) : ""}
    </dl>
  `;
}

function catchDetailRows(trip, catchItem) {
  const record = resolveTripLineRecord({ ...catchItem, trip });
  const setup = compactSetupDisplayLabel(record);
  const lure = [lureName(record.lureId), flasherName(record.flasherId)].filter(Boolean).join(" + ");
  const formatWeightDetail = (value) => {
    const trimmed = String(value || "").trim();
    if (!trimmed) return "";
    return /[a-zA-Z]/.test(trimmed) ? trimmed : `${trimmed} ${unitSymbol("fishWeight")}`;
  };
  const formatDepthDetail = (value) => {
    const trimmed = String(value || "").trim();
    if (!trimmed) return "";
    return /[a-zA-Z]/.test(trimmed) ? trimmed : `${trimmed} ${unitSymbol("depth")}`;
  };
  const rows = [
    ["Species", displayTitleText(record.species || catchItem.species)],
    ["Status", record.released ? "Released" : "Kept"],
    ["Time", catchItem.time ? formatDisplayTime(catchItem.time) : ""],
    ["Length", record.length],
    ["Weight", formatWeightDetail(record.weight)],
    ["FOW", formatDepthDetail(record.fowCaught || record.waterDepth)],
    ["Depth Down", formatDepthDetail(record.depthDown)],
    ["Ball Depth", formatDepthDetail(record.ballDepth)],
    ["Flatline Weight", record.flatlineWeightOz ? `${record.flatlineWeightOz} oz` : ""],
    ["Estimated Depth", formatDepthDetail(record.estimatedDepth || record.estimatedLureDepth)],
    ["Line Behind Board", formatDepthDetail(record.lineBehindBoard)],
    ["Dipsey Setting", record.dipseySetting],
    ["Line Out", formatDepthDetail(record.lineOut)],
    ["Speed", displaySpeedValue(record.speed)],
    ["Retrieve", record.retrieve],
    ["Direction", record.direction],
    ["Setup", setup],
    ["Lure", displayTitleText(lure)],
    ["Notes", displaySentenceText(catchItem.notes)]
  ].filter(([, value]) => value !== null && value !== undefined && value !== "");
  return rows.map(([label, value]) => `
    <div>
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value)}</dd>
    </div>
  `).join("");
}

function renderCatchDetailPopout(trip, catchItem, index, selectedIndex = 0) {
  return `
    <div class="catch-detail-popout" id="catchDetailPopout" role="dialog" aria-modal="true" aria-label="Catch details">
      <div class="catch-detail-panel">
        <button class="icon-button catch-detail-close" type="button" data-close-catch-detail aria-label="Close catch details"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg></button>
        <div class="catch-detail-heading">
          <p class="event-kicker">Catch</p>
          <h4>${escapeHtml(displayTitleText(catchItem.species || `Catch ${index + 1}`))}</h4>
          <p>${escapeHtml([catchItem.released ? "Released" : "Kept", catchItem.time ? formatDisplayTime(catchItem.time) : ""].filter(Boolean).join(" / "))}</p>
        </div>
        ${renderCatchMediaGallery(catchItem.photos || [], catchItem.species || `Catch ${index + 1}`, {
          catchIndex: index,
          selectedIndex,
          context: "detail",
          showAllThumbnails: true
        })}
        <dl class="catch-detail-grid">
          ${catchDetailRows(trip, catchItem)}
        </dl>
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
          selectedIndex: 0,
          context: "summary"
        })}
      </article>
    `;
  }).join("");
}

function renderTripSummaryGear(trip) {
  const gearUsed = trip.gearUsed || [];
  if (!gearUsed.length) return `<div class="empty-state compact-empty"><p>No setup timeline entries.</p></div>`;
  return `
    <div class="summary-list">
      ${gearUsed.map((gearItem, index) => {
        const timeRange = formatDisplayTimeRange(gearItem.startTime, gearItem.endTime);
        const rodReel = comboName(gearItem.comboId) || [rodName(gearItem.rodId), reelName(gearItem.reelId)].filter(Boolean).join(" + ");
        const gear = [lureName(gearItem.lureId), flasherName(gearItem.flasherId)].filter(Boolean).join(" + ");
        const details = [
          presentationLabel(gearItem.presentation),
          timeRange
        ].filter(Boolean).join(" / ");
        return `
          <article class="setup-summary-card">
            <div>
              <strong>${escapeHtml(displayTitleText(setupLineDisplayLabel(trip, gearItem) || setupLineSideLabel(gearItem.side) || `Rod ${index + 1}`))}</strong>
              <span>${escapeHtml(displayTitleText(rodReel) || "No rod/reel logged")}</span>
            </div>
            <span>${escapeHtml(displayTitleText(gear) || "No lure/flasher logged")}</span>
            <small>${escapeHtml(details || "No setup details")}</small>
            ${gearItem.changeNote ? `<p>${escapeHtml(displaySentenceText(gearItem.changeNote))}</p>` : ""}
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function setupLineCounts(trip, gearItem) {
  const fish = (trip.catches || [])
    .filter((catchItem) => catchItem.setupLineId === gearItem.id && catchItem.setupLineTarget !== "cheater")
    .reduce((sum, catchItem) => sum + fishCount(catchItem), 0);
  const lost = (trip.lostFish || [])
    .filter((fishItem) => fishItem.setupLineId === gearItem.id && fishItem.setupLineTarget !== "cheater")
    .length;
  return { fish, lost };
}

function setupLineCheaterFishCount(trip, gearItem) {
  return (trip.catches || [])
    .filter((catchItem) => catchItem.setupLineId === gearItem.id && catchItem.setupLineTarget === "cheater")
    .reduce((sum, catchItem) => sum + fishCount(catchItem), 0);
}

function timelineTimeValue(time) {
  if (!time) return 9999;
  const [hours = "0", minutes = "0"] = String(time).split(":");
  return Number(hours) * 60 + Number(minutes);
}

function formatTimelineDisplayTime(value) {
  const match = String(value || "").match(/(\d{1,2}):(\d{2})/);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return "";
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function timelineTimeLabel(item) {
  if (item.startTime && item.endTime) {
    const start = formatTimelineDisplayTime(item.startTime);
    const end = formatTimelineDisplayTime(item.endTime);
    const startMatch = start.match(/^(.+)\s(AM|PM)$/);
    const endMatch = end.match(/^(.+)\s(AM|PM)$/);
    if (startMatch && endMatch && startMatch[2] === endMatch[2]) {
      return `${startMatch[1]}-${endMatch[1]} ${endMatch[2]}`;
    }
    return [start, end].filter(Boolean).join("-");
  }
  return formatTimelineDisplayTime(item.time || item.startTime || item.endTime) || "No time";
}

function uniqueTimelineValues(values = []) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function timelineMetaChips(chips = []) {
  const values = uniqueTimelineValues(chips);
  if (!values.length) return "";
  return `
    <div class="meta-chips">
      ${values.map((value) => `<span class="meta-chip">${escapeHtml(value)}</span>`).join("")}
    </div>
  `;
}

function timelineEventPhoto(photos = [], options = {}) {
  if (!photos.length) return "";
  const photo = photos[0];
  const extraCount = Math.max(0, photos.length - 1);
  return `
    <figure class="timeline-photo-frame">
      ${mediaMarkup(photo, "event-photo")}
      ${extraCount && !options.hideCount ? `<figcaption>${escapeHtml(`+${extraCount} more photo${extraCount === 1 ? "" : "s"}`)}</figcaption>` : ""}
    </figure>
  `;
}

function timelineEventHeader(item) {
  const timeLabel = item.time ? formatTimelineDisplayTime(item.time) : timelineTimeLabel(item);
  const typeLabel = item.type === "Lost" ? "Lost Fish" : item.type;
  return `
    <div class="event-header">
      <p class="event-kicker">${escapeHtml([typeLabel.toUpperCase(), timeLabel].filter(Boolean).join(" \u00b7 "))}</p>
      <h4 class="event-title">${escapeHtml(item.title || item.type)}</h4>
      ${item.summary ? `<p class="event-summary">${escapeHtml(item.summary)}</p>` : ""}
    </div>
  `;
}

function isTripEndTime(trip, time) {
  return Boolean(time && trip.endTime && String(time).slice(0, 5) === String(trip.endTime).slice(0, 5));
}

function setupTimelineItems(trip) {
  const events = new Map();
  const ensure = (time) => {
    const key = String(time || "").slice(0, 5);
    if (!events.has(key)) events.set(key, { time: key, deployed: [], pulled: [], notes: [] });
    return events.get(key);
  };

  (trip.gearUsed || []).forEach((gearItem, index) => {
    if (gearItem.startTime) {
      const event = ensure(gearItem.startTime);
      event.deployed.push(setupTimelineRecord(trip, gearItem, index));
      if (gearItem.changeNote) event.notes.push(gearItem.changeNote);
    }
    if (gearItem.endTime && !isTripEndTime(trip, gearItem.endTime)) {
      ensure(gearItem.endTime).pulled.push(setupTimelineRecord(trip, gearItem, index));
    }
  });

  return [...events.values()].map((event) => {
    const title = event.pulled.length && event.deployed.length
      ? "Setup change"
      : event.deployed.length
        ? `${event.deployed.length} ${event.deployed.length === 1 ? "rod" : "rods"} deployed`
        : `${event.pulled.length} ${event.pulled.length === 1 ? "rod" : "rods"} pulled`;
    return {
      type: "Setup",
      title,
      summary: "",
      setupRows: [
        ...event.pulled.map((row) => ({ ...row, action: "Pulled" })),
        ...event.deployed.map((row) => ({ ...row, action: "Deployed" }))
      ],
      note: displaySentenceText([...new Set(event.notes)].join(" / ")),
      time: event.time,
      sortTime: timelineTimeValue(event.time)
    };
  });
}

function timelineSortOrder(type) {
  return { Setup: 0, Catch: 1, Lost: 2, Photo: 3 }[type] ?? 9;
}

function tripTimelineItems(trip) {
  const items = [...setupTimelineItems(trip)];

  (trip.catches || []).forEach((catchItem, index) => {
    const record = resolveTripLineRecord({ ...catchItem, trip });
    const setupLabel = compactSetupDisplayLabel(record);
    const waterDepth = record.waterDepth || record.fowCaught;
    const lure = displayTitleText([lureName(record.lureId), flasherName(record.flasherId)].filter(Boolean).join(" + "));
    const speed = displaySpeedValue(record.speed);
    const summary = [
      catchItem.released ? "Released" : "Kept",
      setupLabel,
      record.depthDown ? `${record.depthDown} down` : "",
      waterDepth ? `${waterDepth} water` : ""
    ].filter(Boolean).join(" \u00b7 ");
    const chips = [
      lure,
      speed ? `Speed ${speed}` : "",
      waterDepth ? `${waterDepth} water` : "",
      record.depthDown ? `${record.depthDown} down` : "",
      setupLabel
    ];
    items.push({
      type: "Catch",
      title: displayTitleText(catchItem.species || `Catch ${index + 1}`),
      summary,
      chips,
      catchIndex: index,
      note: displaySentenceText(catchItem.notes || ""),
      time: catchItem.time,
      photos: catchItem.photos || [],
      sortTime: timelineTimeValue(catchItem.time)
    });
  });

  (trip.lostFish || []).forEach((fish, index) => {
    const record = resolveTripLineRecord({ ...fish, trip });
    const setupLabel = compactSetupDisplayLabel(record);
    const waterDepth = record.waterDepth || record.fowCaught;
    const lure = displayTitleText([lureName(record.lureId), flasherName(record.flasherId)].filter(Boolean).join(" + "));
    const speed = displaySpeedValue(record.speed);
    items.push({
      type: "Lost",
      title: displayTitleText(fish.possibleSpecies || fish.species || `Lost Fish ${index + 1}`),
      summary: "",
      chips: [
        setupLabel,
        record.depthDown ? `${record.depthDown} down` : "",
        waterDepth ? `${waterDepth} water` : "",
        lure,
        speed ? `Speed ${speed}` : ""
      ],
      note: displaySentenceText(fish.notes || ""),
      time: fish.time,
      sortTime: timelineTimeValue(fish.time)
    });
  });

  (trip.notePhotos || []).forEach((photo) => {
    items.push({
      type: "Photo",
      title: timelinePhotoTitle(photo),
      summary: "",
      chips: [],
      time: photo.captureTime || "",
      photos: [photo],
      sortTime: photo.captureTime ? timelineTimeValue(photo.captureTime) : 10000
    });
  });

  return items.sort((a, b) => a.sortTime - b.sortTime || timelineSortOrder(a.type) - timelineSortOrder(b.type) || a.type.localeCompare(b.type));
}

function timelineFilterMatches(item, filter = activeTripTimelineFilter) {
  if (filter === "catches") return item.type === "Catch" || item.type === "Lost";
  if (filter === "setup") return item.type === "Setup";
  if (filter === "photos") return item.type === "Photo";
  return true;
}

function renderTripTimelineFilters() {
  const filters = [
    ["all", "All events"],
    ["setup", "Setup"],
    ["catches", "Fish catch"],
    ["photos", "Trip photos"]
  ];
  return `
    <div class="timeline-filter" role="group" aria-label="Timeline filter">
      ${filters.map(([value, label]) => `
        <button class="timeline-filter-button ${activeTripTimelineFilter === value ? "is-active" : ""}" type="button" data-timeline-filter="${value}">
          ${escapeHtml(label)}
        </button>
      `).join("")}
    </div>
  `;
}

function timelineSetupRows(rows = []) {
  if (!rows.length) return "";
  return `
    <div class="setup-list">
      ${rows.map((row) => `
        <article class="setup-row">
          <div class="setup-row-topline">
            <p class="setup-row-title">${escapeHtml(row.position || row.rod || row.rodReel || "Not logged")}</p>
            <span class="setup-action">${escapeHtml(row.action)}</span>
          </div>
          <p class="setup-row-meta">${escapeHtml([row.presentation || "Setup", [row.startTime, row.endTime].filter(Boolean).join(" to ") || "Time not logged"].filter(Boolean).join(" \u00b7 "))}</p>
          <p class="setup-row-note">${escapeHtml(row.lure || "No lure logged")}</p>
        </article>
      `).join("")}
    </div>
  `;
}

function renderTimelineEventCard(item) {
  const interactiveAttributes = item.type === "Catch"
    ? `data-summary-catch-index="${item.catchIndex}" role="button" tabindex="0"`
    : "";
  const classes = ["event-card", item.type.toLowerCase(), item.type === "Catch" ? "timeline-catch-card" : ""].filter(Boolean).join(" ");
  return `
    <div class="${classes}" ${interactiveAttributes}>
      ${timelineEventHeader(item)}
      ${item.setupRows?.length ? timelineSetupRows(item.setupRows) : ""}
      ${item.type === "Catch" ? timelineEventPhoto(item.photos, { hideCount: false }) : ""}
      ${item.type === "Photo" ? timelineEventPhoto(item.photos, { hideCount: true }) : ""}
      ${item.note ? `<p class="event-note">${escapeHtml(item.note)}</p>` : ""}
      ${timelineMetaChips(item.chips)}
      ${item.type === "Catch" ? `<button class="button secondary timeline-catch-open" type="button" data-summary-catch-index="${item.catchIndex}">View details</button>` : ""}
    </div>
  `;
}

function renderTripTimeline(trip) {
  const items = tripTimelineItems(trip).filter((item) => timelineFilterMatches(item));
  if (!items.length) return `<div class="empty-state compact-empty"><p>No timeline events logged.</p></div>`;
  return `
    <div class="trip-timeline">
      ${items.map((item) => `
        <article class="timeline-item timeline-${item.type.toLowerCase()}">
          <div class="timeline-time">${escapeHtml(timelineTimeLabel(item))}</div>
          <div class="timeline-dot" aria-hidden="true"></div>
          ${renderTimelineEventCard(item)}
        </article>
      `).join("")}
    </div>
  `;
}

function refreshTripTimelinePanel() {
  const trip = state.trips.find((item) => item.id === activeSummaryTripId);
  const panel = document.querySelector("#tripTimelinePanel");
  if (!trip || !panel) return;
  panel.innerHTML = renderTripTimeline(trip);
  document.querySelectorAll("[data-timeline-filter]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.timelineFilter === activeTripTimelineFilter);
  });
}

function refreshCatchMediaGallery(gallery, selectedIndex = 0) {
  const trip = state.trips.find((item) => item.id === activeSummaryTripId);
  const catchIndex = Number(gallery?.dataset?.catchIndex);
  const catchItem = trip?.catches?.[catchIndex];
  if (!trip || !catchItem || Number.isNaN(catchIndex)) return;
  const wrapper = document.createElement("div");
  wrapper.innerHTML = renderCatchMediaGallery(catchItem.photos || [], catchItem.species || `Catch ${catchIndex + 1}`, {
    catchIndex,
    selectedIndex,
    context: gallery.dataset.galleryContext || "summary",
    showAllThumbnails: gallery.dataset.showAllThumbnails === "true"
  }).trim();
  const nextGallery = wrapper.firstElementChild;
  if (nextGallery) gallery.replaceWith(nextGallery);
}

function openSummaryCatchDetail(catchIndex, selectedIndex = 0) {
  const trip = state.trips.find((item) => item.id === activeSummaryTripId);
  const catchItem = trip?.catches?.[catchIndex];
  const host = document.querySelector("#catchDetailHost");
  if (!trip || !catchItem || !host) return;
  host.innerHTML = renderCatchDetailPopout(trip, catchItem, catchIndex, selectedIndex);
  document.querySelector("#tripSummaryDialog")?.classList.add("catch-detail-open");
  host.querySelector(".catch-detail-close")?.focus();
}

function closeSummaryCatchDetail() {
  const host = document.querySelector("#catchDetailHost");
  if (host) host.innerHTML = "";
  document.querySelector("#tripSummaryDialog")?.classList.remove("catch-detail-open");
}

function openTripSummary(trip) {
  activeSummaryTripId = trip.id;
  activeTripTimelineFilter = "all";
  els.tripSummaryTitle.textContent = displayTitleText(trip.title || trip.location || "Trip Summary");
  const mapRecords = catchMapRecordsForTrip(trip);
  const speciesSummary = tripSpeciesSummary(trip);
  els.tripSummaryBody.innerHTML = `
    <section class="summary-hero">
      <div>
        <p class="eyebrow">${escapeHtml(formatDate(trip.date))}</p>
        <h3>${escapeHtml(displayTitleText(trip.location || "Unknown location"))}</h3>
        <p>${escapeHtml([displayTitleText(trip.title), displayTitleText(trip.targetSpecies), trip.method, intentLabel(tripIntent(trip)), tripRatingLabel(tripRatingValue(trip))].filter(Boolean).join(" | "))}</p>
      </div>
    </section>
    <div class="metric-grid summary-metrics">
      ${summaryMetric("Hours", trimNumber(tripHours(trip)))}
      ${summaryMetric("Caught", totalCaught(trip))}
      ${summaryMetric("Fish/hr", trimNumber(catchRate(trip)))}
      ${summaryMetric("Lost Fish", (trip.lostFish || []).length)}
      ${summaryMetric("Species", speciesSummary.count)}
      ${summaryMetric("Best Species", speciesSummary.top)}
    </div>
    ${renderTripKeyConditions(trip)}
    <section class="summary-section summary-notes-card">
      <h3>Trip Notes</h3>
      <p>${escapeHtml(displaySentenceText(trip.notes) || "No notes logged.")}</p>
    </section>
    <section class="summary-section summary-map-section">
      <div class="summary-section-heading">
        <h3>Fish Map</h3>
        <div id="tripSummaryMapLegend" class="map-header-legend"></div>
        <div class="summary-map-tools">
          <label>
            <span>Species</span>
            <select id="tripSummaryMapFilter"></select>
          </label>
        </div>
      </div>
      <div id="tripSummaryMap" class="fish-map trip-summary-map"></div>
    </section>
    ${isTrollingTripRecord(trip) ? `
      <section class="summary-section">
        <h3>Trolling Spread</h3>
        ${renderTrollingSpread(trip)}
      </section>
    ` : ""}
    <section class="summary-section">
      <h3>Catches</h3>
      <div class="summary-catch-grid">${renderTripSummaryCatches(trip)}</div>
    </section>
    <section class="summary-section">
      <div class="summary-section-heading timeline-heading">
        <h3>Trip Timeline</h3>
        ${renderTripTimelineFilters()}
      </div>
      <div id="tripTimelinePanel">${renderTripTimeline(trip)}</div>
    </section>
    <details class="summary-section trip-photos-disclosure">
      <summary>
        <h3>Trip Photos</h3>
        <span>${escapeHtml((trip.notePhotos || []).length ? `${(trip.notePhotos || []).length} saved` : "No trip photos")}</span>
      </summary>
      ${summaryPhotoGrid(trip.notePhotos || [], "No trip photos")}
    </details>
    ${renderTripWeatherDetailsSection(trip)}
    <div id="catchDetailHost"></div>
  `;
  els.tripSummaryDialog.showModal();
  renderTripSummaryMap(trip);
}
