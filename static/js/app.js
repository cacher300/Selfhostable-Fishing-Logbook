import { createId } from "./app-defaults.js";
import { loadState, state, ui } from "./app-state.js";
import { replaceState } from "./store.js";
import { els } from "./app-elements.js";
import { applyThemePreference, renderSettings } from "./settings.js";
import { applyStartupSavedSetup } from "./saved-setups.js";
import { renderAll } from "./dashboard.js";
import { renderExpeditions } from "./expeditions.js";
import { populatePersonSelects } from "./trip-editor.js";
import { applyStartupTrollingSpread, updateAllRowSummaries, updateCatchDetailsUnknown } from "./trip-rows.js";
import { renderGearLibrary } from "./gear-inventory.js";
import { renderFishMap } from "./maps.js";
import { renderAdvancedStats } from "./stats.js";
import { renderPersonalBests } from "./personal-bests.js";
import { isTrollingTrip, updateTrollingVisibility } from "./form-utils.js";
import { renderGallery } from "./gallery.js";
import { renderChecklists } from "./checklists.js";
import { initRouter, replaceInitialRoute } from "./router.js";
import { updateTripRow } from "./draft-binding.js";

export function updateMethodVisibility({ applyStartupSpread = false } = {}) {
  updateTrollingVisibility();
  if (applyStartupSpread) {
    if (isTrollingTrip()) applyStartupTrollingSpread();
    else applyStartupSavedSetup();
  }
  document.querySelectorAll(".catch-row.details-unknown").forEach(updateCatchDetailsUnknown);
}

export function setView(view) {
  const showingExpeditions = view === "expeditions";
  const showingBests = view === "bests";
  const showingStats = view === "stats";
  const showingLeaderboard = view === "leaderboard";
  const showingMap = view === "map";
  const showingGear = view === "gear";
  const showingGallery = view === "gallery";
  const showingChecklists = view === "checklists";
  const showingWiki = view === "wiki";
  const showingSettings = view === "settings";
  const viewButtons = {
    trips: els.tripsViewButton,
    expeditions: els.expeditionsViewButton,
    bests: els.bestsViewButton,
    stats: els.statsViewButton,
    map: els.mapViewButton,
    gear: els.gearViewButton,
    gallery: els.galleryViewButton,
    checklists: els.checklistsViewButton,
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
    gallery: "Gallery",
    checklists: "Checklists",
    wiki: "Wiki",
    settings: "Settings",
  };
  const activeNavigationView = showingWiki ? "settings" : view;
  document.body.dataset.activeView = view;
  const panelsToHide = showingExpeditions || showingBests || showingStats || showingLeaderboard || showingMap || showingGear || showingGallery || showingChecklists || showingWiki || showingSettings;
  els.tripControls?.classList.toggle("hidden", panelsToHide);
  els.tripListPanel?.classList.toggle("hidden", panelsToHide);
  els.expeditionsPanel?.classList.toggle("hidden", !showingExpeditions);
  els.personalBestsPanel?.classList.toggle("hidden", !showingBests);
  els.advancedStatsPanel?.classList.toggle("hidden", !showingStats);
  els.leaderboardPanel?.classList.toggle("hidden", !showingLeaderboard);
  els.mapPanel?.classList.toggle("hidden", !showingMap);
  els.gearPanel?.classList.toggle("hidden", !showingGear);
  els.galleryPanel?.classList.toggle("hidden", !showingGallery);
  els.checklistsPanel?.classList.toggle("hidden", !showingChecklists);
  els.wikiPanel?.classList.toggle("hidden", !showingWiki);
  els.settingsPanel?.classList.toggle("hidden", !showingSettings);
  Object.entries(viewButtons).forEach(([buttonView, button]) => {
    const active = buttonView === activeNavigationView;
    button?.classList.toggle("is-active", active);
    button?.setAttribute("aria-current", active ? "page" : "false");
  });
  document.querySelector(".topbar h2").textContent = viewTitles[view] || "Trips";
  els.newTripButton?.classList.toggle("hidden", showingExpeditions || showingChecklists);
  els.newExpeditionButton?.classList.toggle("hidden", !showingExpeditions);
  if (window.matchMedia("(max-width: 640px)").matches) {
    const activeButton = viewButtons[activeNavigationView];
    const navigation = activeButton?.closest(".view-nav");
    if (activeButton && navigation) {
      navigation.scrollTo({
        left: Math.max(0, activeButton.offsetLeft - ((navigation.clientWidth - activeButton.offsetWidth) / 2)),
        behavior: "smooth"
      });
    }
  }
  if (showingBests) renderPersonalBests();
  if (showingExpeditions) renderExpeditions();
  // The leaderboard panel is rendered as part of the advanced stats pass.
  if (showingStats || showingLeaderboard) renderAdvancedStats();
  if (showingMap) renderFishMap();
  if (showingGallery) renderGallery();
  if (showingChecklists) renderChecklists();
  if (showingSettings) renderSettings();
  if (showingGear) renderGearLibrary();
}

export function syncMobileSummaryPanel() {
  const summaryPanel = document.querySelector(".mobile-summary-panel");
  if (!summaryPanel) return;
  if (window.matchMedia("(max-width: 760px)").matches) {
    summaryPanel.removeAttribute("open");
  } else {
    summaryPanel.setAttribute("open", "");
  }
}

export async function init() {
  syncMobileSummaryPanel();
  replaceState(await loadState());
  applyThemePreference();
  renderAll();
  initRouter(setView);
  setView(replaceInitialRoute());
}

export function setup() {
  document.querySelector("#method").addEventListener("change", () => updateMethodVisibility({ applyStartupSpread: true }));

  document.querySelector("#targetSpecies").addEventListener("change", () => updateMethodVisibility());

  els.personRows.addEventListener("input", () => {
    populatePersonSelects();
    updateAllRowSummaries();
  });

  els.personRows.addEventListener("change", (event) => {
    const row = event.target.closest(".person-row");
    if (event.target.matches(".person-select") && row) {
      const input = row.querySelector(".person-name");
      const previousPersonId = row.dataset.personId || "";
      if (event.target.value === "__new__") {
        row.dataset.personId = createId();
        input.classList.remove("hidden");
        input.focus();
        updateTripRow("people", row.dataset.personId, { id: row.dataset.personId, name: input.value || "" });
      } else {
        row.dataset.personId = event.target.value || createId();
        input.value = "";
        input.classList.add("hidden");
        const person = state.people.find((item) => item.id === event.target.value);
        updateTripRow("people", row.dataset.personId, { id: row.dataset.personId, name: person?.name || "" });
      }
      if (previousPersonId && previousPersonId !== row.dataset.personId) {
        const index = ui.tripDraft?.people?.findIndex((person) => person.id === previousPersonId) ?? -1;
        if (index >= 0) ui.tripDraft.people.splice(index, 1);
      }
    }
    populatePersonSelects();
    updateAllRowSummaries();
  });

  window.addEventListener("resize", syncMobileSummaryPanel);

  init();
}
