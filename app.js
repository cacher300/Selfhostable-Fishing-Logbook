const storageKey = "fishing-logbook-v1";

const defaults = {
  species: [
    "Lake Trout",
    "Largemouth Bass",
    "Smallmouth Bass",
    "Chinook Salmon",
    "Coho Salmon",
    "Rainbow Trout",
    "Brown Trout",
    "Walleye",
    "Northern Pike",
    "Muskie",
    "Rock Bass",
    "Perch",
    "Crappie",
    "Bluegill"
  ],
  methods: ["Trolling", "Casting", "Jigging", "Fly Fishing", "Bait Fishing", "Ice Fishing"],
  lureTypes: ["Spoon", "Crankbait", "Spinner", "Jig", "Soft Plastic", "Fly", "Plug", "Swimbait", "Flasher/Fly", "Jerkbait", "Topwater", "Other"],
  flasherTypes: ["Paddle", "Dodger", "Spin Doctor", "Meat Rig", "Attractor", "Other"],
  lures: [
    {
      id: crypto.randomUUID(),
      name: "Blue/Silver Spoon",
      type: "Spoon",
      brand: "",
      color: "Blue/Silver",
      notes: "Starter lure. Replace with your real lure photo when ready.",
      image: ""
    }
  ],
  flashers: [],
  people: [],
  locations: [],
  trips: [
    {
      id: crypto.randomUUID(),
      title: "Morning salmon troll",
      date: "2026-04-28",
      location: "Lake Ontario",
      hours: 3.5,
      targetSpecies: "Chinook Salmon",
      method: "Trolling",
      waterTemp: "47 F",
      waterClarity: "Clear",
      weather: "Overcast",
      wind: "W 8 mph",
      structure: "80-120 ft, bait pods",
      notes: "Best action near first light. Marked bait deep.",
      catches: []
    }
  ]
};

let state = structuredClone(defaults);
let activeTripId = null;
let activeNotePhotos = [];
let activeStatsMethod = "All methods";

const els = {
  brandSpotlight: document.querySelector("#brandSpotlight"),
  statTrips: document.querySelector("#statTrips"),
  statFish: document.querySelector("#statFish"),
  statHours: document.querySelector("#statHours"),
  statWaterbodies: document.querySelector("#statWaterbodies"),
  statCatchRate: document.querySelector("#statCatchRate"),
  statPoundsPerHour: document.querySelector("#statPoundsPerHour"),
  speciesBars: document.querySelector("#speciesBars"),
  lureBars: document.querySelector("#lureBars"),
  tripTable: document.querySelector("#tripTable"),
  tripControls: document.querySelector("#tripControls"),
  tripListPanel: document.querySelector("#tripListPanel"),
  advancedStatsPanel: document.querySelector("#advancedStatsPanel"),
  statsMethodFilter: document.querySelector("#statsMethodFilter"),
  advancedMetricGrid: document.querySelector("#advancedMetricGrid"),
  outcomeStatsTable: document.querySelector("#outcomeStatsTable"),
  lureStatsTable: document.querySelector("#lureStatsTable"),
  flasherStatsTable: document.querySelector("#flasherStatsTable"),
  comboStatsTable: document.querySelector("#comboStatsTable"),
  speciesStatsTable: document.querySelector("#speciesStatsTable"),
  lostFishStatsTable: document.querySelector("#lostFishStatsTable"),
  trollingHighlightsTable: document.querySelector("#trollingHighlightsTable"),
  directionStatsTable: document.querySelector("#directionStatsTable"),
  trollingSetupStatsTable: document.querySelector("#trollingSetupStatsTable"),
  fowRangeStatsTable: document.querySelector("#fowRangeStatsTable"),
  speedStatsTable: document.querySelector("#speedStatsTable"),
  fowStatsTable: document.querySelector("#fowStatsTable"),
  depthDownStatsTable: document.querySelector("#depthDownStatsTable"),
  locationStatsTable: document.querySelector("#locationStatsTable"),
  methodStatsTable: document.querySelector("#methodStatsTable"),
  intentStatsTable: document.querySelector("#intentStatsTable"),
  personStatsTable: document.querySelector("#personStatsTable"),
  monthStatsTable: document.querySelector("#monthStatsTable"),
  emptyState: document.querySelector("#emptyState"),
  searchInput: document.querySelector("#searchInput"),
  targetFilter: document.querySelector("#targetFilter"),
  yearFilter: document.querySelector("#yearFilter"),
  sortSelect: document.querySelector("#sortSelect"),
  newTripButton: document.querySelector("#newTripButton"),
  tripsViewButton: document.querySelector("#tripsViewButton"),
  statsViewButton: document.querySelector("#statsViewButton"),
  gearViewButton: document.querySelector("#gearViewButton"),
  newLibraryLureButton: document.querySelector("#newLibraryLureButton"),
  newLibraryFlasherButton: document.querySelector("#newLibraryFlasherButton"),
  exportButton: document.querySelector("#exportButton"),
  importInput: document.querySelector("#importInput"),
  tripDialog: document.querySelector("#tripDialog"),
  tripForm: document.querySelector("#tripForm"),
  tripDialogTitle: document.querySelector("#tripDialogTitle"),
  deleteTripButton: document.querySelector("#deleteTripButton"),
  deleteLureButton: document.querySelector("#deleteLureButton"),
  deleteFlasherButton: document.querySelector("#deleteFlasherButton"),
  addCatchButton: document.querySelector("#addCatchButton"),
  addLostFishButton: document.querySelector("#addLostFishButton"),
  addTripGearButton: document.querySelector("#addTripGearButton"),
  addPersonButton: document.querySelector("#addPersonButton"),
  notePhotoInput: document.querySelector("#notePhotoInput"),
  notePhotoGrid: document.querySelector("#notePhotoGrid"),
  catchRows: document.querySelector("#catchRows"),
  lostFishRows: document.querySelector("#lostFishRows"),
  tripGearRows: document.querySelector("#tripGearRows"),
  personRows: document.querySelector("#personRows"),
  lureDialog: document.querySelector("#lureDialog"),
  lureForm: document.querySelector("#lureForm"),
  flasherDialog: document.querySelector("#flasherDialog"),
  flasherForm: document.querySelector("#flasherForm"),
  gearPanel: document.querySelector("#gearPanel"),
  lureLibraryGrid: document.querySelector("#lureLibraryGrid"),
  flasherLibraryGrid: document.querySelector("#flasherLibraryGrid")
};

async function loadState() {
  try {
    const response = await fetch("/api/logbook");
    if (response.ok) return normalizeState({ ...structuredClone(defaults), ...(await response.json()) });
  } catch {
    // Opening index.html directly still works as a local fallback.
  }

  try {
    const saved = localStorage.getItem(storageKey);
    if (!saved) return structuredClone(defaults);
    return normalizeState({ ...structuredClone(defaults), ...JSON.parse(saved) });
  } catch {
    return structuredClone(defaults);
  }
}

function normalizeState(nextState) {
  const normalized = { ...structuredClone(defaults), ...(nextState || {}) };
  normalized.methods = [...defaults.methods];
  delete normalized.tripTypes;

  ["species", "lureTypes", "flasherTypes", "lures", "flashers", "people", "locations", "trips"].forEach((key) => {
    if (!Array.isArray(normalized[key])) normalized[key] = structuredClone(defaults[key]);
  });

  normalized.trips = normalized.trips.map((trip) => ({
    catches: [],
    lostFish: [],
    gearUsed: [],
    people: [],
    notePhotos: [],
    ...trip
  }));
  normalized.people = mergePeople(
    normalized.people,
    normalized.trips.flatMap((trip) => trip.people || [])
  );
  normalized.locations = mergeTextList(
    normalized.locations,
    normalized.trips.map((trip) => trip.location)
  );

  return normalized;
}

function saveState() {
  state = normalizeState(state);
  localStorage.setItem(storageKey, JSON.stringify(state));
  fetch("/api/logbook", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state)
  }).catch(() => {});
}

function formatDate(value) {
  if (!value) return "";
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function totalCaught(trip) {
  return (trip.catches || []).reduce((sum, catchItem) => sum + fishCount(catchItem), 0);
}

function totalWeight(trip) {
  return (trip.catches || []).reduce((sum, catchItem) => sum + catchWeight(catchItem), 0);
}

function catchWeight(catchItem) {
  const weight = parseFirstNumber(catchItem?.weight);
  return weight ? weight * fishCount(catchItem) : 0;
}

function fishCount(catchItem) {
  if (!catchItem) return 0;
  if (catchItem.quantity !== undefined && catchItem.quantity !== "") return Math.max(0, number(catchItem.quantity));
  return 1;
}

function catchRate(trip) {
  const hours = tripHours(trip);
  return hours > 0 ? totalCaught(trip) / hours : 0;
}

function tripHours(trip) {
  const calculated = calculateHours(trip.startTime, trip.endTime);
  return calculated || number(trip.hours);
}

function countBy(items, getKey, getCount = () => 1) {
  return items.reduce((map, item) => {
    const key = getKey(item);
    if (!key) return map;
    map.set(key, (map.get(key) || 0) + getCount(item));
    return map;
  }, new Map());
}

function topEntries(map, limit = 4) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function renderBars(container, entries) {
  container.innerHTML = "";
  if (!entries.length) {
    container.innerHTML = `<p class="muted">No data yet</p>`;
    return;
  }

  const max = Math.max(...entries.map(([, count]) => count));
  entries.forEach(([label, count]) => {
    const row = document.createElement("div");
    row.className = "bar-item";
    row.innerHTML = `
      <div class="bar-meta"><span>${escapeHtml(label)}</span><strong>${count}</strong></div>
      <div class="bar-track"><div class="bar-fill" style="width:${(count / max) * 100}%"></div></div>
    `;
    container.append(row);
  });
}

function renderStats() {
  const allCatches = state.trips.flatMap((trip) => trip.catches || []);
  const fish = state.trips.reduce((sum, trip) => sum + totalCaught(trip), 0);
  const hours = state.trips.reduce((sum, trip) => sum + tripHours(trip), 0);
  const pounds = state.trips.reduce((sum, trip) => sum + totalWeight(trip), 0);
  const waterbodies = new Set(state.trips.map((trip) => trip.location).filter(Boolean));

  els.statTrips.textContent = state.trips.length;
  els.statFish.textContent = fish;
  els.statHours.textContent = trimNumber(hours);
  els.statWaterbodies.textContent = waterbodies.size;
  els.statCatchRate.textContent = hours ? trimNumber(fish / hours) : "0";
  els.statPoundsPerHour.textContent = hours ? trimNumber(pounds / hours) : "0";

  const speciesCounts = countBy(allCatches, (item) => item.species, fishCount);
  const lureCounts = countBy(allCatches, (item) => lureName(item.lureId), fishCount);
  renderBars(els.speciesBars, topEntries(speciesCounts));
  renderBars(els.lureBars, topEntries(lureCounts));
}

function renderBrandSpotlight() {
  const photos = state.trips
    .flatMap((trip) => (trip.notePhotos || []).map((photo) => ({
      ...photo,
      tripTitle: trip.title || trip.location || "Trip photo",
      date: trip.date
    })))
    .filter((photo) => photo.image)
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
    .slice(0, 5);

  if (!photos.length) {
    els.brandSpotlight.innerHTML = `
      <div class="brand-spotlight-empty">
        <span>Trip, gear, catch, and pattern tracker</span>
      </div>
    `;
    return;
  }

  els.brandSpotlight.innerHTML = `
    <div class="spotlight-slides">
      ${photos.map((photo, index) => `
        <figure class="spotlight-slide" style="--slide-index:${index}; --slide-count:${photos.length};">
          <img src="${photo.image}" alt="">
          <figcaption>
            <strong>${escapeHtml(photo.caption || photo.tripTitle)}</strong>
            <span>${escapeHtml(photo.tripTitle)}</span>
          </figcaption>
        </figure>
      `).join("")}
    </div>
  `;
}

function renderFilters() {
  const targets = ["All targets", ...new Set(state.trips.map((trip) => trip.targetSpecies).filter(Boolean))];
  const selectedTarget = els.targetFilter.value || "All targets";
  els.targetFilter.innerHTML = targets.map((target) => `<option ${target === selectedTarget ? "selected" : ""}>${escapeHtml(target)}</option>`).join("");

  const years = ["All years", ...new Set(state.trips.map((trip) => new Date(`${trip.date}T12:00:00`).getFullYear()).filter(Boolean))].sort((a, b) => {
    if (a === "All years") return -1;
    if (b === "All years") return 1;
    return b - a;
  });
  const selectedYear = els.yearFilter.value || "All years";
  els.yearFilter.innerHTML = years.map((year) => `<option ${String(year) === selectedYear ? "selected" : ""}>${year}</option>`).join("");
}

function renderStatsMethodFilter() {
  const methods = ["All methods", ...new Set([...state.methods, ...state.trips.map((trip) => trip.method)].filter(Boolean))];
  if (!methods.includes(activeStatsMethod)) activeStatsMethod = "All methods";
  els.statsMethodFilter.innerHTML = methods.map((method) => (
    `<option value="${escapeHtml(method)}" ${method === activeStatsMethod ? "selected" : ""}>${escapeHtml(method)}</option>`
  )).join("");
}

function filteredTrips() {
  const query = els.searchInput.value.trim().toLowerCase();
  const target = els.targetFilter.value;
  const year = els.yearFilter.value;

  const trips = state.trips.filter((trip) => {
    const haystack = [
      trip.title,
      trip.location,
      trip.targetSpecies,
      trip.method,
      trip.intent,
      ...(trip.people || []).map((person) => person.name),
      trip.notes,
      trip.weather,
      trip.structure,
      ...(trip.catches || []).flatMap((catchItem) => [catchItem.species, catchItem.notes, lureName(catchItem.lureId), flasherName(catchItem.flasherId)]),
      ...(trip.lostFish || []).flatMap((fish) => [fish.species, fish.notes, lureName(fish.lureId), flasherName(fish.flasherId)])
    ].join(" ").toLowerCase();

    const matchesQuery = !query || haystack.includes(query);
    const matchesTarget = target === "All targets" || trip.targetSpecies === target;
    const matchesYear = year === "All years" || String(new Date(`${trip.date}T12:00:00`).getFullYear()) === year;
    return matchesQuery && matchesTarget && matchesYear;
  });

  return trips.sort((a, b) => {
    switch (els.sortSelect.value) {
      case "date-asc":
        return a.date.localeCompare(b.date);
      case "catch-rate-desc":
        return catchRate(b) - catchRate(a);
      case "caught-desc":
        return totalCaught(b) - totalCaught(a);
      case "hours-desc":
        return tripHours(b) - tripHours(a);
      default:
        return b.date.localeCompare(a.date);
    }
  });
}

function renderTrips() {
  const trips = filteredTrips();
  els.tripTable.innerHTML = `
    <div class="table-row header">
      <span>Location</span><span>Title</span><span>Date</span><span>Hours</span><span>Caught</span><span>Catch Rate</span><span>Target</span><span></span>
    </div>
  `;

  trips.forEach((trip) => {
    const row = document.createElement("div");
    row.className = "table-row";
    row.innerHTML = `
      <button class="location-link" type="button" data-edit-trip="${trip.id}">
        ${escapeHtml(trip.location)}
      </button>
      <span>${escapeHtml(trip.title || "")}</span>
      <span>${formatDate(trip.date)}</span>
      <span>${trimNumber(tripHours(trip))}</span>
      <span>${totalCaught(trip)}</span>
      <span>${trimNumber(catchRate(trip))}</span>
      <span>
        <span class="target-pill">${escapeHtml(trip.targetSpecies)}</span>
        <span class="intent-pill ${tripIntent(trip) === "experimental" ? "experimental" : ""}">${escapeHtml(intentLabel(tripIntent(trip)))}</span>
      </span>
      <button class="row-button" type="button" data-edit-trip="${trip.id}" aria-label="Open trip">&gt;</button>
    `;
    els.tripTable.append(row);
  });

  els.emptyState.classList.toggle("hidden", trips.length > 0);
}

function renderSelectOptions() {
  populateDatalist(document.querySelector("#locationOptions"), state.locations);
  populateOptionSelect(document.querySelector("#targetSpecies"), state.species, "Select target species");
  populateOptionSelect(document.querySelector("#method"), state.methods, "Select method");
  populateOptionSelect(document.querySelector("#lureType"), state.lureTypes, "Select lure type");
  populateOptionSelect(document.querySelector("#flasherType"), state.flasherTypes, "Select flasher type");
  document.querySelectorAll(".catch-species").forEach((select) => populateOptionSelect(select, state.species, "Select species"));
}

function populateDatalist(datalist, options) {
  datalist.innerHTML = options.map((item) => `<option value="${escapeHtml(item)}"></option>`).join("");
}

function populateOptionSelect(select, options, placeholder) {
  const current = select.value;
  select.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>` + options.map((item) => (
    `<option value="${escapeHtml(item)}" ${item === current ? "selected" : ""}>${escapeHtml(item)}</option>`
  )).join("");
}

function renderAll() {
  renderSelectOptions();
  renderFilters();
  renderStatsMethodFilter();
  renderBrandSpotlight();
  renderStats();
  renderTrips();
  renderAdvancedStats();
  renderGearLibrary();
  updateAllRowSummaries();
}

function openTripDialog(trip = null) {
  activeTripId = trip?.id || null;
  els.tripDialogTitle.textContent = trip ? "Edit Trip" : "New Trip";
  els.deleteTripButton.classList.toggle("hidden", !trip);
  els.tripForm.reset();
  els.catchRows.innerHTML = "";
  els.lostFishRows.innerHTML = "";
  els.tripGearRows.innerHTML = "";
  els.personRows.innerHTML = "";
  activeNotePhotos = structuredClone(trip?.notePhotos || []);

  const today = new Date().toISOString().slice(0, 10);
  setValue("tripId", trip?.id || "");
  setValue("tripTitle", trip?.title || "");
  setValue("tripDate", trip?.date || today);
  setValue("tripLocation", trip?.location || "");
  setValue("startTime", trip?.startTime || "");
  setValue("endTime", trip?.endTime || "");
  setValue("targetSpecies", trip?.targetSpecies || "");
  setValue("method", trip?.method || "");
  setTripIntent(tripIntent(trip || {}));
  setValue("waterTemp", trip?.waterTemp || "");
  setValue("waterClarity", trip?.waterClarity || "");
  setValue("weather", trip?.weather || "");
  setValue("wind", trip?.wind || "");
  setValue("structure", trip?.structure || "");
  setValue("tripNotes", trip?.notes || "");
  renderNotePhotos();

  (trip?.people || []).forEach(addPersonRow);
  (trip?.gearUsed || []).forEach(addTripGearRow);
  (trip?.catches || []).forEach(addCatchRow);
  (trip?.lostFish || []).forEach(addLostFishRow);
  if (!trip?.catches?.length) addCatchRow();
  updateTrollingVisibility();
  els.tripDialog.showModal();
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
  node.dataset.personId = person.id || crypto.randomUUID();
  node.querySelector(".person-name").value = person.name || "";
  els.personRows.append(node);
  populatePersonSelects();
}

function collectPeople() {
  return [...els.personRows.querySelectorAll(".person-row")]
    .map((row) => ({
      id: row.dataset.personId || crypto.randomUUID(),
      name: row.querySelector(".person-name").value.trim()
    }))
    .filter((person) => person.name);
}

function currentPeople() {
  return mergePeople(state.people, collectPeople());
}

function populatePersonSelect(select, selectedId = "") {
  const people = currentPeople();
  select.innerHTML = `<option value="">No person</option>` + people.map((person) => (
    `<option value="${person.id}" ${person.id === selectedId ? "selected" : ""}>${escapeHtml(person.name)}</option>`
  )).join("");
}

function populatePersonSelects() {
  document.querySelectorAll(".catch-person, .trip-gear-person").forEach((select) => {
    populatePersonSelect(select, select.value);
  });
}

function addCatchRow(catchItem = {}) {
  addFishRow(catchItem, { container: els.catchRows, lost: false });
}

function addLostFishRow(fishItem = {}) {
  addFishRow(fishItem, { container: els.lostFishRows, lost: true });
}

function addFishRow(catchItem = {}, { container, lost }) {
  const template = document.querySelector("#catchRowTemplate");
  const node = template.content.firstElementChild.cloneNode(true);
  if (lost) node.classList.add("lost-fish-row");
  node.dataset.rowId = crypto.randomUUID();
  node.dataset.catchId = catchItem.id || "";
  node.querySelector(".remove-catch").setAttribute("aria-label", lost ? "Remove lost fish" : "Remove catch");
  node.querySelector(".catch-released-field").classList.toggle("hidden", lost);

  populatePersonSelect(node.querySelector(".catch-person"), catchItem.personId || "");
  populateOptionSelect(node.querySelector(".catch-species"), state.species, "Select species");
  node.querySelector(".catch-species").value = catchItem.species || "";
  node.querySelector(".catch-released").checked = Boolean(catchItem.released);
  node.querySelector(".catch-length").value = catchItem.length || "";
  node.querySelector(".catch-weight").value = catchItem.weight || "";
  node.querySelector(".catch-time").value = catchItem.time || "";
  node.querySelector(".catch-water-depth").value = catchItem.waterDepth || catchItem.depth || "";
  node.querySelector(".catch-depth-down").value = catchItem.depthDown || catchItem.depth || "";
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
  populateLureSelect(node.querySelector(".catch-lure"), catchItem.lureId || "");
  populateFlasherSelect(node.querySelector(".catch-flasher"), catchItem.flasherId || "");
  renderLurePreview(node);
  renderFlasherPreview(node);
  updatePresentationFields(node);

  container.append(node);
  updateTrollingVisibility();
  updateAllRowSummaries();
}

function addTripGearRow(gearItem = {}) {
  const template = document.querySelector("#tripGearRowTemplate");
  const node = template.content.firstElementChild.cloneNode(true);
  node.dataset.rowId = crypto.randomUUID();
  node.dataset.gearId = gearItem.id || "";

  populatePersonSelect(node.querySelector(".trip-gear-person"), gearItem.personId || "");
  node.querySelector(".trip-gear-start-time").value = gearItem.startTime || "";
  node.querySelector(".trip-gear-end-time").value = gearItem.endTime || "";
  node.querySelector(".trip-gear-change-note").value = gearItem.changeNote || gearItem.notes || "";
  node.querySelector(".catch-presentation").value = gearItem.presentation || "";
  node.querySelector(".catch-direction").value = gearItem.direction || "";
  node.querySelector(".catch-speed").value = gearItem.speed || "";
  node.querySelector(".catch-ball-depth").value = gearItem.ballDepth || "";
  node.querySelector(".catch-line-behind-board").value = gearItem.lineBehindBoard || "";
  node.querySelector(".catch-estimated-lure-depth").value = gearItem.estimatedLureDepth || "";
  node.querySelector(".catch-dipsey-setting").value = gearItem.dipseySetting || "";
  node.querySelector(".catch-line-out").value = gearItem.lineOut || "";
  node.querySelector(".catch-estimated-depth").value = gearItem.estimatedDepth || "";
  populateLureSelect(node.querySelector(".trip-gear-lure"), gearItem.lureId || "");
  populateFlasherSelect(node.querySelector(".trip-gear-flasher"), gearItem.flasherId || "");
  renderLurePreview(node);
  renderFlasherPreview(node);
  updatePresentationFields(node);

  els.tripGearRows.append(node);
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
    const pieces = [
      fishRowLabel(row),
      summaryOption(row.querySelector(".catch-species"), ["Select species"]),
      released ? "Released" : "",
      fowCaught,
      depthDown ? `${depthDown} down` : "",
      waterDepth ? `${waterDepth} water` : "",
      summaryOption(row.querySelector(".catch-person"), ["No person"]),
      row.querySelector(".catch-time").value,
      summaryOption(row.querySelector(".catch-direction"), ["Select direction"]),
      summaryOption(row.querySelector(".catch-lure"), ["No lure selected"])
    ].filter(Boolean);
    summary.textContent = pieces.join(" / ");
    return;
  }

  const timeRange = [
    row.querySelector(".trip-gear-start-time").value,
    row.querySelector(".trip-gear-end-time").value
  ].filter(Boolean).join("-");
  const gear = [
    selectedText(row.querySelector(".trip-gear-lure")).replace("No lure selected", ""),
    selectedText(row.querySelector(".trip-gear-flasher")).replace("No flasher", "")
  ].filter(Boolean).join(" + ");
  const pieces = [
    `Setup ${rowNumber(row, ".gear-used-row")}`,
    timeRange,
    summaryOption(row.querySelector(".trip-gear-person"), ["No person"]),
    summaryOption(row.querySelector(".catch-direction"), ["Select direction"]),
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
      id: row.dataset.gearId || crypto.randomUUID(),
      personId: row.querySelector(".trip-gear-person").value,
      startTime: row.querySelector(".trip-gear-start-time").value,
      endTime: row.querySelector(".trip-gear-end-time").value,
      changeNote: row.querySelector(".trip-gear-change-note").value.trim(),
      lureId: row.querySelector(".trip-gear-lure").value,
      flasherId: trolling ? row.querySelector(".trip-gear-flasher").value : "",
      presentation: trolling ? row.querySelector(".catch-presentation").value : "",
      direction: trolling ? row.querySelector(".catch-direction").value : "",
      speed: trolling ? row.querySelector(".catch-speed").value.trim() : "",
      ballDepth: trolling ? row.querySelector(".catch-ball-depth").value.trim() : "",
      lineBehindBoard: trolling ? row.querySelector(".catch-line-behind-board").value.trim() : "",
      estimatedLureDepth: trolling ? row.querySelector(".catch-estimated-lure-depth").value.trim() : "",
      dipseySetting: trolling ? row.querySelector(".catch-dipsey-setting").value.trim() : "",
      lineOut: trolling ? row.querySelector(".catch-line-out").value.trim() : "",
      estimatedDepth: trolling ? row.querySelector(".catch-estimated-depth").value.trim() : "",
      lureMinutes: setupMinutesFromRow(row),
      flasherMinutes: trolling && row.querySelector(".trip-gear-flasher").value ? setupMinutesFromRow(row) : 0
    }))
    .filter((item) => item.startTime || item.endTime || item.changeNote || item.lureId || item.flasherId || item.lureMinutes || item.flasherMinutes || item.presentation || item.direction);

  const collectFishRows = (container, lost = false) => [...container.querySelectorAll(".catch-row")]
    .map((row) => ({
      id: row.dataset.catchId || crypto.randomUUID(),
      personId: row.querySelector(".catch-person").value,
      species: row.querySelector(".catch-species").value.trim(),
      released: lost ? false : row.querySelector(".catch-released").checked,
      length: row.querySelector(".catch-length").value.trim(),
      weight: row.querySelector(".catch-weight").value.trim(),
      time: row.querySelector(".catch-time").value,
      waterDepth: row.querySelector(".catch-water-depth").value.trim(),
      depthDown: row.querySelector(".catch-depth-down").value.trim(),
      lureId: row.querySelector(".catch-lure").value,
      flasherId: trolling ? row.querySelector(".catch-flasher").value : "",
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
      notes: row.querySelector(".catch-notes").value.trim()
    }))
    .filter((item) => item.species || item.lureId || item.flasherId || item.notes);

  const catches = collectFishRows(els.catchRows);
  const lostFish = collectFishRows(els.lostFishRows, true);

  return {
    id: getValue("tripId") || crypto.randomUUID(),
    title: getValue("tripTitle"),
    date: getValue("tripDate"),
    location: getValue("tripLocation"),
    startTime: getValue("startTime"),
    endTime: getValue("endTime"),
    hours: calculateHours(getValue("startTime"), getValue("endTime")),
    targetSpecies: getValue("targetSpecies"),
    method: getValue("method"),
    intent: getTripIntent(),
    waterTemp: getValue("waterTemp"),
    waterClarity: getValue("waterClarity"),
    weather: getValue("weather"),
    wind: getValue("wind"),
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

function saveTrip(event) {
  event.preventDefault();
  const trip = collectTripFromForm();
  state.people = mergePeople(state.people, trip.people);
  state.locations = mergeTextList(state.locations, trip.location);
  const usedPersonIds = new Set([
    ...trip.catches.map((catchItem) => catchItem.personId).filter(Boolean),
    ...trip.lostFish.map((fish) => fish.personId).filter(Boolean),
    ...trip.gearUsed.map((gearItem) => gearItem.personId).filter(Boolean)
  ]);
  trip.people = trip.people.filter((person) => usedPersonIds.has(person.id));
  upsertListValue("species", trip.targetSpecies);
  trip.catches.forEach((catchItem) => upsertListValue("species", catchItem.species));
  trip.lostFish.forEach((fish) => upsertListValue("species", fish.species));

  const index = state.trips.findIndex((item) => item.id === trip.id);
  if (index >= 0) state.trips[index] = trip;
  else state.trips.push(trip);

  saveState();
  els.tripDialog.close();
  renderAll();
}

function deleteActiveTrip() {
  if (!activeTripId) return;
  const trip = state.trips.find((item) => item.id === activeTripId);
  if (!confirm(`Delete ${trip?.title || trip?.location || "this trip"}?`)) return;
  state.trips = state.trips.filter((item) => item.id !== activeTripId);
  saveState();
  els.tripDialog.close();
  renderAll();
}

async function saveLure(event) {
  event.preventDefault();
  const editingId = getValue("editingLureId");
  const existing = state.lures.find((item) => item.id === editingId);
  const imageFile = document.querySelector("#lureImage").files[0];
  const image = imageFile ? await fileToDataUrl(imageFile) : existing?.image || "";
  const lure = {
    id: editingId || crypto.randomUUID(),
    name: getValue("lureName"),
    type: getValue("lureType"),
    brand: getValue("lureBrand"),
    color: getValue("lureColor"),
    notes: getValue("lureNotes"),
    image
  };

  const lureIndex = state.lures.findIndex((item) => item.id === lure.id);
  if (lureIndex >= 0) state.lures[lureIndex] = lure;
  else state.lures.push(lure);
  upsertListValue("lureTypes", lure.type);
  saveState();

  [...document.querySelectorAll(".catch-lure, .trip-gear-lure")].forEach((select) => populateLureSelect(select, select.value));
  const rowId = getValue("pendingCatchRow");
  const row = [...document.querySelectorAll(".catch-row, .gear-used-row")].find((item) => item.dataset.rowId === rowId);
  if (row) row.querySelector(".catch-lure, .trip-gear-lure").value = lure.id;
  if (row) renderLurePreview(row);
  if (row) updateRowSummary(row);

  els.lureDialog.close();
  els.lureForm.reset();
  renderAll();
}

async function saveFlasher(event) {
  event.preventDefault();
  const editingId = getValue("editingFlasherId");
  const existing = state.flashers.find((item) => item.id === editingId);
  const imageFile = document.querySelector("#flasherImage").files[0];
  const image = imageFile ? await fileToDataUrl(imageFile) : existing?.image || "";
  const flasher = {
    id: editingId || crypto.randomUUID(),
    name: getValue("flasherName"),
    type: getValue("flasherType"),
    brand: getValue("flasherBrand"),
    color: getValue("flasherColor"),
    notes: getValue("flasherNotes"),
    image
  };

  const flasherIndex = state.flashers.findIndex((item) => item.id === flasher.id);
  if (flasherIndex >= 0) state.flashers[flasherIndex] = flasher;
  else state.flashers.push(flasher);
  upsertListValue("flasherTypes", flasher.type);
  saveState();

  [...document.querySelectorAll(".catch-flasher, .trip-gear-flasher")].forEach((select) => populateFlasherSelect(select, select.value));
  const rowId = getValue("pendingFlasherCatchRow");
  const row = [...document.querySelectorAll(".catch-row, .gear-used-row")].find((item) => item.dataset.rowId === rowId);
  if (row) row.querySelector(".catch-flasher, .trip-gear-flasher").value = flasher.id;
  if (row) renderFlasherPreview(row);
  if (row) updateRowSummary(row);

  els.flasherDialog.close();
  els.flasherForm.reset();
  renderAll();
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function addNotePhotos(event) {
  const files = [...event.target.files];
  if (!files.length) return;

  const photos = await Promise.all(files.map(async (file) => ({
    id: crypto.randomUUID(),
    name: file.name,
    caption: "",
    image: await fileToDataUrl(file)
  })));

  activeNotePhotos = [...activeNotePhotos, ...photos];
  event.target.value = "";
  renderNotePhotos();
}

function renderNotePhotos() {
  if (!activeNotePhotos.length) {
    els.notePhotoGrid.innerHTML = `<div class="empty-state"><p>No note photos attached.</p></div>`;
    return;
  }

  els.notePhotoGrid.innerHTML = activeNotePhotos.map((photo) => `
    <article class="note-photo-card" data-note-photo="${photo.id}">
      <img src="${photo.image}" alt="">
      <div class="note-photo-body">
        <input class="note-photo-caption" type="text" value="${escapeHtml(photo.caption || "")}" placeholder="Caption, like fishfinder, launch, rig" />
        <button class="button danger remove-note-photo" type="button">Remove</button>
      </div>
    </article>
  `).join("");
}

function collectNotePhotos() {
  const captions = new Map([...els.notePhotoGrid.querySelectorAll("[data-note-photo]")].map((card) => [
    card.dataset.notePhoto,
    card.querySelector(".note-photo-caption").value.trim()
  ]));

  return activeNotePhotos.map((photo) => ({
    ...photo,
    caption: captions.get(photo.id) ?? photo.caption ?? ""
  }));
}

function lureName(id) {
  if (!id) return "";
  return state.lures.find((lure) => lure.id === id)?.name || "";
}

function flasherName(id) {
  if (!id) return "";
  return state.flashers.find((flasher) => flasher.id === id)?.name || "";
}

function renderLurePreview(row) {
  const preview = row.querySelector(".lure-preview");
  const lureId = row.querySelector(".catch-lure, .trip-gear-lure").value;
  const lure = state.lures.find((item) => item.id === lureId);

  if (!lure) {
    preview.innerHTML = "";
    return;
  }

  const image = lure.image ? `<img src="${lure.image}" alt="">` : "";
  const details = [lure.type, lure.brand, lure.color].filter(Boolean).join(" / ");
  preview.innerHTML = `
    <div class="lure-preview-card">
      ${image}
      <div>
        <strong>${escapeHtml(lure.name)}</strong>
        <span>${escapeHtml(details || "Saved lure")}</span>
      </div>
    </div>
  `;
}

function renderFlasherPreview(row) {
  const preview = row.querySelector(".flasher-preview");
  const flasherId = row.querySelector(".catch-flasher, .trip-gear-flasher").value;
  const flasher = state.flashers.find((item) => item.id === flasherId);

  if (!flasher) {
    preview.innerHTML = "";
    return;
  }

  const image = flasher.image ? `<img src="${flasher.image}" alt="">` : "";
  const details = [flasher.type, flasher.brand, flasher.color].filter(Boolean).join(" / ");
  preview.innerHTML = `
    <div class="flasher-preview-card">
      ${image}
      <div>
        <strong>${escapeHtml(flasher.name)}</strong>
        <span>${escapeHtml(details || "Saved flasher")}</span>
      </div>
    </div>
  `;
}

function openLureDialog(lure = null, pendingRowId = "") {
  els.lureForm.reset();
  populateOptionSelect(document.querySelector("#lureType"), state.lureTypes, "Select lure type");
  const editing = Boolean(lure);
  document.querySelector("#lureDialog h2").textContent = editing ? "Edit Lure" : "Add Lure";
  setValue("pendingCatchRow", pendingRowId);
  setValue("editingLureId", lure?.id || "");
  setValue("lureName", lure?.name || "");
  setValue("lureType", lure?.type || "");
  setValue("lureBrand", lure?.brand || "");
  setValue("lureColor", lure?.color || "");
  setValue("lureNotes", lure?.notes || "");
  els.deleteLureButton.classList.toggle("hidden", !editing);
  els.lureDialog.showModal();
}

function openFlasherDialog(flasher = null, pendingRowId = "") {
  els.flasherForm.reset();
  populateOptionSelect(document.querySelector("#flasherType"), state.flasherTypes, "Select flasher type");
  const editing = Boolean(flasher);
  document.querySelector("#flasherDialog h2").textContent = editing ? "Edit Flasher" : "Add Flasher";
  setValue("pendingFlasherCatchRow", pendingRowId);
  setValue("editingFlasherId", flasher?.id || "");
  setValue("flasherName", flasher?.name || "");
  setValue("flasherType", flasher?.type || "");
  setValue("flasherBrand", flasher?.brand || "");
  setValue("flasherColor", flasher?.color || "");
  setValue("flasherNotes", flasher?.notes || "");
  els.deleteFlasherButton.classList.toggle("hidden", !editing);
  els.flasherDialog.showModal();
}

function deleteLure() {
  const lureId = getValue("editingLureId");
  const lure = state.lures.find((item) => item.id === lureId);
  if (!lure || !confirm(`Delete ${lure.name}? This removes it from saved lures and clears it from catches.`)) return;

  state.lures = state.lures.filter((item) => item.id !== lureId);
  state.trips.forEach((trip) => {
    (trip.gearUsed || []).forEach((gearItem) => {
      if (gearItem.lureId === lureId) gearItem.lureId = "";
    });
    (trip.catches || []).forEach((catchItem) => {
      if (catchItem.lureId === lureId) catchItem.lureId = "";
    });
    (trip.lostFish || []).forEach((fish) => {
      if (fish.lureId === lureId) fish.lureId = "";
    });
  });
  saveState();
  els.lureDialog.close();
  renderAll();
}

function deleteFlasher() {
  const flasherId = getValue("editingFlasherId");
  const flasher = state.flashers.find((item) => item.id === flasherId);
  if (!flasher || !confirm(`Delete ${flasher.name}? This removes it from saved flashers and clears it from catches.`)) return;

  state.flashers = state.flashers.filter((item) => item.id !== flasherId);
  state.trips.forEach((trip) => {
    (trip.gearUsed || []).forEach((gearItem) => {
      if (gearItem.flasherId === flasherId) gearItem.flasherId = "";
    });
    (trip.catches || []).forEach((catchItem) => {
      if (catchItem.flasherId === flasherId) catchItem.flasherId = "";
    });
    (trip.lostFish || []).forEach((fish) => {
      if (fish.flasherId === flasherId) fish.flasherId = "";
    });
  });
  saveState();
  els.flasherDialog.close();
  renderAll();
}

function renderGearLibrary() {
  renderGearGrid(els.lureLibraryGrid, state.lures, "lure");
  renderGearGrid(els.flasherLibraryGrid, state.flashers, "flasher");
}

function renderGearGrid(container, items, type) {
  if (!items.length) {
    container.innerHTML = `<div class="empty-state"><p>No saved ${type === "lure" ? "lures" : "flashers"} yet.</p></div>`;
    return;
  }

  container.innerHTML = items.map((item) => {
    const image = item.image ? `<img src="${item.image}" alt="">` : `<div class="gear-image-placeholder">No Image</div>`;
    const details = [item.type, item.brand, item.color].filter(Boolean).join(" / ");
    const editAttr = type === "lure" ? "data-edit-lure" : "data-edit-flasher";
    const deleteAttr = type === "lure" ? "data-delete-lure" : "data-delete-flasher";
    return `
      <article class="gear-card">
        ${image}
        <div class="gear-card-body">
          <h4>${escapeHtml(item.name)}</h4>
          <p>${escapeHtml(details || "No details")}</p>
          <p>${escapeHtml(item.notes || "")}</p>
          <div class="gear-card-actions">
            <button class="button secondary" type="button" ${editAttr}="${item.id}">Edit</button>
            <button class="button danger" type="button" ${deleteAttr}="${item.id}">Delete</button>
          </div>
        </div>
      </article>
    `;
  }).join("");
}

function scopedTrips() {
  if (activeStatsMethod === "All methods") return state.trips;
  return state.trips.filter((trip) => trip.method === activeStatsMethod);
}

function catchRecords(trips = state.trips) {
  return trips.flatMap((trip) => (trip.catches || []).map((catchItem) => ({ ...catchItem, trip })));
}

function lostFishRecords(trips = state.trips) {
  return trips.flatMap((trip) => (trip.lostFish || []).map((fish) => ({ ...fish, trip })));
}

function gearUseRecords(trips = state.trips) {
  return trips.flatMap((trip) => {
    const tripGear = (trip.gearUsed || []).map((gearItem) => ({ ...gearItem, trip, source: "trip" }));
    const catchGear = (trip.catches || [])
      .filter((catchItem) => catchItem.lureId || catchItem.flasherId)
      .map((catchItem) => ({ ...catchItem, trip, source: "catch" }));
    return [...tripGear, ...catchGear];
  });
}

function summarizeBy(records, keyFn, minutesFn = () => 0) {
  const map = new Map();
  records.forEach((record) => {
    const key = keyFn(record);
    if (!key) return;
    const current = map.get(key) || {
      name: key,
      fish: 0,
      uses: 0,
      minutes: 0,
      trips: new Set(),
      bestFish: 0
    };
    const fish = fishCount(record);
    current.fish += fish;
    current.uses += 1;
    current.minutes += Math.max(0, number(minutesFn(record)));
    current.trips.add(record.trip.id);
    current.bestFish = Math.max(current.bestFish, fish);
    map.set(key, current);
  });
  return [...map.values()].sort((a, b) => b.fish - a.fish || b.minutes - a.minutes);
}

function summarizeGearPerformance(records, keyFn, minutesFn = () => 0) {
  return summarizeBy(records, keyFn, (record) => minutesFn(record));
}

function renderAdvancedStats() {
  const trips = scopedTrips();
  const records = catchRecords(trips);
  const lostRecords = lostFishRecords(trips);
  const gearRecords = gearUseRecords(trips);
  const isTrollingScope = activeStatsMethod === "All methods" || activeStatsMethod === "Trolling";
  const fish = records.reduce((sum, record) => sum + fishCount(record), 0);
  const lostFish = lostRecords.length;
  const fishInteractions = fish + lostFish;
  const releasedFish = records.filter((record) => record.released).length;
  const keptFish = Math.max(0, fish - releasedFish);
  const hours = trips.reduce((sum, trip) => sum + tripHours(trip), 0);
  const pounds = records.reduce((sum, record) => sum + catchWeight(record), 0);
  const lureMinutes = gearRecords.reduce((sum, record) => sum + number(record.lureMinutes), 0);
  const flasherMinutes = gearRecords.reduce((sum, record) => sum + number(record.flasherMinutes), 0);
  const skunkTrips = trips.filter((trip) => totalCaught(trip) === 0).length;
  const bestTrip = [...trips].sort((a, b) => totalCaught(b) - totalCaught(a))[0];
  const bestCatchRateTrip = [...trips].sort((a, b) => catchRate(b) - catchRate(a))[0];

  els.advancedMetricGrid.innerHTML = [
    ["Trips", trips.length],
    ["Landed fish", fish],
    ["Lost fish", lostFish],
    ["Released", releasedFish],
    ["Kept", keptFish],
    ["Catch / release", `${keptFish}:${releasedFish}`],
    ["Fish lost %", formatPercent(lostFish, fishInteractions)],
    ["Fish / trip", trips.length ? trimNumber(fish / trips.length) : "0"],
    ["Fish / hour", hours ? trimNumber(fish / hours) : "0"],
    ["Lbs / hour", hours ? trimNumber(pounds / hours) : "0"],
    ["Pounds landed", trimNumber(pounds)],
    ["Lure use time", minutesToHours(lureMinutes)],
    ["Flasher use time", isTrollingScope ? minutesToHours(flasherMinutes) : "Trolling only"],
    ["Skunk trips", skunkTrips],
    ["Best trip", bestTrip ? `${totalCaught(bestTrip)} fish` : "0"]
  ].map(([label, value]) => `<article class="metric-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join("");

  renderStatsTable(els.outcomeStatsTable, ["Outcome", "Fish", "Rate"], outcomeRows(fish, releasedFish, keptFish, lostFish));

  renderStatsTable(els.lureStatsTable, ["Lure", "Fish", "Uses", "Use Time", "Catch Rate", "Trips"], summarizeGearPerformance(
    gearRecords.filter((record) => record.lureId),
    (record) => lureName(record.lureId),
    (record) => record.lureMinutes
  ).map((item) => [
    item.name,
    item.fish,
    item.uses,
    minutesToHours(item.minutes),
    item.minutes ? `${trimNumber(item.fish / (item.minutes / 60))}/hr` : "n/a",
    item.trips.size
  ]));

  if (isTrollingScope) {
    renderStatsTable(els.flasherStatsTable, ["Flasher", "Fish", "Uses", "Use Time", "Catch Rate", "Trips"], summarizeGearPerformance(
      gearRecords.filter((record) => record.flasherId),
      (record) => flasherName(record.flasherId),
      (record) => record.flasherMinutes
    ).map((item) => [
      item.name,
      item.fish,
      item.uses,
      minutesToHours(item.minutes),
      item.minutes ? `${trimNumber(item.fish / (item.minutes / 60))}/hr` : "n/a",
      item.trips.size
    ]));

    renderStatsTable(els.comboStatsTable, ["Lure", "Flasher", "Fish", "Uses", "Tandem Time", "Catch Rate", "Trips"], summarizeCombos(
      gearRecords.filter((record) => record.lureId && record.flasherId)
    ).map((item) => [
      item.lure,
      item.flasher,
      item.fish,
      item.uses,
      minutesToHours(item.minutes),
      item.minutes ? `${trimNumber(item.fish / (item.minutes / 60))}/hr` : "n/a",
      item.trips.size
    ]));
  } else {
    renderStatsMessage(els.flasherStatsTable, "Flashers are only tracked for trolling trips.");
    renderStatsMessage(els.comboStatsTable, "Lure + flasher combos are only tracked for trolling trips.");
  }

  renderStatsTable(els.speciesStatsTable, ["Species", "Fish", "Trips", "Best Row", "Share"], summarizeBy(
    records.filter((record) => record.species),
    (record) => record.species
  ).map((item) => [
    item.name,
    item.fish,
    item.trips.size,
    item.bestFish,
    fish ? `${trimNumber((item.fish / fish) * 100)}%` : "0%"
  ]));

  renderStatsTable(els.lostFishStatsTable, ["Species", "Lost", "Trips", "Share"], summarizeLostFish(lostRecords, lostFish));

  if (isTrollingScope) {
    const trollingCatches = records.filter(isTrollingRecord);
    const trollingLost = lostRecords.filter(isTrollingRecord);
    const trollingGear = gearRecords.filter((record) => record.trip.method === "Trolling" && record.source === "trip");
    const directionRows = summarizeTrollingPerformance(
      trollingCatches,
      trollingLost,
      trollingGear,
      (record) => record.direction,
      (record) => Math.max(number(record.lureMinutes), number(record.flasherMinutes))
    );
    const setupRows = summarizeTrollingPerformance(
      trollingCatches,
      trollingLost,
      trollingGear,
      (record) => presentationLabel(record.presentation),
      (record) => Math.max(number(record.lureMinutes), number(record.flasherMinutes))
    );
    const speedRows = summarizeTrollingPerformance(
      trollingCatches,
      trollingLost,
      trollingGear,
      (record) => speedBucket(record.speed),
      (record) => Math.max(number(record.lureMinutes), number(record.flasherMinutes))
    );
    const trollingInteractions = trollingCatches.reduce((sum, record) => sum + fishCount(record), 0) + trollingLost.length;
    const fowRangeRows = summarizeRangeWithLost(
      trollingCatches,
      trollingLost,
      (record) => fowRange(record.fowCaught),
      trollingInteractions
    );

    renderTrollingHighlights(directionRows, setupRows, fowRangeRows, speedRows);
    renderStatsTable(els.directionStatsTable, ["Direction", "Landed", "Lost", "Gear Time", "Fish / hr", "Trips"], directionRows);
    renderStatsTable(els.trollingSetupStatsTable, ["Setup", "Landed", "Lost", "Gear Time", "Fish / hr", "Trips"], setupRows);
    renderStatsTable(els.fowRangeStatsTable, ["FOW Range", "Landed", "Lost", "Trips", "Share"], fowRangeRows);
    renderStatsTable(els.speedStatsTable, ["Speed", "Landed", "Lost", "Gear Time", "Fish / hr", "Trips"], speedRows);
  } else {
    renderStatsMessage(els.trollingHighlightsTable, "Trolling-only stats appear when viewing All methods or Trolling.");
    renderStatsMessage(els.directionStatsTable, "Trolling direction is only tracked for trolling trips.");
    renderStatsMessage(els.trollingSetupStatsTable, "Trolling setup is only tracked for trolling trips.");
    renderStatsMessage(els.fowRangeStatsTable, "FOW ranges are only tracked for trolling trips.");
    renderStatsMessage(els.speedStatsTable, "Trolling speed is only tracked for trolling trips.");
  }

  renderStatsTable(els.fowStatsTable, ["FOW", "Landed", "Lost", "Trips"], summarizeFieldWithLost(records, lostRecords, (record) => record.fowCaught));
  renderStatsTable(els.depthDownStatsTable, ["Depth Down", "Landed", "Lost", "Trips"], summarizeFieldWithLost(records, lostRecords, (record) => record.depthDown || record.estimatedDepth));

  const locationRows = trips.map((trip) => ({ ...trip, fish: totalCaught(trip), rate: catchRate(trip) }));
  renderStatsTable(els.locationStatsTable, ["Location", "Trips", "Fish", "Hours", "Fish / hr"], summarizeTrips(locationRows, (trip) => trip.location));

  renderStatsTable(els.methodStatsTable, ["Method", "Trips", "Fish", "Hours", "Fish / hr"], summarizeTrips(state.trips.map((trip) => ({ ...trip, fish: totalCaught(trip), rate: catchRate(trip) })), (trip) => trip.method));

  renderStatsTable(els.intentStatsTable, ["Intent", "Trips", "Fish", "Hours", "Fish / hr"], summarizeTrips(locationRows, (trip) => intentLabel(tripIntent(trip))));

  renderStatsTable(els.personStatsTable, ["Person", "Fish", "Setups", "Gear Time", "Trips"], summarizePeople(records, gearRecords));

  renderStatsTable(els.monthStatsTable, ["Month", "Trips", "Fish", "Hours", "Fish / hr"], summarizeTrips(locationRows, (trip) => {
    if (!trip.date) return "";
    return new Date(`${trip.date}T12:00:00`).toLocaleDateString(undefined, { month: "long" });
  }));

  if (bestCatchRateTrip) {
    els.advancedMetricGrid.insertAdjacentHTML("beforeend", `<article class="metric-card"><span>Best catch rate</span><strong>${trimNumber(catchRate(bestCatchRateTrip))}/hr</strong></article>`);
  }
}

function formatPercent(value, total) {
  return total ? `${trimNumber((value / total) * 100)}%` : "0%";
}

function outcomeRows(landed, released, kept, lost) {
  const total = landed + lost;
  return [
    ["Landed", landed, `${formatPercent(landed, total)} of landed + lost`],
    ["Released after landing", released, `${formatPercent(released, landed)} of landed fish`],
    ["Kept / harvested", kept, `${formatPercent(kept, landed)} of landed fish`],
    ["Lost fish", lost, `${formatPercent(lost, total)} of landed + lost`]
  ];
}

function summarizeLostFish(records, totalLost) {
  return summarizeBy(records.filter((record) => record.species), (record) => record.species)
    .map((item) => [
      item.name,
      item.uses,
      item.trips.size,
      totalLost ? `${trimNumber((item.uses / totalLost) * 100)}%` : "0%"
    ]);
}

function summarizeFieldWithLost(catches, lostRecords, keyFn) {
  const map = new Map();
  const ensure = (key) => {
    const current = map.get(key) || { name: key, landed: 0, lost: 0, trips: new Set() };
    map.set(key, current);
    return current;
  };

  catches.forEach((record) => {
    const key = keyFn(record);
    if (!key) return;
    const current = ensure(key);
    current.landed += fishCount(record);
    current.trips.add(record.trip.id);
  });

  lostRecords.forEach((record) => {
    const key = keyFn(record);
    if (!key) return;
    const current = ensure(key);
    current.lost += 1;
    current.trips.add(record.trip.id);
  });

  return [...map.values()]
    .sort((a, b) => (b.landed + b.lost) - (a.landed + a.lost) || b.trips.size - a.trips.size)
    .map((item) => [item.name, item.landed, item.lost, item.trips.size]);
}

function isTrollingRecord(record) {
  return record.trip?.method === "Trolling";
}

function parseFirstNumber(value) {
  const match = String(value || "").match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function fowRange(value) {
  const fow = parseFirstNumber(value);
  if (!fow) return "";
  const start = Math.floor(fow / 10) * 10;
  return `${start}-${start + 10} FOW`;
}

function speedBucket(value) {
  const speed = parseFirstNumber(value);
  if (!speed) return "";
  return `${trimNumber(Math.round(speed * 10) / 10)} mph`;
}

function summarizeTrollingPerformance(catches, lostRecords, gearRecords, keyFn, minutesFn) {
  const map = new Map();
  const ensure = (key) => {
    const current = map.get(key) || { name: key, landed: 0, lost: 0, minutes: 0, trips: new Set() };
    map.set(key, current);
    return current;
  };

  catches.forEach((record) => {
    const key = keyFn(record);
    if (!key) return;
    const current = ensure(key);
    current.landed += fishCount(record);
    current.trips.add(record.trip.id);
  });

  lostRecords.forEach((record) => {
    const key = keyFn(record);
    if (!key) return;
    const current = ensure(key);
    current.lost += 1;
    current.trips.add(record.trip.id);
  });

  gearRecords.forEach((record) => {
    const key = keyFn(record);
    if (!key) return;
    const current = ensure(key);
    current.minutes += Math.max(0, number(minutesFn(record)));
    current.trips.add(record.trip.id);
  });

  return [...map.values()]
    .sort((a, b) => b.landed - a.landed || fishPerHour(b) - fishPerHour(a) || b.minutes - a.minutes)
    .map((item) => {
      const row = [
        item.name,
        item.landed,
        item.lost,
        minutesToHours(item.minutes),
        item.minutes ? `${trimNumber(fishPerHour(item))}/hr` : "n/a",
        item.trips.size
      ];
      row.landed = item.landed;
      row.lost = item.lost;
      row.minutes = item.minutes;
      row.rate = fishPerHour(item);
      return row;
    });
}

function summarizeRangeWithLost(catches, lostRecords, keyFn, totalInteractions) {
  const map = new Map();
  const ensure = (key) => {
    const current = map.get(key) || { name: key, landed: 0, lost: 0, trips: new Set() };
    map.set(key, current);
    return current;
  };

  catches.forEach((record) => {
    const key = keyFn(record);
    if (!key) return;
    const current = ensure(key);
    current.landed += fishCount(record);
    current.trips.add(record.trip.id);
  });

  lostRecords.forEach((record) => {
    const key = keyFn(record);
    if (!key) return;
    const current = ensure(key);
    current.lost += 1;
    current.trips.add(record.trip.id);
  });

  return [...map.values()]
    .sort((a, b) => b.landed - a.landed || (b.landed + b.lost) - (a.landed + a.lost))
    .map((item) => {
      const total = item.landed + item.lost;
      const row = [item.name, item.landed, item.lost, item.trips.size, formatPercent(total, totalInteractions)];
      row.landed = item.landed;
      row.lost = item.lost;
      return row;
    });
}

function fishPerHour(item) {
  return item.minutes ? item.landed / (item.minutes / 60) : 0;
}

function renderTrollingHighlights(directionRows, setupRows, fowRangeRows, speedRows) {
  const byLanded = (rows) => [...rows].sort((a, b) => b.landed - a.landed || b.lost - a.lost)[0];
  const byRate = (rows) => [...rows].filter((row) => row.minutes > 0).sort((a, b) => b.rate - a.rate || b.landed - a.landed)[0];
  const byTime = (rows) => [...rows].filter((row) => row.minutes > 0).sort((a, b) => b.minutes - a.minutes || b.landed - a.landed)[0];
  const highlightRows = [
    highlightRow("Best direction", byLanded(directionRows), "Most landed fish by trolling direction"),
    highlightRow("Best FOW range", byLanded(fowRangeRows), "Most landed fish in 10-foot FOW ranges"),
    highlightRow("Most productive setup", byLanded(setupRows), "Most landed fish by setup"),
    highlightRow("Best setup rate", byRate(setupRows), "Highest landed fish per hour used"),
    highlightRow("Best speed rate", byRate(speedRows), "Highest landed fish per hour at speed"),
    highlightRow("Most common speed", byTime(speedRows), "Most setup time logged at speed")
  ].filter(Boolean);

  renderStatsTable(els.trollingHighlightsTable, ["Stat", "Winner", "Details"], highlightRows);
}

function highlightRow(label, row, details) {
  if (!row) return [label, "No data yet", details];
  const caught = row.landed !== undefined ? `${row.landed} landed` : "";
  const lost = row.lost ? `, ${row.lost} lost` : "";
  const rate = row.rate ? `, ${trimNumber(row.rate)}/hr` : "";
  const time = row.minutes ? `, ${minutesToHours(row.minutes)} used` : "";
  return [label, row[0], `${caught}${lost}${rate}${time}` || details];
}

function presentationLabel(value) {
  const labels = {
    downrigger: "Downrigger",
    cheater: "Cheater",
    "flatline-leadcore": "Planer Board / Leadcore",
    "dipsey-diver": "Dipsey Diver"
  };
  return labels[value] || value || "";
}

function summarizeCombos(records) {
  const map = new Map();
  records.forEach((record) => {
    const lure = lureName(record.lureId);
    const flasher = flasherName(record.flasherId);
    if (!lure || !flasher) return;
    const key = `${record.lureId}::${record.flasherId}`;
    const current = map.get(key) || {
      lure,
      flasher,
      fish: 0,
      uses: 0,
      minutes: 0,
      trips: new Set()
    };
    current.fish += fishCount(record);
    current.uses += 1;
    current.minutes += comboMinutes(record);
    current.trips.add(record.trip.id);
    map.set(key, current);
  });
  return [...map.values()].sort((a, b) => b.fish - a.fish || b.minutes - a.minutes);
}

function personName(trip, personId) {
  if (!personId) return "";
  return state.people.find((person) => person.id === personId)?.name
    || (trip.people || []).find((person) => person.id === personId)?.name
    || "";
}

function summarizePeople(catches, gearRecords) {
  const map = new Map();
  const ensure = (name) => {
    const current = map.get(name) || { name, fish: 0, setups: 0, minutes: 0, trips: new Set() };
    map.set(name, current);
    return current;
  };

  catches.forEach((record) => {
    const name = personName(record.trip, record.personId);
    if (!name) return;
    const current = ensure(name);
    current.fish += fishCount(record);
    current.trips.add(record.trip.id);
  });

  gearRecords.forEach((record) => {
    const name = personName(record.trip, record.personId);
    if (!name) return;
    const current = ensure(name);
    current.setups += 1;
    current.minutes += Math.max(number(record.lureMinutes), number(record.flasherMinutes));
    current.trips.add(record.trip.id);
  });

  return [...map.values()]
    .sort((a, b) => b.fish - a.fish || b.minutes - a.minutes)
    .map((item) => [item.name, item.fish, item.setups, minutesToHours(item.minutes), item.trips.size]);
}

function comboMinutes(record) {
  const lureMinutes = number(record.lureMinutes);
  const flasherMinutes = number(record.flasherMinutes);
  if (lureMinutes && flasherMinutes) return Math.min(lureMinutes, flasherMinutes);
  return lureMinutes || flasherMinutes || 0;
}

function summarizeTrips(trips, keyFn) {
  const map = new Map();
  trips.forEach((trip) => {
    const key = keyFn(trip);
    if (!key) return;
    const current = map.get(key) || { name: key, trips: 0, fish: 0, hours: 0 };
    current.trips += 1;
    current.fish += totalCaught(trip);
    current.hours += tripHours(trip);
    map.set(key, current);
  });
  return [...map.values()]
    .sort((a, b) => b.fish - a.fish || b.trips - a.trips)
    .map((item) => [item.name, item.trips, item.fish, trimNumber(item.hours), item.hours ? trimNumber(item.fish / item.hours) : "0"]);
}

function renderStatsTable(container, headers, rows) {
  if (!rows.length) {
    container.innerHTML = `<div class="empty-state"><p>No data yet</p></div>`;
    return;
  }

  container.innerHTML = `
    <table>
      <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
      <tbody>
        ${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}
      </tbody>
    </table>
  `;
}

function renderStatsMessage(container, message) {
  container.innerHTML = `<div class="empty-state"><p>${escapeHtml(message)}</p></div>`;
}

function minutesToHours(minutes) {
  const value = number(minutes);
  if (!value) return "0 hr";
  if (value < 60) return `${trimNumber(value)} min`;
  return `${trimNumber(value / 60)} hr`;
}

function calculateHours(startTime, endTime) {
  if (!startTime || !endTime) return 0;
  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);
  if (![startHour, startMinute, endHour, endMinute].every(Number.isFinite)) return 0;

  const start = startHour * 60 + startMinute;
  let end = endHour * 60 + endMinute;
  if (end < start) end += 24 * 60;
  return (end - start) / 60;
}

function calculateMinutes(startTime, endTime) {
  return calculateHours(startTime, endTime) * 60;
}

function setupMinutesFromRow(row) {
  return calculateMinutes(
    row.querySelector(".trip-gear-start-time").value,
    row.querySelector(".trip-gear-end-time").value
  );
}

function isTrollingTrip() {
  return getValue("method").toLowerCase() === "trolling";
}

function updateTrollingVisibility() {
  const trolling = isTrollingTrip();
  document.querySelectorAll("#tripDialog .trolling-field").forEach((element) => {
    element.classList.toggle("hidden", !trolling);
  });
  document.querySelectorAll(".catch-row, .gear-used-row").forEach(updatePresentationFields);
}

function updatePresentationFields(row) {
  const presentation = row.querySelector(".catch-presentation")?.value || "";
  row.querySelectorAll(".trolling-param").forEach((field) => field.classList.remove("visible"));
  if (!isTrollingTrip()) return;

  if (presentation === "downrigger" || presentation === "cheater") {
    row.querySelector(".param-ball-depth")?.classList.add("visible");
  }
  if (presentation === "flatline-leadcore") {
    row.querySelector(".param-board-line")?.classList.add("visible");
    row.querySelector(".param-lure-depth")?.classList.add("visible");
  }
  if (presentation === "dipsey-diver") {
    row.querySelector(".param-dipsey-setting")?.classList.add("visible");
    row.querySelector(".param-line-out")?.classList.add("visible");
    row.querySelector(".param-estimated-depth")?.classList.add("visible");
  }
}

function trimNumber(value) {
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function exportJson() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `fishing-logbook-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

async function importJson(event) {
  const file = event.target.files[0];
  if (!file) return;
  const text = await file.text();
  const nextState = JSON.parse(text);
  if (!Array.isArray(nextState.trips) || !Array.isArray(nextState.lures) || !Array.isArray(nextState.flashers) || !Array.isArray(nextState.people || [])) {
    alert("That file does not look like a Fishing Logbook export.");
    return;
  }
  state = normalizeState(nextState);
  saveState();
  renderAll();
  event.target.value = "";
}

els.newTripButton.addEventListener("click", () => openTripDialog());
els.tripForm.addEventListener("submit", saveTrip);
els.deleteTripButton.addEventListener("click", deleteActiveTrip);
els.addCatchButton.addEventListener("click", () => addCatchRow());
els.addLostFishButton.addEventListener("click", () => addLostFishRow());
els.addTripGearButton.addEventListener("click", () => addTripGearRow());
els.addPersonButton.addEventListener("click", () => addPersonRow());
els.notePhotoInput.addEventListener("change", addNotePhotos);
els.lureForm.addEventListener("submit", saveLure);
els.flasherForm.addEventListener("submit", saveFlasher);
els.deleteLureButton.addEventListener("click", deleteLure);
els.deleteFlasherButton.addEventListener("click", deleteFlasher);
els.tripsViewButton.addEventListener("click", () => setView("trips"));
els.statsViewButton.addEventListener("click", () => setView("stats"));
els.gearViewButton.addEventListener("click", () => setView("gear"));
els.newLibraryLureButton.addEventListener("click", () => openLureDialog());
els.newLibraryFlasherButton.addEventListener("click", () => openFlasherDialog());
els.exportButton.addEventListener("click", exportJson);
els.importInput.addEventListener("change", importJson);
els.statsMethodFilter.addEventListener("change", () => {
  activeStatsMethod = els.statsMethodFilter.value;
  renderAdvancedStats();
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

  const editButton = event.target.closest("[data-edit-trip]");
  if (editButton) {
    const trip = state.trips.find((item) => item.id === editButton.dataset.editTrip);
    if (trip) openTripDialog(trip);
  }

  const removeCatch = event.target.closest(".remove-catch");
  if (removeCatch) {
    removeCatch.closest(".catch-row").remove();
    updateAllRowSummaries();
  }

  const removeTripGear = event.target.closest(".remove-trip-gear");
  if (removeTripGear) {
    removeTripGear.closest(".gear-used-row").remove();
    updateAllRowSummaries();
  }

  const removePerson = event.target.closest(".remove-person");
  if (removePerson) {
    const personId = removePerson.closest(".person-row").dataset.personId;
    removePerson.closest(".person-row").remove();
    document.querySelectorAll(".catch-person, .trip-gear-person").forEach((select) => {
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
  if (event.target.matches(".catch-lure, .trip-gear-lure")) {
    renderLurePreview(event.target.closest(".catch-row, .gear-used-row"));
  }
  if (event.target.matches(".catch-flasher, .trip-gear-flasher")) {
    renderFlasherPreview(event.target.closest(".catch-row, .gear-used-row"));
  }
  if (event.target.matches(".catch-presentation")) {
    updatePresentationFields(event.target.closest(".catch-row, .gear-used-row"));
  }
  const row = event.target.closest(".catch-row, .gear-used-row");
  if (row) updateRowSummary(row);
});

document.addEventListener("input", (event) => {
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
  const showingGear = view === "gear";
  els.tripControls.classList.toggle("hidden", showingStats || showingGear);
  els.tripListPanel.classList.toggle("hidden", showingStats || showingGear);
  els.advancedStatsPanel.classList.toggle("hidden", !showingStats);
  els.gearPanel.classList.toggle("hidden", !showingGear);
  document.querySelector(".topbar h2").textContent = showingStats ? "Advanced Stats" : showingGear ? "Gear" : "Trips";
  renderAdvancedStats();
  renderGearLibrary();
}

async function init() {
  state = await loadState();
  renderAll();
}

init();
