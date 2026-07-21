function coordinateText(coordinates) {
  if (!isUsableCoordinates(coordinates)) return "";
  return `${Number(coordinates.latitude).toFixed(5)}, ${Number(coordinates.longitude).toFixed(5)}`;
}

function populateLocationSelect(selectedId = els.tripLocation?.value || "") {
  if (!els.tripLocation) return;
  const selectedLocation = state.locations.find((location) => location.id === selectedId)
    || state.locations.find((location) => location.name === selectedId);
  els.tripLocation.innerHTML = `<option value="">Select location</option>` + state.locations.map((location) => (
    `<option value="${escapeHtml(location.id)}" ${location.id === selectedLocation?.id ? "selected" : ""}>${escapeHtml(location.name)}</option>`
  )).join("");
  populateLaunchSelect(els.tripLaunch?.value || "");
  updateLocationControls();
}

function populateLaunchSelect(selectedId = "") {
  if (!els.tripLaunch) return;
  const location = state.locations.find((item) => item.id === els.tripLocation.value);
  const selectedLaunch = findLaunchByIdOrName(location, selectedId, selectedId);
  const launches = location?.launches || [];
  els.tripLaunch.innerHTML = `<option value="">No launch / area selected</option>` + launches.map((launch) => (
    `<option value="${escapeHtml(launch.id)}" ${launch.id === selectedLaunch?.id ? "selected" : ""}>${escapeHtml(launch.name)}</option>`
  )).join("");
  updateLocationControls();
}

function updateLocationControls() {
  const location = state.locations.find((item) => item.id === els.tripLocation?.value);
  if (els.addLaunchButton) els.addLaunchButton.disabled = !location;
  scheduleTripWeatherPreview();
}

let draggedLocationManagerId = "";

async function saveLocationOrderFromManager() {
  const orderedIds = [...els.locationManagerList.querySelectorAll("[data-managed-location-id]")]
    .map((card) => card.dataset.managedLocationId);
  if (!orderedIds.length) return;
  const order = new Map(orderedIds.map((id, index) => [id, index]));
  state.locations = [...state.locations].sort((a, b) => {
    const aOrder = order.has(a.id) ? order.get(a.id) : Number.MAX_SAFE_INTEGER;
    const bOrder = order.has(b.id) ? order.get(b.id) : Number.MAX_SAFE_INTEGER;
    return aOrder - bOrder;
  });
  populateLocationSelect();
  await saveState();
}

function handleLocationManagerDragStart(event) {
  if (!event.target.closest(".location-manager-drag-handle")) {
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

function handleLocationManagerDragOver(event) {
  const card = event.target.closest("[data-managed-location-id]");
  if (!card || !draggedLocationManagerId || card.dataset.managedLocationId === draggedLocationManagerId) return;
  event.preventDefault();
  const dragged = els.locationManagerList.querySelector(`[data-managed-location-id="${CSS.escape(draggedLocationManagerId)}"]`);
  if (!dragged) return;
  const rect = card.getBoundingClientRect();
  const after = event.clientY > rect.top + rect.height / 2;
  card[after ? "after" : "before"](dragged);
}

async function handleLocationManagerDrop(event) {
  if (!draggedLocationManagerId) return;
  event.preventDefault();
  const dragged = els.locationManagerList.querySelector(".is-dragging");
  dragged?.classList.remove("is-dragging");
  draggedLocationManagerId = "";
  await saveLocationOrderFromManager().catch((error) => {
    console.error("Could not reorder waterbodies.", error);
  });
}

function handleLocationManagerDragEnd() {
  els.locationManagerList?.querySelector(".is-dragging")?.classList.remove("is-dragging");
  draggedLocationManagerId = "";
}

function renderLocationManager() {
  if (!els.locationManagerList) return;
  if (!state.locations.length) {
    els.locationManagerList.innerHTML = `
      <div class="empty-state compact-empty">
        <p><strong>No waterbodies yet</strong></p>
        <p>Save your favorite lakes and fishing spots for quick trip creation.</p>
      </div>
    `;
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
    els.locationManagerList.innerHTML = `<div class="empty-state compact-empty"><p>No waterbodies match that search.</p></div>`;
    return;
  }
  els.locationManagerList.innerHTML = locations.map((location) => {
    const launches = location.launches || [];
    return `
    <details class="location-manager-card" data-managed-location-id="${escapeHtml(location.id)}" draggable="true" open>
      <summary class="location-manager-heading">
        <div class="location-manager-title-row">
          <span class="location-manager-drag-handle" aria-hidden="true">☰</span>
          <div>
            <strong>${escapeHtml(location.name)}</strong>
            <span>${launches.length} saved ${launches.length === 1 ? "location" : "locations"}</span>
          </div>
        </div>
        <details class="overflow-menu location-manager-menu">
          <summary aria-label="${escapeHtml(`Actions for ${location.name}`)}">⋮</summary>
          <div>
            <button type="button" data-edit-managed-location="${escapeHtml(location.id)}">Rename</button>
            <button type="button" data-edit-managed-location="${escapeHtml(location.id)}">Edit Pins</button>
            <button type="button" data-delete-managed-location="${escapeHtml(location.id)}">Delete</button>
          </div>
        </details>
      </summary>
      ${launches.length ? `
        <div class="location-manager-launches">
          ${launches.map((launch) => `
            <div class="location-manager-launch-row">
              <span><i aria-hidden="true">•</i>${escapeHtml(launch.name)}</span>
              <details class="overflow-menu location-manager-menu">
                <summary aria-label="${escapeHtml(`Actions for ${launch.name}`)}">⋮</summary>
                <div>
                  <button type="button" data-location-id="${escapeHtml(location.id)}" data-edit-managed-launch="${escapeHtml(launch.id)}">Rename</button>
                  <button type="button" data-location-id="${escapeHtml(location.id)}" data-edit-managed-launch="${escapeHtml(launch.id)}">Edit Pin</button>
                  <button type="button" data-location-id="${escapeHtml(location.id)}" data-delete-managed-launch="${escapeHtml(launch.id)}">Delete</button>
                </div>
              </details>
            </div>
          `).join("")}
        </div>
      ` : `<div class="location-manager-launches empty-launch-list"><span>No saved locations yet.</span></div>`}
      <button class="button secondary location-manager-add-launch" type="button" data-add-managed-launch="${escapeHtml(location.id)}">+ Add Location</button>
    </details>
  `;
  }).join("");
}

function locationFormCoordinates() {
  const coordinates = {
    latitude: Number(els.locationLatitude.value),
    longitude: Number(els.locationLongitude.value)
  };
  return isUsableCoordinates(coordinates) ? coordinates : null;
}

function setLocationFormCoordinates(coordinates) {
  els.locationLatitude.value = coordinates?.latitude ?? "";
  els.locationLongitude.value = coordinates?.longitude ?? "";
  if (!window.L || !locationPickerMap || !isUsableCoordinates(coordinates)) return;
  const point = [coordinates.latitude, coordinates.longitude];
  if (!locationPickerMarker) {
    locationPickerMarker = L.marker(point, { draggable: true }).addTo(locationPickerMap);
    locationPickerMarker.on("dragend", () => {
      const latLng = locationPickerMarker.getLatLng();
      setLocationFormCoordinates({ latitude: latLng.lat, longitude: latLng.lng });
    });
  } else {
    locationPickerMarker.setLatLng(point);
  }
  locationPickerMap.setView(point, Math.max(locationPickerMap.getZoom(), 10));
}

function ensureLocationPickerMap(coordinates) {
  if (!window.L || !els.locationPickerMap) return;
  if (!locationPickerMap) {
    locationPickerMap = L.map(els.locationPickerMap, seamlessMapOptions());
    addSeamlessTileLayer(locationPickerMap);
    locationPickerMap.on("click", (event) => {
      setLocationFormCoordinates({ latitude: event.latlng.lat, longitude: event.latlng.lng });
    });
  }
  const center = isUsableCoordinates(coordinates) ? [coordinates.latitude, coordinates.longitude] : [43.7, -79.4];
  locationPickerMap.setView(center, isUsableCoordinates(coordinates) ? 10 : 7);
  setTimeout(() => locationPickerMap.invalidateSize(), 50);
  if (isUsableCoordinates(coordinates)) setLocationFormCoordinates(coordinates);
  else if (locationPickerMarker) {
    locationPickerMarker.remove();
    locationPickerMarker = null;
  }
}

function selectedTripLocationCoordinates() {
  const location = state.locations.find((item) => item.id === els.tripLocation?.value);
  const launch = findLaunchByIdOrName(location, els.tripLaunch?.value, "");
  if (isUsableCoordinates(launch?.coordinates)) return launch.coordinates;
  if (isUsableCoordinates(location?.coordinates)) return location.coordinates;
  return null;
}

function catchLocationFromRow(row) {
  const coordinates = {
    latitude: Number(row.querySelector(".catch-latitude")?.value),
    longitude: Number(row.querySelector(".catch-longitude")?.value),
    manual: true
  };
  return isUsableCoordinates(coordinates) ? coordinates : null;
}

function setCatchLocationForRow(row, coordinates) {
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

function catchDepthFieldsFromPayload(payload = {}) {
  return {
    depth_m: payload.depth_m ?? null,
    depth_ft: payload.depth_ft ?? null,
    lake_name: payload.lake_name ?? null,
    depth_source: payload.depth_source ?? null
  };
}

async function updateCatchFowFromLocation(row) {
  if (!row || row.classList.contains("lost-fish-row")) return;
  const coordinates = fishCoordinatesFromRow(row);
  updateCatchFowForCoordinates(row, coordinates);
}

async function updateCatchFowForCoordinates(row, coordinates, options = {}) {
  if (!row || row.classList.contains("lost-fish-row")) return;
  if (!isUsableCoordinates(coordinates)) {
    row.catchDepthData = null;
    return;
  }
  const fowInput = row.querySelector(".catch-fow");
  if (fowInput?.value.trim() && !options.force) return;

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
    if (fowInput && fowInput.value.trim() && fowInput.value !== "Looking up..." && !options.force) return;
    row.catchDepthData = catchDepthFieldsFromPayload(payload);
    if (fowInput) {
      fowInput.value = payload.fowCaught || "";
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

function updateCatchLocationSummary(row) {
  const summary = row?.querySelector(".catch-location-summary");
  const button = row?.querySelector(".pick-catch-location");
  const coordinates = fishCoordinatesFromRow(row);
  if (button) button.textContent = coordinates ? "Selected Location" : "Select Location";
  if (summary) summary.textContent = "";
}

function setCatchLocationPickerCoordinates(coordinates) {
  if (!window.L || !catchLocationPickerMap || !isUsableCoordinates(coordinates)) return;
  const point = [coordinates.latitude, coordinates.longitude];
  if (!catchLocationPickerMarker) {
    catchLocationPickerMarker = L.marker(point, { draggable: true }).addTo(catchLocationPickerMap);
    catchLocationPickerMarker.on("dragend", () => {
      const latLng = catchLocationPickerMarker.getLatLng();
      setCatchLocationPickerCoordinates({ latitude: latLng.lat, longitude: latLng.lng });
    });
  } else {
    catchLocationPickerMarker.setLatLng(point);
  }
  catchLocationPickerMap.setView(point, Math.max(catchLocationPickerMap.getZoom(), 10));
}

function ensureCatchLocationPickerMap(coordinates, options = {}) {
  if (!window.L || !els.catchLocationPickerMap) return;
  const placeMarker = options.placeMarker !== false;
  if (!catchLocationPickerMap) {
    catchLocationPickerMap = L.map(els.catchLocationPickerMap, seamlessMapOptions());
    addSeamlessTileLayer(catchLocationPickerMap);
    catchLocationPickerMap.on("click", (event) => {
      setCatchLocationPickerCoordinates({ latitude: event.latlng.lat, longitude: event.latlng.lng });
    });
  }
  const center = isUsableCoordinates(coordinates) ? [coordinates.latitude, coordinates.longitude] : [43.7, -79.4];
  catchLocationPickerMap.setView(center, isUsableCoordinates(coordinates) ? 10 : 7);
  setTimeout(() => catchLocationPickerMap.invalidateSize(), 50);
  if (isUsableCoordinates(coordinates) && placeMarker) setCatchLocationPickerCoordinates(coordinates);
  else if (catchLocationPickerMarker) {
    catchLocationPickerMarker.remove();
    catchLocationPickerMarker = null;
  }
}

function openCatchLocationDialog(row) {
  activeCatchLocationRow = row;
  const existingCatchCoordinates = catchLocationFromRow(row);
  const center = existingCatchCoordinates || firstCatchCoordinates(row) || selectedTripLocationCoordinates();
  els.catchLocationDialog.showModal();
  ensureCatchLocationPickerMap(center, { placeMarker: Boolean(existingCatchCoordinates) });
}

function saveCatchLocationFromPicker() {
  if (!activeCatchLocationRow || !catchLocationPickerMarker) {
    alert("Pick a spot on the map first.");
    return;
  }
  const latLng = catchLocationPickerMarker.getLatLng();
  const coordinates = { latitude: latLng.lat, longitude: latLng.lng, manual: true };
  setCatchLocationForRow(activeCatchLocationRow, coordinates);
  updateCatchFowForCoordinates(activeCatchLocationRow, coordinates, { force: true });
  activeCatchLocationRow = null;
  els.catchLocationDialog.close();
}

function clearActiveCatchLocation() {
  if (activeCatchLocationRow) setCatchLocationForRow(activeCatchLocationRow, null);
  activeCatchLocationRow = null;
  els.catchLocationDialog.close();
}

function openLocationDialog(mode = "location", locationId = "", launchId = "") {
  activeLocationPickerMode = mode;
  activeLocationPickerLocationId = locationId || els.tripLocation.value || "";
  activeLocationPickerLaunchId = launchId || els.tripLaunch.value || "";
  const location = state.locations.find((item) => item.id === activeLocationPickerLocationId);
  const launch = findLaunchByIdOrName(location, activeLocationPickerLaunchId, "");
  const editingLaunch = mode === "launch";
  els.locationDialogTitle.textContent = editingLaunch ? (launch ? "Edit Launch / Area Fished" : "Add Launch / Area Fished") : (location ? "Edit Location" : "Add Location");
  els.locationParentRow.classList.toggle("hidden", !editingLaunch);
  els.locationParentName.value = location?.name || "";
  document.querySelector("#locationPickerInstruction").textContent = editingLaunch
    ? "Press the launch or area fished on the map to place the pin."
    : "Press the waterbody location on the map to place the pin.";
  els.locationName.placeholder = editingLaunch ? "North Shore Marina or Offshore Shelf" : "Lake Ontario";
  els.locationName.value = editingLaunch ? (launch?.name || "North Shore Marina") : (location?.name || "");
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

async function saveLocationPin(event) {
  event.preventDefault();
  const name = els.locationName.value.trim();
  const coordinates = locationFormCoordinates();
  if (!name || !coordinates) {
    alert("Add a name and drop a valid map pin.");
    return;
  }

  if (activeLocationPickerMode === "launch") {
    const location = state.locations.find((item) => item.id === activeLocationPickerLocationId);
    if (!location) return;
    const existing = findLaunchByIdOrName(location, activeLocationPickerLaunchId, name);
    const launch = {
      id: existing?.id || slugId(`${location.id}-launch`, name),
      name,
      coordinates
    };
    location.launches = existing
      ? location.launches.map((item) => item.id === existing.id ? launch : item)
      : [...(location.launches || []), launch];
    state.trips = state.trips.map((trip) => (
      trip.locationId === location.id && trip.launchId === launch.id
        ? { ...trip, launch: launch.name }
        : trip
    ));
    populateLocationSelect(location.id);
    populateLaunchSelect(launch.id);
  } else {
    const existing = state.locations.find((item) => item.id === activeLocationPickerLocationId)
      || state.locations.find((item) => item.name.toLowerCase() === name.toLowerCase());
    const location = {
      id: existing?.id || slugId("loc", name),
      name,
      coordinates,
      launches: existing?.launches || []
    };
    state.locations = existing
      ? state.locations.map((item) => item.id === existing.id ? location : item)
      : [...state.locations, location].sort((a, b) => a.name.localeCompare(b.name));
    state.trips = state.trips.map((trip) => (
      trip.locationId === location.id ? { ...trip, location: location.name } : trip
    ));
    populateLocationSelect(location.id);
  }

  els.locationDialog.close();
  try {
    await saveState();
    renderFilters();
  } catch (error) {
    console.error("Could not save location pin.", error);
  }
  scheduleTripWeatherPreview(true);
}

function tripUsesLocation(trip, location) {
  return trip.locationId === location.id
    || String(trip.location || "").trim().toLowerCase() === location.name.toLowerCase();
}

function tripUsesLaunch(trip, location, launch) {
  if (!tripUsesLocation(trip, location)) return false;
  return trip.launchId === launch.id
    || String(trip.launch || "").trim().toLowerCase() === launch.name.toLowerCase();
}

async function deleteManagedLocation(locationId) {
  const location = state.locations.find((item) => item.id === locationId);
  if (!location) return false;
  const usedTrips = state.trips.filter((trip) => tripUsesLocation(trip, location));
  if (usedTrips.length) {
    alert(`This waterbody is used by ${usedTrips.length} saved trip${usedTrips.length === 1 ? "" : "s"}. Edit those trips before deleting it.`);
    return false;
  }
  if (!confirm(`Delete ${location.name}?`)) return false;
  state.locations = state.locations.filter((item) => item.id !== location.id);
  populateLocationSelect();
  renderLocationManager();
  await saveState();
  renderFilters();
  return true;
}

async function deleteManagedLaunch(locationId, launchId) {
  const location = state.locations.find((item) => item.id === locationId);
  const launch = findLaunchByIdOrName(location, launchId, "");
  if (!location || !launch) return false;
  const usedTrips = state.trips.filter((trip) => tripUsesLaunch(trip, location, launch));
  if (usedTrips.length) {
    alert(`This launch / area fished is used by ${usedTrips.length} saved trip${usedTrips.length === 1 ? "" : "s"}. Edit those trips before deleting it.`);
    return false;
  }
  if (!confirm(`Delete ${launch.name}?`)) return false;
  location.launches = (location.launches || []).filter((item) => item.id !== launch.id);
  populateLocationSelect(location.id);
  populateLaunchSelect();
  renderLocationManager();
  await saveState();
  renderFilters();
  return true;
}

async function deleteActiveLocationFromDialog() {
  const deleted = activeLocationPickerMode === "launch"
    ? await deleteManagedLaunch(activeLocationPickerLocationId, activeLocationPickerLaunchId)
    : await deleteManagedLocation(activeLocationPickerLocationId);
  if (deleted) els.locationDialog.close();
}
