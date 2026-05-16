function patternMonthName(trip) {
  return tripMonthName(trip);
}

function patternSpeciesOptions() {
  const species = new Set();
  state.trips.forEach((trip) => {
    (trip.catches || []).forEach((catchItem) => {
      if (catchItem.species) species.add(catchItem.species);
    });
    if (trip.targetSpecies) species.add(trip.targetSpecies);
  });
  state.species.forEach((item) => species.add(item));
  return ["All species", ...species];
}

function patternOptions(label, values) {
  return [label, ...new Set(values.filter(Boolean))];
}

function selectedPatternSpecies(options) {
  if (activePatternFilters.species && options.includes(activePatternFilters.species)) {
    return activePatternFilters.species;
  }
  return options.find((option) => option !== "All species") || "All species";
}

function renderPatternFilter(select, options, selected) {
  select.innerHTML = options.map((option) => (
    `<option value="${escapeHtml(option)}" ${option === selected ? "selected" : ""}>${escapeHtml(option)}</option>`
  )).join("");
}

function renderPatternFilters() {
  const speciesOptions = patternSpeciesOptions();
  activePatternFilters.species = selectedPatternSpecies(speciesOptions);
  renderPatternFilter(els.patternSpeciesFilter, speciesOptions, activePatternFilters.species);

  const locationOptions = patternOptions("All locations", [...state.locations, ...state.trips.map((trip) => trip.location)]);
  if (!locationOptions.includes(activePatternFilters.location)) activePatternFilters.location = "All locations";
  renderPatternFilter(els.patternLocationFilter, locationOptions, activePatternFilters.location);

  const methodOptions = patternOptions("All methods", [...state.methods, ...state.trips.map((trip) => trip.method)]);
  if (!methodOptions.includes(activePatternFilters.method)) activePatternFilters.method = "All methods";
  renderPatternFilter(els.patternMethodFilter, methodOptions, activePatternFilters.method);

  const monthOptions = patternOptions("All months", state.trips.map(patternMonthName));
  if (!monthOptions.includes(activePatternFilters.month)) activePatternFilters.month = "All months";
  renderPatternFilter(els.patternMonthFilter, monthOptions, activePatternFilters.month);

  const clarityOptions = ["All clarity", ...waterClarityOptions];
  if (!clarityOptions.includes(activePatternFilters.waterClarity)) activePatternFilters.waterClarity = "All clarity";
  renderPatternFilter(els.patternWaterClarityFilter, clarityOptions, activePatternFilters.waterClarity);

  const weatherChoices = ["All weather", ...weatherOptions];
  if (!weatherChoices.includes(activePatternFilters.weather)) activePatternFilters.weather = "All weather";
  renderPatternFilter(els.patternWeatherFilter, weatherChoices, activePatternFilters.weather);
}

function patternTripMatches(trip) {
  return (
    (activePatternFilters.location === "All locations" || trip.location === activePatternFilters.location)
    && (activePatternFilters.method === "All methods" || trip.method === activePatternFilters.method)
    && (activePatternFilters.month === "All months" || patternMonthName(trip) === activePatternFilters.month)
    && (activePatternFilters.waterClarity === "All clarity" || trip.waterClarity === activePatternFilters.waterClarity)
    && (activePatternFilters.weather === "All weather" || trip.weather === activePatternFilters.weather)
  );
}

function patternSpeciesMatches(record) {
  return activePatternFilters.species === "All species" || record.species === activePatternFilters.species;
}

function patternCatchRecords() {
  return state.trips
    .filter(patternTripMatches)
    .flatMap((trip) => (trip.catches || []).map((catchItem) => ({ ...catchItem, trip })))
    .filter((record) => record.species && patternSpeciesMatches(record));
}

function patternLostRecords() {
  return state.trips
    .filter(patternTripMatches)
    .flatMap((trip) => (trip.lostFish || []).map((fish) => ({ ...fish, trip })))
    .filter((record) => {
      const species = record.possibleSpecies || record.species;
      return activePatternFilters.species === "All species" || species === activePatternFilters.species;
    });
}

function patternDepthRange(value) {
  const depth = parseFirstNumber(value);
  if (!depth) return "";
  const start = Math.floor(depth / 10) * 10;
  return `${start}-${start + 10} ft down`;
}

function patternTimeBucket(value) {
  return timeBucket(value);
}

function patternKey(record) {
  return [
    record.species || "Unknown",
    record.lureId || "",
    record.flasherId || "",
    record.presentation || "",
    fowRange(record.fowCaught),
    patternDepthRange(record.depthDown || record.estimatedDepth),
    speedBucket(record.speed),
    patternTimeBucket(record.time),
    record.trip.waterClarity || "",
    record.trip.weather || "",
    patternMonthName(record.trip)
  ].join("::");
}

function ensurePattern(map, record) {
  const key = patternKey(record);
  const current = map.get(key) || {
    species: record.species || "Unknown",
    lureId: record.lureId || "",
    flasherId: record.flasherId || "",
    presentation: record.presentation || "",
    fow: fowRange(record.fowCaught),
    depth: patternDepthRange(record.depthDown || record.estimatedDepth),
    speed: speedBucket(record.speed),
    time: patternTimeBucket(record.time),
    clarity: record.trip.waterClarity || "",
    weather: record.trip.weather || "",
    month: patternMonthName(record.trip),
    fish: 0,
    lost: 0,
    trips: new Map()
  };
  map.set(key, current);
  return current;
}

function lostFishMatchesPattern(fish, pattern) {
  const species = fish.possibleSpecies || fish.species;
  return species === pattern.species
    && (!pattern.lureId || fish.lureId === pattern.lureId)
    && (!pattern.flasherId || fish.flasherId === pattern.flasherId)
    && (!pattern.presentation || fish.presentation === pattern.presentation);
}

function buildPatterns(catches, lostRecords) {
  const map = new Map();
  catches.forEach((record) => {
    const pattern = ensurePattern(map, record);
    pattern.fish += fishCount(record);
    const tripEvidence = pattern.trips.get(record.trip.id) || {
      trip: record.trip,
      fish: 0
    };
    tripEvidence.fish += fishCount(record);
    pattern.trips.set(record.trip.id, tripEvidence);
  });

  const patterns = [...map.values()];
  patterns.forEach((pattern) => {
    pattern.lost = lostRecords.filter((fish) => lostFishMatchesPattern(fish, pattern)).length;
    pattern.tripCount = pattern.trips.size;
    pattern.fishPerTrip = pattern.tripCount ? pattern.fish / pattern.tripCount : 0;
    pattern.score = pattern.fishPerTrip * 10 + pattern.fish + pattern.tripCount * 1.5 - pattern.lost * 0.75;
  });

  return patterns.sort((a, b) => b.score - a.score || b.fish - a.fish || b.tripCount - a.tripCount).slice(0, 12);
}

function patternConfidence(pattern) {
  if (pattern.tripCount >= 4 && pattern.fish >= 8) return "High";
  if (pattern.tripCount >= 2 && pattern.fish >= 3) return "Medium";
  return "Low";
}

function patternConfidenceClass(pattern) {
  return patternConfidence(pattern).toLowerCase();
}

function patternDetailList(pattern) {
  return [
    lureName(pattern.lureId),
    flasherName(pattern.flasherId),
    presentationLabel(pattern.presentation),
    pattern.fow,
    pattern.depth,
    pattern.speed,
    pattern.time && pattern.time !== "No time" ? pattern.time : "",
    pattern.clarity,
    pattern.weather,
    pattern.month
  ].filter(Boolean);
}

function patternEvidence(pattern) {
  return [...pattern.trips.values()]
    .sort((a, b) => b.fish - a.fish || String(b.trip.date).localeCompare(String(a.trip.date)))
    .slice(0, 4)
    .map(({ trip, fish }) => `
      <button class="pattern-trip-link" type="button" data-view-trip="${trip.id}">
        <strong>${escapeHtml(trip.title || trip.location || "Trip")}</strong>
        <span>${escapeHtml([formatDate(trip.date), `${fish} fish`].filter(Boolean).join(" / "))}</span>
      </button>
    `).join("");
}

function renderPatternCards(patterns) {
  if (!patterns.length) {
    els.patternsGrid.innerHTML = `<div class="empty-state"><p>No matching patterns. Widen the filters.</p></div>`;
    return;
  }

  els.patternsGrid.innerHTML = patterns.map((pattern, index) => {
    const details = patternDetailList(pattern);
    const confidence = patternConfidence(pattern);
    return `
      <article class="pattern-card">
        <div class="pattern-card-header">
          <div>
            <span class="pattern-rank">Pattern ${index + 1}</span>
            <h4>${escapeHtml(pattern.species)}</h4>
          </div>
          <span class="confidence-pill ${patternConfidenceClass(pattern)}">${escapeHtml(confidence)} confidence</span>
        </div>
        <div class="pattern-recommendation">
          <strong>${escapeHtml([lureName(pattern.lureId), flasherName(pattern.flasherId)].filter(Boolean).join(" + ") || "No specific gear yet")}</strong>
          <span>${escapeHtml(details.join(" / ") || "Pattern needs more detail")}</span>
        </div>
        <div class="pattern-stats">
          <span><strong>${escapeHtml(pattern.fish)}</strong> fish</span>
          <span><strong>${escapeHtml(pattern.tripCount)}</strong> trips</span>
          <span><strong>${escapeHtml(pattern.lost)}</strong> lost</span>
          <span><strong>${escapeHtml(trimNumber(pattern.fishPerTrip))}</strong> fish/trip</span>
        </div>
        <div class="pattern-evidence">
          ${patternEvidence(pattern)}
        </div>
      </article>
    `;
  }).join("");
}

function renderPatternMetrics(catches, lostRecords, patterns) {
  const fish = catches.reduce((sum, record) => sum + fishCount(record), 0);
  const tripIds = new Set(catches.map((record) => record.trip.id));
  const topPattern = patterns[0];
  els.patternsMetricGrid.innerHTML = [
    ["Matching Fish", fish],
    ["Matching Trips", tripIds.size],
    ["Lost Fish", lostRecords.length],
    ["Top Pattern", topPattern ? `${trimNumber(topPattern.fishPerTrip)} fish/trip` : "0"]
  ].map(([label, value]) => `<article class="metric-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join("");
}

function renderPatterns() {
  renderPatternFilters();

  const allCatchCount = state.trips.reduce((sum, trip) => sum + (trip.catches || []).length, 0);
  if (!allCatchCount) {
    els.patternsSummary.textContent = "No catches logged";
    els.patternsMetricGrid.innerHTML = "";
    els.patternsGrid.innerHTML = `<div class="empty-state"><p>Log catches to discover patterns.</p></div>`;
    return;
  }

  const catches = patternCatchRecords();
  const lostRecords = patternLostRecords();
  const patterns = buildPatterns(catches, lostRecords);
  const patternText = patterns.length === 1 ? "1 pattern found" : `${patterns.length} patterns found`;
  els.patternsSummary.textContent = patternText;
  renderPatternMetrics(catches, lostRecords, patterns);
  renderPatternCards(patterns);
}
