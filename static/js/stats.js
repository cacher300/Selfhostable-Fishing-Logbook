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
    ...(trip.catches || []).map((record) => resolveTripLineRecord({ ...record, trip })),
    ...(trip.lostFish || []).map((record) => resolveTripLineRecord({ ...record, trip })),
    ...(trip.gearUsed || [])
  ].some((record) => lureName(record.lureId) === lure);
}

function tripHasFlasher(trip, flasher) {
  if (flasher === "All flashers") return true;
  return [
    ...(trip.catches || []).map((record) => resolveTripLineRecord({ ...record, trip })),
    ...(trip.lostFish || []).map((record) => resolveTripLineRecord({ ...record, trip })),
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
  return trips.flatMap((trip) => (trip.catches || []).map((catchItem) => resolveTripLineRecord({ ...catchItem, trip })));
}

function lostFishRecords(trips = state.trips) {
  return trips.flatMap((trip) => (trip.lostFish || []).map((fish) => resolveTripLineRecord({ ...fish, trip })));
}

function gearUseRecords(trips = state.trips) {
  return trips.flatMap((trip) => {
    const tripGear = (trip.gearUsed || []).map((gearItem) => ({ ...gearItem, trip, source: "trip", quantity: 0 }));
    const catchGear = (trip.catches || [])
      .map((catchItem) => resolveTripLineRecord({ ...catchItem, trip }))
      .filter((catchItem) => catchItem.lureId || catchItem.flasherId)
      .map((catchItem) => ({ ...catchItem, source: "catch" }));
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

function filteredCatchRecordsForTrip(trip) {
  return filterRecordsByStats(catchRecords([trip]));
}

function scopedTripFish(trip) {
  return filteredCatchRecordsForTrip(trip).reduce((sum, catchItem) => sum + fishCount(catchItem), 0);
}

function scopedCatchRate(trip) {
  const hours = tripHours(trip);
  return hours > 0 ? scopedTripFish(trip) / hours : 0;
}

function filterGearRecordsByStats(records) {
  return records.filter((record) => {
    if (activeStatsFilters.species !== "All species" && record.source !== "catch") return false;
    return recordMatchesStatsFilters(record);
  });
}

function weatherNumber(record, key, source = "tripWindow") {
  const sources = source === "tripWindow"
    ? [record.weatherData?.hourly, record.weatherData?.tripWindow, record.trip?.weatherData?.tripWindow]
    : [record.weatherData?.[source], record.trip?.weatherData?.[source]];
  for (const bucket of sources) {
    const value = Number(bucket?.[key]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function weatherText(record, key) {
  return record.weatherData?.[key] || record.trip?.weatherData?.[key] || "";
}

function weatherBucket(value, buckets) {
  if (value === null || value === undefined) return "";
  const bucket = buckets.find((item) => value < item.max);
  return bucket?.label || buckets.at(-1)?.label || "";
}

function windSpeedBucket(value) {
  const unit = unitSymbol("windSpeed");
  const labelValue = (mph) => trimNumber(Math.round(convertUnitValue(mph, "mph", unitPreference("windSpeed")) * 10) / 10);
  return weatherBucket(value, [
    { max: 5, label: `Calm <${labelValue(5)} ${unit}` },
    { max: 10, label: `Light ${labelValue(5)}-${labelValue(10)} ${unit}` },
    { max: 15, label: `Moderate ${labelValue(10)}-${labelValue(15)} ${unit}` },
    { max: 25, label: `Windy ${labelValue(15)}-${labelValue(25)} ${unit}` },
    { max: Infinity, label: `Heavy ${labelValue(25)}+ ${unit}` }
  ]);
}

function pressureBucket(value) {
  const unit = unitSymbol("pressure");
  const labelValue = (hpa) => trimNumber(Math.round(convertUnitValue(hpa, "hPa", unitPreference("pressure")) * 10) / 10);
  return weatherBucket(value, [
    { max: 1000, label: `Low <${labelValue(1000)} ${unit}` },
    { max: 1015, label: `Stable ${labelValue(1000)}-${labelValue(1015)} ${unit}` },
    { max: 1025, label: `High ${labelValue(1015)}-${labelValue(1025)} ${unit}` },
    { max: Infinity, label: `Very High ${labelValue(1025)}+ ${unit}` }
  ]);
}

function cloudCoverBucket(value) {
  return weatherBucket(value, [
    { max: 25, label: "Clear <25%" },
    { max: 60, label: "Broken 25-60%" },
    { max: 90, label: "Cloudy 60-90%" },
    { max: Infinity, label: "Overcast 90%+" }
  ]);
}

function airTempBucket(value) {
  const unit = unitSymbol("airTemperature");
  const labelValue = (c) => trimNumber(Math.round(convertUnitValue(c, "C", unitPreference("airTemperature"))));
  return weatherBucket(value, [
    { max: 5, label: `Cold <${labelValue(5)} ${unit}` },
    { max: 13, label: `Cool ${labelValue(5)}-${labelValue(13)} ${unit}` },
    { max: 21, label: `Mild ${labelValue(13)}-${labelValue(21)} ${unit}` },
    { max: 29, label: `Warm ${labelValue(21)}-${labelValue(29)} ${unit}` },
    { max: Infinity, label: `Hot ${labelValue(29)}+ ${unit}` }
  ]);
}

function sunshineBucket(value) {
  if (value === null || value === undefined) return "";
  return weatherBucket(value / 3600, [
    { max: 2, label: "Low sun <2 hr" },
    { max: 6, label: "Mixed sun 2-6 hr" },
    { max: Infinity, label: "Bright 6+ hr" }
  ]);
}

function summarizeWeatherBuckets(records, keyFn) {
  const map = new Map();
  records.forEach((record) => {
    const key = keyFn(record);
    if (!key) return;
    const current = map.get(key) || { name: key, fish: 0, trips: new Set() };
    current.fish += fishCount(record);
    current.trips.add(record.trip.id);
    map.set(key, current);
  });
  return [...map.values()]
    .sort((a, b) => b.fish - a.fish || b.trips.size - a.trips.size)
    .map((item) => [item.name, item.fish, item.trips.size, trimNumber(item.fish / item.trips.size)]);
}

function summarizeWeatherCoverage(trips, records) {
  const weatherTrips = trips.filter((trip) => trip.weatherData?.daily || trip.weatherData?.tripWindow).length;
  const weatherCatches = records.filter((record) => record.weatherData?.hourly).reduce((sum, record) => sum + fishCount(record), 0);
  const fish = records.reduce((sum, record) => sum + fishCount(record), 0);
  return {
    trips: `${weatherTrips}/${trips.length}`,
    catches: `${weatherCatches}/${fish}`,
    tripPercent: formatPercent(weatherTrips, trips.length),
    catchPercent: formatPercent(weatherCatches, fish)
  };
}

function summarizeBiteWindows(records) {
  const map = new Map();
  records.forEach((record) => {
    const window = [
      timeBucket(record.time),
      windDirectionLabel(weatherNumber(record, "windDirectionDegrees")),
      pressureBucket(weatherNumber(record, "pressureHpa")),
      cloudCoverBucket(weatherNumber(record, "cloudCoverPercent")),
      moonWindowForTime(record.time, record.trip?.weatherData?.sunMoon)
    ].filter(Boolean).join(" / ");
    if (!window) return;
    const current = map.get(window) || { name: window, fish: 0, trips: new Set() };
    current.fish += fishCount(record);
    current.trips.add(record.trip.id);
    map.set(window, current);
  });
  return [...map.values()]
    .sort((a, b) => b.fish - a.fish || b.trips.size - a.trips.size)
    .slice(0, 12)
    .map((item) => [item.name, item.fish, item.trips.size, trimNumber(item.fish / item.trips.size)]);
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

function confidenceFor(hours, trips) {
  if (trips >= 6 && hours >= 15) return "High";
  if (trips >= 3 && trips <= 5 && hours >= 5 && hours <= 15) return "Medium";
  return "Low";
}

function performanceLabel(item, averageRate = 0) {
  if (item.missingTime) return "Missing time data";
  if (item.confidence === "Low") return "Needs more data";
  if (item.efficiencyIndex >= 1.5) return "High efficiency";
  if (item.usageShare >= 25 && item.efficiencyIndex < 0.75) return "Overused / low return";
  if (item.fish >= 2 && item.fishPerHour >= averageRate) return "Consistent producer";
  if (item.fish >= 2 && item.fishPerHour < averageRate) return "High fish count, low rate";
  if (item.fish > 0 && item.fishPerHour > averageRate) return "Low fish count, high rate";
  return "Watch list";
}

function sortPerformanceItems(items) {
  const sortKey = activeStatsSort || "fishPerHour";
  const keyMap = {
    fish: "fish",
    hours: "hours",
    fishPerHour: "fishPerHour",
    fishPerTrip: "fishPerTrip",
    efficiencyIndex: "efficiencyIndex"
  };
  const key = keyMap[sortKey] || "fishPerHour";
  return [...items].sort((a, b) => (
    (statsComparablePerformanceValue(b, key) - statsComparablePerformanceValue(a, key))
    || (b.fishPerHour || 0) - (a.fishPerHour || 0)
    || (b.fish || 0) - (a.fish || 0)
    || String(a.name).localeCompare(String(b.name))
  ));
}

function statsComparablePerformanceValue(item, key) {
  if (["fishPerHour", "efficiencyIndex", "overperformance", "usageShare"].includes(key) && !item.hasUsableTime) return -1;
  return item[key] || 0;
}

function filterPerformanceItems(items) {
  return items.filter((item) => {
    if (activeStatsMinTrips && item.trips < activeStatsMinTrips) return false;
    if (activeStatsMinHours && (!item.hasUsableTime || item.hours < activeStatsMinHours)) return false;
    return true;
  });
}

function performanceRows(items, labelHeader = "Name") {
  const includeLost = activeStatsIncludeLost || items.some((item) => item.lost > 0);
  return filterPerformanceItems(sortPerformanceItems(items)).map((item) => {
    const row = [
    item.name || labelHeader,
    item.fish,
    item.hasUsableTime ? trimNumber(item.hours) : "Missing time data",
    item.hasUsableTime ? trimNumber(item.fishPerHour) : "n/a",
    item.trips,
    trimNumber(item.fishPerTrip),
    item.hasUsableTime ? `${trimNumber(item.usageShare)}%` : "n/a",
    `${trimNumber(item.catchShare)}%`,
    item.hasUsableTime ? trimNumber(item.efficiencyIndex) : "n/a",
    item.hasUsableTime ? (item.overperformance > 0 ? `+${trimNumber(item.overperformance)}%` : `${trimNumber(item.overperformance)}%`) : "n/a",
    item.confidence,
    item.label
    ];
    if (includeLost) row.push(item.lost || 0);
    return row;
  });
}

function makePerformanceItems(items, totalHours, totalFish) {
  const averageRate = totalHours ? totalFish / totalHours : 0;
  return items.map((item) => {
    const hasTimeSample = item.hasTimeSample ?? (item.hours !== undefined || item.minutes !== undefined);
    const hours = item.hours ?? (item.minutes ? item.minutes / 60 : 0);
    const hasUsableTime = hasTimeSample && hours > 0;
    const trips = item.trips instanceof Set ? item.trips.size : number(item.trips);
    const fish = number(item.fish);
    const usageShare = hasUsableTime && totalHours ? (hours / totalHours) * 100 : 0;
    const catchShare = totalFish ? (fish / totalFish) * 100 : 0;
    const efficiencyIndex = hasUsableTime && usageShare ? catchShare / usageShare : 0;
    const overperformance = hasUsableTime ? catchShare - usageShare : 0;
    const next = {
      ...item,
      hours,
      trips,
      fish,
      hasTimeSample,
      hasUsableTime,
      missingTime: fish > 0 && !hasUsableTime,
      fishPerHour: hasUsableTime ? fish / hours : 0,
      fishPerTrip: trips ? fish / trips : 0,
      usageShare,
      catchShare,
      efficiencyIndex,
      overperformance,
      confidence: confidenceFor(hours, trips)
    };
    next.label = performanceLabel(next, averageRate);
    return next;
  });
}

function summarizeEffortPerformance(records, keyFn, minutesFn, totalHours, totalFish) {
  const map = new Map();
  records.forEach((record) => {
    const key = keyFn(record);
    if (!key) return;
    const current = map.get(key) || { name: key, fish: 0, minutes: 0, trips: new Set(), uses: 0, lost: 0 };
    current.fish += fishCount(record);
    current.minutes += Math.max(0, number(minutesFn(record)));
    current.trips.add(record.trip.id);
    current.uses += 1;
    map.set(key, current);
  });
  return makePerformanceItems([...map.values()], totalHours, totalFish);
}

function summarizeEffortWithCatches(effortRecords, catchRecords, keyFn, minutesFn, totalHours, totalFish, lostRecords = []) {
  const map = new Map();
  const effortByLine = new Map();
  const ensure = (key) => {
    const current = map.get(key) || { name: key, fish: 0, minutes: 0, trips: new Set(), uses: 0, lost: 0 };
    map.set(key, current);
    return current;
  };

  effortRecords.forEach((record) => {
    const key = keyFn(record);
    if (record.id) effortByLine.set(record.id, { record, key, minutes: Math.max(0, number(minutesFn(record))) });
    if (!key) return;
    const current = ensure(key);
    current.minutes += Math.max(0, number(minutesFn(record)));
    current.trips.add(record.trip.id);
    current.uses += 1;
  });

  catchRecords.forEach((record) => {
    const key = keyFn(record);
    if (!key) return;
    const line = record.setupLineId ? effortByLine.get(record.setupLineId) : null;
    if (line && !line.key && line.minutes > 0) {
      const current = ensure(key);
      current.minutes += line.minutes;
      current.trips.add(record.trip.id);
      current.uses += 1;
      line.key = key;
    }
    const current = ensure(key);
    current.fish += fishCount(record);
    current.trips.add(record.trip.id);
  });

  lostRecords.forEach((record) => {
    const key = keyFn(record);
    if (!key) return;
    const line = record.setupLineId ? effortByLine.get(record.setupLineId) : null;
    if (line && !line.key && line.minutes > 0) {
      const current = ensure(key);
      current.minutes += line.minutes;
      current.trips.add(record.trip.id);
      current.uses += 1;
      line.key = key;
    }
    const current = ensure(key);
    current.lost += 1;
    current.trips.add(record.trip.id);
  });

  return makePerformanceItems([...map.values()], totalHours, totalFish);
}

function setupLineMinutes(record) {
  return Math.max(number(record.lureMinutes), number(record.flasherMinutes), calculateMinutes(record.startTime, record.endTime));
}

function deepestRiggerLabel(record) {
  if (record.presentation !== "downrigger") return "";
  return record.deepestRigger ? "Deepest rigger" : "Higher rigger";
}

function setupDetailDiagnosticLabel(record) {
  if (["downrigger", "Downrigger"].includes(record.presentation)) return deepestRiggerLabel(record);
  return "";
}

function lureRecord(id) {
  return state.lures.find((lure) => lure.id === id) || null;
}

function lureTypeLabel(id) {
  return lureRecord(id)?.type || "Unknown type";
}

function lureColorLabel(id) {
  return lureRecord(id)?.color || "Unknown color";
}

function summarizeLureSpreadContext(trips, catches, gearRecords) {
  const map = new Map();
  const ensure = (id) => {
    const lure = lureRecord(id);
    const current = map.get(id) || {
      id,
      name: lure?.name || lureName(id),
      fish: 0,
      minutes: 0,
      trips: new Set(),
      productiveTrips: 0,
      quietSpreadTrips: 0,
      soloProducerTrips: 0
    };
    map.set(id, current);
    return current;
  };

  gearRecords.filter((record) => record.lureId).forEach((record) => {
    const current = ensure(record.lureId);
    current.minutes += Math.max(0, number(record.lureMinutes));
  });

  trips.forEach((trip) => {
    const tripGear = gearRecords.filter((record) => record.trip.id === trip.id && record.lureId);
    const usedLureIds = [...new Set(tripGear.map((record) => record.lureId).filter(Boolean))];
    if (!usedLureIds.length) return;
    const tripCatches = catches.filter((record) => record.trip.id === trip.id && record.lureId);
    const fishByLure = new Map();
    tripCatches.forEach((record) => {
      fishByLure.set(record.lureId, (fishByLure.get(record.lureId) || 0) + fishCount(record));
    });
    const totalTripFish = [...fishByLure.values()].reduce((sum, count) => sum + count, 0);
    usedLureIds.forEach((id) => {
      const current = ensure(id);
      const lureFish = fishByLure.get(id) || 0;
      current.fish += lureFish;
      current.trips.add(trip.id);
      if (lureFish > 0) current.productiveTrips += 1;
      if (totalTripFish > 0 && lureFish === 0) current.quietSpreadTrips += 1;
      if (lureFish > 0 && totalTripFish === lureFish) current.soloProducerTrips += 1;
    });
  });

  return [...map.values()].map((item) => {
    const hours = item.minutes / 60;
    const tripsUsed = item.trips.size;
    const quietRate = tripsUsed ? item.quietSpreadTrips / tripsUsed : 0;
    return {
      ...item,
      hours,
      trips: tripsUsed,
      fishPerHour: hours ? item.fish / hours : 0,
      quietRate,
      confidence: confidenceFor(hours, tripsUsed)
    };
  }).sort((a, b) => b.quietSpreadTrips - a.quietSpreadTrips || b.soloProducerTrips - a.soloProducerTrips || b.fishPerHour - a.fishPerHour);
}

function lureSpreadRows(items) {
  return filterPerformanceItems(items).map((item) => [
    item.name,
    item.fish,
    trimNumber(item.hours),
    item.hours ? trimNumber(item.fishPerHour) : "n/a",
    item.trips,
    item.productiveTrips,
    item.quietSpreadTrips,
    `${trimNumber(item.quietRate * 100)}%`,
    item.soloProducerTrips,
    item.confidence
  ]);
}

function summarizeTripPerformance(trips, keyFn, totalHours, totalFish) {
  const map = new Map();
  trips.forEach((trip) => {
    const key = keyFn(trip);
    if (!key) return;
    const current = map.get(key) || { name: key, fish: 0, hours: 0, trips: new Set(), skunks: 0 };
    const tripFish = trip.fish ?? scopedTripFish(trip);
    current.fish += tripFish;
    current.hours += tripHours(trip);
    current.trips.add(trip.id);
    if (tripFish === 0) current.skunks += 1;
    map.set(key, current);
  });
  return makePerformanceItems([...map.values()], totalHours, totalFish).map((item) => ({
    ...item,
    skunkRate: item.trips ? item.skunks / item.trips : 0
  }));
}

function tripPerformanceRows(items) {
  return filterPerformanceItems(sortPerformanceItems(items)).map((item) => [
    item.name,
    item.trips,
    item.hasUsableTime ? trimNumber(item.hours) : "Missing time data",
    item.fish,
    item.hasUsableTime ? trimNumber(item.fishPerHour) : "n/a",
    trimNumber(item.fishPerTrip),
    `${trimNumber((item.skunkRate || 0) * 100)}%`,
    item.confidence,
    item.label
  ]);
}

function fishShareRows(items) {
  return filterPerformanceItems(sortPerformanceItems(items)).map((item) => [
    item.name,
    item.fish,
    item.trips,
    `${trimNumber(item.catchShare)}%`
  ]);
}

function renderEfficiencyLeaders(sections) {
  if (!els.efficiencyLeadersGrid) return;
  const leaders = sections;
  els.efficiencyLeadersGrid.innerHTML = leaders.map((item) => `
    <article class="leader-card">
      <span>${escapeHtml(item.label)}</span>
      <strong>${escapeHtml(item.winner?.name || item.fallback)}</strong>
      <small>${item.winner ? leaderDetail(item.winner, item.kind) : escapeHtml(item.emptyDetail || "Log a few more trips before ranking this.")}</small>
    </article>
  `).join("");
}

function bestObservedLeader(items) {
  return [...filterPerformanceItems(items || [])]
    .filter((item) => item.hasUsableTime && item.fish > 0)
    .sort((a, b) => b.fishPerHour - a.fishPerHour || b.fish - a.fish)[0];
}

function bestReliableLeader(items) {
  return [...filterPerformanceItems(items || [])]
    .filter((item) => item.hasUsableTime && item.fish > 0 && item.confidence !== "Low")
    .sort((a, b) => b.fishPerHour - a.fishPerHour || b.fish - a.fish)[0];
}

function underperformingHighUseLeader(items) {
  return [...filterPerformanceItems(items || [])]
    .filter((item) => item.hasUsableTime && item.efficiencyIndex > 0 && item.efficiencyIndex < 0.75)
    .sort((a, b) => b.hours - a.hours || a.efficiencyIndex - b.efficiencyIndex)[0];
}

function fishShareLeader(items) {
  return [...filterPerformanceItems(items || [])]
    .filter((item) => item.fish > 0)
    .sort((a, b) => b.fish - a.fish || b.catchShare - a.catchShare || b.trips - a.trips)[0];
}

function renderStatsKeySignals({ lureItems, flasherItems, methodItems, setupItems, lineSideItems, downriggerItems, fowRangeItems, depthItems, isTrollingScope }) {
  const signals = [
    {
      label: "Quickest-producing lure",
      winner: bestObservedLeader(lureItems),
      fallback: "No lure has a timed catch yet",
      emptyDetail: "Log lure time and catches together before ranking lure return."
    },
    {
      label: "Lure with enough data to trust",
      winner: bestReliableLeader(lureItems),
      fallback: "Not enough lure history yet",
      emptyDetail: "A lure needs at least 3 trips and 5 hours before it is treated as reliable."
    },
    {
      label: "High-use lure worth reconsidering",
      winner: underperformingHighUseLeader(lureItems),
      fallback: "No high-use lure is underperforming",
      emptyDetail: "Nothing currently has high use with clearly weak return.",
      kind: "underperforming"
    },
    {
      label: "Best-producing method",
      winner: bestObservedLeader(methodItems),
      fallback: "No clear method leader yet",
      emptyDetail: "Log a few more timed trips before leaning on one method."
    }
  ];

  if (isTrollingScope) {
    signals.push(
      {
        label: "Best flasher signal",
        winner: bestObservedLeader(flasherItems),
        fallback: "No clear flasher leader yet",
        emptyDetail: "Link catches to timed flasher setups to compare return."
      },
      {
        label: "Most productive trolling setup",
        winner: bestObservedLeader(setupItems),
        fallback: "No clear trolling setup yet",
        emptyDetail: "Setup time and linked catches are needed to rank presentations."
      },
      {
        label: "Best line side",
        winner: bestObservedLeader(lineSideItems),
        fallback: "No clear side leader yet",
        emptyDetail: "Use setup sides and setup-linked catches to compare the spread."
      },
      {
        label: "Best downrigger position",
        winner: bestObservedLeader(downriggerItems),
        fallback: "No clear rigger position yet",
        emptyDetail: "Mark the deepest rigger on setup rows to compare positions."
      },
      {
        label: "FOW range where fish show up",
        winner: fishShareLeader(fowRangeItems),
        fallback: "No FOW signal yet",
        emptyDetail: "Add FOW caught to build this signal."
      },
      {
        label: "Lure depth getting hit",
        winner: fishShareLeader(depthItems),
        fallback: "No lure-depth signal yet",
        emptyDetail: "Add depth down or estimated lure depth to catches."
      }
    );
  }

  renderEfficiencyLeaders(signals);
}

function leaderDetail(item, kind = "rate") {
  if (item.hasUsableTime) {
    const confidence = item.confidence === "Low"
      ? "Confidence is low until more trips are logged."
      : `Confidence: ${item.confidence}.`;
    const nextStep = kind === "underperforming"
      ? "Worth rotating less often or testing against another lure."
      : item.confidence === "Low"
        ? "Promising, but based on a small sample."
        : "Good candidate to keep in the starting spread.";
    return `Produced ${escapeHtml(item.fish)} ${pluralize("fish", item.fish)} over ${escapeHtml(trimNumber(item.hours))} hr. Rate: ${escapeHtml(trimNumber(item.fishPerHour))} fish/hr. ${confidence} ${nextStep}`;
  }
  const tripText = `${item.trips} ${pluralize("trip", item.trips)}`;
  return `${escapeHtml(item.fish)} ${pluralize("fish", item.fish)} showed up here across ${escapeHtml(tripText)}, making up ${escapeHtml(trimNumber(item.catchShare))}% of fish. Treat this as a pattern clue, not a proven rate.`;
}

function pluralize(word, count) {
  if (word === "fish") return "fish";
  return Number(count) === 1 ? word : `${word}s`;
}

function statsDiagnosticRows(groups, trips, trollingGear, trollingCatches) {
  const rows = [];
  groups.forEach((group) => {
    if (group.diagnostic === false) return;
    (group.items || []).forEach((item) => {
      if (item.fish > 0 && !item.hasUsableTime) {
        rows.push([group.label, item.name, "Fish with no usable category time", `${item.fish} fish / ${item.trips} trips`, ""]);
      } else if (item.trips > 0 && item.hasTimeSample && !item.hasUsableTime) {
        rows.push([group.label, item.name, "Trips logged but hours are 0", `${item.trips} trips`, ""]);
      }
    });
  });

  trips.forEach((trip) => {
    const tripTime = tripHours(trip);
    const tripAction = diagnosticTripAction(trip, "Edit setup", "tripSetupSection");
    const setupRows = trip.gearUsed || [];
    const lineMinutes = setupRows.reduce((sum, record) => sum + setupLineMinutes(record), 0);
    if (tripTime > 0 && (trip.gearUsed || []).length && lineMinutes === 0) {
      rows.push(["Trip setup time", trip.title || formatDate(trip.date) || trip.id, "Trip has hours but setup rows have no time", `${trimNumber(tripTime)} trip hr`, tripAction]);
    }
    const longSetupRows = setupRows.filter((record) => setupLineMinutes(record) > tripTime * 60 * 1.25);
    longSetupRows.forEach((record) => {
      const label = setupLineDisplayLabel(trip, record) || presentationLabel(record.presentation) || "Setup row";
      rows.push([
        "Trip setup time",
        trip.title || formatDate(trip.date) || trip.id,
        "Setup row is longer than trip",
        `${label}: ${minutesToHours(setupLineMinutes(record))} setup / ${trimNumber(tripTime)} trip hr`,
        diagnosticTripAction(trip, "Edit setup", "tripSetupSection", record.id)
      ]);
    });
    const maxExpected = tripTime * 60 * Math.max(1, setupRows.length);
    if (tripTime > 0 && !longSetupRows.length && lineMinutes > maxExpected * 1.25) {
      rows.push(["Trip setup time", trip.title || formatDate(trip.date) || trip.id, "Setup line-hours exceed trip time by more than expected", `${minutesToHours(lineMinutes)} setup / ${trimNumber(tripTime)} trip hr`, tripAction]);
    }
  });

  trollingCatches.forEach((record) => {
    const line = record.setupLineId ? trollingGear.find((item) => item.id === record.setupLineId) : null;
    if (!line) return;
    const tripAction = diagnosticTripAction(record.trip, "Edit setup", "tripSetupSection");
    [
      ["Trolling method", (item) => presentationLabel(item.presentation)],
      ["Deepest rigger", setupDetailDiagnosticLabel]
    ].forEach(([label, keyFn]) => {
      const catchKey = keyFn(record);
      const lineKey = keyFn(line);
      if (catchKey && lineKey && catchKey !== lineKey) {
        rows.push([label, catchKey, "Catch value disagrees with setup row", `Setup row says ${lineKey}`, tripAction]);
      }
      if (catchKey && !lineKey && setupLineMinutes(line) > 0) {
        rows.push([label, catchKey, "Catch has category but setup row is missing it", `${minutesToHours(setupLineMinutes(line))} available on setup row`, tripAction]);
      }
    });
  });

  return rows;
}

function diagnosticTripAction(trip, label = "Open", sectionId = "", setupId = "") {
  if (!trip?.id) return "";
  const sectionAttr = sectionId ? ` data-trip-section="${escapeHtml(sectionId)}"` : "";
  const setupAttr = setupId ? ` data-setup-id="${escapeHtml(setupId)}"` : "";
  return {
    text: label,
    html: `<button class="button secondary compact-action" type="button" data-edit-trip="${escapeHtml(trip.id)}"${sectionAttr}${setupAttr}>${escapeHtml(label)}</button>`
  };
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
  const lureMinutes = gearRecords.reduce((sum, record) => sum + (record.lureId ? number(record.lureMinutes) : 0), 0);
  const flasherMinutes = gearRecords.reduce((sum, record) => sum + (record.flasherId ? number(record.flasherMinutes) : 0), 0);
  const lureHours = lureMinutes / 60;
  const flasherHours = flasherMinutes / 60;
  const skunkTrips = trips.filter((trip) => scopedTripFish(trip) === 0).length;
  const bestTrip = [...trips].sort((a, b) => scopedTripFish(b) - scopedTripFish(a))[0];
  const bestCatchRateTrip = [...trips].sort((a, b) => scopedCatchRate(b) - scopedCatchRate(a))[0];
  const tripsWithHours = trips
    .map((trip) => ({ trip, hours: tripHours(trip) }))
    .filter((item) => item.hours > 0);
  const averageTripLength = tripsWithHours.length
    ? tripsWithHours.reduce((sum, item) => sum + item.hours, 0) / tripsWithHours.length
    : 0;
  const longestTrip = [...tripsWithHours].sort((a, b) => b.hours - a.hours || compareTripsByDateTime(a.trip, b.trip, "desc"))[0];
  const shortestTrip = [...tripsWithHours].sort((a, b) => a.hours - b.hours || compareTripsByDateTime(a.trip, b.trip, "desc"))[0];

  els.advancedMetricGrid.innerHTML = [
    ["Trips", trips.length],
    ["Total hours", trimNumber(hours)],
    ["Avg trip length", tripsWithHours.length ? `${trimNumber(averageTripLength)} hr` : "0 hr"],
    ["Longest trip", longestTrip ? `${trimNumber(longestTrip.hours)} hr` : "0 hr"],
    ["Shortest trip", shortestTrip ? `${trimNumber(shortestTrip.hours)} hr` : "0 hr"],
    ["Landed fish", fish],
    ["Fish / hour", hours ? trimNumber(fish / hours) : "0"],
    ["Fish / trip", trips.length ? trimNumber(fish / trips.length) : "0"],
    ["Lbs / hour", hours ? trimNumber(pounds / hours) : "0"],
    ["Skunk trips", `${skunkTrips} (${formatPercent(skunkTrips, trips.length)})`],
    ["Best trip", bestTrip ? `${scopedTripFish(bestTrip)} fish` : "0"],
    ["Best catch rate", bestCatchRateTrip ? `${trimNumber(scopedCatchRate(bestCatchRateTrip))}/hr` : "0"],
    ["Lost fish", lostFish],
    ["Released / kept", `${releasedFish}/${keptFish}`],
    ["Lure use time", minutesToHours(lureMinutes)],
    ["Flasher use time", isTrollingScope ? minutesToHours(flasherMinutes) : "Trolling only"]
  ].map(([label, value]) => `<article class="metric-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join("");

  const performanceHeaders = ["Name", "Fish", "Hours", "Fish / hr", "Trips", "Fish / trip", "Time %", "Fish %", "Efficiency", "Over", "Confidence", "Label"];
  const headersForPerformance = (name, items = []) => {
    const headers = [name, ...performanceHeaders.slice(1)];
    if (activeStatsIncludeLost || items.some((item) => item.lost > 0)) headers.push("Lost");
    return headers;
  };
  const lureItems = summarizeEffortPerformance(
    gearRecords.filter((record) => record.lureId),
    (record) => lureName(record.lureId),
    (record) => record.lureMinutes,
    lureHours,
    fish
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
    flasherItems = summarizeEffortPerformance(
      gearRecords.filter((record) => record.flasherId),
      (record) => flasherName(record.flasherId),
      (record) => record.flasherMinutes,
      flasherHours,
      fish
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
    directionItems = summarizeEffortWithCatches(trollingGear, trollingCatches, (record) => record.direction, setupLineMinutes, trollingLineHours, fish, trollingLost);
    lineSideItems = summarizeEffortWithCatches(trollingGear, trollingCatches, (record) => setupLineSideLabel(record.side), setupLineMinutes, trollingLineHours, fish, trollingLost);
    setupItems = summarizeEffortWithCatches(trollingGear, trollingCatches, (record) => presentationLabel(record.presentation), setupLineMinutes, trollingLineHours, fish, trollingLost);
    const downriggerGear = trollingGear.filter((record) => ["downrigger", "Downrigger"].includes(record.presentation));
    const downriggerCatches = trollingCatches.filter((record) => ["downrigger", "Downrigger"].includes(record.presentation));
    const downriggerHours = downriggerGear.reduce((sum, record) => sum + setupLineMinutes(record), 0) / 60;
    downriggerItems = summarizeEffortWithCatches(
      downriggerGear,
      downriggerCatches,
      deepestRiggerLabel,
      setupLineMinutes,
      downriggerHours,
      fish,
      trollingLost.filter((record) => ["downrigger", "Downrigger"].includes(record.presentation))
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
    renderStatsTable(els.lineSideStatsTable, headersForPerformance("Line Side", lineSideItems), performanceRows(lineSideItems, "Line Side"));
    renderStatsTable(els.trollingSetupStatsTable, headersForPerformance("Method", setupItems), performanceRows(setupItems, "Method"));
    renderStatsTable(els.downriggerStatsTable, headersForPerformance("Deepest Rigger", downriggerItems), performanceRows(downriggerItems, "Rigger"));
    renderStatsTable(els.fowRangeStatsTable, ["FOW Range", "Fish", "Trips", "Fish Share"], fishShareRows(fowRangeItems));
  } else {
    renderStatsMessage(els.flasherStatsTable, "Flashers are only tracked for trolling trips.");
    renderStatsMessage(els.comboStatsTable, "Lure + flasher combos are only tracked for trolling trips.");
    renderStatsMessage(els.trollingHighlightsTable, "Trolling-only stats appear when viewing All methods or Trolling.");
    renderStatsMessage(els.directionStatsTable, "Trolling direction is only tracked for trolling trips.");
    renderStatsMessage(els.lineSideStatsTable, "Line side is only tracked for trolling trips.");
    renderStatsMessage(els.trollingSetupStatsTable, "Trolling method is only tracked for trolling trips.");
    renderStatsMessage(els.downriggerStatsTable, "Deepest rigger is only tracked for trolling trips.");
    renderStatsMessage(els.fowRangeStatsTable, "FOW ranges are only tracked for trolling trips.");
  }

  renderStatsTable(els.outcomeStatsTable, ["Outcome", "Fish", "Rate"], outcomeRows(fish, releasedFish, keptFish, lostFish));
  renderStatsTable(els.speciesStatsTable, ["Species", "Fish", "Trips", "Best Row", "Share"], summarizeBy(
    records.filter((record) => record.species),
    (record) => record.species
  ).map((item) => [item.name, item.fish, item.trips.size, item.bestFish, fish ? `${trimNumber((item.fish / fish) * 100)}%` : "0%"]));
  renderStatsTable(els.lostFishStatsTable, ["Species", "Lost", "Trips", "Share"], summarizeLostFish(lostRecords, lostFish));
  renderStatsTable(els.bestPatternStatsTable, ["Pattern", "Fish", "Hours", "Fish / hr", "Trips", "Confidence"], summarizeBestPatterns(records, trips));
  renderStatsTable(els.timeOfDayStatsTable, ["Time", "Fish", "Lost", "Share"], summarizeTimeOfDay(records, lostRecords, fishInteractions));
  renderStatsTable(els.releaseStatsTable, ["Species", "Landed", "Released", "Kept", "Release %"], summarizeReleasePatterns(records));
  renderStatsTable(els.fowStatsTable, ["FOW", "Fish", "Trips", "Fish Share"], fishShareRows(fowItems));
  renderStatsTable(els.depthDownStatsTable, ["Depth Down", "Fish", "Trips", "Fish Share"], fishShareRows(depthItems));

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
  renderStatsKeySignals({
    lureItems,
    flasherItems,
    methodItems,
    setupItems,
    lineSideItems,
    downriggerItems,
    fowRangeItems,
    depthItems,
    isTrollingScope
  });
  renderStatsTable(els.locationStatsTable, ["Location", "Trips", "Hours", "Fish", "Fish / hr", "Fish / trip", "Skunk", "Confidence", "Label"], tripPerformanceRows(locationItems));
  renderStatsTable(els.methodStatsTable, ["Method", "Trips", "Hours", "Fish", "Fish / hr", "Fish / trip", "Skunk", "Confidence", "Label"], tripPerformanceRows(methodItems));
  renderStatsTable(els.waterClarityStatsTable, ["Water Clarity", "Trips", "Hours", "Fish", "Fish / hr", "Fish / trip", "Skunk", "Confidence", "Label"], tripPerformanceRows(clarityItems));
  renderStatsTable(els.weatherStatsTable, ["Weather", "Trips", "Hours", "Fish", "Fish / hr", "Fish / trip", "Skunk", "Confidence", "Label"], tripPerformanceRows(weatherItems));
  renderStatsTable(els.intentStatsTable, ["Intent", "Trips", "Hours", "Fish", "Fish / hr", "Fish / trip", "Skunk", "Confidence", "Label"], tripPerformanceRows(intentItems));
  renderStatsTable(els.ratingStatsTable, ["Rating", "Trips", "Hours", "Fish", "Fish / hr", "Fish / trip", "Skunk", "Confidence", "Label"], tripPerformanceRows(ratingItems));
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

  renderStatsTable(els.statsDiagnosticsTable, ["Area", "Row", "Issue", "Details", "Action"], statsDiagnosticRows([
    { label: "Lure", items: lureItems },
    { label: "Lure type", items: lureTypeItems },
    { label: "Lure color", items: lureColorItems },
    { label: "Flasher", items: flasherItems },
    { label: "Combo", items: comboItems },
    { label: "Direction", items: directionItems },
    { label: "Line side", items: lineSideItems },
    { label: "Trolling method", items: setupItems },
    { label: "Deepest rigger", items: downriggerItems },
    { label: "FOW range", items: fowRangeItems, diagnostic: false },
    { label: "Exact FOW", items: fowItems, diagnostic: false },
    { label: "Depth down", items: depthItems, diagnostic: false }
  ], trips, trollingGear, trollingCatches));
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
  return [...map.values()].map((item) => {
    const hours = [...item.trips].reduce((sum, tripId) => sum + (tripHoursById.get(tripId) || 0), 0);
    return {
      ...item,
      hours,
      rate: hours ? item.fish / hours : 0,
      confidence: confidenceFor(hours, item.trips.size)
    };
  })
    .sort((a, b) => b.rate - a.rate || b.fish - a.fish || b.trips.size - a.trips.size)
    .slice(0, 12)
    .map((item) => [item.name, item.fish, item.hours ? trimNumber(item.hours) : "Missing time data", item.rate ? trimNumber(item.rate) : "n/a", item.trips.size, item.confidence]);
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
  return `${start}-${start + 10} FOW (${unitSymbol("depth")})`;
}

function speedBucket(value) {
  const speed = parseFirstNumber(value);
  if (!speed) return "";
  return `${trimNumber(Math.round(speed * 10) / 10)} ${unitSymbol("speed")}`;
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
  const displayRows = sortedStatsRows(container, headers, rows);
  const chartMarkup = statsChartMarkup(container, headers, displayRows);
  ensureStatsCardControls(container, chartMarkup);
  if (!displayRows.length) {
    container.innerHTML = `<div class="empty-state"><p>No data yet</p></div>`;
    return;
  }

  container.innerHTML = `
    <table>
      <thead><tr>${headers.map((header, index) => statsHeaderMarkup(container, header, index)).join("")}</tr></thead>
      <tbody>
        ${displayRows.map((row) => `<tr>${row.map((cell, index) => `<td>${statsCellMarkup(cell, headers[index])}</td>`).join("")}</tr>`).join("")}
      </tbody>
    </table>
    ${chartMarkup}
  `;
}

function sortedStatsRows(container, headers, rows) {
  const sort = activeStatsTableSort[container.id];
  if (!sort || !Number.isInteger(sort.index)) return rows;
  const direction = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = statsSortValue(a[sort.index]);
    const right = statsSortValue(b[sort.index]);
    if (typeof left === "number" && typeof right === "number") {
      return ((left - right) * direction) || String(a[0]).localeCompare(String(b[0]));
    }
    return String(left).localeCompare(String(right)) * direction;
  });
}

function statsSortValue(value) {
  if (value && typeof value === "object") return statsSortValue(value.text ?? value.value ?? "");
  const numeric = statsNumericValue(value);
  if (numeric !== null) return numeric;
  return String(value || "").toLowerCase();
}

/*
function statsHeaderMarkup(container, header, index) {
  const sort = activeStatsTableSort[container.id];
  const active = sort?.index === index;
  const direction = active && sort.direction === "asc" ? "low to high" : "high to low";
  const title = statsHeaderTitle(header);
  const marker = active ? (sort.direction === "asc" ? "▲" : "▼") : "";
  return `
    <th title="${escapeHtml(title)}">
      <button class="stats-sort-heading" type="button" data-stats-sort="${index}" aria-label="Sort ${escapeHtml(header)} ${escapeHtml(direction)}">
        <span>${escapeHtml(header)}</span>
        ${marker ? `<span aria-hidden="true">${marker}</span>` : ""}
      </button>
    </th>
  `;
}

function statsHeaderTitle(header) {
  const titles = {
    "Time %": "Percent of the selected fishing time spent with this item or category.",
    "Fish %": "Percent of the selected landed fish produced by this item or category.",
    Efficiency: "Fish percentage divided by time percentage. Above 1 means it produced more fish than its share of time.",
    Over: "Fish percentage minus time percentage. Positive means it overperformed its use.",
    Confidence: "Sample-size confidence based on hours and trips.",
    Label: "Quick interpretation of rate, share, and sample size."
  };
  return titles[header] || `Sort by ${header}`;
}

function statsCellMarkup(cell, header) {
  if (cell && typeof cell === "object" && cell.html) return cell.html;
  const text = String(cell ?? "");
  if (header === "Confidence") return `<span class="stats-badge stats-confidence-${text.toLowerCase()}">${escapeHtml(text)}</span>`;
  if (header === "Label") return `<span class="stats-badge">${escapeHtml(text)}</span>`;
  if (header === "Over" && text.startsWith("+")) return `<span class="stats-positive">${escapeHtml(text)}</span>`;
  if (header === "Over" && text.startsWith("-")) return `<span class="stats-negative">${escapeHtml(text)}</span>`;
  return escapeHtml(cell);
}
*/

function statsHeaderMarkup(container, header, index) {
  const sort = activeStatsTableSort[container.id];
  const active = sort?.index === index;
  const direction = active && sort.direction === "asc" ? "low to high" : "high to low";
  const title = statsHeaderTitle(header);
  const marker = active ? (sort.direction === "asc" ? "^" : "v") : "";
  return `
    <th title="${escapeHtml(title)}">
      <button class="stats-sort-heading" type="button" data-stats-sort="${index}" title="${escapeHtml(title)}" aria-label="Sort ${escapeHtml(header)} ${escapeHtml(direction)}">
        <span>${escapeHtml(header)}</span>
        ${marker ? `<span aria-hidden="true">${marker}</span>` : ""}
      </button>
    </th>
  `;
}

function statsHeaderTitle(header) {
  const titles = {
    Fish: "Landed fish counted in the current stats scope.",
    Hours: "Logged fishing time, lure time, flasher time, or setup time when available.",
    "Fish / hr": "Fish divided by hours. Higher means better catch efficiency.",
    Trips: "Trips where this item or category appears in the current stats scope.",
    "Fish / trip": "Fish divided by trips used.",
    "Time %": "Percent of the selected fishing time spent with this item or category.",
    "Fish %": "Percent of the selected landed fish produced by this item or category.",
    Efficiency: "Fish percentage divided by time percentage. Above 1 means it produced more fish than its share of time.",
    Over: "Fish percentage minus time percentage. Positive means it overperformed its use.",
    Skunk: "Percent of trips in this category with zero landed fish.",
    Lost: "Lost fish count. This is secondary context and does not inflate landed fish.",
    "Producing Trips": "Trips where this lure caught at least one landed fish.",
    "Quiet While Others Hit": "Trips where this lure was used, caught nothing, and another lure caught fish.",
    "Quiet %": "Percent of this lure's used trips where other lures produced but this lure did not.",
    "Only Producer Trips": "Trips where this lure caught fish and no other lure caught fish.",
    Confidence: "Sample-size confidence based on hours and trips.",
    Label: "Quick interpretation of rate, share, and sample size.",
    Share: "Percent share within this table.",
    "Fish Share": "Percent of selected landed fish in this range or bucket.",
    Rate: "Percent or rate for this row, depending on the table.",
    "Release %": "Percent of landed fish released."
  };
  return titles[header] || `Sort by ${header}`;
}

function statsCellMarkup(cell, header) {
  if (cell && typeof cell === "object" && cell.html) return cell.html;
  const text = String(cell ?? "");
  const title = statsHeaderTitle(header);
  if (header === "Confidence") return `<span class="stats-badge stats-confidence-${text.toLowerCase()}" title="${escapeHtml(title)}">${escapeHtml(text)}</span>`;
  if (header === "Label") return `<span class="stats-badge" title="${escapeHtml(title)}">${escapeHtml(text)}</span>`;
  if (header === "Over" && text.startsWith("+")) return `<span class="stats-positive" title="${escapeHtml(title)}">${escapeHtml(text)}</span>`;
  if (header === "Over" && text.startsWith("-")) return `<span class="stats-negative" title="${escapeHtml(title)}">${escapeHtml(text)}</span>`;
  return `<span title="${escapeHtml(title)}">${escapeHtml(cell)}</span>`;
}

function renderStatsMessage(container, message) {
  ensureStatsCardControls(container, "");
  container.innerHTML = `<div class="empty-state"><p>${escapeHtml(message)}</p></div>`;
}

function ensureStatsCardControls(container, chartMarkup) {
  const card = container.closest(".analytics-card");
  if (!card) return;
  const heading = card.querySelector(":scope > h3, :scope > .analytics-card-header h3");
  if (!heading) return;
  let header = card.querySelector(":scope > .analytics-card-header");
  if (!header) {
    header = document.createElement("div");
    header.className = "analytics-card-header";
    heading.replaceWith(header);
    header.appendChild(heading);
  }
  let toggle = header.querySelector(".stats-view-toggle");
  if (!toggle) {
    toggle = document.createElement("div");
    toggle.className = "stats-view-toggle";
    toggle.innerHTML = `
      <button class="is-active" type="button" data-stats-view="table">Table</button>
      <button type="button" data-stats-view="chart">Chart</button>
    `;
    header.appendChild(toggle);
  }
  const canChart = Boolean(chartMarkup);
  toggle.hidden = !canChart;
  if (!canChart) card.classList.remove("show-chart");
  if (canChart && card.dataset.defaultView === "chart" && !card.dataset.statsViewInitialized) {
    card.classList.add("show-chart");
    toggle.querySelectorAll("button").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.statsView === "chart");
    });
    card.dataset.statsViewInitialized = "true";
  }
}

function statsChartMarkup(container, headers, rows) {
  if (!rows.length) return "";
  const config = statsChartConfig(container.id, headers);
  if (!config) return "";
  if (config.type === "donut") return donutChartMarkup(headers, rows, config);
  if (config.type === "line") return lineChartMarkup(headers, rows, config);
  if (config.type === "stacked") return stackedBarChartMarkup(headers, rows, config);
  if (config.type === "grouped") return groupedBarChartMarkup(headers, rows, config);
  return barChartMarkup(headers, rows, config);
}

function statsChartConfig(id, headers) {
  const byHeader = (name) => headers.findIndex((header) => header.toLowerCase() === name.toLowerCase());
  const fishIndex = byHeader("Fish");
  const landedIndex = byHeader("Landed");
  const lostIndex = byHeader("Lost");
  const rateIndex = byHeader("Fish / hr");
  const tripRateIndex = byHeader("Fish / trip");
  const catchShareIndex = byHeader("Fish %");
  const usageShareIndex = byHeader("Time %");

  const configs = {
    outcomeStatsTable: { type: "donut", valueIndex: byHeader("Fish"), excludeLabels: ["Landed"] },
    speciesStatsTable: { type: "bar", valueIndex: fishIndex, limit: 8 },
    lostFishStatsTable: { type: "donut", valueIndex: byHeader("Lost") },
    timeOfDayStatsTable: { type: "bar", valueIndex: fishIndex, limit: 8 },
    releaseStatsTable: { type: "stacked", valueIndexes: [byHeader("Released"), byHeader("Kept")], seriesLabels: ["Released", "Kept"] },
    bestPatternStatsTable: { type: "bar", valueIndex: rateIndex, limit: 8 },
    lureStatsTable: { type: "bar", valueIndex: rateIndex, limit: 8 },
    lureShareStatsTable: { type: "grouped", valueIndexes: [usageShareIndex, catchShareIndex], seriesLabels: ["Time %", "Fish %"], limit: 8 },
    lureSpreadStatsTable: { type: "bar", valueIndex: byHeader("Quiet While Others Hit"), limit: 8 },
    lureTypeStatsTable: { type: "bar", valueIndex: rateIndex, limit: 8 },
    lureColorStatsTable: { type: "bar", valueIndex: rateIndex, limit: 8 },
    flasherStatsTable: { type: "grouped", valueIndexes: [usageShareIndex, catchShareIndex], seriesLabels: ["Time %", "Fish %"], limit: 8 },
    comboStatsTable: { type: "bar", valueIndex: rateIndex, limit: 8 },
    directionStatsTable: { type: "bar", valueIndex: rateIndex, limit: 8 },
    lineSideStatsTable: { type: "bar", valueIndex: rateIndex, limit: 8 },
    trollingSetupStatsTable: { type: "bar", valueIndex: rateIndex, limit: 8 },
    downriggerStatsTable: { type: "bar", valueIndex: rateIndex, limit: 8 },
    fowRangeStatsTable: { type: "donut", valueIndex: byHeader("Fish") },
    fowStatsTable: { type: "bar", valueIndex: fishIndex, limit: 10 },
    depthDownStatsTable: { type: "bar", valueIndex: fishIndex, limit: 10 },
    locationStatsTable: { type: "bar", valueIndex: rateIndex, limit: 8 },
    methodStatsTable: { type: "bar", valueIndex: rateIndex, limit: 8 },
    waterClarityStatsTable: { type: "bar", valueIndex: rateIndex, limit: 8 },
    weatherStatsTable: { type: "bar", valueIndex: rateIndex, limit: 8 },
    intentStatsTable: { type: "bar", valueIndex: rateIndex, limit: 8 },
    ratingStatsTable: { type: "bar", valueIndex: rateIndex, limit: 8 },
    personStatsTable: { type: "bar", valueIndex: fishIndex, limit: 8 },
    monthStatsTable: {
      type: "line",
      valueIndexes: [fishIndex, rateIndex],
      seriesLabels: ["Fish", "Fish / hr"],
      orderLabels: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
    },
    windDirectionStatsTable: { type: "bar", valueIndex: fishIndex, limit: 8 },
    windSpeedStatsTable: { type: "bar", valueIndex: tripRateIndex, limit: 8 },
    pressureStatsTable: { type: "bar", valueIndex: tripRateIndex, limit: 8 },
    cloudCoverStatsTable: { type: "bar", valueIndex: tripRateIndex, limit: 8 },
    airTempStatsTable: { type: "bar", valueIndex: tripRateIndex, limit: 8 },
    sunshineStatsTable: { type: "bar", valueIndex: tripRateIndex, limit: 8 },
    weatherTrendStatsTable: { type: "bar", valueIndex: tripRateIndex, limit: 8 },
    frontTagStatsTable: { type: "bar", valueIndex: tripRateIndex, limit: 8 },
    biteWindowStatsTable: { type: "bar", valueIndex: tripRateIndex, limit: 10 },
    moonPhaseStatsTable: { type: "bar", valueIndex: tripRateIndex, limit: 8 },
    moonWindowStatsTable: { type: "bar", valueIndex: tripRateIndex, limit: 8 }
  };

  const config = configs[id];
  if (!config) return null;
  const indexes = config.valueIndexes || [config.valueIndex];
  if (indexes.some((index) => index < 1)) return null;
  return config;
}

function chartRowsFor(headers, rows, config) {
  const valueIndex = config.valueIndex;
  return rows
    .map((row) => ({
      label: row[0],
      value: statsNumericValue(row[valueIndex]),
      valueLabel: row[valueIndex],
      metric: headers[valueIndex] || ""
    }))
    .filter((row) => row.value !== null)
    .sort((a, b) => b.value - a.value)
    .slice(0, config.limit || 10);
}

function barChartMarkup(headers, rows, config) {
  const chartRows = chartRowsFor(headers, rows, config);
  if (!chartRows.length) return "";
  const max = Math.max(...chartRows.map((row) => row.value), 1);
  return `
    <div class="stats-chart stats-chart-bars" aria-label="Bar chart view">
      ${chartRows.map((row, index) => `
        <div class="stats-chart-row">
          <span class="stats-chart-label" title="${escapeHtml(row.label)}">${escapeHtml(row.label)}</span>
          <span class="stats-chart-track" aria-hidden="true">
            <span class="stats-chart-bar stats-chart-color-${index % 8}" style="width: ${Math.max(4, (row.value / max) * 100)}%"></span>
          </span>
          <span class="stats-chart-value">${escapeHtml(row.valueLabel)} ${escapeHtml(row.metric)}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function stackedBarChartMarkup(headers, rows, config) {
  const chartRows = rows.map((row) => {
    const values = config.valueIndexes.map((index) => statsNumericValue(row[index]) || 0);
    const valueLabels = config.valueIndexes.map((index) => row[index]);
    const total = values.reduce((sum, value) => sum + value, 0);
    return { label: row[0], values, valueLabels, total };
  }).filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, config.limit || 10);
  if (!chartRows.length) return "";
  return `
    <div class="stats-chart stats-chart-stacked" aria-label="Stacked bar chart view">
      <div class="stats-chart-legend">
        ${config.seriesLabels.map((label, index) => `<span><i class="stats-chart-color-${index}"></i>${escapeHtml(label)}</span>`).join("")}
      </div>
      ${chartRows.map((row) => `
        <div class="stats-chart-row">
          <span class="stats-chart-label" title="${escapeHtml(row.label)}">${escapeHtml(row.label)}</span>
          <span class="stats-chart-track" aria-hidden="true">
            ${row.values.map((value, index) => value ? `<span class="stats-chart-bar stats-chart-segment stats-chart-color-${index}" style="width: ${(value / row.total) * 100}%"></span>` : "").join("")}
          </span>
          <span class="stats-chart-value">${escapeHtml(row.valueLabels.join(" / "))}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function groupedBarChartMarkup(headers, rows, config) {
  const chartRows = rows.map((row) => {
    const values = config.valueIndexes.map((index) => statsNumericValue(row[index]));
    const valueLabels = config.valueIndexes.map((index) => row[index]);
    return { label: row[0], values, valueLabels };
  }).filter((row) => row.values.some((value) => value !== null && value > 0))
    .sort((a, b) => Math.max(...b.values.map((value) => value || 0)) - Math.max(...a.values.map((value) => value || 0)))
    .slice(0, config.limit || 10);
  if (!chartRows.length) return "";
  const max = Math.max(...chartRows.flatMap((row) => row.values.map((value) => value || 0)), 1);
  return `
    <div class="stats-chart stats-chart-grouped" aria-label="Grouped bar chart view">
      <div class="stats-chart-legend">
        ${config.seriesLabels.map((label, index) => `<span><i class="stats-chart-color-${index}"></i>${escapeHtml(label)}</span>`).join("")}
      </div>
      ${chartRows.map((row) => `
        <div class="stats-chart-row stats-chart-grouped-row">
          <span class="stats-chart-label" title="${escapeHtml(row.label)}">${escapeHtml(row.label)}</span>
          <span class="stats-chart-group" aria-hidden="true">
            ${row.values.map((value, index) => `
              <span class="stats-chart-track">
                <span class="stats-chart-bar stats-chart-color-${index}" style="width: ${Math.max(3, ((value || 0) / max) * 100)}%"></span>
              </span>
            `).join("")}
          </span>
          <span class="stats-chart-value">${escapeHtml(row.valueLabels.join(" / "))}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function donutChartMarkup(headers, rows, config) {
  const excludedLabels = new Set(config.excludeLabels || []);
  const chartRows = chartRowsFor(headers, rows, config)
    .filter((row) => row.value > 0 && !excludedLabels.has(String(row.label)))
    .slice(0, 6);
  if (!chartRows.length) return "";
  const total = chartRows.reduce((sum, row) => sum + row.value, 0);
  let offset = 25;
  const segments = chartRows.map((row, index) => {
    const length = (row.value / total) * 100;
    const segment = `<circle class="stats-donut-segment stats-chart-stroke-${index % 8}" cx="21" cy="21" r="15.915" stroke-dasharray="${length} ${100 - length}" stroke-dashoffset="${offset}"></circle>`;
    offset -= length;
    return segment;
  }).join("");
  return `
    <div class="stats-chart stats-donut-chart" aria-label="Donut chart view">
      <svg viewBox="0 0 42 42" role="img" aria-label="${escapeHtml(headers[config.valueIndex])} share">
        <circle class="stats-donut-bg" cx="21" cy="21" r="15.915"></circle>
        ${segments}
        <text x="21" y="20" text-anchor="middle">${escapeHtml(total)}</text>
        <text x="21" y="25" text-anchor="middle">${escapeHtml(headers[config.valueIndex])}</text>
      </svg>
      <div class="stats-chart-legend">
        ${chartRows.map((row, index) => `<span><i class="stats-chart-color-${index % 8}"></i>${escapeHtml(row.label)}: ${escapeHtml(row.valueLabel)}</span>`).join("")}
      </div>
    </div>
  `;
}

function lineChartMarkup(headers, rows, config) {
  const valueIndexes = config.valueIndexes;
  let chartRows = rows.map((row) => ({
    label: row[0],
    values: valueIndexes.map((index) => statsNumericValue(row[index]) || 0)
  })).filter((row) => row.values.some((value) => value > 0));
  if (config.orderLabels) {
    const order = new Map(config.orderLabels.map((label, index) => [label, index]));
    chartRows = chartRows.sort((a, b) => (order.get(a.label) ?? 999) - (order.get(b.label) ?? 999));
  }
  if (chartRows.length < 2) return barChartMarkup(headers, rows, { ...config, valueIndex: valueIndexes[0] });
  const width = 320;
  const height = 150;
  const pad = 20;
  const max = Math.max(...chartRows.flatMap((row) => row.values), 1);
  const xFor = (index) => pad + (index * ((width - pad * 2) / Math.max(1, chartRows.length - 1)));
  const yFor = (value) => height - pad - ((value / max) * (height - pad * 2));
  const polylines = valueIndexes.map((_, seriesIndex) => chartRows.map((row, index) => `${xFor(index)},${yFor(row.values[seriesIndex])}`).join(" "));
  return `
    <div class="stats-chart stats-line-chart" aria-label="Line chart view">
      <svg viewBox="0 0 ${width} ${height}" role="img">
        <line class="stats-line-axis" x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}"></line>
        <line class="stats-line-axis" x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}"></line>
        ${polylines.map((points, index) => `<polyline class="stats-line stats-chart-stroke-${index}" points="${points}"></polyline>`).join("")}
        ${chartRows.map((row, rowIndex) => valueIndexes.map((_, seriesIndex) => `<circle class="stats-line-point stats-chart-fill-${seriesIndex}" cx="${xFor(rowIndex)}" cy="${yFor(row.values[seriesIndex])}" r="3"></circle>`).join("")).join("")}
      </svg>
      <div class="stats-chart-legend">
        ${config.seriesLabels.map((label, index) => `<span><i class="stats-chart-color-${index}"></i>${escapeHtml(label)}</span>`).join("")}
      </div>
    </div>
  `;
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
