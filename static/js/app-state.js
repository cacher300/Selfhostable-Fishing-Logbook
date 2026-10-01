import { storageKey } from "./app-config.js";
import { defaults } from "./app-defaults.js";
import { validateState } from "./app-normalization.js";

export const ui = {};

export let state;

export let logbookRevision = "";
ui.activeTripId = null;
ui.newTripStartupSpreadApplied = false;
ui.newTripSavedSetupAppliedMethods = new Set();
ui.activeSummaryTripId = null;
ui.activeReportTimelineFilter = "all";
ui.activeReportTimelineSort = { key: "time", direction: "asc" };
ui.activeReportTimelineColumns = null;
ui.activeNotePhotos = [];
ui.activeTripSort = { key: "date", direction: "desc" };
ui.activeStatsMethod = "All methods";
ui.activeStatsDateRange = "all";
ui.activeStatsSort = "fishPerHour";
ui.activeStatsMinTrips = 0;
ui.activeStatsMinHours = 0;
ui.activeStatsIncludeLost = false;
ui.activeStatsCompareBy = "lureColor";
ui.activeStatsCompareSplit = "";
ui.activeStatsCompareMetric = "fishPerHour";
export const activeStatsTableSort = {};
export const activeStatsChartMetric = {};
export const activeStatsFilters = {
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
export const activePersonalBestsFilters = {
  year: "All years",
  month: "All months",
  rankBy: "weight"
};
ui.activeMapSpecies = "All species";
ui.activeMapLake = "All lakes";
ui.activeMapMethod = "All methods";
ui.activeMapDirection = "All directions";
ui.activeMapAngler = "All anglers";
ui.activeMapYear = "All years";
ui.activeMapYearFilteringHidden = true;
ui.activeMapIncludeTripMedia = false;
ui.activeMapIncludeSpots = true;
ui.activeMapShowDirectionArrows = true;
export let mapNoaaChartsPreferenceKey;

ui.activeTripSummaryMapFilter = "All map items";
ui.activeGalleryCategory = "all";
ui.brandSpotlightTimer = null;
ui.fishMap = null;
ui.fishMapMarkers = null;
ui.fishMapSpotMarkers = null;
ui.tripSummaryMap = null;
ui.tripSummaryMapMarkers = null;
ui.catchDetailMap = null;
ui.catchDetailMapMarkers = null;
ui.locationPickerMap = null;
ui.locationPickerMarker = null;
ui.probeProfileLocationMap = null;
ui.probeProfileLocationMarker = null;
ui.probeProfileImportCoordinates = null;
ui.pendingProbeProfileImportCoordinates = null;
ui.privatePhotoLocationMap = null;
ui.privatePhotoLocationLayer = null;
ui.activePrivatePhotoLocationId = "";
ui.editingPrivatePhotoLocationId = "";
ui.fishingSpotMap = null;
ui.fishingSpotLayer = null;
ui.activeFishingSpotId = "";
ui.editingFishingSpotId = "";
ui.fishingSpotNameEditId = "";
ui.catchLocationPickerMap = null;
ui.catchLocationPickerMarker = null;
ui.activeCatchLocationRow = null;
ui.activeLocationPickerMode = "location";
ui.activeLocationPickerLocationId = "";
ui.activeLocationPickerLaunchId = "";
ui.activeTripWeatherData = null;
ui.activeTripWeatherKey = "";
ui.weatherPreviewTimer = null;
ui.tripFormInitialSnapshot = "";
ui.tripFormUserChanged = false;
ui.activePhotoQueueTarget = null;
ui.pendingLureImage = null;
ui.pendingFlasherImage = null;
ui.pendingReelImage = null;
ui.pendingRodImage = null;
ui.activeGearTab = "baits";
export const returnToTripDialog = {
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

export function loadMapNoaaChartsPreference() {
  try {
    const saved = localStorage.getItem(mapNoaaChartsPreferenceKey);
    return saved === null ? true : saved === "true";
  } catch {
    return true;
  }
}

export function saveMapNoaaChartsPreference(showCharts) {
  try {
    localStorage.setItem(mapNoaaChartsPreferenceKey, String(Boolean(showCharts)));
  } catch {
    // The map can still work when browser storage is unavailable.
  }
}

export async function loadState() {
  if (location.protocol !== "file:") {
    try {
      const response = await fetch("/api/logbook");
      if (response.ok) {
        logbookRevision = response.headers.get("ETag") || "";
        return validateState(await response.json());
      }
    } catch {
      // Fall through to browser storage when the server is unavailable.
    }
  }

  try {
    const saved = localStorage.getItem(storageKey);
    if (!saved) return validateState(structuredClone(defaults));
    return validateState(JSON.parse(saved));
  } catch (error) {
    console.warn("Could not load the cached v2 logbook; showing an empty logbook instead.", error);
    return validateState(structuredClone(defaults));
  }
}

export function setup() {
  state = structuredClone(defaults);

  mapNoaaChartsPreferenceKey = `${storageKey}-map-noaa-charts`;

  ui.activeMapShowNOAACharts = loadMapNoaaChartsPreference();
}

export function setState(value) {
  state = value;
  return value;
}

export function setLogbookRevision(value) {
  logbookRevision = value;
  return value;
}
