import { html, joinHtml, setHtml } from "./html.js";
import { L } from "./vendor.js";
import { fallbackSpeciesColor, speciesColor } from "./app-defaults.js";
import { state, ui } from "./app-state.js";
import { spotName, tripWeatherCoordinates } from "./app-normalization.js";
import { displayStoredMeasurement, formatUnitValue } from "./app-units.js";
import { els } from "./app-elements.js";
import { isUsableCoordinates, isVideoMedia, mediaMarkup, previewImage } from "./app-media.js";
import { coordinateText } from "./locations.js";
import { fishingSpotRadiusText } from "./settings-locations.js";
import { ensureGreatLakesConditions } from "./great-lakes-conditions.js";
import { formatDate } from "./dashboard.js";
import { displayFowValue } from "./trip-summary.js";


export function catchMapRecordForTrip(trip, catchItem, catchIndex) {
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

export function tripMediaMapRecordsForTrip(trip) {
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

export function mapRecordsForTrip(trip) {
  return [
    ...(trip.catches || []).map((catchItem, catchIndex) => catchMapRecordForTrip(trip, catchItem, catchIndex)).filter(Boolean),
    ...tripMediaMapRecordsForTrip(trip)
  ];
}

export function catchMapRecords() {
  return state.trips.flatMap(mapRecordsForTrip);
}

export const MAP_BASEMAP_STORAGE_KEY = "logbook.mapBasemap";
export const CARTO_BASEMAP_KEY = "cb1_2u01_1_caca99a3ff372698283bdfb0";
export let MAP_BASEMAPS;

export let fishMapBasemapLayer = null;

export function savedMapBasemap() {
  try {
    const saved = localStorage.getItem(MAP_BASEMAP_STORAGE_KEY);
    return MAP_BASEMAPS[saved] ? saved : "standard";
  } catch {
    return "standard";
  }
}

export function mapRecordYear(record) {
  return String(record.trip?.date || "").match(/^\d{4}/)?.[0] || "Unknown year";
}

export function mapYearColor(year) {
  return fallbackSpeciesColor(`year-${year}`);
}

export function mapRecordColor(record) {
  if (record.type === "trip-photo") return "#2763a7";
  if (record.type === "trip-video") return "#9a5b00";
  return speciesColor(record.catchItem?.species);
}

export const trollingDirectionDegrees = {
  N: 0,
  NE: 45,
  E: 90,
  SE: 135,
  S: 180,
  SW: 225,
  W: 270,
  NW: 315
};

export function mapRecordTrollingDirection(record) {
  if (record.type !== "catch" || String(record.trip?.method || "").toLowerCase() !== "trolling") return null;
  const raw = String(record.catchItem?.direction || "").trim().toUpperCase();
  if (!raw) return null;
  if (Object.hasOwn(trollingDirectionDegrees, raw)) return { label: raw, degrees: trollingDirectionDegrees[raw] };
  const numeric = Number(raw.replace("°", ""));
  return Number.isFinite(numeric) ? { label: `${Math.round(numeric)}°`, degrees: ((numeric % 360) + 360) % 360 } : null;
}

export function mapDirectionMarker(record, color, fillColor, popupHtml, popupOptions) {
  const direction = mapRecordTrollingDirection(record);
  const icon = L.divIcon({
    className: "map-catch-direction-icon",
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    html: html`<span class="map-catch-direction-dot" style="--marker-color:${color};--marker-fill:${fillColor}" aria-hidden="true"><svg viewBox="0 0 16 16" style="transform:rotate(${direction.degrees}deg)"><path d="M8 2.25 12.4 9 8.95 8.1 8.95 13.75 7.05 13.75 7.05 8.1 3.6 9Z" /></svg></span>`
  });
  return L.marker([record.coordinates.latitude, record.coordinates.longitude], {
    icon,
    bubblingMouseEvents: false,
    pane: "fishMarkers",
    title: `${mapRecordTitle(record)} — trolling ${direction.label}`
  }).bindPopup(String(popupHtml), popupOptions);
}

export function shouldShowMapDirectionArrow(record, options = {}) {
  return Boolean(mapRecordTrollingDirection(record)) && options.showDirectionArrows !== false;
}

export function addMapMarker(layerGroup, record, options = {}) {
  const fillColor = mapRecordColor(record);
  const color = options.colorByYear ? mapYearColor(mapRecordYear(record)) : fillColor;
  const popupHtml = mapPopupHtml(record);
  const popupOptions = options.autoPanPopup === false ? { autoPan: false } : undefined;
  if (shouldShowMapDirectionArrow(record, options)) {
    return mapDirectionMarker(record, color, fillColor, popupHtml, popupOptions).addTo(layerGroup);
  }
  return L.circleMarker([record.coordinates.latitude, record.coordinates.longitude], {
    radius: record.type === "catch" ? 8 : 7,
    color,
    fillColor,
    fillOpacity: 0.86,
    weight: options.colorByYear ? 3 : 2,
    bubblingMouseEvents: false,
    pane: record.type === "catch" ? "fishMarkers" : "tripMediaMarkers"
  }).bindPopup(String(popupHtml), popupOptions).addTo(layerGroup);
}

export function ensureMapMarkerPanes(map) {
  if (!map.getPane("spotMarkers")) {
    map.createPane("spotMarkers");
    map.getPane("spotMarkers").style.zIndex = 600;
  }
  if (!map.getPane("tripMediaMarkers")) {
    map.createPane("tripMediaMarkers");
    map.getPane("tripMediaMarkers").style.zIndex = 610;
  }
  if (!map.getPane("fishMarkers")) {
    map.createPane("fishMarkers");
    map.getPane("fishMarkers").style.zIndex = 620;
  }
}

export function seamlessMapOptions() {
  return {
    zoomSnap: 1,
    zoomDelta: 1
  };
}

export function snapMapTilePane(map) {
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

export function bindMapTilePaneSnapping(map) {
  if (!map || map._logbookTilePaneSnapping) return;
  map._logbookTilePaneSnapping = true;
  map.on("moveend zoomend resize", () => requestAnimationFrame(() => snapMapTilePane(map)));
}

export function addSeamlessTileLayer(map, basemap = "standard") {
  const config = MAP_BASEMAPS[basemap] || MAP_BASEMAPS.standard;
  const tileLayer = L.tileLayer(config.url, config.options).addTo(map);
  tileLayer.on("load tileload", () => requestAnimationFrame(() => snapMapTilePane(map)));
  bindMapTilePaneSnapping(map);
  return tileLayer;
}

export function setFishMapBasemap(basemap) {
  const key = MAP_BASEMAPS[basemap] ? basemap : "standard";
  if (!ui.fishMap) return;
  if (fishMapBasemapLayer) ui.fishMap.removeLayer(fishMapBasemapLayer);
  fishMapBasemapLayer = addSeamlessTileLayer(ui.fishMap, key);
  try { localStorage.setItem(MAP_BASEMAP_STORAGE_KEY, key); } catch {}
}

export function ensureFishMapBasemapControl() {
  const control = document.querySelector("#mapBasemap");
  if (!control || control.dataset.bound) return;
  control.value = savedMapBasemap();
  control.dataset.bound = "true";
  control.addEventListener("change", () => setFishMapBasemap(control.value));
}

export function mapDepthText(payload = {}) {
  if (payload.depth_ft !== null && payload.depth_ft !== undefined && Number(payload.depth_ft) !== 0) return `${formatUnitValue(payload.depth_ft, "depth", "ft", { decimals: 1 })} FOW`;
  if (payload.depth_m !== null && payload.depth_m !== undefined && Number(payload.depth_m) !== 0) return `${formatUnitValue(payload.depth_m, "depth", "m", { decimals: 1 })} FOW`;
  if (payload.fowCaught) return displayFowValue(payload.fowCaught);
  return "";
}

export function catchFowPopupValue(catchItem = {}) {
  const fow = String(catchItem.fowCaught || catchItem.waterDepth || "").trim();
  if (fow) return displayFowValue(fow);
  if (catchItem.depth_ft !== null && catchItem.depth_ft !== undefined) return formatUnitValue(catchItem.depth_ft, "depth", "ft", { decimals: 1 });
  if (catchItem.depth_m !== null && catchItem.depth_m !== undefined) return formatUnitValue(catchItem.depth_m, "depth", "m", { decimals: 1 });
  return "";
}

export function catchSizePopupValue(catchItem = {}) {
  const weight = catchItem.weight ? displayStoredMeasurement(catchItem.weight, "fishWeight") : "";
  const length = catchItem.length ? displayStoredMeasurement(catchItem.length, "fishLength") : "";
  return [weight, length].filter(Boolean).join(" · ");
}

export function mapDepthPopupHtml(coordinates, payload = null, status = "loading", overlayHtml = "") {
  const compactClass = overlayHtml ? "" : " map-depth-popup--compact";
  if (status === "loading") {
    return html`
      <div class="map-popup map-depth-popup${compactClass}">
        <strong>Depth lookup</strong>
        <span>Looking up...</span>
        ${overlayHtml}
      </div>
    `;
  }
  if (status === "error") {
    return html`
      <div class="map-popup map-depth-popup${compactClass}">
        <strong>Depth unavailable</strong>
        <span>Could not fetch depth here.</span>
        ${overlayHtml}
      </div>
    `;
  }
  const depthText = mapDepthText(payload);
  return html`
    <div class="map-popup map-depth-popup${compactClass}">
      <strong>${depthText || "No depth found"}</strong>
      ${overlayHtml}
    </div>
  `;
}

export async function showDepthPopupForMapClick(map, event) {
  if (!map) return;
  const coordinates = {
    latitude: Number(event.latlng?.lat),
    longitude: Number(event.latlng?.lng)
  };
  if (!Number.isFinite(coordinates.latitude) || !Number.isFinite(coordinates.longitude)) return;
  const popup = L.popup()
    .setLatLng(event.latlng)
    .setContent(String(mapDepthPopupHtml(coordinates)))
    .openOn(map);
  const params = new URLSearchParams({
    latitude: coordinates.latitude.toFixed(6),
    longitude: coordinates.longitude.toFixed(6)
  });
  const [depthResult, currentResult] = await Promise.allSettled([
    fetch(`/api/bathymetry/depth?${params}`).then((response) => {
      if (!response.ok) throw new Error("Depth lookup unavailable");
      return response.json();
    }),
    window.getGreatLakesMapInspection?.(coordinates) || Promise.resolve("")
  ]);
  if (!map.hasLayer(popup)) return;
  if (depthResult.status === "rejected") console.error("Could not fetch map depth.", depthResult.reason);
  popup.setContent(String(mapDepthPopupHtml(
    coordinates,
    depthResult.status === "fulfilled" ? depthResult.value : null,
    depthResult.status === "fulfilled" ? "ready" : "error",
    currentResult.status === "fulfilled" ? currentResult.value : ""
  )));
}

export function bindDepthLookupPopup(map) {
  if (!map || map._logbookDepthLookupBound) return;
  map._logbookDepthLookupBound = true;
  map.on("click", (event) => showDepthPopupForMapClick(map, event));
}

export function ensureMapPageChartOverlay(map) {
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

export function syncMapPageChartOverlay(map) {
  if (!map) return;
  ensureMapPageChartOverlay(map);
  const noaaLayer = map._logbookNoaaLayer;
  if (!noaaLayer) return;

  if (els.mapNoaaChartsToggle) {
    els.mapNoaaChartsToggle.checked = ui.activeMapShowNOAACharts;
    els.mapNoaaChartsToggle.disabled = false;
  }

  if (ui.activeMapShowNOAACharts) {
    if (!map.hasLayer(noaaLayer)) noaaLayer.addTo(map);
    noaaLayer.bringToFront?.();
  } else if (map.hasLayer(noaaLayer)) {
    map.removeLayer(noaaLayer);
  }
}

export function settleMapLayout(map) {
  setTimeout(() => {
    map.invalidateSize();
    snapMapTilePane(map);
  }, 0);
}

export function mapRecordTitle(record) {
  if (record.type === "trip-photo") return record.media.caption || "Trip photo";
  if (record.type === "trip-video") return record.media.caption || "Trip video";
  return record.catchItem?.species || "Fish";
}

export function mapRecordFilterOptions(records, options = {}) {
  const species = records
    .filter((record) => record.type === "catch")
    .map((record) => record.catchItem.species || "Unknown species");
  const mediaTypes = options.includeTripMedia
    ? records.filter((record) => record.type !== "catch").map((record) => record.filterValue)
    : [];
  return [options.allLabel || "All species", ...new Set([...species, ...mediaTypes])];
}

export function renderMapSpeciesFilter(records) {
  const options = mapRecordFilterOptions(records, { allLabel: "All species" });
  if (!options.includes(ui.activeMapSpecies)) ui.activeMapSpecies = "All species";
  setHtml(els.mapSpeciesFilter, joinHtml(options.map((option) => (
    html`<option value="${option}" ${option === ui.activeMapSpecies ? "selected" : ""}>${option}</option>`
  )), ""));
  if (els.mapTripPhotosToggle) els.mapTripPhotosToggle.checked = ui.activeMapIncludeTripMedia;
}

export function mapRecordLake(record) {
  const catchLake = String(record.catchItem?.lake_name || "").trim();
  const tripLake = String(record.trip?.location || "").trim();
  if (catchLake && tripLake.toLowerCase().includes(catchLake.toLowerCase())) return tripLake;
  const greatLake = ["Ontario", "Erie", "Huron", "Michigan", "Superior"].find((name) => name.toLowerCase() === catchLake.toLowerCase());
  if (greatLake) return `Lake ${greatLake}`;
  return catchLake || tripLake || "Unknown lake";
}

export function mapRecordMethod(record) {
  return String(record.trip?.method || "Unknown method").trim() || "Unknown method";
}

export function mapRecordAngler(record) {
  if (record.type !== "catch") return "";
  const personId = record.catchItem?.personId;
  if (!personId) return "Unknown angler";
  return (state.people || []).find((person) => person.id === personId)?.name
    || (record.trip?.people || []).find((person) => person.id === personId)?.name
    || "Unknown angler";
}

export function visibleMapSpots() {
  return (state.spots || []).filter((spot) => isUsableCoordinates(spot?.coordinates));
}

export function mapSpotPopupHtml(spot) {
  const radius = Number(spot.radiusMeters);
  const radiusText = Number.isFinite(radius) && radius > 0
    ? `${typeof fishingSpotRadiusText === "function" ? fishingSpotRadiusText(radius) : `${Math.round(radius)} m`} radius`
    : "";
  return html`
    <div class="map-popup map-spot-popup">
      <strong>${spot.name || "Fishing spot"}</strong>
      ${radiusText ? html`<span>${radiusText}</span>` : ""}
      <small>${coordinateText(spot.coordinates)}</small>
    </div>
  `;
}

export function addMapSpotMarker(layerGroup, spot) {
  const point = [spot.coordinates.latitude, spot.coordinates.longitude];
  const popupHtml = mapSpotPopupHtml(spot);
  const radius = Number(spot.radiusMeters);
  if (Number.isFinite(radius) && radius > 0) {
    L.circle(point, {
      radius,
      color: "#118753",
      weight: 2,
      fillColor: "#2fb875",
      fillOpacity: 0.12,
      interactive: false,
      pane: "spotMarkers"
    }).addTo(layerGroup);
  }
  return L.circleMarker(point, {
    radius: 7,
    color: "#0b6e43",
    fillColor: "#d9f7e8",
    fillOpacity: 1,
    weight: 3,
    pane: "spotMarkers",
    title: spot.name || "Fishing spot"
  }).bindPopup(String(popupHtml)).addTo(layerGroup);
}

export function sortedMapValues(records, getValue) {
  return [...new Set(records.map(getValue).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export function renderMapSelect(select, records, getValue, allLabel, activeValue, options = {}) {
  if (!select) return activeValue;
  const values = sortedMapValues(records, getValue);
  const nextValue = [allLabel, ...values].includes(activeValue) ? activeValue : allLabel;
  setHtml(select, joinHtml([allLabel, ...values].map((value) => (
    html`<option value="${value}" ${value === nextValue ? "selected" : ""}>${value}</option>`
  )), ""));
  select.closest("label")?.classList.toggle("hidden", Boolean(options.hideWhenEmpty && !values.length));
  return nextValue;
}

export function renderAdditionalMapFilters(records) {
  const catches = records.filter((record) => record.type === "catch");
  const filterableRecords = ui.activeMapIncludeTripMedia ? records : catches;
  ui.activeMapLake = renderMapSelect(els.mapLakeFilter, filterableRecords, mapRecordLake, "All lakes", ui.activeMapLake);
  ui.activeMapMethod = renderMapSelect(els.mapMethodFilter, filterableRecords, mapRecordMethod, "All methods", ui.activeMapMethod);
  ui.activeMapDirection = renderMapSelect(els.mapDirectionFilter, catches, (record) => mapRecordTrollingDirection(record)?.label, "All directions", ui.activeMapDirection);
  ui.activeMapAngler = renderMapSelect(els.mapAnglerFilter, catches, mapRecordAngler, "All anglers", ui.activeMapAngler);
  if (els.mapSpotsToggle) els.mapSpotsToggle.checked = ui.activeMapIncludeSpots;
  if (els.mapDirectionArrowsToggle) els.mapDirectionArrowsToggle.checked = ui.activeMapShowDirectionArrows;
}

export function mapYearFilterOptions(records) {
  const years = [...new Set(records.map(mapRecordYear))];
  return ["All years", ...years.sort((a, b) => {
    if (a === "Unknown year") return 1;
    if (b === "Unknown year") return -1;
    return b.localeCompare(a);
  })];
}

export function renderMapYearFilter(records) {
  const options = mapYearFilterOptions(records);
  if (!options.includes(ui.activeMapYear)) ui.activeMapYear = "All years";
  setHtml(els.mapYearFilter, joinHtml(options.map((option) => (
    html`<option value="${option}" ${option === ui.activeMapYear ? "selected" : ""}>${option}</option>`
  )), ""));
  els.mapYearFilter.disabled = ui.activeMapYearFilteringHidden;
  els.mapYearFilterControl?.classList.toggle("hidden", ui.activeMapYearFilteringHidden);
  if (els.mapHideYearFilterToggle) els.mapHideYearFilterToggle.checked = ui.activeMapYearFilteringHidden;
}

export function filteredCatchMapRecords(records, filterValue = ui.activeMapSpecies) {
  const catches = records.filter((record) => record.type === "catch");
  if (filterValue === "All species") return catches;
  return catches.filter((record) => record.filterValue === filterValue);
}

export function filteredMapRecords(records, filterValue = ui.activeMapSpecies, options = {}) {
  if (filterValue === "All map items") return records;
  const catches = filteredCatchMapRecords(records, filterValue);
  const media = options.includeTripMedia
    ? records.filter((record) => record.type !== "catch")
    : [];
  return [...catches, ...media];
}

export function filteredMapRecordsByYear(records, year = ui.activeMapYear) {
  if (ui.activeMapYearFilteringHidden || year === "All years") return records;
  return records.filter((record) => mapRecordYear(record) === year);
}

export function filteredMapRecordsByDetails(records, filters = {}) {
  const lake = filters.lake || ui.activeMapLake;
  const method = filters.method || ui.activeMapMethod;
  const direction = filters.direction || ui.activeMapDirection;
  const angler = filters.angler || ui.activeMapAngler;
  return records.filter((record) => {
    if (lake !== "All lakes" && mapRecordLake(record) !== lake) return false;
    if (method !== "All methods" && mapRecordMethod(record) !== method) return false;
    if (direction !== "All directions" && mapRecordTrollingDirection(record)?.label !== direction) return false;
    if (angler !== "All anglers" && mapRecordAngler(record) !== angler) return false;
    return true;
  });
}

export function mapRecordsInViewport(map, records) {
  if (!map?._loaded || typeof map.getBounds !== "function") return records;
  const bounds = map.getBounds();
  return records.filter((record) => bounds.contains([record.coordinates.latitude, record.coordinates.longitude]));
}

export function mapSpotsInViewport(map, spots) {
  if (!map?._loaded || typeof map.getBounds !== "function") return spots;
  const bounds = map.getBounds();
  return spots.filter((spot) => bounds.contains([spot.coordinates.latitude, spot.coordinates.longitude]));
}

export function renderMapLegend(records, options = {}) {
  const species = mapRecordFilterOptions(records, { allLabel: "All species" }).slice(1);
  const mediaTypes = options.includeTripMedia
    ? [...new Set(records.filter((record) => record.type !== "catch").map((record) => record.filterValue))]
    : [];
  const legendItems = [...species, ...mediaTypes];
  if (!legendItems.length) return "";
  return html`
    <div class="map-legend">
      ${joinHtml(legendItems.map((name) => html`
        <span><i style="--pin-color:${name === "Trip Photos" ? "#2763a7" : name === "Trip Videos" ? "#9a5b00" : speciesColor(name)}"></i>${name}</span>
      `), "")}
    </div>
  `;
}

export function mapPopupHtml(record) {
  const { trip, media } = record;
  const title = [mapRecordTitle(record), trip.location].filter(Boolean).join(" at ");
  const fowValue = record.type === "catch" ? catchFowPopupValue(record.catchItem) : "";
  const sizeValue = record.type === "catch" ? catchSizePopupValue(record.catchItem) : "";
  const assignedSpot = record.type === "catch" ? spotName(record.catchItem?.spotId) : "";
  const direction = mapRecordTrollingDirection(record)?.label || "";
  const method = record.type === "catch" ? mapRecordMethod(record) : "";
  const detailRows = [
    sizeValue ? html`<div class="map-popup-detail"><span class="map-popup-label">Size</span><span class="map-popup-value">${sizeValue}</span></div>` : "",
    fowValue ? html`<div class="map-popup-detail"><span class="map-popup-label">FOW</span><span class="map-popup-value">${fowValue}</span></div>` : "",
    method ? html`<div class="map-popup-detail"><span class="map-popup-label">Method</span><span class="map-popup-value">${method}</span></div>` : "",
    direction ? html`<div class="map-popup-detail"><span class="map-popup-label">Direction</span><span class="map-popup-value">${direction}</span></div>` : "",
    assignedSpot ? html`<div class="map-popup-detail"><span class="map-popup-label">Spot</span><span class="map-popup-value">${assignedSpot}</span></div>` : ""
  ].filter(Boolean);
  return html`
    <div class="map-popup map-record-popup" data-map-view-trip="${trip.id}" role="button" tabindex="0">
      ${media && previewImage(media) ? mediaMarkup(media) : ""}
      <div class="map-popup-heading">
        <strong class="map-popup-title">${title}</strong>
        <span class="map-popup-date">${formatDate(trip.date)}</span>
      </div>
      ${detailRows.length ? html`<div class="map-popup-details" aria-label="Map record details">${joinHtml(detailRows)}</div>` : ""}
      <button class="map-popup-trip-link" type="button" data-view-trip="${trip.id}">View Trip</button>
    </div>
  `;
}

export function renderMapYearLegend(records, options = {}) {
  const legendItems = mapRecordFilterOptions(records, { allLabel: "All species", includeTripMedia: options.includeTripMedia }).slice(1);
  const years = options.showYearOutlines ? mapYearFilterOptions(records).slice(1) : [];
  if (!years.length && !legendItems.length) return "";
  return html`
    <div class="map-legend map-dual-legend">
      ${legendItems.length ? html`<strong>Species</strong>${joinHtml(legendItems.map((name) => html`<span><i style="--pin-color:${name === "Trip Photos" ? "#2763a7" : name === "Trip Videos" ? "#9a5b00" : speciesColor(name)}"></i>${name}</span>`), "")}` : ""}
      ${options.spotCount ? html`<strong>Layers</strong><span><i class="map-spot-key"></i>${`${options.spotCount} saved ${options.spotCount === 1 ? "spot" : "spots"}`}</span>` : ""}
      ${years.length ? html`<strong>Year outline</strong>${joinHtml(years.map((year) => html`<span><i class="map-year-key" style="--pin-color:${mapYearColor(year)}"></i>${year}</span>`), "")}` : ""}
      ${records.some(mapRecordTrollingDirection) ? html`<span class="map-direction-key"><i>↑</i>Trolling direction</span>` : ""}
    </div>
  `;
}

export function renderFishMapLegend(records, spots) {
  const visibleRecords = mapRecordsInViewport(ui.fishMap, records);
  const visibleSpots = mapSpotsInViewport(ui.fishMap, spots);
  setHtml(els.mapLegend, renderMapYearLegend(visibleRecords, {
    includeTripMedia: ui.activeMapIncludeTripMedia,
    showYearOutlines: !ui.activeMapYearFilteringHidden,
    spotCount: visibleSpots.length
  }));
}

export function refreshFishMapLegend() {
  const allRecords = catchMapRecords();
  const spots = ui.activeMapIncludeSpots ? visibleMapSpots() : [];
  const records = filteredMapRecordsByYear(filteredMapRecordsByDetails(
    filteredMapRecords(allRecords, ui.activeMapSpecies, { includeTripMedia: ui.activeMapIncludeTripMedia })
  ));
  renderFishMapLegend(records, spots);
}

export function renderFishMap() {
  const allRecords = catchMapRecords();
  const spots = ui.activeMapIncludeSpots ? visibleMapSpots() : [];
  renderMapSpeciesFilter(allRecords);
  renderAdditionalMapFilters(allRecords);
  renderMapYearFilter(allRecords);
  const records = filteredMapRecordsByYear(filteredMapRecordsByDetails(
    filteredMapRecords(allRecords, ui.activeMapSpecies, { includeTripMedia: ui.activeMapIncludeTripMedia })
  ));
  renderFishMapLegend(records, spots);
  if (!L) {
    setHtml(els.fishMap, html`<div class="empty-state"><p>Map tiles are unavailable; saved coordinates can still be inspected from trip details.</p></div>`);
    return;
  }

  if (!ui.fishMap) {
    ui.fishMap = L.map(els.fishMap, seamlessMapOptions());
    fishMapBasemapLayer = addSeamlessTileLayer(ui.fishMap, savedMapBasemap());
    ensureFishMapBasemapControl();
    bindDepthLookupPopup(ui.fishMap);
    ensureGreatLakesConditions(ui.fishMap);
    syncMapPageChartOverlay(ui.fishMap);
    ensureMapMarkerPanes(ui.fishMap);
    ui.fishMapMarkers = L.layerGroup().addTo(ui.fishMap);
    ui.fishMapSpotMarkers = L.layerGroup().addTo(ui.fishMap);
    ui.fishMap.on("moveend resize", refreshFishMapLegend);
  }
  ensureGreatLakesConditions(ui.fishMap);
  syncMapPageChartOverlay(ui.fishMap);
  ensureMapMarkerPanes(ui.fishMap);

  ui.fishMapMarkers.clearLayers();
  ui.fishMapSpotMarkers.clearLayers();
  if (!records.length && !spots.length) {
    const homeLake = window.getGreatLakesHomeView?.();
    ui.fishMap.setView(homeLake?.center || [43.8, -79.5], homeLake?.zoom || 6);
    settleMapLayout(ui.fishMap);
    renderFishMapLegend(records, spots);
    return;
  }

  const bounds = [];
  records.forEach((record) => {
    const point = [record.coordinates.latitude, record.coordinates.longitude];
    bounds.push(point);
    addMapMarker(ui.fishMapMarkers, record, {
      colorByYear: !ui.activeMapYearFilteringHidden,
      showDirectionArrows: ui.activeMapShowDirectionArrows
    });
  });
  spots.forEach((spot) => {
    bounds.push([spot.coordinates.latitude, spot.coordinates.longitude]);
    addMapSpotMarker(ui.fishMapSpotMarkers, spot);
  });

  if (bounds.length === 1) ui.fishMap.setView(bounds[0], 13);
  else ui.fishMap.fitBounds(bounds, { padding: [28, 28] });
  settleMapLayout(ui.fishMap);
  renderFishMapLegend(records, spots);
}

export function catchMapRecordsForTrip(trip) {
  return mapRecordsForTrip(trip);
}

export function renderTripSummaryMapFilter(records) {
  const filter = document.querySelector("#tripSummaryMapFilter");
  if (!filter) return;
  const options = mapRecordFilterOptions(records, { allLabel: "All map items", includeTripMedia: true });
  if (!options.includes(ui.activeTripSummaryMapFilter)) ui.activeTripSummaryMapFilter = "All map items";
  setHtml(filter, joinHtml(options.map((option) => (
    html`<option value="${option}" ${option === ui.activeTripSummaryMapFilter ? "selected" : ""}>${option === "All map items" ? "All" : option}</option>`
  )), ""));
}

export function renderTripSummaryMap(trip) {
  const mapNode = document.querySelector("#tripSummaryMap");
  if (!mapNode) return;
  const allRecords = catchMapRecordsForTrip(trip);
  renderTripSummaryMapFilter(allRecords);
  const records = filteredMapRecords(allRecords, ui.activeTripSummaryMapFilter);
  const legend = document.querySelector("#tripSummaryMapLegend");
  if (legend) setHtml(legend, renderMapLegend(records, { includeTripMedia: true }));

  if (!L) {
    setHtml(mapNode, html`<div class="empty-state"><p>Map tiles are unavailable.</p></div>`);
    return;
  }

  if (!ui.tripSummaryMap) {
    ui.tripSummaryMap = L.map(mapNode, seamlessMapOptions());
    addSeamlessTileLayer(ui.tripSummaryMap);
    bindDepthLookupPopup(ui.tripSummaryMap);
    ensureMapMarkerPanes(ui.tripSummaryMap);
    ui.tripSummaryMapMarkers = L.layerGroup().addTo(ui.tripSummaryMap);
  } else if (ui.tripSummaryMap.getContainer() !== mapNode) {
    ui.tripSummaryMap.remove();
    ui.tripSummaryMap = L.map(mapNode, seamlessMapOptions());
    addSeamlessTileLayer(ui.tripSummaryMap);
    bindDepthLookupPopup(ui.tripSummaryMap);
    ensureMapMarkerPanes(ui.tripSummaryMap);
    ui.tripSummaryMapMarkers = L.layerGroup().addTo(ui.tripSummaryMap);
  }
  ensureMapMarkerPanes(ui.tripSummaryMap);

  ui.tripSummaryMapMarkers.clearLayers();
  if (!records.length) {
    ui.tripSummaryMap.setView([43.8, -79.5], 6);
    settleMapLayout(ui.tripSummaryMap);
    return;
  }

  const bounds = [];
  records.forEach((record) => {
    const point = [record.coordinates.latitude, record.coordinates.longitude];
    bounds.push(point);
    addMapMarker(ui.tripSummaryMapMarkers, record);
  });

  if (bounds.length === 1) ui.tripSummaryMap.setView(bounds[0], 13);
  else ui.tripSummaryMap.fitBounds(bounds, { padding: [24, 24] });
  settleMapLayout(ui.tripSummaryMap);
}

export function destroyCatchDetailLocationMap() {
  if (ui.catchDetailMap) ui.catchDetailMap.remove();
  ui.catchDetailMap = null;
  ui.catchDetailMapMarkers = null;
}

export function catchDetailLocationRecords(trip, scope) {
  const records = scope === "all" ? catchMapRecords() : catchMapRecordsForTrip(trip);
  return records.filter((record) => record.type === "catch");
}

export function renderCatchDetailLocationMap(trip, catchItem, catchIndex, scope = "trip") {
  const mapNode = document.querySelector("#catchDetailLocationMap");
  if (!mapNode) return;
  destroyCatchDetailLocationMap();
  const records = catchDetailLocationRecords(trip, scope);
  const legendNode = document.querySelector("#catchDetailLocationLegend");
  if (legendNode) setHtml(legendNode, renderMapYearLegend(records, { includeTripMedia: false }));
  if (!L) {
    setHtml(mapNode, html`<div class="empty-state catch-detail-location-empty"><p>Map tiles are unavailable.</p></div>`);
    return;
  }
  if (!records.length) {
    setHtml(mapNode, html`<div class="empty-state catch-detail-location-empty"><p>No saved coordinates are available for these catches.</p></div>`);
    return;
  }
  ui.catchDetailMap = L.map(mapNode, seamlessMapOptions());
  addSeamlessTileLayer(ui.catchDetailMap, savedMapBasemap());
  bindDepthLookupPopup(ui.catchDetailMap);
  ensureMapMarkerPanes(ui.catchDetailMap);
  ui.catchDetailMapMarkers = L.layerGroup().addTo(ui.catchDetailMap);
  const bounds = [];
  records.forEach((mapRecord) => {
    const point = [mapRecord.coordinates.latitude, mapRecord.coordinates.longitude];
    bounds.push(point);
    addMapMarker(ui.catchDetailMapMarkers, mapRecord, { autoPanPopup: false });
  });
  if (bounds.length === 1) ui.catchDetailMap.setView(bounds[0], 13);
  else ui.catchDetailMap.fitBounds(bounds, { padding: [28, 28] });
  settleMapLayout(ui.catchDetailMap);
}

export function setup() {
  MAP_BASEMAPS = {
    standard: {
      url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      options: { attribution: "&copy; OpenStreetMap contributors" }
    },
    dark: {
      url: `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=${CARTO_BASEMAP_KEY}`,
      options: { attribution: "&copy; OpenStreetMap contributors &copy; CARTO", subdomains: "abcd", maxZoom: 20 }
    },
    minimal: {
      url: `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=${CARTO_BASEMAP_KEY}`,
      options: { attribution: "&copy; OpenStreetMap contributors &copy; CARTO", subdomains: "abcd", maxZoom: 20 }
    }
  };
}
