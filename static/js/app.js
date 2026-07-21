const routeViews = {
  "/": "trips",
  "/trips": "trips",
  "/bests": "bests",
  "/stats": "stats",
  "/map": "map",
  "/gear": "gear",
  "/gallery": "gallery",
  "/settings": "settings"
};

function viewFromCurrentRoute() {
  const pathname = window.location.pathname.replace(/\/$/, "") || "/";
  return routeViews[pathname.toLowerCase()] || "trips";
}

els.newTripButton.addEventListener("click", () => openTripDialog());
els.tripForm.addEventListener("submit", saveTrip);
els.locationForm.addEventListener("submit", saveLocationPin);
els.deleteLocationDialogButton?.addEventListener("click", () => {
  deleteActiveLocationFromDialog().catch((error) => alert(error.message || "The location could not be deleted."));
});
els.tripRating.addEventListener("input", updateTripRatingLabel);
els.deleteTripButton.addEventListener("click", deleteActiveTrip);
els.addCatchButton.addEventListener("click", () => addCatchRow());
els.addLostFishButton.addEventListener("click", () => addLostFishRow());
els.addTripGearButton.addEventListener("click", () => addTripGearRow());
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
els.photoQueueInput.addEventListener("change", addPhotosToQueue);
els.lureForm.addEventListener("submit", saveLure);
document.querySelector("#lureType").addEventListener("change", updateLureDivingDepthField);
els.flasherForm.addEventListener("submit", saveFlasher);
els.reelForm.addEventListener("submit", saveReel);
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
  if (!trip || !confirm(`Delete ${trip.title || trip.location || "this trip"}?`)) return;
  state.trips = state.trips.filter((item) => item.id !== trip.id);
  activeSummaryTripId = null;
  try {
    await saveState();
    els.tripSummaryDialog.close();
    renderAll();
  } catch (error) {
    console.error("Could not delete trip.", error);
    alert(error.message || "The trip could not be deleted.");
  }
});
els.deleteLureButton.addEventListener("click", deleteLure);
els.deleteFlasherButton.addEventListener("click", deleteFlasher);
els.deleteReelButton.addEventListener("click", deleteReel);
els.deleteRodButton.addEventListener("click", deleteRod);
els.deleteComboButton.addEventListener("click", deleteCombo);
els.tripsViewButton.addEventListener("click", () => setView("trips"));
els.bestsViewButton.addEventListener("click", () => setView("bests"));
els.statsViewButton.addEventListener("click", () => setView("stats"));
els.mapViewButton.addEventListener("click", () => setView("map"));
els.gearViewButton.addEventListener("click", () => setView("gear"));
els.galleryViewButton.addEventListener("click", () => setView("gallery"));
els.settingsViewButton.addEventListener("click", () => setView("settings"));
els.newLibraryLureButton.addEventListener("click", () => openLureDialog());
els.newLibraryFlasherButton.addEventListener("click", () => openFlasherDialog());
els.newLibraryReelButton.addEventListener("click", () => openReelDialog());
els.newLibraryRodButton.addEventListener("click", () => openRodDialog());
els.newLibraryComboButton.addEventListener("click", () => openComboDialog());
els.saveChopRangesButton?.addEventListener("click", saveChopRanges);
els.themeSelect?.addEventListener("change", saveThemePreference);
els.timeFormatSelect?.addEventListener("change", saveTimeFormatPreference);
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
els.mapTripPhotosToggle?.addEventListener("change", () => {
  activeMapIncludeTripMedia = Boolean(els.mapTripPhotosToggle.checked);
  renderFishMap();
});
els.mapNoaaChartsToggle?.addEventListener("change", () => {
  activeMapShowNOAACharts = Boolean(els.mapNoaaChartsToggle.checked);
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
  renderGallery();
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

document.addEventListener("click", (event) => {
  const closeButton = event.target.closest("[data-close-dialog]");
  if (closeButton) {
    const dialog = closeButton.closest("dialog");
    if (dialog === els.tripDialog) closeTripDialog();
    else dialog.close();
  }

  const timelineFilterButton = event.target.closest("[data-timeline-filter]");
  if (timelineFilterButton) {
    activeTripTimelineFilter = timelineFilterButton.dataset.timelineFilter || "all";
    closeSummaryCatchDetail();
    refreshTripTimelinePanel();
  }

  const catchDetailButton = event.target.closest("[data-summary-catch-index]");
  if (catchDetailButton) {
    openSummaryCatchDetail(Number(catchDetailButton.dataset.summaryCatchIndex));
  }

  const catchGalleryThumb = event.target.closest("[data-catch-gallery-thumb]");
  if (catchGalleryThumb) {
    const gallery = catchGalleryThumb.closest("[data-catch-media-gallery]");
    if (gallery) refreshCatchMediaGallery(gallery, Number(catchGalleryThumb.dataset.photoIndex));
  }

  const catchGalleryOpen = event.target.closest("[data-catch-gallery-open]");
  if (catchGalleryOpen) {
    const gallery = catchGalleryOpen.closest("[data-catch-media-gallery]");
    if (gallery?.dataset.galleryContext === "summary") {
      openSummaryCatchDetail(Number(gallery.dataset.catchIndex), Number(catchGalleryOpen.dataset.openPhotoIndex || gallery.dataset.selectedIndex || 0));
    }
  }

  if (event.target.closest("[data-close-catch-detail]") || event.target.classList.contains("catch-detail-popout")) {
    closeSummaryCatchDetail();
  }

  const toggleRow = event.target.closest("[data-toggle-row]");
  if (toggleRow) {
    const row = toggleRow.closest(".catch-row, .gear-used-row");
    const collapsed = row.classList.toggle("collapsed");
    toggleRow.setAttribute("aria-expanded", String(!collapsed));
  }

  const statsViewButton = event.target.closest("[data-stats-view]");
  if (statsViewButton) {
    const card = statsViewButton.closest(".analytics-card");
    const toggle = statsViewButton.closest(".stats-view-toggle");
    const showChart = statsViewButton.dataset.statsView === "chart";
    card?.classList.toggle("show-chart", showChart);
    toggle?.querySelectorAll("button").forEach((button) => {
      button.classList.toggle("is-active", button === statsViewButton);
    });
  }

  const statsSortButton = event.target.closest("[data-stats-sort]");
  if (statsSortButton) {
    const table = statsSortButton.closest(".analytics-table");
    if (!table?.id) return;
    const index = Number(statsSortButton.dataset.statsSort);
    const current = activeStatsTableSort[table.id];
    activeStatsTableSort[table.id] = {
      index,
      direction: current?.index === index && current.direction === "desc" ? "asc" : "desc"
    };
    renderAdvancedStats();
  }

  const tripSortButton = event.target.closest("[data-trip-sort]");
  if (tripSortButton) {
    const key = tripSortButton.dataset.tripSort;
    activeTripSort = {
      key,
      direction: activeTripSort?.key === key && activeTripSort.direction === "desc" ? "asc" : "desc"
    };
    renderTrips();
  }

  const viewButton = event.target.closest("[data-view-trip]");
  if (viewButton) {
    const trip = state.trips.find((item) => item.id === viewButton.dataset.viewTrip);
    if (trip) openTripSummary(trip);
  }

  const mapTripTarget = event.target.closest("[data-map-view-trip]");
  if (mapTripTarget && !event.target.closest("a, button")) {
    const trip = state.trips.find((item) => item.id === mapTripTarget.dataset.mapViewTrip);
    if (trip) openTripSummary(trip);
  }

  const removeCatch = event.target.closest(".remove-catch");
  if (removeCatch) {
    removeCatch.closest(".catch-row").remove();
    updateAllRowSummaries();
    renderLiveTrollingSpread();
  }

  const removeTripGear = event.target.closest(".remove-trip-gear");
  if (removeTripGear) {
    removeTripGear.closest(".gear-used-row").remove();
    populateSetupLineSelects();
    updateAllRowSummaries();
    renderLiveTrollingSpread();
  }

  const removePerson = event.target.closest(".remove-person");
  if (removePerson) {
    const personId = removePerson.closest(".person-row").dataset.personId;
    removePerson.closest(".person-row").remove();
    document.querySelectorAll(".catch-person").forEach((select) => {
      if (select.value === personId) select.value = "";
    });
    populatePersonSelects();
  }

  const addPredefinedOption = event.target.closest(".add-predefined-option");
  if (addPredefinedOption) {
    const group = addPredefinedOption.closest(".predefined-field-group");
    const list = group?.querySelector(".predefined-option-list");
    const index = list?.querySelectorAll(".predefined-option-row").length || 0;
    list?.insertAdjacentHTML("beforeend", `
      <div class="predefined-option-row" data-option-index="${index}">
        <input class="predefined-option-label" type="text" value="" aria-label="New predefined option" />
        <button class="button danger remove-predefined-option" type="button">Delete</button>
      </div>
    `);
    updatePredefinedFieldCount(group);
    list?.querySelector(".predefined-option-row:last-child .predefined-option-label")?.focus();
    scheduleSettingsAutosave((options) => savePredefinedFieldSettings({ ...options, rerender: false }));
  }

  const removePredefinedOption = event.target.closest(".remove-predefined-option");
  if (removePredefinedOption) {
    const group = removePredefinedOption.closest(".predefined-field-group");
    removePredefinedOption.closest(".predefined-option-row")?.remove();
    updatePredefinedFieldCount(group);
    scheduleSettingsAutosave((options) => savePredefinedFieldSettings({ ...options, rerender: false }), 150);
  }

  const removeNotePhoto = event.target.closest(".remove-note-photo");
  if (removeNotePhoto) {
    const card = removeNotePhoto.closest("[data-note-photo]");
    activeNotePhotos = activeNotePhotos.filter((photo) => photo.id !== card.dataset.notePhoto);
    renderNotePhotos();
  }

  const removeCatchPhoto = event.target.closest(".remove-catch-photo");
  if (removeCatchPhoto) {
    const row = removeCatchPhoto.closest(".catch-row");
    const card = removeCatchPhoto.closest("[data-catch-photo]");
    row.catchPhotos = (row.catchPhotos || []).filter((photo) => photo.id !== card.dataset.catchPhoto);
    renderCatchPhotos(row);
    updateRowSummary(row);
  }

  const tripQueueButton = event.target.closest("[data-use-photo-queue='trip-photos']");
  if (tripQueueButton) {
    openPhotoQueue({ type: "trip", category: "trip-photos" });
  }

  const lureQueueButton = event.target.closest("[data-use-photo-queue='lures']");
  if (lureQueueButton) {
    openPhotoQueue({ type: "lure", category: "lures" });
  }

  const flasherQueueButton = event.target.closest("[data-use-photo-queue='flashers']");
  if (flasherQueueButton) {
    openPhotoQueue({ type: "flasher", category: "flashers" });
  }

  const reelQueueButton = event.target.closest("[data-use-photo-queue='reels']");
  if (reelQueueButton) {
    openPhotoQueue({ type: "reel", category: "reels" });
  }

  const rodQueueButton = event.target.closest("[data-use-photo-queue='rods']");
  if (rodQueueButton) {
    openPhotoQueue({ type: "rod", category: "rods" });
  }

  const catchQueueButton = event.target.closest(".use-catch-photo-queue");
  if (catchQueueButton && !catchQueueButton.closest(".lost-fish-row")) {
    openPhotoQueue({
      type: "catch",
      category: "catch-photos",
      row: catchQueueButton.closest(".catch-row")
    });
  }

  const pickCatchLocationButton = event.target.closest(".pick-catch-location");
  if (pickCatchLocationButton) {
    openCatchLocationDialog(pickCatchLocationButton.closest(".catch-row"));
  }

  const selectQueuedPhoto = event.target.closest("[data-select-queued-photo]");
  if (selectQueuedPhoto) {
    if (event.target.closest("[data-delete-queued-photo]")) return;
    claimQueuedPhoto(selectQueuedPhoto.dataset.selectQueuedPhoto);
  }

  const editTripButton = event.target.closest("[data-edit-trip]");
  if (editTripButton) {
    const trip = state.trips.find((item) => item.id === editTripButton.dataset.editTrip);
    if (trip) {
      openTripDialog(trip);
      const sectionId = editTripButton.dataset.tripSection;
      if (sectionId) {
        requestAnimationFrame(() => {
          const target = editTripButton.dataset.setupId
            ? document.querySelector(`.gear-used-row[data-gear-id="${CSS.escape(editTripButton.dataset.setupId)}"]`)
            : document.querySelector(`#${sectionId}`);
          target?.scrollIntoView({ block: "start" });
          if (target?.classList.contains("gear-used-row")) {
            target.classList.add("diagnostic-highlight");
            setTimeout(() => target.classList.remove("diagnostic-highlight"), 2600);
          }
        });
      }
    }
  }

  const deleteQueuedPhotoButton = event.target.closest("[data-delete-queued-photo]");
  if (deleteQueuedPhotoButton) {
    deleteQueuedPhoto(deleteQueuedPhotoButton.dataset.deleteQueuedPhoto);
  }

  const editManagedLocation = event.target.closest("[data-edit-managed-location]");
  if (editManagedLocation) {
    event.preventDefault();
    event.stopPropagation();
    openLocationDialog("location", editManagedLocation.dataset.editManagedLocation);
  }

  const addManagedLaunch = event.target.closest("[data-add-managed-launch]");
  if (addManagedLaunch) {
    event.preventDefault();
    openLocationDialog("launch", addManagedLaunch.dataset.addManagedLaunch);
  }

  const deleteManagedLocationButton = event.target.closest("[data-delete-managed-location]");
  if (deleteManagedLocationButton) {
    event.preventDefault();
    event.stopPropagation();
    deleteManagedLocation(deleteManagedLocationButton.dataset.deleteManagedLocation)
      .catch((error) => alert(error.message || "The waterbody could not be deleted."));
  }

  const editManagedLaunch = event.target.closest("[data-edit-managed-launch]");
  if (editManagedLaunch) {
    event.preventDefault();
    event.stopPropagation();
    openLocationDialog("launch", editManagedLaunch.dataset.locationId, editManagedLaunch.dataset.editManagedLaunch);
  }

  const deleteManagedLaunchButton = event.target.closest("[data-delete-managed-launch]");
  if (deleteManagedLaunchButton) {
    event.preventDefault();
    event.stopPropagation();
    deleteManagedLaunch(deleteManagedLaunchButton.dataset.locationId, deleteManagedLaunchButton.dataset.deleteManagedLaunch)
      .catch((error) => alert(error.message || "The launch could not be deleted."));
  }

  const deletePrivateLocationButton = event.target.closest("[data-delete-private-location]");
  if (deletePrivateLocationButton) {
    const next = collectPrivatePhotoLocationSettings().filter((location) => location.id !== deletePrivateLocationButton.dataset.deletePrivateLocation);
    activePrivatePhotoLocationId = next[0]?.id || "";
    if (privateLocationNameEditId === deletePrivateLocationButton.dataset.deletePrivateLocation) privateLocationNameEditId = "";
    savePrivatePhotoLocations(next);
  }

  const editPrivateLocationName = event.target.closest("[data-edit-private-location-name]");
  if (editPrivateLocationName) {
    activePrivatePhotoLocationId = editPrivateLocationName.dataset.editPrivateLocationName;
    privateLocationNameEditId = activePrivatePhotoLocationId;
    renderPrivatePhotoLocationSettings();
    const input = els.privatePhotoLocationList?.querySelector(`[data-private-location-id="${CSS.escape(privateLocationNameEditId)}"] .private-location-name`);
    input?.focus();
    input?.select();
  }

  const privateLocationCard = event.target.closest("[data-private-location-id]");
  if (privateLocationCard && !event.target.closest("[data-edit-private-location-name], button, input, select, textarea")) {
    activePrivatePhotoLocationId = privateLocationCard.dataset.privateLocationId;
    renderPrivatePhotoLocationSettings();
  }

  const newLureButton = event.target.closest(".add-lure-inline");
  if (newLureButton) {
    const row = newLureButton.closest(".catch-row, .gear-used-row");
    openLureDialog(null, row.dataset.rowId);
  }

  const newFlasherButton = event.target.closest(".add-flasher-inline");
  if (newFlasherButton) {
    const row = newFlasherButton.closest(".catch-row, .gear-used-row");
    openFlasherDialog(null, row.dataset.rowId);
  }

  const gearTabButton = event.target.closest("[data-gear-tab]");
  if (gearTabButton) {
    setGearTab(gearTabButton.dataset.gearTab);
  }

  const editReelButton = event.target.closest("[data-edit-reel]");
  if (editReelButton) {
    const reel = state.reels.find((item) => item.id === editReelButton.dataset.editReel);
    if (reel) openReelDialog(reel);
  }

  const editRodButton = event.target.closest("[data-edit-rod]");
  if (editRodButton) {
    const rod = state.rods.find((item) => item.id === editRodButton.dataset.editRod);
    if (rod) openRodDialog(rod);
  }

  const editComboButton = event.target.closest("[data-edit-combo]");
  if (editComboButton) {
    const combo = state.rodReelCombos.find((item) => item.id === editComboButton.dataset.editCombo);
    if (combo) openComboDialog(combo);
  }

  const editLureButton = event.target.closest("[data-edit-lure]");
  if (editLureButton) {
    const lure = state.lures.find((item) => item.id === editLureButton.dataset.editLure);
    if (lure) openLureDialog(lure);
  }

  const spreadLureButton = event.target.closest("[data-spread-lure-id]");
  if (spreadLureButton) {
    const lure = state.lures.find((item) => item.id === spreadLureButton.dataset.spreadLureId);
    if (lure) openLureInfoDialog(lure, "spread-preview");
  }

  const spreadFlasherButton = event.target.closest("[data-spread-flasher-id]");
  if (spreadFlasherButton) {
    const flasher = state.flashers.find((item) => item.id === spreadFlasherButton.dataset.spreadFlasherId);
    if (flasher) openFlasherInfoDialog(flasher, "spread-preview");
  }

  const editFlasherButton = event.target.closest("[data-edit-flasher]");
  if (editFlasherButton) {
    const flasher = state.flashers.find((item) => item.id === editFlasherButton.dataset.editFlasher);
    if (flasher) openFlasherDialog(flasher);
  }

  const deleteLureButton = event.target.closest("[data-delete-lure]");
  if (deleteLureButton) {
    setValue("editingLureId", deleteLureButton.dataset.deleteLure);
    deleteLure();
  }

  const deleteFlasherButton = event.target.closest("[data-delete-flasher]");
  if (deleteFlasherButton) {
    setValue("editingFlasherId", deleteFlasherButton.dataset.deleteFlasher);
    deleteFlasher();
  }
});

document.addEventListener("change", (event) => {
  if (event.target.matches(".catch-photo-input")) {
    addCatchPhotos(event);
    return;
  }
  if (event.target.matches("#lureImage")) {
    pendingLureImage = null;
    renderQueuedGearImage("lure");
  }
  if (event.target.matches("#flasherImage")) {
    pendingFlasherImage = null;
    renderQueuedGearImage("flasher");
  }
  if (event.target.matches("#reelImage")) {
    pendingReelImage = null;
    renderQueuedGearImage("reel");
  }
  if (event.target.matches("#rodImage")) {
    pendingRodImage = null;
    renderQueuedGearImage("rod");
  }
  if (event.target.matches("#startTime, #endTime")) {
    syncTripTimesToBlankRows();
    scheduleTripWeatherPreview(true);
  }
  if (event.target.matches("#tripDate, #tripLocation, #tripLaunch")) {
    if (event.target.matches("#tripLocation")) populateLaunchSelect();
    updateLocationControls();
  }
  if (event.target.matches("#waveHeight")) {
    updateAutoWaveChopDisplay();
    scheduleTripWeatherPreview(true);
  }
  if (event.target.closest("#tripForm")) clearTripFormMessage();
  if (event.target.matches(".catch-lure, .trip-gear-lure, .trip-gear-cheater-lure")) {
    if (event.target.value.startsWith("__type__:")) {
      populateLuresForType(event.target, event.target.value.replace("__type__:", ""));
      reopenLurePicker(event.target);
      return;
    }
    if (!event.target.value && event.target.dataset.lurePickerMode === "lures") {
      renderLureTypeOptions(event.target);
    }
    renderLurePreview(event.target.closest(".catch-row, .gear-used-row"));
  }
  if (event.target.matches(".catch-rod")) {
    syncDirectCatchRodToLure(event.target.closest(".catch-row"));
  }
  if (event.target.matches(".catch-flasher, .trip-gear-flasher")) {
    renderFlasherPreview(event.target.closest(".catch-row, .gear-used-row"));
  }
  if (event.target.matches(".trip-gear-combo")) {
    syncComboToRow(event.target.closest(".gear-used-row"));
    populateSetupLineSelects();
    populateCatchRodSelects();
  }
  if (event.target.matches(".catch-setup-line")) {
    syncCatchMethodToSetupLine(event.target.closest(".catch-row"));
  }
  if (event.target.matches(".catch-time-unknown")) {
    updateUnknownTimeField(event.target.closest(".catch-row"));
  }
  if (event.target.matches(".catch-details-unknown")) {
    updateCatchDetailsUnknown(event.target.closest(".catch-row"), { clear: event.target.checked });
  }
  if (event.target.matches(".catch-presentation, .trip-gear-cheater, .trip-gear-leadcore, .catch-deepest-rigger")) {
    updatePresentationFields(event.target.closest(".catch-row, .gear-used-row"));
    document.querySelectorAll(".catch-row").forEach(updatePresentationFields);
    document.querySelectorAll(".catch-row.details-unknown").forEach(updateCatchDetailsUnknown);
  }
  if (event.target.matches(".trip-gear-lure, .trip-gear-flasher, .trip-gear-combo, .trip-gear-rod, .trip-gear-reel, .trip-gear-side, .trip-gear-start-time, .trip-gear-end-time, .catch-presentation, .trip-gear-line-label, .trip-gear-cheater, .trip-gear-cheater-lure, .trip-gear-leadcore")) {
    populateSetupLineSelects();
    populateCatchRodSelects();
  }
  const row = event.target.closest(".catch-row, .gear-used-row");
  if (row) updateRowSummary(row);
  if (event.target.closest("#tripForm")) renderLiveTrollingSpread();
});

document.addEventListener("input", (event) => {
  if (event.target.matches("#startTime, #endTime")) {
    syncTripTimesToBlankRows();
    scheduleTripWeatherPreview(true);
  }
  if (event.target.matches("#tripDate, #tripLocation, #tripLaunch")) {
    updateLocationControls();
  }
  if (event.target.matches("#waveHeight")) {
    updateAutoWaveChopDisplay();
  }
  if (event.target.matches("#locationLatitude, #locationLongitude")) {
    const coordinates = locationFormCoordinates();
    if (coordinates) setLocationFormCoordinates(coordinates);
  }
  if (event.target.closest("#tripForm")) clearTripFormMessage();
  if (event.target.matches(".trip-gear-line-label, .trip-gear-start-time, .trip-gear-end-time")) {
    populateSetupLineSelects();
  }
  if (event.target.matches(".catch-ball-depth")) {
    updateCheaterDepth(event.target.closest(".catch-row"));
  }
  if (event.target.matches(".catch-leadcore-colors")) {
    updateLeadcoreEstimatedDepth(event.target.closest(".catch-row"));
  }
  const row = event.target.closest(".catch-row, .gear-used-row");
  if (row) updateRowSummary(row);
  if (event.target.closest("#tripForm")) renderLiveTrollingSpread();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && document.querySelector("#catchDetailPopout")) {
    closeSummaryCatchDetail();
    return;
  }
  const queuedPhotoCard = event.target.closest?.(".photo-queue-card[data-select-queued-photo]");
  if (queuedPhotoCard && ["Enter", " "].includes(event.key)) {
    event.preventDefault();
    claimQueuedPhoto(queuedPhotoCard.dataset.selectQueuedPhoto);
    return;
  }
  const mapTripTarget = event.target.closest?.("[data-map-view-trip]");
  if (mapTripTarget && !event.target.closest("a, button") && ["Enter", " "].includes(event.key)) {
    event.preventDefault();
    const trip = state.trips.find((item) => item.id === mapTripTarget.dataset.mapViewTrip);
    if (trip) openTripSummary(trip);
    return;
  }
  const catchDetailCard = event.target.closest?.(".timeline-catch-card[data-summary-catch-index]");
  if (!catchDetailCard || !["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  openSummaryCatchDetail(Number(catchDetailCard.dataset.summaryCatchIndex));
});


function updateMethodVisibility() {
  updateTrollingVisibility();
  document.querySelectorAll(".catch-row.details-unknown").forEach(updateCatchDetailsUnknown);
}

document.querySelector("#method").addEventListener("input", updateMethodVisibility);
document.querySelector("#method").addEventListener("change", updateMethodVisibility);
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
  const showingBests = view === "bests";
  const showingStats = view === "stats";
  const showingMap = view === "map";
  const showingGear = view === "gear";
  const showingGallery = view === "gallery";
  const showingSettings = view === "settings";
  const viewButtons = {
    trips: els.tripsViewButton,
    bests: els.bestsViewButton,
    stats: els.statsViewButton,
    map: els.mapViewButton,
    gear: els.gearViewButton,
    gallery: els.galleryViewButton,
    settings: els.settingsViewButton,
  };
  const viewTitles = {
    trips: "Trips",
    bests: "Personal Bests",
    stats: "Stats",
    map: "Map",
    gear: "Gear",
    gallery: "Gallery",
    settings: "Settings",
  };
  document.body.dataset.activeView = view;
  els.tripControls.classList.toggle("hidden", showingBests || showingStats || showingMap || showingGear || showingGallery || showingSettings);
  els.tripListPanel.classList.toggle("hidden", showingBests || showingStats || showingMap || showingGear || showingGallery || showingSettings);
  els.personalBestsPanel.classList.toggle("hidden", !showingBests);
  els.advancedStatsPanel.classList.toggle("hidden", !showingStats);
  els.mapPanel.classList.toggle("hidden", !showingMap);
  els.gearPanel.classList.toggle("hidden", !showingGear);
  els.galleryPanel.classList.toggle("hidden", !showingGallery);
  els.settingsPanel.classList.toggle("hidden", !showingSettings);
  Object.entries(viewButtons).forEach(([buttonView, button]) => {
    button.classList.toggle("is-active", buttonView === view);
    button.setAttribute("aria-current", buttonView === view ? "page" : "false");
  });
  document.querySelector(".topbar h2").textContent = viewTitles[view] || "Trips";
  if (showingBests) renderPersonalBests();
  renderAdvancedStats();
  if (showingMap) renderFishMap();
  if (showingGallery) renderGallery();
  if (showingSettings) renderSettings();
  renderGearLibrary();
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
  renderAll();
  setView(viewFromCurrentRoute());
}

window.addEventListener("resize", syncMobileSummaryPanel);
init();
