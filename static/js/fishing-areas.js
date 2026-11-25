import { L } from "./vendor.js";
import { state, ui } from "./app-state.js";
import { html, joinHtml, setHtml } from "./html.js";
import { createId, defaults } from "./app-defaults.js";
import { replaceDrifts, replaceFishingSpots } from "./actions.js";
import { isUsableCoordinates } from "./app-media.js";
import { locationNames } from "./app-normalization.js";
import { polygonArea, polygonSelfIntersects, polygonsOverlap } from "./drifts.js";
import { isPolygonSpot, spotAreasOverlap } from "./spot-geometry.js";
import { detectWaterbody } from "./waterbody-detection.js";
import { addSeamlessTileLayer, renderFishMap, seamlessMapOptions } from "./maps.js";
import {
  fishingSpotRadiusDisplayValue, fishingSpotRadiusMeters, fishingSpotRadiusSliderConfig, fishingSpotRadiusText,
  privateLocationDefaultCoordinates, privateLocationRadiusDisplayValue, privateLocationRadiusMeters,
  privateLocationRadiusSliderConfig, privateLocationRadiusText, privatePhotoLocations, savePrivatePhotoLocations
} from "./settings-locations.js";

let bound = false;
let draft = null;
let kind = "spot";
let waterbodyEdited = false;
let map = null;
let layer = null;
let contextLayer = null;
let tripPointLayer = null;
const overviewMaps = {
  spot: { host: "#fishingSpotOverviewMap", empty: "#fishingSpotOverviewEmpty", map: null, layer: null, hasFit: false },
  drift: { host: "#driftOverviewMap", empty: "#driftOverviewEmpty", map: null, layer: null, hasFit: false },
  home: { host: "#homeLocationOverviewMap", empty: "#homeLocationOverviewEmpty", map: null, layer: null, hasFit: false }
};
const selected = { spot: "", drift: "", home: "" };
const DRIFT_VERTEX_SNAP_PX = 16;

const areaLists = {
  spot: { host: "#areaSpotList", search: "#fishingSpotSearch", title: "Spot", empty: "No spots saved.", records: () => state.spots, save: replaceFishingSpots },
  drift: { host: "#areaDriftList", search: "#driftSearch", title: "Drift", empty: "No drifts saved.", records: () => state.drifts, save: replaceDrifts },
  home: { host: "#privatePhotoLocationList", search: "#homeLocationSearch", title: "Home Location", empty: "No home locations saved.", records: privatePhotoLocations, save: savePrivatePhotoLocations }
};
const radiusControls = {
  spot: { config: fishingSpotRadiusSliderConfig, display: fishingSpotRadiusDisplayValue, meters: fishingSpotRadiusMeters, text: fishingSpotRadiusText },
  home: { config: privateLocationRadiusSliderConfig, display: privateLocationRadiusDisplayValue, meters: privateLocationRadiusMeters, text: privateLocationRadiusText }
};

const list = (type) => areaLists[type].records();
const point = (latlng) => ({ latitude: latlng.lat, longitude: latlng.lng });
const activeDialog = () => document.querySelector("#fishingAreaDialog");
const waterbodyField = () => kind === "spot" ? "lake" : "waterbody";

function snapAreaVertex(latlng) {
  const unsnapped = point(latlng);
  if (!map || !draft || (kind !== "drift" && !(kind === "spot" && isPolygonSpot(draft)))) return unsnapped;

  const pointer = map.latLngToContainerPoint(latlng);
  let nearest = null;
  let nearestDistanceSquared = DRIFT_VERTEX_SNAP_PX ** 2;
  const otherAreas = kind === "drift"
    ? (Array.isArray(state.drifts) ? state.drifts : [])
    : [...(Array.isArray(state.spots) ? state.spots.filter(isPolygonSpot) : []), ...(Array.isArray(state.drifts) ? state.drifts : [])];
  otherAreas.filter((area) => area.id !== draft.id).forEach((area) => {
    (Array.isArray(area.polygon) ? area.polygon : []).filter(isUsableCoordinates).forEach((vertex) => {
      const candidate = map.latLngToContainerPoint([vertex.latitude, vertex.longitude]);
      const deltaX = candidate.x - pointer.x;
      const deltaY = candidate.y - pointer.y;
      const distanceSquared = deltaX * deltaX + deltaY * deltaY;
      if (distanceSquared < nearestDistanceSquared) {
        nearest = vertex;
        nearestDistanceSquared = distanceSquared;
      }
    });
  });

  return nearest ? { latitude: nearest.latitude, longitude: nearest.longitude } : unsnapped;
}

function assignmentCount(type, id) {
  return state.trips.reduce((count, trip) => count + [...(trip.catches || []), ...(trip.lostFish || [])]
    .filter((fish) => (type === "spot" ? fish.spotId : fish.driftId) === id).length, 0);
}

function savedTripPoints() {
  return (state.trips || []).flatMap((trip) => {
    const points = [];
    if (isUsableCoordinates(trip.coordinates)) {
      points.push({
        coordinates: trip.coordinates,
        label: `${trip.date || "Trip"} · ${trip.title || trip.location || "Trip location"}`,
        kind: "trip"
      });
    }
    (trip.notePhotos || []).forEach((photo) => {
      if (!isUsableCoordinates(photo.coordinates)) return;
      points.push({ coordinates: photo.coordinates, label: `${trip.date || "Trip"} · ${photo.caption || photo.filename || "Trip photo"}`, kind: "trip" });
    });
    (trip.liveEvents || []).forEach((event) => {
      if (!isUsableCoordinates(event.coordinates)) return;
      points.push({ coordinates: event.coordinates, label: `${trip.date || "Trip"} · ${event.title || "Trip event"}`, kind: "trip" });
    });
    [
      ...(trip.catches || []).map((fish) => ({ fish, kind: "catch" })),
      ...(trip.lostFish || []).map((fish) => ({ fish, kind: "lost" }))
    ].forEach(({ fish, kind: fishKind }) => {
      const selectedPhoto = fish.photoLocationId
        ? (fish.photos || []).find((photo) => photo.id === fish.photoLocationId && isUsableCoordinates(photo.coordinates))
        : null;
      const photo = selectedPhoto || (fish.photos || []).find((item) => isUsableCoordinates(item.coordinates));
      const coordinates = [fish.manualCoordinates, fish.coordinates, photo?.coordinates].find(isUsableCoordinates);
      if (!coordinates) return;
      const name = fish.species || fish.possibleSpecies || (fishKind === "lost" ? "Missed fish" : "Catch");
      points.push({ coordinates, label: `${trip.date || "Trip"} · ${name}`, kind: fishKind });
    });
    return points;
  });
}

function renderList(type) {
  const area = areaLists[type];
  const host = document.querySelector(area.host);
  if (!host) return;
  const search = String(document.querySelector(area.search)?.value || "").trim().toLowerCase();
  const records = [...list(type)].sort((a, b) => (a.id === selected[type] ? -1 : b.id === selected[type] ? 1 : a.name.localeCompare(b.name)))
    .filter((item) => `${item.name} ${item.lake || item.waterbody || ""}`.toLowerCase().includes(search));
  setHtml(host, records.length ? joinHtml(records.map((item) => {
    const details = type === "home" ? [`${privateLocationRadiusText(item.radiusMeters)} radius`] : [item.lake || item.waterbody];
    if (type === "spot") details.push(isPolygonSpot(item) ? "polygon boundary" : fishingSpotRadiusText(item.radiusMeters));
    if (type !== "home") {
      const count = assignmentCount(type, item.id);
      details.push(`${count} fish catch${count === 1 ? "" : "es"}`);
    }
    return html`
      <button type="button" class="fishing-area-row${item.id === selected[type] ? " is-selected" : ""}" data-open-fishing-area="${type}" data-area-id="${item.id}">
        <span class="fishing-area-row-name">${item.name}</span>
        <span class="fishing-area-row-meta">${details.filter(Boolean).join(" · ")}</span>
        <span class="fishing-area-row-edit">Edit</span>
      </button>
    `;
  }), "") : html`<p class="fishing-area-empty">${search ? "No matching areas." : area.empty}</p>`);
}

export function renderFishingAreas({ fitMap = false } = {}) {
  bind();
  renderList("spot");
  renderList("drift");
  renderList("home");
  Object.keys(overviewMaps).forEach((type) => renderOverviewMap(type, { fit: fitMap }));
}

function ensureOverviewMap(type) {
  const overview = overviewMaps[type];
  const host = document.querySelector(overview?.host);
  if (!L || !host) return false;
  const rect = host.getBoundingClientRect();
  if (rect.width < 20 || rect.height < 20) return false;
  if (!overview.map) {
    overview.map = L.map(host, seamlessMapOptions());
    addSeamlessTileLayer(overview.map);
    overview.layer = L.featureGroup().addTo(overview.map);
    overview.map.setView([43.21, -79.05], 8);
  }
  return true;
}

function overviewBounds(type) {
  const layer = overviewMaps[type]?.layer;
  if (!layer) return null;
  const bounds = layer.getBounds();
  return bounds.isValid() ? bounds : null;
}

function fitOverviewMap(type) {
  const overview = overviewMaps[type];
  if (!ensureOverviewMap(type)) return;
  const bounds = overviewBounds(type);
  if (!bounds) return;
  overview.map.invalidateSize();
  overview.map.fitBounds(bounds, { padding: [28, 28], maxZoom: 13 });
  overview.hasFit = true;
}

function renderOverviewMap(type, { fit = false } = {}) {
  const overview = overviewMaps[type];
  if (!ensureOverviewMap(type)) return;
  overview.layer.clearLayers();

  if (type === "spot" || type === "home") {
    const areas = type === "spot" ? (Array.isArray(state.spots) ? state.spots : []) : privatePhotoLocations();
    areas.forEach((area) => {
      if (!isUsableCoordinates(area.coordinates)) return;
      const point = [area.coordinates.latitude, area.coordinates.longitude];
      const active = selected[type] === area.id;
      const home = type === "home";
      const color = home ? (active ? "#3f65a9" : "#5879b4") : (active ? "#118753" : "#188457");
      const polygon = !home && isPolygonSpot(area) ? (area.polygon || []).filter(isUsableCoordinates) : [];
      if (polygon.length >= 3) {
        L.polygon(polygon.map((vertex) => [vertex.latitude, vertex.longitude]), {
          color, weight: active ? 3 : 2, fillColor: "#2fb875", fillOpacity: 0.12, interactive: false
        }).addTo(overview.layer);
      } else {
        L.circle(point, {
          radius: Number(area.radiusMeters) || (home ? 250 : 100),
          color,
          weight: active ? 3 : 2,
          fillColor: home ? "#7d9fdf" : "#2fb875",
          fillOpacity: home ? 0.16 : 0.12,
          interactive: false
        }).addTo(overview.layer);
      }
      L.circleMarker(point, {
        radius: 6,
        color: home ? "#344f83" : "#0c5037",
        weight: 2,
        fillColor: home ? "#8eace8" : "#39bd82",
        fillOpacity: 1,
        title: area.name
      })
        .bindTooltip(String(html`${area.name}`), { direction: "top", sticky: true })
        .on("click", () => openEditor(type, area.id))
        .addTo(overview.layer);
    });
  } else {
    (Array.isArray(state.drifts) ? state.drifts : []).forEach((drift) => {
      const points = (Array.isArray(drift.polygon) ? drift.polygon : [])
        .filter(isUsableCoordinates)
        .map((vertex) => [vertex.latitude, vertex.longitude]);
      if (points.length < 3) return;
      const active = selected.drift === drift.id;
      L.polygon(points, {
        color: active ? "#145d7a" : "#287fa2",
        weight: active ? 3 : 2,
        fillColor: "#44a9d3",
        fillOpacity: 0.2
      })
        .bindTooltip(String(html`${drift.name}`), { sticky: true })
        .on("click", () => openEditor("drift", drift.id))
        .addTo(overview.layer);
    });
  }

  const bounds = overviewBounds(type);
  const fitButton = document.querySelector(`[data-fit-fishing-area-overview="${type}"]`);
  if (fitButton) fitButton.disabled = !bounds;
  const empty = document.querySelector(overview.empty);
  if (empty) empty.hidden = Boolean(bounds);
  requestAnimationFrame(() => {
    if (!overview.map) return;
    overview.map.invalidateSize();
    if (bounds && (fit || !overview.hasFit)) {
      overview.map.fitBounds(bounds, { padding: [28, 28], maxZoom: 13 });
      overview.hasFit = true;
    }
  });
}

function renderVertices() {
  const host = document.querySelector("#fishingAreaVertices");
  if (!host || !draft) return;
  setHtml(host, joinHtml(draft.polygon.map((_, index) => html`
    <div class="fishing-area-vertex">
      <span>${kind === "spot" ? "Corner" : "Point"} ${index + 1}</span>
      <button type="button" class="button secondary" data-remove-vertex="${index}" aria-label="Remove ${kind === "spot" ? "corner" : "point"} ${index + 1}">Remove</button>
    </div>
  `), ""));
}

function renderFields() {
  const host = document.querySelector("#fishingAreaFields");
  if (!host || !draft) return;
  const radiusControl = radiusControls[kind];
  const radius = kind === "spot" && isPolygonSpot(draft) ? null : radiusControl?.config();
  const savedWaterbodies = kind === "home" ? [] : [...new Set(locationNames())].sort((a, b) => a.localeCompare(b));
  setHtml(host, html`
    <label><span>Name</span><input id="fishingAreaName" type="text" value="${draft.name}" required /></label>
    ${kind === "spot" ? html`
      <label><span>Boundary shape</span><select id="fishingAreaBoundaryType"><option value="circle" ${isPolygonSpot(draft) ? "" : "selected"}>Radius circle</option><option value="polygon" ${isPolygonSpot(draft) ? "selected" : ""}>Polygon</option></select></label>
    ` : ""}
    ${kind === "home" ? "" : html`
      <div class="fishing-area-waterbody-controls">
        <label><span>Waterbody</span><input id="fishingAreaWaterbody" type="text" value="${draft.lake || draft.waterbody || ""}" placeholder="Niagara River" /></label>
        <select id="fishingAreaSavedWaterbody" aria-label="Saved waterbodies" ${savedWaterbodies.length ? "" : "disabled"}>
          <option value="" disabled selected>${savedWaterbodies.length ? "Choose a saved waterbody" : "No saved waterbodies"}</option>
          ${joinHtml(savedWaterbodies.map(name => html`<option value="${name}">${name}</option>`), "")}
        </select>
      </div>
    `}
    ${radius ? html`
      <label for="fishingAreaRadius"><span>${kind === "home" ? "Privacy radius" : "Radius"} <output id="fishingAreaRadiusValue">${radiusControl.text(draft.radiusMeters)}</output></span><input id="fishingAreaRadius" type="range" min="${radius.min}" max="${radius.max}" step="${radius.step}" value="${radiusControl.display(draft.radiusMeters)}" /></label>
    ` : html`
      <p class="fishing-area-hint">Numbered pins match the corner list. Tap to add corners or drag a pin to move it; both snap to nearby area corners. At least three corners are required.</p>
      ${defaults.drifts.some(drift => drift.id === draft.id) ? html`<button type="button" class="button secondary" data-use-starter-boundary>Preview updated Niagara outline</button>` : ""}
      <div id="fishingAreaVertices" class="fishing-area-vertices"></div>
      <div class="fishing-area-vertex-actions"><button type="button" class="button secondary" data-undo-vertex>Undo last point</button></div>
    `}
  `);
  if (kind === "drift" || (kind === "spot" && isPolygonSpot(draft))) renderVertices();
}

function updateWaterbody() {
  if (!draft || kind === "home" || waterbodyEdited) return;
  const points = kind === "spot" ? (isPolygonSpot(draft) ? draft.polygon : [draft.coordinates]) : draft.polygon;
  const name = (kind === "drift" || (kind === "spot" && isPolygonSpot(draft))) && points.length < 3 ? "" : detectWaterbody(points, state);
  draft[waterbodyField()] = name;
  document.querySelector("#fishingAreaWaterbody").value = name;
}

function placePin(latlng) {
  draft.coordinates = { ...draft.coordinates, ...point(latlng) };
  draw();
}

function syncSpotPolygonAnchor() {
  if (kind !== "spot" || !isPolygonSpot(draft) || !draft.polygon.length) return;
  draft.coordinates = {
    latitude: draft.polygon.reduce((sum, vertex) => sum + vertex.latitude, 0) / draft.polygon.length,
    longitude: draft.polygon.reduce((sum, vertex) => sum + vertex.longitude, 0) / draft.polygon.length
  };
}

function renderMapContext() {
  if (!contextLayer || !tripPointLayer || !draft) return;
  contextLayer.clearLayers();
  tripPointLayer.clearLayers();
  if (kind === "spot") {
    (state.spots || []).filter((spot) => spot.id !== draft.id).forEach((spot) => {
      if (!isUsableCoordinates(spot.coordinates)) return;
      if (isPolygonSpot(spot) && (spot.polygon || []).length >= 3) {
        L.polygon(spot.polygon.map((vertex) => [vertex.latitude, vertex.longitude]), {
          color: "#96a6af", weight: 2, dashArray: "5 4", fillColor: "#96a6af", fillOpacity: 0.04, interactive: false
        }).addTo(contextLayer);
        spot.polygon.forEach((vertex) => L.circleMarker([vertex.latitude, vertex.longitude], {
          radius: 4, color: "#677985", weight: 2, fillColor: "#ffffff", fillOpacity: 1, interactive: false
        }).addTo(contextLayer));
      } else {
        L.circle([spot.coordinates.latitude, spot.coordinates.longitude], {
          radius: Number(spot.radiusMeters) || 0, color: "#96a6af", weight: 2, fillColor: "#96a6af", fillOpacity: 0.04, interactive: false
        }).addTo(contextLayer);
      }
    });
    (state.drifts || []).forEach((drift) => {
      const coordinates = (Array.isArray(drift.polygon) ? drift.polygon : []).filter(isUsableCoordinates);
      const vertices = coordinates.map((vertex) => [vertex.latitude, vertex.longitude]);
      if (vertices.length >= 3) L.polygon(vertices, { color: "#96a6af", weight: 2, dashArray: "5 4", fillColor: "#96a6af", fillOpacity: 0.04, interactive: false }).addTo(contextLayer);
      coordinates.forEach((vertex) => L.circleMarker([vertex.latitude, vertex.longitude], {
        radius: 4, color: "#677985", weight: 2, fillColor: "#ffffff", fillOpacity: 1, interactive: false
      }).addTo(contextLayer));
    });
  } else if (kind === "drift") {
    (state.drifts || []).filter((drift) => drift.id !== draft.id).forEach((drift) => {
      const coordinates = (Array.isArray(drift.polygon) ? drift.polygon : []).filter(isUsableCoordinates);
      const vertices = coordinates.map((vertex) => [vertex.latitude, vertex.longitude]);
      if (vertices.length >= 3) L.polygon(vertices, { color: "#96a6af", weight: 2, dashArray: "5 4", fillColor: "#96a6af", fillOpacity: 0.04, interactive: false }).addTo(contextLayer);
      coordinates.forEach((vertex) => {
        L.circleMarker([vertex.latitude, vertex.longitude], {
          radius: 5, color: "#677985", weight: 2, fillColor: "#ffffff", fillOpacity: 1, interactive: false
        }).addTo(contextLayer);
      });
    });
  }
  if (kind !== "home") savedTripPoints().forEach(({ coordinates, label, kind: fishKind }) => {
    L.circleMarker([coordinates.latitude, coordinates.longitude], {
      radius: 6, color: "#ffffff", weight: 2,
      fillColor: fishKind === "lost" ? "#ee9b43" : fishKind === "trip" ? "#438fdb" : "#f3d35e",
      fillOpacity: 1, bubblingMouseEvents: false
    }).bindTooltip(String(html`${label}`), { sticky: true }).addTo(tripPointLayer);
  });
}

function draw() {
  if (!map || !layer || !draft) return;
  updateWaterbody();
  layer.clearLayers();
  if (kind === "home" || (kind === "spot" && !isPolygonSpot(draft))) {
    const center = [draft.coordinates.latitude, draft.coordinates.longitude];
    L.circle(center, { radius: draft.radiusMeters, color: "#188457", fillOpacity: 0.16, interactive: false }).addTo(layer);
    L.marker(center, { draggable: true })
      .on("dragend", (event) => placePin(event.target.getLatLng()))
      .addTo(layer);
  } else {
    const vertices = draft.polygon.map((vertex) => [vertex.latitude, vertex.longitude]);
    if (vertices.length >= 3) L.polygon(vertices, { color: "#2389b8", fillOpacity: 0.19 }).addTo(layer);
    else if (vertices.length >= 2) L.polyline(vertices, { color: "#2389b8" }).addTo(layer);
    draft.polygon.forEach((vertex, index) => {
      const label = `${kind === "spot" ? "Corner" : "Point"} ${index + 1}`;
      const icon = L.divIcon({
        className: "fishing-area-point-icon",
        html: html`<span class="fishing-area-point-number" aria-hidden="true">${index + 1}</span>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });
      L.marker([vertex.latitude, vertex.longitude], { icon, draggable: true, title: label, alt: label })
        .on("dragend", (event) => {
          Object.assign(vertex, snapAreaVertex(event.target.getLatLng()));
          syncSpotPolygonAnchor();
          draw();
        })
        .addTo(layer);
    });
  }
}

function ensureMap() {
  if (!L) return;
  if (!map) {
    map = L.map("fishingAreaMap", seamlessMapOptions());
    addSeamlessTileLayer(map);
    contextLayer = L.layerGroup().addTo(map);
    layer = L.featureGroup().addTo(map);
    tripPointLayer = L.layerGroup().addTo(map);
    map.on("click", (event) => {
      if (!draft) return;
      if (kind === "home" || (kind === "spot" && !isPolygonSpot(draft))) {
        placePin(event.latlng);
        return;
      }
      draft.polygon.push(snapAreaVertex(event.latlng));
      syncSpotPolygonAnchor();
      renderVertices();
      draw();
    });
    map.getContainer().addEventListener("keydown", event => {
      if (event.key !== "Enter" || event.target !== event.currentTarget || !draft || kind === "drift" || (kind === "spot" && isPolygonSpot(draft))) return;
      event.preventDefault();
      placePin(map.getCenter());
    });
  }
  requestAnimationFrame(() => {
    map.invalidateSize();
    if ((kind === "drift" || (kind === "spot" && isPolygonSpot(draft))) && draft.polygon.length) map.fitBounds(draft.polygon.map((vertex) => [vertex.latitude, vertex.longitude]), { padding: [28, 28], maxZoom: 15 });
    else if (kind === "home" || (kind === "spot" && !isPolygonSpot(draft))) map.setView([draft.coordinates.latitude, draft.coordinates.longitude], 14);
    else {
      const firstTripPoint = savedTripPoints()[0]?.coordinates;
      map.setView(firstTripPoint ? [firstTripPoint.latitude, firstTripPoint.longitude] : [43.21, -79.05], 12);
    }
    renderMapContext();
    draw();
  });
}

function newArea(type) {
  const id = createId();
  if (type === "home") {
    return { id, name: `Home ${list("home").length + 1}`, coordinates: { ...privateLocationDefaultCoordinates() }, radiusMeters: 400 };
  }
  if (type === "drift") return { id, name: "", waterbody: "", polygon: [] };
  const center = state.spots[0]?.coordinates || savedTripPoints()[0]?.coordinates || state.locations.find((item) => isUsableCoordinates(item.coordinates))?.coordinates || { latitude: 43.21, longitude: -79.05 };
  return { id, name: "", lake: "", coordinates: { ...center }, radiusMeters: 100, boundaryType: "circle", polygon: [] };
}

function openEditor(type, id = "") {
  kind = type;
  const existing = list(type).find((item) => item.id === id);
  draft = existing ? structuredClone(existing) : newArea(type);
  waterbodyEdited = Boolean(draft.lake || draft.waterbody);
  document.querySelector("#fishingAreaDialogTitle").textContent = `${existing ? "Edit" : "Add"} ${areaLists[type].title}`;
  document.querySelector("#fishingAreaMessage").textContent = "";
  document.querySelector("[data-delete-fishing-area]").classList.toggle("hidden", !existing);
  const mapHint = document.querySelector("#fishingAreaMapHint");
  mapHint.textContent = type === "drift"
    ? "Tap the map to add corners. Other drifts appear in gray; trip points are blue, catches are yellow, and missed fish are orange."
    : type === "spot"
      ? isPolygonSpot(draft)
        ? "Tap the map to add corners or drag a numbered pin. Other spot and drift boundaries appear in gray; trip points are blue, catches are yellow, and missed fish are orange."
        : "Tap the map or drag the pin. Other spot boundaries appear in gray; trip points are blue, catches are yellow, and missed fish are orange."
      : "Tap the map or drag the pin. With the map focused, pan with the arrow keys and press Enter to place the pin.";
  mapHint.hidden = !mapHint.textContent;
  renderFields();
  updateWaterbody();
  activeDialog().showModal();
  ensureMap();
  document.querySelector("#fishingAreaName")?.focus();
}

function closeEditor() {
  activeDialog()?.close();
  draft = null;
}

async function saveEditor() {
  if (!draft) return;
  const message = document.querySelector("#fishingAreaMessage");
  const name = String(draft.name || "").trim();
  if (!name) { message.textContent = "Enter a name."; return; }
  if (kind !== "home" && list(kind).some((item) => item.id !== draft.id && item.name.trim().toLowerCase() === name.toLowerCase())) { message.textContent = "That name is already used."; return; }
  if (kind !== "drift" && !isUsableCoordinates(draft.coordinates)) { message.textContent = "Choose a valid pin location on the map."; return; }
  const polygonMode = kind === "drift" || (kind === "spot" && isPolygonSpot(draft));
  if (polygonMode && !draft.polygon.every(isUsableCoordinates)) {
    message.textContent = "Choose valid points on the map.";
    return;
  }
  if (kind === "drift" && (draft.polygon.length < 3 || polygonArea(draft.polygon) < 1e-10)) { message.textContent = "Draw at least three distinct points around an area."; return; }
  if (kind === "drift" && polygonSelfIntersects(draft.polygon)) { message.textContent = "Drift corners cross each other. Adjust the corners so the area does not cross itself."; return; }
  if (kind === "drift") {
    const conflict = (state.drifts || []).find((drift) => drift.id !== draft.id && polygonsOverlap(draft.polygon, drift.polygon || []));
    if (conflict) { message.textContent = `This drift overlaps or touches “${conflict.name}”. Adjust its corners so drift areas do not overlap.`; return; }
  }
  if (kind === "spot") {
    if (isPolygonSpot(draft) && (draft.polygon.length < 3 || new Set(draft.polygon.map((vertex) => `${vertex.latitude},${vertex.longitude}`)).size !== draft.polygon.length || polygonArea(draft.polygon) < 1e-10)) { message.textContent = "Draw at least three distinct corners around the spot area."; return; }
    if (isPolygonSpot(draft) && polygonSelfIntersects(draft.polygon)) { message.textContent = "Spot corners cross each other. Adjust the corners so the area does not cross itself."; return; }
    const conflict = (state.spots || []).find((spot) => spot.id !== draft.id && spotAreasOverlap(draft, spot));
    if (conflict) { message.textContent = `This spot boundary overlaps or touches “${conflict.name}”. Adjust its corners, pin, or radius so spots do not overlap.`; return; }
  }
  const type = kind;
  const current = draft;
  const saved = { ...structuredClone(draft), name };
  if (type === "spot") {
    saved.boundaryType = isPolygonSpot(draft) ? "polygon" : "circle";
    if (isPolygonSpot(draft)) saved.polygon = structuredClone(draft.polygon);
    else delete saved.polygon;
  }
  const records = list(type);
  const values = type === "home" && records.some(item => item.id === saved.id)
    ? records.map(item => item.id === saved.id ? saved : item)
    : [...records.filter(item => item.id !== saved.id), saved];
  try {
    await areaLists[type].save(values);
    selected[type] = saved.id;
    if (draft === current) closeEditor();
    renderFishingAreas({ fitMap: type !== "home" });
    if (ui.fishMap) renderFishMap();
  } catch (error) {
    if (draft === current) message.textContent = error.message || "Could not save this area.";
  }
}

async function deleteEditor() {
  if (!draft) return;
  const type = kind;
  const current = draft;
  const count = type === "home" ? 0 : assignmentCount(type, draft.id);
  const impact = type === "home" ? "" : type === "spot"
    ? `${count ? ` ${count} assigned fish record${count === 1 ? "" : "s"} will be updated.` : ""} Catch and lost-fish records will be kept; automatic matches will be recalculated, and assignments to this deleted spot will return to automatic matching.`
    : `${count ? ` ${count} assigned fish record${count === 1 ? "" : "s"} will be updated.` : ""} Catch and lost-fish records will be kept; automatic drift matches on drifting trips will be recalculated, and assignments to this deleted drift will return to automatic matching.`;
  if (!confirm(`Delete “${draft.name}”?${impact}`)) return;
  try {
    await areaLists[type].save(list(type).filter(item => item.id !== current.id));
    selected[type] = "";
    if (draft === current) closeEditor();
    renderFishingAreas({ fitMap: type !== "home" });
    if (ui.fishMap) renderFishMap();
  } catch (error) {
    if (draft === current) document.querySelector("#fishingAreaMessage").textContent = error.message || "Could not delete this area.";
  }
}

function bind() {
  if (bound || !activeDialog()) return;
  bound = true;
  document.addEventListener("click", (event) => {
    const fitButton = event.target.closest("[data-fit-fishing-area-overview]");
    if (fitButton) {
      fitOverviewMap(fitButton.dataset.fitFishingAreaOverview);
      return;
    }
    const add = event.target.closest("[data-add-fishing-area]");
    const open = event.target.closest("[data-open-fishing-area]");
    if (add) openEditor(add.dataset.addFishingArea);
    if (open) openEditor(open.dataset.openFishingArea, open.dataset.areaId);
    if (event.target.closest("[data-close-fishing-area]")) closeEditor();
    if (event.target.closest("[data-save-fishing-area]")) void saveEditor();
    if (event.target.closest("[data-delete-fishing-area]")) void deleteEditor();
    if (event.target.closest("[data-use-starter-boundary]") && kind === "drift" && draft) {
      const starter = defaults.drifts.find(drift => drift.id === draft.id);
      draft.polygon = structuredClone(starter.polygon);
      renderVertices();
      ensureMap();
      document.querySelector("#fishingAreaMessage").textContent = "Previewing the starter outline. Save area to keep it, or cancel to keep your saved boundary.";
    }
    if (event.target.closest("[data-undo-vertex]") && draft?.polygon?.length) { draft.polygon.pop(); syncSpotPolygonAnchor(); renderVertices(); draw(); }
    const remove = event.target.closest("[data-remove-vertex]");
    if (remove && draft?.polygon) { draft.polygon.splice(Number(remove.dataset.removeVertex), 1); syncSpotPolygonAnchor(); renderVertices(); draw(); }
  });
  document.addEventListener("input", (event) => {
    if (event.target.id === "fishingSpotSearch") renderList("spot");
    if (event.target.id === "driftSearch") renderList("drift");
    if (event.target.id === "homeLocationSearch") renderList("home");
    if (!draft || !activeDialog().contains(event.target)) return;
    if (event.target.id === "fishingAreaName") draft.name = event.target.value;
    if (event.target.id === "fishingAreaWaterbody" || event.target.id === "fishingAreaSavedWaterbody") {
      const name = event.target.value;
      if (event.target.id === "fishingAreaSavedWaterbody") {
        if (!name) return;
        document.querySelector("#fishingAreaWaterbody").value = name;
      } else {
        const picker = document.querySelector("#fishingAreaSavedWaterbody");
        if (picker.value !== name) picker.value = "";
      }
      waterbodyEdited = true;
      draft[waterbodyField()] = name;
    }
    if (event.target.id === "fishingAreaBoundaryType") {
      draft.boundaryType = event.target.value;
      renderFields();
      const mapHint = document.querySelector("#fishingAreaMapHint");
      mapHint.textContent = isPolygonSpot(draft)
        ? "Tap the map to add corners or drag a numbered pin. Other spot and drift boundaries appear in gray; trip points are blue, catches are yellow, and missed fish are orange."
        : "Tap the map or drag the pin. Other spot boundaries appear in gray; trip points are blue, catches are yellow, and missed fish are orange.";
      updateWaterbody();
      draw();
      return;
    }
    if (event.target.id === "fishingAreaRadius") {
      const radius = radiusControls[kind];
      draft.radiusMeters = radius.meters(event.target.value);
      document.querySelector("#fishingAreaRadiusValue").textContent = radius.text(draft.radiusMeters);
      draw();
    }
  });
  activeDialog().addEventListener("close", () => { draft = null; });
}
