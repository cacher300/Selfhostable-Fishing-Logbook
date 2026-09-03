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
let fishingSpotMap = null;
let fishingSpotLayer = null;
let activeFishingSpotId = "";
let fishingSpotNameEditId = "";
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
let activeGearTab = "baits";
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
