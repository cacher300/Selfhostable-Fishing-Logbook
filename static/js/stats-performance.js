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

function riggerMethodComparisonLabel(record) {
  return deepestRiggerLabel(record) || presentationLabel(record.presentation) || "Other method";
}

function summarizeDownriggerCatchPositions(catchRecords = [], lostRecords = [], totalFish = 0) {
  const map = new Map();
  const ensure = (key) => {
    const current = map.get(key) || { name: key, fish: 0, lost: 0, minutes: 0, hasTimeSample: false, trips: new Set(), uses: 0 };
    map.set(key, current);
    return current;
  };
  catchRecords.forEach((record) => {
    const key = riggerMethodComparisonLabel(record);
    if (!key) return;
    const current = ensure(key);
    current.fish += fishCount(record);
    current.uses += 1;
    current.trips.add(record.trip.id);
  });
  lostRecords.forEach((record) => {
    const key = riggerMethodComparisonLabel(record);
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

function catchComparisonRows(items, labelHeader = "Name") {
  return items
    .filter((item) => !activeStatsMinTrips || item.trips >= activeStatsMinTrips)
    .sort((left, right) => (
      ((activeStatsIncludeLost ? right.strikes : right.fish) - (activeStatsIncludeLost ? left.strikes : left.fish))
      || right.fish - left.fish
      || String(left.name).localeCompare(String(right.name))
    ))
    .map((item) => [
      item.name || labelHeader,
      item.fish,
      item.lost || 0,
      item.strikes || item.fish + (item.lost || 0),
      item.landingPercentage === null ? "n/a" : `${trimNumber(item.landingPercentage * 100)}%`,
      item.trips,
      trimNumber(item.fishPerTrip),
      `${trimNumber(item.catchShare)}%`
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
