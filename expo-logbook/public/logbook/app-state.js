const storageKey = "fishing-logbook-v1";
const apiBaseStorageKey = "fishing-logbook-api-base";

function expoApiBase() {
  const params = new URLSearchParams(location.search);
  const fromQuery = params.get("apiBase");
  if (fromQuery !== null) {
    localStorage.setItem(apiBaseStorageKey, fromQuery.trim());
    return fromQuery.trim().replace(/\/$/, "");
  }
  const saved = localStorage.getItem(apiBaseStorageKey);
  if (saved) return saved.replace(/\/$/, "");
  if (location.port && location.port !== "8080") return "http://127.0.0.1:8080";
  return "";
}

const apiBase = expoApiBase();

function apiUrl(path) {
  if (!apiBase || /^https?:\/\//i.test(path)) return path;
  return `${apiBase}${path.startsWith("/") ? path : `/${path}`}`;
}

function mediaUrl(path) {
  if (!path || /^https?:\/\//i.test(path) || path.startsWith("data:") || path.startsWith("blob:")) return path || "";
  return apiUrl(path);
}

const waterClarityOptions = [
  "Crystal Clear",
  "Clear",
  "Slightly Stained",
  "Stained",
  "Muddy",
  "Algae Bloom"
];

const weatherOptions = [
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
  lureTypes: ["Spoon", "Crankbait", "Spinner", "Jig", "Soft Plastic", "Fly", "Plug", "Swimbait", "Flasher/Fly", "Jerkbait", "Topwater", "Other"],
  flasherTypes: ["Paddle", "Dodger", "Spin Doctor", "Meat Rig", "Attractor", "Other"],
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
      wind: "W 8 mph",
      structure: "80-120 ft, bait pods",
      notes: "Best action near first light. Marked bait deep.",
      catches: []
    }
  ]
};

let state = structuredClone(defaults);
let activeTripId = null;
let activeSummaryTripId = null;
let activeNotePhotos = [];
let activeStatsMethod = "All methods";
const activePatternFilters = {
  species: "",
  location: "All locations",
  method: "All methods",
  month: "All months",
  waterClarity: "All clarity",
  weather: "All weather"
};
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
let activeMapSpecies = "All species";
let activeGalleryCategory = "all";
let fishMap = null;
let fishMapMarkers = null;
let tripSummaryMap = null;
let tripSummaryMapMarkers = null;
let activePhotoQueueTarget = null;
let pendingLureImage = null;
let pendingFlasherImage = null;
const returnToTripDialog = {
  lure: false,
  flasher: false,
  queue: false,
  lureImage: false,
  flasherImage: false
};

const els = {
  brandSpotlight: document.querySelector("#brandSpotlight"),
  statTrips: document.querySelector("#statTrips"),
  statFish: document.querySelector("#statFish"),
  statHours: document.querySelector("#statHours"),
  statWaterbodies: document.querySelector("#statWaterbodies"),
  statCatchRate: document.querySelector("#statCatchRate"),
  statPoundsPerHour: document.querySelector("#statPoundsPerHour"),
  statDaysSinceTrip: document.querySelector("#statDaysSinceTrip"),
  statDaysSinceCatch: document.querySelector("#statDaysSinceCatch"),
  statLongestFishingStreak: document.querySelector("#statLongestFishingStreak"),
  statLongestNoCatchRun: document.querySelector("#statLongestNoCatchRun"),
  speciesBars: document.querySelector("#speciesBars"),
  lureBars: document.querySelector("#lureBars"),
  tripTable: document.querySelector("#tripTable"),
  tripControls: document.querySelector("#tripControls"),
  tripListPanel: document.querySelector("#tripListPanel"),
  advancedStatsPanel: document.querySelector("#advancedStatsPanel"),
  patternsPanel: document.querySelector("#patternsPanel"),
  patternsSummary: document.querySelector("#patternsSummary"),
  patternSpeciesFilter: document.querySelector("#patternSpeciesFilter"),
  patternLocationFilter: document.querySelector("#patternLocationFilter"),
  patternMethodFilter: document.querySelector("#patternMethodFilter"),
  patternMonthFilter: document.querySelector("#patternMonthFilter"),
  patternWaterClarityFilter: document.querySelector("#patternWaterClarityFilter"),
  patternWeatherFilter: document.querySelector("#patternWeatherFilter"),
  patternsMetricGrid: document.querySelector("#patternsMetricGrid"),
  patternsGrid: document.querySelector("#patternsGrid"),
  mapPanel: document.querySelector("#mapPanel"),
  fishMap: document.querySelector("#fishMap"),
  mapSummary: document.querySelector("#mapSummary"),
  mapCatchList: document.querySelector("#mapCatchList"),
  mapSpeciesFilter: document.querySelector("#mapSpeciesFilter"),
  statsMethodFilter: document.querySelector("#statsMethodFilter"),
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
  outcomeStatsTable: document.querySelector("#outcomeStatsTable"),
  lureStatsTable: document.querySelector("#lureStatsTable"),
  flasherStatsTable: document.querySelector("#flasherStatsTable"),
  comboStatsTable: document.querySelector("#comboStatsTable"),
  speciesStatsTable: document.querySelector("#speciesStatsTable"),
  lostFishStatsTable: document.querySelector("#lostFishStatsTable"),
  bestPatternStatsTable: document.querySelector("#bestPatternStatsTable"),
  timeOfDayStatsTable: document.querySelector("#timeOfDayStatsTable"),
  releaseStatsTable: document.querySelector("#releaseStatsTable"),
  photoCoverageStatsTable: document.querySelector("#photoCoverageStatsTable"),
  trollingHighlightsTable: document.querySelector("#trollingHighlightsTable"),
  directionStatsTable: document.querySelector("#directionStatsTable"),
  trollingSetupStatsTable: document.querySelector("#trollingSetupStatsTable"),
  fowRangeStatsTable: document.querySelector("#fowRangeStatsTable"),
  speedStatsTable: document.querySelector("#speedStatsTable"),
  fowStatsTable: document.querySelector("#fowStatsTable"),
  depthDownStatsTable: document.querySelector("#depthDownStatsTable"),
  locationStatsTable: document.querySelector("#locationStatsTable"),
  methodStatsTable: document.querySelector("#methodStatsTable"),
  waterClarityStatsTable: document.querySelector("#waterClarityStatsTable"),
  weatherStatsTable: document.querySelector("#weatherStatsTable"),
  intentStatsTable: document.querySelector("#intentStatsTable"),
  ratingStatsTable: document.querySelector("#ratingStatsTable"),
  personStatsTable: document.querySelector("#personStatsTable"),
  monthStatsTable: document.querySelector("#monthStatsTable"),
  emptyState: document.querySelector("#emptyState"),
  searchInput: document.querySelector("#searchInput"),
  targetFilter: document.querySelector("#targetFilter"),
  yearFilter: document.querySelector("#yearFilter"),
  sortSelect: document.querySelector("#sortSelect"),
  newTripButton: document.querySelector("#newTripButton"),
  tripsViewButton: document.querySelector("#tripsViewButton"),
  statsViewButton: document.querySelector("#statsViewButton"),
  patternsViewButton: document.querySelector("#patternsViewButton"),
  mapViewButton: document.querySelector("#mapViewButton"),
  gearViewButton: document.querySelector("#gearViewButton"),
  galleryViewButton: document.querySelector("#galleryViewButton"),
  newLibraryLureButton: document.querySelector("#newLibraryLureButton"),
  newLibraryFlasherButton: document.querySelector("#newLibraryFlasherButton"),
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
  tripDialogTitle: document.querySelector("#tripDialogTitle"),
  tripRating: document.querySelector("#tripRating"),
  tripRatingLabel: document.querySelector("#tripRatingLabel"),
  deleteTripButton: document.querySelector("#deleteTripButton"),
  deleteLureButton: document.querySelector("#deleteLureButton"),
  deleteFlasherButton: document.querySelector("#deleteFlasherButton"),
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
  flasherDialog: document.querySelector("#flasherDialog"),
  flasherForm: document.querySelector("#flasherForm"),
  gearPanel: document.querySelector("#gearPanel"),
  galleryPanel: document.querySelector("#galleryPanel"),
  galleryCategoryFilter: document.querySelector("#galleryCategoryFilter"),
  galleryStatus: document.querySelector("#galleryStatus"),
  galleryGrid: document.querySelector("#galleryGrid"),
  lureLibraryGrid: document.querySelector("#lureLibraryGrid"),
  flasherLibraryGrid: document.querySelector("#flasherLibraryGrid")
};

async function loadState() {
  try {
    const response = await fetch(apiUrl("/api/logbook"));
    if (response.ok) return normalizeState({ ...structuredClone(defaults), ...(await response.json()) });
  } catch {
    // Opening index.html directly still works as a local fallback.
  }

  try {
    const saved = localStorage.getItem(storageKey);
    if (!saved) return structuredClone(defaults);
    return normalizeState({ ...structuredClone(defaults), ...JSON.parse(saved) });
  } catch {
    return structuredClone(defaults);
  }
}

function normalizeState(nextState) {
  const normalized = { ...structuredClone(defaults), ...(nextState || {}) };
  normalized.methods = [...defaults.methods];
  delete normalized.tripTypes;

  ["species", "lureTypes", "flasherTypes", "lures", "flashers", "people", "locations", "trips"].forEach((key) => {
    if (!Array.isArray(normalized[key])) normalized[key] = structuredClone(defaults[key]);
  });

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
  normalized.locations = mergeTextList(
    normalized.locations,
    normalized.trips.map((trip) => trip.location)
  );

  return normalized;
}

async function saveState() {
  state = normalizeState(state);
  localStorage.setItem(storageKey, JSON.stringify(state));

  if (location.protocol === "file:") return;

  const response = await fetch(apiUrl("/api/logbook"), {
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
  return mediaUrl(item?.previewImage || item?.previewUrl || item?.image || item?.url || "");
}

function isVideoMedia(item) {
  return item?.mediaType === "video" || item?.mimeType?.startsWith?.("video/");
}

function mediaMarkup(item, className = "") {
  const source = previewImage(item);
  if (!source) return "";
  if (isVideoMedia(item)) {
    const videoSource = mediaUrl(item.url || item.image || source);
    return `<video class="${escapeHtml(className)}" src="${escapeHtml(videoSource)}" controls preload="metadata"></video>`;
  }
  return `<img class="${escapeHtml(className)}" src="${escapeHtml(source)}" alt="">`;
}

function isUsableCoordinates(coordinates) {
  if (!coordinates) return false;
  const latitude = Number(coordinates.latitude);
  const longitude = Number(coordinates.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return false;
  return !(latitude === 0 && longitude === 0);
}
