function privatePhotoLocations() {
  const existing = state.settings?.privatePhotoLocations;
  return normalizePrivatePhotoLocations(existing);
}

function fishingSpots() {
  return normalizeSpots(state.spots);
}

function ensureActiveFishingSpot(spots = fishingSpots()) {
  if (!spots.length) {
    activeFishingSpotId = "";
    return "";
  }
  if (!spots.some((spot) => spot.id === activeFishingSpotId)) activeFishingSpotId = "";
  return activeFishingSpotId;
}

function fishingSpotCatchCount(spotId) {
  return state.trips.reduce((total, trip) => total + (trip.catches || []).filter((catchItem) => catchItem.spotId === spotId).length, 0);
}

function fishingSpotDefaultCoordinates() {
  const mapCenter = fishingSpotMap?._loaded ? fishingSpotMap.getCenter() : null;
  if (mapCenter && isUsableCoordinates({ latitude: mapCenter.lat, longitude: mapCenter.lng })) {
    return { latitude: mapCenter.lat, longitude: mapCenter.lng };
  }
  const first = fishingSpots()[0]?.coordinates;
  if (isUsableCoordinates(first)) return first;
  const selected = selectedTripLocationCoordinates();
  if (isUsableCoordinates(selected)) return selected;
  return { latitude: 43.0896, longitude: -79.0849 };
}

function nextFishingSpotName() {
  const names = new Set(fishingSpots().map((spot) => spot.name.toLowerCase()));
  let number = 1;
  while (names.has(`spot ${number}`)) number += 1;
  return `Spot ${number}`;
}

function collectFishingSpotSettings() {
  const current = new Map(fishingSpots().map((spot) => [spot.id, spot]));
  return [...els.fishingSpotList.querySelectorAll("[data-fishing-spot-id]")].map((card) => {
    const existing = current.get(card.dataset.fishingSpotId);
    const nameInput = card.querySelector(".fishing-spot-name");
    const nameDisplay = card.querySelector("[data-fishing-spot-name]");
    return {
      ...existing,
      name: nameInput?.value.trim() || nameDisplay?.dataset.fishingSpotName || existing?.name || "Spot",
      radiusMeters: fishingSpotRadiusMeters(card.querySelector(".fishing-spot-radius")?.value || fishingSpotRadiusDisplayValue(existing?.radiusMeters || 100))
    };
  });
}

function validateFishingSpots(spots) {
  const names = new Set();
  spots.forEach((spot) => {
    const name = String(spot.name || "").trim();
    const nameKey = name.toLowerCase();
    if (!name) throw new Error("Every fishing spot needs a name.");
    if (names.has(nameKey)) throw new Error(`Fishing spot names must be unique. “${name}” is used more than once.`);
    names.add(nameKey);
  });
}

async function saveFishingSpots(nextSpots, options = {}) {
  await runSettingsSave(
    async () => {
      validateFishingSpots(nextSpots);
      const normalized = normalizeSpots(nextSpots);
      if (normalized.length !== nextSpots.length) throw new Error("A fishing spot has invalid coordinates or radius.");
      state.spots = normalized;
      ensureActiveFishingSpot(normalized);
      await saveState();
      if (options.rerender !== false) renderFishingSpotSettings();
      else renderFishingSpotMap();
    },
    "The fishing spots could not be saved.",
    options
  );
}

function renderFishingSpotSettings() {
  if (!els.fishingSpotList) return;
  const spots = fishingSpots();
  const activeId = ensureActiveFishingSpot(spots);
  const orderedSpots = activeId
    ? [spots.find((spot) => spot.id === activeId), ...spots.filter((spot) => spot.id !== activeId)].filter(Boolean)
    : spots;
  state.spots = spots;
  const radiusConfig = fishingSpotRadiusSliderConfig();
  els.fishingSpotList.innerHTML = orderedSpots.length ? orderedSpots.map((spot) => {
    const count = fishingSpotCatchCount(spot.id);
    return `
      <article class="private-location-card${spot.id === activeId ? " is-selected" : ""}" data-fishing-spot-id="${escapeHtml(spot.id)}" aria-current="${spot.id === activeId ? "true" : "false"}">
        <div class="private-location-card-head">
          <div class="private-location-name-row">
            <input class="private-location-name fishing-spot-name" type="text" value="${escapeHtml(spot.name)}" aria-label="Fishing spot name" />
          </div>
          <button class="button secondary private-location-edit-pin" type="button" data-edit-fishing-spot-pin="${escapeHtml(spot.id)}" aria-label="Edit map pin for ${escapeHtml(spot.name)}">Edit pin</button>
          <button class="button danger" type="button" data-delete-fishing-spot="${escapeHtml(spot.id)}">Delete</button>
        </div>
        <p class="fishing-spot-assignment-count">${count} assigned ${count === 1 ? "catch" : "catches"}</p>
        <label class="settings-control private-location-radius-control">
        <span>Radius <output class="private-location-radius-value fishing-spot-radius-value">${escapeHtml(fishingSpotRadiusText(spot.radiusMeters))}</output></span>
          <input class="private-location-radius fishing-spot-radius" type="range" min="${radiusConfig.min}" max="${radiusConfig.max}" step="${radiusConfig.step}" value="${escapeHtml(fishingSpotRadiusDisplayValue(spot.radiusMeters))}" aria-label="Fishing spot radius in ${radiusConfig.unit}" style="${fishingSpotRadiusStyle(spot.radiusMeters)}" />
        </label>
      </article>
    `;
  }).join("") : `<div class="empty-state compact-empty"><p>No fishing spots saved.</p><p>Add one, then place and size its circle on the map.</p></div>`;
  ensureFishingSpotMap();
  renderFishingSpotMap();
}

function ensureFishingSpotMap() {
  if (!window.L || !els.fishingSpotMap) return;
  const shouldInitializeView = !fishingSpotMap;
  if (!fishingSpotMap) {
    fishingSpotMap = L.map(els.fishingSpotMap, seamlessMapOptions());
    addSeamlessTileLayer(fishingSpotMap);
    fishingSpotLayer = L.featureGroup().addTo(fishingSpotMap);
    fishingSpotMap.on("click", async (event) => {
      const activeId = ensureActiveFishingSpot();
      if (!activeId) return;
      const next = collectFishingSpotSettings().map((spot) => spot.id === activeId
        ? { ...spot, coordinates: { latitude: event.latlng.lat, longitude: event.latlng.lng } }
        : spot);
      await saveFishingSpots(next);
    });
  }
  if (shouldInitializeView || !fishingSpotMap._loaded) {
    const center = fishingSpotDefaultCoordinates();
    fishingSpotMap.setView([center.latitude, center.longitude], fishingSpots().length ? 11 : 7);
  }
  setTimeout(() => fishingSpotMap.invalidateSize(), 50);
}

function renderFishingSpotMap() {
  if (!window.L || !fishingSpotMap || !fishingSpotLayer) return;
  fishingSpotLayer.clearLayers();
  const spots = fishingSpots();
  spots.forEach((spot) => {
    const active = spot.id === activeFishingSpotId;
    const point = [spot.coordinates.latitude, spot.coordinates.longitude];
    const circle = L.circle(point, {
      radius: spot.radiusMeters,
      // Let clicks pass through the visualization to the map placement handler.
      // The marker remains interactive for selecting/dragging the spot center.
      interactive: false,
      color: active ? "#118753" : "#65718a",
      weight: active ? 3 : 2,
      fillColor: "#2fb875",
      fillOpacity: active ? 0.18 : 0.08
    }).addTo(fishingSpotLayer);
    const marker = L.marker(point, { draggable: true }).addTo(fishingSpotLayer);
    marker.on("click", () => {
      activeFishingSpotId = spot.id;
      renderFishingSpotSettings();
    });
    marker.on("dragend", async () => {
      activeFishingSpotId = spot.id;
      const latLng = marker.getLatLng();
      const next = collectFishingSpotSettings().map((item) => item.id === spot.id
        ? { ...item, coordinates: { latitude: latLng.lat, longitude: latLng.lng } }
        : item);
      await saveFishingSpots(next);
    });
  });
  const active = spots.find((spot) => spot.id === activeFishingSpotId);
  if (active) fishingSpotMap.setView([active.coordinates.latitude, active.coordinates.longitude], fishingSpotMap.getZoom());
}

function privateLocationSummary(location) {
  return `${coordinateText(location.coordinates)} / ${privateLocationRadiusText(location.radiusMeters)}`;
}

function privateLocationRadiusUnit() {
  return unitPreference("distance") === "mi" ? "ft" : "m";
}

function privateLocationRadiusDisplayValue(radiusMeters) {
  const radius = Math.max(25, Math.min(10000, Number(radiusMeters) || 400));
  const unit = privateLocationRadiusUnit();
  const value = unit === "ft" ? convertUnitValue(radius, "m", "ft") : radius;
  return Math.round(value);
}

function fishingSpotRadiusSliderConfig() {
  const unit = unitPreference("distance") === "mi" ? "ft" : "m";
  if (unit === "ft") {
    return { min: Math.round(convertUnitValue(25, "m", "ft")), max: Math.round(convertUnitValue(500, "m", "ft")), step: Math.round(convertUnitValue(5, "m", "ft")), unit };
  }
  return { min: 25, max: 500, step: 5, unit };
}

function fishingSpotRadiusDisplayValue(radiusMeters) {
  const radius = Math.max(25, Math.min(500, Number(radiusMeters) || 100));
  return unitPreference("distance") === "mi" ? convertUnitValue(radius, "m", "ft") : radius;
}

function fishingSpotRadiusMeters(displayValue) {
  const config = fishingSpotRadiusSliderConfig();
  const value = Math.max(config.min, Math.min(config.max, Number(displayValue) || fishingSpotRadiusDisplayValue(100)));
  return unitPreference("distance") === "mi" ? convertUnitValue(value, "ft", "m") : value;
}

function fishingSpotRadiusProgress(displayValue) {
  const { min, max } = fishingSpotRadiusSliderConfig();
  const radius = Math.max(min, Math.min(max, Number(displayValue) || fishingSpotRadiusDisplayValue(100)));
  return Math.round(((radius - min) / (max - min)) * 10000) / 100;
}

function fishingSpotRadiusStyle(radiusMeters) {
  return `--private-location-radius-progress: ${fishingSpotRadiusProgress(fishingSpotRadiusDisplayValue(radiusMeters))}%;`;
}

function fishingSpotRadiusText(radiusMeters) {
  const unit = fishingSpotRadiusSliderConfig().unit;
  return `${trimNumber(fishingSpotRadiusDisplayValue(radiusMeters))} ${unit}`;
}

function privateLocationRadiusMeters(displayValue) {
  const unit = privateLocationRadiusUnit();
  const value = Number(displayValue) || privateLocationRadiusDisplayValue(400);
  const meters = unit === "ft" ? convertUnitValue(value, "ft", "m") : value;
  return Math.max(25, Math.min(10000, meters || 400));
}

function privateLocationRadiusSliderConfig() {
  const unit = privateLocationRadiusUnit();
  if (unit === "ft") {
    return {
      min: Math.round(convertUnitValue(25, "m", "ft")),
      max: Math.round(convertUnitValue(10000, "m", "ft")),
      step: 1,
      unit
    };
  }
  return { min: 25, max: 10000, step: 25, unit };
}

function privateLocationRadiusText(radiusMeters) {
  const unit = privateLocationRadiusUnit();
  return `${trimNumber(privateLocationRadiusDisplayValue(radiusMeters))} ${unit}`;
}

function privateLocationRadiusProgress(displayValue) {
  const { min, max } = privateLocationRadiusSliderConfig();
  const radius = Math.max(min, Math.min(max, Number(displayValue) || privateLocationRadiusDisplayValue(400)));
  return Math.round(((radius - min) / (max - min)) * 10000) / 100;
}

function privateLocationRadiusStyle(radiusMeters) {
  return `--private-location-radius-progress: ${privateLocationRadiusProgress(privateLocationRadiusDisplayValue(radiusMeters))}%;`;
}

function updatePrivateLocationRadiusControl(input) {
  input.style.setProperty("--private-location-radius-progress", `${privateLocationRadiusProgress(input.value)}%`);
}

function updateFishingSpotRadiusControl(input) {
  input.style.setProperty("--private-location-radius-progress", `${fishingSpotRadiusProgress(input.value)}%`);
}

function ensureActivePrivatePhotoLocation(locations = privatePhotoLocations()) {
  if (!locations.length) {
    activePrivatePhotoLocationId = "";
    return "";
  }
  if (!locations.some((location) => location.id === activePrivatePhotoLocationId)) {
    activePrivatePhotoLocationId = "";
  }
  return activePrivatePhotoLocationId;
}

function renderPrivatePhotoLocationSettings() {
  if (!els.privatePhotoLocationList) return;
  const locations = privatePhotoLocations();
  const activeLocationId = ensureActivePrivatePhotoLocation(locations);
  const orderedLocations = activeLocationId
    ? [locations.find((location) => location.id === activeLocationId), ...locations.filter((location) => location.id !== activeLocationId)].filter(Boolean)
    : locations;
  state.settings = {
    ...(state.settings || {}),
    privatePhotoLocations: locations
  };
  const radiusConfig = privateLocationRadiusSliderConfig();
  els.privatePhotoLocationList.innerHTML = orderedLocations.length ? orderedLocations.map((location) => `
    <article class="private-location-card${location.id === activeLocationId ? " is-selected" : ""}" data-private-location-id="${escapeHtml(location.id)}" aria-current="${location.id === activeLocationId ? "true" : "false"}">
      <div class="private-location-card-head">
          <div class="private-location-name-row">
            ${privateLocationNameEditId === location.id
              ? `<input class="private-location-name" type="text" value="${escapeHtml(location.name)}" aria-label="Home location name" />`
              : `<button class="private-location-name-display" type="button" data-edit-private-location-name="${escapeHtml(location.id)}" data-private-location-name="${escapeHtml(location.name)}">${escapeHtml(location.name)}</button>`}
          </div>
          <button class="button secondary private-location-edit-pin" type="button" data-edit-private-location-pin="${escapeHtml(location.id)}" aria-label="Edit map pin for ${escapeHtml(location.name)}">Edit pin</button>
          <button class="button danger" type="button" data-delete-private-location="${escapeHtml(location.id)}">Delete</button>
      </div>
      <label class="settings-control private-location-radius-control">
        <span>Radius <output class="private-location-radius-value">${escapeHtml(privateLocationRadiusText(location.radiusMeters))}</output></span>
        <input class="private-location-radius" type="range" min="${radiusConfig.min}" max="${radiusConfig.max}" step="${radiusConfig.step}" value="${escapeHtml(privateLocationRadiusDisplayValue(location.radiusMeters))}" aria-label="Home location radius in ${radiusConfig.unit}" style="${privateLocationRadiusStyle(location.radiusMeters)}" />
      </label>
    </article>
  `).join("") : `<div class="empty-state compact-empty"><p>No home locations saved.</p></div>`;
  ensurePrivatePhotoLocationMap();
  renderPrivatePhotoLocationMap();
}

function privateLocationDefaultCoordinates() {
  const first = privatePhotoLocations()[0]?.coordinates;
  if (isUsableCoordinates(first)) return first;
  const selected = selectedTripLocationCoordinates();
  if (isUsableCoordinates(selected)) return selected;
  return { latitude: 43.7, longitude: -79.4 };
}

async function savePrivatePhotoLocations(nextLocations, options = {}) {
  state.settings = {
    ...(state.settings || {}),
    privatePhotoLocations: normalizePrivatePhotoLocations(nextLocations)
  };
  ensureActivePrivatePhotoLocation(state.settings.privatePhotoLocations);
  try {
    await runSettingsSave(
      async () => {
        await saveState();
        if (options.rerender !== false) {
          renderPrivatePhotoLocationSettings();
        } else {
          renderPrivatePhotoLocationMap();
        }
      },
      "The private photo locations could not be saved.",
      options
    );
  } catch (error) {
  }
}

function collectPrivatePhotoLocationSettings() {
  const current = new Map(privatePhotoLocations().map((location) => [location.id, location]));
  return [...els.privatePhotoLocationList.querySelectorAll("[data-private-location-id]")].map((card) => {
    const existing = current.get(card.dataset.privateLocationId);
    const nameInput = card.querySelector(".private-location-name");
    const nameDisplay = card.querySelector("[data-private-location-name]");
    return {
      ...existing,
      name: nameInput?.value.trim() || nameDisplay?.dataset.privateLocationName || existing?.name || "Home",
      radiusMeters: privateLocationRadiusMeters(card.querySelector(".private-location-radius")?.value || privateLocationRadiusDisplayValue(existing?.radiusMeters || 400))
    };
  });
}

function ensurePrivatePhotoLocationMap() {
  if (!window.L || !els.privatePhotoLocationMap) return;
  const shouldInitializeView = !privatePhotoLocationMap;
  if (!privatePhotoLocationMap) {
    privatePhotoLocationMap = L.map(els.privatePhotoLocationMap, seamlessMapOptions());
    addSeamlessTileLayer(privatePhotoLocationMap);
    privatePhotoLocationLayer = L.featureGroup().addTo(privatePhotoLocationMap);
    privatePhotoLocationMap.on("click", async (event) => {
      const locations = collectPrivatePhotoLocationSettings();
      const activeLocationId = ensureActivePrivatePhotoLocation(locations);
      if (!activeLocationId) return;
      const next = locations.map((location) => (
        location.id === activeLocationId
          ? { ...location, coordinates: { latitude: event.latlng.lat, longitude: event.latlng.lng } }
          : location
      ));
      await savePrivatePhotoLocations(next);
    });
  }
  if (shouldInitializeView || !privatePhotoLocationMap._loaded) {
    const center = privateLocationDefaultCoordinates();
    privatePhotoLocationMap.setView([center.latitude, center.longitude], privatePhotoLocations().length ? 11 : 7);
  }
  setTimeout(() => privatePhotoLocationMap.invalidateSize(), 50);
}

function renderPrivatePhotoLocationMap() {
  if (!window.L || !privatePhotoLocationMap || !privatePhotoLocationLayer) return;
  privatePhotoLocationLayer.clearLayers();
  const locations = privatePhotoLocations();
  locations.forEach((location) => {
    const isActive = location.id === activePrivatePhotoLocationId;
    const point = [location.coordinates.latitude, location.coordinates.longitude];
    const circle = L.circle(point, {
      radius: Number(location.radiusMeters) || 400,
      color: isActive ? "#118753" : "#65718a",
      weight: isActive ? 3 : 2,
      fillColor: "#2fb875",
      fillOpacity: isActive ? 0.18 : 0.08
    }).addTo(privatePhotoLocationLayer);
    circle.bindPopup(`${escapeHtml(location.name)}<br>${escapeHtml(privateLocationSummary(location))}`);
    const marker = L.marker(point, { draggable: true }).addTo(privatePhotoLocationLayer);
    marker.on("click", () => {
      activePrivatePhotoLocationId = location.id;
      renderPrivatePhotoLocationSettings();
    });
    marker.on("dragend", async () => {
      activePrivatePhotoLocationId = location.id;
      const latLng = marker.getLatLng();
      const next = collectPrivatePhotoLocationSettings().map((item) => (
        item.id === location.id
          ? { ...item, coordinates: { latitude: latLng.lat, longitude: latLng.lng } }
          : item
      ));
      await savePrivatePhotoLocations(next);
    });
  });
  const activeLocation = locations.find((location) => location.id === activePrivatePhotoLocationId);
  if (activeLocation) {
    privatePhotoLocationMap.setView(
      [activeLocation.coordinates.latitude, activeLocation.coordinates.longitude],
      privatePhotoLocationMap.getZoom()
    );
  }
}
