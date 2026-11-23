import { L } from "./vendor.js";
import { state, ui } from "./app-state.js";
import { html, joinHtml, setHtml } from "./html.js";
import { createId } from "./app-defaults.js";
import { replaceDrifts, replaceFishingSpots } from "./actions.js";
import { isUsableCoordinates } from "./app-media.js";
import { polygonArea } from "./drifts.js";
import { addSeamlessTileLayer, renderFishMap, seamlessMapOptions } from "./maps.js";
import { fishingSpotRadiusDisplayValue, fishingSpotRadiusMeters, fishingSpotRadiusSliderConfig, fishingSpotRadiusText } from "./settings-locations.js";

let bound = false;
let draft = null;
let kind = "spot";
let map = null;
let layer = null;
const selected = { spot: "", drift: "" };

const list = (type) => type === "spot" ? state.spots : state.drifts;
const point = (latlng) => ({ latitude: latlng.lat, longitude: latlng.lng });
const coordinate = (value) => Number.isFinite(Number(value)) && value !== "" ? Number(value) : null;
const activeDialog = () => document.querySelector("#fishingAreaDialog");

function assignmentCount(type, id) {
  return state.trips.reduce((count, trip) => count + [...(trip.catches || []), ...(trip.lostFish || [])]
    .filter((fish) => (type === "spot" ? fish.spotId : fish.driftId) === id).length, 0);
}

function renderList(type) {
  const host = document.querySelector(type === "spot" ? "#areaSpotList" : "#areaDriftList");
  if (!host) return;
  const search = String(document.querySelector(type === "spot" ? "#fishingSpotSearch" : "#driftSearch")?.value || "").trim().toLowerCase();
  const records = [...list(type)].sort((a, b) => (a.id === selected[type] ? -1 : b.id === selected[type] ? 1 : a.name.localeCompare(b.name)))
    .filter((item) => `${item.name} ${item.lake || item.waterbody || ""}`.toLowerCase().includes(search));
  setHtml(host, records.length ? joinHtml(records.map((item) => html`
    <button type="button" class="fishing-area-row${item.id === selected[type] ? " is-selected" : ""}" data-open-fishing-area="${type}" data-area-id="${item.id}">
      <span class="fishing-area-row-name">${item.name}</span>
      <span class="fishing-area-row-meta">${item.lake || item.waterbody || ""}${type === "spot" ? ` · ${fishingSpotRadiusText(item.radiusMeters)}` : ""} · ${assignmentCount(type, item.id)} assigned</span>
      <span class="fishing-area-row-edit">Edit</span>
    </button>
  `), "") : html`<p class="fishing-area-empty">${search ? "No matching areas." : `No ${type === "spot" ? "spots" : "drifts"} saved.`}</p>`);
}

export function renderFishingAreas() {
  bind();
  renderList("spot");
  renderList("drift");
}

function renderVertices() {
  const host = document.querySelector("#fishingAreaVertices");
  if (!host || !draft) return;
  setHtml(host, joinHtml(draft.polygon.map((vertex, index) => html`
    <div class="fishing-area-vertex" data-vertex-index="${index}">
      <span>${index + 1}</span>
      <input type="number" step="any" min="-90" max="90" aria-label="Vertex ${index + 1} latitude" data-vertex-lat="${index}" value="${vertex.latitude}" />
      <input type="number" step="any" min="-180" max="180" aria-label="Vertex ${index + 1} longitude" data-vertex-lng="${index}" value="${vertex.longitude}" />
      <button type="button" class="button secondary" data-remove-vertex="${index}" aria-label="Remove vertex ${index + 1}">Remove</button>
    </div>
  `), ""));
}

function renderFields() {
  const host = document.querySelector("#fishingAreaFields");
  if (!host || !draft) return;
  const radius = fishingSpotRadiusSliderConfig();
  setHtml(host, html`
    <label><span>Name</span><input id="fishingAreaName" type="text" value="${draft.name}" required /></label>
    <label><span>Waterbody</span><input id="fishingAreaWaterbody" type="text" value="${draft.lake || draft.waterbody || ""}" placeholder="Niagara River" /></label>
    ${kind === "spot" ? html`
      <label><span>Radius <output id="fishingAreaRadiusValue">${fishingSpotRadiusText(draft.radiusMeters)}</output></span><input id="fishingAreaRadius" type="range" min="${radius.min}" max="${radius.max}" step="${radius.step}" value="${fishingSpotRadiusDisplayValue(draft.radiusMeters)}" /></label>
      <div class="fishing-area-coordinate-row"><label><span>Latitude</span><input id="fishingAreaLatitude" type="number" min="-90" max="90" step="any" value="${draft.coordinates.latitude}" /></label><label><span>Longitude</span><input id="fishingAreaLongitude" type="number" min="-180" max="180" step="any" value="${draft.coordinates.longitude}" /></label></div>
    ` : html`
      <p class="fishing-area-hint">Tap the map to add vertices. Drag a vertex to adjust it. At least three points are required.</p>
      <div id="fishingAreaVertices" class="fishing-area-vertices"></div>
      <div class="fishing-area-vertex-actions"><button type="button" class="button secondary" data-undo-vertex>Undo last point</button><button type="button" class="button secondary" data-add-vertex>Add point at map center</button></div>
    `}
  `);
  if (kind === "drift") renderVertices();
}

function draw() {
  if (!map || !layer || !draft) return;
  layer.clearLayers();
  if (kind === "spot") {
    const center = [draft.coordinates.latitude, draft.coordinates.longitude];
    L.circle(center, { radius: draft.radiusMeters, color: "#188457", fillOpacity: 0.16, interactive: false }).addTo(layer);
    L.marker(center, { draggable: true }).on("dragend", (event) => {
      draft.coordinates = point(event.target.getLatLng());
      document.querySelector("#fishingAreaLatitude").value = draft.coordinates.latitude;
      document.querySelector("#fishingAreaLongitude").value = draft.coordinates.longitude;
      draw();
    }).addTo(layer);
  } else {
    const vertices = draft.polygon.map((vertex) => [vertex.latitude, vertex.longitude]);
    if (vertices.length >= 3) L.polygon(vertices, { color: "#2389b8", fillOpacity: 0.19 }).addTo(layer);
    else if (vertices.length >= 2) L.polyline(vertices, { color: "#2389b8" }).addTo(layer);
    draft.polygon.forEach((vertex, index) => L.marker([vertex.latitude, vertex.longitude], { draggable: true })
      .on("dragend", (event) => { draft.polygon[index] = point(event.target.getLatLng()); renderVertices(); draw(); }).addTo(layer));
  }
}

function ensureMap() {
  if (!L) return;
  if (!map) {
    map = L.map("fishingAreaMap", seamlessMapOptions());
    addSeamlessTileLayer(map);
    layer = L.featureGroup().addTo(map);
    map.on("click", (event) => {
      if (!draft) return;
      if (kind === "spot") {
        draft.coordinates = point(event.latlng);
        document.querySelector("#fishingAreaLatitude").value = draft.coordinates.latitude;
        document.querySelector("#fishingAreaLongitude").value = draft.coordinates.longitude;
      } else {
        draft.polygon.push(point(event.latlng));
        renderVertices();
      }
      draw();
    });
  }
  requestAnimationFrame(() => {
    map.invalidateSize();
    if (kind === "drift" && draft.polygon.length) map.fitBounds(draft.polygon.map((vertex) => [vertex.latitude, vertex.longitude]), { padding: [28, 28], maxZoom: 15 });
    else if (kind === "spot") map.setView([draft.coordinates.latitude, draft.coordinates.longitude], 14);
    else map.setView([43.21, -79.05], 12);
    draw();
  });
}

function openEditor(type, id = "") {
  kind = type;
  const existing = list(type).find((item) => item.id === id);
  const center = state.spots[0]?.coordinates || state.locations.find((item) => isUsableCoordinates(item.coordinates))?.coordinates || { latitude: 43.21, longitude: -79.05 };
  draft = existing ? structuredClone(existing) : type === "spot"
    ? { id: createId(), name: "", lake: "", coordinates: { ...center }, radiusMeters: 100 }
    : { id: createId(), name: "", waterbody: "", polygon: [] };
  document.querySelector("#fishingAreaDialogTitle").textContent = `${existing ? "Edit" : "Add"} ${type === "spot" ? "Spot" : "Drift"}`;
  document.querySelector("#fishingAreaMessage").textContent = "";
  document.querySelector("[data-delete-fishing-area]").classList.toggle("hidden", !existing);
  document.querySelector("#fishingAreaMapHint").textContent = type === "spot" ? "Tap the map or drag the pin to place this spot." : "Areas are approximate and are not for navigation.";
  renderFields();
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
  const numericInputs = kind === "spot"
    ? [document.querySelector("#fishingAreaLatitude"), document.querySelector("#fishingAreaLongitude")]
    : [...activeDialog().querySelectorAll("[data-vertex-lat], [data-vertex-lng]")];
  if (numericInputs.some((input) => !input?.value.trim() || !input.checkValidity())) {
    message.textContent = "Enter valid coordinates for every point.";
    return;
  }
  const name = String(draft.name || "").trim();
  if (!name) { message.textContent = "Enter a name."; return; }
  if (list(kind).some((item) => item.id !== draft.id && item.name.trim().toLowerCase() === name.toLowerCase())) { message.textContent = "That name is already used."; return; }
  if (kind === "spot" && !isUsableCoordinates(draft.coordinates)) { message.textContent = "Choose valid coordinates."; return; }
  if (kind === "drift" && (draft.polygon.length < 3 || polygonArea(draft.polygon) < 1e-10)) { message.textContent = "Draw at least three distinct points around an area."; return; }
  draft.name = name;
  const values = [...list(kind).filter((item) => item.id !== draft.id), draft];
  try {
    if (kind === "spot") await replaceFishingSpots(values);
    else await replaceDrifts(values);
    selected[kind] = draft.id;
    closeEditor();
    renderFishingAreas();
    if (ui.fishMap) renderFishMap();
  } catch (error) { message.textContent = error.message || "Could not save this area."; }
}

async function deleteEditor() {
  if (!draft) return;
  const count = assignmentCount(kind, draft.id);
  if (!confirm(`Delete “${draft.name}”?${count ? ` ${count} assigned fish will be updated.` : ""}`)) return;
  try {
    const values = list(kind).filter((item) => item.id !== draft.id);
    if (kind === "spot") await replaceFishingSpots(values);
    else await replaceDrifts(values);
    selected[kind] = "";
    closeEditor();
    renderFishingAreas();
    if (ui.fishMap) renderFishMap();
  } catch (error) { document.querySelector("#fishingAreaMessage").textContent = error.message || "Could not delete this area."; }
}

function bind() {
  if (bound || !activeDialog()) return;
  bound = true;
  document.addEventListener("click", (event) => {
    const add = event.target.closest("[data-add-fishing-area]");
    const open = event.target.closest("[data-open-fishing-area]");
    if (add) openEditor(add.dataset.addFishingArea);
    if (open) openEditor(open.dataset.openFishingArea, open.dataset.areaId);
    if (event.target.closest("[data-close-fishing-area]")) closeEditor();
    if (event.target.closest("[data-save-fishing-area]")) void saveEditor();
    if (event.target.closest("[data-delete-fishing-area]")) void deleteEditor();
    if (event.target.closest("[data-undo-vertex]") && draft?.polygon?.length) { draft.polygon.pop(); renderVertices(); draw(); }
    if (event.target.closest("[data-add-vertex]") && draft?.polygon) { draft.polygon.push(point(map.getCenter())); renderVertices(); draw(); }
    const remove = event.target.closest("[data-remove-vertex]");
    if (remove && draft?.polygon) { draft.polygon.splice(Number(remove.dataset.removeVertex), 1); renderVertices(); draw(); }
  });
  document.addEventListener("input", (event) => {
    if (event.target.id === "fishingSpotSearch") renderList("spot");
    if (event.target.id === "driftSearch") renderList("drift");
    if (!draft || !activeDialog().contains(event.target)) return;
    if (event.target.id === "fishingAreaName") draft.name = event.target.value;
    if (event.target.id === "fishingAreaWaterbody") draft[kind === "spot" ? "lake" : "waterbody"] = event.target.value;
    if (event.target.id === "fishingAreaRadius") { draft.radiusMeters = fishingSpotRadiusMeters(event.target.value); document.querySelector("#fishingAreaRadiusValue").textContent = fishingSpotRadiusText(draft.radiusMeters); draw(); }
    if (event.target.id === "fishingAreaLatitude" || event.target.id === "fishingAreaLongitude") {
      const latitude = coordinate(document.querySelector("#fishingAreaLatitude").value), longitude = coordinate(document.querySelector("#fishingAreaLongitude").value);
      if (latitude !== null && longitude !== null && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180) { draft.coordinates = { latitude, longitude }; draw(); }
    }
    const lat = event.target.dataset.vertexLat, lng = event.target.dataset.vertexLng;
    if (lat !== undefined || lng !== undefined) {
      const index = Number(lat ?? lng), value = coordinate(event.target.value);
      if (value !== null) { draft.polygon[index][lat !== undefined ? "latitude" : "longitude"] = value; draw(); }
    }
  });
  activeDialog().addEventListener("close", () => { draft = null; });
}
