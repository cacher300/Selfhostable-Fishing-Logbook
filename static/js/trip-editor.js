function clearTripFormMessage() {
  els.tripFormMessage.classList.add("hidden");
  els.tripFormMessage.textContent = "";
  els.tripForm.querySelectorAll("[aria-invalid='true']").forEach((field) => {
    field.removeAttribute("aria-invalid");
  });
}

function showTripFormMessage(message, fields = []) {
  els.tripFormMessage.textContent = message;
  els.tripFormMessage.classList.remove("hidden");
  fields.forEach((field) => field.setAttribute("aria-invalid", "true"));
  fields[0]?.scrollIntoView({ behavior: "smooth", block: "center" });
  fields[0]?.focus({ preventScroll: true });
}

function setTripSaveLoading(saving) {
  document.querySelectorAll("[data-trip-save]").forEach((button) => {
    button.disabled = saving;
    button.classList.toggle("is-loading", saving);
    button.setAttribute("aria-busy", String(saving));
  });
}

function tripFormSnapshot() {
  if (!els.tripForm) return "";
  const controls = [...els.tripForm.querySelectorAll("input, select, textarea")]
    .filter((control) => control.type !== "file")
    .map((control) => ({
      name: control.id || control.name || control.className || control.tagName,
      value: control.type === "checkbox" || control.type === "radio" ? control.checked : control.value
    }));
  return JSON.stringify({
    controls,
    notePhotos: activeNotePhotos.map((photo) => photo.id || photo.filename || photo.url || photo.image || ""),
    catchPhotos: [...els.catchRows.querySelectorAll(".catch-row")].map((row) => (row.catchPhotos || []).map((photo) => photo.id || photo.filename || photo.url || photo.image || "")),
    lostCount: els.lostFishRows.querySelectorAll(".catch-row").length,
    gearCount: els.tripGearRows.querySelectorAll(".gear-used-row").length,
    peopleCount: els.personRows.querySelectorAll(".person-row").length
  });
}

function resetTripFormSnapshot() {
  tripFormInitialSnapshot = tripFormSnapshot();
  tripFormUserChanged = false;
  syncTripFormChrome();
}

function isTripFormDirty() {
  return els.tripDialog?.open && tripFormSnapshot() !== tripFormInitialSnapshot;
}

function tripDateLabel(value) {
  if (!value) return "";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.valueOf())
    ? value
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function updateTripDialogHeader() {
  const title = getValue("tripTitle") || (activeTripId ? "Untitled Trip" : "New Trip");
  const date = tripDateLabel(document.querySelector("#tripDate")?.value);
  const location = selectedText(els.tripLocation);
  els.tripDialogTitle.textContent = title;
  if (els.tripDialogMeta) {
    els.tripDialogMeta.textContent = [date, location].filter(Boolean).join(" \u2022 ") || "Trip details";
  }
}

function syncTripFormChrome() {
  els.tripSaveBar?.classList.toggle("is-dirty", tripFormUserChanged && isTripFormDirty());
  updateTripDialogHeader();
}

function markTripFormChanged() {
  tripFormUserChanged = true;
  syncTripFormChrome();
}

function closeTripDialog({ force = false } = {}) {
  if (!els.tripDialog.open) return true;
  if (!force && isTripFormDirty() && !confirm("Discard unsaved trip changes?")) return false;
  tripFormInitialSnapshot = "";
  tripFormUserChanged = false;
  els.tripDialog.close();
  els.tripSaveBar?.classList.remove("is-dirty");
  els.tripSaveBar?.classList.remove("is-existing-trip");
  return true;
}

function validateTripForm() {
  clearTripFormMessage();
  const requiredFields = [
    { field: document.querySelector("#tripDate"), label: "Date" },
    { field: document.querySelector("#tripLocation"), label: "Location / waterbody" },
    { field: document.querySelector("#targetSpecies"), label: "Target species" }
  ];
  const missing = requiredFields.filter(({ field }) => !field.value.trim());
  if (!missing.length) return true;

  const labels = missing.map((item) => item.label).join(", ");
  showTripFormMessage(`Please fill out: ${labels}.`, missing.map((item) => item.field));
  return false;
}

function tripSaveWarnings() {
  const warnings = [];
  const importantFields = [
    { field: document.querySelector("#startTime"), label: "Trip start time" },
    { field: document.querySelector("#endTime"), label: "Trip end time" },
    { field: document.querySelector("#method"), label: "Fishing method" }
  ];
  importantFields
    .filter(({ field }) => !field?.value.trim())
    .forEach(({ label }) => warnings.push(`${label} is blank.`));

  const trolling = isTrollingTrip();
  const setupRows = [...els.tripGearRows.querySelectorAll(".gear-used-row")];
  if (trolling && !setupRows.length) warnings.push("No rods have been added to the setup timeline.");

  setupRows.forEach((row, index) => {
    const label = setupLineLabelFromRow(row, index);
    const startTime = row.querySelector(".trip-gear-start-time")?.value || "";
    const endTime = row.querySelector(".trip-gear-end-time")?.value || "";
    if (!startTime || !endTime) {
      warnings.push(`${label} is missing a deployment start or stop time.`);
      return;
    }
    const deployedHours = calculateMinutes(startTime, endTime) / 60;
    if (deployedHours > 12) {
      warnings.push(`${label} is deployed for ${trimNumber(deployedHours)} hours.`);
    }
  });

  document.querySelectorAll(".catch-row").forEach((row) => {
    const label = fishRowLabel(row);
    const detailsUnknown = row.querySelector(".catch-details-unknown")?.checked && !row.classList.contains("lost-fish-row");
    const speciesField = row.classList.contains("lost-fish-row")
      ? row.querySelector(".catch-possible-species")
      : row.querySelector(".catch-species");
    if (!detailsUnknown && !row.querySelector(".catch-person")?.value) warnings.push(`${label} has no person selected.`);
    if (!speciesField?.value.trim()) warnings.push(`${label} has no species selected.`);
    if (!detailsUnknown && !row.querySelector(".catch-time")?.value && !row.querySelector(".catch-time-unknown")?.checked) warnings.push(`${label} has no time.`);
    if (!detailsUnknown && trolling && !row.querySelector(".catch-setup-line")?.value) warnings.push(`${label} has no rod selected.`);
  });
  return warnings;
}

function generatedTripTitle(trip) {
  return [trip?.date, trip?.targetSpecies ? `${trip.targetSpecies} Trip` : "Trip"].filter(Boolean).join(" ");
}

function confirmTripSaveWarnings() {
  const warnings = tripSaveWarnings();
  if (!warnings.length) return true;
  return confirm(`Please review before saving:\n\n${warnings.map((warning) => `• ${warning}`).join("\n")}\n\nSave anyway?`);
}

function tripDeleteTitle(trip) {
  return String(trip?.title || generatedTripTitle(trip || {}) || trip?.location || "Untitled trip").trim();
}

function confirmTripDeletion(trip) {
  const title = tripDeleteTitle(trip);
  if (!confirm(`Delete "${title}"?\n\nThis permanently removes the trip, catches, notes, and saved trip media references.`)) return false;
  if (!confirm(`Second check: are you absolutely sure you want to delete "${title}"?`)) return false;
  const typed = prompt(`Final check: type the trip title exactly to delete it.\n\n${title}`);
  if (typed !== title) {
    alert("Trip title did not match. The trip was not deleted.");
    return false;
  }
  return true;
}

async function deleteTripById(tripId, options = {}) {
  const trip = state.trips.find((item) => item.id === tripId);
  if (!trip || !confirmTripDeletion(trip)) return false;
  state.trips = state.trips.filter((item) => item.id !== tripId);
  await saveState();
  if (options.closeEditor) closeTripDialog({ force: true });
  if (options.closeSummary) {
    activeSummaryTripId = null;
    els.tripSummaryDialog.close();
  }
  renderAll();
  return true;
}

function localDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function openTripDialog(trip = null) {
  activeTripId = trip?.id || null;
  els.deleteTripButton.classList.toggle("hidden", !trip);
  els.tripSaveBar?.classList.toggle("is-existing-trip", Boolean(trip));
  els.tripForm.reset();
  setTripSaveLoading(false);
  clearTripFormMessage();
  els.catchRows.innerHTML = "";
  els.lostFishRows.innerHTML = "";
  els.tripGearRows.innerHTML = "";
  els.personRows.innerHTML = "";
  activeNotePhotos = structuredClone(trip?.notePhotos || []);

  const today = localDateInputValue();
  setValue("tripId", trip?.id || "");
  setValue("tripTitle", trip?.title || "");
  setValue("tripDate", trip?.date || today);
  const location = findLocationByIdOrName(trip?.locationId, trip?.location);
  populateLocationSelect(location?.id || "");
  const launch = findLaunchByIdOrName(location, trip?.launchId, trip?.launch);
  populateLaunchSelect(launch?.id || "");
  setValue("startTime", trip?.startTime || "");
  setValue("endTime", trip?.endTime || "");
  setValue("targetSpecies", trip?.targetSpecies || "");
  setValue("method", trip?.method || "");
  setTripIntent(tripIntent(trip || {}));
  setTripRating(tripRatingValue(trip || {}));
  setValue("waterTemp", trip?.waterTemp || "");
  setValue("waterClarity", trip?.waterClarity || "");
  setValue("weather", trip?.weather || "");
  setValue("waveHeight", trip?.waveHeight || "");
  setValue("waveChopDisplay", trip?.waveChop || "");
  updateMarineWaveHeightPlaceholder(trip?.weatherData || activeTripWeatherData);
  updateAutoWaveChopDisplay(trip?.weatherData || activeTripWeatherData);
  setValue("structure", trip?.structure || "");
  setValue("tripNotes", trip?.notes || "");
  activeTripWeatherData = trip?.weatherData || null;
  activeTripWeatherKey = "";
  setWeatherStatus(activeTripWeatherData?.daily ? weatherCardConditionsLabel() : "Choose a mapped location and date");
  renderWeatherSummary(activeTripWeatherData);
  renderNotePhotos();

  const tripPeople = trip?.people || [];
  if (tripPeople.length) {
    tripPeople.forEach(addPersonRow);
  } else {
    const savedPeople = (state.people || []).filter((person) => person.name?.trim());
    addPersonRow(savedPeople.length === 1 ? savedPeople[0] : {}, { editNew: savedPeople.length !== 1 });
  }
  (trip?.gearUsed || []).forEach(addTripGearRow);
  (trip?.catches || []).forEach(addCatchRow);
  (trip?.lostFish || []).forEach(addLostFishRow);
  populateSetupLineSelects();
  updateTrollingVisibility();
  renderLiveTrollingSpread();
  syncUnitLabels(els.tripForm);
  els.tripDialog.showModal();
  els.tripForm.scrollTop = 0;
  requestAnimationFrame(() => {
    els.tripForm.scrollTop = 0;
    els.personRows.querySelector("[data-focus-person-name='true'] .person-name")?.focus({ preventScroll: true });
    resetTripFormSnapshot();
    updateTripDialogHeader();
  });
  scheduleTripWeatherPreview(true);
}

function setValue(id, value) {
  document.querySelector(`#${id}`).value = value;
}

function getValue(id) {
  return document.querySelector(`#${id}`).value.trim();
}

function getTripIntent() {
  return document.querySelector('input[name="tripIntent"]:checked')?.value || "serious";
}

function setTripIntent(value) {
  const normalized = value === "experimental" ? "experimental" : "serious";
  const input = document.querySelector(`input[name="tripIntent"][value="${normalized}"]`);
  if (input) input.checked = true;
}

function tripRatingValue(trip) {
  if (trip?.tripRating === null || trip?.tripRating === undefined || trip?.tripRating === "") return 1;
  const value = Number(trip.tripRating);
  if (!Number.isFinite(value)) return 1;
  if (value <= 1) return 1;
  return Math.min(4, Math.max(1, Math.round(value)));
}

function setTripRating(value) {
  els.tripRating.value = String(tripRatingValue({ tripRating: value }));
  updateTripRatingLabel();
}

function updateTripRatingLabel() {
  els.tripRatingLabel.textContent = tripRatingLabel(tripRatingValue({ tripRating: els.tripRating.value }));
}

function tripRatingLabel(value) {
  const rating = tripRatingValue({ tripRating: value });
  return ["Bad", "Mediocre", "Good", "Outstanding"][rating - 1];
}

function tripRatingClass(value) {
  return tripRatingLabel(value).toLowerCase().replaceAll(" ", "-");
}

function mergePeople(...personLists) {
  const peopleById = new Map();
  const idsByName = new Map();
  personLists.flat().forEach((person) => {
    const name = person?.name?.trim();
    if (!person?.id || !name) return;
    const normalizedName = name.toLowerCase();
    const existingId = idsByName.get(normalizedName);
    if (existingId) {
      peopleById.set(existingId, { id: existingId, name });
      return;
    }
    peopleById.set(person.id, { id: person.id, name });
    idsByName.set(normalizedName, person.id);
  });
  return [...peopleById.values()].filter((person) => person.name);
}

function tripIntent(trip) {
  return trip?.intent === "experimental" ? "experimental" : "serious";
}

function intentLabel(value) {
  return value === "experimental" ? "Experimental" : "Serious";
}

function hasCatchDepthData(depthData) {
  return Boolean(depthData && Object.values(depthData).some((value) => value !== null && value !== undefined && value !== ""));
}

function addPersonRow(person = {}, { editNew = false } = {}) {
  const template = document.querySelector("#personRowTemplate");
  const node = template.content.firstElementChild.cloneNode(true);
  node.dataset.personId = person.id || createId();
  node.querySelector(".person-name").value = person.name || "";
  els.personRows.append(node);
  populatePersonSelects();
  if (editNew) {
    const select = node.querySelector(".person-select");
    const input = node.querySelector(".person-name");
    select.value = "__new__";
    input.classList.remove("hidden");
    node.dataset.focusPersonName = "true";
  }
}

function collectPeople() {
  return [...els.personRows.querySelectorAll(".person-row")]
    .map((row) => personFromRow(row))
    .filter((person) => person.name);
}

function personFromRow(row) {
  const select = row.querySelector(".person-select");
  const input = row.querySelector(".person-name");
  const selected = select?.value || "";
  if (selected && selected !== "__new__") {
    const existing = state.people.find((person) => person.id === selected)
      || collectNewPeople({ excludeRow: row }).find((person) => person.id === selected);
    return {
      id: existing?.id || row.dataset.personId || selected,
      name: existing?.name || select.selectedOptions[0]?.textContent?.trim() || ""
    };
  }
  return {
    id: row.dataset.personId || createId(),
    name: input?.value.trim() || ""
  };
}

function collectNewPeople({ excludeRow = null } = {}) {
  return [...els.personRows.querySelectorAll(".person-row")]
    .filter((row) => row !== excludeRow)
    .map((row) => {
      const select = row.querySelector(".person-select");
      const input = row.querySelector(".person-name");
      if (select?.value !== "__new__") return null;
      const name = input?.value.trim();
      return name ? { id: row.dataset.personId || createId(), name } : null;
    })
    .filter(Boolean);
}

function syncPersonRowIds() {
  els.personRows.querySelectorAll(".person-row").forEach((row) => {
    const person = personFromRow(row);
    const name = person.name.trim().toLowerCase();
    const existingPerson = state.people.find((person) => person.name?.trim().toLowerCase() === name);
    if (existingPerson) row.dataset.personId = existingPerson.id;
  });
}

function currentPeople() {
  syncPersonRowIds();
  return mergePeople(state.people, collectPeople());
}

function populatePersonSelect(select, selectedId = "") {
  syncPersonRowIds();
  const people = mergePeople(collectPeople());
  select.innerHTML = people.map((person) => (
    `<option value="${person.id}" ${person.id === selectedId ? "selected" : ""}>${escapeHtml(person.name)}</option>`
  )).join("");
}

function populatePersonSelects() {
  populateDatalist(els.personOptions, currentPeople().map((person) => person.name).filter(Boolean));
  populatePersonRowSelects();
  document.querySelectorAll(".catch-person").forEach((select) => {
    populatePersonSelect(select, select.value);
  });
}

function populatePersonRowSelects() {
  const allPeople = currentPeople();
  els.personRows.querySelectorAll(".person-row").forEach((row) => {
    const select = row.querySelector(".person-select");
    const input = row.querySelector(".person-name");
    const isAddingNew = select.value === "__new__";
    const customName = input.value.trim();
    const selectedId = row.dataset.personId || "";
    const hasExistingSelection = allPeople.some((person) => person.id === selectedId);
    const addingNew = isAddingNew || (!hasExistingSelection && customName);
    select.innerHTML = [
      `<option value="">Select person</option>`,
      ...allPeople.map((person) => (
        `<option value="${escapeHtml(person.id)}" ${person.id === selectedId ? "selected" : ""}>${escapeHtml(person.name)}</option>`
      )),
      `<option value="__new__" ${addingNew ? "selected" : ""}>Add new person...</option>`
    ].join("");
    input.classList.toggle("hidden", select.value !== "__new__");
  });
}

function addCatchRow(catchItem = {}) {
  addFishRow(catchItem, { container: els.catchRows, lost: false });
}

function addLostFishRow(fishItem = {}) {
  addFishRow(fishItem, { container: els.lostFishRows, lost: true });
}

function defaultFishTime(catchItem = {}) {
  return catchItem.timeUnknown ? "" : (catchItem.time ?? getValue("startTime"));
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
    ".catch-water-depth",
    ".catch-depth-down",
    ".catch-latitude",
    ".catch-longitude",
    ".catch-setup-line",
    ".catch-rod",
    ".catch-lure",
    ".catch-retrieve",
    ".catch-presentation",
    ".catch-direction",
    ".catch-fow",
    ".catch-speed",
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
  return gearItem.startTime ?? getValue("startTime");
}

function defaultSetupEndTime(gearItem = {}) {
  return gearItem.endTime ?? getValue("endTime");
}

function syncTripTimesToBlankRows() {
  const startTime = getValue("startTime");
  const endTime = getValue("endTime");
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

  populatePersonSelect(node.querySelector(".catch-person"), catchItem.personId || "");
  populateOptionSelect(node.querySelector(".catch-species"), state.species, "Select species");
  populateOptionSelect(node.querySelector(".catch-possible-species"), state.species, "Select possible species");
  populateChoiceSelect(node.querySelector(".catch-presentation"), optionChoices("trollingPresentations"), "Select method", catchItem.presentation || "");
  populateOptionSelect(node.querySelector(".catch-direction"), optionLabels("trollingDirections"), "Select direction");
  node.querySelector(".catch-species").value = lost ? "" : (catchItem.species || "");
  node.querySelector(".catch-possible-species").value = catchItem.possibleSpecies || catchItem.species || "";
  node.querySelector(".catch-details-unknown").checked = !lost && Boolean(catchItem.detailsUnknown);
  node.querySelector(".catch-released").checked = Boolean(catchItem.released);
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
  updateCatchLocationSummary(node);
  node.querySelector(".catch-presentation").value = catchItem.presentation || "";
  node.querySelector(".catch-direction").value = catchItem.direction || "";
  node.querySelector(".catch-fow").value = catchItem.fowCaught || "";
  node.querySelector(".catch-speed").value = catchItem.speed || "";
  node.querySelector(".catch-retrieve").value = catchItem.retrieve || "";
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
  populateCatchRodSelect(node.querySelector(".catch-rod"), catchItem.rodId || "");
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
}

function addTripGearRow(gearItem = {}) {
  const template = document.querySelector("#tripGearRowTemplate");
  const node = template.content.firstElementChild.cloneNode(true);
  node.dataset.rowId = createId();
  node.dataset.gearId = gearItem.id || "";

  node.querySelector(".trip-gear-start-time").value = defaultSetupStartTime(gearItem);
  node.querySelector(".trip-gear-end-time").value = defaultSetupEndTime(gearItem);
  node.querySelector(".trip-gear-change-note").value = gearItem.changeNote || gearItem.notes || "";
  const side = gearItem.side || defaultSetupLineSide(gearItem, els.tripGearRows.querySelectorAll(".gear-used-row").length);
  populateChoiceSelect(node.querySelector(".trip-gear-side"), optionChoices("setupLineSides"), "Select side", side);
  populateChoiceSelect(node.querySelector(".catch-presentation"), optionChoices("trollingPresentations"), "Select method", gearItem.presentation || "");
  node.querySelector(".trip-gear-side").value = side;
  node.querySelector(".trip-gear-line-label").value = gearItem.lineLabel || "";
  const matchingCombo = (gearItem.rodId || gearItem.reelId) && state.rodReelCombos.find((combo) => (
    combo.rodId === gearItem.rodId && combo.reelId === gearItem.reelId
  ));
  populateComboSelect(node.querySelector(".trip-gear-combo"), gearItem.comboId || matchingCombo?.id || "");
  node.querySelector(".catch-presentation").value = gearItem.presentation || "";
  node.querySelector(".trip-gear-cheater").checked = Boolean(gearItem.hasCheater);
  node.querySelector(".trip-gear-leadcore").checked = Boolean(gearItem.hasLeadcore);
  populateLureSelect(node.querySelector(".trip-gear-lure"), gearItem.lureId || "");
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
}

function populateLureSelect(select, selectedId = "") {
  select.innerHTML = `<option value="">No lure selected</option>` + state.lures.map((lure) => {
    const label = [lure.name, lure.color].filter(Boolean).join(" - ");
    return `<option value="${lure.id}" ${lure.id === selectedId ? "selected" : ""}>${escapeHtml(label)}</option>`;
  }).join("");
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

function setupLineOptionsFromForm() {
  return [...els.tripGearRows.querySelectorAll(".gear-used-row")].flatMap((row, index) => {
    if (!row.dataset.gearId) row.dataset.gearId = createId();
    const timeRange = formatDisplayTimeRange(
      row.querySelector(".trip-gear-start-time")?.value,
      row.querySelector(".trip-gear-end-time")?.value,
      "12"
    );
    const mainOption = {
      id: row.dataset.gearId,
      label: [setupLineLabelFromRow(row, index), timeRange].filter(Boolean).join(" / ")
    };
    if (!row.querySelector(".trip-gear-cheater")?.checked) return [mainOption];
    const cheaterLure = selectedText(row.querySelector(".trip-gear-cheater-lure")).replace("No lure selected", "");
    return [
      mainOption,
      {
        id: `${row.dataset.gearId}::cheater`,
        label: [`${cheaterLineLabelFromRow(row, index)} — Cheater`, cheaterLure, timeRange].filter(Boolean).join(" / ")
      }
    ];
  });
}

function populateSetupLineSelect(select, selectedId = "") {
  const options = setupLineOptionsFromForm();
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
    renderLurePreview(row);
  }
  updateRowSummary(row);
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

function updateRowSummary(row) {
  const summary = row.querySelector(".collapsible-row-summary");
  if (!summary) return;

  if (row.classList.contains("catch-row")) {
    const released = row.querySelector(".catch-released")?.checked && !row.classList.contains("lost-fish-row");
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
    summaryOption(row.querySelector(".catch-presentation"), ["Select method"])
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
    : summaryOption(row.querySelector(".catch-lure"), ["No lure selected"]);

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

function collectTripFromForm() {
  const trolling = isTrollingTrip();
  const people = collectPeople();
  const gearUsed = [...els.tripGearRows.querySelectorAll(".gear-used-row")]
    .map((row) => ({
      id: row.dataset.gearId || createId(),
      personId: "",
      startTime: row.querySelector(".trip-gear-start-time").value,
      endTime: row.querySelector(".trip-gear-end-time").value,
      changeNote: row.querySelector(".trip-gear-change-note").value.trim(),
      side: trolling ? row.querySelector(".trip-gear-side").value : "",
      lineLabel: trolling ? row.querySelector(".trip-gear-line-label").value.trim() : "",
      hasLeadcore: trolling && isLeadcoreCapablePresentation(row.querySelector(".catch-presentation").value)
        ? row.querySelector(".trip-gear-leadcore").checked
        : false,
      comboId: row.querySelector(".trip-gear-combo").value,
      rodId: selectedComboForRow(row)?.rodId || "",
      reelId: selectedComboForRow(row)?.reelId || "",
      lureId: row.querySelector(".trip-gear-lure").value,
      flasherId: trolling ? row.querySelector(".trip-gear-flasher").value : "",
      presentation: trolling ? row.querySelector(".catch-presentation").value : "",
      deepestRigger: false,
      hasCheater: trolling && ["downrigger", "Downrigger"].includes(row.querySelector(".catch-presentation").value)
        ? row.querySelector(".trip-gear-cheater").checked
        : false,
      cheaterLureId: trolling
        && ["downrigger", "Downrigger"].includes(row.querySelector(".catch-presentation").value)
        && row.querySelector(".trip-gear-cheater").checked
        ? row.querySelector(".trip-gear-cheater-lure").value
        : "",
      lureMinutes: row.querySelector(".trip-gear-lure").value ? setupMinutesFromRow(row) : 0,
      flasherMinutes: trolling && row.querySelector(".trip-gear-flasher").value ? setupMinutesFromRow(row) : 0
    }))
    .filter((item) => (
      item.startTime
      || item.endTime
      || item.changeNote
      || item.lineLabel
      || item.hasLeadcore
      || item.comboId
      || item.rodId
      || item.reelId
      || item.lureId
      || item.flasherId
      || item.lureMinutes
      || item.flasherMinutes
      || item.presentation
      || item.deepestRigger
      || item.hasCheater
      || item.cheaterLureId
    ));

  const collectFishRows = (container, lost = false) => [...container.querySelectorAll(".catch-row")]
    .map((row) => {
      const casting = isCastingTrip();
      const detailsUnknown = !lost && Boolean(row.querySelector(".catch-details-unknown")?.checked);
      const base = {
        id: row.dataset.catchId || createId(),
        detailsUnknown,
        personId: detailsUnknown ? "" : row.querySelector(".catch-person").value,
        species: lost ? "" : row.querySelector(".catch-species").value.trim(),
        possibleSpecies: lost ? row.querySelector(".catch-possible-species").value.trim() : "",
        released: detailsUnknown || lost ? false : row.querySelector(".catch-released").checked,
        length: lost ? "" : row.querySelector(".catch-length").value.trim(),
        weight: lost ? "" : row.querySelector(".catch-weight").value.trim(),
        time: detailsUnknown ? "" : row.querySelector(".catch-time").value,
        timeUnknown: detailsUnknown ? false : row.querySelector(".catch-time-unknown").checked,
        waterDepth: detailsUnknown ? "" : row.querySelector(".catch-water-depth").value.trim(),
        depthDown: detailsUnknown ? "" : row.querySelector(".catch-depth-down").value.trim(),
        presentation: !detailsUnknown && trolling ? row.querySelector(".catch-presentation").value : "",
        direction: !detailsUnknown && trolling ? row.querySelector(".catch-direction").value : "",
        fowCaught: !detailsUnknown && (trolling || lost) ? row.querySelector(".catch-fow").value.trim() : "",
        speed: !detailsUnknown && trolling ? row.querySelector(".catch-speed").value.trim() : "",
        retrieve: !detailsUnknown && casting ? row.querySelector(".catch-retrieve").value.trim() : "",
        ballDepth: !detailsUnknown && trolling ? row.querySelector(".catch-ball-depth").value.trim() : "",
        deepestRigger: !detailsUnknown && trolling && ["downrigger", "Downrigger"].includes(row.querySelector(".catch-presentation").value)
          ? row.querySelector(".catch-deepest-rigger").checked
          : false,
        flatlineWeightOz: !detailsUnknown && trolling ? row.querySelector(".catch-flatline-weight-oz").value.trim() : "",
        lineBehindBoard: !detailsUnknown && trolling ? row.querySelector(".catch-line-behind-board").value.trim() : "",
        leadcoreColors: !detailsUnknown && trolling ? row.querySelector(".catch-leadcore-colors").value.trim() : "",
        estimatedLureDepth: !detailsUnknown && trolling ? row.querySelector(".catch-estimated-lure-depth").value.trim() : "",
        dipseySetting: !detailsUnknown && trolling ? row.querySelector(".catch-dipsey-setting").value.trim() : "",
        lineOut: !detailsUnknown && trolling ? row.querySelector(".catch-line-out").value.trim() : "",
        estimatedDepth: !detailsUnknown && trolling ? row.querySelector(".catch-estimated-depth").value.trim() : "",
        notes: detailsUnknown ? "" : row.querySelector(".catch-notes").value.trim(),
        metadataLocks: detailsUnknown || lost ? { time: false, location: false, fow: false } : catchMetadataLocksPayload(row),
        lockedLocationCoordinates: detailsUnknown || lost ? null : lockedPhotoCoordinatesFromRow(row),
        manualCoordinates: detailsUnknown ? null : manualCoordinatesFromRow(row),
        coordinates: detailsUnknown ? null : fishCoordinatesFromRow(row),
        photoLocationId: detailsUnknown || lost ? "" : (catchPhotoLocationById(row)?.id || ""),
        heroPhotoId: detailsUnknown || lost ? "" : (selectedCatchHeroPhoto(row)?.id || ""),
        photos: detailsUnknown || lost ? [] : collectCatchPhotos(row)
      };
      const selectedRodId = row.querySelector(".catch-rod")?.selectedOptions?.[0]?.dataset.rodId || "";
      if (!detailsUnknown && !lost && row.catchWeatherData) base.weatherData = row.catchWeatherData;
      if (!detailsUnknown && hasCatchDepthData(row.catchDepthData)) {
        Object.assign(base, row.catchDepthData);
      }
      return !detailsUnknown && trolling
        ? {
            ...base,
            setupLineId: row.querySelector(".catch-setup-line").value.split("::")[0],
            setupLineTarget: row.querySelector(".catch-setup-line").value.endsWith("::cheater") ? "cheater" : "",
            lureId: row.querySelector(".catch-lure").value,
            flasherId: ""
          }
        : { ...base, rodId: selectedRodId, lureId: row.querySelector(".catch-lure").value, flasherId: "", presentation: "" };
    })
    .filter((item) => (
      item.species
      || item.possibleSpecies
      || item.length
      || item.weight
      || item.detailsUnknown
      || item.timeUnknown
      || item.waterDepth
      || item.depthDown
      || item.rodId
      || item.setupLineId
      || item.lureId
      || item.flasherId
      || item.presentation
      || item.direction
      || item.fowCaught
      || item.speed
      || item.retrieve
      || item.ballDepth
      || item.deepestRigger
      || item.flatlineWeightOz
      || item.lineBehindBoard
      || item.leadcoreColors
      || item.estimatedLureDepth
      || item.dipseySetting
      || item.lineOut
      || item.estimatedDepth
      || isUsableCoordinates(item.manualCoordinates)
      || item.notes
      || item.photos.length
    ));

  const catches = collectFishRows(els.catchRows);
  const lostFish = collectFishRows(els.lostFishRows, true);

  const location = state.locations.find((item) => item.id === getValue("tripLocation"));
  const launch = findLaunchByIdOrName(location, getValue("tripLaunch"), "");
  const weatherData = activeTripWeatherData || null;
  const waveHeight = getValue("waveHeight");
  const waveChop = chopLabelForWaveHeight(waveHeight);

  return {
    id: getValue("tripId") || createId(),
    title: getValue("tripTitle"),
    date: getValue("tripDate"),
    location: location?.name || "",
    locationId: location?.id || "",
    launch: launch?.name || "",
    launchId: launch?.id || "",
    startTime: getValue("startTime"),
    endTime: getValue("endTime"),
    hours: calculateHours(getValue("startTime"), getValue("endTime")),
    targetSpecies: getValue("targetSpecies"),
    method: getValue("method"),
    intent: getTripIntent(),
    tripRating: tripRatingValue({ tripRating: els.tripRating.value }),
    waterTemp: getValue("waterTemp"),
    waterClarity: getValue("waterClarity"),
    weather: getValue("weather"),
    waveHeight,
    waveChop,
    wind: weatherWindText(weatherData),
    weatherData,
    structure: getValue("structure"),
    notes: getValue("tripNotes"),
    notePhotos: collectNotePhotos(),
    people,
    gearUsed,
    catches,
    lostFish
  };
}

function upsertListValue(listName, value) {
  if (value && !state[listName].includes(value)) state[listName].push(value);
}

async function saveTrip(event) {
  event.preventDefault();
  if (!validateTripForm()) return;
  if (!confirmTripSaveWarnings()) return;
  setTripSaveLoading(true);

  try {
    let trip = collectTripFromForm();
    trip.title = trip.title || generatedTripTitle(trip);
    state.people = mergePeople(state.people, trip.people);
    state.locations = mergeLocations(state.locations, [trip.location]);
    upsertListValue("species", trip.targetSpecies);
    upsertListValue("methods", trip.method);
    upsertListValue("waterClarities", trip.waterClarity);
    upsertListValue("weatherTypes", trip.weather);
    trip.catches.forEach((catchItem) => upsertListValue("species", catchItem.species));
    trip.lostFish.forEach((fish) => upsertListValue("species", fish.possibleSpecies));
    trip = await enrichTripWithWeather(trip);
    trip = resolveTripWaveSnapshot(trip);
    trip.wind = weatherWindText(trip.weatherData);
    activeTripWeatherData = trip.weatherData || null;

    const index = state.trips.findIndex((item) => item.id === trip.id);
    if (index >= 0) state.trips[index] = trip;
    else state.trips.push(trip);

    await saveState();
    closeTripDialog({ force: true });
    renderAll();
  } catch (error) {
    console.error("Could not save trip.", error);
    setTripSaveLoading(false);
    showTripFormMessage(error.message || "The trip could not be saved. Check that required fields are filled and try again.");
  }
}

async function deleteActiveTrip() {
  if (!activeTripId) return;
  try {
    await deleteTripById(activeTripId, { closeEditor: true });
  } catch (error) {
    console.error("Could not delete trip.", error);
    showTripFormMessage(error.message || "The trip could not be deleted.");
  }
}
