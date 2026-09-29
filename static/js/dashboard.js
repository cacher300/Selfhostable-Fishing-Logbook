import { html, joinHtml, setHtml } from "./html.js";
import { activeStatsFilters, state, ui } from "./app-state.js";
import { locationNames, optionChoices, optionLabels } from "./app-normalization.js";
import { unitSymbol } from "./app-units.js";
import { els } from "./app-elements.js";
import { isVideoMedia, mediaMarkup, previewImage } from "./app-media.js";
import { populateLocationSelect } from "./locations.js";
import { syncUnitLabels } from "./settings.js";
import { populateTripExpeditionSelect, renderExpeditions } from "./expeditions.js";
import { mergePeople, tripIntent, tripRatingClass, tripRatingLabel, tripRatingValue } from "./trip-editor.js";
import { updateAllRowSummaries } from "./trip-rows.js";
import { flasherName, lureName } from "./gear-core.js";
import { renderGearLibrary } from "./gear-inventory.js";
import { resolveTripLineRecord } from "./trolling-spread.js";
import { tripMonthName } from "./stats-scope.js";
import { calculateHours, parseFirstNumber, renderAdvancedStats } from "./stats.js";
import { renderPersonalBests } from "./personal-bests.js";
import { trimNumber } from "./form-utils.js";


export function formatDate(value) {
  if (!value) return "";
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function totalCaught(trip) {
  return (trip.catches || []).reduce((sum, catchItem) => sum + fishCount(catchItem), 0);
}

export function totalWeight(trip) {
  return (trip.catches || []).reduce((sum, catchItem) => sum + catchWeight(catchItem), 0);
}

export function catchWeight(catchItem) {
  const weight = parseFirstNumber(catchItem?.weight);
  return weight ? weight * fishCount(catchItem) : 0;
}

export function fishCount(catchItem) {
  if (!catchItem) return 0;
  if (catchItem.quantity !== undefined && catchItem.quantity !== "") return Math.max(0, number(catchItem.quantity));
  return 1;
}

export function catchRate(trip) {
  const hours = tripHours(trip);
  return hours > 0 ? totalCaught(trip) / hours : 0;
}

export function tripHours(trip) {
  const calculated = calculateHours(trip.launchTime, trip.linesPulledTime);
  if (calculated) return Math.max(0, calculated - number(trip.idleHours));
  return number(trip.hours);
}

export function tripStartMinutes(trip) {
  const match = String(trip?.launchTime || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return (Number(match[1]) * 60) + Number(match[2]);
}

export function compareTripsByDateTime(a, b, direction = "desc") {
  const dateCompare = String(a.date || "").localeCompare(String(b.date || ""));
  if (dateCompare) return direction === "asc" ? dateCompare : -dateCompare;

  const aStart = tripStartMinutes(a);
  const bStart = tripStartMinutes(b);
  if (aStart === null && bStart === null) return 0;
  if (aStart === null) return 1;
  if (bStart === null) return -1;
  return direction === "asc" ? aStart - bStart : bStart - aStart;
}

export function dateKeyToDayNumber(dateKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey || "")) return null;
  const [year, month, day] = dateKey.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

export function todayDayNumber() {
  const today = new Date();
  return Math.floor(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) / 86400000);
}

export function uniqueSortedTripDays(trips) {
  return [...new Set(trips.map((trip) => trip.date).filter((date) => dateKeyToDayNumber(date) !== null))]
    .map((date) => dateKeyToDayNumber(date))
    .sort((a, b) => a - b);
}

export function longestConsecutiveRun(dayNumbers) {
  let longest = 0;
  let current = 0;
  let previous = null;

  dayNumbers.forEach((dayNumber) => {
    current = previous !== null && dayNumber === previous + 1 ? current + 1 : 1;
    longest = Math.max(longest, current);
    previous = dayNumber;
  });

  return longest;
}

export function fishingDateMetrics(trips, hasCatch = (trip) => totalCaught(trip) > 0) {
  const tripDays = uniqueSortedTripDays(trips);
  const catchDays = uniqueSortedTripDays(trips.filter(hasCatch));
  const today = todayDayNumber();
  const lastTripDay = tripDays.at(-1);
  const lastCatchDay = catchDays.at(-1);

  let longestNoCatchRun = null;
  if (tripDays.length && !catchDays.length) {
    longestNoCatchRun = Math.max(0, today - tripDays[0]);
  } else if (catchDays.length) {
    longestNoCatchRun = Math.max(0, catchDays[0] - tripDays[0]);
    catchDays.forEach((dayNumber, index) => {
      const nextCatchDay = catchDays[index + 1] ?? today;
      longestNoCatchRun = Math.max(longestNoCatchRun, nextCatchDay - dayNumber);
    });
  }

  return {
    daysSinceLastTrip: lastTripDay === undefined ? null : Math.max(0, today - lastTripDay),
    daysSinceLastCatch: lastCatchDay === undefined ? null : Math.max(0, today - lastCatchDay),
    longestFishingStreak: longestConsecutiveRun(tripDays),
    longestNoCatchRun
  };
}

export function countBy(items, getKey, getCount = () => 1) {
  return items.reduce((map, item) => {
    const key = getKey(item);
    if (!key) return map;
    map.set(key, (map.get(key) || 0) + getCount(item));
    return map;
  }, new Map());
}

export function topEntries(map, limit = 4) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

export function renderBars(container, entries) {
  setHtml(container, html``);
  if (!entries.length) {
    setHtml(container, html`<p class="muted">No data yet</p>`);
    return;
  }

  const max = Math.max(...entries.map(([, count]) => count));
  entries.forEach(([label, count]) => {
    const row = document.createElement("div");
    row.className = "bar-item";
    setHtml(row, html`
      <div class="bar-meta"><span>${label}</span><strong>${count}</strong></div>
      <div class="bar-track"><div class="bar-fill" style="width:${(count / max) * 100}%"></div></div>
    `);
    container.append(row);
  });
}

export function renderStats() {
  const allCatches = state.trips.flatMap((trip) => (trip.catches || []).map((catchItem) => resolveTripLineRecord({ ...catchItem, trip })));
  const fish = state.trips.reduce((sum, trip) => sum + totalCaught(trip), 0);
  const hours = state.trips.reduce((sum, trip) => sum + tripHours(trip), 0);
  const totalFishWeight = state.trips.reduce((sum, trip) => sum + totalWeight(trip), 0);
  const waterbodies = new Set(state.trips.map((trip) => trip.location).filter(Boolean));
  const dateMetrics = fishingDateMetrics(state.trips);

  els.statTrips.textContent = state.trips.length;
  els.statFish.textContent = fish;
  els.statHours.textContent = trimNumber(hours);
  els.statWaterbodies.textContent = waterbodies.size;
  els.statCatchRate.textContent = hours ? trimNumber(fish / hours) : "0";
  els.statPoundsPerHour.textContent = hours ? trimNumber(totalFishWeight / hours) : "0";
  if (els.statWeightPerHourLabel) els.statWeightPerHourLabel.textContent = `${unitSymbol("fishWeight")} / Hour`;
  els.statDaysSinceTrip.textContent = dateMetrics.daysSinceLastTrip ?? "-";

  const speciesCounts = countBy(allCatches, (item) => item.species, fishCount);
  const lureCounts = countBy(allCatches, (item) => lureName(item.lureId), fishCount);
  renderBars(els.speciesBars, topEntries(speciesCounts));
  renderBars(els.lureBars, topEntries(lureCounts));
}

export function renderBrandSpotlight() {
  if (ui.brandSpotlightTimer) {
    clearInterval(ui.brandSpotlightTimer);
    ui.brandSpotlightTimer = null;
  }

  const shufflePhotos = (items) => {
    const shuffled = [...items];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    return shuffled;
  };

  const photos = shufflePhotos(state.trips
    .flatMap((trip) => {
      const tripTitle = trip.title || trip.location || "Trip photo";
      const notePhotos = (trip.notePhotos || []).map((photo) => ({
        ...photo,
        tripTitle,
        spotlightTitle: photo.caption || "",
        date: trip.date
      }));
      const catchPhotos = (trip.catches || []).flatMap((catchItem) => (catchItem.photos || []).map((photo) => ({
        ...photo,
        tripTitle,
        spotlightTitle: photo.caption || "",
        date: trip.date
      })));
      return [...notePhotos, ...catchPhotos];
    })
    .filter((photo) => previewImage(photo) && !isVideoMedia(photo)));

  if (!photos.length) {
    setHtml(els.brandSpotlight, html`
      <div class="brand-spotlight-empty">
        <span>Trip, gear, catch, and pattern tracker</span>
      </div>
    `);
    return;
  }

  setHtml(els.brandSpotlight, html`
    <div class="spotlight-slides">
      ${joinHtml(photos.map((photo, index) => html`
        <figure class="spotlight-slide ${index === 0 ? "is-active" : ""}">
          ${mediaMarkup(photo)}
          ${photo.spotlightTitle ? html`
            <figcaption>
              <strong>${photo.spotlightTitle}</strong>
            </figcaption>
          ` : ""}
        </figure>
      `), "")}
    </div>
  `);

  if (photos.length < 2) return;

  let activeIndex = 0;
  const slides = [...els.brandSpotlight.querySelectorAll(".spotlight-slide")];
  ui.brandSpotlightTimer = setInterval(() => {
    slides[activeIndex]?.classList.remove("is-active");
    activeIndex = (activeIndex + 1) % slides.length;
    slides[activeIndex]?.classList.add("is-active");
  }, 4200);
}

export function renderFilters() {
  const targets = ["All targets", ...new Set(state.trips.map((trip) => trip.targetSpecies).filter(Boolean))];
  const selectedTarget = els.targetFilter.value || "All targets";
  setHtml(els.targetFilter, joinHtml(targets.map((target) => html`<option ${target === selectedTarget ? "selected" : ""}>${target}</option>`), ""));

  const methods = ["All methods", ...new Set([...state.methods, ...state.trips.map((trip) => trip.method)].filter(Boolean))];
  const selectedMethod = methods.includes(els.methodFilter.value) ? els.methodFilter.value : "All methods";
  setHtml(els.methodFilter, joinHtml(methods.map((method) => html`<option ${method === selectedMethod ? "selected" : ""}>${method}</option>`), ""));

  const years = ["All years", ...new Set(state.trips.map((trip) => new Date(`${trip.date}T12:00:00`).getFullYear()).filter(Boolean))].sort((a, b) => {
    if (a === "All years") return -1;
    if (b === "All years") return 1;
    return b - a;
  });
  const selectedYear = els.yearFilter.value || "All years";
  setHtml(els.yearFilter, joinHtml(years.map((year) => html`<option ${String(year) === selectedYear ? "selected" : ""}>${year}</option>`), ""));
}

export function renderStatsMethodFilter() {
  if (window.location.pathname === "/stats") {
    const params = new URLSearchParams(window.location.search);
    ui.activeStatsDateRange = ["all", "season", "30", "90"].includes(params.get("range")) ? params.get("range") : "all";
    ui.activeStatsMethod = params.get("method") || ui.activeStatsMethod;
    ui.activeStatsSort = params.get("sort") || ui.activeStatsSort;
    ui.activeStatsMinTrips = Math.max(0, Math.floor(Number(params.get("minTrips")) || 0));
    ui.activeStatsMinHours = Math.max(0, Number(params.get("minHours")) || 0);
    ui.activeStatsIncludeLost = params.get("outcome") === "strikes";
    Object.keys(activeStatsFilters).forEach((key) => {
      if (params.has(key)) activeStatsFilters[key] = params.get(key);
    });
    if (els.statsDateFilter) els.statsDateFilter.value = ui.activeStatsDateRange;
    if (els.statsSortFilter) els.statsSortFilter.value = ui.activeStatsSort;
    if (els.statsMinTripsInput) els.statsMinTripsInput.value = ui.activeStatsMinTrips;
    if (els.statsMinHoursInput) els.statsMinHoursInput.value = ui.activeStatsMinHours;
    if (els.statsIncludeLostToggle) els.statsIncludeLostToggle.checked = ui.activeStatsIncludeLost;
  }
  const methods = ["All methods", ...new Set([...state.methods, ...state.trips.map((trip) => trip.method)].filter(Boolean))];
  if (!methods.includes(ui.activeStatsMethod)) ui.activeStatsMethod = "All methods";
  setHtml(els.statsMethodFilter, joinHtml(methods.map((method) => (
    html`<option value="${method}" ${method === ui.activeStatsMethod ? "selected" : ""}>${method}</option>`
  )), ""));

  const species = ["All species", ...new Set([...state.species, ...state.trips.flatMap((trip) => [
    ...(trip.catches || []).map((catchItem) => catchItem.species),
    ...(trip.lostFish || []).map((fish) => fish.possibleSpecies || fish.species)
  ])].filter(Boolean))];
  if (!species.includes(activeStatsFilters.species)) activeStatsFilters.species = "All species";
  setHtml(els.statsSpeciesFilter, joinHtml(species.map((item) => (
    html`<option value="${item}" ${item === activeStatsFilters.species ? "selected" : ""}>${item}</option>`
  )), ""));

  const people = ["All people", ...mergePeople(
    state.people,
    state.trips.flatMap((trip) => trip.people || [])
  ).map((person) => person.name)];
  if (!people.includes(activeStatsFilters.person)) activeStatsFilters.person = "All people";
  setHtml(els.statsPersonFilter, joinHtml(people.map((item) => (
    html`<option value="${item}" ${item === activeStatsFilters.person ? "selected" : ""}>${item}</option>`
  )), ""));

  const locations = ["All locations", ...new Set([...locationNames(), ...state.trips.map((trip) => trip.location)].filter(Boolean))];
  if (!locations.includes(activeStatsFilters.location)) activeStatsFilters.location = "All locations";
  setHtml(els.statsLocationFilter, joinHtml(locations.map((item) => (
    html`<option value="${item}" ${item === activeStatsFilters.location ? "selected" : ""}>${item}</option>`
  )), ""));

  const launches = ["All launches", ...new Set(state.trips.map((trip) => trip.launch).filter(Boolean))];
  if (!launches.includes(activeStatsFilters.launch)) activeStatsFilters.launch = "All launches";
  setHtml(els.statsLaunchFilter, joinHtml(launches.map((item) => (
    html`<option value="${item}" ${item === activeStatsFilters.launch ? "selected" : ""}>${item}</option>`
  )), ""));

  const lures = ["All lures", ...state.lures.map((lure) => lure.name).filter(Boolean)];
  if (!lures.includes(activeStatsFilters.lure)) activeStatsFilters.lure = "All lures";
  setHtml(els.statsLureFilter, joinHtml(lures.map((item) => (
    html`<option value="${item}" ${item === activeStatsFilters.lure ? "selected" : ""}>${item}</option>`
  )), ""));

  const flashers = ["All flashers", ...state.flashers.map((flasher) => flasher.name).filter(Boolean)];
  if (!flashers.includes(activeStatsFilters.flasher)) activeStatsFilters.flasher = "All flashers";
  setHtml(els.statsFlasherFilter, joinHtml(flashers.map((item) => (
    html`<option value="${item}" ${item === activeStatsFilters.flasher ? "selected" : ""}>${item}</option>`
  )), ""));

  const clarity = ["All clarity", ...optionLabels("waterClarities")];
  if (!clarity.includes(activeStatsFilters.waterClarity)) activeStatsFilters.waterClarity = "All clarity";
  setHtml(els.statsWaterClarityFilter, joinHtml(clarity.map((item) => (
    html`<option value="${item}" ${item === activeStatsFilters.waterClarity ? "selected" : ""}>${item}</option>`
  )), ""));

  const weather = ["All weather", ...optionLabels("weatherTypes")];
  if (!weather.includes(activeStatsFilters.weather)) activeStatsFilters.weather = "All weather";
  setHtml(els.statsWeatherFilter, joinHtml(weather.map((item) => (
    html`<option value="${item}" ${item === activeStatsFilters.weather ? "selected" : ""}>${item}</option>`
  )), ""));

  const months = ["All months", ...new Set(state.trips.map((trip) => tripMonthName(trip)).filter(Boolean))];
  if (!months.includes(activeStatsFilters.month)) activeStatsFilters.month = "All months";
  setHtml(els.statsMonthFilter, joinHtml(months.map((item) => (
    html`<option value="${item}" ${item === activeStatsFilters.month ? "selected" : ""}>${item}</option>`
  )), ""));

  const ratings = ["All ratings", "Bad", "Mediocre", "Good", "Outstanding"];
  if (!ratings.includes(activeStatsFilters.rating)) activeStatsFilters.rating = "All ratings";
  setHtml(els.statsRatingFilter, joinHtml(ratings.map((item) => (
    html`<option value="${item}" ${item === activeStatsFilters.rating ? "selected" : ""}>${item}</option>`
  )), ""));
}

export function filteredTrips() {
  const query = els.searchInput.value.trim().toLowerCase();
  const target = els.targetFilter.value;
  const method = els.methodFilter.value;
  const year = els.yearFilter.value;

  const trips = state.trips.filter((trip) => {
    const haystack = [
      trip.title,
      trip.location,
      trip.launch,
      trip.targetSpecies,
      trip.method,
      trip.intent,
      tripRatingLabel(tripRatingValue(trip)),
      trip.waterClarity,
      ...(trip.people || []).map((person) => person.name),
      trip.notes,
      trip.weather,
      trip.structure,
      trip.structureType,
      ...(trip.catches || []).flatMap((catchItem) => {
        const record = resolveTripLineRecord({ ...catchItem, trip });
        return [record.species, record.notes, lureName(record.lureId), flasherName(record.flasherId)];
      }),
      ...(trip.lostFish || []).flatMap((fish) => {
        const record = resolveTripLineRecord({ ...fish, trip });
        return [record.possibleSpecies, record.species, record.notes, lureName(record.lureId), flasherName(record.flasherId)];
      })
    ].join(" ").toLowerCase();

    const matchesQuery = !query || haystack.includes(query);
    const matchesTarget = target === "All targets" || trip.targetSpecies === target;
    const matchesMethod = method === "All methods" || trip.method === method;
    const matchesYear = year === "All years" || String(new Date(`${trip.date}T12:00:00`).getFullYear()) === year;
    return matchesQuery && matchesTarget && matchesMethod && matchesYear;
  });

  return trips.sort(compareTripsByActiveSort);
}

export function textTripSortValue(trip, key) {
  const values = {
    location: trip.location,
    launch: trip.launch,
    title: trip.title,
    method: trip.method,
    target: trip.targetSpecies
  };
  return String(values[key] || "").toLowerCase();
}

export function compareTripText(a, b, key, direction) {
  const result = textTripSortValue(a, key).localeCompare(textTripSortValue(b, key));
  return (direction === "desc" ? -result : result) || compareTripsByDateTime(a, b, "desc");
}

export function compareTripNumber(a, b, getValue, direction) {
  const result = Number(getValue(a)) - Number(getValue(b));
  return (direction === "desc" ? -result : result) || compareTripsByDateTime(a, b, "desc");
}

export function compareTripsByActiveSort(a, b) {
  const sort = ui.activeTripSort || { key: "date", direction: "desc" };
  switch (sort.key) {
    case "location":
    case "launch":
    case "title":
    case "method":
    case "target":
      return compareTripText(a, b, sort.key, sort.direction);
    case "date":
      return compareTripsByDateTime(a, b, sort.direction);
    case "hours":
      return compareTripNumber(a, b, tripHours, sort.direction);
    case "caught":
      return compareTripNumber(a, b, totalCaught, sort.direction);
    case "catchRate":
      return compareTripNumber(a, b, catchRate, sort.direction);
    default:
      return compareTripsByDateTime(a, b, "desc");
  }
}

export function tripSortFromSelect(value) {
  const sorts = {
    "date-desc": { key: "date", direction: "desc" },
    "date-asc": { key: "date", direction: "asc" },
    "catch-rate-desc": { key: "catchRate", direction: "desc" },
    "caught-desc": { key: "caught", direction: "desc" },
    "hours-desc": { key: "hours", direction: "desc" }
  };
  return sorts[value] || sorts["date-desc"];
}

export function tripSortSelectValue(sort = ui.activeTripSort) {
  const key = `${sort?.key || "date"}-${sort?.direction || "desc"}`;
  const values = {
    "date-desc": "date-desc",
    "date-asc": "date-asc",
    "catchRate-desc": "catch-rate-desc",
    "caught-desc": "caught-desc",
    "hours-desc": "hours-desc"
  };
  return values[key] || "custom";
}

export function tripHeaderSortButton(key, label) {
  const active = ui.activeTripSort?.key === key;
  const direction = ui.activeTripSort?.direction === "asc" ? "asc" : "desc";
  const ariaSort = active ? (direction === "asc" ? "ascending" : "descending") : "none";
  return html`<button class="table-sort-button${active ? " is-active" : ""}" type="button" data-trip-sort="${key}" aria-sort="${ariaSort}">${label}${active ? html`<span>${direction === "desc" ? "↓" : "↑"}</span>` : ""}</button>`;
}

export function renderTrips() {
  const trips = filteredTrips();
  const sortValue = tripSortSelectValue();
  els.sortSelect.value = sortValue;
  setHtml(els.tripTable, html`
    <div class="table-row header">
      ${tripHeaderSortButton("date", "Date")}
      ${tripHeaderSortButton("location", "Location")}
      ${tripHeaderSortButton("title", "Title")}
      ${tripHeaderSortButton("target", "Target")}
      ${tripHeaderSortButton("method", "Method")}
      ${tripHeaderSortButton("hours", "Hours")}
      ${tripHeaderSortButton("caught", "Fish")}
      ${tripHeaderSortButton("catchRate", "Rate")}
    </div>
  `);

  trips.forEach((trip) => {
    const row = document.createElement("div");
    row.className = `table-row${trip.isDraft ? " is-draft" : ""}`;
    row.dataset.viewTrip = trip.id;
    setHtml(row, html`
      <span>${formatDate(trip.date)}</span>
      <span class="trip-location-cell">
        <button class="location-link" type="button">${trip.location}</button>
        ${trip.launch ? html`<small>${trip.launch}</small>` : ""}
      </span>
      <span>${trip.title || ""}</span>
      <span class="trip-pill-stack">
        <span class="trip-target-text">${trip.targetSpecies}</span>
        ${tripIntent(trip) === "experimental" ? html`<span class="intent-pill experimental">Experimental</span>` : ""}
        <span class="rating-pill ${tripRatingClass(tripRatingValue(trip))}">${tripRatingLabel(tripRatingValue(trip))}</span>
      </span>
      <span class="method-pill">${trip.method || "Unknown"}</span>
      <span>${trimNumber(tripHours(trip))}</span>
      <span>${totalCaught(trip)}</span>
      <span>${trimNumber(catchRate(trip))}</span>
    `);
    els.tripTable.append(row);
  });

  els.emptyState.classList.toggle("hidden", trips.length > 0);
}

export function renderSelectOptions() {
  populateLocationSelect();
  populateTripExpeditionSelect();
  populateDatalist(els.personOptions, state.people.map((person) => person.name).filter(Boolean));
  populateOptionSelect(document.querySelector("#targetSpecies"), state.species, "Select target species");
  populateOptionSelect(document.querySelector("#method"), state.methods, "Select method");
  populateOptionSelect(document.querySelector("#waterClarity"), optionLabels("waterClarities"), "Select water clarity");
  populateOptionSelect(document.querySelector("#weather"), optionLabels("weatherTypes"), "Select weather");
  populateOptionSelect(document.querySelector("#lureType"), state.lureTypes, "Select lure type");
  populateOptionSelect(document.querySelector("#flasherType"), state.flasherTypes, "Select flasher type");
  populateOptionSelect(document.querySelector("#lureBladeType"), optionLabels("lureBladeTypes"), "Select blade type");
  populateOptionSelect(document.querySelector("#lureSpoonSize"), optionLabels("lureSpoonSizes"), "Select spoon size");
  populateOptionSelect(document.querySelector("#lureMeatRigType"), optionLabels("meatRigTypes"), "Select meat rig type");
  document.querySelectorAll(".catch-species").forEach((select) => populateOptionSelect(select, state.species, "Select species"));
  document.querySelectorAll(".catch-possible-species").forEach((select) => populateOptionSelect(select, state.species, "Select possible species"));
  document.querySelectorAll(".catch-presentation").forEach((select) => populateChoiceSelect(select, optionChoices("trollingPresentations"), "Select method"));
  document.querySelectorAll(".catch-direction").forEach((select) => populateOptionSelect(select, optionLabels("trollingDirections"), "Select direction"));
  document.querySelectorAll(".trip-gear-side").forEach((select) => populateChoiceSelect(select, optionChoices("setupLineSides"), "Select side"));
}

export function populateDatalist(datalist, options) {
  if (!datalist) return;
  setHtml(datalist, joinHtml(options.map((item) => html`<option value="${item}"></option>`), ""));
}

export function populateOptionSelect(select, options, placeholder) {
  if (!select) return;
  const current = select.value;
  const normalizedOptions = options.includes(current) || !current ? options : [...options, current];
  setHtml(select, html`<option value="">${placeholder}</option>${joinHtml(normalizedOptions.map((item) => (
    html`<option value="${item}" ${item === current ? "selected" : ""}>${item}</option>`
  )), "")}`);
}

export function populateChoiceSelect(select, options, placeholder, selectedValue = "") {
  if (!select) return;
  const current = selectedValue || select.value;
  const normalizedOptions = options.some((item) => item.value === current) || !current
    ? options
    : [...options, { value: current, label: current }];
  setHtml(select, html`<option value="">${placeholder}</option>${joinHtml(normalizedOptions.map((item) => (
    html`<option value="${item.value}" ${item.value === current ? "selected" : ""}>${item.label}</option>`
  )), "")}`);
}

export function renderAll() {
  renderSelectOptions();
  renderFilters();
  renderStatsMethodFilter();
  renderBrandSpotlight();
  renderStats();
  renderTrips();
  renderExpeditions();
  renderPersonalBests();
  renderAdvancedStats();
  renderGearLibrary();
  syncUnitLabels();
  updateAllRowSummaries();
}
