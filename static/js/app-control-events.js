let activeStructureSelect = null;

function setStructureFormMessage(message = "") {
  if (!els.structureFormMessage) return;
  els.structureFormMessage.textContent = message;
  els.structureFormMessage.classList.toggle("hidden", !message);
}

function openStructureDialog(select) {
  activeStructureSelect = select;
  els.structureNameInput.value = "";
  setStructureFormMessage();
  els.structureDialog.showModal();
  requestAnimationFrame(() => els.structureNameInput.focus());
}

function resetStructureDialog() {
  if (activeStructureSelect?.value === "__new__") {
    activeStructureSelect.value = "";
    populateStructureSelect(activeStructureSelect, "");
  }
  activeStructureSelect = null;
  els.structureForm.reset();
  setStructureFormMessage();
}

async function saveStructureOption(event) {
  event.preventDefault();
  const value = String(els.structureNameInput.value || "").trim();
  if (!value) {
    setStructureFormMessage("Enter a structure name to continue.");
    els.structureNameInput.focus();
    return;
  }

  const select = activeStructureSelect;
  upsertListValue("structureOptions", value);
  if (select) populateStructureSelect(select, value);
  activeStructureSelect = null;
  els.structureDialog.close();
  saveState().catch((error) => console.error("Could not save structure option.", error));
}

els.newTripButton.addEventListener("click", () => openTripDialog());
els.tripForm.addEventListener("submit", saveTrip);
els.saveTripDraftButtons.forEach((button) => button.addEventListener("click", saveTripAsDraft));
els.tripForm.addEventListener("keydown", (event) => {
  if (event.key === "Enter") event.preventDefault();
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
els.exportDatabaseButton?.addEventListener("click", exportDatabaseArchive);
els.importDatabaseButton?.addEventListener("click", () => els.importDatabaseInput?.click());
els.importDatabaseInput?.addEventListener("change", importDatabaseArchive);
els.photoQueueInput.addEventListener("change", addPhotosToQueue);
els.lureForm.addEventListener("submit", saveLure);
document.querySelector("#lureType").addEventListener("change", updateLureDivingDepthField);
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
els.photoQueueDialog.addEventListener("close", restoreDialogAfterPhotoQueue);
els.saveCatchLocationButton?.addEventListener("click", saveCatchLocationFromPicker);
els.clearCatchLocationButton?.addEventListener("click", clearActiveCatchLocation);
els.tripDialog.addEventListener("cancel", (event) => {
  if (!isTripFormDirty()) return;
  event.preventDefault();
  closeTripDialog();
});
els.summaryEditTripButton.addEventListener("click", () => {
  const trip = state.trips.find((item) => item.id === activeSummaryTripId);
  if (!trip) return;
  els.tripSummaryDialog.close();
  openTripDialog(trip);
});
els.summaryDeleteTripButton.addEventListener("click", async () => {
  const trip = state.trips.find((item) => item.id === activeSummaryTripId);
  if (!trip) return;
  try {
    await deleteTripById(trip.id, { closeSummary: true });
  } catch (error) {
    console.error("Could not delete trip.", error);
    alert(error.message || "The trip could not be deleted.");
  }
});
els.summaryShareTripButton?.addEventListener("click", () => {
  const trip = state.trips.find((item) => item.id === activeSummaryTripId);
  if (trip) openTripShareStudio(trip);
});
els.deleteLureButton.addEventListener("click", deleteLure);
els.deleteFlasherButton.addEventListener("click", deleteFlasher);
els.deleteReelButton.addEventListener("click", deleteReel);
els.deleteRodButton.addEventListener("click", deleteRod);
els.deleteComboButton.addEventListener("click", deleteCombo);
els.tripsViewButton.addEventListener("click", () => setView("trips"));
els.expeditionsViewButton.addEventListener("click", () => setView("expeditions"));
els.bestsViewButton.addEventListener("click", () => setView("bests"));
els.statsViewButton.addEventListener("click", () => setView("stats"));
els.leaderboardViewButton.addEventListener("click", () => setView("leaderboard"));
els.mapViewButton.addEventListener("click", () => setView("map"));
els.gearViewButton.addEventListener("click", () => setView("gear"));
els.boatViewButton.addEventListener("click", () => setView("boat"));
els.galleryViewButton.addEventListener("click", () => setView("gallery"));
els.settingsViewButton.addEventListener("click", () => setView("settings"));
els.newLibraryLureButton.addEventListener("click", () => openLureDialog());
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
els.saveChopRangesButton?.addEventListener("click", saveChopRanges);
document.querySelectorAll("[data-theme-option]").forEach((input) => input.addEventListener("change", saveThemePreference));
els.timeFormatSelect?.addEventListener("change", saveTimeFormatPreference);
els.defaultHomeLakeSelect?.addEventListener("change", () => saveDefaultHomeLake({ autosave: true }));
els.boatFeatureEnabled?.addEventListener("change", () => saveBoatFeaturePreference({ autosave: true }));
els.gearFilterField?.addEventListener("change", updateGearFilter);
els.gearFilterQuery?.addEventListener("input", updateGearFilter);
els.gearFilterQuery?.addEventListener("focus", openGearFilterSuggestions);
els.gearFilterQuery?.addEventListener("blur", () => setTimeout(closeGearFilterSuggestions, 120));
els.clearGearFilterButton?.addEventListener("click", clearGearFilter);
els.addDefaultTrollingSpreadRowButton?.addEventListener("click", addDefaultTrollingSpreadRow);
els.defaultTrollingSpreadRows?.addEventListener("change", () => {
  const targetSpecies = activeDefaultTrollingSpreadTargetSpecies;
  const spread = collectDefaultTrollingSpreadSettings();
  updateDefaultTrollingSpreadSettings(targetSpecies, spread);
  renderDefaultTrollingSpreadPreview();
  scheduleSettingsAutosave((options) => saveDefaultTrollingSpreadSettings({ ...options, rerender: false, targetSpecies, spread }));
});
els.defaultTrollingSpreadTargetSpecies?.addEventListener("change", () => {
  const targetSpecies = activeDefaultTrollingSpreadTargetSpecies;
  const spread = collectDefaultTrollingSpreadSettings();
  updateDefaultTrollingSpreadSettings(targetSpecies, spread);
  scheduleSettingsAutosave((options) => saveDefaultTrollingSpreadSettings({ ...options, rerender: false, targetSpecies, spread }));
  activeDefaultTrollingSpreadTargetSpecies = els.defaultTrollingSpreadTargetSpecies.value;
  renderDefaultTrollingSpreadSettings();
});
document.querySelectorAll("[data-settings-tab]").forEach((tab) => {
  tab.addEventListener("click", () => setSettingsTab(tab.dataset.settingsTab));
});
document.querySelectorAll("[data-time-format-option]").forEach((input) => {
  input.addEventListener("change", saveTimeFormatPreference);
});
els.editChopRangesButton?.addEventListener("click", toggleChopRangeEditing);
els.cancelChopRangesButton?.addEventListener("click", cancelChopRangeEditing);
els.settingsCancelButton?.addEventListener("click", renderSettings);
els.settingsSaveNowButton?.addEventListener("click", saveCurrentSettingsTab);
els.saveUnitSettingsButton?.addEventListener("click", saveUnitSettings);
document.querySelector("#savePredefinedFieldsButton")?.addEventListener("click", savePredefinedFieldSettings);
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
  if (card) activePrivatePhotoLocationId = card.dataset.privateLocationId;
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
  if (card) activeFishingSpotId = card.dataset.fishingSpotId;
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
  activePrivatePhotoLocationId = id;
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
  activeFishingSpotId = id;
  await saveFishingSpots([
    ...collectFishingSpotSettings(),
    { id, name: nextFishingSpotName(), radiusMeters: 100, coordinates: fishingSpotDefaultCoordinates() }
  ]);
});
els.statsMethodFilter.addEventListener("change", () => {
  activeStatsMethod = els.statsMethodFilter.value;
  syncStatsUrl();
  renderAdvancedStats();
});
els.statsDateFilter?.addEventListener("change", () => {
  activeStatsDateRange = els.statsDateFilter.value;
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
  activeStatsSort = els.statsSortFilter.value;
  syncStatsUrl();
  renderAdvancedStats();
});
els.statsMinTripsInput?.addEventListener("input", () => {
  activeStatsMinTrips = Math.max(0, Math.floor(Number(els.statsMinTripsInput.value) || 0));
  syncStatsUrl();
  renderAdvancedStats();
});
els.statsMinHoursInput?.addEventListener("input", () => {
  activeStatsMinHours = Math.max(0, Number(els.statsMinHoursInput.value) || 0);
  syncStatsUrl();
  renderAdvancedStats();
});
els.statsIncludeLostToggle?.addEventListener("change", () => {
  activeStatsIncludeLost = Boolean(els.statsIncludeLostToggle.checked);
  syncStatsUrl();
  renderAdvancedStats();
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

function syncStatsUrl() {
  if (window.location.pathname !== "/stats") return;
  const params = new URLSearchParams();
  if (activeStatsDateRange !== "all") params.set("range", activeStatsDateRange);
  if (activeStatsMethod !== "All methods") params.set("method", activeStatsMethod);
  if (activeStatsSort !== "fishPerHour") params.set("sort", activeStatsSort);
  if (activeStatsMinTrips) params.set("minTrips", String(activeStatsMinTrips));
  if (activeStatsMinHours) params.set("minHours", String(activeStatsMinHours));
  if (activeStatsIncludeLost) params.set("outcome", "strikes");
  Object.entries(activeStatsFilters).forEach(([key, value]) => {
    if (value && !value.startsWith("All ")) params.set(key, value);
  });
  const query = params.toString();
  history.replaceState(null, "", `/stats${query ? `?${query}` : ""}`);
}
els.mapSpeciesFilter.addEventListener("change", () => {
  activeMapSpecies = els.mapSpeciesFilter.value;
  renderFishMap();
});
els.mapYearFilter.addEventListener("change", () => {
  activeMapYear = els.mapYearFilter.value;
  renderFishMap();
});
els.mapHideYearFilterToggle?.addEventListener("change", () => {
  activeMapYearFilteringHidden = Boolean(els.mapHideYearFilterToggle.checked);
  renderFishMap();
});
els.mapTripPhotosToggle?.addEventListener("change", () => {
  activeMapIncludeTripMedia = Boolean(els.mapTripPhotosToggle.checked);
  renderFishMap();
});
els.mapNoaaChartsToggle?.addEventListener("change", () => {
  activeMapShowNOAACharts = Boolean(els.mapNoaaChartsToggle.checked);
  saveMapNoaaChartsPreference(activeMapShowNOAACharts);
  syncMapPageChartOverlay(fishMap);
});
els.tripSummaryBody.addEventListener("change", (event) => {
  if (!event.target.matches("#tripSummaryMapFilter")) return;
  activeTripSummaryMapFilter = event.target.value;
  const trip = state.trips.find((item) => item.id === activeSummaryTripId);
  if (trip) renderTripSummaryMap(trip);
});
els.galleryCategoryFilter.addEventListener("change", () => {
  activeGalleryCategory = els.galleryCategoryFilter.value;
  if (activeGalleryCategory !== "all") activeGalleryQuickFilter = activeGalleryCategory;
  activeGalleryPage = 1;
  renderGallery();
});
els.gallerySearchInput?.addEventListener("input", syncGallerySearchSort);
els.gallerySortSelect?.addEventListener("input", syncGallerySearchSort);
els.galleryPageSizeSelect?.addEventListener("input", syncGallerySearchSort);
els.galleryPreviousPageButton?.addEventListener("click", () => setGalleryPage(activeGalleryPage - 1));
els.galleryNextPageButton?.addEventListener("click", () => setGalleryPage(activeGalleryPage + 1));
els.gallerySelectModeButton?.addEventListener("click", () => setGallerySelectionMode(!gallerySelectionMode));
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
  activeTripSort = tripSortFromSelect(els.sortSelect.value);
  renderTrips();
});
