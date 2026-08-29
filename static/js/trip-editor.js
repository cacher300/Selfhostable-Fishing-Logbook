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
  const date = tripDateLabel(document.querySelector("#tripDateValue")?.value || document.querySelector("#tripDate")?.value);
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
  const tripDateDisplay = document.querySelector("#tripDate");
  if (tripDateDisplay && typeof syncCalendarDate === "function") syncCalendarDate("tripDateValue");
  const requiredFields = [
    { field: tripDateDisplay, label: "Date" },
    { field: document.querySelector("#tripLocation"), label: "Location / waterbody" },
    { field: document.querySelector("#targetSpecies"), label: "Target species" }
  ];
  const missing = requiredFields.filter(({ field }) => !field.value.trim());
  const tripDateValue = document.querySelector("#tripDateValue")?.value || "";
  if (tripDateDisplay?.value.trim() && !tripDateValue) {
    showTripFormMessage("Enter a valid date as mm/dd/yyyy.", [tripDateDisplay]);
    return false;
  }
  if (!missing.length) return true;

  const labels = missing.map((item) => item.label).join(", ");
  showTripFormMessage(`Please fill out: ${labels}.`, missing.map((item) => item.field));
  return false;
}

function tripSaveWarnings() {
  const warnings = [];
  const importantFields = [
    { field: document.querySelector("#launchTime"), label: "Launch time" },
    { field: document.querySelector("#linesPulledTime"), label: "Lines pulled time" },
    { field: document.querySelector("#method"), label: "Fishing method" }
  ];
  importantFields
    .filter(({ field }) => !field?.value.trim())
    .forEach(({ label }) => warnings.push(`${label} is blank.`));

  const expedition = state.expeditions.find((item) => item.id === getValue("tripExpedition"));
  if (expedition && ExpeditionAnalytics.tripOutsideRange({ date: getValue("tripDate") }, expedition)) {
    warnings.push(`Trip date is outside ${expedition.name} (${expeditionDateRange(expedition)}).`);
  }

  const trolling = isTrollingTrip();
  const tripStartTime = getValue("linesSetTime") || getValue("launchTime");
  const tripEndTime = getValue("linesPulledTime");
  const tripMinutes = tripStartTime && tripEndTime
    ? calculateMinutes(tripStartTime, tripEndTime)
    : 0;
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
    if (tripMinutes > 0 && deployedHours * 60 > tripMinutes) {
      warnings.push(`${label} is deployed longer than the trip (${trimNumber(deployedHours)} hours).`);
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
  setValue("tripDateValue", trip?.date || today);
  setValue("tripDate", displayDateForCalendar(trip?.date || today));
  populateTripExpeditionSelect(trip?.expeditionId || "");
  const location = findLocationByIdOrName(trip?.locationId, trip?.location);
  populateLocationSelect(location?.id || "");
  const launch = findLaunchByIdOrName(location, trip?.launchId, trip?.launch);
  populateLaunchSelect(launch?.id || "");
  setValue("launchTime", trip?.launchTime || "");
  setValue("linesSetTime", trip?.linesSetTime || trip?.startTime || "");
  setValue("linesPulledTime", trip?.linesPulledTime || trip?.endTime || "");
  setValue("tripIdleTime", trip?.idleHours || "");
  setValue("targetSpecies", trip?.targetSpecies || "");
  setValue("method", trip?.method || "");
  setTripIntent(tripIntent(trip || {}));
  setTripRating(tripRatingValue(trip || {}));
  setValue("waterTemp", trip?.waterTemp || "");
  setValue("waterClarity", trip?.waterClarity || "");
  setValue("weather", trip?.weather || "");
  setValue("waveHeight", trip?.waveHeight || "");
  updateMarineWaveHeightPlaceholder(trip?.weatherData || activeTripWeatherData);
  setValue("structure", trip?.structure || "");
  renderProbeTemperatureProfile(trip?.probeTemperatureProfile || []);
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
  if (!trip) scheduleTripWeatherPreview(true);
}

function setValue(id, value) {
  const input = document.querySelector(`#${id}`);
  if (input) input.value = value;
}

function getValue(id) {
  const valueId = id === "tripDate" && document.querySelector("#tripDateValue") ? "tripDateValue" : id;
  return document.querySelector(`#${valueId}`).value.trim();
}

const probeProfileDepthsFeet = Array.from({ length: 17 }, (_, index) => index * 10);

function probeTemperatureProfileEntries(profile = []) {
  return Array.isArray(profile) ? profile.filter((entry) => Number.isFinite(Number(entry?.depthFeet))) : [];
}

function displayProbeDepth(depthFeet) {
  const depth = convertUnitValue(depthFeet, "ft", unitPreference("depth"));
  return `${trimNumber(depth ?? depthFeet)} ${unitSymbol("depth")}`;
}

function renderProbeTemperatureProfile(profile = []) {
  const grid = document.querySelector("#probeTemperatureGrid");
  if (!grid) return;
  const temperaturesByDepth = new Map(probeTemperatureProfileEntries(profile).map((entry) => [Number(entry.depthFeet), entry.temperature || ""]));
  grid.innerHTML = probeProfileDepthsFeet.map((depthFeet) => {
    const depthLabel = displayProbeDepth(depthFeet);
    return `
      <label class="probe-temperature-cell">
        <span>${escapeHtml(depthLabel)}</span>
        <input type="text" inputmode="decimal" data-probe-depth-feet="${depthFeet}" value="${escapeHtml(temperaturesByDepth.get(depthFeet) || "")}" placeholder="—" aria-label="Probe temperature at ${escapeHtml(depthLabel)}" />
      </label>
    `;
  }).join("");
}

function collectProbeTemperatureProfile() {
  return [...document.querySelectorAll("#probeTemperatureGrid [data-probe-depth-feet]")]
    .map((input) => ({
      depthFeet: Number(input.dataset.probeDepthFeet),
      temperature: input.value.trim()
    }))
    .filter((entry) => entry.temperature);
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
