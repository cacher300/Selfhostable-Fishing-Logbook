let state = structuredClone(defaults);
let activeTripId = null;
let activeSummaryTripId = null;
let activeTripTimelineFilter = "all";
let activeNotePhotos = [];
let activeTripSort = { key: "date", direction: "desc" };
let activeStatsMethod = "All methods";
let activeStatsDateRange = "all";
let activeStatsSort = "fishPerHour";
let activeStatsMinTrips = 0;
let activeStatsMinHours = 0;
let activeStatsIncludeLost = false;
const activeStatsTableSort = {};
const activeStatsFilters = {
  species: "All species",
  person: "All people",
  location: "All locations",
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

  ["species", "methods", "lureTypes", "flasherTypes", "waterClarities", "weatherTypes", "reelStyles", "rodTypes", "lineTypes", "trollingPresentations", "trollingDirections", "setupLineSides", "lures", "flashers", "reels", "rods", "rodReelCombos", "people", "locations", "trips"].forEach((key) => {
    if (!Array.isArray(normalized[key])) normalized[key] = structuredClone(defaults[key]);
  });
  ["species", "methods", "lureTypes", "flasherTypes", "waterClarities", "weatherTypes", "reelStyles", "rodTypes", "lineTypes", "trollingDirections"].forEach((key) => {
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
      gearUsed: (trip.gearUsed || []).map((gearItem) => ({
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
        presentation: migrateTrollingPresentationValue(catchItem.presentation)
      })),
      lostFish: (trip.lostFish || []).map((fishItem) => ({
        rodId: "",
        ...fishItem,
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
  normalized.units = normalizeUnits(normalized.units);
  normalized.chopRanges = normalizeChopRanges(normalized.chopRanges);
  normalized.privatePhotoLocations = normalizePrivatePhotoLocations(normalized.privatePhotoLocations);
  return normalized;
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
  if (fromUnit === "mph" && toUnit === "kph") return number * 1.609344;
  if (fromUnit === "mph" && toUnit === "kn") return number * 0.868976;
  if (fromUnit === "kph" && toUnit === "mph") return number / 1.609344;
  if (fromUnit === "kph" && toUnit === "kn") return number * 0.539957;
  if (fromUnit === "m" && toUnit === "ft") return number * 3.28084;
  if (fromUnit === "ft" && toUnit === "m") return number / 3.28084;
  if (fromUnit === "m" && toUnit === "km") return number / 1000;
  if (fromUnit === "m" && toUnit === "mi") return number / 1609.344;
  if (fromUnit === "km" && toUnit === "mi") return number * 0.621371;
  if (fromUnit === "mi" && toUnit === "km") return number / 0.621371;
  if (fromUnit === "hPa" && toUnit === "kPa") return number / 10;
  if (fromUnit === "hPa" && toUnit === "inHg") return number * 0.0295299830714;
  if (fromUnit === "hPa" && toUnit === "mmHg") return number * 0.750061683;
  if (fromUnit === "kPa" && toUnit === "hPa") return number * 10;
  if (fromUnit === "inHg" && toUnit === "hPa") return number / 0.0295299830714;
  if (fromUnit === "mmHg" && toUnit === "hPa") return number / 0.750061683;
  if (fromUnit === "in" && toUnit === "mm") return number * 25.4;
  if (fromUnit === "mm" && toUnit === "in") return number / 25.4;
  return number;
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
