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
    tripMatchesStatsDate(trip)
    && (activeStatsMethod === "All methods" || trip.method === activeStatsMethod)
    && (activeStatsFilters.location === "All locations" || trip.location === activeStatsFilters.location)
    && (activeStatsFilters.launch === "All launches" || trip.launch === activeStatsFilters.launch)
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

function tripMatchesStatsDate(trip) {
  if (activeStatsDateRange === "all") return true;
  const tripDate = new Date(`${trip.date || ""}T12:00:00`);
  if (Number.isNaN(tripDate.getTime())) return false;
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  if (activeStatsDateRange === "season") return tripDate.getFullYear() === today.getFullYear();
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - Number(activeStatsDateRange));
  return tripDate >= cutoff && tripDate <= today;
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

function confidenceFor(hours, trips) {
  return StatsAnalytics.confidence(hours, trips);
}

function performanceLabel(item, averageRate = 0) {
  if (item.missingTime) return "Missing time data";
  if (item.strikes >= 3 && item.landingPercentage !== null && item.landingPercentage < 0.5) return "High strikes, low landing";
  if (item.confidence === "Low" && item.fishPerHour > averageRate) return "Promising, needs more data";
  if (item.confidence === "Low") return "Insufficient data";
  if (item.efficiencyIndex >= 1.5) return "High efficiency";
  if (item.usageShare >= 15 && item.efficiencyIndex < 0.75) return "Overused, low return";
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
  if (activeStatsIncludeLost && key === "fish") return item.strikes || 0;
  if (activeStatsIncludeLost && key === "fishPerHour") return item.strikesPerHour || 0;
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
  return filterPerformanceItems(sortPerformanceItems(items)).map((item) => {
    return [
    item.name || labelHeader,
    item.fish,
    item.lost || 0,
    item.strikes || item.fish + (item.lost || 0),
    item.hasUsableTime ? trimNumber(item.hours) : "Missing time data",
    item.hasUsableTime ? trimNumber(item.fishPerHour) : "n/a",
    item.hasUsableTime ? trimNumber(item.strikesPerHour) : "n/a",
    item.landingPercentage === null ? "n/a" : `${trimNumber(item.landingPercentage * 100)}%`,
    item.trips,
    trimNumber(item.fishPerTrip),
    item.hasUsableTime ? `${trimNumber(item.usageShare)}%` : "n/a",
    `${trimNumber(item.catchShare)}%`,
    item.hasUsableTime ? trimNumber(item.efficiencyIndex) : "n/a",
    item.hasUsableTime ? (item.overperformance > 0 ? `+${trimNumber(item.overperformance)}%` : `${trimNumber(item.overperformance)}%`) : "n/a",
    item.confidence,
    item.label
    ];
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
    const metrics = StatsAnalytics.performanceMetrics({ landed: fish, lost: number(item.lost), hours: hasUsableTime ? hours : null, trips, totalHours, totalLanded: totalFish });
    const usageShare = metrics.timeShare === null ? 0 : metrics.timeShare * 100;
    const catchShare = metrics.fishShare === null ? 0 : metrics.fishShare * 100;
    const efficiencyIndex = metrics.efficiencyIndex ?? 0;
    const overperformance = metrics.performanceDelta === null ? 0 : metrics.performanceDelta * 100;
    const next = {
      ...item,
      hours,
      trips,
      fish,
      hasTimeSample,
      hasUsableTime,
      missingTime: fish > 0 && !hasUsableTime,
      fishPerHour: hasUsableTime ? fish / hours : 0,
      strikes: fish + number(item.lost) + number(item.missed),
      strikesPerHour: hasUsableTime ? (fish + number(item.lost) + number(item.missed)) / hours : 0,
      landingPercentage: StatsAnalytics.safeDivide(fish, fish + number(item.lost)),
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
  if (!["downrigger", "Downrigger"].includes(record.presentation)) return "";
  return record.deepestRigger ? "Deepest rigger" : "Higher rigger";
}

function summarizeDownriggerCatchPositions(catchRecords = [], lostRecords = [], totalFish = 0) {
  const map = new Map();
  const ensure = (key) => {
    const current = map.get(key) || { name: key, fish: 0, lost: 0, minutes: 0, hasTimeSample: false, trips: new Set(), uses: 0 };
    map.set(key, current);
    return current;
  };
  catchRecords.forEach((record) => {
    const key = deepestRiggerLabel(record);
    if (!key) return;
    const current = ensure(key);
    current.fish += fishCount(record);
    current.uses += 1;
    current.trips.add(record.trip.id);
  });
  lostRecords.forEach((record) => {
    const key = deepestRiggerLabel(record);
    if (!key) return;
    const current = ensure(key);
    current.lost += 1;
    current.uses += 1;
    current.trips.add(record.trip.id);
  });
  return makePerformanceItems([...map.values()], 0, totalFish);
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

function tripPerformanceRows(items, { includeLabel = true } = {}) {
  return filterPerformanceItems(sortPerformanceItems(items)).map((item) => {
    const row = [
      item.name,
      item.trips,
      item.hasUsableTime ? trimNumber(item.hours) : "Missing time data",
      item.fish,
      item.hasUsableTime ? trimNumber(item.fishPerHour) : "n/a",
      trimNumber(item.fishPerTrip),
      `${trimNumber((item.skunkRate || 0) * 100)}%`,
      item.confidence
    ];
    if (includeLabel) row.push(item.label);
    return row;
  });
}

function fishShareRows(items) {
  return filterPerformanceItems(sortPerformanceItems(items)).map((item) => [
    item.name,
    item.fish,
    item.trips,
    `${trimNumber(item.catchShare)}%`
  ]);
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

function saneStatsNumber(value, { min = -Infinity, max = Infinity } = {}) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const parsed = parseFirstNumber(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function numericRangeLabel(value, step, suffix = "") {
  const start = Math.floor(value / step) * step;
  const end = start + step;
  return `${trimNumber(start)}–${trimNumber(end)}${suffix}`;
}

function summarizeCatchMeasurement(records, valueFn, { step, suffix = "", min = -Infinity, max = Infinity } = {}) {
  const map = new Map();
  records.forEach((record) => {
    const value = saneStatsNumber(valueFn(record), { min, max });
    if (value === null) return;
    const label = numericRangeLabel(value, step, suffix);
    const current = map.get(label) || { label, fish: 0, trips: new Set(), values: [], lengths: [] };
    current.fish += fishCount(record);
    current.trips.add(record.trip.id);
    current.values.push(value);
    const length = saneStatsNumber(record.length, { min: 0, max: 200 });
    if (length !== null) current.lengths.push(length);
    map.set(label, current);
  });
  return [...map.values()]
    .sort((a, b) => (a.values[0] || 0) - (b.values[0] || 0))
    .map((item) => [
      item.label,
      item.fish,
      item.trips.size,
      trimNumber(item.values.reduce((sum, value) => sum + value, 0) / item.values.length),
      item.lengths.length ? trimNumber(item.lengths.reduce((sum, value) => sum + value, 0) / item.lengths.length) : "n/a"
    ]);
}

function summarizeSpeedDelta(records) {
  const groups = new Map([
    ["Ball slower", { fish: 0, trips: new Set(), deltas: [] }],
    ["Matched", { fish: 0, trips: new Set(), deltas: [] }],
    ["Ball faster", { fish: 0, trips: new Set(), deltas: [] }]
  ]);
  records.forEach((record) => {
    const gps = saneStatsNumber(record.gpsSpeed || record.speed, { min: 0.1, max: 15 });
    const ball = saneStatsNumber(record.ballSpeed, { min: 0.1, max: 15 });
    if (gps === null || ball === null) return;
    const delta = ball - gps;
    const label = delta < -0.2 ? "Ball slower" : delta > 0.2 ? "Ball faster" : "Matched";
    const group = groups.get(label);
    group.fish += fishCount(record);
    group.trips.add(record.trip.id);
    group.deltas.push(delta);
  });
  return [...groups.entries()].filter(([, item]) => item.deltas.length).map(([label, item]) => [
    label,
    item.fish,
    item.trips.size,
    `${item.deltas.reduce((sum, value) => sum + value, 0) / item.deltas.length >= 0 ? "+" : ""}${trimNumber(item.deltas.reduce((sum, value) => sum + value, 0) / item.deltas.length)}`,
    `${trimNumber(Math.min(...item.deltas))} to ${trimNumber(Math.max(...item.deltas))}`
  ]);
}

function summarizeBestSpeedByDirection(records) {
  const directions = new Map();
  records.forEach((record) => {
    const direction = String(record.direction || "").trim();
    const speed = saneStatsNumber(record.gpsSpeed || record.speed, { min: 0.1, max: 15 });
    if (!direction || speed === null) return;
    const roundedSpeed = Math.round(speed * 10) / 10;
    const speeds = directions.get(direction) || new Map();
    const entry = speeds.get(roundedSpeed) || { speed: roundedSpeed, fish: 0, trips: new Set() };
    entry.fish += fishCount(record);
    entry.trips.add(record.trip.id);
    speeds.set(roundedSpeed, entry);
    directions.set(direction, speeds);
  });
  return [...directions.entries()]
    .map(([direction, speeds]) => {
      const best = [...speeds.values()].sort((a, b) => b.fish - a.fish || b.trips.size - a.trips.size || a.speed - b.speed)[0];
      return [direction, `${trimNumber(best.speed)} mph`, best.fish, best.trips.size];
    })
    .sort((a, b) => b[2] - a[2] || String(a[0]).localeCompare(String(b[0])));
}

function summarizeShakers(records) {
  const shakers = records.filter((record) => Boolean(record.shaker));
  const standard = records.length - shakers.length;
  return [
    ["Shaker", shakers.length, formatPercent(shakers.length, records.length)],
    ["Standard size", standard, formatPercent(standard, records.length)]
  ];
}

function summarizeDistanceBehind(gearRecords, catches) {
  const map = new Map();
  gearRecords.filter((record) => record.source === "trip").forEach((record) => {
    const distance = saneStatsNumber(record.distanceBehind, { min: 0, max: 1000 });
    if (distance === null) return;
    const label = numericRangeLabel(distance, 25, ` ${unitSymbol("depth")}`);
    const current = map.get(label) || { fish: 0, minutes: 0, trips: new Set(), values: [] };
    current.minutes += setupLineMinutes(record);
    current.trips.add(record.trip.id);
    current.values.push(distance);
    current.fish += catches
      .filter((catchItem) => catchItem.trip.id === record.trip.id && catchItem.setupLineId === record.id)
      .reduce((sum, catchItem) => sum + fishCount(catchItem), 0);
    map.set(label, current);
  });
  return [...map.entries()].map(([label, item]) => {
    const hours = item.minutes / 60;
    return [label, item.fish, trimNumber(hours), hours ? trimNumber(item.fish / hours) : "n/a", item.trips.size];
  });
}

function probeProfileEntries(trip) {
  return (trip.probeTemperatureProfile || []).map((entry) => ({
    depth: saneStatsNumber(entry.depthFeet, { min: 0, max: 1000 }),
    temperature: saneStatsNumber(entry.temperature, { min: -5, max: 100 })
  })).filter((entry) => entry.depth !== null && entry.temperature !== null)
    .sort((a, b) => a.depth - b.depth);
}

function tripThermoclineDepth(trip) {
  const profile = probeProfileEntries(trip);
  let best = null;
  for (let index = 1; index < profile.length; index += 1) {
    const depthChange = profile[index].depth - profile[index - 1].depth;
    if (depthChange <= 0) continue;
    const coolingRate = (profile[index - 1].temperature - profile[index].temperature) / depthChange;
    if (!best || coolingRate > best.coolingRate) {
      best = { depth: (profile[index - 1].depth + profile[index].depth) / 2, coolingRate };
    }
  }
  return best && best.coolingRate > 0 ? best.depth : null;
}

function summarizeProbeProfiles(trips) {
  const map = new Map();
  trips.forEach((trip) => {
    probeProfileEntries(trip).forEach((entry) => {
      const current = map.get(entry.depth) || { temperatures: [], trips: new Set() };
      current.temperatures.push(entry.temperature);
      current.trips.add(trip.id);
      map.set(entry.depth, current);
    });
  });
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([depth, item]) => [
    `${trimNumber(depth)} ${unitSymbol("depth")}`,
    `${trimNumber(item.temperatures.reduce((sum, value) => sum + value, 0) / item.temperatures.length)}°`,
    `${trimNumber(Math.min(...item.temperatures))}°`,
    `${trimNumber(Math.max(...item.temperatures))}°`,
    item.trips.size
  ]);
}

function summarizeThermoclinePosition(records) {
  const groups = new Map([
    ["Above thermocline", { fish: 0, trips: new Set() }],
    ["At thermocline", { fish: 0, trips: new Set() }],
    ["Below thermocline", { fish: 0, trips: new Set() }]
  ]);
  records.forEach((record) => {
    const thermocline = tripThermoclineDepth(record.trip);
    const fishDepth = saneStatsNumber(record.depthDown || record.estimatedDepth, { min: 0, max: 1000 });
    if (thermocline === null || fishDepth === null) return;
    const label = fishDepth < thermocline - 10 ? "Above thermocline" : fishDepth > thermocline + 10 ? "Below thermocline" : "At thermocline";
    const current = groups.get(label);
    current.fish += fishCount(record);
    current.trips.add(record.trip.id);
  });
  const total = [...groups.values()].reduce((sum, item) => sum + item.fish, 0);
  return [...groups.entries()].filter(([, item]) => item.fish).map(([label, item]) => [
    label, item.fish, item.trips.size, formatPercent(item.fish, total)
  ]);
}

function statsCoverageRows(trips, records, gearRecords) {
  const coverage = (label, matching, total, note) => [
    label,
    matching,
    total,
    formatPercent(matching, total),
    note
  ];
  const validGps = records.filter((record) => saneStatsNumber(record.gpsSpeed || record.speed, { min: 0.1, max: 15 }) !== null).length;
  const validBall = records.filter((record) => saneStatsNumber(record.ballSpeed, { min: 0.1, max: 15 }) !== null).length;
  const spreadRows = gearRecords.filter((record) => record.source === "trip");
  const validDistance = spreadRows.filter((record) => saneStatsNumber(record.distanceBehind, { min: 0, max: 1000 }) !== null).length;
  const probeTrips = trips.filter((trip) => probeProfileEntries(trip).length >= 2).length;
  const shakerTagged = records.filter((record) => Object.prototype.hasOwnProperty.call(record, "shaker")).length;
  return [
    coverage("GPS speed", validGps, records.length, "Catch records with usable GPS speed"),
    coverage("Ball speed", validBall, records.length, "Catch records with usable probe speed"),
    coverage("Shaker status", shakerTagged, records.length, "Catch records explicitly carrying shaker status"),
    coverage("Distance behind", validDistance, spreadRows.length, "Timed setup rows with spread distance"),
    coverage("Probe profile", probeTrips, trips.length, "Trips with at least two valid depth samples")
  ];
}

function statsTripTrendRows(trips) {
  return [...trips].sort((a, b) => compareTripsByDateTime(a, b, "asc")).map((trip) => {
    const landed = scopedTripFish(trip);
    const lost = filterRecordsByStats((trip.lostFish || []).map((item) => resolveTripLineRecord({ ...item, trip }))).length;
    const hours = tripHours(trip);
    return [
      formatDate(trip.date),
      trip.linesSetTime || trip.startTime ? formatDisplayTime(trip.linesSetTime || trip.startTime) : "—",
      trip.linesPulledTime || trip.endTime ? formatDisplayTime(trip.linesPulledTime || trip.endTime) : "—",
      hours ? trimNumber(hours) : "n/a",
      landed,
      lost,
      hours ? trimNumber(landed / hours) : "n/a"
    ];
  });
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
  const lureMinutes = gearRecords.reduce((sum, record) => sum + (record.lureId ? number(record.lureMinutes) : 0), 0);
  const flasherMinutes = gearRecords.reduce((sum, record) => sum + (record.flasherId ? number(record.flasherMinutes) : 0), 0);
  const lureHours = lureMinutes / 60;
  const flasherHours = flasherMinutes / 60;
  const bestTrip = [...trips].sort((a, b) => scopedTripFish(b) - scopedTripFish(a))[0];

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
    directionItems = summarizeEffortWithCatches(trollingGear, trollingCatches, (record) => record.direction, setupLineMinutes, trollingLineHours, fish, trollingLost);
    lineSideItems = summarizeEffortWithCatches(trollingGear, trollingCatches, (record) => setupLineSideLabel(record.side), setupLineMinutes, trollingLineHours, fish, trollingLost);
    setupItems = summarizeEffortWithCatches(trollingGear, trollingCatches, (record) => presentationLabel(record.presentation), setupLineMinutes, trollingLineHours, fish, trollingLost);
    const downriggerCatches = trollingCatches.filter((record) => ["downrigger", "Downrigger"].includes(record.presentation));
    const downriggerLost = trollingLost.filter((record) => ["downrigger", "Downrigger"].includes(record.presentation));
    downriggerItems = summarizeDownriggerCatchPositions(
      downriggerCatches,
      downriggerLost,
      fish
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
    renderStatsTable(els.downriggerStatsTable, headersForPerformance("Deepest Rigger", downriggerItems), performanceRows(downriggerItems, "Rigger"));
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
    renderStatsTable(els.newDataCoverageStatsTable, ["Field", "Complete", "Total", "Coverage", "Meaning"], statsCoverageRows(trips, trollingCatches, trollingGear));
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
    [els.gpsSpeedStatsTable, els.ballSpeedStatsTable, els.speedDeltaStatsTable, els.shakerStatsTable, els.distanceBehindStatsTable, els.probeTemperatureStatsTable, els.thermoclineStatsTable, els.newDataCoverageStatsTable]
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
