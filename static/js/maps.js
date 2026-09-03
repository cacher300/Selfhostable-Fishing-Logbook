function catchMapRecordForTrip(trip, catchItem, catchIndex) {
  const selectedPhoto = catchItem.photoLocationId
    ? (catchItem.photos || []).find((photo) => photo.id === catchItem.photoLocationId && isUsableCoordinates(photo.coordinates))
    : null;
  const mediaWithCoordinates = selectedPhoto || (catchItem.photos || []).find((photo) => isUsableCoordinates(photo.coordinates));
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

const MAP_BASEMAP_STORAGE_KEY = "logbook.mapBasemap";
const MAP_BASEMAPS = {
  standard: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    options: { attribution: "&copy; OpenStreetMap contributors" }
  },
  dark: {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    options: { attribution: "&copy; OpenStreetMap contributors &copy; CARTO", subdomains: "abcd", maxZoom: 20 }
  },
  minimal: {
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    options: { attribution: "&copy; OpenStreetMap contributors &copy; CARTO", subdomains: "abcd", maxZoom: 20 }
  }
};
let fishMapBasemapLayer = null;

function savedMapBasemap() {
  try {
    const saved = localStorage.getItem(MAP_BASEMAP_STORAGE_KEY);
    return MAP_BASEMAPS[saved] ? saved : "standard";
  } catch {
    return "standard";
  }
}

function speciesColor(species = "Fish") {
  const value = species || "Fish";
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return speciesMarkerColors[hash % speciesMarkerColors.length];
}

function mapRecordYear(record) {
  return String(record.trip?.date || "").match(/^\d{4}/)?.[0] || "Unknown year";
}

function mapYearColor(year) {
  return speciesColor(`year-${year}`);
}

function mapRecordColor(record) {
  if (record.type === "trip-photo") return "#2763a7";
  if (record.type === "trip-video") return "#9a5b00";
  return speciesColor(record.catchItem?.species);
}

function addMapMarker(layerGroup, record, options = {}) {
  const fillColor = mapRecordColor(record);
  const color = options.colorByYear ? mapYearColor(mapRecordYear(record)) : fillColor;
  return L.circleMarker([record.coordinates.latitude, record.coordinates.longitude], {
    radius: record.type === "catch" ? 8 : 7,
    color,
    fillColor,
    fillOpacity: 0.86,
    weight: options.colorByYear ? 3 : 2,
    bubblingMouseEvents: false,
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

function addSeamlessTileLayer(map, basemap = "standard") {
  const config = MAP_BASEMAPS[basemap] || MAP_BASEMAPS.standard;
  const tileLayer = L.tileLayer(config.url, config.options).addTo(map);
  tileLayer.on("load tileload", () => requestAnimationFrame(() => snapMapTilePane(map)));
  bindMapTilePaneSnapping(map);
  return tileLayer;
}

function setFishMapBasemap(basemap) {
  const key = MAP_BASEMAPS[basemap] ? basemap : "standard";
  if (!fishMap) return;
  if (fishMapBasemapLayer) fishMap.removeLayer(fishMapBasemapLayer);
  fishMapBasemapLayer = addSeamlessTileLayer(fishMap, key);
  try { localStorage.setItem(MAP_BASEMAP_STORAGE_KEY, key); } catch {}
}

function ensureFishMapBasemapControl() {
  const control = document.querySelector("#mapBasemap");
  if (!control || control.dataset.bound) return;
  control.value = savedMapBasemap();
  control.dataset.bound = "true";
  control.addEventListener("change", () => setFishMapBasemap(control.value));
}

function mapDepthText(payload = {}) {
  if (payload.depth_ft !== null && payload.depth_ft !== undefined && Number(payload.depth_ft) !== 0) return `${formatUnitValue(payload.depth_ft, "depth", "ft", { decimals: 1 })} FOW`;
  if (payload.depth_m !== null && payload.depth_m !== undefined && Number(payload.depth_m) !== 0) return `${formatUnitValue(payload.depth_m, "depth", "m", { decimals: 1 })} FOW`;
  if (payload.fowCaught) return displayFowValue(payload.fowCaught);
  return "";
}

function catchFowPopupValue(catchItem = {}) {
  const fow = String(catchItem.fowCaught || catchItem.waterDepth || "").trim();
  if (fow) return displayFowValue(fow);
  if (catchItem.depth_ft !== null && catchItem.depth_ft !== undefined) return formatUnitValue(catchItem.depth_ft, "depth", "ft", { decimals: 1 });
  if (catchItem.depth_m !== null && catchItem.depth_m !== undefined) return formatUnitValue(catchItem.depth_m, "depth", "m", { decimals: 1 });
  return "";
}

function mapDepthPopupHtml(coordinates, payload = null, status = "loading", overlayHtml = "") {
  const coordinateLine = coordinateText(coordinates);
  const compactClass = overlayHtml ? "" : " map-depth-popup--compact";
  if (status === "loading") {
    return `
      <div class="map-popup map-depth-popup${compactClass}">
        <strong>Depth lookup</strong>
        <span>Looking up...</span>
        <small>${escapeHtml(coordinateLine)}</small>${overlayHtml}
      </div>
    `;
  }
  if (status === "error") {
    return `
      <div class="map-popup map-depth-popup${compactClass}">
        <strong>Depth unavailable</strong>
        <span>Could not fetch depth here.</span>
        <small>${escapeHtml(coordinateLine)}</small>${overlayHtml}
      </div>
    `;
  }
  const depthText = mapDepthText(payload);
  return `
    <div class="map-popup map-depth-popup${compactClass}">
      <strong>${escapeHtml(depthText || "No depth found")}</strong>
      <small>${escapeHtml(coordinateLine)}</small>${overlayHtml}
    </div>
  `;
}

async function showDepthPopupForMapClick(map, event) {
  if (!map) return;
  const coordinates = {
    latitude: Number(event.latlng?.lat),
    longitude: Number(event.latlng?.lng)
  };
  if (!Number.isFinite(coordinates.latitude) || !Number.isFinite(coordinates.longitude)) return;
  const popup = L.popup()
    .setLatLng(event.latlng)
    .setContent(mapDepthPopupHtml(coordinates))
    .openOn(map);
  try {
    const params = new URLSearchParams({
      latitude: coordinates.latitude.toFixed(6),
      longitude: coordinates.longitude.toFixed(6)
    });
    const [response, overlayHtml] = await Promise.all([
      fetch(`/api/bathymetry/depth?${params}`),
      window.getGreatLakesMapInspection?.(coordinates) || Promise.resolve("")
    ]);
    if (!response.ok) throw new Error("Depth lookup unavailable");
    const payload = await response.json();
    popup.setContent(mapDepthPopupHtml(coordinates, payload, "ready", overlayHtml));
  } catch (error) {
    console.error("Could not fetch map depth.", error);
    popup.setContent(mapDepthPopupHtml(coordinates, null, "error"));
  }
}

function bindDepthLookupPopup(map) {
  if (!map || map._logbookDepthLookupBound) return;
  map._logbookDepthLookupBound = true;
  map.on("click", (event) => showDepthPopupForMapClick(map, event));
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

function mapYearFilterOptions(records) {
  const years = [...new Set(records.map(mapRecordYear))];
  return ["All years", ...years.sort((a, b) => {
    if (a === "Unknown year") return 1;
    if (b === "Unknown year") return -1;
    return b.localeCompare(a);
  })];
}

function renderMapYearFilter(records) {
  const options = mapYearFilterOptions(records);
  if (!options.includes(activeMapYear)) activeMapYear = "All years";
  els.mapYearFilter.innerHTML = options.map((option) => (
    `<option value="${escapeHtml(option)}" ${option === activeMapYear ? "selected" : ""}>${escapeHtml(option)}</option>`
  )).join("");
  els.mapYearFilter.disabled = activeMapYearFilteringHidden;
  els.mapYearFilterControl?.classList.toggle("hidden", activeMapYearFilteringHidden);
  if (els.mapHideYearFilterToggle) els.mapHideYearFilterToggle.checked = activeMapYearFilteringHidden;
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

function filteredMapRecordsByYear(records, year = activeMapYear) {
  if (activeMapYearFilteringHidden || year === "All years") return records;
  return records.filter((record) => mapRecordYear(record) === year);
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
  const fowValue = record.type === "catch" ? catchFowPopupValue(record.catchItem) : "";
  const assignedSpot = record.type === "catch" ? spotName(record.catchItem?.spotId) : "";
  return `
    <div class="map-popup" data-map-view-trip="${escapeHtml(trip.id)}" role="button" tabindex="0">
      ${media?.image ? mediaMarkup(media) : ""}
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(formatDate(trip.date))}</span>
      ${fowValue ? `<span><strong>FOW</strong>${escapeHtml(fowValue)}</span>` : ""}
      ${assignedSpot ? `<span><strong>Spot</strong>${escapeHtml(assignedSpot)}</span>` : ""}
      <button class="map-popup-trip-link" type="button" data-view-trip="${escapeHtml(trip.id)}">View Trip</button>
    </div>
  `;
}

function renderMapYearLegend(records, options = {}) {
  const legendItems = mapRecordFilterOptions(records, { allLabel: "All species", includeTripMedia: options.includeTripMedia }).slice(1);
  const years = options.showYearOutlines ? mapYearFilterOptions(records).slice(1) : [];
  if (!years.length && !legendItems.length) return "";
  return `
    <div class="map-legend map-dual-legend">
      ${legendItems.length ? `<strong>Species</strong>${legendItems.map((name) => `<span><i style="--pin-color:${name === "Trip Photos" ? "#2763a7" : name === "Trip Videos" ? "#9a5b00" : speciesColor(name)}"></i>${escapeHtml(name)}</span>`).join("")}` : ""}
      ${years.length ? `<strong>Year outline</strong>${years.map((year) => `<span><i class="map-year-key" style="--pin-color:${mapYearColor(year)}"></i>${escapeHtml(year)}</span>`).join("")}` : ""}
    </div>
  `;
}

function renderMapList(records) {
  if (!els.mapCatchList) return;
  if (!records.length) {
    els.mapCatchList.innerHTML = `<div class="empty-state"><p>No geotagged map items match this filter.</p></div>`;
    return;
  }

  els.mapCatchList.innerHTML = records.map((record) => {
    const { trip, media } = record;
    const fowValue = record.type === "catch" ? catchFowPopupValue(record.catchItem) : "";
    const assignedSpot = record.type === "catch" ? spotName(record.catchItem?.spotId) : "";
    return `
      <article class="map-catch-card" data-map-view-trip="${escapeHtml(trip.id)}" role="button" tabindex="0">
        ${media?.image ? mediaMarkup(media) : ""}
        <div>
          <strong>${escapeHtml(mapRecordTitle(record))}</strong>
          <span>${escapeHtml([formatDate(trip.date), trip.location].filter(Boolean).join(" / "))}</span>
          ${fowValue ? `<span><strong>FOW</strong> ${escapeHtml(fowValue)}</span>` : ""}
          ${assignedSpot ? `<span><strong>Spot</strong> ${escapeHtml(assignedSpot)}</span>` : ""}
          <button class="map-popup-trip-link" type="button" data-view-trip="${escapeHtml(trip.id)}">View Trip</button>
        </div>
      </article>
    `;
  }).join("");
}

function renderFishMap() {
  const allRecords = catchMapRecords();
  renderMapSpeciesFilter(allRecords);
  renderMapYearFilter(allRecords);
  const records = filteredMapRecordsByYear(
    filteredMapRecords(allRecords, activeMapSpecies, { includeTripMedia: activeMapIncludeTripMedia })
  );
  els.mapLegend.innerHTML = renderMapYearLegend(allRecords, {
    includeTripMedia: activeMapIncludeTripMedia,
    showYearOutlines: !activeMapYearFilteringHidden
  });
  renderMapList(records);

  if (!window.L) {
    els.fishMap.innerHTML = `<div class="empty-state"><p>Map tiles are unavailable, but saved GPS coordinates are listed below.</p></div>`;
    return;
  }

  if (!fishMap) {
    fishMap = L.map(els.fishMap, seamlessMapOptions());
    fishMapBasemapLayer = addSeamlessTileLayer(fishMap, savedMapBasemap());
    ensureFishMapBasemapControl();
    bindDepthLookupPopup(fishMap);
    syncMapPageChartOverlay(fishMap);
    window.ensureGreatLakesConditions?.(fishMap);
    ensureMapMarkerPanes(fishMap);
    fishMapMarkers = L.layerGroup().addTo(fishMap);
  }
  syncMapPageChartOverlay(fishMap);
  ensureMapMarkerPanes(fishMap);

  fishMapMarkers.clearLayers();
  if (!records.length) {
    const homeLake = window.getGreatLakesHomeView?.();
    fishMap.setView(homeLake?.center || [43.8, -79.5], homeLake?.zoom || 6);
    settleMapLayout(fishMap);
    return;
  }

  const bounds = [];
  records.forEach((record) => {
    const point = [record.coordinates.latitude, record.coordinates.longitude];
    bounds.push(point);
    addMapMarker(fishMapMarkers, record, { colorByYear: !activeMapYearFilteringHidden });
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
    `<option value="${escapeHtml(option)}" ${option === activeTripSummaryMapFilter ? "selected" : ""}>${escapeHtml(option === "All map items" ? "All" : option)}</option>`
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
    bindDepthLookupPopup(tripSummaryMap);
    ensureMapMarkerPanes(tripSummaryMap);
    tripSummaryMapMarkers = L.layerGroup().addTo(tripSummaryMap);
  } else if (tripSummaryMap.getContainer() !== mapNode) {
    tripSummaryMap.remove();
    tripSummaryMap = L.map(mapNode, seamlessMapOptions());
    addSeamlessTileLayer(tripSummaryMap);
    bindDepthLookupPopup(tripSummaryMap);
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

