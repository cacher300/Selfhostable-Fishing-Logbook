const routeViews = {
  "/": "trips",
  "/trips": "trips",
  "/expeditions": "expeditions",
  "/bests": "bests",
  "/stats": "stats",
  "/leaderboard": "leaderboard",
  "/map": "map",
  "/gear": "gear",
  "/boat": "boat",
  "/gallery": "gallery",
  "/settings": "settings"
};

function viewFromCurrentRoute() {
  const pathname = window.location.pathname.replace(/\/$/, "") || "/";
  return routeViews[pathname.toLowerCase()] || "trips";
}

function updateMethodVisibility({ refreshDefaultSpread = false } = {}) {
  updateTrollingVisibility();
  applyDefaultTrollingSpread({
    force: refreshDefaultSpread,
    replaceExisting: refreshDefaultSpread && Boolean(activeTripId)
  });
  document.querySelectorAll(".catch-row.details-unknown").forEach(updateCatchDetailsUnknown);
}

document.querySelector("#method").addEventListener("change", () => updateMethodVisibility({ refreshDefaultSpread: true }));
document.querySelector("#targetSpecies").addEventListener("change", () => updateMethodVisibility({ refreshDefaultSpread: true }));
els.personRows.addEventListener("input", () => {
  populatePersonSelects();
  updateAllRowSummaries();
});
els.personRows.addEventListener("change", (event) => {
  const row = event.target.closest(".person-row");
  if (event.target.matches(".person-select") && row) {
    const input = row.querySelector(".person-name");
    if (event.target.value === "__new__") {
      row.dataset.personId = createId();
      input.classList.remove("hidden");
      input.focus();
    } else {
      row.dataset.personId = event.target.value || createId();
      input.value = "";
      input.classList.add("hidden");
    }
  }
  populatePersonSelects();
  updateAllRowSummaries();
});

function setView(view) {
  if (view === "boat" && state.settings?.boatFeatureEnabled !== true) view = "trips";
  const showingExpeditions = view === "expeditions";
  const showingBests = view === "bests";
  const showingStats = view === "stats";
  const showingLeaderboard = view === "leaderboard";
  const showingMap = view === "map";
  const showingGear = view === "gear";
  const showingBoat = view === "boat";
  const showingGallery = view === "gallery";
  const showingSettings = view === "settings";
  const viewButtons = {
    trips: els.tripsViewButton,
    expeditions: els.expeditionsViewButton,
    bests: els.bestsViewButton,
    stats: els.statsViewButton,
    map: els.mapViewButton,
    gear: els.gearViewButton,
    boat: els.boatViewButton,
    gallery: els.galleryViewButton,
    settings: els.settingsViewButton,
  };
  const viewTitles = {
    trips: "Trips",
    expeditions: "Expeditions",
    bests: "Personal Bests",
    stats: "Stats",
    leaderboard: "Leaderboard",
    map: "Map",
    gear: "Gear",
    boat: "Boat",
    gallery: "Gallery",
    settings: "Settings",
  };
  document.body.dataset.activeView = view;
  els.tripControls.classList.toggle("hidden", showingExpeditions || showingBests || showingStats || showingLeaderboard || showingMap || showingGear || showingBoat || showingGallery || showingSettings);
  els.tripListPanel.classList.toggle("hidden", showingExpeditions || showingBests || showingStats || showingLeaderboard || showingMap || showingGear || showingBoat || showingGallery || showingSettings);
  els.expeditionsPanel.classList.toggle("hidden", !showingExpeditions);
  els.personalBestsPanel.classList.toggle("hidden", !showingBests);
  els.advancedStatsPanel.classList.toggle("hidden", !showingStats);
  els.leaderboardPanel.classList.toggle("hidden", !showingLeaderboard);
  els.mapPanel.classList.toggle("hidden", !showingMap);
  els.gearPanel.classList.toggle("hidden", !showingGear);
  els.boatPanel.classList.toggle("hidden", !showingBoat);
  els.galleryPanel.classList.toggle("hidden", !showingGallery);
  els.settingsPanel.classList.toggle("hidden", !showingSettings);
  Object.entries(viewButtons).forEach(([buttonView, button]) => {
    button.classList.toggle("is-active", buttonView === view);
    button.setAttribute("aria-current", buttonView === view ? "page" : "false");
  });
  document.querySelector(".topbar h2").textContent = viewTitles[view] || "Trips";
  els.newTripButton.classList.toggle("hidden", showingExpeditions);
  els.newExpeditionButton.classList.toggle("hidden", !showingExpeditions);
  if (window.matchMedia("(max-width: 640px)").matches) {
    viewButtons[view]?.scrollIntoView({ block: "nearest", inline: "center" });
  }
  if (showingBests) renderPersonalBests();
  if (showingExpeditions) renderExpeditions();
  renderAdvancedStats();
  if (showingMap) renderFishMap();
  if (showingBoat) renderBoatLayout();
  if (showingGallery) renderGallery();
  if (showingSettings) renderSettings();
  renderGearLibrary();
}

function syncBoatFeatureVisibility() {
  const enabled = state.settings?.boatFeatureEnabled === true;
  els.boatViewButton.classList.toggle("hidden", !enabled);
  els.boatViewButton.setAttribute("aria-hidden", enabled ? "false" : "true");
}

function syncMobileSummaryPanel() {
  const summaryPanel = document.querySelector(".mobile-summary-panel");
  if (!summaryPanel) return;
  if (window.matchMedia("(max-width: 760px)").matches) {
    summaryPanel.removeAttribute("open");
  } else {
    summaryPanel.setAttribute("open", "");
  }
}

async function init() {
  syncMobileSummaryPanel();
  state = await loadState();
  applyThemePreference();
  syncBoatFeatureVisibility();
  renderAll();
  setView(viewFromCurrentRoute());
}

window.addEventListener("resize", syncMobileSummaryPanel);
init();
