import { html, joinHtml, setHtml } from "./html.js";
import { L } from "./vendor.js";
import { state, ui } from "./app-state.js";
import { findLaunchByIdOrName, slugId } from "./app-normalization.js";
import { deleteLaunch, deleteLocation, reorderLocations, saveLocation } from "./actions.js";
import { els } from "./app-elements.js";
import { isUsableCoordinates } from "./app-media.js";
import { scheduleTripWeatherPreview } from "./location-weather.js";
import { renderFilters } from "./dashboard.js";
import { firstCatchCoordinates, fishCoordinatesFromRow, isCatchMetadataLocked } from "./photos.js";
import { refreshCatchSpotSelect, updateRowSummary } from "./trip-rows.js";
import { renderLiveTrollingSpread } from "./trolling-spread.js";
import { addSeamlessTileLayer, seamlessMapOptions } from "./maps.js";


export const LOCATION_FOCUS_ZOOM = 15;

export function coordinateText(coordinates) {
  if (!isUsableCoordinates(coordinates)) return "";
  return `${Number(coordinates.latitude).toFixed(5)}, ${Number(coordinates.longitude).toFixed(5)}`;
}

export function populateLocationSelect(selectedId = els.tripLocation?.value || "") {
  if (!els.tripLocation) return;
  const selectedLocation = state.locations.find((location) => location.id === selectedId)
    || state.locations.find((location) => location.name === selectedId);
  setHtml(els.tripLocation, html`<option value="">Select location</option>${joinHtml(state.locations.map((location) => (
    html`<option value="${location.id}" ${location.id === selectedLocation?.id ? "selected" : ""}>${location.name}</option>`
  )), "")}`);
  populateLaunchSelect(els.tripLaunch?.value || "");
  updateLocationControls();
}

export function populateLaunchSelect(selectedId = "") {
  if (!els.tripLaunch) return;
  const location = state.locations.find((item) => item.id === els.tripLocation.value);
  const selectedLaunch = findLaunchByIdOrName(location, selectedId, selectedId);
  const launches = location?.launches || [];
  setHtml(els.tripLaunch, html`<option value="">No launch / area selected</option>${joinHtml(launches.map((launch) => (
    html`<option value="${launch.id}" ${launch.id === selectedLaunch?.id ? "selected" : ""}>${launch.name}</option>`
  )), "")}`);
  updateLocationControls();
}

export function updateLocationControls() {
  const location = state.locations.find((item) => item.id === els.tripLocation?.value);
  if (els.addLaunchButton) els.addLaunchButton.disabled = !location;
  scheduleTripWeatherPreview();
}

export let draggedLocationManagerId = "";

export async function saveLocationOrderFromManager() {
  const orderedIds = [...els.locationManagerList.querySelectorAll("[data-managed-location-id]")]
    .map((card) => card.dataset.managedLocationId);
  if (!orderedIds.length) return;
  await reorderLocations(orderedIds);
  populateLocationSelect();
}

export function handleLocationManagerDragStart(event) {
  if (!event.target.closest(".location-manager-heading")) {
    event.preventDefault();
    return;
  }
  const card = event.target.closest("[data-managed-location-id]");
  if (!card || els.locationManagerSearch?.value) return;
  draggedLocationManagerId = card.dataset.managedLocationId;
  card.classList.add("is-dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", draggedLocationManagerId);
}

export function handleLocationManagerDragOver(event) {
  const card = event.target.closest("[data-managed-location-id]");
  if (!card || !draggedLocationManagerId || card.dataset.managedLocationId === draggedLocationManagerId) return;
  event.preventDefault();
  const dragged = els.locationManagerList.querySelector(`[data-managed-location-id="${CSS.escape(draggedLocationManagerId)}"]`);
  if (!dragged) return;
  const rect = card.getBoundingClientRect();
  const after = event.clientY > rect.top + rect.height / 2;
  card[after ? "after" : "before"](dragged);
}

export async function handleLocationManagerDrop(event) {
  if (!draggedLocationManagerId) return;
  event.preventDefault();
  const dragged = els.locationManagerList.querySelector(".is-dragging");
  dragged?.classList.remove("is-dragging");
  draggedLocationManagerId = "";
  await saveLocationOrderFromManager().catch((error) => {
    console.error("Could not reorder waterbodies.", error);
  });
}

export function handleLocationManagerDragEnd() {
  els.locationManagerList?.querySelector(".is-dragging")?.classList.remove("is-dragging");
  draggedLocationManagerId = "";
}

export function renderLocationManager() {
  if (!els.locationManagerList) return;
  if (!state.locations.length) {
    setHtml(els.locationManagerList, html`
      <div class="empty-state compact-empty">
        <p><strong>No waterbodies yet</strong></p>
        <p>Add one to pick it quickly when recording a trip.</p>
      </div>
    `);
    return;
  }
  const query = String(els.locationManagerSearch?.value || "").trim().toLowerCase();
  const locations = query
    ? state.locations.filter((location) => [
      location.name,
      ...(location.launches || []).map((launch) => launch.name)
    ].some((value) => String(value || "").toLowerCase().includes(query)))
    : state.locations;
  if (!locations.length) {
    setHtml(els.locationManagerList, html`<div class="empty-state compact-empty"><p>No waterbodies match that search.</p></div>`);
    return;
  }
  setHtml(els.locationManagerList, joinHtml(locations.map((location) => {
    const launches = location.launches || [];
    return html`
    <article class="location-manager-card" data-managed-location-id="${location.id}" draggable="true">
      <div class="location-manager-heading">
        <div class="location-manager-title-row">
          <div>
            <strong>${location.name}</strong>
            <span>${launches.length} ${launches.length === 1 ? "location" : "locations"}</span>
          </div>
        </div>
        <div class="location-manager-actions">
          <button class="location-manager-action" type="button" data-edit-managed-location="${location.id}">Edit</button>
        </div>
      </div>
      <div class="location-manager-content">
      ${launches.length ? html`
        <div class="location-manager-launches">
          ${joinHtml(launches.map((launch) => html`
            <div class="location-manager-launch-row">
              <span>${launch.name}</span>
              <div class="location-manager-row-actions">
                <button class="location-manager-action" type="button" data-location-id="${location.id}" data-edit-managed-launch="${launch.id}">Edit</button>
              </div>
            </div>
          `), "")}
        </div>
      ` : html`<p class="location-manager-empty">No locations yet.</p>`}
        <button class="button secondary location-manager-add-launch" type="button" data-add-managed-launch="${location.id}">Add location</button>
      </div>
    </article>
  `;
  }), ""));
}

export function locationFormCoordinates() {
  const coordinates = {
    latitude: Number(els.locationLatitude.value),
    longitude: Number(els.locationLongitude.value)
  };
  return isUsableCoordinates(coordinates) ? coordinates : null;
}

export function setLocationFormCoordinates(coordinates) {
  els.locationLatitude.value = coordinates?.latitude ?? "";
  els.locationLongitude.value = coordinates?.longitude ?? "";
  if (!window.L || !ui.locationPickerMap || !isUsableCoordinates(coordinates)) return;
  const point = [coordinates.latitude, coordinates.longitude];
  if (!ui.locationPickerMarker) {
    ui.locationPickerMarker = L.marker(point, { draggable: true }).addTo(ui.locationPickerMap);
    ui.locationPickerMarker.on("dragend", () => {
      const latLng = ui.locationPickerMarker.getLatLng();
      setLocationFormCoordinates({ latitude: latLng.lat, longitude: latLng.lng });
    });
  } else {
    ui.locationPickerMarker.setLatLng(point);
  }
  ui.locationPickerMap.setView(point, Math.max(ui.locationPickerMap.getZoom(), LOCATION_FOCUS_ZOOM));
}

export function ensureLocationPickerMap(coordinates) {
  if (!window.L || !els.locationPickerMap) return;
  if (!ui.locationPickerMap) {
    ui.locationPickerMap = L.map(els.locationPickerMap, seamlessMapOptions());
    addSeamlessTileLayer(ui.locationPickerMap);
    ui.locationPickerMap.on("click", (event) => {
      setLocationFormCoordinates({ latitude: event.latlng.lat, longitude: event.latlng.lng });
    });
  }
  const center = isUsableCoordinates(coordinates) ? [coordinates.latitude, coordinates.longitude] : [43.7, -79.4];
  ui.locationPickerMap.setView(center, isUsableCoordinates(coordinates) ? LOCATION_FOCUS_ZOOM : 7);
  setTimeout(() => ui.locationPickerMap.invalidateSize(), 50);
  if (isUsableCoordinates(coordinates)) setLocationFormCoordinates(coordinates);
  else if (ui.locationPickerMarker) {
    ui.locationPickerMarker.remove();
    ui.locationPickerMarker = null;
  }
}

export function selectedTripLocationCoordinates() {
  const location = state.locations.find((item) => item.id === els.tripLocation?.value);
  const launch = findLaunchByIdOrName(location, els.tripLaunch?.value, "");
  if (isUsableCoordinates(launch?.coordinates)) return launch.coordinates;
  if (isUsableCoordinates(location?.coordinates)) return location.coordinates;
  return null;
}

export function catchLocationFromRow(row) {
  const coordinates = {
    latitude: Number(row.querySelector(".catch-latitude")?.value),
    longitude: Number(row.querySelector(".catch-longitude")?.value),
    manual: true
  };
  return isUsableCoordinates(coordinates) ? coordinates : null;
}

export function setCatchLocationForRow(row, coordinates) {
  if (!row) return;
  const latitudeInput = row.querySelector(".catch-latitude");
  const longitudeInput = row.querySelector(".catch-longitude");
  if (isUsableCoordinates(coordinates)) {
    latitudeInput.value = coordinates.latitude;
    longitudeInput.value = coordinates.longitude;
  } else {
    latitudeInput.value = "";
    longitudeInput.value = "";
  }
  updateCatchLocationSummary(row);
  updateRowSummary(row);
  renderLiveTrollingSpread();
}

export function flashAutoFilledField(target) {
  if (!target) return;
  target.classList.remove("auto-fill-flash");
  void target.offsetWidth;
  target.classList.add("auto-fill-flash");
  setTimeout(() => target.classList.remove("auto-fill-flash"), 1400);
}

export function catchDepthFieldsFromPayload(payload = {}) {
  return {
    depth_m: payload.depth_m ?? null,
    depth_ft: payload.depth_ft ?? null,
    lake_name: payload.lake_name ?? null,
    depth_source: payload.depth_source ?? null
  };
}

export async function updateCatchFowFromLocation(row, options = {}) {
  if (!row) return;
  if (isCatchMetadataLocked(row, "fow") && !options.ignoreMetadataLock) return;
  const coordinates = fishCoordinatesFromRow(row);
  return updateCatchFowForCoordinates(row, coordinates, options);
}

export async function updateCatchFowForCoordinates(row, coordinates, options = {}) {
  if (!row) return;
  if (isCatchMetadataLocked(row, "fow") && !options.ignoreMetadataLock) return;
  if (!isUsableCoordinates(coordinates)) {
    row.catchDepthData = null;
    return;
  }
  const fowInput = row.querySelector(".catch-fow-field:not(.hidden) .catch-fow")
    || row.querySelector(".catch-water-depth-field:not(.hidden) .catch-water-depth");

  const lookupKey = `${Number(coordinates.latitude).toFixed(5)},${Number(coordinates.longitude).toFixed(5)}`;
  row.dataset.depthLookupKey = lookupKey;
  if (fowInput) {
    fowInput.value = "Looking up...";
    fowInput.readOnly = true;
    fowInput.setAttribute("aria-readonly", "true");
    updateRowSummary(row);
    renderLiveTrollingSpread();
  }
  try {
    const params = new URLSearchParams({
      latitude: coordinates.latitude,
      longitude: coordinates.longitude
    });
    const response = await fetch(`/api/bathymetry/depth?${params}`);
    if (!response.ok) {
      if (row.dataset.depthLookupKey === lookupKey && fowInput?.value === "Looking up...") fowInput.value = "";
      return;
    }
    const payload = await response.json();
    if (row.dataset.depthLookupKey !== lookupKey) return;
    row.catchDepthData = catchDepthFieldsFromPayload(payload);
    if (fowInput) {
      const nextFow = payload.fowCaught || "";
      fowInput.value = payload.fowCaught || "";
      if (nextFow) flashAutoFilledField(fowInput);
      updateRowSummary(row);
      renderLiveTrollingSpread();
    }
  } catch (error) {
    console.error("Could not auto-fill catch FOW.", error);
    if (row.dataset.depthLookupKey === lookupKey && fowInput?.value === "Looking up...") fowInput.value = "";
  } finally {
    if (row.dataset.depthLookupKey === lookupKey && fowInput) {
      fowInput.readOnly = false;
      fowInput.removeAttribute("aria-readonly");
    }
  }
}

export function updateCatchLocationSummary(row) {
  const summary = row?.querySelector(".catch-location-summary");
  const button = row?.querySelector(".pick-catch-location");
  const coordinates = fishCoordinatesFromRow(row);
  if (button) button.textContent = coordinates ? "Selected Location" : "Select Location";
  if (summary) summary.textContent = "";
  if (typeof refreshCatchSpotSelect === "function") refreshCatchSpotSelect(row);
}

export function setCatchLocationPickerCoordinates(coordinates) {
  if (!window.L || !ui.catchLocationPickerMap || !isUsableCoordinates(coordinates)) return;
  const point = [coordinates.latitude, coordinates.longitude];
  if (!ui.catchLocationPickerMarker) {
    ui.catchLocationPickerMarker = L.marker(point, { draggable: true }).addTo(ui.catchLocationPickerMap);
    ui.catchLocationPickerMarker.on("dragend", () => {
      const latLng = ui.catchLocationPickerMarker.getLatLng();
      setCatchLocationPickerCoordinates({ latitude: latLng.lat, longitude: latLng.lng });
    });
  } else {
    ui.catchLocationPickerMarker.setLatLng(point);
  }
  ui.catchLocationPickerMap.setView(point, Math.max(ui.catchLocationPickerMap.getZoom(), LOCATION_FOCUS_ZOOM));
}

export function ensureCatchLocationPickerMap(coordinates, options = {}) {
  if (!window.L || !els.catchLocationPickerMap) return;
  const placeMarker = options.placeMarker !== false;
  if (!ui.catchLocationPickerMap) {
    ui.catchLocationPickerMap = L.map(els.catchLocationPickerMap, seamlessMapOptions());
    addSeamlessTileLayer(ui.catchLocationPickerMap);
    ui.catchLocationPickerMap.on("click", (event) => {
      setCatchLocationPickerCoordinates({ latitude: event.latlng.lat, longitude: event.latlng.lng });
    });
  }
  const center = isUsableCoordinates(coordinates) ? [coordinates.latitude, coordinates.longitude] : [43.7, -79.4];
  ui.catchLocationPickerMap.setView(center, isUsableCoordinates(coordinates) ? LOCATION_FOCUS_ZOOM : 7);
  setTimeout(() => ui.catchLocationPickerMap.invalidateSize(), 50);
  if (isUsableCoordinates(coordinates) && placeMarker) setCatchLocationPickerCoordinates(coordinates);
  else if (ui.catchLocationPickerMarker) {
    ui.catchLocationPickerMarker.remove();
    ui.catchLocationPickerMarker = null;
  }
}

export function openCatchLocationDialog(row) {
  ui.activeCatchLocationRow = row;
  const existingCatchCoordinates = catchLocationFromRow(row);
  const center = existingCatchCoordinates || firstCatchCoordinates(row) || selectedTripLocationCoordinates();
  els.catchLocationDialog.showModal();
  ensureCatchLocationPickerMap(center, { placeMarker: isUsableCoordinates(existingCatchCoordinates || firstCatchCoordinates(row)) });
}

export function saveCatchLocationFromPicker() {
  if (!ui.activeCatchLocationRow || !ui.catchLocationPickerMarker) {
    alert("Pick a spot on the map first.");
    return;
  }
  const latLng = ui.catchLocationPickerMarker.getLatLng();
  const coordinates = { latitude: latLng.lat, longitude: latLng.lng, manual: true };
  setCatchLocationForRow(ui.activeCatchLocationRow, coordinates);
  updateCatchFowForCoordinates(ui.activeCatchLocationRow, coordinates, { force: true });
  ui.activeCatchLocationRow = null;
  els.catchLocationDialog.close();
}

export function clearActiveCatchLocation() {
  if (ui.activeCatchLocationRow) setCatchLocationForRow(ui.activeCatchLocationRow, null);
  ui.activeCatchLocationRow = null;
  els.catchLocationDialog.close();
}

export function openLocationDialog(mode = "location", locationId = "", launchId = "") {
  ui.activeLocationPickerMode = mode;
  ui.activeLocationPickerLocationId = locationId || els.tripLocation.value || "";
  ui.activeLocationPickerLaunchId = launchId || els.tripLaunch.value || "";
  const location = state.locations.find((item) => item.id === ui.activeLocationPickerLocationId);
  const launch = findLaunchByIdOrName(location, ui.activeLocationPickerLaunchId, "");
  const editingLaunch = mode === "launch";
  els.locationDialogTitle.textContent = editingLaunch ? (launch ? "Edit Launch / Area Fished" : "Add Launch / Area Fished") : (location ? "Edit Location" : "Add Location");
  els.locationParentRow.classList.toggle("hidden", !editingLaunch);
  els.locationParentName.value = location?.name || "";
  document.querySelector("#locationPickerInstruction").textContent = editingLaunch
    ? "Press the launch or area fished on the map to place the pin."
    : "Press the waterbody location on the map to place the pin.";
  els.locationName.placeholder = editingLaunch ? "North Shore Marina or Offshore Shelf" : "Lake Ontario";
  els.locationName.value = editingLaunch ? (launch?.name || "") : (location?.name || "");
  const isEditingExisting = editingLaunch ? Boolean(launch) : Boolean(location);
  if (els.deleteLocationDialogButton) {
    els.deleteLocationDialogButton.classList.toggle("hidden", !isEditingExisting);
    els.deleteLocationDialogButton.textContent = editingLaunch ? "Delete Launch" : "Delete Waterbody";
  }
  const coordinates = editingLaunch ? launch?.coordinates : location?.coordinates;
  els.locationLatitude.value = coordinates?.latitude ?? "";
  els.locationLongitude.value = coordinates?.longitude ?? "";
  els.locationDialog.showModal();
  ensureLocationPickerMap(coordinates);
}

export async function saveLocationPin(event) {
  event.preventDefault();
  const name = els.locationName.value.trim();
  const coordinates = locationFormCoordinates();
  if (!name || !coordinates) {
    alert("Add a name and drop a valid map pin.");
    return;
  }

  if (ui.activeLocationPickerMode === "launch") {
    const location = state.locations.find((item) => item.id === ui.activeLocationPickerLocationId);
    if (!location) return;
    const existing = findLaunchByIdOrName(location, ui.activeLocationPickerLaunchId, name);
    const launch = {
      id: existing?.id || slugId(`${location.id}-launch`, name),
      name,
      coordinates
    };
    try {
      await saveLocation(location, { mode: "launch", launch: { existingId: existing?.id || "", record: launch } });
      populateLocationSelect(location.id);
      populateLaunchSelect(launch.id);
      renderLocationManager();
      els.locationDialog.close();
      renderFilters();
    } catch (error) {
      console.error("Could not save location pin.", error);
    }
  } else {
    const existing = state.locations.find((item) => item.id === ui.activeLocationPickerLocationId)
      || state.locations.find((item) => item.name.toLowerCase() === name.toLowerCase());
    const location = {
      id: existing?.id || slugId("loc", name),
      name,
      coordinates,
      launches: existing?.launches || []
    };
    try {
      await saveLocation(location);
      populateLocationSelect(location.id);
      renderLocationManager();
      els.locationDialog.close();
      renderFilters();
    } catch (error) {
      console.error("Could not save location pin.", error);
    }
  }
  scheduleTripWeatherPreview(true);
}

export function tripUsesLocation(trip, location) {
  return trip.locationId === location.id
    || String(trip.location || "").trim().toLowerCase() === location.name.toLowerCase();
}

export function tripUsesLaunch(trip, location, launch) {
  if (!tripUsesLocation(trip, location)) return false;
  return trip.launchId === launch.id
    || String(trip.launch || "").trim().toLowerCase() === launch.name.toLowerCase();
}

export async function deleteManagedLocation(locationId) {
  const location = state.locations.find((item) => item.id === locationId);
  if (!location) return false;
  const usedTrips = state.trips.filter((trip) => tripUsesLocation(trip, location));
  if (usedTrips.length) {
    alert(`This waterbody is used by ${usedTrips.length} saved trip${usedTrips.length === 1 ? "" : "s"}. Edit those trips before deleting it.`);
    return false;
  }
  if (!confirm(`Delete ${location.name}?`)) return false;
  await deleteLocation(location.id);
  populateLocationSelect();
  renderLocationManager();
  renderFilters();
  return true;
}

export async function deleteManagedLaunch(locationId, launchId) {
  const location = state.locations.find((item) => item.id === locationId);
  const launch = findLaunchByIdOrName(location, launchId, "");
  if (!location || !launch) return false;
  const usedTrips = state.trips.filter((trip) => tripUsesLaunch(trip, location, launch));
  if (usedTrips.length) {
    alert(`This launch / area fished is used by ${usedTrips.length} saved trip${usedTrips.length === 1 ? "" : "s"}. Edit those trips before deleting it.`);
    return false;
  }
  if (!confirm(`Delete ${launch.name}?`)) return false;
  await deleteLaunch(location.id, launch.id);
  populateLocationSelect(location.id);
  populateLaunchSelect();
  renderLocationManager();
  renderFilters();
  return true;
}

export async function deleteActiveLocationFromDialog() {
  const deleted = ui.activeLocationPickerMode === "launch"
    ? await deleteManagedLaunch(ui.activeLocationPickerLocationId, ui.activeLocationPickerLaunchId)
    : await deleteManagedLocation(ui.activeLocationPickerLocationId);
  if (deleted) els.locationDialog.close();
}
