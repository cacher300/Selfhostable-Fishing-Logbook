function normalizeCoordinates(coordinates) {
  if (!coordinates || typeof coordinates !== "object") return null;
  const normalized = {
    latitude: Number(coordinates.latitude),
    longitude: Number(coordinates.longitude)
  };
  return isUsableCoordinates(normalized) ? normalized : null;
}

function coordinateDistanceMeters(first, second) {
  if (!isUsableCoordinates(first) || !isUsableCoordinates(second)) return Number.POSITIVE_INFINITY;
  const earthRadius = 6371000;
  const toRadians = (value) => (Number(value) * Math.PI) / 180;
  const deltaLatitude = toRadians(second.latitude - first.latitude);
  const deltaLongitude = toRadians(second.longitude - first.longitude);
  const latitudeOne = toRadians(first.latitude);
  const latitudeTwo = toRadians(second.latitude);
  const haversine = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(latitudeOne) * Math.cos(latitudeTwo) * Math.sin(deltaLongitude / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function normalizeSpots(spots = []) {
  const ids = new Set();
  const names = new Set();
  return (Array.isArray(spots) ? spots : []).flatMap((spot) => {
    if (!spot || typeof spot !== "object") return [];
    const id = String(spot.id || "").trim();
    const name = String(spot.name || "").trim();
    const nameKey = name.toLowerCase();
    const coordinates = normalizeCoordinates(spot.coordinates);
    const radiusMeters = Number(spot.radiusMeters);
    if (!id || ids.has(id) || !name || names.has(nameKey) || !coordinates || !Number.isFinite(radiusMeters) || radiusMeters < 25 || radiusMeters > 500) return [];
    ids.add(id);
    names.add(nameKey);
    return [{ id, name, coordinates, radiusMeters: Math.round(radiusMeters * 100) / 100 }];
  });
}

function automaticSpotId(catchItem, spots = state.spots || []) {
  const coordinates = normalizeCoordinates(catchItem?.manualCoordinates) || normalizeCoordinates(catchItem?.coordinates);
  if (!coordinates) return "";
  const matches = spots.flatMap((spot) => {
    const distance = coordinateDistanceMeters(coordinates, spot.coordinates);
    return distance <= Number(spot.radiusMeters) ? [{ id: spot.id, distance }] : [];
  });
  matches.sort((first, second) => first.distance - second.distance || first.id.localeCompare(second.id));
  return matches[0]?.id || "";
}

function normalizeCatchSpotAssignment(catchItem, spots = state.spots || []) {
  const mode = catchItem?.spotAssignmentMode === "manual" ? "manual" : "automatic";
  const spotIds = new Set(spots.map((spot) => spot.id));
  const requestedId = String(catchItem?.spotId || "").trim();
  return {
    ...catchItem,
    spotAssignmentMode: mode,
    spotId: mode === "manual"
      ? (spotIds.has(requestedId) ? requestedId : "")
      : automaticSpotId(catchItem, spots)
  };
}

function spotName(spotId) {
  return state.spots.find((spot) => spot.id === spotId)?.name || "";
}

function slugId(prefix, value) {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug ? `${prefix}-${slug}` : createId();
}

function normalizeLaunchRecord(launch, locationId) {
  if (!launch) return null;
  if (typeof launch === "string") {
    const name = launch.trim();
    return name ? { id: slugId(`${locationId}-launch`, name), name, coordinates: null } : null;
  }
  if (typeof launch !== "object") return null;
  const name = String(launch.name || launch.launch || "").trim();
  if (!name) return null;
  return {
    id: String(launch.id || slugId(`${locationId}-launch`, name)),
    name,
    coordinates: normalizeCoordinates(launch.coordinates)
  };
}

function normalizeLocationRecord(location) {
  if (!location) return null;
  if (typeof location === "string") {
    const name = location.trim();
    return name ? { id: slugId("loc", name), name, coordinates: null, launches: [] } : null;
  }
  if (typeof location !== "object") return null;
  const name = String(location.name || location.location || "").trim();
  if (!name) return null;
  const id = String(location.id || slugId("loc", name));
  return {
    id,
    name,
    coordinates: normalizeCoordinates(location.coordinates),
    launches: (Array.isArray(location.launches) ? location.launches : [])
      .map((launch) => normalizeLaunchRecord(launch, id))
      .filter(Boolean)
  };
}

function mergeLocations(locations, tripNames = []) {
  const byName = new Map();
  locations.map(normalizeLocationRecord).filter(Boolean).forEach((location) => {
    const key = location.name.toLowerCase();
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, location);
      return;
    }
    existing.coordinates = existing.coordinates || location.coordinates;
    location.launches.forEach((launch) => {
      if (!existing.launches.some((item) => item.name.toLowerCase() === launch.name.toLowerCase())) {
        existing.launches.push(launch);
      }
    });
  });
  tripNames.forEach((name) => {
    const trimmed = String(name || "").trim();
    if (!trimmed || byName.has(trimmed.toLowerCase())) return;
    const location = normalizeLocationRecord(trimmed);
    if (location) byName.set(trimmed.toLowerCase(), location);
  });
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function locationNames() {
  return state.locations.map((location) => location.name).filter(Boolean);
}

function findLocationByIdOrName(id, name) {
  return state.locations.find((location) => location.id === id)
    || state.locations.find((location) => location.name.toLowerCase() === String(name || "").trim().toLowerCase())
    || null;
}

function findLaunchByIdOrName(location, id, name) {
  if (!location) return null;
  return (location.launches || []).find((launch) => launch.id === id)
    || (location.launches || []).find((launch) => launch.name.toLowerCase() === String(name || "").trim().toLowerCase())
    || null;
}

function tripLocationRecord(trip) {
  return findLocationByIdOrName(trip?.locationId, trip?.location);
}

function tripLaunchRecord(trip) {
  return findLaunchByIdOrName(tripLocationRecord(trip), trip?.launchId, trip?.launch);
}

function tripWeatherCoordinates(trip) {
  const launch = tripLaunchRecord(trip);
  if (isUsableCoordinates(launch?.coordinates)) {
    return { type: "launch", name: launch.name, coordinates: launch.coordinates };
  }
  const location = tripLocationRecord(trip);
  if (isUsableCoordinates(location?.coordinates)) {
    return { type: "location", name: location.name, coordinates: location.coordinates };
  }
  return null;
}

function normalizeState(nextState) {
  const normalized = { ...structuredClone(defaults), ...(nextState || {}) };
  delete normalized.tripTypes;
  normalized.settings = normalizeSettings(normalized.settings);

  ["species", "methods", "riggings", "lureTypes", "flasherTypes", "waterClarities", "structureOptions", "weatherTypes", "reelStyles", "rodTypes", "lineTypes", "lureBladeTypes", "lureSpoonSizes", "trollingPresentations", "trollingDirections", "setupLineSides", "lures", "flashers", "reels", "rods", "rodReelCombos", "people", "locations", "spots", "expeditions", "trips"].forEach((key) => {
    if (!Array.isArray(normalized[key])) normalized[key] = structuredClone(defaults[key]);
  });
  ["species", "methods", "riggings", "lureTypes", "flasherTypes", "waterClarities", "structureOptions", "weatherTypes", "reelStyles", "rodTypes", "lineTypes", "lureBladeTypes", "lureSpoonSizes", "trollingDirections"].forEach((key) => {
    const values = key === "species"
      ? normalized[key].flatMap((item) => {
          const value = typeof item === "object" ? item?.label || item?.value : item;
          return String(value || "").trim().toLowerCase() === "crappie"
            ? ["Black Crappie", "White Crappie"]
            : [item];
        })
      : normalized[key];
    normalized[key] = normalizeTextOptions(values, defaults[key]);
    if (key === "lureTypes") normalized[key].sort((a, b) => a.localeCompare(b));
  });
  normalized.trollingPresentations = normalizeChoiceOptions(
    defaults.trollingPresentations,
    normalized.trollingPresentations.map((item) => {
      const value = migrateTrollingPresentationValue(typeof item === "object" ? item.value : item);
      return { value, label: value };
    })
  );
  normalized.setupLineSides = normalizeChoiceOptions(
    defaults.setupLineSides,
    normalized.setupLineSides.map((item) => {
      const value = migrateSetupLineSideValue(typeof item === "object" ? item.value : item);
      return { value, label: value };
    })
  );

  normalized.reels = normalized.reels.map((reel) => ({
    lineHistory: [],
    ...reel
  }));
  normalized.rods = normalized.rods.map((rod) => ({ ...rod }));
  normalized.rodReelCombos = normalized.rodReelCombos.map((combo) => ({ ...combo }));
  normalized.spots = normalizeSpots(normalized.spots);
  normalized.expeditions = normalized.expeditions
    .filter((expedition) => expedition && typeof expedition === "object")
    .map((expedition) => ({
      id: String(expedition.id || createId()),
      name: String(expedition.name || "").trim(),
      startDate: String(expedition.startDate || "").trim(),
      endDate: String(expedition.endDate || "").trim(),
      destination: String(expedition.destination || "").trim(),
      notes: String(expedition.notes || "").trim()
    }))
    .filter((expedition) => expedition.name && expedition.startDate && expedition.endDate);
  const expeditionIds = new Set(normalized.expeditions.map((expedition) => expedition.id));
  normalized.trips = normalized.trips.map((trip) => ({
    catches: [],
    lostFish: [],
    gearUsed: [],
    people: [],
    notePhotos: [],
    ...trip
  }));
  normalized.people = mergePeople(
    normalized.people,
    normalized.trips.flatMap((trip) => trip.people || [])
  );
  normalized.locations = mergeLocations(normalized.locations, normalized.trips.map((trip) => trip.location));
  normalized.trips = normalized.trips.map((trip) => {
    const location = normalized.locations.find((item) => item.id === trip.locationId)
      || normalized.locations.find((item) => item.name.toLowerCase() === String(trip.location || "").trim().toLowerCase());
    const launch = location
      ? (location.launches || []).find((item) => item.id === trip.launchId)
        || (location.launches || []).find((item) => item.name.toLowerCase() === String(trip.launch || "").trim().toLowerCase())
      : null;
    return {
      ...trip,
      isDraft: Boolean(trip.isDraft),
      launchTime: trip.launchTime || "",
      linesSetTime: trip.linesSetTime || trip.startTime || "",
      linesPulledTime: trip.linesPulledTime || trip.endTime || "",
      startTime: trip.linesSetTime || trip.startTime || "",
      endTime: trip.linesPulledTime || trip.endTime || "",
      probeTemperatureProfile: (Array.isArray(trip.probeTemperatureProfile) ? trip.probeTemperatureProfile : [])
        .filter((entry) => entry && Number.isFinite(Number(entry.depthFeet)))
        .map((entry) => ({ depthFeet: Number(entry.depthFeet), temperature: String(entry.temperature || "").trim() })),
      gearUsed: (trip.gearUsed || []).map((gearItem) => ({
        boatItemId: "",
        comboId: "",
        rodId: "",
        reelId: "",
        ...gearItem,
        side: migrateSetupLineSideValue(gearItem.side),
        presentation: migrateTrollingPresentationValue(gearItem.presentation)
      })),
      catches: (trip.catches || []).map((catchItem) => normalizeCatchSpotAssignment({
        rodId: "",
        ...catchItem,
        gpsSpeed: catchItem.gpsSpeed ?? catchItem.speed ?? "",
        ballSpeed: catchItem.ballSpeed || "",
        presentation: migrateTrollingPresentationValue(catchItem.presentation)
      }, normalized.spots)),
      lostFish: (trip.lostFish || []).map((fishItem) => ({
        rodId: "",
        ...fishItem,
        gpsSpeed: fishItem.gpsSpeed ?? fishItem.speed ?? "",
        ballSpeed: fishItem.ballSpeed || "",
        presentation: migrateTrollingPresentationValue(fishItem.presentation)
      })),
      location: location?.name || trip.location || "",
      locationId: location?.id || trip.locationId || "",
      launch: launch?.name || trip.launch || "",
      launchId: launch?.id || trip.launchId || "",
      expeditionId: expeditionIds.has(String(trip.expeditionId || "")) ? String(trip.expeditionId) : ""
    };
  });

  return normalized;
}

function normalizeTextOptions(options = [], fallback = []) {
  const source = [
    ...(Array.isArray(options) ? options : []),
    ...(Array.isArray(fallback) ? fallback : [])
  ];
  const seen = new Set();
  return source
    .map((item) => typeof item === "object" ? item?.label || item?.value : item)
    .map((item) => String(item || "").trim())
    .filter((item) => {
      const key = item.toLowerCase();
      if (!item || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function slugOptionValue(label) {
  return String(label || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeChoiceOptions(options = [], fallback = []) {
  const source = [
    ...(Array.isArray(options) ? options : []),
    ...(Array.isArray(fallback) ? fallback : [])
  ];
  const seen = new Set();
  return source
    .map((item) => {
      if (item && typeof item === "object") {
        const label = String(item.label || item.value || "").trim();
        const value = String(item.value || slugOptionValue(label)).trim();
        return { value, label: label || value };
      }
      const label = String(item || "").trim();
      return { value: slugOptionValue(label) || label, label };
    })
    .filter((item) => {
      const key = item.value.toLowerCase();
      if (!item.value || !item.label || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function optionChoices(key) {
  return normalizeChoiceOptions(state[key], defaults[key]);
}

function optionLabels(key) {
  return normalizeTextOptions(state[key], defaults[key]);
}

function choiceLabel(key, value) {
  const text = String(value || "");
  return optionChoices(key).find((item) => item.value === text)?.label || text;
}

function normalizeSettings(settings = {}) {
  const normalized = {
    ...structuredClone(defaults.settings),
    ...(settings && typeof settings === "object" ? settings : {})
  };
  normalized.theme = normalized.theme === "dark" ? "dark" : "light";
  normalized.timeFormat = normalized.timeFormat === "12" ? "12" : "24";
  normalized.defaultHomeLake = ["", "Superior", "Michigan", "Huron", "Erie", "Ontario"].includes(normalized.defaultHomeLake) ? normalized.defaultHomeLake : "";
  const legacyBathymetryOffset = normalizeBathymetryOffsetFeet(settings?.bathymetryOffsetFeet);
  normalized.bathymetryLakeCalibrationsFeet = normalizeBathymetryLakeCalibrations(
    settings?.bathymetryLakeCalibrationsFeet,
    settings?.bathymetryLakeOffsetsFeet,
    legacyBathymetryOffset
  );
  delete normalized.bathymetryOffsetFeet;
  delete normalized.bathymetryLakeOffsetsFeet;
  normalized.units = normalizeUnits(normalized.units);
  normalized.chopRanges = normalizeChopRanges(normalized.chopRanges);
  normalized.defaultTrollingSpread = normalizeDefaultTrollingSpread(normalized.defaultTrollingSpread);
  normalized.defaultTrollingSpreads = normalizeDefaultTrollingSpreads(
    normalized.defaultTrollingSpreads,
    normalized.defaultTrollingSpread
  );
  normalized.boatLayout = normalizeBoatLayout(normalized.boatLayout);
  normalized.tackleBoxes = normalizeTackleBoxes(normalized.tackleBoxes);
  normalized.privatePhotoLocations = normalizePrivatePhotoLocations(normalized.privatePhotoLocations);
  return normalized;
}

function normalizeBathymetryOffsetFeet(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 100) / 100;
}

function normalizeBathymetryLakeCalibrations(calibrations, offsets, fallback = 0) {
  const lakes = ["Erie", "Ontario", "St. Clair", "Huron", "Michigan", "Superior"];
  return Object.fromEntries(lakes.map((lake) => [
    lake,
    {
      shallowOffsetFeet: 0,
      offshoreOffsetFeet: normalizeBathymetryOffsetFeet(calibrations?.[lake]?.offshoreOffsetFeet ?? offsets?.[lake] ?? fallback)
    }
  ]));
}

function normalizeDefaultTrollingSpread(spread = []) {
  if (!Array.isArray(spread)) return [];
  return spread.map((item) => ({
    comboId: String(item?.comboId || "").trim(),
    side: String(item?.side || "").trim(),
    presentation: String(item?.presentation || "").trim()
  })).filter((item) => item.comboId);
}

function normalizeDefaultTrollingSpreads(spreads = [], legacySpread = []) {
  const normalized = new Map();
  if (Array.isArray(spreads)) {
    spreads.forEach((item) => {
      if (!item || typeof item !== "object") return;
      const spread = normalizeDefaultTrollingSpread(item.spread);
      if (!spread.length) return;
      normalized.set(String(item.targetSpecies || "").trim(), spread);
    });
  }
  const fallback = normalizeDefaultTrollingSpread(legacySpread);
  if (fallback.length && !normalized.has("")) normalized.set("", fallback);
  return [...normalized.entries()].map(([targetSpecies, spread]) => ({ targetSpecies, spread }));
}

function normalizeBoatLayout(layout = {}) {
  const allowedTypes = new Set([
    "rod-holder", "downrigger", "fish-finder", "live-well", "trolling-motor",
    "chartplotter", "marine-radio", "battery", "tackle", "cooler",
    "landing-net", "seat", "anchor", "custom"
  ]);
  const fallbackName = (type) => type === "custom"
    ? "Custom gear"
    : type.split("-").map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
  const imageValue = (item, key) => String(item?.[key] || "");
  const equipment = [];
  const equipmentById = new Map();
  const rawEquipment = Array.isArray(layout?.equipment) ? layout.equipment : [];
  const usedEquipmentIds = new Set();

  rawEquipment.forEach((item) => {
    if (!item || typeof item !== "object" || equipment.length >= 100) return;
    let id = String(item.id || createId());
    if (usedEquipmentIds.has(id)) id = createId();
    const type = allowedTypes.has(item.type) ? item.type : "custom";
    const name = String(item.name || item.label || fallbackName(type)).trim().slice(0, 50) || fallbackName(type);
    const normalizedItem = {
      id,
      type,
      name,
      image: imageValue(item, "image"),
      previewImage: imageValue(item, "previewImage") || imageValue(item, "image"),
      imagePath: imageValue(item, "imagePath"),
      imageFilename: imageValue(item, "imageFilename"),
      previewPath: imageValue(item, "previewPath"),
      previewFilename: imageValue(item, "previewFilename")
    };
    usedEquipmentIds.add(id);
    equipment.push(normalizedItem);
    equipmentById.set(id, normalizedItem);
  });

  const usedSlots = new Set();
  const usedIds = new Set();
  const items = [];
  const legacyEquipmentByKey = new Map();

  const sourceItems = Array.isArray(layout?.items) ? layout.items : [];
  sourceItems.forEach((item) => {
    if (!item || typeof item !== "object" || items.length >= BOAT_LAYOUT_SLOT_LIMIT) return;
    const slot = Number(item.slot);
    if (!Number.isInteger(slot) || slot < 0 || slot >= BOAT_LAYOUT_SLOT_LIMIT || usedSlots.has(slot)) return;
    let id = String(item.id || createId());
    if (usedIds.has(id)) id = createId();
    const requestedEquipmentId = String(item.equipmentId || "");
    let equipmentId = requestedEquipmentId;

    if (!equipmentById.has(equipmentId)) {
      const type = allowedTypes.has(item.type) ? item.type : "custom";
      const name = String(item.name || item.label || fallbackName(type)).trim().slice(0, 50) || fallbackName(type);
      const legacyKey = requestedEquipmentId ? "" : `${type}:${name.toLowerCase()}`;
      const sharedEquipmentId = legacyKey ? legacyEquipmentByKey.get(legacyKey) : "";

      if (sharedEquipmentId) {
        equipmentId = sharedEquipmentId;
      } else {
        const legacyId = equipmentId || `equipment-${id}`;
        equipmentId = usedEquipmentIds.has(legacyId) ? createId() : legacyId;
        const legacyEquipment = {
          id: equipmentId,
          type,
          name,
          image: imageValue(item, "image"),
          previewImage: imageValue(item, "previewImage") || imageValue(item, "image"),
          imagePath: imageValue(item, "imagePath"),
          imageFilename: imageValue(item, "imageFilename"),
          previewPath: imageValue(item, "previewPath"),
          previewFilename: imageValue(item, "previewFilename")
        };
        usedEquipmentIds.add(equipmentId);
        equipment.push(legacyEquipment);
        equipmentById.set(equipmentId, legacyEquipment);
        if (legacyKey) legacyEquipmentByKey.set(legacyKey, equipmentId);
      }
    }

    usedSlots.add(slot);
    usedIds.add(id);
    items.push({ id, equipmentId, slot });
  });

  return {
    name: String(layout?.name || "").trim().slice(0, 50),
    equipment,
    items
  };
}

function normalizeTackleBoxes(boxes = []) {
  const allowedColors = new Set(["#118753", "#2763a7", "#d88418", "#b84848", "#7c4db2", "#4b5563"]);
  const allowedItemTypes = new Set(["lure", "flasher", "rod", "reel", "combo"]);
  const allowedStyles = new Set(["organizer", "cantilever"]);
  const usedBoxIds = new Set();
  if (!Array.isArray(boxes)) return [];

  return boxes.flatMap((box, index) => {
    if (!box || typeof box !== "object") return [];
    let id = String(box.id || createId());
    if (usedBoxIds.has(id)) id = createId();
    usedBoxIds.add(id);
    const style = allowedStyles.has(box.style) ? box.style : "organizer";
    const layerCount = Math.min(4, Math.max(2, Math.round(Number(box.layerCount) || 3)));
    const compartmentCount = style === "cantilever" ? 6 : 15;
    const refs = [];
    const usedRefs = new Set();
    const rawRefs = Array.isArray(box.itemRefs) ? box.itemRefs : [];
    rawRefs.forEach((ref, refIndex) => {
      const type = String(ref?.type || "");
      const itemId = String(ref?.id || "");
      const key = `${type}:${itemId}`;
      if (!allowedItemTypes.has(type) || !itemId || usedRefs.has(key)) return;
      const legacyLayer = Math.min(layerCount - 1, Math.floor(refIndex / compartmentCount));
      const requestedLayer = ref.layer === undefined || ref.layer === null ? legacyLayer : Number(ref.layer);
      const layer = Math.min(layerCount - 1, Math.max(0, Math.round(Number.isFinite(requestedLayer) ? requestedLayer : legacyLayer)));
      usedRefs.add(key);
      refs.push({ type, id: itemId, layer });
    });
    return [{
      id,
      name: String(box.name || `Tackle Box ${index + 1}`).trim().slice(0, 50) || `Tackle Box ${index + 1}`,
      color: allowedColors.has(box.color) ? box.color : "#118753",
      style,
      layerCount,
      itemRefs: refs
    }];
  });
}

function defaultTrollingSpreadForSpecies(
  targetSpecies = "",
  spreads = state.settings?.defaultTrollingSpreads,
  legacySpread = state.settings?.defaultTrollingSpread
) {
  const normalized = normalizeDefaultTrollingSpreads(spreads, legacySpread);
  const target = String(targetSpecies || "").trim();
  return normalized.find((item) => item.targetSpecies === target)?.spread
    || normalized.find((item) => !item.targetSpecies)?.spread
    || [];
}

function normalizePrivatePhotoLocations(locations = []) {
  if (!Array.isArray(locations)) return [];
  return locations.map((location, index) => {
    const coordinates = isUsableCoordinates(location?.coordinates) ? {
      latitude: Number(location.coordinates.latitude),
      longitude: Number(location.coordinates.longitude)
    } : null;
    const radiusMeters = Math.max(25, Math.min(10000, Number(location?.radiusMeters) || 400));
    return {
      id: String(location?.id || createId()),
      name: String(location?.name || `Home ${index + 1}`).trim() || `Home ${index + 1}`,
      radiusMeters,
      coordinates
    };
  }).filter((location) => isUsableCoordinates(location.coordinates));
}
