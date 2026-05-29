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

function openTripDialog(trip = null) {
  activeTripId = trip?.id || null;
  els.tripDialogTitle.textContent = trip ? "Edit Trip" : "New Trip";
  els.deleteTripButton.classList.toggle("hidden", !trip);
  els.tripForm.reset();
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
  if (!trip?.catches?.length) addCatchRow();
  populateSetupLineSelects();
  updateTrollingVisibility();
  syncUnitLabels(els.tripForm);
  els.tripDialog.showModal();
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
  return Math.min(3, Math.max(1, Math.round(value)));
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
  return ["Bad", "Good", "Outstanding"][rating - 1];
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
    .map((row) => ({
      id: row.dataset.personId || createId(),
      name: row.querySelector(".person-name").value.trim()
    }))
    .filter((person) => person.name);
}

function syncPersonRowIds() {
  els.personRows.querySelectorAll(".person-row").forEach((row) => {
    const name = row.querySelector(".person-name").value.trim().toLowerCase();
    const existingPerson = state.people.find((person) => person.name?.trim().toLowerCase() === name);
    if (existingPerson) row.dataset.personId = existingPerson.id;
  });
}

function currentPeople() {
  syncPersonRowIds();
  return mergePeople(state.people, collectPeople());
}

function populatePersonSelect(select, selectedId = "") {
  const people = currentPeople();
  select.innerHTML = `<option value="">No person</option>` + people.map((person) => (
    `<option value="${person.id}" ${person.id === selectedId ? "selected" : ""}>${escapeHtml(person.name)}</option>`
  )).join("");
}

function populatePersonSelects() {
  populateDatalist(els.personOptions, currentPeople().map((person) => person.name).filter(Boolean));
  document.querySelectorAll(".catch-person").forEach((select) => {
    populatePersonSelect(select, select.value);
  });
}

function addCatchRow(catchItem = {}) {
  addFishRow(catchItem, { container: els.catchRows, lost: false });
}

function addLostFishRow(fishItem = {}) {
  addFishRow(fishItem, { container: els.lostFishRows, lost: true });
}

function defaultFishTime(catchItem = {}) {
  return catchItem.time ?? getValue("startTime");
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
  node.querySelector(".catch-species-field").classList.toggle("hidden", lost);
  node.querySelector(".possible-species-field").classList.toggle("hidden", !lost);
  node.querySelector(".catch-length-field").classList.toggle("hidden", lost);
  node.querySelector(".catch-weight-field").classList.toggle("hidden", lost);
  node.querySelector(".manual-coordinate-field")?.classList.toggle("hidden", lost);
  node.querySelectorAll(".manual-coordinate-field").forEach((field) => field.classList.toggle("hidden", lost));
  node.querySelector(".catch-photo-title").classList.toggle("hidden", lost);
  node.querySelector(".catch-photo-editor").classList.toggle("hidden", lost);

  populatePersonSelect(node.querySelector(".catch-person"), catchItem.personId || "");
  populateOptionSelect(node.querySelector(".catch-species"), state.species, "Select species");
  populateOptionSelect(node.querySelector(".catch-possible-species"), state.species, "Select possible species");
  populateChoiceSelect(node.querySelector(".catch-presentation"), optionChoices("trollingPresentations"), "Select method", catchItem.presentation || "");
  populateOptionSelect(node.querySelector(".catch-direction"), optionLabels("trollingDirections"), "Select direction");
  node.querySelector(".catch-species").value = lost ? "" : (catchItem.species || "");
  node.querySelector(".catch-possible-species").value = catchItem.possibleSpecies || catchItem.species || "";
  node.querySelector(".catch-released").checked = Boolean(catchItem.released);
  node.querySelector(".catch-length").value = lost ? "" : (catchItem.length || "");
  node.querySelector(".catch-weight").value = lost ? "" : (catchItem.weight || "");
  node.querySelector(".catch-time").value = defaultFishTime(catchItem);
  node.querySelector(".catch-water-depth").value = catchItem.waterDepth || catchItem.depth || "";
  node.querySelector(".catch-depth-down").value = catchItem.depthDown || catchItem.depth || "";
  const manualCoordinates = isUsableCoordinates(catchItem.manualCoordinates)
    ? catchItem.manualCoordinates
    : (catchItem.coordinates?.manual && isUsableCoordinates(catchItem.coordinates) ? catchItem.coordinates : null);
  node.querySelector(".catch-latitude").value = manualCoordinates?.latitude ?? "";
  node.querySelector(".catch-longitude").value = manualCoordinates?.longitude ?? "";
  node.querySelector(".catch-presentation").value = catchItem.presentation || "";
  node.querySelector(".catch-direction").value = catchItem.direction || "";
  node.querySelector(".catch-fow").value = catchItem.fowCaught || "";
  node.querySelector(".catch-speed").value = catchItem.speed || "";
  node.querySelector(".catch-ball-depth").value = catchItem.ballDepth || "";
  node.querySelector(".catch-line-behind-board").value = catchItem.lineBehindBoard || "";
  node.querySelector(".catch-estimated-lure-depth").value = catchItem.estimatedLureDepth || "";
  node.querySelector(".catch-dipsey-setting").value = catchItem.dipseySetting || "";
  node.querySelector(".catch-line-out").value = catchItem.lineOut || "";
  node.querySelector(".catch-estimated-depth").value = catchItem.estimatedDepth || "";
  node.querySelector(".catch-notes").value = catchItem.notes || "";
  node.querySelector(".catch-setup-line").dataset.selectedSetupLine = catchItem.setupLineId || "";
  populateLureSelect(node.querySelector(".catch-lure"), catchItem.lureId || "");
  renderLurePreview(node);
  renderCatchPhotos(node);
  updatePresentationFields(node);

  container.append(node);
  syncUnitLabels(node);
  populateSetupLineSelects();
  updateTrollingVisibility();
  updateAllRowSummaries();
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
  populateComboSelect(node.querySelector(".trip-gear-combo"), gearItem.comboId || "");
  populateRodSelect(node.querySelector(".trip-gear-rod"), gearItem.rodId || "");
  populateReelSelect(node.querySelector(".trip-gear-reel"), gearItem.reelId || "");
  node.querySelector(".catch-presentation").value = gearItem.presentation || "";
  node.querySelector(".trip-gear-deepest-rigger").checked = Boolean(gearItem.deepestRigger);
  populateLureSelect(node.querySelector(".trip-gear-lure"), gearItem.lureId || "");
  populateFlasherSelect(node.querySelector(".trip-gear-flasher"), gearItem.flasherId || "");
  renderLurePreview(node);
  renderFlasherPreview(node);
  updatePresentationFields(node);

  els.tripGearRows.append(node);
  syncUnitLabels(node);
  populateSetupLineSelects();
  updateTrollingVisibility();
  updateAllRowSummaries();
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
    rodId: row.querySelector(".trip-gear-rod")?.value || "",
    reelId: row.querySelector(".trip-gear-reel")?.value || "",
    lureId: row.querySelector(".trip-gear-lure")?.value || "",
    flasherId: row.querySelector(".trip-gear-flasher")?.value || ""
  }, index);
}

function setupLineOptionsFromForm() {
  return [...els.tripGearRows.querySelectorAll(".gear-used-row")].map((row, index) => {
    if (!row.dataset.gearId) row.dataset.gearId = createId();
    const timeRange = formatDisplayTimeRange(
      row.querySelector(".trip-gear-start-time")?.value,
      row.querySelector(".trip-gear-end-time")?.value
    );
    return {
      id: row.dataset.gearId,
      label: [setupLineLabelFromRow(row, index), timeRange].filter(Boolean).join(" / ")
    };
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

function updateRowSummary(row) {
  const summary = row.querySelector(".collapsible-row-summary");
  if (!summary) return;

  if (row.classList.contains("catch-row")) {
    const waterDepth = row.querySelector(".catch-water-depth").value.trim();
    const depthDown = row.querySelector(".catch-depth-down").value.trim();
    const fowCaught = row.querySelector(".catch-fow").value.trim();
    const released = row.querySelector(".catch-released")?.checked && !row.classList.contains("lost-fish-row");
    const trolling = isTrollingTrip();
    const pieces = [
      fishRowLabel(row),
      row.classList.contains("lost-fish-row")
        ? summaryOption(row.querySelector(".catch-possible-species"), ["Select possible species"])
        : summaryOption(row.querySelector(".catch-species"), ["Select species"]),
      released ? "Released" : "",
      fowCaught,
      depthDown ? `${depthDown} down` : "",
      waterDepth ? `${waterDepth} water` : "",
      summaryOption(row.querySelector(".catch-person"), ["No person"]),
      formatDisplayTime(row.querySelector(".catch-time").value),
      summaryOption(row.querySelector(".catch-direction"), ["Select direction"]),
      trolling
        ? summaryOption(row.querySelector(".catch-setup-line"), ["Select rod"])
        : summaryOption(row.querySelector(".catch-lure"), ["No lure selected"])
    ].filter(Boolean);
    summary.textContent = pieces.join(" / ");
    return;
  }

  const timeRange = formatDisplayTimeRange(
    row.querySelector(".trip-gear-start-time").value,
    row.querySelector(".trip-gear-end-time").value
  );
  const gear = [
    selectedText(row.querySelector(".trip-gear-combo")).replace("No combo selected", ""),
    selectedText(row.querySelector(".trip-gear-rod")).replace("No rod selected", ""),
    selectedText(row.querySelector(".trip-gear-reel")).replace("No reel selected", ""),
    selectedText(row.querySelector(".trip-gear-lure")).replace("No lure selected", ""),
    selectedText(row.querySelector(".trip-gear-flasher")).replace("No flasher", "")
  ].filter(Boolean).join(" + ");
  const lineMeta = [
    setupLineSideLabel(row.querySelector(".trip-gear-side")?.value),
    summaryOption(row.querySelector(".catch-presentation"), ["Select method"]),
    row.querySelector(".trip-gear-deepest-rigger")?.checked ? "Deepest rigger" : ""
  ].filter(Boolean).join(" ");
  const pieces = [
    `Rod ${rowNumber(row, ".gear-used-row")}`,
    timeRange,
    lineMeta,
    gear,
    row.querySelector(".trip-gear-change-note").value.trim()
  ].filter(Boolean);
  summary.textContent = pieces.join(" / ");
}

function updateAllRowSummaries() {
  document.querySelectorAll(".catch-row, .gear-used-row").forEach(updateRowSummary);
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
      comboId: row.querySelector(".trip-gear-combo").value,
      rodId: row.querySelector(".trip-gear-rod").value,
      reelId: row.querySelector(".trip-gear-reel").value,
      lureId: row.querySelector(".trip-gear-lure").value,
      flasherId: trolling ? row.querySelector(".trip-gear-flasher").value : "",
      presentation: trolling ? row.querySelector(".catch-presentation").value : "",
      deepestRigger: trolling && row.querySelector(".catch-presentation").value === "downrigger"
        ? row.querySelector(".trip-gear-deepest-rigger").checked
        : false,
      lureMinutes: row.querySelector(".trip-gear-lure").value ? setupMinutesFromRow(row) : 0,
      flasherMinutes: trolling && row.querySelector(".trip-gear-flasher").value ? setupMinutesFromRow(row) : 0
    }))
    .filter((item) => (
      item.startTime
      || item.endTime
      || item.changeNote
      || item.lineLabel
      || item.comboId
      || item.rodId
      || item.reelId
      || item.lureId
      || item.flasherId
      || item.lureMinutes
      || item.flasherMinutes
      || item.presentation
      || item.deepestRigger
    ));

  const collectFishRows = (container, lost = false) => [...container.querySelectorAll(".catch-row")]
    .map((row) => {
      const base = {
        id: row.dataset.catchId || createId(),
        personId: row.querySelector(".catch-person").value,
        species: lost ? "" : row.querySelector(".catch-species").value.trim(),
        possibleSpecies: lost ? row.querySelector(".catch-possible-species").value.trim() : "",
        released: lost ? false : row.querySelector(".catch-released").checked,
        length: lost ? "" : row.querySelector(".catch-length").value.trim(),
        weight: lost ? "" : row.querySelector(".catch-weight").value.trim(),
        time: row.querySelector(".catch-time").value,
        waterDepth: row.querySelector(".catch-water-depth").value.trim(),
        depthDown: row.querySelector(".catch-depth-down").value.trim(),
        presentation: trolling ? row.querySelector(".catch-presentation").value : "",
        direction: trolling ? row.querySelector(".catch-direction").value : "",
        fowCaught: trolling ? row.querySelector(".catch-fow").value.trim() : "",
        speed: trolling ? row.querySelector(".catch-speed").value.trim() : "",
        ballDepth: trolling ? row.querySelector(".catch-ball-depth").value.trim() : "",
        lineBehindBoard: trolling ? row.querySelector(".catch-line-behind-board").value.trim() : "",
        estimatedLureDepth: trolling ? row.querySelector(".catch-estimated-lure-depth").value.trim() : "",
        dipseySetting: trolling ? row.querySelector(".catch-dipsey-setting").value.trim() : "",
        lineOut: trolling ? row.querySelector(".catch-line-out").value.trim() : "",
        estimatedDepth: trolling ? row.querySelector(".catch-estimated-depth").value.trim() : "",
        notes: row.querySelector(".catch-notes").value.trim(),
        manualCoordinates: lost ? null : manualCoordinatesFromRow(row),
        coordinates: lost ? null : fishCoordinatesFromRow(row),
        photos: lost ? [] : collectCatchPhotos(row)
      };
      if (!lost && row.catchWeatherData) base.weatherData = row.catchWeatherData;
      return trolling
        ? {
            ...base,
            setupLineId: row.querySelector(".catch-setup-line").value,
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
      || item.waterDepth
      || item.depthDown
      || item.setupLineId
      || item.lureId
      || item.flasherId
      || item.presentation
      || item.direction
      || item.fowCaught
      || item.speed
      || item.ballDepth
      || item.lineBehindBoard
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

  try {
    let trip = collectTripFromForm();
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
    els.tripDialog.close();
    renderAll();
  } catch (error) {
    console.error("Could not save trip.", error);
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
    els.tripDialog.close();
    renderAll();
  } catch (error) {
    console.error("Could not delete trip.", error);
    showTripFormMessage(error.message || "The trip could not be deleted.");
  }
}
