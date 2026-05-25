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
  const randomSort = () => Math.random() - 0.5;
  const photos = state.trips
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
    .filter((photo) => photo.image && !isVideoMedia(photo))
    .sort(randomSort)
    .slice(0, 8);

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
          ${mediaMarkup(photo)}
          <figcaption>
            <strong>${escapeHtml(photo.spotlightTitle || photo.caption || photo.tripTitle)}</strong>
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

  const locations = ["All locations", ...new Set([...state.locations, ...state.trips.map((trip) => trip.location)].filter(Boolean))];
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

  const clarity = ["All clarity", ...waterClarityOptions];
  if (!clarity.includes(activeStatsFilters.waterClarity)) activeStatsFilters.waterClarity = "All clarity";
  els.statsWaterClarityFilter.innerHTML = clarity.map((item) => (
    `<option value="${escapeHtml(item)}" ${item === activeStatsFilters.waterClarity ? "selected" : ""}>${escapeHtml(item)}</option>`
  )).join("");

  const weather = ["All weather", ...weatherOptions];
  if (!weather.includes(activeStatsFilters.weather)) activeStatsFilters.weather = "All weather";
  els.statsWeatherFilter.innerHTML = weather.map((item) => (
    `<option value="${escapeHtml(item)}" ${item === activeStatsFilters.weather ? "selected" : ""}>${escapeHtml(item)}</option>`
  )).join("");

  const months = ["All months", ...new Set(state.trips.map((trip) => tripMonthName(trip)).filter(Boolean))];
  if (!months.includes(activeStatsFilters.month)) activeStatsFilters.month = "All months";
  els.statsMonthFilter.innerHTML = months.map((item) => (
    `<option value="${escapeHtml(item)}" ${item === activeStatsFilters.month ? "selected" : ""}>${escapeHtml(item)}</option>`
  )).join("");

  const ratings = ["All ratings", "Bad", "Good", "Outstanding"];
  if (!ratings.includes(activeStatsFilters.rating)) activeStatsFilters.rating = "All ratings";
  els.statsRatingFilter.innerHTML = ratings.map((item) => (
    `<option value="${escapeHtml(item)}" ${item === activeStatsFilters.rating ? "selected" : ""}>${escapeHtml(item)}</option>`
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
    const matchesYear = year === "All years" || String(new Date(`${trip.date}T12:00:00`).getFullYear()) === year;
    return matchesQuery && matchesTarget && matchesYear;
  });

  return trips.sort((a, b) => {
    switch (els.sortSelect.value) {
      case "date-asc":
        return compareTripsByDateTime(a, b, "asc");
      case "catch-rate-desc":
        return catchRate(b) - catchRate(a) || compareTripsByDateTime(a, b, "desc");
      case "caught-desc":
        return totalCaught(b) - totalCaught(a) || compareTripsByDateTime(a, b, "desc");
      case "hours-desc":
        return tripHours(b) - tripHours(a) || compareTripsByDateTime(a, b, "desc");
      default:
        return compareTripsByDateTime(a, b, "desc");
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
      <button class="location-link" type="button" data-view-trip="${trip.id}">
        ${escapeHtml(trip.location)}
      </button>
      <span>${escapeHtml(trip.title || "")}</span>
      <span>${formatDate(trip.date)}</span>
      <span>${trimNumber(tripHours(trip))}</span>
      <span>${totalCaught(trip)}</span>
      <span>${trimNumber(catchRate(trip))}</span>
      <span class="trip-pill-stack">
        <span class="target-pill">${escapeHtml(trip.targetSpecies)}</span>
        <span class="intent-pill ${tripIntent(trip) === "experimental" ? "experimental" : ""}">${escapeHtml(intentLabel(tripIntent(trip)))}</span>
        <span class="rating-pill ${escapeHtml(tripRatingClass(tripRatingValue(trip)))}">${escapeHtml(tripRatingLabel(tripRatingValue(trip)))}</span>
      </span>
      <button class="row-button" type="button" data-view-trip="${trip.id}" aria-label="Open trip">&gt;</button>
    `;
    els.tripTable.append(row);
  });

  els.emptyState.classList.toggle("hidden", trips.length > 0);
}

function renderSelectOptions() {
  populateDatalist(document.querySelector("#locationOptions"), state.locations);
  populateDatalist(els.personOptions, state.people.map((person) => person.name).filter(Boolean));
  populateOptionSelect(document.querySelector("#targetSpecies"), state.species, "Select target species");
  populateOptionSelect(document.querySelector("#method"), state.methods, "Select method");
  populateOptionSelect(document.querySelector("#waterClarity"), waterClarityOptions, "Select water clarity");
  populateOptionSelect(document.querySelector("#weather"), weatherOptions, "Select weather");
  populateOptionSelect(document.querySelector("#lureType"), state.lureTypes, "Select lure type");
  populateOptionSelect(document.querySelector("#flasherType"), state.flasherTypes, "Select flasher type");
  document.querySelectorAll(".catch-species").forEach((select) => populateOptionSelect(select, state.species, "Select species"));
  document.querySelectorAll(".catch-possible-species").forEach((select) => populateOptionSelect(select, state.species, "Select possible species"));
}

function populateDatalist(datalist, options) {
  if (!datalist) return;
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
  renderPatterns();
  renderGearLibrary();
  updateAllRowSummaries();
}
