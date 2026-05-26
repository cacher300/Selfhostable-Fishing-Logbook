els.newTripButton.addEventListener("click", () => openTripDialog());
els.tripForm.addEventListener("submit", saveTrip);
els.locationForm.addEventListener("submit", saveLocationPin);
els.tripRating.addEventListener("input", updateTripRatingLabel);
els.deleteTripButton.addEventListener("click", deleteActiveTrip);
els.addCatchButton.addEventListener("click", () => addCatchRow());
els.addLostFishButton.addEventListener("click", () => addLostFishRow());
els.addTripGearButton.addEventListener("click", () => addTripGearRow());
els.addPersonButton.addEventListener("click", () => addPersonRow());
els.addLocationButton.addEventListener("click", () => openLocationDialog("location"));
els.addLaunchButton.addEventListener("click", () => openLocationDialog("launch", els.tripLocation.value));
els.notePhotoInput.addEventListener("change", addNotePhotos);
els.photoQueueButton.addEventListener("click", () => {
  els.photoQueueButton.closest("details")?.removeAttribute("open");
  openPhotoQueue();
});
els.photoQueueInput.addEventListener("change", addPhotosToQueue);
els.lureForm.addEventListener("submit", saveLure);
els.flasherForm.addEventListener("submit", saveFlasher);
els.lureDialog.addEventListener("close", () => restoreTripDialogAfterInlineGear("lure"));
els.flasherDialog.addEventListener("close", () => restoreTripDialogAfterInlineGear("flasher"));
els.photoQueueDialog.addEventListener("close", restoreDialogAfterPhotoQueue);
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
els.tripsViewButton.addEventListener("click", () => setView("trips"));
els.statsViewButton.addEventListener("click", () => setView("stats"));
els.patternsViewButton.addEventListener("click", () => setView("patterns"));
els.mapViewButton.addEventListener("click", () => setView("map"));
els.gearViewButton.addEventListener("click", () => setView("gear"));
els.galleryViewButton.addEventListener("click", () => setView("gallery"));
els.newLibraryLureButton.addEventListener("click", () => openLureDialog());
els.newLibraryFlasherButton.addEventListener("click", () => openFlasherDialog());
els.exportButton.addEventListener("click", exportJson);
els.importInput.addEventListener("change", importJson);
els.statsMethodFilter.addEventListener("change", () => {
  activeStatsMethod = els.statsMethodFilter.value;
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
    renderAdvancedStats();
  });
});
els.mapSpeciesFilter.addEventListener("change", () => {
  activeMapSpecies = els.mapSpeciesFilter.value;
  renderFishMap();
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
[
  ["species", els.patternSpeciesFilter],
  ["location", els.patternLocationFilter],
  ["method", els.patternMethodFilter],
  ["month", els.patternMonthFilter],
  ["waterClarity", els.patternWaterClarityFilter],
  ["weather", els.patternWeatherFilter],
  ["wind", els.patternWindFilter],
  ["pressure", els.patternPressureFilter],
  ["cloud", els.patternCloudFilter],
  ["airTemp", els.patternAirTempFilter],
  ["front", els.patternFrontFilter]
].forEach(([key, control]) => {
  control.addEventListener("change", () => {
    activePatternFilters[key] = control.value;
    renderPatterns();
  });
});

[els.searchInput, els.targetFilter, els.yearFilter, els.sortSelect].forEach((control) => {
  control.addEventListener("input", () => {
    renderTrips();
  });
});

document.addEventListener("click", (event) => {
  const closeButton = event.target.closest("[data-close-dialog]");
  if (closeButton) closeButton.closest("dialog").close();

  const toggleRow = event.target.closest("[data-toggle-row]");
  if (toggleRow) {
    const row = toggleRow.closest(".catch-row, .gear-used-row");
    const collapsed = row.classList.toggle("collapsed");
    toggleRow.setAttribute("aria-expanded", String(!collapsed));
  }

  const viewButton = event.target.closest("[data-view-trip]");
  if (viewButton) {
    const trip = state.trips.find((item) => item.id === viewButton.dataset.viewTrip);
    if (trip) openTripSummary(trip);
  }

  const removeCatch = event.target.closest(".remove-catch");
  if (removeCatch) {
    removeCatch.closest(".catch-row").remove();
    updateAllRowSummaries();
  }

  const removeTripGear = event.target.closest(".remove-trip-gear");
  if (removeTripGear) {
    removeTripGear.closest(".gear-used-row").remove();
    populateSetupLineSelects();
    updateAllRowSummaries();
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

  const catchQueueButton = event.target.closest(".use-catch-photo-queue");
  if (catchQueueButton && !catchQueueButton.closest(".lost-fish-row")) {
    openPhotoQueue({
      type: "catch",
      category: "catch-photos",
      row: catchQueueButton.closest(".catch-row")
    });
  }

  const selectQueuedPhoto = event.target.closest("[data-select-queued-photo]");
  if (selectQueuedPhoto) {
    claimQueuedPhoto(selectQueuedPhoto.dataset.selectQueuedPhoto);
  }

  const deleteQueuedPhotoButton = event.target.closest("[data-delete-queued-photo]");
  if (deleteQueuedPhotoButton) {
    deleteQueuedPhoto(deleteQueuedPhotoButton.dataset.deleteQueuedPhoto);
  }

  const deleteOrphanMediaButton = event.target.closest("[data-delete-orphan-media]");
  if (deleteOrphanMediaButton) {
    deleteOrphanMedia(
      deleteOrphanMediaButton.dataset.deleteOrphanCategory,
      deleteOrphanMediaButton.dataset.deleteOrphanMedia
    );
  }

  const editManagedLocation = event.target.closest("[data-edit-managed-location]");
  if (editManagedLocation) {
    openLocationDialog("location", editManagedLocation.dataset.editManagedLocation);
  }

  const deleteManagedLocationButton = event.target.closest("[data-delete-managed-location]");
  if (deleteManagedLocationButton) {
    deleteManagedLocation(deleteManagedLocationButton.dataset.deleteManagedLocation)
      .catch((error) => alert(error.message || "The waterbody could not be deleted."));
  }

  const editManagedLaunch = event.target.closest("[data-edit-managed-launch]");
  if (editManagedLaunch) {
    openLocationDialog("launch", editManagedLaunch.dataset.locationId, editManagedLaunch.dataset.editManagedLaunch);
  }

  const deleteManagedLaunchButton = event.target.closest("[data-delete-managed-launch]");
  if (deleteManagedLaunchButton) {
    deleteManagedLaunch(deleteManagedLaunchButton.dataset.locationId, deleteManagedLaunchButton.dataset.deleteManagedLaunch)
      .catch((error) => alert(error.message || "The launch could not be deleted."));
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

  const editLureButton = event.target.closest("[data-edit-lure]");
  if (editLureButton) {
    const lure = state.lures.find((item) => item.id === editLureButton.dataset.editLure);
    if (lure) openLureDialog(lure);
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
  if (event.target.matches("#startTime, #endTime")) {
    syncTripTimesToBlankRows();
    scheduleTripWeatherPreview(true);
  }
  if (event.target.matches("#tripDate, #tripLocation, #tripLaunch")) {
    if (event.target.matches("#tripLocation")) populateLaunchSelect();
    updateLocationControls();
  }
  if (event.target.closest("#tripForm")) clearTripFormMessage();
  if (event.target.matches(".catch-lure, .trip-gear-lure")) {
    renderLurePreview(event.target.closest(".catch-row, .gear-used-row"));
  }
  if (event.target.matches(".catch-flasher, .trip-gear-flasher")) {
    renderFlasherPreview(event.target.closest(".catch-row, .gear-used-row"));
  }
  if (event.target.matches(".catch-presentation")) {
    updatePresentationFields(event.target.closest(".catch-row, .gear-used-row"));
  }
  if (event.target.matches(".trip-gear-lure, .trip-gear-flasher, .trip-gear-side, .trip-gear-start-time, .trip-gear-end-time, .catch-presentation, .trip-gear-line-label")) {
    populateSetupLineSelects();
  }
  const row = event.target.closest(".catch-row, .gear-used-row");
  if (row) updateRowSummary(row);
});

document.addEventListener("input", (event) => {
  if (event.target.matches("#startTime, #endTime")) {
    syncTripTimesToBlankRows();
    scheduleTripWeatherPreview(true);
  }
  if (event.target.matches("#tripDate, #tripLocation, #tripLaunch")) {
    updateLocationControls();
  }
  if (event.target.matches("#locationLatitude, #locationLongitude")) {
    const coordinates = locationFormCoordinates();
    if (coordinates) setLocationFormCoordinates(coordinates);
  }
  if (event.target.closest("#tripForm")) clearTripFormMessage();
  if (event.target.matches(".trip-gear-line-label, .trip-gear-start-time, .trip-gear-end-time")) {
    populateSetupLineSelects();
  }
  const row = event.target.closest(".catch-row, .gear-used-row");
  if (row) updateRowSummary(row);
});

document.querySelector("#method").addEventListener("input", updateTrollingVisibility);
document.querySelector("#method").addEventListener("change", updateTrollingVisibility);
els.personRows.addEventListener("input", () => {
  populatePersonSelects();
  updateAllRowSummaries();
});

function setView(view) {
  const showingStats = view === "stats";
  const showingPatterns = view === "patterns";
  const showingMap = view === "map";
  const showingGear = view === "gear";
  const showingGallery = view === "gallery";
  const viewButtons = {
    trips: els.tripsViewButton,
    stats: els.statsViewButton,
    patterns: els.patternsViewButton,
    map: els.mapViewButton,
    gear: els.gearViewButton,
    gallery: els.galleryViewButton,
  };
  const viewTitles = {
    trips: "Trips",
    stats: "Advanced Stats",
    patterns: "Patterns",
    map: "Map",
    gear: "Gear",
    gallery: "Gallery",
  };
  els.tripControls.classList.toggle("hidden", showingStats || showingPatterns || showingMap || showingGear || showingGallery);
  els.tripListPanel.classList.toggle("hidden", showingStats || showingPatterns || showingMap || showingGear || showingGallery);
  els.advancedStatsPanel.classList.toggle("hidden", !showingStats);
  els.patternsPanel.classList.toggle("hidden", !showingPatterns);
  els.mapPanel.classList.toggle("hidden", !showingMap);
  els.gearPanel.classList.toggle("hidden", !showingGear);
  els.galleryPanel.classList.toggle("hidden", !showingGallery);
  Object.entries(viewButtons).forEach(([buttonView, button]) => {
    button.classList.toggle("is-active", buttonView === view);
    button.setAttribute("aria-current", buttonView === view ? "page" : "false");
  });
  document.querySelector(".topbar h2").textContent = viewTitles[view] || "Trips";
  renderAdvancedStats();
  if (showingPatterns) renderPatterns();
  if (showingMap) renderFishMap();
  if (showingGallery) renderGallery();
  renderGearLibrary();
}

async function init() {
  state = await loadState();
  renderAll();
  setView("trips");
}

init();
