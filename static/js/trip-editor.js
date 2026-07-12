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
  if (!els.saveTripButton) return;
  els.saveTripButton.disabled = saving;
  els.saveTripButton.classList.toggle("is-loading", saving);
  els.saveTripButton.setAttribute("aria-busy", String(saving));
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
}

function isTripFormDirty() {
  return els.tripDialog?.open && tripFormSnapshot() !== tripFormInitialSnapshot;
}

function closeTripDialog({ force = false } = {}) {
  if (!els.tripDialog.open) return true;
  if (!force && isTripFormDirty() && !confirm("Discard unsaved trip changes?")) return false;
  tripFormInitialSnapshot = "";
  els.tripDialog.close();
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

function openTripDialog(trip = null) {
  activeTripId = trip?.id || null;
  els.tripDialogTitle.textContent = trip ? "Edit Trip" : "New Trip";
  els.deleteTripButton.classList.toggle("hidden", !trip);
  els.tripForm.reset();
  setTripSaveLoading(false);
  clearTripFormMessage();
  els.catchRows.innerHTML = "";
  els.lostFishRows.innerHTML = "";
  els.tripGearRows.innerHTML = "";
  els.personRows.innerHTML = "";
  activeNotePhotos = structuredClone(trip?.notePhotos || []);

  const today = new Date().toISOString().slice(0, 10);
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
  setWeatherStatus(activeTripWeatherData?.daily ? "Weather loaded" : "Choose a mapped location and date");
  renderNotePhotos();

  (trip?.people || []).forEach(addPersonRow);
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
    resetTripFormSnapshot();
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

function mergeTextList(...lists) {
  const values = new Map();
  lists.flat().forEach((value) => {
    const text = String(value || "").trim();
    if (!text) return;
    values.set(text.toLowerCase(), text);
  });
  return [...values.values()].sort((a, b) => a.localeCompare(b));
}

function tripIntent(trip) {
  return trip?.intent === "experimental" ? "experimental" : "serious";
}

function intentLabel(value) {
  return value === "experimental" ? "Experimental" : "Serious";
}

function addPersonRow(person = {}) {
  const template = document.querySelector("#personRowTemplate");
  const node = template.content.firstElementChild.cloneNode(true);
  node.dataset.personId = person.id || createId();
  node.querySelector(".person-name").value = person.name || "";
  els.personRows.append(node);
  populatePersonSelects();
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
    ".catch-lure",
    ".catch-retrieve",
    ".catch-presentation",
    ".catch-direction",
    ".catch-fow",
    ".catch-speed",
    ".catch-ball-depth",
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
  renderCatchPhotos(row);
  renderLurePreview(row);
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
      if (!field.value) field.value = startTime;
    });
  }
  if (endTime) {
    document.querySelectorAll("#tripGearRows .trip-gear-end-time").forEach((field) => {
      if (!field.value) field.value = endTime;
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
  node.catchWeatherData = catchItem.weatherData || null;
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
  populateLureSelect(node.querySelector(".catch-lure"), catchItem.lureId || "");
  renderLurePreview(node);
  renderCatchPhotos(node);
  updatePresentationFields(node);

  container.append(node);
  syncUnitLabels(node);
  populateSetupLineSelects();
  updateTrollingVisibility();
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
        : summaryOption(row.querySelector(".catch-lure"), ["No lure selected"]),
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
        fowCaught: !detailsUnknown && trolling ? row.querySelector(".catch-fow").value.trim() : "",
        speed: !detailsUnknown && trolling ? row.querySelector(".catch-speed").value.trim() : "",
        retrieve: !detailsUnknown && casting ? row.querySelector(".catch-retrieve").value.trim() : "",
        ballDepth: !detailsUnknown && trolling ? row.querySelector(".catch-ball-depth").value.trim() : "",
        flatlineWeightOz: !detailsUnknown && trolling ? row.querySelector(".catch-flatline-weight-oz").value.trim() : "",
        lineBehindBoard: !detailsUnknown && trolling ? row.querySelector(".catch-line-behind-board").value.trim() : "",
        leadcoreColors: !detailsUnknown && trolling ? row.querySelector(".catch-leadcore-colors").value.trim() : "",
        estimatedLureDepth: !detailsUnknown && trolling ? row.querySelector(".catch-estimated-lure-depth").value.trim() : "",
        dipseySetting: !detailsUnknown && trolling ? row.querySelector(".catch-dipsey-setting").value.trim() : "",
        lineOut: !detailsUnknown && trolling ? row.querySelector(".catch-line-out").value.trim() : "",
        estimatedDepth: !detailsUnknown && trolling ? row.querySelector(".catch-estimated-depth").value.trim() : "",
        notes: detailsUnknown ? "" : row.querySelector(".catch-notes").value.trim(),
        manualCoordinates: detailsUnknown || lost ? null : manualCoordinatesFromRow(row),
        coordinates: detailsUnknown || lost ? null : fishCoordinatesFromRow(row),
        photos: detailsUnknown || lost ? [] : collectCatchPhotos(row)
      };
      if (!detailsUnknown && !lost && row.catchWeatherData) base.weatherData = row.catchWeatherData;
      return !detailsUnknown && trolling
        ? {
            ...base,
            setupLineId: row.querySelector(".catch-setup-line").value.split("::")[0],
            setupLineTarget: row.querySelector(".catch-setup-line").value.endsWith("::cheater") ? "cheater" : "",
            lureId: row.querySelector(".catch-lure").value,
            flasherId: ""
          }
        : { ...base, lureId: row.querySelector(".catch-lure").value, flasherId: "", presentation: "" };
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
      || item.setupLineId
      || item.lureId
      || item.flasherId
      || item.presentation
      || item.direction
      || item.fowCaught
      || item.speed
      || item.retrieve
      || item.ballDepth
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
    const usedPersonIds = new Set([
      ...trip.catches.map((catchItem) => catchItem.personId).filter(Boolean),
      ...trip.lostFish.map((fish) => fish.personId).filter(Boolean)
    ]);
    trip.people = trip.people.filter((person) => usedPersonIds.has(person.id));
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
  const trip = state.trips.find((item) => item.id === activeTripId);
  if (!confirm(`Delete ${trip?.title || trip?.location || "this trip"}?`)) return;
  state.trips = state.trips.filter((item) => item.id !== activeTripId);
  try {
    await saveState();
    closeTripDialog({ force: true });
    renderAll();
  } catch (error) {
    console.error("Could not delete trip.", error);
    showTripFormMessage(error.message || "The trip could not be deleted.");
  }
}
