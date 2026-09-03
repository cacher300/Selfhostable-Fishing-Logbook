document.addEventListener("click", (event) => {
  const galleryQuickFilterButton = event.target.closest("[data-gallery-quick-filter]");
  if (galleryQuickFilterButton) {
    activeGalleryQuickFilter = galleryQuickFilterButton.dataset.galleryQuickFilter || "all";
    activeGalleryPage = 1;
    if (galleryCategoryLabels[activeGalleryQuickFilter]) {
      activeGalleryCategory = activeGalleryQuickFilter;
      els.galleryCategoryFilter.value = activeGalleryCategory;
      renderGallery();
    } else {
      activeGalleryCategory = "all";
      els.galleryCategoryFilter.value = "all";
      renderGallery();
    }
  }

  const galleryOpen = event.target.closest("[data-gallery-open]");
  if (galleryOpen) {
    event.preventDefault();
    openGalleryLightbox(Number(galleryOpen.dataset.galleryOpen));
  }

  const galleryDelete = event.target.closest("[data-gallery-delete]");
  if (galleryDelete) {
    event.preventDefault();
    deleteGalleryItems([findGalleryItem(galleryDelete.dataset.galleryDelete)].filter(Boolean)).catch((error) => {
      console.error("Could not delete gallery media.", error);
      alert(error.message || "Selected media could not be deleted.");
    });
  }

  if (event.target.closest("[data-gallery-lightbox-close]") || event.target.classList.contains("gallery-lightbox")) {
    closeGalleryLightbox();
  }

  if (event.target.closest("[data-gallery-lightbox-prev]")) stepGalleryLightbox(-1);
  if (event.target.closest("[data-gallery-lightbox-next]")) stepGalleryLightbox(1);

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

  const reportAction = event.target.closest("[data-report-action]");
  if (reportAction) {
    const trip = state.trips.find((item) => item.id === activeSummaryTripId);
    if (trip && reportAction.dataset.reportAction === "edit") openTripDialog(trip);
    if (trip && reportAction.dataset.reportAction === "share") openTripShareStudio(trip);
  }

  const reportFilter = event.target.closest("[data-report-filter]");
  if (reportFilter) {
    activeReportTimelineFilter = reportFilter.dataset.reportFilter || "all";
    refreshReportTimeline();
  }

  const reportSort = event.target.closest("[data-report-sort]");
  if (reportSort) {
    const key = reportSort.dataset.reportSort;
    activeReportTimelineSort = {
      key,
      direction: activeReportTimelineSort.key === key && activeReportTimelineSort.direction === "asc" ? "desc" : "asc"
    };
    refreshReportTimeline();
  }

  const reportLureLink = event.target.closest("[data-report-lure-id]");
  if (reportLureLink) {
    event.stopPropagation();
    const lure = state.lures.find((item) => item.id === reportLureLink.dataset.reportLureId);
    if (lure) openLureInfoDialog(lure, "catch-table");
    return;
  }

  const reportFlasherLink = event.target.closest("[data-report-flasher-id]");
  if (reportFlasherLink) {
    event.stopPropagation();
    const flasher = state.flashers.find((item) => item.id === reportFlasherLink.dataset.reportFlasherId);
    if (flasher) openFlasherInfoDialog(flasher, "catch-table");
    return;
  }

  const catchDetailButton = event.target.closest("[data-summary-catch-index]");
  if (catchDetailButton) {
    openSummaryCatchDetail(Number(catchDetailButton.dataset.summaryCatchIndex));
  }

  const catchLureLink = event.target.closest("[data-catch-lure-id]");
  if (catchLureLink) {
    event.stopPropagation();
    const lure = state.lures.find((item) => item.id === catchLureLink.dataset.catchLureId);
    if (lure) openLureInfoDialog(lure, "catch-detail");
  }

  const catchFlasherLink = event.target.closest("[data-catch-flasher-id]");
  if (catchFlasherLink) {
    event.stopPropagation();
    const flasher = state.flashers.find((item) => item.id === catchFlasherLink.dataset.catchFlasherId);
    if (flasher) openFlasherInfoDialog(flasher, "catch-detail");
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

  const duplicateCatch = event.target.closest(".duplicate-catch");
  if (duplicateCatch) {
    duplicateCatchRow(duplicateCatch.closest(".catch-row"));
    return;
  }

  const removeCatch = event.target.closest(".remove-catch");
  if (removeCatch) {
    const catchRow = removeCatch.closest(".catch-row");
    const label = catchRow?.classList.contains("lost-fish-row") ? "missed fish" : "catch";
    if (!window.confirm(`Remove this ${label}?`)) return;
    catchRow?.remove();
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

  const removeDefaultTrollingSpreadRow = event.target.closest(".remove-default-trolling-spread-row");
  if (removeDefaultTrollingSpreadRow) {
    removeDefaultTrollingSpreadRow.closest(".default-trolling-spread-row")?.remove();
    const targetSpecies = activeDefaultTrollingSpreadTargetSpecies;
    const spread = collectDefaultTrollingSpreadSettings();
    updateDefaultTrollingSpreadSettings(targetSpecies, spread);
    renderDefaultTrollingSpreadPreview();
    scheduleSettingsAutosave((options) => saveDefaultTrollingSpreadSettings({ ...options, rerender: false, targetSpecies, spread }), 150);
  }

  const metadataLockButton = event.target.closest("[data-metadata-lock]");
  if (metadataLockButton) {
    const row = metadataLockButton.closest(".catch-row");
    const field = metadataLockButton.dataset.metadataLock;
    if (row) {
      const locked = !isCatchMetadataLocked(row, field);
      setCatchMetadataLock(row, field, locked);
    }
    return;
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
    const removedSelectedLocation = row.dataset.photoLocationId === card.dataset.catchPhoto;
    const removedHeroPhoto = row.dataset.heroPhotoId === card.dataset.catchPhoto;
    row.catchPhotos = (row.catchPhotos || []).filter((photo) => photo.id !== card.dataset.catchPhoto);
    if (removedSelectedLocation) row.dataset.photoLocationId = "";
    if (removedHeroPhoto) row.dataset.heroPhotoId = "";
    renderCatchPhotos(row);
    updateCatchLocationSummary(row);
    updateCatchFowFromLocation(row, { force: removedSelectedLocation });
    updateRowSummary(row);
  }

  const removeGearPhoto = event.target.closest("[data-remove-gear-photo]");
  if (removeGearPhoto) {
    removeExistingGearPhoto(removeGearPhoto.dataset.gearPhotoType, removeGearPhoto.dataset.removeGearPhoto);
    return;
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

  const queuedGearImagePreview = event.target.closest("[data-open-queued-gear-preview]");
  if (queuedGearImagePreview) {
    openQueuedGearImagePreview(queuedGearImagePreview.dataset.openQueuedGearPreview);
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

  const deleteQueuedPhotoButton = event.target.closest("[data-delete-queued-photo]");
  if (deleteQueuedPhotoButton) {
    event.preventDefault();
    event.stopPropagation();
    deleteQueuedPhoto(deleteQueuedPhotoButton.dataset.deleteQueuedPhoto);
    return;
  }

  const selectQueuedPhoto = event.target.closest("[data-select-queued-photo]");
  if (selectQueuedPhoto) {
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

  const editPrivateLocationPin = event.target.closest("[data-edit-private-location-pin]");
  if (editPrivateLocationPin) {
    event.preventDefault();
    event.stopPropagation();
    activePrivatePhotoLocationId = editPrivateLocationPin.dataset.editPrivateLocationPin;
    renderPrivatePhotoLocationSettings();
  }

  const editFishingSpotPin = event.target.closest("[data-edit-fishing-spot-pin]");
  if (editFishingSpotPin) {
    event.preventDefault();
    event.stopPropagation();
    activeFishingSpotId = editFishingSpotPin.dataset.editFishingSpotPin;
    renderFishingSpotSettings();
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
    activePrivatePhotoLocationId = "";
    if (privateLocationNameEditId === deletePrivateLocationButton.dataset.deletePrivateLocation) privateLocationNameEditId = "";
    savePrivatePhotoLocations(next);
  }

  const deleteFishingSpotButton = event.target.closest("[data-delete-fishing-spot]");
  if (deleteFishingSpotButton) {
    const spotId = deleteFishingSpotButton.dataset.deleteFishingSpot;
    const spot = state.spots.find((item) => item.id === spotId);
    const automaticCount = state.trips.reduce((total, trip) => total + (trip.catches || []).filter((item) => item.spotId === spotId && item.spotAssignmentMode !== "manual").length, 0);
    const manualCount = state.trips.reduce((total, trip) => total + (trip.catches || []).filter((item) => item.spotId === spotId && item.spotAssignmentMode === "manual").length, 0);
    const impact = [automaticCount ? `${automaticCount} automatic ${automaticCount === 1 ? "catch will be re-matched" : "catches will be re-matched"}` : "", manualCount ? `${manualCount} manual ${manualCount === 1 ? "catch will become unassigned" : "catches will become unassigned"}` : ""].filter(Boolean).join(". ");
    if (confirm(`Delete “${spot?.name || "this spot"}”?${impact ? ` ${impact}.` : ""}`)) {
      const next = collectFishingSpotSettings().filter((item) => item.id !== spotId);
      activeFishingSpotId = "";
      if (fishingSpotNameEditId === spotId) fishingSpotNameEditId = "";
      saveFishingSpots(next);
    }
  }

  const editFishingSpotName = event.target.closest("[data-edit-fishing-spot-name]");
  if (editFishingSpotName) {
    activeFishingSpotId = editFishingSpotName.dataset.editFishingSpotName;
    fishingSpotNameEditId = activeFishingSpotId;
    renderFishingSpotSettings();
    const input = els.fishingSpotList?.querySelector(`[data-fishing-spot-id="${CSS.escape(fishingSpotNameEditId)}"] .fishing-spot-name`);
    input?.focus();
    input?.select();
  }

  const fishingSpotCard = event.target.closest("[data-fishing-spot-id]");
  if (fishingSpotCard && !event.target.closest("[data-edit-fishing-spot-name], button, input, select, textarea")) {
    activeFishingSpotId = fishingSpotCard.dataset.fishingSpotId;
    renderFishingSpotSettings();
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
    openLureDialog(null, row.dataset.rowId, newLureButton.dataset.lureTarget || "");
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

  const inventorySortButton = event.target.closest("[data-inventory-sort-table]");
  if (inventorySortButton) {
    sortInventoryTable(inventorySortButton.dataset.inventorySortTable, inventorySortButton.dataset.inventorySortIndex);
  }

  const gearFilterSuggestion = event.target.closest("[data-gear-filter-suggestion]");
  if (gearFilterSuggestion) {
    selectGearFilterSuggestion(gearFilterSuggestion.dataset.gearFilterSuggestion);
  }

  const editReelButton = event.target.closest("[data-edit-reel]");
  if (editReelButton) {
    const reel = state.reels.find((item) => item.id === editReelButton.dataset.editReel);
    if (reel) openReelDialog(reel);
  }

  const duplicateReelButton = event.target.closest("[data-duplicate-reel]");
  if (duplicateReelButton) {
    const reel = state.reels.find((item) => item.id === duplicateReelButton.dataset.duplicateReel);
    if (reel) openReelDialog(reel, { duplicate: true });
  }

  const editRodButton = event.target.closest("[data-edit-rod]");
  if (editRodButton) {
    const rod = state.rods.find((item) => item.id === editRodButton.dataset.editRod);
    if (rod) openRodDialog(rod);
  }

  const duplicateRodButton = event.target.closest("[data-duplicate-rod]");
  if (duplicateRodButton) {
    const rod = state.rods.find((item) => item.id === duplicateRodButton.dataset.duplicateRod);
    if (rod) openRodDialog(rod, { duplicate: true });
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

  const inventoryLurePreviewButton = event.target.closest("[data-inventory-lure-id]");
  if (inventoryLurePreviewButton) {
    const lure = state.lures.find((item) => item.id === inventoryLurePreviewButton.dataset.inventoryLureId);
    if (lure) openLureInfoDialog(lure, "inventory");
  }

  const inventoryRow = event.target.closest("tr[data-inventory-type]");
  if (inventoryRow && !event.target.closest("button, a, input, select, textarea, label")) {
    openInventoryItemInfo(inventoryRow.dataset.inventoryType, inventoryRow.dataset.inventoryId);
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

  const previewLureButton = event.target.closest("[data-preview-lure-id]");
  if (previewLureButton) {
    const lure = state.lures.find((item) => item.id === previewLureButton.dataset.previewLureId);
    if (lure) openLureInfoDialog(lure, previewLureButton.closest("[data-row-id]")?.dataset.rowId || "");
  }

  const previewFlasherButton = event.target.closest("[data-preview-flasher-id]");
  if (previewFlasherButton) {
    const flasher = state.flashers.find((item) => item.id === previewFlasherButton.dataset.previewFlasherId);
    if (flasher) openFlasherInfoDialog(flasher, previewFlasherButton.closest("[data-row-id]")?.dataset.rowId || "");
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
  const columnToggle = event.target.closest?.("[data-report-column]");
  if (!columnToggle) return;
  const columns = reportColumns();
  if (columnToggle.checked) columns.add(columnToggle.dataset.reportColumn);
  else columns.delete(columnToggle.dataset.reportColumn);
  try {
    localStorage.setItem(reportColumnPreferenceKey, JSON.stringify([...columns]));
  } catch {
    // Column preferences remain available for this session when storage is unavailable.
  }
  refreshReportTimeline();
});

document.addEventListener("change", (event) => {
  const chartMetricSelect = event.target.closest("[data-stats-chart-metric]");
  if (chartMetricSelect) {
    const tableId = chartMetricSelect.dataset.statsChartMetric;
    const metricIndex = Number(chartMetricSelect.value);
    if (tableId && Number.isInteger(metricIndex)) {
      activeStatsChartMetric[tableId] = metricIndex;
      renderAdvancedStats();
    }
    return;
  }
  const gallerySelect = event.target.closest("[data-gallery-select]");
  if (gallerySelect) {
    toggleGallerySelection(gallerySelect.dataset.gallerySelect, gallerySelect.checked);
  }
});

document.addEventListener("keydown", (event) => {
  if (!document.querySelector(".gallery-lightbox")) return;
  if (event.key === "Escape") closeGalleryLightbox();
  if (event.key === "ArrowLeft") stepGalleryLightbox(-1);
  if (event.key === "ArrowRight") stepGalleryLightbox(1);
});

document.addEventListener("change", (event) => {
  if (event.target.matches(".catch-structure") && event.target.value === "__new__") {
    openStructureDialog(event.target);
    return;
  }

  if (event.target.matches(".catch-photo-hero-choice input")) {
    const row = event.target.closest(".catch-row");
    if (row) {
      row.dataset.heroPhotoId = event.target.value;
      renderCatchPhotos(row);
      updateRowSummary(row);
    }
    return;
  }

  if (event.target.matches(".catch-photo-gps-choice input")) {
    const row = event.target.closest(".catch-row");
    if (row) {
      row.dataset.photoLocationId = event.target.value;
      const selectedPhoto = catchPhotoById(row, event.target.value);
      if (selectedPhoto) {
        applyPhotoCaptureTimeToCatch(row, [selectedPhoto]);
        applyPhotoLocationToCatch(row, selectedPhoto);
      }
      updateCatchLocationSummary(row);
      updateCatchFowFromLocation(row, { force: true });
      updateRowSummary(row);
      renderCatchPhotos(row);
    }
    return;
  }
  if (event.target.matches(".catch-photo-input")) {
    addCatchPhotos(event);
    return;
  }
  if (event.target.matches("#lureImage")) {
    pendingLureImage = null;
    renderQueuedGearImage("lure");
    previewSelectedGearUploads("lure", event.target);
  }
  if (event.target.matches("#flasherImage")) {
    pendingFlasherImage = null;
    renderQueuedGearImage("flasher");
    previewSelectedGearUploads("flasher", event.target);
  }
  if (event.target.matches("#reelImage")) {
    pendingReelImage = null;
    renderQueuedGearImage("reel");
    previewSelectedGearUploads("reel", event.target);
  }
  if (event.target.matches("#rodImage")) {
    pendingRodImage = null;
    renderQueuedGearImage("rod");
    previewSelectedGearUploads("rod", event.target);
  }
  if (event.target.matches("#launchTime, #linesSetTime, #linesPulledTime")) {
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
  if (event.target.closest("#tripForm")) {
    clearTripFormMessage();
    markTripFormChanged();
  }
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
  if (event.target.matches(".catch-time, .catch-time-unknown")) {
    populateSetupLineSelects();
  }
  if (event.target.matches(".catch-details-unknown")) {
    updateCatchDetailsUnknown(event.target.closest(".catch-row"), { clear: event.target.checked });
  }
  if (event.target.matches(".catch-presentation, .trip-gear-cheater, .trip-gear-leadcore, .catch-deepest-rigger")) {
    updatePresentationFields(event.target.closest(".catch-row, .gear-used-row"));
    document.querySelectorAll(".catch-row").forEach(updatePresentationFields);
    document.querySelectorAll(".catch-row.details-unknown").forEach(updateCatchDetailsUnknown);
  }
  if (event.target.matches(".trip-gear-lure, .trip-gear-flasher, .trip-gear-combo, .trip-gear-rod, .trip-gear-reel, .trip-gear-side, .trip-gear-start-time, .trip-gear-end-time, .catch-presentation, .trip-gear-line-label, .trip-gear-distance-behind, .trip-gear-cheater, .trip-gear-cheater-lure, .trip-gear-leadcore")) {
    populateSetupLineSelects();
    populateCatchRodSelects();
  }
  if (event.target.matches(".trip-gear-rigging, .trip-gear-rigging-details")) {
    const setupRow = event.target.closest(".gear-used-row");
    document.querySelectorAll(".catch-row").forEach((row) => {
      if (row.querySelector(".catch-rod")?.value !== setupRow?.dataset.gearId) return;
      syncCatchRiggingFromSetupLine(row);
      renderLurePreview(row);
      updateRowSummary(row);
    });
  }
  const row = event.target.closest(".catch-row, .gear-used-row");
  if (row) updateRowSummary(row);
  if (event.target.closest("#tripForm")) renderLiveTrollingSpread();
});

document.addEventListener("input", (event) => {
  if (event.target.matches("#launchTime, #linesSetTime, #linesPulledTime")) {
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
  if (event.target.closest("#tripForm")) {
    clearTripFormMessage();
    markTripFormChanged();
  }
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

document.addEventListener("click", (event) => {
  const tab = event.target.closest("#tripDialog .trip-section-nav a");
  if (tab) {
    document.querySelectorAll("#tripDialog .trip-section-nav a").forEach((item) => {
      item.classList.toggle("is-active", item === tab);
    });
  }
  if (event.target.closest("#tripForm") && !event.target.closest("[data-close-dialog]")) {
    queueMicrotask(() => {
      if (isTripFormDirty()) tripFormUserChanged = true;
      syncTripFormChrome();
    });
  }
});
