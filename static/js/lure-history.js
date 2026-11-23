const DAY_MS = 86_400_000;

function key(value) {
  return String(value || "").trim().toLowerCase();
}

function waterbodyMatches(trip, context) {
  if (trip.locationId && context.locationId) return trip.locationId === context.locationId;
  const location = key(context.location);
  return Boolean(location && key(trip.location) === location);
}

function recordedLures(trip) {
  const ids = new Set();
  for (const record of [...(trip.gearUsed || []), ...(trip.catches || []), ...(trip.lostFish || [])]) {
    ids.add(record.lureId);
    ids.add(record.cheaterLureId);
    if (record.beadCount >= 2) ids.add(record.secondBeadLureId);
    if (record.beadCount >= 3) ids.add(record.thirdBeadLureId);
  }
  return ids;
}

export function rankLuresByTripHistory(lures, trips, context = {}, today = new Date()) {
  const todayTime = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const tripDay = Date.parse(context.date || "");
  const cutoff = Number.isFinite(tripDay) ? Math.min(tripDay, todayTime) : todayTime;
  const currentStart = context.launchTime || context.linesSetTime || "";
  const method = key(context.method);
  const species = key(context.targetSpecies);
  const available = new Map(lures.map((lure) => [lure.id, lure]));
  const rankings = new Map();

  for (const trip of trips) {
    if ((context.id && trip.id === context.id) || trip.isDraft || ["active", "paused"].includes(trip.liveStatus)) continue;
    const date = Date.parse(trip.date || "");
    if (!Number.isFinite(date) || date > cutoff) continue;
    const start = trip.launchTime || trip.linesSetTime || "";
    if (trip.date === context.date && start && currentStart && start > currentStart) continue;

    const sameMethod = Boolean(method && key(trip.method) === method);
    const sameSpecies = Boolean(species && species !== "anything" && key(trip.targetSpecies) === species);
    const similarity = 4 * Number(waterbodyMatches(trip, context)) + 2 * Number(sameMethod) + Number(sameSpecies);
    const ageDays = (cutoff - date) / DAY_MS;
    const weight = (similarity + 1) * (0.25 + 0.75 * 2 ** (-ageDays / 120));

    for (const id of recordedLures(trip)) {
      const lure = available.get(id);
      if (!lure) continue;
      const previous = rankings.get(id);
      rankings.set(id, {
        lure,
        similarity: Math.max(similarity, previous?.similarity ?? 0),
        score: weight + (previous?.score ?? 0),
        latest: Math.max(date, previous?.latest ?? date)
      });
    }
  }

  return [...rankings.values()].sort((a, b) => b.similarity - a.similarity || b.score - a.score
    || b.latest - a.latest || String(a.lure.name || "").localeCompare(String(b.lure.name || ""))
    || a.lure.id.localeCompare(b.lure.id)).map(({ lure }) => lure);
}
