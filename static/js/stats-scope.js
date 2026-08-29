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
