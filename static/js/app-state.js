const storageKey = "fishing-logbook-v1";
let csrfTokenPromise;

async function protectedFetch(url, options = {}, retry = true) {
  const method = String(options.method || "GET").toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return fetch(url, options);

  if (!csrfTokenPromise) {
    csrfTokenPromise = fetch("/api/csrf-token")
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not establish request protection");
        return (await response.json()).csrfToken;
      })
      .catch((error) => {
        csrfTokenPromise = null;
        throw error;
      });
  }

  const headers = new Headers(options.headers || {});
  headers.set("X-CSRF-Token", await csrfTokenPromise);
  const response = await fetch(url, { ...options, headers });
  if (response.status === 403 && retry) {
    csrfTokenPromise = null;
    return protectedFetch(url, options, false);
  }
  return response;
}

const defaultWaterClarityOptions = [
  "Crystal Clear",
  "Clear",
  "Slightly Stained",
  "Stained",
  "Muddy",
  "Algae Bloom"
];

const defaultWeatherOptions = [
  "Sunny",
  "Partly Cloudy",
  "Overcast",
  "Light Rain",
  "Heavy Rain",
  "Thunderstorms",
  "Fog",
  "Snow",
  "Mixed"
];

const defaultReelStyleOptions = ["Baitcaster", "Spinning", "Centerpin", "Fly"];
const defaultRodTypeOptions = ["Baitcaster", "Spinning", "Downrigging", "Dipsey", "Centerpin", "Fly", "Tipup"];
const defaultLineTypeOptions = ["Braid", "Mono", "Fluorocarbon", "Leadcore", "Wire", "Copper", "Other"];
const defaultTrollingPresentationOptions = [
  { value: "Outside Board", label: "Outside Board" },
  { value: "Inside Board", label: "Inside Board" },
  { value: "High Diver", label: "High Diver" },
  { value: "Low Diver", label: "Low Diver" },
  { value: "Downrigger", label: "Downrigger" },
  { value: "Cheater", label: "Cheater" },
  { value: "Chute Rod", label: "Chute Rod" }
];
const defaultTrollingDirectionOptions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const defaultSetupLineSideOptions = [
  { value: "Port", label: "Port" },
  { value: "Center", label: "Center" },
  { value: "Starboard", label: "Starboard" }
];

function migrateTrollingPresentationValue(value) {
  const legacyValues = {
    downrigger: "Downrigger",
    cheater: "Cheater",
    flatline: "Chute Rod",
    "flatline-leadcore": "Outside Board",
    "dipsey-diver": "High Diver"
  };
  return legacyValues[String(value || "")] || String(value || "");
}

function migrateSetupLineSideValue(value) {
  const legacyValues = { port: "Port", center: "Center", starboard: "Starboard" };
  return legacyValues[String(value || "")] || String(value || "");
}
const defaultChopRanges = [
  { id: "calm", label: "Calm", maxFeet: 0.5 },
  { id: "light", label: "Light Chop", maxFeet: 1 },
  { id: "moderate", label: "Moderate Chop", maxFeet: 1.5 },
  { id: "very-choppy", label: "Very Choppy", maxFeet: 2 },
  { id: "rough", label: "Rough", maxFeet: null }
];
const defaultUnits = {
  depth: "ft",
  distance: "km",
  speed: "mph",
  windSpeed: "kph",
  pressure: "hPa",
  airTemperature: "C",
  waterTemperature: "F",
  precipitation: "mm",
  waveHeight: "ft",
  fishLength: "in",
  fishWeight: "lb"
};
const unitOptions = {
  depth: [
    { value: "m", label: "Meters (m)" },
    { value: "ft", label: "Feet (ft)" }
  ],
  distance: [
    { value: "km", label: "Kilometers (km)" },
    { value: "mi", label: "Miles (mi)" }
  ],
  speed: [
    { value: "kph", label: "Kilometers/hour (kph)" },
    { value: "mph", label: "Miles/hour (mph)" },
    { value: "kn", label: "Knots (kn)" }
  ],
  windSpeed: [
    { value: "kph", label: "Kilometers/hour (kph)" },
    { value: "mph", label: "Miles/hour (mph)" },
    { value: "kn", label: "Knots (kn)" }
  ],
  pressure: [
    { value: "hPa", label: "Hectopascals (hPa)" },
    { value: "kPa", label: "Kilopascals (kPa)" },
    { value: "inHg", label: "Inches mercury (inHg)" },
    { value: "mmHg", label: "Millimeters mercury (mmHg)" }
  ],
  airTemperature: [
    { value: "C", label: "Celsius (C)" },
    { value: "F", label: "Fahrenheit (F)" }
  ],
  waterTemperature: [
    { value: "F", label: "Fahrenheit (F)" },
    { value: "C", label: "Celsius (C)" }
  ],
  precipitation: [
    { value: "mm", label: "Millimeters (mm)" },
    { value: "in", label: "Inches (in)" }
  ],
  waveHeight: [
    { value: "m", label: "Meters (m)" },
    { value: "ft", label: "Feet (ft)" }
  ],
  fishLength: [
    { value: "in", label: "Inches (in)" },
    { value: "cm", label: "Centimeters (cm)" }
  ],
  fishWeight: [
    { value: "lb", label: "Pounds (lb)" },
    { value: "kg", label: "Kilograms (kg)" }
  ]
};

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();

  const fallbackId = "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (char) => {
    const randomValue = globalThis.crypto?.getRandomValues
      ? globalThis.crypto.getRandomValues(new Uint8Array(1))[0]
      : Math.floor(Math.random() * 256);
    return (Number(char) ^ (randomValue & (15 >> (Number(char) / 4)))).toString(16);
  });

  return fallbackId;
}

const defaults = {
  species: [
    "Lake Trout",
    "Largemouth Bass",
    "Smallmouth Bass",
    "Chinook Salmon",
    "Coho Salmon",
    "Rainbow Trout",
    "Brown Trout",
    "Walleye",
    "Northern Pike",
    "Muskie",
    "Rock Bass",
    "Perch",
    "Crappie",
    "Bluegill"
  ],
  methods: ["Trolling", "Casting", "Jigging", "Fly Fishing", "Bait Fishing", "Ice Fishing", "Shore Fishing"],
  lureTypes: ["Spoon", "Crankbait", "Spinner", "Jig", "Dropshot", "Soft Plastic", "Fly", "Plug", "Swimbait", "Flasher/Fly", "Jerkbait", "Topwater", "Other"],
  flasherTypes: ["Paddle", "Dodger", "Spin Doctor", "Meat Rig", "Attractor", "Other"],
  waterClarities: structuredClone(defaultWaterClarityOptions),
  weatherTypes: structuredClone(defaultWeatherOptions),
  reelStyles: structuredClone(defaultReelStyleOptions),
  rodTypes: structuredClone(defaultRodTypeOptions),
  lineTypes: structuredClone(defaultLineTypeOptions),
  trollingPresentations: structuredClone(defaultTrollingPresentationOptions),
  trollingDirections: structuredClone(defaultTrollingDirectionOptions),
  setupLineSides: structuredClone(defaultSetupLineSideOptions),
  lures: [
    {
      id: createId(),
      name: "Blue/Silver Spoon",
      type: "Spoon",
      brand: "",
      color: "Blue/Silver",
      notes: "Starter lure. Replace with your real lure photo when ready.",
      image: ""
    }
  ],
  flashers: [],
  reels: [],
  rods: [],
  rodReelCombos: [],
  settings: {
    timeFormat: "24",
    units: structuredClone(defaultUnits),
    chopRanges: structuredClone(defaultChopRanges)
  },
  people: [],
  locations: [],
  trips: [
    {
      id: createId(),
      title: "Morning salmon troll",
      date: "2026-04-28",
      location: "Lake Ontario",
      hours: 3.5,
      targetSpecies: "Chinook Salmon",
      method: "Trolling",
      waterTemp: "47 F",
      waterClarity: "Clear",
      weather: "Overcast",
      wind: "W 13 kph",
      structure: "24-37 m, bait pods",
      notes: "Best action near first light. Marked bait deep.",
      catches: []
    }
  ]
};

let state = structuredClone(defaults);
let activeTripId = null;
let activeSummaryTripId = null;
let activeTripTimelineFilter = "all";
let activeNotePhotos = [];
let activeTripSort = { key: "date", direction: "desc" };
let activeStatsMethod = "All methods";
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
let activeMapSpecies = "All map items";
let activeTripSummaryMapFilter = "All map items";
let activeGalleryCategory = "all";
let fishMap = null;
let fishMapMarkers = null;
let tripSummaryMap = null;
let tripSummaryMapMarkers = null;
let locationPickerMap = null;
let locationPickerMarker = null;
let activeLocationPickerMode = "location";
let activeLocationPickerLocationId = "";
let activeLocationPickerLaunchId = "";
let activeTripWeatherData = null;
let activeTripWeatherKey = "";
let weatherPreviewTimer = null;
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

const els = {
  brandSpotlight: document.querySelector("#brandSpotlight"),
  personOptions: document.querySelector("#personOptions"),
  statTrips: document.querySelector("#statTrips"),
  statFish: document.querySelector("#statFish"),
  statHours: document.querySelector("#statHours"),
  statWaterbodies: document.querySelector("#statWaterbodies"),
  statCatchRate: document.querySelector("#statCatchRate"),
  statPoundsPerHour: document.querySelector("#statPoundsPerHour"),
  statDaysSinceTrip: document.querySelector("#statDaysSinceTrip"),
  speciesBars: document.querySelector("#speciesBars"),
  lureBars: document.querySelector("#lureBars"),
  tripTable: document.querySelector("#tripTable"),
  tripControls: document.querySelector("#tripControls"),
  tripListPanel: document.querySelector("#tripListPanel"),
  advancedStatsPanel: document.querySelector("#advancedStatsPanel"),
  mapPanel: document.querySelector("#mapPanel"),
  fishMap: document.querySelector("#fishMap"),
  mapSummary: document.querySelector("#mapSummary"),
  mapCatchList: document.querySelector("#mapCatchList"),
  mapSpeciesFilter: document.querySelector("#mapSpeciesFilter"),
  statsMethodFilter: document.querySelector("#statsMethodFilter"),
  statsSortFilter: document.querySelector("#statsSortFilter"),
  statsMinTripsInput: document.querySelector("#statsMinTripsInput"),
  statsMinHoursInput: document.querySelector("#statsMinHoursInput"),
  statsIncludeLostToggle: document.querySelector("#statsIncludeLostToggle"),
  statsSpeciesFilter: document.querySelector("#statsSpeciesFilter"),
  statsPersonFilter: document.querySelector("#statsPersonFilter"),
  statsLocationFilter: document.querySelector("#statsLocationFilter"),
  statsLureFilter: document.querySelector("#statsLureFilter"),
  statsFlasherFilter: document.querySelector("#statsFlasherFilter"),
  statsWaterClarityFilter: document.querySelector("#statsWaterClarityFilter"),
  statsWeatherFilter: document.querySelector("#statsWeatherFilter"),
  statsMonthFilter: document.querySelector("#statsMonthFilter"),
  statsRatingFilter: document.querySelector("#statsRatingFilter"),
  advancedMetricGrid: document.querySelector("#advancedMetricGrid"),
  efficiencyLeadersGrid: document.querySelector("#efficiencyLeadersGrid"),
  outcomeStatsTable: document.querySelector("#outcomeStatsTable"),
  lureStatsTable: document.querySelector("#lureStatsTable"),
  lureShareStatsTable: document.querySelector("#lureShareStatsTable"),
  lureSpreadStatsTable: document.querySelector("#lureSpreadStatsTable"),
  lureTypeStatsTable: document.querySelector("#lureTypeStatsTable"),
  lureColorStatsTable: document.querySelector("#lureColorStatsTable"),
  flasherStatsTable: document.querySelector("#flasherStatsTable"),
  comboStatsTable: document.querySelector("#comboStatsTable"),
  speciesStatsTable: document.querySelector("#speciesStatsTable"),
  lostFishStatsTable: document.querySelector("#lostFishStatsTable"),
  bestPatternStatsTable: document.querySelector("#bestPatternStatsTable"),
  timeOfDayStatsTable: document.querySelector("#timeOfDayStatsTable"),
  releaseStatsTable: document.querySelector("#releaseStatsTable"),
  trollingHighlightsTable: document.querySelector("#trollingHighlightsTable"),
  directionStatsTable: document.querySelector("#directionStatsTable"),
  lineSideStatsTable: document.querySelector("#lineSideStatsTable"),
  trollingSetupStatsTable: document.querySelector("#trollingSetupStatsTable"),
  downriggerStatsTable: document.querySelector("#downriggerStatsTable"),
  fowRangeStatsTable: document.querySelector("#fowRangeStatsTable"),
  fowStatsTable: document.querySelector("#fowStatsTable"),
  depthDownStatsTable: document.querySelector("#depthDownStatsTable"),
  locationStatsTable: document.querySelector("#locationStatsTable"),
  methodStatsTable: document.querySelector("#methodStatsTable"),
  waterClarityStatsTable: document.querySelector("#waterClarityStatsTable"),
  weatherStatsTable: document.querySelector("#weatherStatsTable"),
  windDirectionStatsTable: document.querySelector("#windDirectionStatsTable"),
  windSpeedStatsTable: document.querySelector("#windSpeedStatsTable"),
  pressureStatsTable: document.querySelector("#pressureStatsTable"),
  cloudCoverStatsTable: document.querySelector("#cloudCoverStatsTable"),
  airTempStatsTable: document.querySelector("#airTempStatsTable"),
  sunshineStatsTable: document.querySelector("#sunshineStatsTable"),
  weatherTrendStatsTable: document.querySelector("#weatherTrendStatsTable"),
  frontTagStatsTable: document.querySelector("#frontTagStatsTable"),
  biteWindowStatsTable: document.querySelector("#biteWindowStatsTable"),
  moonPhaseStatsTable: document.querySelector("#moonPhaseStatsTable"),
  moonWindowStatsTable: document.querySelector("#moonWindowStatsTable"),
  intentStatsTable: document.querySelector("#intentStatsTable"),
  ratingStatsTable: document.querySelector("#ratingStatsTable"),
  personStatsTable: document.querySelector("#personStatsTable"),
  monthStatsTable: document.querySelector("#monthStatsTable"),
  statsDiagnosticsTable: document.querySelector("#statsDiagnosticsTable"),
  emptyState: document.querySelector("#emptyState"),
  searchInput: document.querySelector("#searchInput"),
  targetFilter: document.querySelector("#targetFilter"),
  methodFilter: document.querySelector("#methodFilter"),
  yearFilter: document.querySelector("#yearFilter"),
  sortSelect: document.querySelector("#sortSelect"),
  newTripButton: document.querySelector("#newTripButton"),
  tripsViewButton: document.querySelector("#tripsViewButton"),
  statsViewButton: document.querySelector("#statsViewButton"),
  mapViewButton: document.querySelector("#mapViewButton"),
  gearViewButton: document.querySelector("#gearViewButton"),
  galleryViewButton: document.querySelector("#galleryViewButton"),
  settingsViewButton: document.querySelector("#settingsViewButton"),
  newLibraryLureButton: document.querySelector("#newLibraryLureButton"),
  newLibraryFlasherButton: document.querySelector("#newLibraryFlasherButton"),
  newLibraryReelButton: document.querySelector("#newLibraryReelButton"),
  newLibraryRodButton: document.querySelector("#newLibraryRodButton"),
  newLibraryComboButton: document.querySelector("#newLibraryComboButton"),
  photoQueueButton: document.querySelector("#photoQueueButton"),
  photoQueueDialog: document.querySelector("#photoQueueDialog"),
  photoQueueInput: document.querySelector("#photoQueueInput"),
  photoQueueGrid: document.querySelector("#photoQueueGrid"),
  photoQueueStatus: document.querySelector("#photoQueueStatus"),
  exportButton: document.querySelector("#exportButton"),
  importInput: document.querySelector("#importInput"),
  tripSummaryDialog: document.querySelector("#tripSummaryDialog"),
  tripSummaryTitle: document.querySelector("#tripSummaryTitle"),
  tripSummaryBody: document.querySelector("#tripSummaryBody"),
  summaryEditTripButton: document.querySelector("#summaryEditTripButton"),
  summaryDeleteTripButton: document.querySelector("#summaryDeleteTripButton"),
  tripDialog: document.querySelector("#tripDialog"),
  tripForm: document.querySelector("#tripForm"),
  tripFormMessage: document.querySelector("#tripFormMessage"),
  saveTripButton: document.querySelector("#saveTripButton"),
  tripDialogTitle: document.querySelector("#tripDialogTitle"),
  tripId: document.querySelector("#tripId"),
  tripRating: document.querySelector("#tripRating"),
  tripRatingLabel: document.querySelector("#tripRatingLabel"),
  tripLocation: document.querySelector("#tripLocation"),
  addLocationButton: document.querySelector("#addLocationButton"),
  tripLaunch: document.querySelector("#tripLaunch"),
  addLaunchButton: document.querySelector("#addLaunchButton"),
  locationManagerList: document.querySelector("#locationManagerList"),
  weatherFetchStatus: document.querySelector("#weatherFetchStatus"),
  resyncWeatherButton: document.querySelector("#resyncWeatherButton"),
  waveHeight: document.querySelector("#waveHeight"),
  waveChopDisplay: document.querySelector("#waveChopDisplay"),
  settingsPanel: document.querySelector("#settingsPanel"),
  timeFormatSelect: document.querySelector("#timeFormatSelect"),
  unitSettingsFields: document.querySelector("#unitSettingsFields"),
  saveUnitSettingsButton: document.querySelector("#saveUnitSettingsButton"),
  predefinedFieldSettings: document.querySelector("#predefinedFieldSettings"),
  chopRangeRows: document.querySelector("#chopRangeRows"),
  saveChopRangesButton: document.querySelector("#saveChopRangesButton"),
  settingsAddLocationButton: document.querySelector("#settingsAddLocationButton"),
  locationDialog: document.querySelector("#locationDialog"),
  locationForm: document.querySelector("#locationForm"),
  locationDialogTitle: document.querySelector("#locationDialogTitle"),
  locationPickerMap: document.querySelector("#locationPickerMap"),
  locationParentRow: document.querySelector("#locationParentRow"),
  locationParentName: document.querySelector("#locationParentName"),
  locationName: document.querySelector("#locationName"),
  locationLatitude: document.querySelector("#locationLatitude"),
  locationLongitude: document.querySelector("#locationLongitude"),
  deleteTripButton: document.querySelector("#deleteTripButton"),
  deleteLureButton: document.querySelector("#deleteLureButton"),
  deleteFlasherButton: document.querySelector("#deleteFlasherButton"),
  deleteReelButton: document.querySelector("#deleteReelButton"),
  deleteRodButton: document.querySelector("#deleteRodButton"),
  deleteComboButton: document.querySelector("#deleteComboButton"),
  addCatchButton: document.querySelector("#addCatchButton"),
  addLostFishButton: document.querySelector("#addLostFishButton"),
  addTripGearButton: document.querySelector("#addTripGearButton"),
  addPersonButton: document.querySelector("#addPersonButton"),
  notePhotoInput: document.querySelector("#notePhotoInput"),
  notePhotoGrid: document.querySelector("#notePhotoGrid"),
  catchRows: document.querySelector("#catchRows"),
  lostFishRows: document.querySelector("#lostFishRows"),
  tripGearRows: document.querySelector("#tripGearRows"),
  personRows: document.querySelector("#personRows"),
  lureDialog: document.querySelector("#lureDialog"),
  lureForm: document.querySelector("#lureForm"),
  lureInfoDialog: document.querySelector("#lureInfoDialog"),
  lureInfoContent: document.querySelector("#lureInfoContent"),
  editLureFromInfoButton: document.querySelector("#editLureFromInfoButton"),
  flasherDialog: document.querySelector("#flasherDialog"),
  flasherForm: document.querySelector("#flasherForm"),
  flasherInfoDialog: document.querySelector("#flasherInfoDialog"),
  flasherInfoContent: document.querySelector("#flasherInfoContent"),
  editFlasherFromInfoButton: document.querySelector("#editFlasherFromInfoButton"),
  reelDialog: document.querySelector("#reelDialog"),
  reelForm: document.querySelector("#reelForm"),
  rodDialog: document.querySelector("#rodDialog"),
  rodForm: document.querySelector("#rodForm"),
  comboDialog: document.querySelector("#comboDialog"),
  comboForm: document.querySelector("#comboForm"),
  gearPanel: document.querySelector("#gearPanel"),
  galleryPanel: document.querySelector("#galleryPanel"),
  galleryCategoryFilter: document.querySelector("#galleryCategoryFilter"),
  galleryStatus: document.querySelector("#galleryStatus"),
  galleryGrid: document.querySelector("#galleryGrid"),
  orphanMediaStatus: document.querySelector("#orphanMediaStatus"),
  orphanMediaGrid: document.querySelector("#orphanMediaGrid"),
  gearTabs: document.querySelector("#gearTabs"),
  gearTabPanels: document.querySelector("#gearTabPanels"),
  reelInventoryTable: document.querySelector("#reelInventoryTable"),
  rodInventoryTable: document.querySelector("#rodInventoryTable"),
  comboInventoryTable: document.querySelector("#comboInventoryTable"),
  lineTrackerTable: document.querySelector("#lineTrackerTable"),
  baitInventoryTable: document.querySelector("#baitInventoryTable"),
  flasherInventoryTable: document.querySelector("#flasherInventoryTable"),
  lureLibraryGrid: document.querySelector("#lureLibraryGrid"),
  flasherLibraryGrid: document.querySelector("#flasherLibraryGrid")
};

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
        ...catchItem,
        presentation: migrateTrollingPresentationValue(catchItem.presentation)
      })),
      lostFish: (trip.lostFish || []).map((fishItem) => ({
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
  const source = Array.isArray(options) ? options : fallback;
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
  normalized.timeFormat = normalized.timeFormat === "12" ? "12" : "24";
  normalized.units = normalizeUnits(normalized.units);
  normalized.chopRanges = normalizeChopRanges(normalized.chopRanges);
  return normalized;
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

function previewImage(item) {
  return item?.previewImage || item?.previewUrl || item?.image || item?.url || "";
}

function isVideoMedia(item) {
  return item?.mediaType === "video" || item?.mimeType?.startsWith?.("video/");
}

function originalMediaUrl(item) {
  return item?.url || item?.image || previewImage(item);
}

function mediaDownloadName(item) {
  const base = String(item?.name || item?.filename || item?.caption || "original-photo")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]+/g, "-")
    .replace(/\s+/g, " ");
  const normalized = base || "original-photo";
  const url = String(originalMediaUrl(item) || "");
  const extensionMatch = url.match(/\.([a-zA-Z0-9]{2,5})(?:[?#]|$)/);
  const extension = extensionMatch ? `.${extensionMatch[1].toLowerCase()}` : ".jpg";
  return /\.[a-zA-Z0-9]{2,5}$/.test(normalized) ? normalized : `${normalized}${extension}`;
}

function mediaMarkup(item, className = "") {
  const source = previewImage(item);
  if (!source) return "";
  if (isVideoMedia(item)) {
    const videoSource = originalMediaUrl(item) || source;
    return `<video class="${escapeHtml(className)}" src="${escapeHtml(videoSource)}" controls preload="metadata"></video>`;
  }
  const originalSource = originalMediaUrl(item) || source;
  return `
    <span class="media-download-frame">
      <img class="${escapeHtml(className)}" src="${escapeHtml(source)}" alt="">
      <a
        class="media-download-link"
        href="${escapeHtml(originalSource)}"
        download="${escapeHtml(mediaDownloadName(item))}"
        target="_blank"
        rel="noreferrer"
        aria-label="Download original image"
        title="Download original"
      >
        Download original
      </a>
    </span>
  `;
}

function isUsableCoordinates(coordinates) {
  if (!coordinates) return false;
  const latitude = Number(coordinates.latitude);
  const longitude = Number(coordinates.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return false;
  return !(latitude === 0 && longitude === 0);
}
