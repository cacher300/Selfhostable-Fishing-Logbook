let state = structuredClone(defaults);
const BOAT_LAYOUT_COLUMNS = 6;
const BOAT_LAYOUT_ROWS = 10;
const BOAT_LAYOUT_POINTS = Array.from({ length: BOAT_LAYOUT_ROWS }, (_, row) => {
  const firstColumn = row === 0 ? 2 : row <= 2 ? 1 : 0;
  const lastColumn = row === 0 ? 3 : row <= 2 ? 4 : BOAT_LAYOUT_COLUMNS - 1;
  return Array.from({ length: lastColumn - firstColumn + 1 }, (_, offset) => ({
    row,
    column: firstColumn + offset
  }));
}).flat();
const BOAT_LAYOUT_SLOT_LIMIT = BOAT_LAYOUT_POINTS.length;

function boatLayoutPosition(slot) {
  const point = BOAT_LAYOUT_POINTS[Number(slot)];
  if (!point) return "Deck position";
  const columnNames = ["Port rail", "Port outer", "Port inner", "Starboard inner", "Starboard outer", "Starboard rail"];
  return `${columnNames[point.column]}, row ${point.row + 1}`;
}
let activeTripId = null;
let activeSummaryTripId = null;
let activeTripTimelineFilter = "all";
let activeReportTimelineFilter = "all";
let activeReportTimelineSort = { key: "time", direction: "asc" };
let activeReportTimelineColumns = null;
let activeNotePhotos = [];
let activeTripSort = { key: "date", direction: "desc" };
let activeStatsMethod = "All methods";
let activeStatsDateRange = "all";
let activeStatsSort = "fishPerHour";
let activeStatsMinTrips = 0;
let activeStatsMinHours = 0;
let activeStatsIncludeLost = false;
const activeStatsTableSort = {};
const activeStatsChartMetric = {};
const activeStatsFilters = {
  species: "All species",
  person: "All people",
  location: "All locations",
  launch: "All launches",
  lure: "All lures",
  flasher: "All flashers",
  waterClarity: "All clarity",
  weather: "All weather",
  month: "All months",
  rating: "All ratings"
};
const activePersonalBestsFilters = {
  year: "All years",
  month: "All months",
  rankBy: "weight"
};
let activeMapSpecies = "All species";
let activeMapYear = "All years";
let activeMapYearFilteringHidden = true;
let activeMapIncludeTripMedia = false;
const mapNoaaChartsPreferenceKey = `${storageKey}-map-noaa-charts`;
let activeMapShowNOAACharts = loadMapNoaaChartsPreference();
let activeTripSummaryMapFilter = "All map items";
let activeGalleryCategory = "all";
let brandSpotlightTimer = null;
let fishMap = null;
let fishMapMarkers = null;
let tripSummaryMap = null;
let tripSummaryMapMarkers = null;
let locationPickerMap = null;
let locationPickerMarker = null;
let privatePhotoLocationMap = null;
let privatePhotoLocationLayer = null;
let activePrivatePhotoLocationId = "";
let catchLocationPickerMap = null;
let catchLocationPickerMarker = null;
let activeCatchLocationRow = null;
let activeLocationPickerMode = "location";
let activeLocationPickerLocationId = "";
let activeLocationPickerLaunchId = "";
let activeTripWeatherData = null;
let activeTripWeatherKey = "";
let weatherPreviewTimer = null;
let tripFormInitialSnapshot = "";
let tripFormUserChanged = false;
let activePhotoQueueTarget = null;
let pendingLureImage = null;
let pendingFlasherImage = null;
let pendingReelImage = null;
let pendingRodImage = null;
let activeGearTab = "reels";
const returnToTripDialog = {
  lure: false,
  lureInfo: false,
  flasher: false,
  flasherInfo: false,
  reel: false,
  rod: false,
  queue: false,
  lureImage: false,
  flasherImage: false,
  reelImage: false,
  rodImage: false
};

function loadMapNoaaChartsPreference() {
  try {
    const saved = localStorage.getItem(mapNoaaChartsPreferenceKey);
    return saved === null ? true : saved === "true";
  } catch {
    return true;
  }
}

function saveMapNoaaChartsPreference(showCharts) {
  try {
    localStorage.setItem(mapNoaaChartsPreferenceKey, String(Boolean(showCharts)));
  } catch {
    // The map can still work when browser storage is unavailable.
  }
}

async function loadState() {
  try {
    const response = await fetch("/api/logbook");
    if (response.ok) return normalizeState({ ...structuredClone(defaults), ...(await response.json()) });
  } catch {
    // Opening index.html directly still works as a local fallback.
  }

  try {
    const saved = localStorage.getItem(storageKey);
    if (!saved) return normalizeState(structuredClone(defaults));
    return normalizeState({ ...structuredClone(defaults), ...JSON.parse(saved) });
  } catch {
    return normalizeState(structuredClone(defaults));
  }
}

function normalizeCoordinates(coordinates) {
  if (!coordinates || typeof coordinates !== "object") return null;
  const normalized = {
    latitude: Number(coordinates.latitude),
    longitude: Number(coordinates.longitude)
  };
  return isUsableCoordinates(normalized) ? normalized : null;
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

  ["species", "methods", "lureTypes", "flasherTypes", "waterClarities", "weatherTypes", "reelStyles", "rodTypes", "lineTypes", "lureBladeTypes", "lureSpoonSizes", "trollingPresentations", "trollingDirections", "setupLineSides", "lures", "flashers", "reels", "rods", "rodReelCombos", "people", "locations", "trips"].forEach((key) => {
    if (!Array.isArray(normalized[key])) normalized[key] = structuredClone(defaults[key]);
  });
  ["species", "methods", "lureTypes", "flasherTypes", "waterClarities", "weatherTypes", "reelStyles", "rodTypes", "lineTypes", "lureBladeTypes", "lureSpoonSizes", "trollingDirections"].forEach((key) => {
    normalized[key] = normalizeTextOptions(normalized[key], defaults[key]);
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
      catches: (trip.catches || []).map((catchItem) => ({
        rodId: "",
        ...catchItem,
        gpsSpeed: catchItem.gpsSpeed ?? catchItem.speed ?? "",
        ballSpeed: catchItem.ballSpeed || "",
        presentation: migrateTrollingPresentationValue(catchItem.presentation)
      })),
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
      launchId: launch?.id || trip.launchId || ""
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

function themePreference() {
  return state.settings?.theme === "dark" ? "dark" : "light";
}

function timeFormatPreference() {
  return state.settings?.timeFormat === "12" ? "12" : "24";
}

function normalizeUnits(units = {}) {
  const normalized = { ...defaultUnits };
  Object.keys(defaultUnits).forEach((key) => {
    const allowed = unitOptions[key]?.map((item) => item.value) || [];
    const value = units && typeof units === "object" ? units[key] : "";
    if (allowed.includes(value)) normalized[key] = value;
  });
  return normalized;
}

function unitPreference(key) {
  return normalizeUnits(state.settings?.units)[key] || defaultUnits[key] || "";
}

function unitSymbol(key) {
  const unit = unitPreference(key);
  if (unit === "C" || unit === "F") return `\u00b0${unit}`;
  return unit;
}

function convertUnitValue(value, fromUnit, toUnit) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  if (fromUnit === toUnit) return number;
  if (fromUnit === "C" && toUnit === "F") return (number * 9 / 5) + 32;
  if (fromUnit === "F" && toUnit === "C") return (number - 32) * 5 / 9;
  const conversions = [
    { units: { kph: 1, mph: 1.609344, kn: 1.852 } },
    { units: { m: 1, ft: 0.3048, km: 1000, mi: 1609.344, in: 0.0254, mm: 0.001, cm: 0.01 } },
    { units: { kg: 1, lb: 0.45359237 } },
    { units: { hPa: 1, kPa: 10, inHg: 33.8638866667, mmHg: 1.33322387415 } }
  ];
  const conversion = conversions.find((item) => fromUnit in item.units && toUnit in item.units);
  if (conversion) return number * conversion.units[fromUnit] / conversion.units[toUnit];
  return number;
}

const measurementUnitAliases = {
  feet: "ft", foot: "ft", ft: "ft",
  meter: "m", meters: "m", metre: "m", metres: "m", m: "m",
  kilometer: "km", kilometers: "km", kilometre: "km", kilometres: "km", km: "km",
  mile: "mi", miles: "mi", mi: "mi",
  inch: "in", inches: "in", in: "in",
  millimeter: "mm", millimeters: "mm", millimetre: "mm", millimetres: "mm", mm: "mm",
  centimeter: "cm", centimeters: "cm", centimetre: "cm", centimetres: "cm", cm: "cm",
  pound: "lb", pounds: "lb", lbs: "lb", lb: "lb",
  kilogram: "kg", kilograms: "kg", kg: "kg",
  c: "C", f: "F", kph: "kph", mph: "mph", kn: "kn",
  hpa: "hPa", kpa: "kPa", inhg: "inHg", mmhg: "mmHg"
};

function explicitMeasurementUnit(suffix) {
  return measurementUnitAliases[String(suffix || "").trim().replace(/^°/, "").toLowerCase()] || "";
}

function convertedMeasurementText(value, fromUnit, toUnit) {
  if (value === null || value === undefined || value === "" || fromUnit === toUnit) return value;
  const text = String(value).trim();
  const range = text.match(/^(-?(?:\d+(?:\.\d+)?|\.\d+))\s*-\s*(-?(?:\d+(?:\.\d+)?|\.\d+))(?:\s*([a-zA-Z°]+))?$/);
  if (range) {
    const explicitUnit = explicitMeasurementUnit(range[3]);
    const first = convertUnitValue(range[1], explicitUnit || fromUnit, toUnit);
    const second = convertUnitValue(range[2], explicitUnit || fromUnit, toUnit);
    if (first === null || second === null) return value;
    const suffix = explicitUnit ? ` ${unitSymbolForValue(toUnit)}` : (range[3] ? ` ${range[3]}` : "");
    return `${trimConvertedMeasurement(first)}-${trimConvertedMeasurement(second)}${suffix}`;
  }
  const match = text.match(/^(-?(?:\d+(?:\.\d+)?|\.\d+))(?:\s*([a-zA-Z°]+))?$/);
  if (!match) return value;
  const explicitUnit = explicitMeasurementUnit(match[2]);
  const converted = convertUnitValue(match[1], explicitUnit || fromUnit, toUnit);
  if (converted === null) return value;
  const number = trimConvertedMeasurement(converted);
  if (explicitUnit) return `${number} ${unitSymbolForValue(toUnit)}`;
  return match[2] ? `${number} ${match[2]}` : number;
}

function unitSymbolForValue(unit) {
  return unit === "C" || unit === "F" ? `°${unit}` : unit;
}

function trimConvertedMeasurement(value) {
  return String(Math.round(Number(value) * 1000) / 1000);
}

function displayStoredMeasurement(value, key) {
  const text = String(value || "").trim();
  if (!text) return "";
  const range = text.match(/^-?(?:\d+(?:\.\d+)?|\.\d+)\s*-\s*-?(?:\d+(?:\.\d+)?|\.\d+)(?:\s*([a-zA-Z°]+))?$/);
  if (range) {
    if (explicitMeasurementUnit(range[1])) return text;
    return String(range[1] || "").toUpperCase() === "FOW" ? `${text} (${unitSymbol(key)})` : `${text} ${unitSymbol(key)}`;
  }
  const match = text.match(/^(-?(?:\d+(?:\.\d+)?|\.\d+))(?:\s*([a-zA-Z°]+))?$/);
  if (!match) return text;
  if (explicitMeasurementUnit(match[2])) return text;
  if (String(match[2] || "").toUpperCase() === "FOW") return `${text} (${unitSymbol(key)})`;
  return `${text} ${unitSymbol(key)}`;
}

function convertStoredMeasurements(previousUnits, nextUnits) {
  const tripMeasurements = [
    ["waterTemp", "waterTemperature"],
    ["waveHeight", "waveHeight"],
    ["structure", "depth"]
  ];
  const catchMeasurements = [
    ["length", "fishLength"],
    ["weight", "fishWeight"],
    ["waterDepth", "depth"],
    ["depthDown", "depth"],
    ["fowCaught", "depth"],
    ["gpsSpeed", "speed"],
    ["ballSpeed", "speed"],
    ["ballDepth", "depth"],
    ["lineBehindBoard", "depth"],
    ["estimatedLureDepth", "depth"],
    ["lineOut", "depth"],
    ["estimatedDepth", "depth"]
  ];
  const convertRecord = (record, measurements) => {
    if (!record || typeof record !== "object") return;
    measurements.forEach(([field, unitKey]) => {
      const fromUnit = previousUnits[unitKey];
      const toUnit = nextUnits[unitKey];
      if (fromUnit !== toUnit) record[field] = convertedMeasurementText(record[field], fromUnit, toUnit);
    });
  };

  state.trips.forEach((trip) => {
    convertRecord(trip, tripMeasurements);
    if (previousUnits.waterTemperature !== nextUnits.waterTemperature) {
      (Array.isArray(trip.probeTemperatureProfile) ? trip.probeTemperatureProfile : []).forEach((entry) => {
        if (!entry || typeof entry !== "object") return;
        entry.temperature = convertedMeasurementText(entry.temperature, previousUnits.waterTemperature, nextUnits.waterTemperature);
      });
    }
    if (previousUnits.windSpeed !== nextUnits.windSpeed && trip.wind) {
      trip.wind = String(trip.wind).replace(/(-?(?:\d+(?:\.\d+)?|\.\d+))\s*(kph|mph|kn)\b/gi, (match, number, sourceUnit) => {
        const converted = convertUnitValue(number, explicitMeasurementUnit(sourceUnit), nextUnits.windSpeed);
        return converted === null ? match : `${trimConvertedMeasurement(converted)} ${unitSymbolForValue(nextUnits.windSpeed)}`;
      });
    }
    (trip.catches || []).forEach((catchItem) => convertRecord(catchItem, catchMeasurements));
    (trip.lostFish || []).forEach((fishItem) => convertRecord(fishItem, catchMeasurements));
    // Older imports can put the same measurements on a setup line.
    (trip.gearUsed || []).forEach((gearItem) => convertRecord(gearItem, catchMeasurements));
  });
  (state.reels || []).forEach((reel) => {
    convertRecord(reel, [["maxDrag", "fishWeight"]]);
    (reel.lineHistory || []).forEach((line) => convertRecord(line, [["weight", "fishWeight"]]));
  });
}

function formatUnitValue(value, key, fromUnit, options = {}) {
  const toUnit = unitPreference(key);
  const converted = convertUnitValue(value, fromUnit, toUnit);
  if (converted === null) return "Not logged";
  const decimals = options.decimals ?? (Math.abs(converted) < 10 && !Number.isInteger(converted) ? 1 : 0);
  return `${trimNumber(Math.round(converted * (10 ** decimals)) / (10 ** decimals))} ${unitSymbol(key)}`;
}

function formatDisplayTime(value, format = timeFormatPreference()) {
  const match = String(value || "").match(/(\d{1,2}):(\d{2})/);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return "";
  if (format === "24") return `${hour}:${String(minute).padStart(2, "0")}`;

  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function formatDisplayTimeRange(startTime, endTime, format = timeFormatPreference()) {
  const start = formatDisplayTime(startTime, format);
  const end = formatDisplayTime(endTime, format);
  return [start, end].filter(Boolean).join("-");
}

function normalizeChopRanges(ranges = []) {
  const source = Array.isArray(ranges) && ranges.length ? ranges : defaultChopRanges;
  const normalized = source
    .map((range, index) => {
      const fallback = defaultChopRanges[index] || defaultChopRanges.at(-1);
      const label = String(range?.label || fallback.label || "").trim();
      const maxFeet = range?.maxFeet === null || range?.maxFeet === ""
        ? null
        : Number(range?.maxFeet);
      return {
        id: String(range?.id || fallback.id || `chop-${index + 1}`),
        label: label || fallback.label,
        maxFeet: Number.isFinite(maxFeet) ? Math.max(0, Math.round(maxFeet * 100) / 100) : null
      };
    })
    .filter((range) => range.label);
  if (!normalized.length) return structuredClone(defaultChopRanges);
  if (!normalized.some((range) => range.maxFeet === null)) {
    normalized.push({ id: "rough", label: "rough", maxFeet: null });
  }
  return normalized;
}

async function saveState() {
  state = normalizeState(state);
  localStorage.setItem(storageKey, JSON.stringify(state));

  if (location.protocol === "file:") return;

  const response = await protectedFetch("/api/logbook", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state)
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Could not save logbook database");
  }
}
