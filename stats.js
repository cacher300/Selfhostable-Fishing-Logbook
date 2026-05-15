function tripMonthName(trip) {
  if (!trip.date) return "";
  return new Date(`${trip.date}T12:00:00`).toLocaleDateString(undefined, { month: "long" });
}

function tripHasSpecies(trip, species) {
  if (species === "All species") return true;
  return [
    ...(trip.catches || []).map((catchItem) => catchItem.species),
    ...(trip.lostFish || []).map((fish) => fish.possibleSpecies || fish.species)
  ].includes(species);
}

function tripHasPerson(trip, person) {
  if (person === "All people") return true;
  const personIds = new Set((trip.people || []).filter((item) => item.name === person).map((item) => item.id));
  if ((trip.people || []).some((item) => item.name === person)) return true;
  return [
    ...(trip.catches || []),
    ...(trip.lostFish || []),
    ...(trip.gearUsed || [])
  ].some((record) => personName(trip, record.personId) === person || personIds.has(record.personId));
}

function tripHasLure(trip, lure) {
  if (lure === "All lures") return true;
  return [
    ...(trip.catches || []),
    ...(trip.lostFish || []),
    ...(trip.gearUsed || [])
  ].some((record) => lureName(record.lureId) === lure);
}

function tripHasFlasher(trip, flasher) {
  if (flasher === "All flashers") return true;
  return [
    ...(trip.catches || []),
    ...(trip.lostFish || []),
    ...(trip.gearUsed || [])
  ].some((record) => flasherName(record.flasherId) === flasher);
}

function scopedTrips() {
  return state.trips.filter((trip) => (
    (activeStatsMethod === "All methods" || trip.method === activeStatsMethod)
    && (activeStatsFilters.location === "All locations" || trip.location === activeStatsFilters.location)
    && (activeStatsFilters.waterClarity === "All clarity" || trip.waterClarity === activeStatsFilters.waterClarity)
    && (activeStatsFilters.weather === "All weather" || trip.weather === activeStatsFilters.weather)
    && (activeStatsFilters.month === "All months" || tripMonthName(trip) === activeStatsFilters.month)
    && (activeStatsFilters.rating === "All ratings" || tripRatingLabel(tripRatingValue(trip)) === activeStatsFilters.rating)
    && tripHasSpecies(trip, activeStatsFilters.species)
    && tripHasPerson(trip, activeStatsFilters.person)
    && tripHasLure(trip, activeStatsFilters.lure)
    && tripHasFlasher(trip, activeStatsFilters.flasher)
  ));
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

function recordMatchesStatsFilters(record) {
  return (
    (activeStatsFilters.species === "All species" || (record.species || record.possibleSpecies) === activeStatsFilters.species)
    && (activeStatsFilters.person === "All people" || personName(record.trip, record.personId) === activeStatsFilters.person)
    && (activeStatsFilters.lure === "All lures" || lureName(record.lureId) === activeStatsFilters.lure)
    && (activeStatsFilters.flasher === "All flashers" || flasherName(record.flasherId) === activeStatsFilters.flasher)
  );
}

function filterRecordsByStats(records) {
  return records.filter(recordMatchesStatsFilters);
}

function filterGearRecordsByStats(records) {
  return records.filter((record) => {
    if (activeStatsFilters.species !== "All species" && record.source !== "catch") return false;
    return recordMatchesStatsFilters(record);
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
  renderStatsTable(els.bestPatternStatsTable, ["Pattern", "Fish", "Trips", "Fish / hr"], summarizeBestPatterns(records, trips));
  renderStatsTable(els.timeOfDayStatsTable, ["Time", "Landed", "Lost", "Share"], summarizeTimeOfDay(records, lostRecords, fishInteractions));
  renderStatsTable(els.releaseStatsTable, ["Species", "Landed", "Released", "Kept", "Release %"], summarizeReleasePatterns(records));
  renderStatsTable(els.photoCoverageStatsTable, ["Coverage", "Count", "Share"], summarizePhotoCoverage(records));

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

  const locationRows = trips.map((trip) => ({
    ...trip,
    catches: filterRecordsByStats((trip.catches || []).map((catchItem) => ({ ...catchItem, trip }))),
    lostFish: filterRecordsByStats((trip.lostFish || []).map((fish) => ({ ...fish, trip }))),
    fish: filterRecordsByStats((trip.catches || []).map((catchItem) => ({ ...catchItem, trip }))).reduce((sum, catchItem) => sum + fishCount(catchItem), 0),
    rate: catchRate(trip)
  }));
  renderStatsTable(els.locationStatsTable, ["Location", "Trips", "Fish", "Hours", "Fish / hr"], summarizeTrips(locationRows, (trip) => trip.location));

  renderStatsTable(els.methodStatsTable, ["Method", "Trips", "Fish", "Hours", "Fish / hr"], summarizeTrips(locationRows, (trip) => trip.method));
  renderStatsTable(els.waterClarityStatsTable, ["Water Clarity", "Trips", "Fish", "Hours", "Fish / hr"], summarizeTrips(locationRows, (trip) => trip.waterClarity));
  renderStatsTable(els.weatherStatsTable, ["Weather", "Trips", "Fish", "Hours", "Fish / hr"], summarizeTrips(locationRows, (trip) => trip.weather));

  renderStatsTable(els.intentStatsTable, ["Intent", "Trips", "Fish", "Hours", "Fish / hr"], summarizeTrips(locationRows, (trip) => intentLabel(tripIntent(trip))));
  renderStatsTable(els.ratingStatsTable, ["Rating", "Trips", "Fish", "Hours", "Fish / hr"], summarizeTrips(locationRows, (trip) => tripRatingLabel(tripRatingValue(trip))));

  renderStatsTable(els.personStatsTable, ["Person", "Fish", "Setups", "Gear Time", "Trips"], summarizePeople(records, gearRecords));

  renderStatsTable(els.monthStatsTable, ["Month", "Trips", "Fish", "Hours", "Fish / hr"], summarizeTrips(locationRows, (trip) => {
    if (!trip.date) return "";
    return tripMonthName(trip);
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
  return summarizeBy(records.filter((record) => record.species || record.possibleSpecies), (record) => record.species || record.possibleSpecies)
    .map((item) => [
      item.name,
      item.uses,
      item.trips.size,
      totalLost ? `${trimNumber((item.uses / totalLost) * 100)}%` : "0%"
    ]);
}

function summarizeBestPatterns(records, trips) {
  const tripHoursById = new Map(trips.map((trip) => [trip.id, tripHours(trip)]));
  const map = new Map();
  records.forEach((record) => {
    const pattern = [
      record.species,
      lureName(record.lureId),
      flasherName(record.flasherId),
      record.trip.waterClarity,
      record.trip.weather
    ].filter(Boolean).join(" / ");
    if (!pattern) return;
    const current = map.get(pattern) || { name: pattern, fish: 0, trips: new Set() };
    current.fish += fishCount(record);
    current.trips.add(record.trip.id);
    map.set(pattern, current);
  });
  return [...map.values()]
    .sort((a, b) => b.fish - a.fish || b.trips.size - a.trips.size)
    .slice(0, 12)
    .map((item) => {
      const hours = [...item.trips].reduce((sum, tripId) => sum + (tripHoursById.get(tripId) || 0), 0);
      return [item.name, item.fish, item.trips.size, hours ? trimNumber(item.fish / hours) : "0"];
    });
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

function summarizeTimeOfDay(catches, lostRecords, totalInteractions) {
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
  return [...map.values()]
    .filter((item) => item.landed || item.lost)
    .map((item) => [item.name, item.landed, item.lost, formatPercent(item.landed + item.lost, totalInteractions)]);
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

function summarizePhotoCoverage(records) {
  const total = records.reduce((sum, record) => sum + fishCount(record), 0);
  const withPhotos = records.filter((record) => (record.photos || []).length).reduce((sum, record) => sum + fishCount(record), 0);
  const withGps = records.filter((record) => record.coordinates).reduce((sum, record) => sum + fishCount(record), 0);
  const manualGps = records.filter((record) => record.manualCoordinates || record.coordinates?.manual).reduce((sum, record) => sum + fishCount(record), 0);
  return [
    ["Fish logged", total, "100%"],
    ["With photos", withPhotos, formatPercent(withPhotos, total)],
    ["With GPS", withGps, formatPercent(withGps, total)],
    ["Manual GPS overrides", manualGps, formatPercent(manualGps, total)]
  ];
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
    current.fish += trip.fish ?? totalCaught(trip);
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
