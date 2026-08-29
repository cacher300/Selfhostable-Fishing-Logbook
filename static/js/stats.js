function renderAdvancedStats() {
  const trips = scopedTrips();
  const records = filterRecordsByStats(catchRecords(trips));
  const lostRecords = filterRecordsByStats(lostFishRecords(trips));
  const gearRecords = filterGearRecordsByStats(gearUseRecords(trips));
  const isTrollingScope = activeStatsMethod === "All methods" || activeStatsMethod === "Trolling";
  const fish = records.reduce((sum, record) => sum + fishCount(record), 0);
  const lostFish = lostRecords.length;
  const fishInteractions = fish + lostFish;
  const releasedFish = records.filter((record) => record.released).length;
  const keptFish = Math.max(0, fish - releasedFish);
  const hours = trips.reduce((sum, trip) => sum + tripHours(trip), 0);
  const lureMinutes = gearRecords.reduce((sum, record) => sum + (record.lureId ? number(record.lureMinutes) : 0), 0);
  const flasherMinutes = gearRecords.reduce((sum, record) => sum + (record.flasherId ? number(record.flasherMinutes) : 0), 0);
  const lureHours = lureMinutes / 60;
  const flasherHours = flasherMinutes / 60;
  const bestTrip = [...trips].sort((a, b) => scopedTripFish(b) - scopedTripFish(a))[0];
  if (typeof renderStatsLeaderboard === "function") {
    renderStatsLeaderboard(trips, (record, trip) => (
      recordMatchesStatsFilters(resolveTripLineRecord({ ...record, trip }))
    ));
  }

  if (els.statsActiveScope) {
    const scopeBits = [activeStatsMethod, activeStatsFilters.species, activeStatsFilters.location, activeStatsFilters.launch]
      .filter((value) => value && !value.startsWith("All "));
    const dateLabel = els.statsDateFilter?.selectedOptions?.[0]?.textContent || "All time";
    els.statsActiveScope.textContent = [dateLabel, ...(scopeBits.length ? scopeBits : ["All methods"])].join(" / ");
  }

  els.advancedMetricGrid.innerHTML = [
    ["Trips", trips.length],
    ["Landed fish", fish],
    ["Fish / hour", hours ? trimNumber(fish / hours) : "0"],
    ["Landing rate", formatPercent(fish, fishInteractions)],
    ["Fishing hours", trimNumber(hours)],
    ["Best trip", bestTrip ? `${scopedTripFish(bestTrip)} fish` : "—"]
  ].map(([label, value], index) => {
    const detail = index === 0 ? `${trimNumber(hours)} hours fished`
      : index === 1 ? `${releasedFish} released · ${keptFish} kept`
      : index === 2 ? `${trips.length ? trimNumber(fish / trips.length) : "0"} fish / trip`
      : index === 3 ? `${lostFish} lost fish`
      : index === 4 ? ""
      : (bestTrip ? formatDate(bestTrip.date) : "No trips in scope");
    return `<article class="metric-card metric-card-${index}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>${detail ? `<small>${detail}</small>` : ""}</article>`;
  }).join("");

  const performanceHeaders = ["Name", "Landed", "Lost", "Strikes", "Hours", "Fish / hr", "Strikes / hr", "Landing %", "Trips", "Fish / trip", "Time %", "Fish %", "Efficiency", "Delta", "Confidence", "Label"];
  const headersForPerformance = (name, items = []) => {
    const headers = [name, ...performanceHeaders.slice(1)];
    return headers;
  };
  const timedSetupRecords = gearRecords.filter((record) => record.source === "trip");
  const lureItems = summarizeEffortWithCatches(
    timedSetupRecords.filter((record) => record.lureId),
    records,
    (record) => lureName(record.lureId),
    (record) => record.lureMinutes,
    lureHours,
    fish,
    lostRecords
  );
  renderStatsTable(els.lureStatsTable, headersForPerformance("Lure", lureItems), performanceRows(lureItems, "Lure"));
  renderStatsTable(els.lureShareStatsTable, headersForPerformance("Lure", lureItems), performanceRows(lureItems, "Lure"));
  renderStatsTable(
    els.lureSpreadStatsTable,
    ["Lure", "Fish", "Hours", "Fish / hr", "Trips", "Producing Trips", "Quiet While Others Hit", "Quiet %", "Only Producer Trips", "Confidence"],
    lureSpreadRows(summarizeLureSpreadContext(trips, records, gearRecords))
  );
  const lureTypeItems = summarizeEffortPerformance(
    gearRecords.filter((record) => record.lureId),
    (record) => lureTypeLabel(record.lureId),
    (record) => record.lureMinutes,
    lureHours,
    fish
  );
  const lureColorItems = summarizeEffortPerformance(
    gearRecords.filter((record) => record.lureId),
    (record) => lureColorLabel(record.lureId),
    (record) => record.lureMinutes,
    lureHours,
    fish
  );
  renderStatsTable(els.lureTypeStatsTable, headersForPerformance("Lure Type", lureTypeItems), performanceRows(lureTypeItems, "Lure Type"));
  renderStatsTable(els.lureColorStatsTable, headersForPerformance("Lure Color", lureColorItems), performanceRows(lureColorItems, "Lure Color"));

  const tripTrendRows = statsTripTrendRows(trips);
  const speciesOverviewRows = summarizeBy(records.filter((record) => record.species), (record) => record.species)
    .map((item) => [item.name, item.fish, item.trips.size, fish ? `${trimNumber((item.fish / fish) * 100)}%` : "0%"]);
  renderStatsTable(els.tripTrendStatsTable, ["Trip", "Lines set", "Lines pulled", "Hours", "Landed", "Lost", "Fish / hr"], tripTrendRows);
  renderStatsTable(els.speciesOverviewStatsTable, ["Species", "Fish", "Trips", "Share"], speciesOverviewRows);

  let flasherItems = [];
  let comboItems = [];
  let directionItems = [];
  let lineSideItems = [];
  let setupItems = [];
  let fowRangeItems = [];
  let fowItems = [];
  let depthItems = [];
  let downriggerItems = [];
  let trollingGear = [];
  let trollingCatches = [];
  let trollingLost = [];
  document.querySelectorAll("[data-trolling-card], [data-trolling-group]").forEach((item) => {
    item.classList.toggle("hidden", !isTrollingScope);
  });

  if (isTrollingScope) {
    flasherItems = summarizeEffortWithCatches(
      timedSetupRecords.filter((record) => record.flasherId),
      records.filter(isTrollingRecord),
      (record) => flasherName(record.flasherId),
      (record) => record.flasherMinutes,
      flasherHours,
      fish,
      lostRecords.filter(isTrollingRecord)
    );
    trollingGear = gearRecords.filter((record) => record.trip.method === "Trolling" && record.source === "trip");
    const trollingLineHours = trollingGear.reduce((sum, record) => sum + setupLineMinutes(record), 0) / 60;
    const comboSummaries = summarizeCombos(gearRecords.filter((record) => record.lureId && record.flasherId));
    const comboHours = comboSummaries.reduce((sum, item) => sum + item.minutes, 0) / 60;
    comboItems = makePerformanceItems(comboSummaries.map((item) => ({
      name: `${item.lure} + ${item.flasher}`,
      fish: item.fish,
      minutes: item.minutes,
      trips: item.trips
    })), comboHours, fish);
    renderStatsTable(els.flasherStatsTable, headersForPerformance("Flasher", flasherItems), performanceRows(flasherItems, "Flasher"));
    renderStatsTable(els.comboStatsTable, headersForPerformance("Combo", comboItems), performanceRows(comboItems, "Combo"));

    trollingCatches = records.filter(isTrollingRecord);
    trollingLost = lostRecords.filter(isTrollingRecord);
    const trollingFish = trollingCatches.reduce((total, record) => total + fishCount(record), 0);
    directionItems = summarizeEffortWithCatches(trollingGear, trollingCatches, (record) => record.direction, setupLineMinutes, trollingLineHours, fish, trollingLost);
    lineSideItems = summarizeEffortWithCatches(trollingGear, trollingCatches, (record) => setupLineSideLabel(record.side), setupLineMinutes, trollingLineHours, fish, trollingLost);
    setupItems = summarizeEffortWithCatches(trollingGear, trollingCatches, (record) => presentationLabel(record.presentation), setupLineMinutes, trollingLineHours, fish, trollingLost);
    downriggerItems = summarizeDownriggerCatchPositions(
      trollingCatches,
      trollingLost,
      trollingFish
    );
    fowRangeItems = makePerformanceItems(summarizeBy(trollingCatches, (record) => fowRange(record.fowCaught)).map((item) => ({
      name: item.name,
      fish: item.fish,
      hours: 0,
      hasTimeSample: false,
      trips: item.trips
    })), hours, fish);
    fowItems = makePerformanceItems(summarizeBy(trollingCatches, (record) => record.fowCaught).map((item) => ({
      name: item.name,
      fish: item.fish,
      hours: 0,
      hasTimeSample: false,
      trips: item.trips
    })), hours, fish);
    depthItems = makePerformanceItems(summarizeBy(trollingCatches, (record) => record.depthDown || record.estimatedDepth).map((item) => ({
      name: item.name,
      fish: item.fish,
      hours: 0,
      hasTimeSample: false,
      trips: item.trips
    })), hours, fish);
    renderTrollingHighlights(directionItems, lineSideItems, setupItems, fowRangeItems, comboItems);
    renderStatsTable(els.directionStatsTable, headersForPerformance("Direction", directionItems), performanceRows(directionItems, "Direction"));
    renderStatsTable(els.directionSpeedStatsTable, ["Direction", "Best GPS speed", "Fish at speed", "Trips"], summarizeBestSpeedByDirection(trollingCatches));
    renderStatsTable(els.lineSideStatsTable, headersForPerformance("Line Side", lineSideItems), performanceRows(lineSideItems, "Line Side"));
    renderStatsTable(els.trollingSetupStatsTable, headersForPerformance("Method", setupItems), performanceRows(setupItems, "Method"));
    renderStatsTable(els.downriggerStatsTable, ["Position / Method", "Fish", "Lost", "Strikes", "Landing %", "Trips", "Fish / trip", "Fish Share"], catchComparisonRows(downriggerItems, "Position / Method"));
    renderStatsTable(els.fowRangeStatsTable, ["FOW Range", "Fish", "Trips", "Fish Share"], fishShareRows(fowRangeItems));

    const gpsSpeedRows = summarizeCatchMeasurement(trollingCatches, (record) => record.gpsSpeed || record.speed, { step: 0.5, suffix: " mph", min: 0.1, max: 15 });
    const ballSpeedRows = summarizeCatchMeasurement(trollingCatches, (record) => record.ballSpeed, { step: 0.5, suffix: " mph", min: 0.1, max: 15 });
    const speedDeltaRows = summarizeSpeedDelta(trollingCatches);
    const distanceRows = summarizeDistanceBehind(trollingGear, trollingCatches);
    const probeRows = summarizeProbeProfiles(trips);
    const thermoclineRows = summarizeThermoclinePosition(trollingCatches);
    renderStatsTable(els.gpsSpeedStatsTable, ["GPS Speed", "Fish", "Trips", "Avg Speed", "Avg Length"], gpsSpeedRows);
    renderStatsTable(els.ballSpeedStatsTable, ["Ball Speed", "Fish", "Trips", "Avg Speed", "Avg Length"], ballSpeedRows);
    renderStatsTable(els.speedDeltaStatsTable, ["Relationship", "Fish", "Trips", "Avg Delta", "Range"], speedDeltaRows);
    renderStatsTable(els.shakerStatsTable, ["Catch Class", "Fish", "Rate"], summarizeShakers(trollingCatches));
    renderStatsTable(els.distanceBehindStatsTable, ["Distance", "Fish", "Hours", "Fish / hr", "Trips"], distanceRows);
    renderStatsTable(els.probeTemperatureStatsTable, [`Depth (${unitSymbol("depth")})`, "Avg Temp", "Min Temp", "Max Temp", "Trips"], probeRows);
    renderStatsTable(els.thermoclineStatsTable, ["Position", "Fish", "Trips", "Fish Share"], thermoclineRows);
  } else {
    renderStatsMessage(els.flasherStatsTable, "Flashers are only tracked for trolling trips.");
    renderStatsMessage(els.comboStatsTable, "Lure + flasher combos are only tracked for trolling trips.");
    renderStatsMessage(els.trollingHighlightsTable, "Trolling-only stats appear when viewing All methods or Trolling.");
    renderStatsMessage(els.directionStatsTable, "Trolling direction is only tracked for trolling trips.");
    renderStatsMessage(els.directionSpeedStatsTable, "Direction and GPS speed are only tracked for trolling catches.");
    renderStatsMessage(els.lineSideStatsTable, "Line side is only tracked for trolling trips.");
    renderStatsMessage(els.trollingSetupStatsTable, "Trolling method is only tracked for trolling trips.");
    renderStatsMessage(els.downriggerStatsTable, "Deepest rigger is only tracked for trolling trips.");
    renderStatsMessage(els.fowRangeStatsTable, "FOW ranges are only tracked for trolling trips.");
    [els.gpsSpeedStatsTable, els.ballSpeedStatsTable, els.speedDeltaStatsTable, els.shakerStatsTable, els.distanceBehindStatsTable, els.probeTemperatureStatsTable, els.thermoclineStatsTable]
      .forEach((container) => renderStatsMessage(container, "This metric is available for trolling trips."));
  }

  renderStatsTable(els.outcomeStatsTable, ["Outcome", "Fish", "Rate"], outcomeRows(fish, releasedFish, keptFish, lostFish));
  renderStatsTable(els.speciesStatsTable, ["Species", "Fish", "Trips", "Most in one catch", "Share"], summarizeBy(
    records.filter((record) => record.species),
    (record) => record.species
  ).map((item) => [item.name, item.fish, item.trips.size, item.bestFish, fish ? `${trimNumber((item.fish / fish) * 100)}%` : "0%"]));
  renderStatsTable(els.lostFishStatsTable, ["Species", "Lost", "Trips"], summarizeLostFish(lostRecords));
  renderStatsTable(els.timeOfDayStatsTable, ["Time", "Fish", "Lost", "Share"], summarizeTimeOfDay(records, lostRecords));
  renderStatsTable(els.releaseStatsTable, ["Species", "Landed", "Released", "Kept", "Release %"], summarizeReleasePatterns(records));
  renderStatsTable(els.fowStatsTable, [`FOW (${unitSymbol("depth")})`, "Fish", "Trips", "Fish Share"], fishShareRows(fowItems));
  renderStatsTable(els.depthDownStatsTable, [`Depth Down (${unitSymbol("depth")})`, "Fish", "Trips", "Fish Share"], fishShareRows(depthItems));

  const locationRows = trips.map((trip) => ({
    ...trip,
    catches: filterRecordsByStats((trip.catches || []).map((catchItem) => resolveTripLineRecord({ ...catchItem, trip }))),
    lostFish: filterRecordsByStats((trip.lostFish || []).map((fishItem) => resolveTripLineRecord({ ...fishItem, trip }))),
    fish: scopedTripFish(trip),
    rate: scopedCatchRate(trip)
  }));
  const locationItems = summarizeTripPerformance(locationRows, (trip) => trip.location, hours, fish);
  const methodItems = summarizeTripPerformance(locationRows, (trip) => trip.method, hours, fish);
  const clarityItems = summarizeTripPerformance(locationRows, (trip) => trip.waterClarity, hours, fish);
  const weatherItems = summarizeTripPerformance(locationRows, (trip) => trip.weather, hours, fish);
  const intentItems = summarizeTripPerformance(locationRows, (trip) => intentLabel(tripIntent(trip)), hours, fish);
  const ratingItems = summarizeTripPerformance(locationRows, (trip) => tripRatingLabel(tripRatingValue(trip)), hours, fish);
  const monthItems = summarizeTripPerformance(locationRows, (trip) => trip.date ? tripMonthName(trip) : "", hours, fish);
  renderStatsTable(els.locationStatsTable, ["Location", "Trips", "Hours", "Fish", "Fish / hr", "Fish / trip", "Skunk", "Confidence", "Label"], tripPerformanceRows(locationItems));
  renderStatsTable(els.methodStatsTable, ["Method", "Trips", "Hours", "Fish", "Fish / hr", "Fish / trip", "Skunk", "Confidence", "Label"], tripPerformanceRows(methodItems));
  renderStatsTable(els.waterClarityStatsTable, ["Water Clarity", "Trips", "Hours", "Fish", "Fish / hr", "Fish / trip", "Skunk", "Confidence", "Label"], tripPerformanceRows(clarityItems));
  renderStatsTable(els.weatherStatsTable, ["Weather", "Trips", "Hours", "Fish", "Fish / hr", "Fish / trip", "Skunk", "Confidence", "Label"], tripPerformanceRows(weatherItems));
  renderStatsTable(els.intentStatsTable, ["Intent", "Trips", "Hours", "Fish", "Fish / hr", "Fish / trip", "Skunk", "Confidence"], tripPerformanceRows(intentItems, { includeLabel: false }));
  renderStatsTable(els.ratingStatsTable, ["Rating", "Trips", "Hours", "Fish", "Fish / hr", "Fish / trip", "Skunk", "Confidence"], tripPerformanceRows(ratingItems, { includeLabel: false }));
  renderStatsTable(els.monthStatsTable, ["Month", "Trips", "Hours", "Fish", "Fish / hr", "Fish / trip", "Skunk", "Confidence", "Label"], tripPerformanceRows(monthItems));
  const personItems = makePerformanceItems(summarizePeople(records, gearRecords).map((row) => ({
    name: row[0],
    fish: statsNumericValue(row[1]) || 0,
    hours: (statsNumericValue(row[3]) || 0),
    trips: statsNumericValue(row[4]) || 0
  })), hours, fish);
  renderStatsTable(els.personStatsTable, headersForPerformance("Person", personItems), performanceRows(personItems, "Person"));

  renderStatsTable(els.windDirectionStatsTable, ["Wind", "Fish", "Trips", "Fish / trip"], summarizeWeatherBuckets(records, (record) => windDirectionLabel(weatherNumber(record, "windDirectionDegrees"))));
  renderStatsTable(els.windSpeedStatsTable, ["Wind Speed", "Fish", "Trips", "Fish / trip"], summarizeWeatherBuckets(records, (record) => windSpeedBucket(weatherNumber(record, "windSpeedMph"))));
  renderStatsTable(els.pressureStatsTable, ["Pressure", "Fish", "Trips", "Fish / trip"], summarizeWeatherBuckets(records, (record) => pressureBucket(weatherNumber(record, "pressureHpa"))));
  renderStatsTable(els.cloudCoverStatsTable, ["Cloud Cover", "Fish", "Trips", "Fish / trip"], summarizeWeatherBuckets(records, (record) => cloudCoverBucket(weatherNumber(record, "cloudCoverPercent"))));
  renderStatsTable(els.airTempStatsTable, ["Air Temp", "Fish", "Trips", "Fish / trip"], summarizeWeatherBuckets(records, (record) => airTempBucket(weatherNumber(record, "temperatureC"))));
  renderStatsTable(els.sunshineStatsTable, ["Sunshine", "Fish", "Trips", "Fish / trip"], summarizeWeatherBuckets(records, (record) => sunshineBucket(weatherNumber(record, "sunshineDurationSeconds", "daily"))));
  renderStatsTable(els.weatherTrendStatsTable, ["Trend", "Fish", "Trips", "Fish / trip"], summarizeWeatherBuckets(records, (record) => weatherTrendText(record.trip?.weatherData)));
  renderStatsTable(els.frontTagStatsTable, ["Front Tag", "Fish", "Trips", "Fish / trip"], summarizeWeatherBuckets(records, (record) => weatherText(record, "frontTag")));
  renderStatsTable(els.biteWindowStatsTable, ["Window", "Fish", "Trips", "Fish / trip"], summarizeBiteWindows(records));
  renderStatsTable(els.moonPhaseStatsTable, ["Moon", "Fish", "Trips", "Fish / trip"], summarizeWeatherBuckets(records, (record) => record.trip?.weatherData?.sunMoon?.phase || ""));
  renderStatsTable(els.moonWindowStatsTable, ["Moon Window", "Fish", "Trips", "Fish / trip"], summarizeWeatherBuckets(records, (record) => moonWindowForTime(record.time, record.trip?.weatherData?.sunMoon)));

}

function formatPercent(value, total) {
  return total ? `${trimNumber((value / total) * 100)}%` : "0%";
}

function outcomeRows(landed, released, kept, lost) {
  const total = landed + lost;
  return [
    ["Landed", landed, formatPercent(landed, total)],
    ["Released after landing", released, formatPercent(released, landed)],
    ["Kept / harvested", kept, formatPercent(kept, landed)],
    ["Lost fish", lost, formatPercent(lost, total)]
  ];
}

function summarizeLostFish(records) {
  return summarizeBy(records.filter((record) => record.species || record.possibleSpecies), (record) => record.species || record.possibleSpecies)
    .map((item) => [
      item.name,
      item.uses,
      item.trips.size
    ]);
}

function timeBucket(time) {
  if (!time) return "No time";
  const hour = Number(String(time).split(":")[0]);
  if (!Number.isFinite(hour)) return "No time";
  if (hour < 5) return "Night";
  if (hour < 10) return "Morning";
  if (hour < 14) return "Midday";
  if (hour < 18) return "Afternoon";
  if (hour < 21) return "Evening";
  return "Night";
}

function summarizeTimeOfDay(catches, lostRecords) {
  const order = ["Morning", "Midday", "Afternoon", "Evening", "Night", "No time"];
  const map = new Map(order.map((name) => [name, { name, landed: 0, lost: 0 }]));
  catches.forEach((record) => {
    const current = map.get(timeBucket(record.time));
    current.landed += fishCount(record);
  });
  lostRecords.forEach((record) => {
    const current = map.get(timeBucket(record.time));
    current.lost += 1;
  });
  const buckets = [...map.values()];
  const timedInteractions = buckets
    .filter((item) => item.name !== "No time")
    .reduce((sum, item) => sum + item.landed + item.lost, 0);
  return buckets
    .filter((item) => item.landed || item.lost)
    .map((item) => [item.name, item.landed, item.lost, item.name === "No time" ? "—" : formatPercent(item.landed + item.lost, timedInteractions)]);
}

function summarizeReleasePatterns(records) {
  const map = new Map();
  records.forEach((record) => {
    const key = record.species || "Unknown";
    const current = map.get(key) || { name: key, landed: 0, released: 0 };
    const count = fishCount(record);
    current.landed += count;
    if (record.released) current.released += count;
    map.set(key, current);
  });
  return [...map.values()]
    .sort((a, b) => b.landed - a.landed)
    .map((item) => [item.name, item.landed, item.released, Math.max(0, item.landed - item.released), formatPercent(item.released, item.landed)]);
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
  const rangeSize = unitPreference("depth") === "m" ? 3 : 10;
  const start = Math.floor(fow / rangeSize) * rangeSize;
  return `${trimNumber(start)}-${trimNumber(start + rangeSize)} FOW (${unitSymbol("depth")})`;
}

function fishPerHour(item) {
  return item.minutes ? item.landed / (item.minutes / 60) : 0;
}

function renderTrollingHighlights(directionRows, lineSideRows, setupRows, fowRangeRows, comboRows = []) {
  const byFish = (rows) => [...rows].sort((a, b) => b.fish - a.fish || b.fishPerTrip - a.fishPerTrip)[0];
  const byRate = (rows) => [...rows].filter((row) => row.hours > 0).sort((a, b) => b.fishPerHour - a.fishPerHour || b.fish - a.fish)[0];
  const highlightRows = [
    highlightRow("Best direction", byRate(directionRows) || byFish(directionRows), "Best fish/hour by trolling direction"),
    highlightRow("Best line side", byRate(lineSideRows) || byFish(lineSideRows), "Best fish/hour by setup side"),
    highlightRow("Most productive FOW range", byFish(fowRangeRows), "Most fish caught in 10-foot FOW ranges"),
    highlightRow("Best setup rate", byRate(setupRows), "Highest fish per hour used"),
    highlightRow("Best combo rate", byRate(comboRows), "Highest lure + flasher return per hour")
  ].filter(Boolean);

  renderStatsTable(els.trollingHighlightsTable, ["Stat", "Winner", "Details"], highlightRows);
}

function highlightRow(label, row, details) {
  if (!row) return [label, "No data yet", details];
  const caught = row.fish !== undefined ? `${row.fish} fish` : "";
  const rate = row.fishPerHour ? `, ${trimNumber(row.fishPerHour)}/hr` : "";
  const time = row.hours ? `, ${trimNumber(row.hours)} hr used` : "";
  const confidence = row.confidence ? `, ${row.confidence} confidence` : "";
  return [label, row.name, `${caught}${rate}${time}${confidence}` || details];
}

function presentationLabel(value) {
  return choiceLabel("trollingPresentations", value) || "";
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

function statsNumericValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value || "").replace(/,/g, "");
  const match = text.match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const numberValue = Number(match[0]);
  return Number.isFinite(numberValue) ? numberValue : null;
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
