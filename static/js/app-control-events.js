import { createId } from "./app-defaults.js";
import { activePersonalBestsFilters, activeStatsFilters, returnToTripDialog, saveMapNoaaChartsPreference, state, ui } from "./app-state.js";
import { addListValue } from "./actions.js";
import { els } from "./app-elements.js";
import { finishMediaEditSession } from "./app-media.js";
import { clearActiveCatchLocation, deleteActiveLocationFromDialog, handleLocationManagerDragEnd, handleLocationManagerDragOver, handleLocationManagerDragStart, handleLocationManagerDrop, openLocationDialog, renderLocationManager, saveCatchLocationFromPicker, saveLocationPin } from "./locations.js";
import { resyncTripWeather } from "./location-weather.js";
import { exportArchive, importArchive, scheduleSettingsAutosave, setSettingsSaveStatus, settingsUi } from "./settings-core.js";
import { addTrollingSpread, addTrollingSpreadRowToCard, cancelTrollingSpreadDraft, deleteTrollingSpread, editTrollingSpread, finishTrollingSpreadEdit, refreshTrollingSpreadCardPreview, saveDefaultHomeLake, saveDefaultPeople, saveDefaultTrollingSpreadId, saveFishHawkPreference, saveSpeciesMapColors, saveThemePreference, saveTimeFormatPreference, saveUnitSettings, scheduleTrollingSpreadAutosave, setSettingsTab, setTrollingSpreadSettingsMessage, syncSpeciesMapColorPreview, syncTrollingSpreadRowFields } from "./settings.js";
import { openSavedSetupPicker } from "./saved-setups.js";
import { cancelChopRangeEditing, savePredefinedFieldSettings, toggleChopRangeEditing } from "./settings-fields.js";
import { collectFishingSpotSettings, collectPrivatePhotoLocationSettings, fishingSpotDefaultCoordinates, fishingSpotRadiusMeters, fishingSpotRadiusText, nextFishingSpotName, privateLocationDefaultCoordinates, privateLocationRadiusMeters, privateLocationRadiusText, privatePhotoLocations, saveFishingSpots, savePrivatePhotoLocations, updateFishingSpotRadiusControl, updatePrivateLocationRadiusControl } from "./settings-locations.js";
import { renderTrips, tripSortFromSelect } from "./dashboard.js";
import { addNotePhotos, addPhotosToQueue, openPhotoQueue, restoreDialogAfterPhotoQueue } from "./photos.js";
import { addPersonRow, closeTripDialog, focusTripValidationField, getValue, isTripFormDirty, openTripDialog, updateTripRatingLabel } from "./trip-editor.js";
import { addCatchRow, addLostFishRow, addTripGearRow, expandAndRevealTripRow, importLastTrollingSpread } from "./trip-rows.js";
import { deleteActiveTrip, saveTrip, saveTripAsDraft } from "./trip-save.js";
import { autofillCatchesFromPhotoQueue } from "./photo-queue-autofill.js";
import { restoreTripDialogAfterInlineGear } from "./gear-pickers.js";
import { deleteCombo, deleteFlasher, deleteLure, deleteReel, deleteRod, openComboDialog, openFlasherDialog, openLureDialog, openReelDialog, openRodDialog, saveCombo, saveFlasher, saveLure, saveReel, saveRod, updateFlyGearVisibility, updateLureDivingDepthField, updateMonoBackingVisibility } from "./gear-dialogs.js";
import { clearGearFilter, closeGearFilterSuggestions, openGearFilterSuggestions, updateGearFilter, updateGearLureTypeFilter, updateGearSoftPlasticStyleFilter } from "./gear-inventory.js";
import { renderFishMap, renderTripSummaryMap, syncMapPageChartOverlay } from "./maps.js";
import { openTripShareStudio } from "./trip-sharing.js";
import { renderAdvancedStats } from "./stats.js";
import { renderPersonalBests } from "./personal-bests.js";
import { populateStructureSelect } from "./form-utils.js";

import { deleteGalleryItems, downloadGalleryItems, gallerySelectionMode, galleryUi, renderGallery, selectedGalleryPayload, setGalleryPage, setGallerySelectionMode, syncGallerySearchSort, toggleGalleryOrphanScan } from "./gallery.js";
import { bindChecklistEvents } from "./checklists.js";
import { openTrollingSpreadPicker } from "./trolling-spread-picker.js";
import { navigate } from "./router.js";
import { handleGearDraftControlEvent, handleSettingsDraftControlEvent, handleTripDraftControlEvent } from "./draft-binding.js";

export let activeStructureSelect = null;

export function setStructureFormMessage(message = "") {
  if (!els.structureFormMessage) return;
  els.structureFormMessage.textContent = message;
  els.structureFormMessage.classList.toggle("hidden", !message);
}

export function openStructureDialog(select) {
  activeStructureSelect = select;
  els.structureNameInput.value = "";
  setStructureFormMessage();
  els.structureDialog.showModal();
  requestAnimationFrame(() => els.structureNameInput.focus());
}

export function resetStructureDialog() {
  if (activeStructureSelect?.value === "__new__") {
    activeStructureSelect.value = "";
    populateStructureSelect(activeStructureSelect, "");
  }
  activeStructureSelect = null;
  els.structureForm.reset();
  setStructureFormMessage();
}

export async function saveStructureOption(event) {
  event.preventDefault();
  const value = String(els.structureNameInput.value || "").trim();
  if (!value) {
    setStructureFormMessage("Enter a structure name to continue.");
    els.structureNameInput.focus();
    return;
  }

  const select = activeStructureSelect;
  await addListValue("structureOptions", value).catch((error) => console.error("Could not save structure option.", error));
  // The trip dialog can already contain multiple catch rows. Refresh every
  // structure selector so the newly-added option is immediately available to
  // the other catches in this trip as well, while keeping their selections.
  document.querySelectorAll(".catch-structure").forEach((structureSelect) => {
    populateStructureSelect(structureSelect, structureSelect === select ? value : structureSelect.value);
  });
  activeStructureSelect = null;
  els.structureDialog.close();
}

export function syncStatsUrl() {
  if (window.location.pathname !== "/stats") return;
  const params = new URLSearchParams();
  if (ui.activeStatsDateRange !== "all") params.set("range", ui.activeStatsDateRange);
  if (ui.activeStatsMethod !== "All methods") params.set("method", ui.activeStatsMethod);
  if (ui.activeStatsSort !== "fishPerHour") params.set("sort", ui.activeStatsSort);
  if (ui.activeStatsMinTrips) params.set("minTrips", String(ui.activeStatsMinTrips));
  if (ui.activeStatsMinHours) params.set("minHours", String(ui.activeStatsMinHours));
  if (ui.activeStatsIncludeLost) params.set("outcome", "strikes");
  if (ui.activeStatsCompareBy && ui.activeStatsCompareBy !== "lureColor") params.set("compare", ui.activeStatsCompareBy);
  if (ui.activeStatsCompareSplit) params.set("split", ui.activeStatsCompareSplit);
  if (ui.activeStatsCompareSplit && ui.activeStatsCompareMetric !== "fishPerHour") params.set("show", ui.activeStatsCompareMetric);
  Object.entries(activeStatsFilters).forEach(([key, value]) => {
    if (value && !value.startsWith("All ")) params.set(key, value);
  });
  const query = params.toString();
  history.replaceState(null, "", `/stats${query ? `?${query}` : ""}`);
}

export function setup() {
  els.newTripButton.addEventListener("click", () => openTripDialog());

  els.tripForm.addEventListener("submit", saveTrip);
  els.tripDialog.addEventListener("input", handleTripDraftControlEvent);
  els.tripDialog.addEventListener("change", handleTripDraftControlEvent);
  [els.lureDialog, els.flasherDialog, els.reelDialog, els.rodDialog, els.comboDialog].forEach((dialog) => {
    dialog.addEventListener("input", handleGearDraftControlEvent);
    dialog.addEventListener("change", handleGearDraftControlEvent);
  });
  [els.settingsPanel, els.checklistsPanel].forEach((panel) => {
    panel?.addEventListener("input", handleSettingsDraftControlEvent);
    panel?.addEventListener("change", handleSettingsDraftControlEvent);
  });

  els.saveTripDraftButtons.forEach((button) => button.addEventListener("click", saveTripAsDraft));

  els.tripForm.addEventListener("keydown", (event) => {
    if (event.key === "Enter") event.preventDefault();
  });

  els.tripValidationList?.addEventListener("click", (event) => {
    const fieldButton = event.target.closest("[data-validation-field]");
    if (fieldButton) focusTripValidationField(fieldButton.dataset.validationField);
  });

  els.locationForm.addEventListener("submit", saveLocationPin);

  els.structureForm.addEventListener("submit", saveStructureOption);

  els.structureDialog.addEventListener("close", resetStructureDialog);

  els.deleteLocationDialogButton?.addEventListener("click", () => {
    deleteActiveLocationFromDialog().catch((error) => alert(error.message || "The location could not be deleted."));
  });

  els.tripRating.addEventListener("input", updateTripRatingLabel);

  els.deleteTripButton.addEventListener("click", deleteActiveTrip);

  els.addCatchButton.addEventListener("click", () => expandAndRevealTripRow(addCatchRow()));

  els.autofillQueueCatchesButton?.addEventListener("click", () => autofillCatchesFromPhotoQueue());

  els.addLostFishButton.addEventListener("click", () => addLostFishRow());

  els.addTripGearButton.addEventListener("click", () => expandAndRevealTripRow(addTripGearRow()));

  els.importLastTrollingSpreadButton?.addEventListener("click", importLastTrollingSpread);

  els.addPersonButton.addEventListener("click", () => addPersonRow());

  els.addLocationButton.addEventListener("click", () => openLocationDialog("location"));

  els.addLaunchButton.addEventListener("click", () => openLocationDialog("launch", els.tripLocation.value));

  els.locationManagerSearch?.addEventListener("input", renderLocationManager);

  els.locationManagerList?.addEventListener("dragstart", handleLocationManagerDragStart);

  els.locationManagerList?.addEventListener("dragover", handleLocationManagerDragOver);

  els.locationManagerList?.addEventListener("drop", handleLocationManagerDrop);

  els.locationManagerList?.addEventListener("dragend", handleLocationManagerDragEnd);

  els.resyncWeatherButton?.addEventListener("click", resyncTripWeather);

  els.notePhotoInput.addEventListener("change", addNotePhotos);

  els.photoQueueButton.addEventListener("click", () => {
    openPhotoQueue();
  });

  els.exportDatabaseButton?.addEventListener("click", exportArchive);

  els.importDatabaseButton?.addEventListener("click", () => els.importDatabaseInput?.click());

  els.importDatabaseInput?.addEventListener("change", importArchive);

  els.photoQueueInput.addEventListener("change", addPhotosToQueue);

  els.lureForm.addEventListener("submit", saveLure);

  document.querySelector("#lureType").addEventListener("change", updateLureDivingDepthField);

  document.querySelector("#rodType").addEventListener("change", updateFlyGearVisibility);

  document.querySelector("#reelStyle").addEventListener("change", updateFlyGearVisibility);

  document.querySelector("#reelLineRows").addEventListener("change", updateFlyGearVisibility);

  els.flasherForm.addEventListener("submit", saveFlasher);

  els.reelForm.addEventListener("submit", saveReel);

  document.querySelector("#reelLineRows")?.addEventListener("change", (event) => {
    if (!event.target.matches(".line-type")) return;
    updateMonoBackingVisibility(event.target.closest(".line-editor-row"));
  });

  els.rodForm.addEventListener("submit", saveRod);

  els.comboForm.addEventListener("submit", saveCombo);

  els.lureDialog.addEventListener("close", () => restoreTripDialogAfterInlineGear("lure"));

  els.lureInfoDialog.addEventListener("close", () => restoreTripDialogAfterInlineGear("lureInfo"));

  els.editLureFromInfoButton.addEventListener("click", () => {
    const lure = state.lures.find((item) => item.id === els.lureInfoDialog.dataset.lureId);
    if (!lure) return;
    const shouldReturnToTrip = returnToTripDialog.lureInfo;
    returnToTripDialog.lureInfo = false;
    els.lureInfoDialog.close();
    openLureDialog(lure);
    returnToTripDialog.lure = shouldReturnToTrip;
  });

  els.flasherDialog.addEventListener("close", () => restoreTripDialogAfterInlineGear("flasher"));

  els.flasherInfoDialog.addEventListener("close", () => restoreTripDialogAfterInlineGear("flasherInfo"));

  els.editFlasherFromInfoButton.addEventListener("click", () => {
    const flasher = state.flashers.find((item) => item.id === els.flasherInfoDialog.dataset.flasherId);
    if (!flasher) return;
    const shouldReturnToTrip = returnToTripDialog.flasherInfo;
    returnToTripDialog.flasherInfo = false;
    els.flasherInfoDialog.close();
    openFlasherDialog(flasher);
    returnToTripDialog.flasher = shouldReturnToTrip;
  });

  els.reelDialog.addEventListener("close", () => restoreTripDialogAfterInlineGear("reel"));

  els.rodDialog.addEventListener("close", () => restoreTripDialogAfterInlineGear("rod"));

  [
    [els.tripDialog, "trip"], [els.lureDialog, "lure"],
    [els.flasherDialog, "flasher"], [els.reelDialog, "reel"], [els.rodDialog, "rod"]
  ].forEach(([dialog, scope]) => dialog.addEventListener("close", () => {
    finishMediaEditSession(scope).catch((error) => console.warn(`Could not clean up ${scope} editor media.`, error));
  }));

  els.photoQueueDialog.addEventListener("close", restoreDialogAfterPhotoQueue);

  els.saveCatchLocationButton?.addEventListener("click", saveCatchLocationFromPicker);

  els.clearCatchLocationButton?.addEventListener("click", clearActiveCatchLocation);

  els.tripDialog.addEventListener("cancel", (event) => {
    if (!isTripFormDirty()) return;
    event.preventDefault();
    closeTripDialog();
  });

  els.summaryEditTripButton.addEventListener("click", () => {
    const trip = state.trips.find((item) => item.id === ui.activeSummaryTripId);
    if (!trip) return;
    els.tripSummaryDialog.close();
    openTripDialog(trip);
  });

  els.summaryShareTripButton?.addEventListener("click", () => {
    const trip = state.trips.find((item) => item.id === ui.activeSummaryTripId);
    if (trip) openTripShareStudio(trip);
  });

  els.deleteLureButton.addEventListener("click", deleteLure);

  els.deleteFlasherButton.addEventListener("click", deleteFlasher);

  els.deleteReelButton.addEventListener("click", deleteReel);

  els.deleteRodButton.addEventListener("click", deleteRod);

  els.deleteComboButton.addEventListener("click", deleteCombo);

  els.tripsViewButton.addEventListener("click", () => navigate("trips"));

  els.expeditionsViewButton.addEventListener("click", () => navigate("expeditions"));

  els.bestsViewButton.addEventListener("click", () => navigate("bests"));

  els.statsViewButton.addEventListener("click", () => navigate("stats"));

  els.leaderboardViewButton.addEventListener("click", () => navigate("leaderboard"));

  els.mapViewButton.addEventListener("click", () => navigate("map"));

  els.gearViewButton.addEventListener("click", () => navigate("gear"));

  els.galleryViewButton.addEventListener("click", () => navigate("gallery"));

  els.checklistsViewButton.addEventListener("click", () => navigate("checklists"));

  els.settingsWikiButton?.addEventListener("click", () => navigate("wiki"));

  els.settingsViewButton.addEventListener("click", () => navigate("settings"));

  els.newLibraryLureButton.addEventListener("click", () => openLureDialog());

  els.newLibraryFlyButton.addEventListener("click", () => openLureDialog(null, "", "", "Fly"));

  els.newLibraryFlasherButton.addEventListener("click", () => openFlasherDialog());

  els.newLibraryReelButton.addEventListener("click", () => openReelDialog());

  els.newLibraryRodButton.addEventListener("click", () => openRodDialog());

  els.newLibraryComboButton.addEventListener("click", () => openComboDialog());

  document.querySelector("#comboRod").addEventListener("change", () => {
    if (getValue("editingComboId")) return;
    const shortNameInput = document.querySelector("#comboShortName");
    if (shortNameInput.value && shortNameInput.dataset.autoName !== "true") return;
    const rod = state.rods.find((item) => item.id === getValue("comboRod"));
    shortNameInput.value = rod?.shortName || rod?.name || "";
    shortNameInput.dataset.autoName = "true";
  });

  document.querySelector("#comboShortName").addEventListener("input", (event) => {
    event.target.dataset.autoName = "";
  });

  document.querySelectorAll("[data-theme-option]").forEach((input) => input.addEventListener("change", saveThemePreference));

  els.timeFormatSelect?.addEventListener("change", saveTimeFormatPreference);

  els.defaultHomeLakeSelect?.addEventListener("change", () => saveDefaultHomeLake({ autosave: true }));

  els.defaultPeopleOptions?.addEventListener("change", () => saveDefaultPeople({ autosave: true }));

  els.fishHawkToggle?.addEventListener("change", () => saveFishHawkPreference({ autosave: true }));

  els.speciesMapColorRows?.addEventListener("input", (event) => {
    if (event.target.matches("[data-species-map-color]")) {
      if (!settingsUi.speciesMapColorsDirty) settingsUi.speciesMapColorsDirty = new Set();
      settingsUi.speciesMapColorsDirty.add(event.target.dataset.speciesMapColor);
      syncSpeciesMapColorPreview(event.target);
    }
  });

  els.speciesMapColorRows?.addEventListener("change", (event) => {
    if (event.target.matches("[data-species-map-color]")) {
      if (!settingsUi.speciesMapColorsDirty) settingsUi.speciesMapColorsDirty = new Set();
      settingsUi.speciesMapColorsDirty.add(event.target.dataset.speciesMapColor);
      saveSpeciesMapColors({ autosave: true }).catch(() => {});
    }
  });

  els.gearFilterField?.addEventListener("change", updateGearFilter);
  els.gearLureTypeFilter?.addEventListener("change", updateGearLureTypeFilter);
  els.gearSoftPlasticStyleFilter?.addEventListener("change", updateGearSoftPlasticStyleFilter);

  els.gearFilterQuery?.addEventListener("input", updateGearFilter);

  els.gearFilterQuery?.addEventListener("focus", openGearFilterSuggestions);

  els.gearFilterQuery?.addEventListener("blur", () => setTimeout(closeGearFilterSuggestions, 120));

  els.clearGearFilterButton?.addEventListener("click", clearGearFilter);

  els.pickTrollingSpreadButton?.addEventListener("click", openTrollingSpreadPicker);

  els.pickSavedSetupButton?.addEventListener("click", openSavedSetupPicker);

  els.addTrollingSpreadButton?.addEventListener("click", addTrollingSpread);

  els.defaultTrollingSpreadId?.addEventListener("change", () => saveDefaultTrollingSpreadId({ autosave: true }));

  els.defaultTrollingSpreadRows?.addEventListener("click", (event) => {
    const card = event.target.closest(".trolling-spread-card");
    if (!card) return;
    if (event.target.closest(".edit-trolling-spread")) editTrollingSpread(card.dataset.trollingSpreadId);
    if (event.target.closest(".finish-trolling-spread-edit")) finishTrollingSpreadEdit(card).catch(() => {});
    if (event.target.closest(".add-trolling-spread-row")) addTrollingSpreadRowToCard(card);
    if (event.target.closest(".remove-trolling-spread-row")) {
      const row = event.target.closest(".trolling-spread-row");
      settingsUi.trollingSpreadsDraft?.[Number(card?.dataset.trollingSpreadIndex)]?.spread?.splice(Number(row?.dataset.sourceIndex), 1);
      row?.remove();
      refreshTrollingSpreadCardPreview(card);
      scheduleTrollingSpreadAutosave(card);
    }
    if (event.target.closest(".cancel-trolling-spread")) cancelTrollingSpreadDraft();
    if (event.target.closest(".delete-trolling-spread")) deleteTrollingSpread(card.dataset.trollingSpreadId).catch(() => {});
    const clickedName = event.target.matches(".trolling-spread-name");
    if ((!event.target.closest("button, input, select, textarea, a") || clickedName)
      && card.dataset.trollingSpreadDraft !== "true"
      && card.dataset.trollingSpreadEditing !== "true") {
      editTrollingSpread(card.dataset.trollingSpreadId);
    }
  });

  els.defaultTrollingSpreadRows?.addEventListener("change", (event) => {
    if (event.target.matches(".trolling-spread-combo, .trolling-spread-side, .trolling-spread-presentation, .trolling-spread-dipsey-color")) {
      const card = event.target.closest(".trolling-spread-card");
      if (event.target.matches(".trolling-spread-presentation")) syncTrollingSpreadRowFields(event.target.closest(".trolling-spread-row"));
      refreshTrollingSpreadCardPreview(card);
      scheduleTrollingSpreadAutosave(card);
    }
  });

  els.defaultTrollingSpreadRows?.addEventListener("input", (event) => {
    if (event.target.matches(".trolling-spread-name, .trolling-spread-dipsey-color")) {
      setTrollingSpreadSettingsMessage("");
      scheduleTrollingSpreadAutosave(event.target.closest(".trolling-spread-card"));
    }
  });

  document.querySelectorAll("[data-settings-tab]").forEach((tab) => {
    tab.addEventListener("click", () => setSettingsTab(tab.dataset.settingsTab));
  });

  document.querySelectorAll("[data-time-format-option]").forEach((input) => {
    input.addEventListener("change", saveTimeFormatPreference);
  });

  els.editChopRangesButton?.addEventListener("click", toggleChopRangeEditing);

  els.cancelChopRangesButton?.addEventListener("click", cancelChopRangeEditing);

  els.unitSettingsFields?.addEventListener("change", () => saveUnitSettings({ autosave: true }));

  els.unitSettingsFields?.addEventListener("input", (event) => {
      if (event.target.matches("[data-bathymetry-lake-calibration]")) {
      scheduleSettingsAutosave((options) => saveUnitSettings({ ...options, rerender: false }));
    }
  });

  els.fowCalibrationFields?.addEventListener("change", () => saveUnitSettings({ autosave: true }));

  els.fowCalibrationFields?.addEventListener("input", (event) => {
    if (event.target.matches("[data-bathymetry-lake-calibration]")) {
      scheduleSettingsAutosave((options) => saveUnitSettings({ ...options, rerender: false }));
    }
  });

  els.predefinedFieldSettings?.addEventListener("input", (event) => {
    if (event.target.matches(".predefined-option-label")) {
      const groupKey = event.target.closest(".predefined-field-group")?.dataset.predefinedKey;
      if (groupKey) {
        if (!settingsUi.predefinedFieldsDirty) settingsUi.predefinedFieldsDirty = new Set();
        settingsUi.predefinedFieldsDirty.add(groupKey);
      }
      scheduleSettingsAutosave((options) => savePredefinedFieldSettings({ ...options, rerender: false }));
    }
  });

  els.chopRangeRows?.addEventListener("input", (event) => {
    if (event.target.matches(".chop-range-label, .chop-range-max")) {
      setSettingsSaveStatus("Editing chop ranges");
    }
  });

  els.privatePhotoLocationList?.addEventListener("input", (event) => {
    if (!event.target.matches(".private-location-name, .private-location-radius")) return;
    const card = event.target.closest("[data-private-location-id]");
    if (card) ui.activePrivatePhotoLocationId = card.dataset.privateLocationId;
    if (event.target.matches(".private-location-radius")) {
      updatePrivateLocationRadiusControl(event.target);
      const output = card?.querySelector(".private-location-radius-value");
      if (output) output.textContent = privateLocationRadiusText(privateLocationRadiusMeters(event.target.value));
    }
    scheduleSettingsAutosave((options) => savePrivatePhotoLocations(collectPrivatePhotoLocationSettings(), { ...options, rerender: false }));
  });

  els.fishingSpotList?.addEventListener("input", (event) => {
    if (!event.target.matches(".fishing-spot-name, .fishing-spot-radius")) return;
    const card = event.target.closest("[data-fishing-spot-id]");
    if (card) ui.activeFishingSpotId = card.dataset.fishingSpotId;
    if (event.target.matches(".fishing-spot-radius")) {
      updateFishingSpotRadiusControl(event.target);
      const output = card?.querySelector(".fishing-spot-radius-value");
      if (output) output.textContent = fishingSpotRadiusText(fishingSpotRadiusMeters(event.target.value));
    }
    scheduleSettingsAutosave((options) => saveFishingSpots(collectFishingSpotSettings(), { ...options, rerender: false }));
  });

  els.settingsAddLocationButton.addEventListener("click", () => openLocationDialog("location"));

  els.addPrivatePhotoLocationButton?.addEventListener("click", async () => {
    const coordinates = privateLocationDefaultCoordinates();
    const id = createId();
    ui.activePrivatePhotoLocationId = id;
    await savePrivatePhotoLocations([
      ...collectPrivatePhotoLocationSettings(),
      {
        id,
        name: `Home ${privatePhotoLocations().length + 1}`,
        radiusMeters: 400,
        coordinates
      }
    ]);
  });

  els.addFishingSpotButton?.addEventListener("click", async () => {
    const id = createId();
    ui.activeFishingSpotId = id;
    await saveFishingSpots([
      ...collectFishingSpotSettings(),
      { id, name: nextFishingSpotName(), radiusMeters: 100, coordinates: fishingSpotDefaultCoordinates() }
    ]);
  });

  els.statsMethodFilter.addEventListener("change", () => {
    ui.activeStatsMethod = els.statsMethodFilter.value;
    syncStatsUrl();
    renderAdvancedStats();
  });

  els.statsDateFilter?.addEventListener("change", () => {
    ui.activeStatsDateRange = els.statsDateFilter.value;
    syncStatsUrl();
    renderAdvancedStats();
  });

  els.bestsYearFilter?.addEventListener("change", () => {
    activePersonalBestsFilters.year = els.bestsYearFilter.value;
    activePersonalBestsFilters.month = "All months";
    renderPersonalBests();
  });

  els.bestsMonthFilter?.addEventListener("change", () => {
    activePersonalBestsFilters.month = els.bestsMonthFilter.value;
    renderPersonalBests();
  });

  els.bestsRankFilter?.addEventListener("change", () => {
    activePersonalBestsFilters.rankBy = els.bestsRankFilter.value;
    renderPersonalBests();
  });

  els.statsSortFilter?.addEventListener("change", () => {
    ui.activeStatsSort = els.statsSortFilter.value;
    syncStatsUrl();
    renderAdvancedStats();
  });

  els.statsMinTripsInput?.addEventListener("input", () => {
    ui.activeStatsMinTrips = Math.max(0, Math.floor(Number(els.statsMinTripsInput.value) || 0));
    syncStatsUrl();
    renderAdvancedStats();
  });

  els.statsMinHoursInput?.addEventListener("input", () => {
    ui.activeStatsMinHours = Math.max(0, Number(els.statsMinHoursInput.value) || 0);
    syncStatsUrl();
    renderAdvancedStats();
  });

  els.statsIncludeLostToggle?.addEventListener("change", () => {
    ui.activeStatsIncludeLost = Boolean(els.statsIncludeLostToggle.checked);
    syncStatsUrl();
    renderAdvancedStats();
  });

  [
    [els.statsCompareBySelect, "activeStatsCompareBy"],
    [els.statsCompareSplitSelect, "activeStatsCompareSplit"],
    [els.statsCompareMetricSelect, "activeStatsCompareMetric"]
  ].forEach(([control, key]) => {
    control?.addEventListener("change", () => {
      ui[key] = control.value;
      syncStatsUrl();
      renderAdvancedStats();
    });
  });

  [
    ["species", els.statsSpeciesFilter],
    ["person", els.statsPersonFilter],
    ["location", els.statsLocationFilter],
    ["launch", els.statsLaunchFilter],
    ["lure", els.statsLureFilter],
    ["flasher", els.statsFlasherFilter],
    ["waterClarity", els.statsWaterClarityFilter],
    ["weather", els.statsWeatherFilter],
    ["month", els.statsMonthFilter],
    ["rating", els.statsRatingFilter]
  ].forEach(([key, control]) => {
    control.addEventListener("change", () => {
      activeStatsFilters[key] = control.value;
      syncStatsUrl();
      renderAdvancedStats();
    });
  });

  els.mapSpeciesFilter.addEventListener("change", () => {
    ui.activeMapSpecies = els.mapSpeciesFilter.value;
    renderFishMap();
  });

  els.mapLakeFilter?.addEventListener("change", () => {
    ui.activeMapLake = els.mapLakeFilter.value;
    renderFishMap();
  });

  els.mapMethodFilter?.addEventListener("change", () => {
    ui.activeMapMethod = els.mapMethodFilter.value;
    renderFishMap();
  });

  els.mapDirectionFilter?.addEventListener("change", () => {
    ui.activeMapDirection = els.mapDirectionFilter.value;
    renderFishMap();
  });

  els.mapAnglerFilter?.addEventListener("change", () => {
    ui.activeMapAngler = els.mapAnglerFilter.value;
    renderFishMap();
  });

  els.mapClearFilters?.addEventListener("click", () => {
    ui.activeMapSpecies = "All species";
    ui.activeMapLake = "All lakes";
    ui.activeMapMethod = "All methods";
    ui.activeMapDirection = "All directions";
    ui.activeMapAngler = "All anglers";
    ui.activeMapYear = "All years";
    renderFishMap();
  });

  els.mapYearFilter.addEventListener("change", () => {
    ui.activeMapYear = els.mapYearFilter.value;
    renderFishMap();
  });

  els.mapHideYearFilterToggle?.addEventListener("change", () => {
    ui.activeMapYearFilteringHidden = Boolean(els.mapHideYearFilterToggle.checked);
    renderFishMap();
  });

  els.mapTripPhotosToggle?.addEventListener("change", () => {
    ui.activeMapIncludeTripMedia = Boolean(els.mapTripPhotosToggle.checked);
    renderFishMap();
  });

  els.mapSpotsToggle?.addEventListener("change", () => {
    ui.activeMapIncludeSpots = Boolean(els.mapSpotsToggle.checked);
    renderFishMap();
  });

  els.mapDirectionArrowsToggle?.addEventListener("change", () => {
    ui.activeMapShowDirectionArrows = Boolean(els.mapDirectionArrowsToggle.checked);
    renderFishMap();
  });

  els.mapNoaaChartsToggle?.addEventListener("change", () => {
    ui.activeMapShowNOAACharts = Boolean(els.mapNoaaChartsToggle.checked);
    saveMapNoaaChartsPreference(ui.activeMapShowNOAACharts);
    syncMapPageChartOverlay(ui.fishMap);
  });

  els.tripSummaryBody.addEventListener("change", (event) => {
    if (!event.target.matches("#tripSummaryMapFilter")) return;
    ui.activeTripSummaryMapFilter = event.target.value;
    const trip = state.trips.find((item) => item.id === ui.activeSummaryTripId);
    if (trip) renderTripSummaryMap(trip);
  });

  els.galleryCategoryFilter.addEventListener("change", () => {
    ui.activeGalleryCategory = els.galleryCategoryFilter.value;
    if (ui.activeGalleryCategory !== "all") galleryUi.activeGalleryQuickFilter = ui.activeGalleryCategory;
    galleryUi.activeGalleryPage = 1;
    renderGallery();
  });

  els.gallerySearchInput?.addEventListener("input", syncGallerySearchSort);

  els.gallerySortSelect?.addEventListener("input", syncGallerySearchSort);

  els.galleryPageSizeSelect?.addEventListener("input", syncGallerySearchSort);

  els.galleryPreviousPageButton?.addEventListener("click", () => setGalleryPage(galleryUi.activeGalleryPage - 1));

  els.galleryNextPageButton?.addEventListener("click", () => setGalleryPage(galleryUi.activeGalleryPage + 1));

  els.gallerySelectModeButton?.addEventListener("click", () => setGallerySelectionMode(!gallerySelectionMode));

  els.galleryOrphanScanButton?.addEventListener("click", () => toggleGalleryOrphanScan());

  els.galleryBatchDownloadButton?.addEventListener("click", () => downloadGalleryItems(selectedGalleryPayload()));

  els.galleryBatchDeleteButton?.addEventListener("click", async () => {
    try {
      await deleteGalleryItems(selectedGalleryPayload());
    } catch (error) {
      console.error("Could not delete gallery media.", error);
      alert(error.message || "Selected media could not be deleted.");
    }
  });

  els.galleryClearSelectionButton?.addEventListener("click", () => {
    setGallerySelectionMode(false);
  });

  [els.searchInput, els.targetFilter, els.methodFilter, els.yearFilter].forEach((control) => {
    control.addEventListener("input", () => {
      renderTrips();
    });
  });

  els.sortSelect.addEventListener("input", () => {
    ui.activeTripSort = tripSortFromSelect(els.sortSelect.value);
    renderTrips();
  });

  bindChecklistEvents();
}
