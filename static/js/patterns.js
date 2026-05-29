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

  const locationOptions = patternOptions("All locations", [...locationNames(), ...state.trips.map((trip) => trip.location)]);
  if (!locationOptions.includes(activePatternFilters.location)) activePatternFilters.location = "All locations";
  renderPatternFilter(els.patternLocationFilter, locationOptions, activePatternFilters.location);

  const methodOptions = patternOptions("All methods", [...state.methods, ...state.trips.map((trip) => trip.method)]);
  if (!methodOptions.includes(activePatternFilters.method)) activePatternFilters.method = "All methods";
  renderPatternFilter(els.patternMethodFilter, methodOptions, activePatternFilters.method);

  const monthOptions = patternOptions("All months", state.trips.map(patternMonthName));
  if (!monthOptions.includes(activePatternFilters.month)) activePatternFilters.month = "All months";
  renderPatternFilter(els.patternMonthFilter, monthOptions, activePatternFilters.month);

  const clarityOptions = ["All clarity", ...optionLabels("waterClarities")];
  if (!clarityOptions.includes(activePatternFilters.waterClarity)) activePatternFilters.waterClarity = "All clarity";
  renderPatternFilter(els.patternWaterClarityFilter, clarityOptions, activePatternFilters.waterClarity);

  const weatherChoices = ["All weather", ...optionLabels("weatherTypes")];
  if (!weatherChoices.includes(activePatternFilters.weather)) activePatternFilters.weather = "All weather";
  renderPatternFilter(els.patternWeatherFilter, weatherChoices, activePatternFilters.weather);

  const records = state.trips.flatMap((trip) => (trip.catches || []).map((catchItem) => resolveTripLineRecord({ ...catchItem, trip })));
  const windOptions = patternOptions("All wind", records.map((record) => windDirectionLabel(weatherNumber(record, "windDirectionDegrees"))));
  if (!windOptions.includes(activePatternFilters.wind)) activePatternFilters.wind = "All wind";
  renderPatternFilter(els.patternWindFilter, windOptions, activePatternFilters.wind);

  const pressureOptions = patternOptions("All pressure", records.map((record) => pressureBucket(weatherNumber(record, "pressureHpa"))));
  if (!pressureOptions.includes(activePatternFilters.pressure)) activePatternFilters.pressure = "All pressure";
  renderPatternFilter(els.patternPressureFilter, pressureOptions, activePatternFilters.pressure);

  const cloudOptions = patternOptions("All cloud", records.map((record) => cloudCoverBucket(weatherNumber(record, "cloudCoverPercent"))));
  if (!cloudOptions.includes(activePatternFilters.cloud)) activePatternFilters.cloud = "All cloud";
  renderPatternFilter(els.patternCloudFilter, cloudOptions, activePatternFilters.cloud);

  const tempOptions = patternOptions("All air temp", records.map((record) => airTempBucket(weatherNumber(record, "temperatureC"))));
  if (!tempOptions.includes(activePatternFilters.airTemp)) activePatternFilters.airTemp = "All air temp";
  renderPatternFilter(els.patternAirTempFilter, tempOptions, activePatternFilters.airTemp);

  const frontOptions = patternOptions("All fronts", state.trips.map((trip) => trip.weatherData?.frontTag));
  if (!frontOptions.includes(activePatternFilters.front)) activePatternFilters.front = "All fronts";
  renderPatternFilter(els.patternFrontFilter, frontOptions, activePatternFilters.front);
}

function patternTripMatches(trip) {
  return (
    (activePatternFilters.location === "All locations" || trip.location === activePatternFilters.location)
    && (activePatternFilters.method === "All methods" || trip.method === activePatternFilters.method)
    && (activePatternFilters.month === "All months" || patternMonthName(trip) === activePatternFilters.month)
    && (activePatternFilters.waterClarity === "All clarity" || trip.waterClarity === activePatternFilters.waterClarity)
    && (activePatternFilters.weather === "All weather" || trip.weather === activePatternFilters.weather)
    && (activePatternFilters.front === "All fronts" || trip.weatherData?.frontTag === activePatternFilters.front)
  );
}

function patternSpeciesMatches(record) {
  return activePatternFilters.species === "All species" || record.species === activePatternFilters.species;
}

function patternWeatherFiltersMatch(record) {
  return (
    (activePatternFilters.wind === "All wind" || windDirectionLabel(weatherNumber(record, "windDirectionDegrees")) === activePatternFilters.wind)
    && (activePatternFilters.pressure === "All pressure" || pressureBucket(weatherNumber(record, "pressureHpa")) === activePatternFilters.pressure)
    && (activePatternFilters.cloud === "All cloud" || cloudCoverBucket(weatherNumber(record, "cloudCoverPercent")) === activePatternFilters.cloud)
    && (activePatternFilters.airTemp === "All air temp" || airTempBucket(weatherNumber(record, "temperatureC")) === activePatternFilters.airTemp)
  );
}

function patternCatchRecords() {
  return state.trips
    .filter(patternTripMatches)
    .flatMap((trip) => (trip.catches || []).map((catchItem) => resolveTripLineRecord({ ...catchItem, trip })))
    .filter((record) => record.species && patternSpeciesMatches(record) && patternWeatherFiltersMatch(record));
}

function patternLostRecords() {
  return state.trips
    .filter(patternTripMatches)
    .flatMap((trip) => (trip.lostFish || []).map((fish) => resolveTripLineRecord({ ...fish, trip })))
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

function patternWeatherPart(record) {
  return [
    windDirectionLabel(weatherNumber(record, "windDirectionDegrees")),
    windSpeedBucket(weatherNumber(record, "windSpeedMph")),
    pressureBucket(weatherNumber(record, "pressureHpa")),
    cloudCoverBucket(weatherNumber(record, "cloudCoverPercent")),
    airTempBucket(weatherNumber(record, "temperatureC"))
  ].filter(Boolean).join(" / ");
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
    patternWeatherPart(record),
    weatherText(record, "frontTag"),
    moonWindowForTime(record.time, record.trip?.weatherData?.sunMoon),
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
    apiWeather: patternWeatherPart(record),
    frontTag: weatherText(record, "frontTag"),
    moonWindow: moonWindowForTime(record.time, record.trip?.weatherData?.sunMoon),
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
    pattern.apiWeather,
    pattern.frontTag,
    pattern.moonWindow,
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
  const topWind = summarizeWeatherBuckets(catches, (record) => windDirectionLabel(weatherNumber(record, "windDirectionDegrees")))[0]?.[0] || "-";
  const topPressure = summarizeWeatherBuckets(catches, (record) => pressureBucket(weatherNumber(record, "pressureHpa")))[0]?.[0] || "-";
  const coverage = summarizeWeatherCoverage([...tripIds].map((id) => state.trips.find((trip) => trip.id === id)).filter(Boolean), catches);
  els.patternsMetricGrid.innerHTML = [
    ["Matching Fish", fish],
    ["Matching Trips", tripIds.size],
    ["Lost Fish", lostRecords.length],
    ["Top Pattern", topPattern ? `${trimNumber(topPattern.fishPerTrip)} fish/trip` : "0"],
    ["Best Wind", topWind],
    ["Best Pressure", topPressure],
    ["Weather Coverage", coverage.catchPercent]
  ].map(([label, value]) => `<article class="metric-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join("");
}

function patternScopedTrips() {
  return state.trips.filter(patternTripMatches);
}

function patternGearRecords(trips, catches) {
  const catchIds = new Set(catches.map((record) => record.id));
  return trips.flatMap((trip) => {
    const tripGear = (trip.gearUsed || []).map((gearItem) => ({ ...gearItem, trip, source: "trip", quantity: 0 }));
    const catchGear = (trip.catches || [])
      .map((catchItem) => resolveTripLineRecord({ ...catchItem, trip }))
      .filter((catchItem) => catchIds.has(catchItem.id) && (catchItem.lureId || catchItem.flasherId))
      .map((catchItem) => ({ ...catchItem, source: "catch" }));
    return [...tripGear, ...catchGear];
  });
}

function patternTripRows(trips, catches) {
  const fishByTrip = new Map();
  catches.forEach((record) => {
    fishByTrip.set(record.trip.id, (fishByTrip.get(record.trip.id) || 0) + fishCount(record));
  });
  return trips.map((trip) => ({
    ...trip,
    catches: catches.filter((record) => record.trip.id === trip.id),
    lostFish: [],
    fish: fishByTrip.get(trip.id) || 0
  }));
}

function renderPatternSignals(catches, lostRecords) {
  if (!els.efficiencyLeadersGrid) return;
  if (!catches.length) {
    renderEfficiencyLeaders([]);
    return;
  }

  const trips = patternScopedTrips();
  const fish = catches.reduce((sum, record) => sum + fishCount(record), 0);
  const hours = trips.reduce((sum, trip) => sum + tripHours(trip), 0);
  const gearRecords = patternGearRecords(trips, catches);
  const lureMinutes = gearRecords.reduce((sum, record) => sum + (record.lureId ? number(record.lureMinutes) : 0), 0);
  const flasherMinutes = gearRecords.reduce((sum, record) => sum + (record.flasherId ? number(record.flasherMinutes) : 0), 0);
  const lureItems = summarizeEffortPerformance(
    gearRecords.filter((record) => record.lureId),
    (record) => lureName(record.lureId),
    (record) => record.lureMinutes,
    lureMinutes / 60,
    fish
  );
  const flasherItems = summarizeEffortPerformance(
    gearRecords.filter((record) => record.flasherId),
    (record) => flasherName(record.flasherId),
    (record) => record.flasherMinutes,
    flasherMinutes / 60,
    fish
  );
  const methodItems = summarizeTripPerformance(patternTripRows(trips, catches), (trip) => trip.method, hours, fish);

  const trollingGear = gearRecords.filter((record) => record.trip.method === "Trolling" && record.source === "trip");
  const trollingCatches = catches.filter(isTrollingRecord);
  const trollingLost = lostRecords.filter(isTrollingRecord);
  const trollingLineHours = trollingGear.reduce((sum, record) => sum + setupLineMinutes(record), 0) / 60;
  const setupItems = summarizeEffortWithCatches(trollingGear, trollingCatches, (record) => presentationLabel(record.presentation), setupLineMinutes, trollingLineHours, fish, trollingLost);
  const lineSideItems = summarizeEffortWithCatches(trollingGear, trollingCatches, (record) => setupLineSideLabel(record.side), setupLineMinutes, trollingLineHours, fish, trollingLost);
  const downriggerGear = trollingGear.filter((record) => record.presentation === "downrigger");
  const downriggerCatches = trollingCatches.filter((record) => record.presentation === "downrigger");
  const downriggerHours = downriggerGear.reduce((sum, record) => sum + setupLineMinutes(record), 0) / 60;
  const downriggerItems = summarizeEffortWithCatches(
    downriggerGear,
    downriggerCatches,
    deepestRiggerLabel,
    setupLineMinutes,
    downriggerHours,
    fish,
    trollingLost.filter((record) => record.presentation === "downrigger")
  );
  const fowRangeItems = makePerformanceItems(summarizeBy(trollingCatches, (record) => fowRange(record.fowCaught)).map((item) => ({
    name: item.name,
    fish: item.fish,
    hours: 0,
    hasTimeSample: false,
    trips: item.trips
  })), hours, fish);
  const depthItems = makePerformanceItems(summarizeBy(trollingCatches, (record) => record.depthDown || record.estimatedDepth).map((item) => ({
    name: item.name,
    fish: item.fish,
    hours: 0,
    hasTimeSample: false,
    trips: item.trips
  })), hours, fish);

  renderEfficiencyLeaders([
    {
      label: "Quickest-producing lure in this pattern set",
      winner: bestObservedLeader(lureItems),
      fallback: "No lure has a timed catch yet",
      emptyDetail: "Log lure time and catches together before this can point to a pattern."
    },
    {
      label: "Lure with enough data to trust",
      winner: bestReliableLeader(lureItems),
      fallback: "Not enough lure history yet",
      emptyDetail: "A lure needs at least 3 trips and 5 hours before this card will call it reliable."
    },
    {
      label: "High-use lure worth reconsidering",
      winner: underperformingHighUseLeader(lureItems),
      fallback: "No high-use lure is underperforming yet",
      emptyDetail: "Nothing is getting a lot of time with clearly weak return right now.",
      kind: "underperforming"
    },
    {
      label: "Best flasher signal",
      winner: bestObservedLeader(flasherItems),
      fallback: "No clear flasher pattern yet",
      emptyDetail: "Use flashers on setup rows and link catches to rods to compare flasher return."
    },
    {
      label: "Method producing best so far",
      winner: bestObservedLeader(methodItems),
      fallback: "No clear method pattern yet",
      emptyDetail: "Log a few more trips before leaning hard on one method."
    },
    {
      label: "Most productive trolling setup",
      winner: bestObservedLeader(setupItems),
      fallback: "No clear trolling setup yet",
      emptyDetail: "Once setup time and catches line up, this will show which presentation is getting hit."
    },
    {
      label: "Best line side",
      winner: bestObservedLeader(lineSideItems),
      fallback: "No clear side pattern yet",
      emptyDetail: "Use setup sides and rod-linked catches to compare port, center, and starboard."
    },
    {
      label: "Best observed downrigger position",
      winner: bestObservedLeader(downriggerItems),
      fallback: "No clear downrigger pattern yet",
      emptyDetail: "Mark the deepest rigger on downrigger setup rows to compare where bites are coming from."
    },
    {
      label: "Depth range where fish are showing up",
      winner: fishShareLeader(fowRangeItems),
      fallback: "No FOW pattern yet",
      emptyDetail: "Add FOW caught on fish to see where bites are happening."
    },
    {
      label: "Lure depth getting hit",
      winner: fishShareLeader(depthItems),
      fallback: "No lure-depth pattern yet",
      emptyDetail: "Add depth down or estimated lure depth on catches to see what is getting hit."
    }
  ]);
}

function renderPatterns() {
  renderPatternFilters();

  const allCatchCount = state.trips.reduce((sum, trip) => sum + (trip.catches || []).length, 0);
  if (!allCatchCount) {
    els.patternsSummary.textContent = "No catches logged";
    els.patternsMetricGrid.innerHTML = "";
    renderEfficiencyLeaders([]);
    els.patternsGrid.innerHTML = `<div class="empty-state"><p>Log catches to discover patterns.</p></div>`;
    return;
  }

  const catches = patternCatchRecords();
  const lostRecords = patternLostRecords();
  const patterns = buildPatterns(catches, lostRecords);
  const patternText = patterns.length === 1 ? "1 pattern found" : `${patterns.length} patterns found`;
  els.patternsSummary.textContent = patternText;
  renderPatternMetrics(catches, lostRecords, patterns);
  renderPatternSignals(catches, lostRecords);
  renderPatternCards(patterns);
}
