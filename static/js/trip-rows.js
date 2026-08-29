function addCatchRow(catchItem = {}) {
  return addFishRow(catchItem, { container: els.catchRows, lost: false });
}

function addLostFishRow(fishItem = {}) {
  return addFishRow(fishItem, { container: els.lostFishRows, lost: true });
}

function expandAndRevealTripRow(row) {
  if (!row) return;
  row.classList.remove("collapsed");
  row.querySelector("[data-toggle-row]")?.setAttribute("aria-expanded", "true");
  requestAnimationFrame(() => {
    row.scrollIntoView({ behavior: "smooth", block: "center" });
    row.querySelector("input:not([type=hidden]), select")?.focus({ preventScroll: true });
  });
}

function defaultFishTime(catchItem = {}) {
  return catchItem.timeUnknown ? "" : (catchItem.time ?? (getValue("linesSetTime") || getValue("launchTime")));
}

function populateCatchSpotSelect(row, catchItem = {}) {
  const select = row?.querySelector(".catch-spot");
  if (!select) return;
  const mode = catchItem.spotAssignmentMode === "manual" ? "manual" : "automatic";
  const requestedSpotId = String(catchItem.spotId || "");
  const automaticId = automaticSpotId({
    ...catchItem,
    manualCoordinates: manualCoordinatesFromRow(row),
    coordinates: fishCoordinatesFromRow(row)
  });
  const automaticName = spotName(automaticId);
  const automaticLabel = automaticName || "No spot match";
  select.innerHTML = [
    `<option value="__automatic__">${escapeHtml(automaticLabel)}</option>`,
    `<option value="__none__">No spot</option>`,
    ...state.spots.map((spot) => `<option value="${escapeHtml(spot.id)}">${escapeHtml(spot.name)}</option>`)
  ].join("");
  select.value = mode === "automatic" ? "__automatic__" : (state.spots.some((spot) => spot.id === requestedSpotId) ? requestedSpotId : "__none__");
}

function refreshCatchSpotSelect(row) {
  const select = row?.querySelector(".catch-spot");
  if (!select || row.classList.contains("lost-fish-row")) return;
  const value = select.value || "__automatic__";
  populateCatchSpotSelect(row, {
    spotAssignmentMode: value === "__automatic__" ? "automatic" : "manual",
    spotId: value.startsWith("__") ? "" : value
  });
}

function updateUnknownTimeField(row) {
  const unknown = row.querySelector(".catch-time-unknown")?.checked;
  const timeInput = row.querySelector(".catch-time");
  if (!timeInput) return;
  if (unknown) timeInput.value = "";
  timeInput.disabled = Boolean(unknown);
}

function setControlValue(control, value = "") {
  if (!control) return;
  if (control.type === "checkbox" || control.type === "radio") {
    control.checked = Boolean(value);
    return;
  }
  control.value = value;
}

function clearUnknownCatchDetails(row) {
  [
    ".catch-person",
    ".catch-time",
    ".catch-time-unknown",
    ".catch-released",
    ".catch-structure",
    ".catch-water-depth",
    ".catch-depth-down",
    ".catch-latitude",
    ".catch-longitude",
    ".catch-setup-line",
    ".catch-rod",
    ".catch-lure",
    ".catch-rigging",
    ".catch-rigging-details",
    ".catch-retrieve",
    ".catch-presentation",
    ".catch-direction",
    ".catch-fow",
    ".catch-gps-speed",
    ".catch-ball-speed",
    ".catch-shaker",
    ".catch-ball-depth",
    ".catch-deepest-rigger",
    ".catch-cheater-depth",
    ".catch-flatline-weight-oz",
    ".catch-line-behind-board",
    ".catch-leadcore-colors",
    ".catch-estimated-lure-depth",
    ".catch-dipsey-setting",
    ".catch-line-out",
    ".catch-estimated-depth",
    ".catch-notes"
  ].forEach((selector) => setControlValue(row.querySelector(selector)));
  row.catchPhotos = [];
  row.catchWeatherData = null;
  row.catchMetadataLocks = { time: false, location: false, fow: false };
  row.dataset.metadataLockTime = "false";
  row.dataset.metadataLockLocation = "false";
  row.dataset.metadataLockFow = "false";
  delete row.dataset.lockedLocationLatitude;
  delete row.dataset.lockedLocationLongitude;
  renderCatchPhotos(row);
  renderLurePreview(row);
  updateMetadataLockButtons(row);
  updateCatchLocationSummary(row);
}

function updateCatchDetailsUnknown(row, { clear = false } = {}) {
  if (!row || row.classList.contains("lost-fish-row")) return;
  const detailsUnknown = Boolean(row.querySelector(".catch-details-unknown")?.checked);
  if (detailsUnknown && clear) clearUnknownCatchDetails(row);
  row.classList.toggle("details-unknown", detailsUnknown);
  row.querySelectorAll(".catch-detail-optional").forEach((field) => {
    field.classList.toggle("hidden", detailsUnknown);
  });
  updateUnknownTimeField(row);
  if (detailsUnknown) updatePresentationFields(row);
  else updateTrollingVisibility();
  updateRowSummary(row);
  renderLiveTrollingSpread();
}

function defaultSetupStartTime(gearItem = {}) {
  return gearItem.startTime ?? (getValue("linesSetTime") || getValue("launchTime"));
}

function defaultSetupEndTime(gearItem = {}) {
  return gearItem.endTime ?? getValue("linesPulledTime");
}

function syncTripTimesToBlankRows() {
  const startTime = getValue("linesSetTime") || getValue("launchTime");
  const endTime = getValue("linesPulledTime");
  if (startTime) {
    document.querySelectorAll("#catchRows .catch-time, #lostFishRows .catch-time, #tripGearRows .trip-gear-start-time").forEach((field) => {
      if (field.closest(".catch-row")?.querySelector(".catch-time-unknown")?.checked) return;
      if (!field.value) {
        field.value = startTime;
        flashAutoFilledField(field);
      }
    });
  }
  if (endTime) {
    document.querySelectorAll("#tripGearRows .trip-gear-end-time").forEach((field) => {
      if (!field.value) {
        field.value = endTime;
        flashAutoFilledField(field);
      }
    });
  }
  updateAllRowSummaries();
}

function addFishRow(catchItem = {}, { container, lost }) {
  const template = document.querySelector("#catchRowTemplate");
  const node = template.content.firstElementChild.cloneNode(true);
  if (lost) node.classList.add("lost-fish-row");
  node.dataset.rowId = createId();
  node.dataset.catchId = catchItem.id || "";
  node.catchPhotos = lost ? [] : structuredClone(catchItem.photos || []);
  node.dataset.photoLocationId = lost ? "" : (catchItem.photoLocationId || "");
  node.dataset.heroPhotoId = lost ? "" : (catchItem.heroPhotoId || "");
  node.catchMetadataLocks = {
    time: !lost && Boolean(catchItem.metadataLocks?.time),
    location: !lost && Boolean(catchItem.metadataLocks?.location),
    fow: !lost && Boolean(catchItem.metadataLocks?.fow)
  };
  node.dataset.metadataLockTime = String(node.catchMetadataLocks.time);
  node.dataset.metadataLockLocation = String(node.catchMetadataLocks.location);
  node.dataset.metadataLockFow = String(node.catchMetadataLocks.fow);
  const lockedLocationCoordinates = isUsableCoordinates(catchItem.lockedLocationCoordinates)
    ? catchItem.lockedLocationCoordinates
    : (node.catchMetadataLocks.location && isUsableCoordinates(catchItem.coordinates) ? catchItem.coordinates : null);
  if (lockedLocationCoordinates) {
    node.dataset.lockedLocationLatitude = lockedLocationCoordinates.latitude;
    node.dataset.lockedLocationLongitude = lockedLocationCoordinates.longitude;
  }
  node.catchWeatherData = catchItem.weatherData || null;
  node.catchDepthData = {
    depth_m: catchItem.depth_m ?? null,
    depth_ft: catchItem.depth_ft ?? null,
    lake_name: catchItem.lake_name ?? null,
    depth_source: catchItem.depth_source ?? null
  };
  node.querySelector(".remove-catch").setAttribute("aria-label", lost ? "Remove lost fish" : "Remove catch");
  node.querySelector(".catch-released-field").classList.toggle("hidden", lost);
  node.querySelector(".catch-details-unknown-field").classList.toggle("hidden", lost);
  node.querySelector(".catch-species-field").classList.toggle("hidden", lost);
  node.querySelector(".possible-species-field").classList.toggle("hidden", !lost);
  node.querySelector(".catch-length-field").classList.toggle("hidden", lost);
  node.querySelector(".catch-weight-field").classList.toggle("hidden", lost);
  node.querySelector(".catch-water-depth-field").classList.toggle("hidden", lost);
  node.querySelector(".catch-depth-down-field").classList.toggle("hidden", lost);
  node.querySelector(".catch-photo-title").classList.toggle("hidden", lost);
  node.querySelector(".catch-photo-editor").classList.toggle("hidden", lost);
  node.querySelector(".catch-spot-field").classList.toggle("hidden", lost);

  populatePersonSelect(node.querySelector(".catch-person"), catchItem.personId || "");
  populateOptionSelect(node.querySelector(".catch-species"), state.species, "Select species");
  populateOptionSelect(node.querySelector(".catch-possible-species"), state.species, "Select possible species");
  populateStructureSelect(node.querySelector(".catch-structure"), catchItem.structureType || "");
  populateOptionSelect(node.querySelector(".catch-rigging"), state.riggings, "Select rigging");
  populateChoiceSelect(node.querySelector(".catch-presentation"), optionChoices("trollingPresentations"), "Select method", catchItem.presentation || "");
  populateOptionSelect(node.querySelector(".catch-direction"), optionLabels("trollingDirections"), "Select direction");
  node.querySelector(".catch-species").value = lost ? "" : (catchItem.species || "");
  node.querySelector(".catch-possible-species").value = catchItem.possibleSpecies || catchItem.species || "";
  node.querySelector(".catch-details-unknown").checked = !lost && Boolean(catchItem.detailsUnknown);
  // Keep the existing `released` storage field so legacy stats and reports remain compatible.
  node.querySelector(".catch-released").checked = catchItem.released === undefined
    ? false
    : !Boolean(catchItem.released);
  node.querySelector(".catch-length").value = lost ? "" : (catchItem.length || "");
  node.querySelector(".catch-weight").value = lost ? "" : (catchItem.weight || "");
  node.querySelector(".catch-time").value = defaultFishTime(catchItem);
  node.querySelector(".catch-time-unknown").checked = Boolean(catchItem.timeUnknown);
  updateUnknownTimeField(node);
  node.querySelector(".catch-water-depth").value = catchItem.waterDepth || catchItem.depth || "";
  node.querySelector(".catch-depth-down").value = catchItem.depthDown || catchItem.depth || "";
  const manualCoordinates = isUsableCoordinates(catchItem.manualCoordinates)
    ? catchItem.manualCoordinates
    : (catchItem.coordinates?.manual && isUsableCoordinates(catchItem.coordinates) ? catchItem.coordinates : null);
  node.querySelector(".catch-latitude").value = manualCoordinates?.latitude ?? "";
  node.querySelector(".catch-longitude").value = manualCoordinates?.longitude ?? "";
  if (!lost) populateCatchSpotSelect(node, catchItem);
  updateCatchLocationSummary(node);
  node.querySelector(".catch-presentation").value = catchItem.presentation || "";
  node.querySelector(".catch-direction").value = catchItem.direction || "";
  node.querySelector(".catch-fow").value = catchItem.fowCaught || "";
  node.querySelector(".catch-gps-speed").value = catchItem.gpsSpeed ?? catchItem.speed ?? "";
  node.querySelector(".catch-ball-speed").value = catchItem.ballSpeed || "";
  node.querySelector(".catch-shaker").checked = Boolean(catchItem.shaker);
  node.querySelector(".catch-retrieve").value = catchItem.retrieve || "";
  node.querySelector(".catch-rigging").value = catchItem.rigging || "";
  node.querySelector(".catch-rigging-details").value = catchItem.riggingDetails || "";
  node.querySelector(".catch-ball-depth").value = catchItem.ballDepth || "";
  node.querySelector(".catch-deepest-rigger").checked = Boolean(catchItem.deepestRigger);
  updateCheaterDepth(node);
  node.querySelector(".catch-flatline-weight-oz").value = catchItem.flatlineWeightOz || "";
  node.querySelector(".catch-line-behind-board").value = catchItem.lineBehindBoard || "";
  node.querySelector(".catch-leadcore-colors").value = catchItem.leadcoreColors || "";
  node.querySelector(".catch-estimated-lure-depth").value = catchItem.estimatedLureDepth || "";
  node.querySelector(".catch-dipsey-setting").value = catchItem.dipseySetting || "";
  node.querySelector(".catch-line-out").value = catchItem.lineOut || "";
  node.querySelector(".catch-estimated-depth").value = catchItem.estimatedDepth || "";
  node.querySelector(".catch-notes").value = catchItem.notes || "";
  node.querySelector(".catch-setup-line").dataset.selectedSetupLine = catchItem.setupLineTarget === "cheater"
    ? `${catchItem.setupLineId}::cheater`
    : (catchItem.setupLineId || "");
  node.querySelector(".catch-rod").dataset.selectedRodId = catchItem.rodId || "";
  populateLureSelect(node.querySelector(".catch-lure"), catchItem.lureId || "");
  populateCatchRodSelect(
    node.querySelector(".catch-rod"),
    catchItem.rodId || "",
    catchItem.setupLineId || ""
  );
  syncCatchRiggingFromSetupLine(node);
  renderLurePreview(node);
  renderCatchPhotos(node);
  updateMetadataLockButtons(node);
  updatePresentationFields(node);

  container.append(node);
  syncUnitLabels(node);
  populateSetupLineSelects();
  updateTrollingVisibility();
  populateCatchRodSelects();
  updateCatchDetailsUnknown(node);
  updateAllRowSummaries();
  renderLiveTrollingSpread();
  return node;
}

function addTripGearRow(gearItem = {}) {
  const template = document.querySelector("#tripGearRowTemplate");
  const node = template.content.firstElementChild.cloneNode(true);
  node.dataset.rowId = createId();
  node.dataset.gearId = gearItem.id || "";
  if (gearItem.defaultTrollingSpread) {
    node.dataset.defaultTrollingSpread = "true";
    node.dataset.defaultTrollingSpreadTarget = gearItem.defaultTrollingSpreadTarget || "__all__";
  }

  node.querySelector(".trip-gear-start-time").value = defaultSetupStartTime(gearItem);
  node.querySelector(".trip-gear-end-time").value = defaultSetupEndTime(gearItem);
  node.querySelector(".trip-gear-change-note").value = gearItem.changeNote || gearItem.notes || "";
  const side = gearItem.side || defaultSetupLineSide(gearItem, els.tripGearRows.querySelectorAll(".gear-used-row").length);
  populateChoiceSelect(node.querySelector(".trip-gear-side"), optionChoices("setupLineSides"), "Select side", side);
  populateChoiceSelect(node.querySelector(".catch-presentation"), optionChoices("trollingPresentations"), "Select method", gearItem.presentation || "");
  node.querySelector(".trip-gear-side").value = side;
  node.querySelector(".trip-gear-line-label").value = gearItem.lineLabel || "";
  populateBoatItemSelect(node.querySelector(".trip-gear-boat-item"), gearItem.boatItemId || "");
  const matchingCombo = (gearItem.rodId || gearItem.reelId) && state.rodReelCombos.find((combo) => (
    combo.rodId === gearItem.rodId && combo.reelId === gearItem.reelId
  ));
  populateComboSelect(node.querySelector(".trip-gear-combo"), gearItem.comboId || matchingCombo?.id || "");
  node.querySelector(".catch-presentation").value = gearItem.presentation || "";
  node.querySelector(".trip-gear-cheater").checked = Boolean(gearItem.hasCheater);
  node.querySelector(".trip-gear-leadcore").checked = Boolean(gearItem.hasLeadcore);
  node.querySelector(".trip-gear-distance-behind").value = gearItem.distanceBehind || "";
  populateLureSelect(node.querySelector(".trip-gear-lure"), gearItem.lureId || "");
  populateOptionSelect(node.querySelector(".trip-gear-rigging"), state.riggings, "Select rigging");
  node.querySelector(".trip-gear-rigging").value = gearItem.rigging || "";
  node.querySelector(".trip-gear-rigging-details").value = gearItem.riggingDetails || "";
  populateLureSelect(node.querySelector(".trip-gear-cheater-lure"), gearItem.cheaterLureId || "");
  populateFlasherSelect(node.querySelector(".trip-gear-flasher"), gearItem.flasherId || "");
  renderLurePreview(node);
  renderFlasherPreview(node);
  updatePresentationFields(node);

  els.tripGearRows.append(node);
  syncUnitLabels(node);
  populateSetupLineSelects();
  updateTrollingVisibility();
  populateCatchRodSelects();
  updateAllRowSummaries();
  renderLiveTrollingSpread();
  return node;
}

function applyDefaultTrollingSpread({ force = false, replaceExisting = false } = {}) {
  if (!isTrollingTrip()) return false;
  const targetSpecies = getValue("targetSpecies");
  const targetKey = targetSpecies || "__all__";
  const rows = [...els.tripGearRows.querySelectorAll(".gear-used-row")];
  const existingDefaultRows = rows.filter((row) => row.dataset.defaultTrollingSpread === "true");
  const onlyDefaultRows = rows.length > 0 && existingDefaultRows.length === rows.length;
  const canReplaceRows = onlyDefaultRows || replaceExisting;
  const defaultRowsMatchTarget = existingDefaultRows.every((row) => row.dataset.defaultTrollingSpreadTarget === targetKey);
  if (rows.length && (!canReplaceRows || (!force && defaultRowsMatchTarget))) return false;
  const spread = defaultTrollingSpreadForSpecies(targetSpecies);
  if (canReplaceRows) rows.forEach((row) => row.remove());
  if (!spread.length) return false;
  spread.forEach((item) => addTripGearRow({
    comboId: item.comboId,
    side: item.side,
    presentation: item.presentation,
    lureId: "",
    flasherId: "",
    cheaterLureId: "",
    hasCheater: false
  }));
  [...els.tripGearRows.querySelectorAll(".gear-used-row")].slice(-spread.length).forEach((row) => {
    row.dataset.defaultTrollingSpread = "true";
    row.dataset.defaultTrollingSpreadTarget = targetKey;
  });
  return true;
}

function previousTrollingTripForTargetSpecies() {
  const targetSpecies = getValue("targetSpecies").trim();
  const tripDate = getValue("tripDate");
  if (!targetSpecies) return null;
  return state.trips
    .filter((trip) => (
      trip.id !== activeTripId
      && String(trip.method || "").toLowerCase() === "trolling"
      && String(trip.targetSpecies || "").trim() === targetSpecies
      && Array.isArray(trip.gearUsed)
      && trip.gearUsed.length
      && (!tripDate || !trip.date || String(trip.date) < tripDate)
    ))
    .sort((first, second) => String(second.date || "").localeCompare(String(first.date || "")))[0] || null;
}

function syncLastTrollingSpreadImportButton() {
  const button = els.importLastTrollingSpreadButton;
  if (!button) return;
  const sourceTrip = isTrollingTrip() ? previousTrollingTripForTargetSpecies() : null;
  button.disabled = !sourceTrip;
  button.title = sourceTrip
    ? `Import the spread from ${formatDate(sourceTrip.date)}`
    : "Choose a target species with a previous trolling trip to import its spread.";
}

function lastTripSpreadGearItem(gearItem) {
  return {
    boatItemId: gearItem.boatItemId || "",
    comboId: gearItem.comboId || "",
    rodId: gearItem.rodId || "",
    reelId: gearItem.reelId || "",
    side: gearItem.side || "",
    lineLabel: gearItem.lineLabel || "",
    presentation: gearItem.presentation || "",
    hasLeadcore: Boolean(gearItem.hasLeadcore),
    distanceBehind: gearItem.distanceBehind || "",
    lureId: gearItem.lureId || "",
    rigging: gearItem.rigging || "",
    riggingDetails: gearItem.riggingDetails || "",
    flasherId: gearItem.flasherId || "",
    hasCheater: Boolean(gearItem.hasCheater),
    cheaterLureId: gearItem.cheaterLureId || ""
  };
}

function importLastTrollingSpread() {
  const sourceTrip = previousTrollingTripForTargetSpecies();
  if (!sourceTrip) {
    alert("No previous trolling trip with this target species has a spread to import.");
    return;
  }
  const rows = [...els.tripGearRows.querySelectorAll(".gear-used-row")];
  const onlyDefaultRows = rows.length > 0 && rows.every((row) => row.dataset.defaultTrollingSpread === "true");
  if (rows.length && !onlyDefaultRows && !window.confirm("Replace the current setup with the spread from your last matching trip?")) return;

  rows.forEach((row) => row.remove());
  sourceTrip.gearUsed.forEach((gearItem) => addTripGearRow(lastTripSpreadGearItem(gearItem)));
  populateSetupLineSelects();
  populateCatchRodSelects();
  updateAllRowSummaries();
  renderLiveTrollingSpread();
  tripFormUserChanged = true;
  syncTripFormChrome();
}

function populateLureSelect(select, selectedId = "") {
  select.innerHTML = `<option value="">No lure selected</option>` + state.lures.map((lure) => {
    const label = [lure.name, lure.color].filter(Boolean).join(" - ");
    return `<option value="${lure.id}" ${lure.id === selectedId ? "selected" : ""}>${escapeHtml(label)}</option>`;
  }).join("");
}

function boatItemPosition(slot) {
  const slotNumber = Number(slot);
  if (!Number.isInteger(slotNumber) || slotNumber < 0) return "Unplaced";
  const position = boatLayoutPosition(slotNumber);
  return position === "Deck position" ? "Unplaced" : position;
}

function populateBoatItemSelect(select, selectedId = "") {
  if (!select) return;
  const layout = normalizeBoatLayout(state.settings?.boatLayout);
  const equipmentById = new Map(layout.equipment.map((item) => [item.id, item]));
  const items = layout.items
    .map((item) => ({ ...item, equipment: equipmentById.get(item.equipmentId) }))
    .filter((item) => item.equipment)
    .sort((first, second) => first.slot - second.slot);
  const hasSelectedItem = items.some((item) => item.id === selectedId);
  const unavailableOption = selectedId && !hasSelectedItem
    ? `<option value="${escapeHtml(selectedId)}">Unavailable deck item</option>`
    : "";
  select.innerHTML = `<option value="">No boat equipment linked</option>${unavailableOption}${items.map((item) => (
    `<option value="${escapeHtml(item.id)}">${escapeHtml(item.equipment.name)} · ${escapeHtml(boatItemPosition(item.slot))}</option>`
  )).join("")}`;
  select.value = selectedId;
}

function populateFlasherSelect(select, selectedId = "") {
  select.innerHTML = `<option value="">No flasher</option>` + state.flashers.map((flasher) => {
    const label = [flasher.name, flasher.color].filter(Boolean).join(" - ");
    return `<option value="${flasher.id}" ${flasher.id === selectedId ? "selected" : ""}>${escapeHtml(label)}</option>`;
  }).join("");
}

function setupLineLabelFromRow(row, index) {
  const customLabel = row.querySelector(".trip-gear-line-label")?.value.trim() || "";
  if (customLabel) return customLabel;
  return setupLineAutoLabel({
    side: row.querySelector(".trip-gear-side")?.value || "",
    presentation: row.querySelector(".catch-presentation")?.value || "",
    comboId: row.querySelector(".trip-gear-combo")?.value || "",
    lureId: row.querySelector(".trip-gear-lure")?.value || "",
    flasherId: row.querySelector(".trip-gear-flasher")?.value || ""
  }, index);
}

function cheaterLineLabelFromRow(row, index) {
  const customLabel = row.querySelector(".trip-gear-line-label")?.value.trim() || "";
  if (customLabel) return customLabel;
  const identity = [
    setupLineSideLabel(row.querySelector(".trip-gear-side")?.value),
    choiceLabel("trollingPresentations", row.querySelector(".catch-presentation")?.value) || `Rod ${index + 1}`
  ].filter(Boolean).join(" ");
  const combo = selectedText(row.querySelector(".trip-gear-combo")).replace("No combo selected", "");
  return [identity, combo].filter(Boolean).join(": ");
}

function catchRodPickerLabelFromRow(row, index, { cheater = false } = {}) {
  const customLabel = row.querySelector(".trip-gear-line-label")?.value.trim() || "";
  const identity = customLabel || [
    setupLineSideLabel(row.querySelector(".trip-gear-side")?.value),
    choiceLabel("trollingPresentations", row.querySelector(".catch-presentation")?.value) || `Rod ${index + 1}`
  ].filter(Boolean).join(" ");
  const lureId = cheater
    ? row.querySelector(".trip-gear-cheater-lure")?.value || ""
    : row.querySelector(".trip-gear-lure")?.value || "";
  const lure = lureId.startsWith("__type__:") ? "" : lureName(lureId);
  return [cheater ? `${identity} — Cheater` : identity, lure].filter(Boolean).join(" / ");
}

function setupLineOptionsFromForm() {
  return [...els.tripGearRows.querySelectorAll(".gear-used-row")].flatMap((row, index) => {
    if (!row.dataset.gearId) row.dataset.gearId = createId();
    const startTime = row.querySelector(".trip-gear-start-time")?.value || "";
    const endTime = row.querySelector(".trip-gear-end-time")?.value || "";
    const mainOption = {
      id: row.dataset.gearId,
      label: catchRodPickerLabelFromRow(row, index),
      startTime,
      endTime
    };
    if (!row.querySelector(".trip-gear-cheater")?.checked) return [mainOption];
    return [
      mainOption,
      {
        id: `${row.dataset.gearId}::cheater`,
        label: catchRodPickerLabelFromRow(row, index, { cheater: true }),
        startTime,
        endTime
      }
    ];
  });
}

function setupLineIsActiveAtTime(option, catchTime) {
  if (!catchTime || !option.startTime || !option.endTime) return true;
  if (option.startTime <= option.endTime) return catchTime >= option.startTime && catchTime <= option.endTime;
  return catchTime >= option.startTime || catchTime <= option.endTime;
}

function populateSetupLineSelect(select, selectedId = "") {
  const catchRow = select.closest(".catch-row");
  const catchTime = catchRow?.querySelector(".catch-time-unknown")?.checked
    ? ""
    : (catchRow?.querySelector(".catch-time")?.value || "");
  const options = setupLineOptionsFromForm().filter((option) => setupLineIsActiveAtTime(option, catchTime));
  const selected = selectedId || select.dataset.selectedSetupLine || "";
  select.dataset.selectedSetupLine = "";
  select.innerHTML = `<option value="">Select rod</option>` + options.map((item) => (
    `<option value="${item.id}" ${item.id === selected ? "selected" : ""}>${escapeHtml(item.label)}</option>`
  )).join("");
}

function populateSetupLineSelects() {
  document.querySelectorAll(".catch-setup-line").forEach((select) => {
    populateSetupLineSelect(select, select.value);
  });
  document.querySelectorAll("#catchRows .catch-row").forEach(syncCatchMethodToSetupLine);
}

function rodOptionFromGearRow(row, index) {
  const combo = selectedComboForRow(row);
  const rodId = combo?.rodId || "";
  const lureSelect = row.querySelector(".trip-gear-lure");
  const lureId = lureSelect?.value?.startsWith("__type__:") ? "" : (lureSelect?.value || "");
  const fallbackLabel = setupLineLabelFromRow(row, index);
  const label = [
    comboName(row.querySelector(".trip-gear-combo")?.value || "") || rodName(rodId) || fallbackLabel,
    lureName(lureId)
  ].filter(Boolean).join(" / ");
  return {
    id: row.dataset.gearId || createId(),
    rodId,
    lureId,
    label: label || fallbackLabel || `Rod ${index + 1}`
  };
}

function catchRodOptionsFromForm(selectedRodId = "") {
  return [...els.tripGearRows.querySelectorAll(".gear-used-row")]
    .map((row, index) => {
      if (!row.dataset.gearId) row.dataset.gearId = createId();
      return rodOptionFromGearRow(row, index);
    })
    .filter((item) => item.rodId);
}

function populateCatchRodSelect(select, selectedRodId = "", selectedOptionId = "") {
  if (!select) return;
  const selected = selectedRodId || select.dataset.selectedRodId || "";
  const options = catchRodOptionsFromForm(selected);
  const selectedOption = options.find((item) => item.id === selectedOptionId)?.id
    || options.find((item) => item.rodId === selected)?.id
    || "";
  select.dataset.selectedRodId = "";
  select.innerHTML = `<option value="">Select rod</option>` + options.map((item) => (
    `<option value="${escapeHtml(item.id)}" data-rod-id="${escapeHtml(item.rodId)}" data-lure-id="${escapeHtml(item.lureId)}" ${item.id === selectedOption ? "selected" : ""}>${escapeHtml(item.label)}</option>`
  )).join("");
}

function populateCatchRodSelects() {
  document.querySelectorAll(".catch-rod").forEach((select) => {
    const selectedRodId = select.selectedOptions?.[0]?.dataset.rodId || select.dataset.selectedRodId || "";
    populateCatchRodSelect(select, selectedRodId, select.value);
  });
}

function syncDirectCatchRodToLure(row) {
  if (!row) return;
  const option = row.querySelector(".catch-rod")?.selectedOptions?.[0];
  const lureId = option?.dataset.lureId || "";
  if (lureId) {
    const lureSelect = row.querySelector(".catch-lure");
    populateLureSelect(lureSelect, lureId);
  }
  syncCatchRiggingFromSetupLine(row);
  renderLurePreview(row);
  updateRowSummary(row);
}

function syncCatchRiggingFromSetupLine(row) {
  if (!row) return;
  const setupLineId = row.querySelector(".catch-rod")?.value || "";
  const setupRow = [...els.tripGearRows.querySelectorAll(".gear-used-row")]
    .find((gearRow) => gearRow.dataset.gearId === setupLineId);
  if (!setupRow) return;

  const rigging = row.querySelector(".catch-rigging");
  const riggingDetails = row.querySelector(".catch-rigging-details");
  if (rigging) rigging.value = setupRow.querySelector(".trip-gear-rigging")?.value || "";
  if (riggingDetails) riggingDetails.value = setupRow.querySelector(".trip-gear-rigging-details")?.value || "";
}

function syncCatchMethodToSetupLine(row) {
  const selectedValue = row.querySelector(".catch-setup-line")?.value || "";
  const presentationSelect = row.querySelector(".catch-presentation");
  if (!presentationSelect) return;

  const setupLineId = selectedValue.split("::")[0];
  const setupRow = [...els.tripGearRows.querySelectorAll(".gear-used-row")]
    .find((gearRow) => gearRow.dataset.gearId === setupLineId);
  presentationSelect.value = selectedValue.endsWith("::cheater")
    ? "Cheater"
    : (setupRow?.querySelector(".catch-presentation")?.value || "");
  updatePresentationFields(row);
  updateCheaterDepth(row);
  updateLeadcoreEstimatedDepth(row);
}

function selectedText(select) {
  return select?.selectedOptions?.[0]?.textContent?.trim() || "";
}

function summaryOption(select, placeholders = []) {
  const text = selectedText(select);
  return placeholders.includes(text) ? "" : text;
}

function rowNumber(row, selector) {
  return [...row.parentElement.querySelectorAll(selector)].indexOf(row) + 1;
}

function fishRowLabel(row) {
  if (row.classList.contains("lost-fish-row")) return `Lost Fish ${rowNumber(row, ".lost-fish-row")}`;
  return `Catch ${rowNumber(row, ".catch-row:not(.lost-fish-row)")}`;
}

function catchSetupSummary(row) {
  const selectedValue = row.querySelector(".catch-setup-line")?.value || "";
  if (!selectedValue) return "";
  const setupLineId = selectedValue.split("::")[0];
  const setupRow = [...els.tripGearRows.querySelectorAll(".gear-used-row")]
    .find((gearRow) => gearRow.dataset.gearId === setupLineId);
  if (!setupRow) return "";
  const label = [
    setupLineSideLabel(setupRow.querySelector(".trip-gear-side")?.value),
    choiceLabel("trollingPresentations", setupRow.querySelector(".catch-presentation")?.value)
  ].filter(Boolean).join(" ");
  return selectedValue.endsWith("::cheater") ? `${label} Cheater` : label;
}

function catchLurePreviewName(row) {
  const lureId = row.querySelector(".catch-lure")?.value || "";
  const lure = state.lures.find((item) => item.id === lureId);
  return lure?.name || summaryOption(row.querySelector(".catch-lure"), ["No lure selected"]);
}

function setupBoatItemName(row) {
  const itemId = row.querySelector(".trip-gear-boat-item")?.value || "";
  if (!itemId) return "";
  const layout = normalizeBoatLayout(state.settings?.boatLayout);
  const item = layout.items.find((entry) => entry.id === itemId);
  return layout.equipment.find((entry) => entry.id === item?.equipmentId)?.name || "";
}

function updateRowSummary(row) {
  const summary = row.querySelector(".collapsible-row-summary");
  if (!summary) return;

  if (row.classList.contains("catch-row")) {
    const released = !row.querySelector(".catch-released")?.checked && !row.classList.contains("lost-fish-row");
    const trolling = isTrollingTrip();
    const pieces = [
      fishRowLabel(row),
      row.classList.contains("lost-fish-row")
        ? summaryOption(row.querySelector(".catch-possible-species"), ["Select possible species"])
        : summaryOption(row.querySelector(".catch-species"), ["Select species"]),
      released ? "Released" : "",
      row.querySelector(".catch-time-unknown")?.checked ? "Unknown time" : formatDisplayTime(row.querySelector(".catch-time").value),
      trolling
        ? catchSetupSummary(row)
        : [
            summaryOption(row.querySelector(".catch-rod"), ["Select rod"]),
            summaryOption(row.querySelector(".catch-lure"), ["No lure selected"])
          ].filter(Boolean).join(" / "),
    ].filter(Boolean);
    summary.textContent = pieces.join(" · ");
    return;
  }

  const pieces = [
    `Rod ${rowNumber(row, ".gear-used-row")}`,
    isTrollingTrip() ? setupLineSideLabel(row.querySelector(".trip-gear-side")?.value) : "",
    summaryOption(row.querySelector(".catch-presentation"), ["Select method"]),
    setupBoatItemName(row)
  ].filter(Boolean);
  summary.textContent = pieces.join(" / ");
}

const baseUpdateRowSummary = updateRowSummary;
updateRowSummary = function updateRowSummaryWithDetails(row) {
  baseUpdateRowSummary(row);
  if (!row.classList.contains("catch-row")) return;

  const summary = row.querySelector(".collapsible-row-summary");
  const detail = row.querySelector(".collapsible-row-detail");
  if (!summary || !detail) return;

  const species = row.classList.contains("lost-fish-row")
    ? summaryOption(row.querySelector(".catch-possible-species"), ["Select possible species"])
    : summaryOption(row.querySelector(".catch-species"), ["Select species"]);
  const size = row.classList.contains("lost-fish-row")
    ? ""
    : [row.querySelector(".catch-length")?.value.trim(), row.querySelector(".catch-weight")?.value.trim()].filter(Boolean).join(" / ");
  const time = row.querySelector(".catch-time-unknown")?.checked
    ? "Unknown time"
    : formatDisplayTime(row.querySelector(".catch-time")?.value || "");
  const lure = isTrollingTrip()
    ? catchSetupSummary(row)
    : catchLurePreviewName(row);

  summary.textContent = fishRowLabel(row);
  detail.textContent = [species, size, time, lure].filter(Boolean).join(" \u2022 ");
};

function updateAllRowSummaries() {
  document.querySelectorAll(".catch-row, .gear-used-row").forEach(updateRowSummary);
}

function selectedComboForRow(row) {
  const comboId = row.querySelector(".trip-gear-combo")?.value || "";
  return state.rodReelCombos.find((combo) => combo.id === comboId);
}
