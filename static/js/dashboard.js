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

function tripStartMinutes(trip) {
  const match = String(trip?.startTime || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return (Number(match[1]) * 60) + Number(match[2]);
}

function compareTripsByDateTime(a, b, direction = "desc") {
  const dateCompare = String(a.date || "").localeCompare(String(b.date || ""));
  if (dateCompare) return direction === "asc" ? dateCompare : -dateCompare;

  const aStart = tripStartMinutes(a);
  const bStart = tripStartMinutes(b);
  if (aStart === null && bStart === null) return 0;
  if (aStart === null) return 1;
  if (bStart === null) return -1;
  return direction === "asc" ? aStart - bStart : bStart - aStart;
}

function dateKeyToDayNumber(dateKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey || "")) return null;
  const [year, month, day] = dateKey.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

function todayDayNumber() {
  const today = new Date();
  return Math.floor(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) / 86400000);
}

function uniqueSortedTripDays(trips) {
  return [...new Set(trips.map((trip) => trip.date).filter((date) => dateKeyToDayNumber(date) !== null))]
    .map((date) => dateKeyToDayNumber(date))
    .sort((a, b) => a - b);
}

function longestConsecutiveRun(dayNumbers) {
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

function fishingDateMetrics(trips, hasCatch = (trip) => totalCaught(trip) > 0) {
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
  const allCatches = state.trips.flatMap((trip) => (trip.catches || []).map((catchItem) => resolveTripLineRecord({ ...catchItem, trip })));
  const fish = state.trips.reduce((sum, trip) => sum + totalCaught(trip), 0);
  const hours = state.trips.reduce((sum, trip) => sum + tripHours(trip), 0);
  const pounds = state.trips.reduce((sum, trip) => sum + totalWeight(trip), 0);
  const waterbodies = new Set(state.trips.map((trip) => trip.location).filter(Boolean));
  const dateMetrics = fishingDateMetrics(state.trips);

  els.statTrips.textContent = state.trips.length;
  els.statFish.textContent = fish;
  els.statHours.textContent = trimNumber(hours);
  els.statWaterbodies.textContent = waterbodies.size;
  els.statCatchRate.textContent = hours ? trimNumber(fish / hours) : "0";
  els.statPoundsPerHour.textContent = hours ? trimNumber(pounds / hours) : "0";
  els.statDaysSinceTrip.textContent = dateMetrics.daysSinceLastTrip ?? "-";

  const speciesCounts = countBy(allCatches, (item) => item.species, fishCount);
  const lureCounts = countBy(allCatches, (item) => lureName(item.lureId), fishCount);
  renderBars(els.speciesBars, topEntries(speciesCounts));
  renderBars(els.lureBars, topEntries(lureCounts));
}

function renderBrandSpotlight() {
  if (brandSpotlightTimer) {
    clearInterval(brandSpotlightTimer);
    brandSpotlightTimer = null;
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
        spotlightTitle: photo.caption || tripTitle,
        date: trip.date
      }));
      const catchPhotos = (trip.catches || []).flatMap((catchItem) => (catchItem.photos || []).map((photo) => ({
        ...photo,
        tripTitle,
        spotlightTitle: catchItem.species || "Fish photo",
        date: trip.date
      })));
      return [...notePhotos, ...catchPhotos];
    })
    .filter((photo) => photo.image && !isVideoMedia(photo)));

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
        <figure class="spotlight-slide ${index === 0 ? "is-active" : ""}">
          ${mediaMarkup(photo)}
          <figcaption>
            <strong>${escapeHtml(photo.spotlightTitle || photo.caption || photo.tripTitle)}</strong>
            <span>${escapeHtml(photo.tripTitle)}</span>
          </figcaption>
        </figure>
      `).join("")}
    </div>
  `;

  if (photos.length < 2) return;

  let activeIndex = 0;
  const slides = [...els.brandSpotlight.querySelectorAll(".spotlight-slide")];
  brandSpotlightTimer = setInterval(() => {
    slides[activeIndex]?.classList.remove("is-active");
    activeIndex = (activeIndex + 1) % slides.length;
    slides[activeIndex]?.classList.add("is-active");
  }, 4200);
}

function renderFilters() {
  const targets = ["All targets", ...new Set(state.trips.map((trip) => trip.targetSpecies).filter(Boolean))];
  const selectedTarget = els.targetFilter.value || "All targets";
  els.targetFilter.innerHTML = targets.map((target) => `<option ${target === selectedTarget ? "selected" : ""}>${escapeHtml(target)}</option>`).join("");

  const methods = ["All methods", ...new Set([...state.methods, ...state.trips.map((trip) => trip.method)].filter(Boolean))];
  const selectedMethod = methods.includes(els.methodFilter.value) ? els.methodFilter.value : "All methods";
  els.methodFilter.innerHTML = methods.map((method) => `<option ${method === selectedMethod ? "selected" : ""}>${escapeHtml(method)}</option>`).join("");

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

  const species = ["All species", ...new Set([...state.species, ...state.trips.flatMap((trip) => [
    ...(trip.catches || []).map((catchItem) => catchItem.species),
    ...(trip.lostFish || []).map((fish) => fish.possibleSpecies || fish.species)
  ])].filter(Boolean))];
  if (!species.includes(activeStatsFilters.species)) activeStatsFilters.species = "All species";
  els.statsSpeciesFilter.innerHTML = species.map((item) => (
    `<option value="${escapeHtml(item)}" ${item === activeStatsFilters.species ? "selected" : ""}>${escapeHtml(item)}</option>`
  )).join("");

  const people = ["All people", ...mergePeople(
    state.people,
    state.trips.flatMap((trip) => trip.people || [])
  ).map((person) => person.name)];
  if (!people.includes(activeStatsFilters.person)) activeStatsFilters.person = "All people";
  els.statsPersonFilter.innerHTML = people.map((item) => (
    `<option value="${escapeHtml(item)}" ${item === activeStatsFilters.person ? "selected" : ""}>${escapeHtml(item)}</option>`
  )).join("");

  const locations = ["All locations", ...new Set([...locationNames(), ...state.trips.map((trip) => trip.location)].filter(Boolean))];
  if (!locations.includes(activeStatsFilters.location)) activeStatsFilters.location = "All locations";
  els.statsLocationFilter.innerHTML = locations.map((item) => (
    `<option value="${escapeHtml(item)}" ${item === activeStatsFilters.location ? "selected" : ""}>${escapeHtml(item)}</option>`
  )).join("");

  const lures = ["All lures", ...state.lures.map((lure) => lure.name).filter(Boolean)];
  if (!lures.includes(activeStatsFilters.lure)) activeStatsFilters.lure = "All lures";
  els.statsLureFilter.innerHTML = lures.map((item) => (
    `<option value="${escapeHtml(item)}" ${item === activeStatsFilters.lure ? "selected" : ""}>${escapeHtml(item)}</option>`
  )).join("");

  const flashers = ["All flashers", ...state.flashers.map((flasher) => flasher.name).filter(Boolean)];
  if (!flashers.includes(activeStatsFilters.flasher)) activeStatsFilters.flasher = "All flashers";
  els.statsFlasherFilter.innerHTML = flashers.map((item) => (
    `<option value="${escapeHtml(item)}" ${item === activeStatsFilters.flasher ? "selected" : ""}>${escapeHtml(item)}</option>`
  )).join("");

  const clarity = ["All clarity", ...optionLabels("waterClarities")];
  if (!clarity.includes(activeStatsFilters.waterClarity)) activeStatsFilters.waterClarity = "All clarity";
  els.statsWaterClarityFilter.innerHTML = clarity.map((item) => (
    `<option value="${escapeHtml(item)}" ${item === activeStatsFilters.waterClarity ? "selected" : ""}>${escapeHtml(item)}</option>`
  )).join("");

  const weather = ["All weather", ...optionLabels("weatherTypes")];
  if (!weather.includes(activeStatsFilters.weather)) activeStatsFilters.weather = "All weather";
  els.statsWeatherFilter.innerHTML = weather.map((item) => (
    `<option value="${escapeHtml(item)}" ${item === activeStatsFilters.weather ? "selected" : ""}>${escapeHtml(item)}</option>`
  )).join("");

  const months = ["All months", ...new Set(state.trips.map((trip) => tripMonthName(trip)).filter(Boolean))];
  if (!months.includes(activeStatsFilters.month)) activeStatsFilters.month = "All months";
  els.statsMonthFilter.innerHTML = months.map((item) => (
    `<option value="${escapeHtml(item)}" ${item === activeStatsFilters.month ? "selected" : ""}>${escapeHtml(item)}</option>`
  )).join("");

  const ratings = ["All ratings", "Bad", "Mediocre", "Good", "Outstanding"];
  if (!ratings.includes(activeStatsFilters.rating)) activeStatsFilters.rating = "All ratings";
  els.statsRatingFilter.innerHTML = ratings.map((item) => (
    `<option value="${escapeHtml(item)}" ${item === activeStatsFilters.rating ? "selected" : ""}>${escapeHtml(item)}</option>`
  )).join("");
}

function filteredTrips() {
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

function textTripSortValue(trip, key) {
  const values = {
    location: trip.location,
    launch: trip.launch,
    title: trip.title,
    method: trip.method,
    target: trip.targetSpecies
  };
  return String(values[key] || "").toLowerCase();
}

function compareTripText(a, b, key, direction) {
  const result = textTripSortValue(a, key).localeCompare(textTripSortValue(b, key));
  return (direction === "desc" ? -result : result) || compareTripsByDateTime(a, b, "desc");
}

function compareTripNumber(a, b, getValue, direction) {
  const result = Number(getValue(a)) - Number(getValue(b));
  return (direction === "desc" ? -result : result) || compareTripsByDateTime(a, b, "desc");
}

function compareTripsByActiveSort(a, b) {
  const sort = activeTripSort || { key: "date", direction: "desc" };
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

function tripSortFromSelect(value) {
  const sorts = {
    "date-desc": { key: "date", direction: "desc" },
    "date-asc": { key: "date", direction: "asc" },
    "catch-rate-desc": { key: "catchRate", direction: "desc" },
    "caught-desc": { key: "caught", direction: "desc" },
    "hours-desc": { key: "hours", direction: "desc" }
  };
  return sorts[value] || sorts["date-desc"];
}

function tripSortSelectValue(sort = activeTripSort) {
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

function tripHeaderSortButton(key, label) {
  const active = activeTripSort?.key === key;
  const direction = activeTripSort?.direction === "asc" ? "asc" : "desc";
  const ariaSort = active ? (direction === "asc" ? "ascending" : "descending") : "none";
  return `<button class="table-sort-button${active ? " is-active" : ""}" type="button" data-trip-sort="${escapeHtml(key)}" aria-sort="${ariaSort}">${escapeHtml(label)}${active ? `<span>${direction === "desc" ? "↓" : "↑"}</span>` : ""}</button>`;
}

function renderTrips() {
  const trips = filteredTrips();
  const sortValue = tripSortSelectValue();
  els.sortSelect.value = sortValue;
  els.tripTable.innerHTML = `
    <div class="table-row header">
      ${tripHeaderSortButton("date", "Date")}
      ${tripHeaderSortButton("location", "Location")}
      ${tripHeaderSortButton("launch", "Launch")}
      ${tripHeaderSortButton("title", "Title")}
      ${tripHeaderSortButton("target", "Target")}
      ${tripHeaderSortButton("method", "Method")}
      ${tripHeaderSortButton("hours", "Hours")}
      ${tripHeaderSortButton("caught", "Fish")}
      ${tripHeaderSortButton("catchRate", "Rate")}
    </div>
  `;

  trips.forEach((trip) => {
    const row = document.createElement("div");
    row.className = "table-row";
    row.dataset.viewTrip = trip.id;
    row.innerHTML = `
      <span>${formatDate(trip.date)}</span>
      <button class="location-link" type="button">
        ${escapeHtml(trip.location)}
      </button>
      <span>${escapeHtml(trip.launch || "")}</span>
      <span>${escapeHtml(trip.title || "")}</span>
      <span class="trip-pill-stack">
        <span class="target-pill">${escapeHtml(trip.targetSpecies)}</span>
        <span class="intent-pill ${tripIntent(trip) === "experimental" ? "experimental" : ""}">${escapeHtml(intentLabel(tripIntent(trip)))}</span>
        <span class="rating-pill ${escapeHtml(tripRatingClass(tripRatingValue(trip)))}">${escapeHtml(tripRatingLabel(tripRatingValue(trip)))}</span>
      </span>
      <span class="method-pill">${escapeHtml(trip.method || "Unknown")}</span>
      <span>${trimNumber(tripHours(trip))}</span>
      <span>${totalCaught(trip)}</span>
      <span>${trimNumber(catchRate(trip))}</span>
    `;
    els.tripTable.append(row);
  });

  els.emptyState.classList.toggle("hidden", trips.length > 0);
}

function renderSelectOptions() {
  populateLocationSelect();
  populateDatalist(els.personOptions, state.people.map((person) => person.name).filter(Boolean));
  populateOptionSelect(document.querySelector("#targetSpecies"), state.species, "Select target species");
  populateOptionSelect(document.querySelector("#method"), state.methods, "Select method");
  populateOptionSelect(document.querySelector("#waterClarity"), optionLabels("waterClarities"), "Select water clarity");
  populateOptionSelect(document.querySelector("#weather"), optionLabels("weatherTypes"), "Select weather");
  populateOptionSelect(document.querySelector("#lureType"), state.lureTypes, "Select lure type");
  populateOptionSelect(document.querySelector("#flasherType"), state.flasherTypes, "Select flasher type");
  document.querySelectorAll(".catch-species").forEach((select) => populateOptionSelect(select, state.species, "Select species"));
  document.querySelectorAll(".catch-possible-species").forEach((select) => populateOptionSelect(select, state.species, "Select possible species"));
  document.querySelectorAll(".catch-presentation").forEach((select) => populateChoiceSelect(select, optionChoices("trollingPresentations"), "Select method"));
  document.querySelectorAll(".catch-direction").forEach((select) => populateOptionSelect(select, optionLabels("trollingDirections"), "Select direction"));
  document.querySelectorAll(".trip-gear-side").forEach((select) => populateChoiceSelect(select, optionChoices("setupLineSides"), "Select side"));
}

function populateDatalist(datalist, options) {
  if (!datalist) return;
  datalist.innerHTML = options.map((item) => `<option value="${escapeHtml(item)}"></option>`).join("");
}

function populateOptionSelect(select, options, placeholder) {
  if (!select) return;
  const current = select.value;
  const normalizedOptions = options.includes(current) || !current ? options : [...options, current];
  select.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>` + normalizedOptions.map((item) => (
    `<option value="${escapeHtml(item)}" ${item === current ? "selected" : ""}>${escapeHtml(item)}</option>`
  )).join("");
}

function populateChoiceSelect(select, options, placeholder, selectedValue = "") {
  if (!select) return;
  const current = selectedValue || select.value;
  const normalizedOptions = options.some((item) => item.value === current) || !current
    ? options
    : [...options, { value: current, label: current }];
  select.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>` + normalizedOptions.map((item) => (
    `<option value="${escapeHtml(item.value)}" ${item.value === current ? "selected" : ""}>${escapeHtml(item.label)}</option>`
  )).join("");
}

function renderAll() {
  renderSelectOptions();
  renderFilters();
  renderStatsMethodFilter();
  renderBrandSpotlight();
  renderStats();
  renderTrips();
  renderPersonalBests();
  renderAdvancedStats();
  renderGearLibrary();
  syncUnitLabels();
  updateAllRowSummaries();
}
