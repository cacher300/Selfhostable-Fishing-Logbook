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
  els.tripLaunch.innerHTML = `<option value="">No launch selected</option>` + launches.map((launch) => (
    `<option value="${escapeHtml(launch.id)}" ${launch.id === selectedLaunch?.id ? "selected" : ""}>${escapeHtml(launch.name)}</option>`
  )).join("");
  updateLocationControls();
}

function updateLocationControls() {
  const location = state.locations.find((item) => item.id === els.tripLocation?.value);
  if (els.addLaunchButton) els.addLaunchButton.disabled = !location;
  scheduleTripWeatherPreview();
}

function renderLocationManager() {
  if (!els.locationManagerList) return;
  if (!state.locations.length) {
    els.locationManagerList.innerHTML = `<div class="empty-state compact-empty"><p>No locations saved yet.</p></div>`;
    return;
  }
  els.locationManagerList.innerHTML = state.locations.map((location) => `
    <article class="location-manager-card">
      <div class="location-manager-heading">
        <div>
          <strong>${escapeHtml(location.name)}</strong>
          <span>${escapeHtml(coordinateText(location.coordinates) || "No pin saved")}</span>
        </div>
        <div class="location-manager-card-actions">
          <button class="button secondary" type="button" data-edit-managed-location="${escapeHtml(location.id)}">Edit</button>
          <button class="button danger" type="button" data-delete-managed-location="${escapeHtml(location.id)}">Delete</button>
        </div>
      </div>
      ${(location.launches || []).length ? `
        <div class="location-manager-launches">
          ${(location.launches || []).map((launch) => `
            <div>
              <span>${escapeHtml(launch.name)}${coordinateText(launch.coordinates) ? ` / ${escapeHtml(coordinateText(launch.coordinates))}` : ""}</span>
              <div class="location-manager-card-actions">
                <button class="button secondary" type="button" data-location-id="${escapeHtml(location.id)}" data-edit-managed-launch="${escapeHtml(launch.id)}">Edit</button>
                <button class="button danger" type="button" data-location-id="${escapeHtml(location.id)}" data-delete-managed-launch="${escapeHtml(launch.id)}">Delete</button>
              </div>
            </div>
          `).join("")}
        </div>
      ` : `<div class="location-manager-launches"><span>No launches saved</span></div>`}
    </article>
  `).join("");
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
    locationPickerMap = L.map(els.locationPickerMap);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors"
    }).addTo(locationPickerMap);
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

function openLocationDialog(mode = "location", locationId = "", launchId = "") {
  activeLocationPickerMode = mode;
  activeLocationPickerLocationId = locationId || els.tripLocation.value || "";
  activeLocationPickerLaunchId = launchId || els.tripLaunch.value || "";
  const location = state.locations.find((item) => item.id === activeLocationPickerLocationId);
  const launch = findLaunchByIdOrName(location, activeLocationPickerLaunchId, "");
  const editingLaunch = mode === "launch";
  els.locationDialogTitle.textContent = editingLaunch ? (launch ? "Edit Launch" : "Add Launch") : (location ? "Edit Location" : "Add Location");
  els.locationParentRow.classList.toggle("hidden", !editingLaunch);
  els.locationParentName.value = location?.name || "";
  els.locationName.value = editingLaunch ? (launch?.name || "") : (location?.name || "");
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
  if (!location) return;
  const usedTrips = state.trips.filter((trip) => tripUsesLocation(trip, location));
  if (usedTrips.length) {
    alert(`This waterbody is used by ${usedTrips.length} saved trip${usedTrips.length === 1 ? "" : "s"}. Edit those trips before deleting it.`);
    return;
  }
  if (!confirm(`Delete ${location.name}?`)) return;
  state.locations = state.locations.filter((item) => item.id !== location.id);
  populateLocationSelect();
  renderLocationManager();
  await saveState();
  renderFilters();
}

async function deleteManagedLaunch(locationId, launchId) {
  const location = state.locations.find((item) => item.id === locationId);
  const launch = findLaunchByIdOrName(location, launchId, "");
  if (!location || !launch) return;
  const usedTrips = state.trips.filter((trip) => tripUsesLaunch(trip, location, launch));
  if (usedTrips.length) {
    alert(`This launch is used by ${usedTrips.length} saved trip${usedTrips.length === 1 ? "" : "s"}. Edit those trips before deleting it.`);
    return;
  }
  if (!confirm(`Delete ${launch.name}?`)) return;
  location.launches = (location.launches || []).filter((item) => item.id !== launch.id);
  populateLocationSelect(location.id);
  populateLaunchSelect();
  renderLocationManager();
  await saveState();
  renderFilters();
}
